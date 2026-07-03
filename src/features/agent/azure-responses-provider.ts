import { ANALYTICS_INSTRUCTIONS } from "./instructions";
import type { createPostHogMcpTool } from "./posthog-capability";
import { redact } from "./redaction";
import type { createStripeMcpTool } from "./stripe-capability";
import type { createSupabaseMcpTool } from "./supabase-capability";
import type {
  AgentEvent,
  AgentProvider,
  AgentProviderInput,
} from "./types";

type StreamEvent = Record<string, unknown>;

export interface ResponsesClientLike {
  responses: {
    create(
      body: Record<string, unknown>,
      options: { signal: AbortSignal },
    ): Promise<AsyncIterable<StreamEvent>>;
  };
}

export interface AzureResponsesProviderConfig {
  deployment: string;
  mcpTools: Array<
    | ReturnType<typeof createPostHogMcpTool>
    | ReturnType<typeof createStripeMcpTool>
    | ReturnType<typeof createSupabaseMcpTool>
  >;
}

export class AzureResponsesProvider implements AgentProvider {
  constructor(
    private readonly client: ResponsesClientLike,
    private readonly config: AzureResponsesProviderConfig,
  ) {}

  async *run(
    input: AgentProviderInput,
    signal: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    let stream: AsyncIterable<StreamEvent>;
    try {
      stream = await this.createStream(input, signal);
    } catch (error) {
      yield { type: "error", message: readableError(error) };
      return;
    }

    let failedCalls = 0;
    const startedCalls = new Map<string, number>();
    const itemSources = new Map<string, string>();

    try {
      for await (const event of stream) {
        const type = stringValue(event.type);
        if (type === "response.output_item.added") {
          const item = recordValue(event.item);
          const itemId = stringValue(item.id);
          const serverLabel = stringValue(item.server_label);
          if (itemId && serverLabel) itemSources.set(itemId, serverLabel);
          continue;
        }
        if (type === "response.mcp_list_tools.in_progress") {
          const source = sourceLocation(
            stringValue(event.server_label) ||
              itemSources.get(stringValue(event.item_id)) ||
              "",
          );
          yield { type: "status", label: `Načítám nástroje ${source}` };
          continue;
        }
        if (type === "response.mcp_call.in_progress") {
          const itemId = stringValue(event.item_id);
          if (itemId) startedCalls.set(itemId, Date.now());
          const source = sourceLocation(
            stringValue(event.server_label) || itemSources.get(itemId) || "",
          );
          yield { type: "status", label: `Analyzuji data ${source}` };
          continue;
        }
        if (type === "response.output_text.delta") {
          yield { type: "text_delta", delta: stringValue(event.delta) };
          continue;
        }
        if (type === "response.output_item.done") {
          const trace = normalizeToolTrace(
            recordValue(event.item),
            startedCalls,
          );
          if (trace) yield trace;
          continue;
        }
        if (type === "response.mcp_call.failed") {
          failedCalls += 1;
          if (failedCalls > 2) {
            yield {
              type: "error",
              message: "MCP dotaz selhal více než dvakrát.",
            };
            return;
          }
          continue;
        }
        if (
          type === "response.mcp_list_tools.failed" ||
          type === "response.failed" ||
          type === "error"
        ) {
          yield { type: "error", message: eventError(event) };
          return;
        }
        if (type === "response.completed") {
          const response = recordValue(event.response);
          const usage = recordValue(response.usage);
          yield {
            type: "completed",
            responseId: stringValue(response.id),
            inputTokens: numberValue(usage.input_tokens),
            outputTokens: numberValue(usage.output_tokens),
          };
        }
      }
    } catch (error) {
      yield { type: "error", message: readableError(error) };
    }
  }

  private async createStream(
    input: AgentProviderInput,
    signal: AbortSignal,
  ): Promise<AsyncIterable<StreamEvent>> {
    const request = {
      model: input.model ?? this.config.deployment,
      instructions: ANALYTICS_INSTRUCTIONS,
      input: input.userMessage,
      previous_response_id: input.previousResponseId ?? undefined,
      tools: this.config.mcpTools,
      stream: true,
      store: true,
      parallel_tool_calls: false,
      max_tool_calls: 30,
      max_output_tokens: 16_000,
      ...(input.reasoningEffort
        ? { reasoning: { effort: input.reasoningEffort } }
        : {}),
    };
    const delays = [0, 250, 750];
    let lastError: unknown;

    for (const delay of delays) {
      if (delay) await wait(delay, signal);
      try {
        return await this.client.responses.create(request, { signal });
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
      }
    }
    throw lastError;
  }
}

function normalizeToolTrace(
  item: StreamEvent,
  startedCalls: Map<string, number>,
): AgentEvent | null {
  if (item.type !== "mcp_call") return null;
  const id = stringValue(item.id);
  const startedAt = startedCalls.get(id);
  const error = nullableString(item.error);
  const serverLabel = stringValue(item.server_label);
  const toolName = stringValue(item.name) || "unknown";
  return {
    type: "tool_trace",
    toolName: serverLabel ? `${serverLabel}:${toolName}` : toolName,
    arguments: redact(stringValue(item.arguments)),
    resultSummary: item.output ? redact(stringValue(item.output)) : null,
    durationMs: startedAt ? Date.now() - startedAt : null,
    status: item.status === "failed" || error ? "failed" : "completed",
    error: error ? redact(error) : null,
  };
}

function sourceLocation(serverLabel: string) {
  if (serverLabel === "stripe") return "ve Stripe";
  if (serverLabel === "posthog") return "v PostHogu";
  if (serverLabel === "supabase") return "v Supabase";
  return "v připojeném zdroji";
}

function eventError(event: StreamEvent) {
  const direct = recordValue(event.error);
  const response = recordValue(event.response);
  const nested = recordValue(response.error);
  return redact(
    stringValue(direct.message) ||
      stringValue(nested.message) ||
      "Azure Responses API požadavek selhal.",
  );
}

function readableError(error: unknown) {
  if (error instanceof Error) return redact(error.message);
  return "Azure Responses API požadavek selhal.";
}

function isRetryable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? Number(error.status) : 0;
  return status === 429 || status >= 500;
}

function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delay);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new Error("Aborted"));
      },
      { once: true },
    );
  });
}

function recordValue(value: unknown): StreamEvent {
  return value && typeof value === "object"
    ? (value as StreamEvent)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
