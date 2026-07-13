import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatRepository, CompleteRunInput } from "./repository";
import type {
  ChatMessage,
  ChatRole,
  ChatSession,
  SessionDetail,
  ToolCallStatus,
  ToolTrace,
} from "./types";
import { DEFAULT_SESSION_TITLE, titleFromFirstMessage } from "./session-title";

export class SupabaseChatRepository implements ChatRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createSession(title = DEFAULT_SESSION_TITLE): Promise<ChatSession> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const { data, error } = await this.client
      .from("sessions")
      .insert({ id, title, created_at: now, updated_at: now })
      .select()
      .single();
    if (error) throw error;
    return mapSession(data);
  }

  async listSessions(): Promise<ChatSession[]> {
    const { data, error } = await this.client
      .from("sessions")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSession);
  }

  async getSession(id: string): Promise<SessionDetail | null> {
    const { data: session } = await this.client
      .from("sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!session) return null;

    const [{ data: msgs }, { data: runs }] = await Promise.all([
      this.client
        .from("messages")
        .select("*")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
      this.client.from("agent_runs").select("*").eq("session_id", id),
    ]);

    const evidence = await Promise.all(
      (runs ?? [])
        .filter((run) => run.assistant_message_id)
        .map(async (run) => {
          const { data: traces } = await this.client
            .from("tool_calls")
            .select("*")
            .eq("run_id", run.id)
            .order("created_at", { ascending: true });
          return {
            assistantMessageId: run.assistant_message_id as string,
            traces: (traces ?? []).map(mapToolTrace),
          };
        }),
    );

    return {
      ...mapSession(session),
      messages: (msgs ?? []).map(mapMessage),
      evidence,
    };
  }

  async addMessage(sessionId: string, role: ChatRole, content: string): Promise<ChatMessage> {
    const shouldSetTitle =
      role === "user" && (await this.shouldSetTitleFromFirstMessage(sessionId));
    const id = randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("messages")
      .insert({ id, session_id: sessionId, role, content, created_at: now })
      .select()
      .single();
    if (error) throw error;
    await this.touchSession(sessionId, shouldSetTitle ? titleFromFirstMessage(content) : undefined);
    return mapMessage(data);
  }

  async updateSessionResponse(sessionId: string, responseId: string): Promise<void> {
    const { error } = await this.client
      .from("sessions")
      .update({ last_response_id: responseId, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw error;
  }

  async createRun(sessionId: string, userMessageId: string, model: string): Promise<string> {
    const id = randomUUID();
    const { error } = await this.client.from("agent_runs").insert({
      id,
      session_id: sessionId,
      user_message_id: userMessageId,
      model,
      status: "running",
      started_at: new Date().toISOString(),
      tool_calls_count: 0,
    });
    if (error) throw error;
    return id;
  }

  async completeRun(runId: string, input: CompleteRunInput): Promise<void> {
    const { error } = await this.client
      .from("agent_runs")
      .update({
        status: "completed",
        assistant_message_id: input.assistantMessageId,
        finished_at: new Date().toISOString(),
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        tool_calls_count: input.toolCallsCount,
        error: null,
      })
      .eq("id", runId);
    if (error) throw error;
  }

  async failRun(runId: string, error: string): Promise<void> {
    const { error: dbError } = await this.client
      .from("agent_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error })
      .eq("id", runId);
    if (dbError) throw dbError;
  }

  async addToolCall(input: Parameters<ChatRepository["addToolCall"]>[0]): Promise<void> {
    const { error } = await this.client.from("tool_calls").insert({
      id: randomUUID(),
      run_id: input.runId,
      tool_name: input.toolName,
      sanitized_arguments: input.sanitizedArguments,
      result_summary: input.resultSummary,
      duration_ms: input.durationMs,
      status: input.status,
      error: input.error,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  private async shouldSetTitleFromFirstMessage(sessionId: string): Promise<boolean> {
    const { data: session } = await this.client
      .from("sessions")
      .select("title")
      .eq("id", sessionId)
      .maybeSingle();
    if (session?.title !== DEFAULT_SESSION_TITLE) return false;
    const { data: existing } = await this.client
      .from("messages")
      .select("id")
      .eq("session_id", sessionId)
      .limit(1);
    return !existing?.length;
  }

  private async touchSession(sessionId: string, title?: string): Promise<void> {
    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (title) update.title = title;
    await this.client.from("sessions").update(update).eq("id", sessionId);
  }
}

function mapSession(row: Record<string, unknown>): ChatSession {
  return {
    id: row.id as string,
    title: row.title as string,
    lastResponseId: (row.last_response_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatRole,
    content: row.content as string,
    createdAt: new Date(row.created_at as string),
  };
}

function mapToolTrace(row: Record<string, unknown>): ToolTrace {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    toolName: row.tool_name as string,
    sanitizedArguments: row.sanitized_arguments as string,
    resultSummary: (row.result_summary as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    status: row.status as ToolCallStatus,
    error: (row.error as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}
