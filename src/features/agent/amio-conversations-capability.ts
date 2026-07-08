import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import { AmioConversationsApi } from "@/features/amio-conversations/amio-conversations-api";
import { createConversationSearchService } from "@/features/amio-conversations/conversation-search-service";

export const AMIO_DEMO_BOT_ID = "6950785430289573256";

export interface InternalFunctionTool {
  type: "function";
  name: string;
  description?: string | null;
  parameters: Record<string, unknown> | null;
  strict: boolean | null;
  $callback?: (args: any) => unknown | Promise<unknown>;
  $parseRaw: (args: string) => any;
}

export interface AmioCapabilityConfig {
  apiKey: string;
  baseUrl: string;
  botId: string;
  maxConversations: number;
}

const baseConversationFiltersSchema = z.object({
  dateFrom: z.string().datetime({ offset: true }),
  dateTo: z.string().datetime({ offset: true }),
  maxConversations: z.number().int().positive().max(200).optional(),
  requestOutcomes: z.array(z.string().min(1)).optional(),
  ignoreOutcomes: z.array(z.string().min(1)).optional(),
  answerId: z.string().min(1).optional(),
  channelIds: z.array(z.string().min(1)).optional(),
  textQuery: z.string().min(1).optional(),
});

const searchConversationsSchema = baseConversationFiltersSchema;
const fetchConversationTranscriptsSchema = baseConversationFiltersSchema.extend({
  includeSystemEvents: z.boolean().optional().default(false),
});

export function createAmioConversationsTools(
  config: AmioCapabilityConfig,
): InternalFunctionTool[] {
  const api = new AmioConversationsApi({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    botId: config.botId,
  });
  const service = createConversationSearchService({
    api,
    maxConversations: config.maxConversations,
  });

  return [
    zodResponsesFunction({
      name: "amio-search-conversations",
      description:
        "Find demo AMIO chat conversations in a required date window and return only contact IDs plus summary metadata.",
      parameters: searchConversationsSchema,
      function: (input) => service.searchConversations(input),
    }) as InternalFunctionTool,
    zodResponsesFunction({
      name: "amio-fetch-conversation-transcripts",
      description:
        "Find demo AMIO chat conversations in a required date window and return their full normalized transcripts.",
      parameters: fetchConversationTranscriptsSchema,
      function: (input) => service.fetchConversationTranscripts(input),
    }) as InternalFunctionTool,
    zodResponsesFunction({
      name: "amio-analyze-conversations-batch",
      description:
        "Find demo AMIO chat conversations in a required date window, load full transcripts, and return deterministic transcript analytics aggregates.",
      parameters: fetchConversationTranscriptsSchema,
      function: (input) => service.analyzeConversationBatch(input),
    }) as InternalFunctionTool,
  ];
}
