import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  AgentProvider,
  AgentProviderInput,
} from "./types";

export class FakeAgentProvider implements AgentProvider {
  async *run(
    input: AgentProviderInput,
    signal: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    void input;
    void signal;
    yield { type: "status", label: "Loading PostHog tools" };
    yield { type: "status", label: "Analyzing data in PostHog" };
    yield {
      type: "tool_trace",
      toolName: "execute-sql",
      arguments:
        '{"query":"SELECT uniq(distinct_id) AS visitors FROM events WHERE event = \'$pageview\' AND timestamp >= now() - INTERVAL 7 DAY LIMIT 100"}',
      resultSummary: '{"visitors":42}',
      durationMs: 24,
      status: "completed",
      error: null,
    };
    yield {
      type: "text_delta",
      delta:
        "## Result\n\nPricing was visited by **42 visitors**.\n\nPeriod: last 7 completed days, project timezone.",
    };
    yield {
      type: "completed",
      responseId: `fake-${randomUUID()}`,
      inputTokens: 100,
      outputTokens: 35,
    };
  }
}
