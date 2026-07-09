import { ANALYTICS_INSTRUCTIONS } from "./instructions";
import type { InternalFunctionTool } from "./amio-conversations-capability";
import type { createNotionMcpTool } from "./notion-capability";
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
  mcpTools: ConfiguredMcpTool[];
  functionTools?: InternalFunctionTool[];
  getMcpTools?: () => Promise<ConfiguredMcpTool[]>;
}

type ConfiguredMcpTool =
  | ReturnType<typeof createNotionMcpTool>
  | ReturnType<typeof createPostHogMcpTool>
  | ReturnType<typeof createStripeMcpTool>
  | ReturnType<typeof createSupabaseMcpTool>;

export class AzureResponsesProvider implements AgentProvider {
  constructor(
    private readonly client: ResponsesClientLike,
    private readonly config: AzureResponsesProviderConfig,
  ) {}

  async *run(
    input: AgentProviderInput,
    signal: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    let failedCalls = 0;
    const startedCalls = new Map<string, number>();
    const itemSources = new Map<string, string>();
    let previousResponseId = input.previousResponseId;
    let nextInput: string | Array<Record<string, unknown>> = input.userMessage;
    let functionCallCount = 0;

    try {
      while (true) {
        const stream = await this.createStream(
          {
            ...input,
            userMessage: "",
            previousResponseId,
          },
          nextInput,
          signal,
        );
        const pendingFunctionOutputs: Array<Record<string, unknown>> = [];
        let completion: AgentEvent | null = null;

        for await (const event of stream) {
          const type = stringValue(event.type);
          if (type === "response.output_item.added") {
            const item = recordValue(event.item);
            const itemId = stringValue(item.id);
            const serverLabel =
              stringValue(item.server_label) || inferServerLabel(item);
            if (itemId && serverLabel) itemSources.set(itemId, serverLabel);
            continue;
          }
          if (type === "response.mcp_list_tools.in_progress") {
            const source = sourceLocation(
              stringValue(event.server_label) ||
                itemSources.get(stringValue(event.item_id)) ||
                "",
            );
            yield { type: "status", label: `Loading tools ${source}` };
            continue;
          }
          if (type === "response.mcp_call.in_progress") {
            const itemId = stringValue(event.item_id);
            if (itemId) startedCalls.set(itemId, Date.now());
            const source = sourceLocation(
              stringValue(event.server_label) || itemSources.get(itemId) || "",
            );
            yield { type: "status", label: `Analyzing data ${source}` };
            continue;
          }
          if (type === "response.output_text.delta") {
            yield { type: "text_delta", delta: stringValue(event.delta) };
            continue;
          }
          if (type === "response.output_item.done") {
            const item = recordValue(event.item);
            const functionOutput = await maybeExecuteFunctionTool(
              item,
              this.config.functionTools ?? [],
              startedCalls,
            );
            if (functionOutput) {
              functionCallCount += 1;
              yield {
                type: "status",
                label: `Analyzing data ${sourceLocation("amio_conversations")}`,
              };
              yield functionOutput.trace;
              pendingFunctionOutputs.push(functionOutput.output);
              if (functionCallCount > 30) {
                yield {
                  type: "error",
                  message: "Function tool was called more than thirty times.",
                };
                return;
              }
              continue;
            }
            const trace = normalizeToolTrace(item, startedCalls);
            if (trace) yield trace;
            continue;
          }
          if (type === "response.mcp_call.failed") {
            failedCalls += 1;
            if (failedCalls > 2) {
              yield {
                type: "error",
                message: "MCP request failed more than twice.",
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
            completion = {
              type: "completed",
              responseId: stringValue(response.id),
              inputTokens: numberValue(usage.input_tokens),
              outputTokens: numberValue(usage.output_tokens),
            };
          }
        }

        if (pendingFunctionOutputs.length > 0) {
          if (!completion || completion.type !== "completed") {
            yield {
              type: "error",
              message: "Azure ended the tool response without a completed event.",
            };
            return;
          }
          previousResponseId = completion.responseId;
          nextInput = pendingFunctionOutputs;
          continue;
        }

        if (completion) {
          yield completion;
          return;
        }

        yield {
          type: "error",
          message: "Azure ended the response without a completed event.",
        };
        return;
      }
    } catch (error) {
      yield { type: "error", message: readableError(error) };
    }
  }

  private async createStream(
    input: AgentProviderInput,
    responseInput: string | Array<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<AsyncIterable<StreamEvent>> {
    const dynamicMcpTools = this.config.getMcpTools
      ? await this.config.getMcpTools()
      : [];
    const request = {
      model: input.model ?? this.config.deployment,
      instructions: ANALYTICS_INSTRUCTIONS,
      input: responseInput,
      previous_response_id: input.previousResponseId ?? undefined,
      tools: buildResponseTools({
        staticMcpTools: this.config.mcpTools,
        dynamicMcpTools,
        functionTools: this.config.functionTools ?? [],
      }),
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

export function buildResponseTools(input: {
  staticMcpTools: ConfiguredMcpTool[];
  dynamicMcpTools: ConfiguredMcpTool[];
  functionTools: InternalFunctionTool[];
}) {
  return [
    ...input.staticMcpTools,
    ...input.dynamicMcpTools,
    ...input.functionTools.map(stripFunctionToolMetadata),
  ];
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

async function maybeExecuteFunctionTool(
  item: StreamEvent,
  functionTools: InternalFunctionTool[],
  startedCalls: Map<string, number>,
) {
  if (item.type !== "function_call") {
    return null;
  }

  const toolName = stringValue(item.name);
  const tool = functionTools.find((candidate) => candidate.name === toolName);
  const argumentsText = stringValue(item.arguments);
  const startedAt = Date.now();
  startedCalls.set(toolName, startedAt);

  if (!tool) {
    const errorMessage = `Unknown function tool: ${toolName}`;
    return {
      trace: {
        type: "tool_trace" as const,
        toolName: `amio_conversations:${toolName}`,
        arguments: redact(argumentsText),
        resultSummary: null,
        durationMs: 0,
        status: "failed" as const,
        error: errorMessage,
      },
      output: {
        type: "function_call_output",
        call_id: stringValue(item.call_id),
        output: JSON.stringify({ error: errorMessage }),
      },
    };
  }

  try {
    const parsedArguments = tool.$parseRaw(argumentsText);
    const result = tool.$callback
      ? await tool.$callback(parsedArguments)
      : null;
    const outputText =
      typeof result === "string" ? result : JSON.stringify(result ?? {});
    return {
      trace: {
        type: "tool_trace" as const,
        toolName: `amio_conversations:${toolName}`,
        arguments: redact(argumentsText),
        resultSummary: redact(outputText),
        durationMs: Date.now() - startedAt,
        status: "completed" as const,
        error: null,
      },
      output: {
        type: "function_call_output",
        call_id: stringValue(item.call_id),
        output: outputText,
      },
    };
  } catch (error) {
    const errorMessage = readableError(error);
    return {
      trace: {
        type: "tool_trace" as const,
        toolName: `amio_conversations:${toolName}`,
        arguments: redact(argumentsText),
        resultSummary: null,
        durationMs: Date.now() - startedAt,
        status: "failed" as const,
        error: errorMessage,
      },
      output: {
        type: "function_call_output",
        call_id: stringValue(item.call_id),
        output: JSON.stringify({ error: errorMessage }),
      },
    };
  }
}

function sourceLocation(serverLabel: string) {
  if (serverLabel === "notion") return "in Notion";
  if (serverLabel === "stripe") return "in Stripe";
  if (serverLabel === "posthog") return "in PostHog";
  if (serverLabel === "supabase") return "in Supabase";
  if (serverLabel === "amio_conversations") return "in AMIO conversations";
  return "in the connected source";
}

function inferServerLabel(item: StreamEvent) {
  if (item.type === "function_call") {
    const name = stringValue(item.name);
    if (name.startsWith("amio-")) {
      return "amio_conversations";
    }
  }
  return "";
}

function eventError(event: StreamEvent) {
  const direct = recordValue(event.error);
  const response = recordValue(event.response);
  const nested = recordValue(response.error);
  return redact(
    stringValue(direct.message) ||
      stringValue(nested.message) ||
      "Azure Responses API request failed.",
  );
}

function readableError(error: unknown) {
  if (error instanceof Error) return redact(error.message);
  return "Azure Responses API request failed.";
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

function stripFunctionToolMetadata(tool: InternalFunctionTool) {
  return {
    type: tool.type,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: tool.strict,
  };
}
