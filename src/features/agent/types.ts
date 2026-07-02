export type AgentEvent =
  | { type: "status"; label: string }
  | { type: "text_delta"; delta: string }
  | {
      type: "tool_trace";
      toolName: string;
      arguments: string;
      resultSummary: string | null;
      durationMs: number | null;
      status: "completed" | "failed";
      error: string | null;
    }
  | {
      type: "completed";
      responseId: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "error"; message: string };

export interface AgentProviderInput {
  userMessage: string;
  previousResponseId: string | null;
}

export interface AgentProvider {
  run(
    input: AgentProviderInput,
    signal: AbortSignal,
  ): AsyncIterable<AgentEvent>;
}
