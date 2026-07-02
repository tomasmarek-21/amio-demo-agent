import type {
  AgentEvent,
  AgentProvider,
  AgentProviderInput,
} from "@/features/agent/types";

export class FakeAgentProvider implements AgentProvider {
  readonly inputs: AgentProviderInput[] = [];

  constructor(private readonly events: AgentEvent[]) {}

  async *run(
    input: AgentProviderInput,
    signal: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    void signal;
    this.inputs.push(input);
    for (const event of this.events) yield event;
  }
}
