import { AmioConversationsApi } from "./amio-conversations-api";
import { normalizeTranscript } from "./transcript-normalizer";
import type {
  AnalyzeToolResult,
  ConversationAggregate,
  ConversationSearchItem,
  FetchToolResult,
  SearchCursor,
  SearchToolResult,
  TranscriptFilters,
  TruncatedResult,
} from "./types";

interface ConversationSearchServiceConfig {
  api: AmioConversationsApi;
  maxConversations: number;
}

export function createConversationSearchService(
  config: ConversationSearchServiceConfig,
) {
  const loadCandidateConversations = async (input: TranscriptFilters) => {
    const matches: ConversationSearchItem[] = [];
    const normalizedQuery = normalizeQuery(input.textQuery);
    let cursor: SearchCursor | undefined;
    let hasNext = true;

    while (hasNext) {
      const page = await config.api.searchConversations(input, cursor);
      for (const conversation of page.conversations) {
        if (
          normalizedQuery &&
          !conversation.initialRequest.toLowerCase().includes(normalizedQuery)
        ) {
          continue;
        }
        matches.push(conversation);
      }
      hasNext = page.cursor.hasNext;
      cursor =
        page.cursor.nextTimestamp && page.cursor.nextContactId
          ? {
              nextTimestamp: page.cursor.nextTimestamp,
              nextContactId: page.cursor.nextContactId,
            }
          : undefined;
    }

    const limit = resolveLimit(input.maxConversations, config.maxConversations);
    return {
      selected: matches.slice(0, limit),
      totalAvailable: matches.length,
    };
  };

  const searchConversations = async (
    input: TranscriptFilters,
  ): Promise<SearchToolResult> => {
    validateDateRange(input.dateFrom, input.dateTo);
    const { selected, totalAvailable } = await loadCandidateConversations(input);
    return {
      contactIds: selected.map((item) => item.contactId),
      summary: {
        conversationCount: selected.length,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
      truncated: buildTruncated(selected.length, totalAvailable),
    };
  };

  const fetchConversationTranscripts = async (
    input: TranscriptFilters,
  ): Promise<FetchToolResult> => {
    validateDateRange(input.dateFrom, input.dateTo);
    const { selected, totalAvailable } = await loadCandidateConversations(input);
    const transcripts = [];
    const failedContactIds: string[] = [];
    const warnings: string[] = [];

    for (const conversation of selected) {
      try {
        const [history, requests] = await Promise.all([
          config.api.getConversationHistory(conversation.contactId),
          config.api.getConversationRequests(conversation.contactId),
        ]);
        transcripts.push(
          normalizeTranscript({
            contactId: conversation.contactId,
            initialRequest: conversation.initialRequest,
            lastRequestTimestamp: conversation.lastRequestTimestamp,
            outcomes: conversation.outcomes,
            history,
            requests,
            includeSystemEvents: input.includeSystemEvents ?? false,
          }),
        );
      } catch (error) {
        failedContactIds.push(conversation.contactId);
        warnings.push(
          `Conversation ${conversation.contactId} could not be loaded: ${readableError(error)}`,
        );
      }
    }

    return {
      transcripts,
      summary: {
        conversationCount: selected.length,
        loadedConversationCount: transcripts.length,
        failedConversationCount: failedContactIds.length,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
      truncated: buildTruncated(selected.length, totalAvailable),
      failedContactIds,
      warnings,
    };
  };

  const analyzeConversationBatch = async (
    input: TranscriptFilters,
  ): Promise<AnalyzeToolResult> => {
    const fetchResult = await fetchConversationTranscripts(input);
    return {
      contactIds: fetchResult.transcripts.map((item) => item.contactId),
      ...fetchResult,
      aggregate: aggregateTranscripts(fetchResult.transcripts),
    };
  };

  return {
    loadCandidateConversations,
    searchConversations,
    fetchConversationTranscripts,
    analyzeConversationBatch,
  };
}

function aggregateTranscripts(
  transcripts: FetchToolResult["transcripts"],
): ConversationAggregate {
  const totalMessageCount = transcripts.reduce(
    (sum, transcript) => sum + transcript.messages.length,
    0,
  );
  const userMessageCount = countRole(transcripts, "user");
  const assistantMessageCount = countRole(transcripts, "assistant");
  const buttonClickCount = countKind(transcripts, "button_click");
  const systemEventCount = countRole(transcripts, "system");

  return {
    conversationCount: transcripts.length,
    totalMessageCount,
    userMessageCount,
    assistantMessageCount,
    buttonClickCount,
    systemEventCount,
    conversationsWithButtonClicks: countConversationsWithKind(
      transcripts,
      "button_click",
    ),
    conversationsWithRemoteActions: countConversationsWithKind(
      transcripts,
      "remote_action",
    ),
    messagesPerConversationAvg:
      transcripts.length > 0 ? totalMessageCount / transcripts.length : 0,
    outcomesBreakdown: transcripts.reduce<Record<string, number>>(
      (result, transcript) => {
        for (const outcome of transcript.outcomes) {
          result[outcome] = (result[outcome] ?? 0) + 1;
        }
        return result;
      },
      {},
    ),
    messageKindBreakdown: transcripts.reduce<Record<string, number>>(
      (result, transcript) => {
        for (const message of transcript.messages) {
          result[message.kind] = (result[message.kind] ?? 0) + 1;
        }
        return result;
      },
      {},
    ),
  };
}

function countRole(
  transcripts: FetchToolResult["transcripts"],
  role: "user" | "assistant" | "system",
) {
  return transcripts.reduce(
    (sum, transcript) =>
      sum + transcript.messages.filter((message) => message.role === role).length,
    0,
  );
}

function countKind(
  transcripts: FetchToolResult["transcripts"],
  kind: string,
) {
  return transcripts.reduce(
    (sum, transcript) =>
      sum + transcript.messages.filter((message) => message.kind === kind).length,
    0,
  );
}

function countConversationsWithKind(
  transcripts: FetchToolResult["transcripts"],
  kind: string,
) {
  return transcripts.filter((transcript) =>
    transcript.messages.some((message) => message.kind === kind),
  ).length;
}

function buildTruncated(
  selectedCount: number,
  totalAvailable: number,
): TruncatedResult {
  return {
    conversationsTruncated: totalAvailable > selectedCount,
    omittedConversationCount: Math.max(totalAvailable - selectedCount, 0),
  };
}

function resolveLimit(requested: number | undefined, configured: number) {
  if (!requested) {
    return configured;
  }
  return Math.min(requested, configured);
}

function normalizeQuery(textQuery: string | undefined) {
  return textQuery?.trim().toLowerCase() ?? "";
}

function validateDateRange(dateFrom: string, dateTo: string) {
  const from = Date.parse(dateFrom);
  const to = Date.parse(dateTo);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error("dateFrom and dateTo must be valid ISO timestamps.");
  }
  if (from > to) {
    throw new Error("dateFrom must be before or equal to dateTo.");
  }
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}
