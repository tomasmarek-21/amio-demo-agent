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

const demoRequestRowSchema = z.object({
  contact_id: z.string().min(1).describe("Contact ID of the parent conversation"),
  request_index: z
    .number()
    .int()
    .min(0)
    .describe("0-based index of this request within the conversation"),
  conversation_date: z
    .string()
    .datetime({ offset: true })
    .describe("first_message_at of the parent conversation"),
  question_summary: z
    .string()
    .min(1)
    .describe("Concise description of what the user asked (1–2 sentences)"),
  chatbot_answer_summary: z
    .string()
    .min(1)
    .describe("Brief description of how the chatbot responded (1–2 sentences)"),
  topic_name: z
    .string()
    .min(1)
    .nullable()
    .describe(
      "Topic name — prefer an existing topic from get_demo_topics; only create a new topic name if none fit",
    ),
  is_correct: z
    .boolean()
    .describe(
      "true if chatbot answered coherently and on-topic; false if off-topic, confused, or clearly wrong",
    ),
  error_reason: z
    .string()
    .nullable()
    .describe("Why the answer was wrong (1–2 sentences). null when is_correct is true"),
});

const upsertDemoRequestsSchema = z.object({
  rows: z
    .array(demoRequestRowSchema)
    .min(1)
    .describe(
      "All analyzed request–response pairs across all conversations in this scan",
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

  const upsertConversationsTool = zodResponsesFunction({
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

  const getTopicsTool = zodResponsesFunction({
    name: "get_demo_topics",
    description:
      "Retrieve all existing topic names from Supabase demo_topics table. " +
      "Call this once at the start of request analysis to know which topics already exist. " +
      "Returns an array of { id, name } objects.",
    parameters: z.object({}),
    function: async () => {
      const res = await fetch(
        `${config.supabaseUrl}/rest/v1/demo_topics?select=id,name&order=name`,
        { headers },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`get_demo_topics failed (${res.status}): ${text}`);
      }
      return res.json();
    },
  }) as InternalFunctionTool;

  const upsertRequestsTool = zodResponsesFunction({
    name: "upsert_demo_requests",
    description:
      "Write individual request–response pairs with topic and correctness evaluation into Supabase. " +
      "Call this once after analyzing all requests, after upsert_demo_conversations succeeds. " +
      "Upserts by (contact_id, request_index) — safe to re-run. " +
      "Automatically creates new topics when topic_name is not already in demo_topics. " +
      "Returns { upserted }.",
    parameters: upsertDemoRequestsSchema,
    function: async ({ rows }) => {
      const res = await fetch(
        `${config.supabaseUrl}/rest/v1/rpc/upsert_demo_requests`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ p_rows: rows }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`upsert_demo_requests failed (${res.status}): ${text}`);
      }
      return res.json();
    },
  }) as InternalFunctionTool;

  return [upsertConversationsTool, getTopicsTool, upsertRequestsTool];
}
