export const AGENT_MODEL_IDS = [
  "gpt-55",
  "gpt-54-mini",
  "gpt-54-nano",
  "gpt-41-mini",
] as const;

export type AgentModel = (typeof AGENT_MODEL_IDS)[number];

export const DEFAULT_AGENT_MODEL: AgentModel = "gpt-55";

export const REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

export const MODEL_REASONING_EFFORTS: Record<
  AgentModel,
  readonly ReasoningEffort[]
> = {
  "gpt-55": REASONING_EFFORTS,
  "gpt-54-mini": REASONING_EFFORTS,
  "gpt-54-nano": REASONING_EFFORTS,
  "gpt-41-mini": [],
};

export function isAgentModel(value: string): value is AgentModel {
  return AGENT_MODEL_IDS.includes(value as AgentModel);
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return REASONING_EFFORTS.includes(value as ReasoningEffort);
}
