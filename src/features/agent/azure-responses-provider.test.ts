import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { AgentEvent } from "./types";
import {
  AzureResponsesProvider,
  buildResponseTools,
} from "./azure-responses-provider";
import { ANALYTICS_INSTRUCTIONS } from "./instructions";
import { createPostHogMcpTool } from "./posthog-capability";
import { createStripeMcpTool } from "./stripe-capability";

async function* fakeStream() {
  yield {
    type: "response.output_item.added",
    item: {
      id: "list-1",
      type: "mcp_list_tools",
      server_label: "stripe",
    },
  };
  yield {
    type: "response.mcp_list_tools.in_progress",
    item_id: "list-1",
  };
  yield {
    type: "response.output_item.added",
    item: {
      id: "call-1",
      type: "mcp_call",
      server_label: "stripe",
      name: "list_subscriptions",
    },
  };
  yield { type: "response.mcp_call.in_progress", item_id: "call-1" };
  yield { type: "response.output_text.delta", delta: "42 visitors" };
  yield {
    type: "response.output_item.done",
    item: {
      type: "mcp_call",
      server_label: "stripe",
      name: "list_subscriptions",
      arguments: '{"limit":10}',
      output: '{"data":[]}',
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

async function* functionToolStream() {
  yield {
    type: "response.output_item.added",
    item: {
      id: "fn-1",
      type: "function_call",
      name: "amio-analyze-conversations-batch",
    },
  };
  yield {
    type: "response.output_item.done",
    item: {
      id: "fn-1",
      type: "function_call",
      call_id: "call-1",
      name: "amio-analyze-conversations-batch",
      arguments:
        '{"dateFrom":"2026-07-01T00:00:00.000Z","dateTo":"2026-07-02T00:00:00.000Z","includeSystemEvents":false}',
      status: "completed",
    },
  };
  yield {
    type: "response.completed",
    response: {
      id: "resp-tool-1",
      usage: { input_tokens: 80, output_tokens: 10 },
    },
  };
}

async function* postToolTextStream() {
  yield { type: "response.output_text.delta", delta: "Summary done" };
  yield {
    type: "response.completed",
    response: {
      id: "resp-tool-2",
      usage: { input_tokens: 20, output_tokens: 12 },
    },
  };
}

async function collect(iterable: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("AzureResponsesProvider", () => {
  it("keeps Stripe read-only and chooses evidence by source", () => {
    expect(ANALYTICS_INSTRUCTIONS).toContain("Stripe");
    expect(ANALYTICS_INSTRUCTIONS).toContain("PostHog");
    expect(ANALYTICS_INSTRUCTIONS).toContain("Never create, update");
  });

  it("normalizes MCP and text stream events", async () => {
    const create = vi.fn().mockResolvedValue(fakeStream());
    const provider = new AzureResponsesProvider(
      { responses: { create } },
      {
        deployment: "gpt-5-mini",
        mcpTools: [
          createPostHogMcpTool({
            apiKey: "posthog-secret",
            organizationId: "org",
            projectId: "project",
          }),
          createStripeMcpTool({ apiKey: "rk_live_secret" }),
        ],
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
      { type: "status", label: "Loading tools in Stripe" },
      { type: "status", label: "Analyzing data in Stripe" },
      { type: "text_delta", delta: "42 visitors" },
      expect.objectContaining({
        type: "tool_trace",
        toolName: "stripe:list_subscriptions",
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
        tools: expect.arrayContaining([
          expect.objectContaining({ server_label: "posthog" }),
          expect.objectContaining({ server_label: "stripe" }),
        ]),
        max_tool_calls: 30,
        max_output_tokens: 16000,
        parallel_tool_calls: false,
        previous_response_id: "resp-previous",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("builds response tools with both MCP and internal function tools", () => {
    const functionTool = zodResponsesFunction({
      name: "amio-search-conversations",
      description: "demo",
      parameters: z.object({
        dateFrom: z.string(),
        dateTo: z.string(),
      }),
      function: async () => ({ ok: true }),
    });

    const tools = buildResponseTools({
      staticMcpTools: [
        createPostHogMcpTool({
          apiKey: "secret",
          organizationId: "org",
          projectId: "project",
        }),
      ],
      dynamicMcpTools: [],
      functionTools: [functionTool],
    });

    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ server_label: "posthog" }),
        expect.objectContaining({
          type: "function",
          name: "amio-search-conversations",
        }),
      ]),
    );
  });

  it("executes internal function tools and continues the response loop", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(functionToolStream())
      .mockResolvedValueOnce(postToolTextStream());
    const functionTool = zodResponsesFunction({
      name: "amio-analyze-conversations-batch",
      description: "demo",
      parameters: z.object({
        dateFrom: z.string(),
        dateTo: z.string(),
        includeSystemEvents: z.boolean(),
      }),
      function: async () => ({
        contactIds: ["c1"],
        summary: {
          conversationCount: 1,
          loadedConversationCount: 1,
          failedConversationCount: 0,
          dateFrom: "2026-07-01T00:00:00.000Z",
          dateTo: "2026-07-02T00:00:00.000Z",
        },
        transcripts: [],
        aggregate: {
          conversationCount: 1,
          totalMessageCount: 0,
          userMessageCount: 0,
          assistantMessageCount: 0,
          buttonClickCount: 0,
          systemEventCount: 0,
          conversationsWithButtonClicks: 0,
          conversationsWithRemoteActions: 0,
          messagesPerConversationAvg: 0,
          outcomesBreakdown: {},
          messageKindBreakdown: {},
        },
        truncated: {
          conversationsTruncated: false,
          omittedConversationCount: 0,
        },
        failedContactIds: [],
        warnings: [],
      }),
    });
    const provider = new AzureResponsesProvider(
      { responses: { create } },
      {
        deployment: "gpt-5-mini",
        mcpTools: [],
        functionTools: [functionTool],
      },
    );

    const events = await collect(
      provider.run(
        {
          userMessage: "Find demo chat conversations",
          previousResponseId: null,
        },
        new AbortController().signal,
      ),
    );

    expect(events).toEqual([
      { type: "status", label: "Analyzing data in AMIO conversations" },
      expect.objectContaining({
        type: "tool_trace",
        toolName: "amio_conversations:amio-analyze-conversations-batch",
        status: "completed",
      }),
      { type: "text_delta", delta: "Summary done" },
      {
        type: "completed",
        responseId: "resp-tool-2",
        inputTokens: 20,
        outputTokens: 12,
      },
    ]);
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        previous_response_id: "resp-tool-1",
        input: [
          expect.objectContaining({
            type: "function_call_output",
            call_id: "call-1",
          }),
        ],
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
        mcpTools: [
          createPostHogMcpTool({
            apiKey: "secret",
            organizationId: "org",
            projectId: "project",
          }),
        ],
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
      message: "MCP request failed more than twice.",
    });
  });
});
