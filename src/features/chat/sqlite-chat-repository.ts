import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { agentRuns, messages, sessions, toolCalls } from "@/db/schema";
import type * as schema from "@/db/schema";
import type {
  ChatRepository,
  CompleteRunInput,
} from "./repository";
import type {
  ChatMessage,
  ChatRole,
  ChatSession,
  SessionDetail,
} from "./types";
import {
  DEFAULT_SESSION_TITLE,
  titleFromFirstMessage,
} from "./session-title";

type Database = BetterSQLite3Database<typeof schema>;

export class SqliteChatRepository implements ChatRepository {
  constructor(private readonly database: Database) {}

  async createSession(title = DEFAULT_SESSION_TITLE): Promise<ChatSession> {
    const now = new Date();
    const session: ChatSession = {
      id: randomUUID(),
      title,
      lastResponseId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.insert(sessions).values(session);
    return session;
  }

  async listSessions(): Promise<ChatSession[]> {
    return this.database.select().from(sessions).orderBy(desc(sessions.updatedAt));
  }

  async getSession(id: string): Promise<SessionDetail | null> {
    const [session] = await this.database
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    if (!session) return null;

    const sessionMessages = await this.database
      .select()
      .from(messages)
      .where(eq(messages.sessionId, id))
      .orderBy(asc(messages.createdAt));
    const completedRuns = await this.database
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.sessionId, id));
    const evidence = await Promise.all(
      completedRuns
        .filter((run) => run.assistantMessageId)
        .map(async (run) => ({
          assistantMessageId: run.assistantMessageId as string,
          traces: await this.database
            .select()
            .from(toolCalls)
            .where(eq(toolCalls.runId, run.id))
            .orderBy(asc(toolCalls.createdAt)),
        })),
    );

    return { ...session, messages: sessionMessages, evidence };
  }

  async addMessage(
    sessionId: string,
    role: ChatRole,
    content: string,
  ): Promise<ChatMessage> {
    const shouldSetTitle =
      role === "user" && (await this.shouldSetTitleFromFirstMessage(sessionId));
    const message: ChatMessage = {
      id: randomUUID(),
      sessionId,
      role,
      content,
      createdAt: new Date(),
    };
    await this.database.insert(messages).values(message);
    await this.touchSession(
      sessionId,
      shouldSetTitle ? titleFromFirstMessage(content) : undefined,
    );
    return message;
  }

  async updateSessionResponse(sessionId: string, responseId: string) {
    await this.database
      .update(sessions)
      .set({ lastResponseId: responseId, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async createRun(sessionId: string, userMessageId: string, model: string) {
    const id = randomUUID();
    await this.database.insert(agentRuns).values({
      id,
      sessionId,
      userMessageId,
      model,
      status: "running",
      startedAt: new Date(),
      toolCallsCount: 0,
    });
    return id;
  }

  async completeRun(runId: string, input: CompleteRunInput) {
    await this.database
      .update(agentRuns)
      .set({
        status: "completed",
        assistantMessageId: input.assistantMessageId,
        finishedAt: new Date(),
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        toolCallsCount: input.toolCallsCount,
        error: null,
      })
      .where(eq(agentRuns.id, runId));
  }

  async failRun(runId: string, error: string) {
    await this.database
      .update(agentRuns)
      .set({ status: "failed", finishedAt: new Date(), error })
      .where(eq(agentRuns.id, runId));
  }

  async addToolCall(input: Parameters<ChatRepository["addToolCall"]>[0]) {
    await this.database.insert(toolCalls).values({
      id: randomUUID(),
      ...input,
      createdAt: new Date(),
    });
  }

  private async shouldSetTitleFromFirstMessage(sessionId: string) {
    const [session] = await this.database
      .select({ title: sessions.title })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (session?.title !== DEFAULT_SESSION_TITLE) return false;
    const [existingMessage] = await this.database
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .limit(1);
    return !existingMessage;
  }

  private async touchSession(sessionId: string, title?: string) {
    await this.database
      .update(sessions)
      .set({ ...(title ? { title } : {}), updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }
}
