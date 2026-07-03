export const AGENT_MODEL_IDS = [
  "gpt-55",
  "gpt-54-mini",
  "gpt-54-nano",
  "gpt-41-mini",
] as const;

export type AgentModel = (typeof AGENT_MODEL_IDS)[number];

export const DEFAULT_AGENT_MODEL: AgentModel = "gpt-55";

export function isAgentModel(value: string): value is AgentModel {
  return AGENT_MODEL_IDS.includes(value as AgentModel);
}
