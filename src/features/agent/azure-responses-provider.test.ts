import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "./types";
import { AzureResponsesProvider } from "./azure-responses-provider";
import { createPostHogMcpTool } from "./posthog-capability";

async function* fakeStream() {
  yield { type: "response.mcp_list_tools.in_progress", item_id: "list-1" };
  yield { type: "response.mcp_call.in_progress", item_id: "call-1" };
  yield { type: "response.output_text.delta", delta: "42 visitors" };
  yield {
    type: "response.output_item.done",
    item: {
      type: "mcp_call",
      name: "execute-sql",
      arguments: '{"query":"SELECT 42"}',
      output: '{"rows":[{"visitors":42}]}',
      status: "completed",
      error: null,
    },
  };
  yield {
    type: "response.completed",
    response: {
      id: "resp-1",
      usage: { input_tokens: 120, output_tokens: 18 },
    },
  };
}

async function collect(iterable: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("AzureResponsesProvider", () => {
  it("normalizes MCP and text stream events", async () => {
    const create = vi.fn().mockResolvedValue(fakeStream());
    const provider = new AzureResponsesProvider(
      { responses: { create } },
      {
        deployment: "gpt-5-mini",
        mcpTool: createPostHogMcpTool({
          apiKey: "secret",
          organizationId: "org",
          projectId: "project",
        }),
      },
    );

    const events = await collect(
      provider.run(
        {
          userMessage: "How many?",
          previousResponseId: "resp-previous",
        },
        new AbortController().signal,
      ),
    );

    expect(events).toEqual([
      { type: "status", label: "Načítám PostHog nástroje" },
      { type: "status", label: "Analyzuji data v PostHogu" },
      { type: "text_delta", delta: "42 visitors" },
      expect.objectContaining({
        type: "tool_trace",
        toolName: "execute-sql",
        status: "completed",
      }),
      {
        type: "completed",
        responseId: "resp-1",
        inputTokens: 120,
        outputTokens: 18,
      },
    ]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-mini",
        max_tool_calls: 12,
        max_output_tokens: 4000,
        parallel_tool_calls: false,
        previous_response_id: "resp-previous",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("stops after more than two failed MCP calls", async () => {
    async function* failures() {
      for (let index = 0; index < 3; index += 1) {
        yield {
          type: "response.mcp_call.failed",
          item_id: `call-${index}`,
        };
      }
    }
    const provider = new AzureResponsesProvider(
      { responses: { create: vi.fn().mockResolvedValue(failures()) } },
      {
        deployment: "gpt-5-mini",
        mcpTool: createPostHogMcpTool({
          apiKey: "secret",
          organizationId: "org",
          projectId: "project",
        }),
      },
    );

    expect(
      await collect(
        provider.run(
          { userMessage: "query", previousResponseId: null },
          new AbortController().signal,
        ),
      ),
    ).toContainEqual({
      type: "error",
      message: "PostHog dotaz selhal více než dvakrát.",
    });
  });
});
