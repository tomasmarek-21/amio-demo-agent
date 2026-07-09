import { BASE_PATH } from "@/lib/base-path";
import type { AgentEvent } from "@/features/agent/types";
import type {
  AgentModel,
  ReasoningEffort,
} from "@/features/agent/models";
import type {
  ChatMessage,
  ChatSession,
  SessionDetail,
  ToolTrace,
} from "@/features/chat/types";

async function expectJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string" ? body.error : "Request failed.",
    );
  }
  return response.json() as Promise<T>;
}

export async function listSessions(): Promise<ChatSession[]> {
  const body = await expectJson<{ sessions: SerializedSession[] }>(
    await fetch(`${BASE_PATH}/api/sessions`),
  );
  return body.sessions.map(deserializeSession);
}

export async function createSession(): Promise<ChatSession> {
  const body = await expectJson<{ session: SerializedSession }>(
    await fetch(`${BASE_PATH}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  return deserializeSession(body.session);
}

export async function getSession(id: string): Promise<SessionDetail> {
  const body = await expectJson<{ session: SerializedDetail }>(
    await fetch(`${BASE_PATH}/api/sessions/${id}`),
  );
  return {
    ...deserializeSession(body.session),
    messages: body.session.messages.map(deserializeMessage),
    evidence: body.session.evidence.map((item) => ({
      assistantMessageId: item.assistantMessageId,
      traces: item.traces.map(deserializeTrace),
    })),
  };
}

export async function* sendMessage(
  sessionId: string,
  message: string,
  model: AgentModel,
  reasoningEffort: ReasoningEffort | null,
): AsyncIterable<AgentEvent> {
  const response = await fetch(`${BASE_PATH}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, model, reasoningEffort }),
  });
  if (!response.ok || !response.body) {
    throw new Error("Failed to start the agent response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((part) => part.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6)) as AgentEvent;
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const line = buffer.split("\n").find((part) => part.startsWith("data: "));
    if (line) yield JSON.parse(line.slice(6)) as AgentEvent;
  }
}

interface SerializedSession {
  id: string;
  title: string;
  lastResponseId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedMessage extends Omit<ChatMessage, "createdAt"> {
  createdAt: string;
}

interface SerializedTrace extends Omit<ToolTrace, "createdAt"> {
  createdAt: string;
}

interface SerializedDetail extends SerializedSession {
  messages: SerializedMessage[];
  evidence: Array<{
    assistantMessageId: string;
    traces: SerializedTrace[];
  }>;
}

function deserializeSession(session: SerializedSession): ChatSession {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  };
}

function deserializeMessage(message: SerializedMessage): ChatMessage {
  return { ...message, createdAt: new Date(message.createdAt) };
}

function deserializeTrace(trace: SerializedTrace): ToolTrace {
  return { ...trace, createdAt: new Date(trace.createdAt) };
}
