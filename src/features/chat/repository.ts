import type {
  ChatMessage,
  ChatRole,
  ChatSession,
  SessionDetail,
  ToolCallStatus,
} from "./types";

export interface CompleteRunInput {
  responseId: string;
  assistantMessageId: string;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
}

export interface ChatRepository {
  createSession(title?: string): Promise<ChatSession>;
  listSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<SessionDetail | null>;
  addMessage(
    sessionId: string,
    role: ChatRole,
    content: string,
  ): Promise<ChatMessage>;
  updateSessionResponse(sessionId: string, responseId: string): Promise<void>;
  createRun(
    sessionId: string,
    userMessageId: string,
    model: string,
  ): Promise<string>;
  completeRun(runId: string, input: CompleteRunInput): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
  addToolCall(input: {
    runId: string;
    toolName: string;
    sanitizedArguments: string;
    resultSummary: string | null;
    durationMs: number | null;
    status: ToolCallStatus;
    error: string | null;
  }): Promise<void>;
}
