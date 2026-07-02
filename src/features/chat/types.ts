export type ChatRole = "user" | "assistant";
export type ToolCallStatus = "running" | "completed" | "failed";

export interface ChatSession {
  id: string;
  title: string;
  lastResponseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

export interface ToolTrace {
  id: string;
  runId: string;
  toolName: string;
  sanitizedArguments: string;
  resultSummary: string | null;
  durationMs: number | null;
  status: ToolCallStatus;
  error: string | null;
  createdAt: Date;
}

export interface AssistantEvidence {
  assistantMessageId: string;
  traces: ToolTrace[];
}

export interface SessionDetail extends ChatSession {
  messages: ChatMessage[];
  evidence: AssistantEvidence[];
}
