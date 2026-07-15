export type Capability =
  | "posthog"
  | "stripe"
  | "supabase"
  | "mrr"
  | "notion"
  | "amio-conversations";

export interface ScheduledWorkflow {
  name: string;
  prompt: string;
  capabilities: Capability[];
  n8nWorkflowUrl?: string;
}

export const SCHEDULED_WORKFLOWS: Record<string, ScheduledWorkflow> = {
  "weekly-mrr-report": {
    name: "Weekly MRR Report",
    prompt:
      "Read all active Stripe subscriptions, compute monthly recurring revenue (MRR) in EUR for the current month (annual plans divided by 12, CZK converted at current rate), then write the results to Supabase using the upsert_agent_mrr tool. After writing, call complete_scheduled_run with a brief Slack summary of total MRR and any notable changes.",
    capabilities: ["stripe", "mrr"],
    n8nWorkflowUrl: undefined,
  },
  "conversation-quality-check": {
    name: "Conversation Quality Check",
    prompt:
      "Analyze AMIO conversations from the last 7 days. Identify the top 3 failure patterns (unresolved requests, escalations, low-confidence answers). Call complete_scheduled_run with a brief Slack summary of findings.",
    capabilities: ["amio-conversations"],
    n8nWorkflowUrl: undefined,
  },
};

export function getWorkflow(id: string): ScheduledWorkflow | null {
  return SCHEDULED_WORKFLOWS[id] ?? null;
}
