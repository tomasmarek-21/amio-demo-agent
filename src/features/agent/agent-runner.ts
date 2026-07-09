import type { ChatRepository } from "@/features/chat/repository";
import type { ReasoningEffort } from "./models";
import { redact } from "./redaction";
import type { AgentEvent, AgentProvider } from "./types";

export class AgentRunner {
  constructor(
    private readonly repository: ChatRepository,
    private readonly provider: AgentProvider,
    private readonly model: string,
    private readonly timeoutMs = 300_000,
  ) {}

  async *run(
    sessionId: string,
    userText: string,
    parentSignal?: AbortSignal,
    selectedModel = this.model,
    reasoningEffort?: ReasoningEffort,
  ): AsyncIterable<AgentEvent> {
    const message = userText.trim();
    if (!message) {
      yield { type: "error", message: "Message must not be empty." };
      return;
    }

    const session = await this.repository.getSession(sessionId);
    if (!session) {
      yield { type: "error", message: "Conversation was not found." };
      return;
    }

    const userMessage = await this.repository.addMessage(
      sessionId,
      "user",
      message,
    );
    const runId = await this.repository.createRun(
      sessionId,
      userMessage.id,
      selectedModel,
    );
    const controller = new AbortController();
    const timeoutError = new Error("Analysis exceeded the time limit.");
    const timeout = setTimeout(
      () => controller.abort(timeoutError),
      this.timeoutMs,
    );
    const abortFromParent = () =>
      controller.abort(parentSignal?.reason ?? new Error("Request was cancelled."));
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });

    let assistantText = "";
    let toolCallsCount = 0;
    let completed = false;

    try {
      const events = this.provider.run(
        {
          userMessage: message,
          previousResponseId: session.lastResponseId,
          model: selectedModel,
          reasoningEffort,
        },
        controller.signal,
      );

      for await (const event of events) {
        if (event.type === "text_delta") {
          assistantText += event.delta;
          yield event;
          continue;
        }
        if (event.type === "tool_trace") {
          toolCallsCount += 1;
          await this.repository.addToolCall({
            runId,
            toolName: event.toolName,
            sanitizedArguments: event.arguments,
            resultSummary: event.resultSummary,
            durationMs: event.durationMs,
            status: event.status,
            error: event.error,
          });
          yield event;
          continue;
        }
        if (event.type === "error") {
          throw new Error(event.message);
        }
        if (event.type === "completed") {
          const assistantMessage = await this.repository.addMessage(
            sessionId,
            "assistant",
            assistantText,
          );
          await this.repository.updateSessionResponse(
            sessionId,
            event.responseId,
          );
          await this.repository.completeRun(runId, {
            responseId: event.responseId,
            assistantMessageId: assistantMessage.id,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            toolCallsCount,
          });
          completed = true;
          yield event;
          return;
        }
        yield event;
      }

      if (!completed) {
        throw new Error("Azure ended the response without a completed result.");
      }
    } catch (error) {
      const message =
        controller.signal.reason === timeoutError
          ? timeoutError.message
          : readableError(error);
      await this.repository.failRun(runId, message);
      yield { type: "error", message };
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  }
}

function readableError(error: unknown) {
  return redact(
    error instanceof Error
      ? error.message
      : "Failed to complete the analysis.",
  );
}
