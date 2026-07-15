import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { InternalFunctionTool } from "./amio-conversations-capability";

export interface DemoConversationsCapabilityConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

const demoConversationRowSchema = z.object({
  contact_id: z.string().min(1),
  first_message_at: z.string().datetime({ offset: true }),
  last_message_at: z.string().datetime({ offset: true }),
  initial_request: z.string().nullable(),
  classification: z.enum(["cold", "warm", "hot"]),
  insight: z
    .string()
    .nullable()
    .describe("2–3 sentence summary for warm/hot conversations. null for cold."),
  amio_history_url: z
    .string()
    .describe("Direct link to this conversation in Amio Automate history."),
});

const upsertDemoConversationsSchema = z.object({
  rows: z
    .array(demoConversationRowSchema)
    .min(1)
    .describe(
      "All classified conversations from this scan. Upserts by contact_id — safe to re-run.",
    ),
});

export function createDemoConversationsTools(
  config: DemoConversationsCapabilityConfig,
): InternalFunctionTool[] {
  const headers = {
    "Content-Type": "application/json",
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };

  const upsertTool = zodResponsesFunction({
    name: "upsert_demo_conversations",
    description:
      "Write classified demo chat conversations into Supabase demo_conversations table. " +
      "Call this exactly once after classifying all new conversations. " +
      "Upserts by contact_id — safe to call again on previously recorded conversations. " +
      "Returns { upserted }.",
    parameters: upsertDemoConversationsSchema,
    function: async ({ rows }) => {
      const res = await fetch(
        `${config.supabaseUrl}/rest/v1/rpc/upsert_demo_conversations`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ p_rows: rows }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`upsert_demo_conversations failed (${res.status}): ${text}`);
      }
      return res.json();
    },
  }) as InternalFunctionTool;

  return [upsertTool];
}
