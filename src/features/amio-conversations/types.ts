export interface SearchFilters {
  dateFrom: string;
  dateTo: string;
  maxConversations?: number;
  requestOutcomes?: string[];
  ignoreOutcomes?: string[];
  answerId?: string;
  channelIds?: string[];
  textQuery?: string;
}

export interface TranscriptFilters extends SearchFilters {
  includeSystemEvents?: boolean;
}

export interface SearchCursor {
  nextTimestamp: string;
  nextContactId: string;
}

export interface ConversationSearchItem {
  contactId: string;
  initialRequest: string;
  outcomes: string[];
  lastRequestTimestamp: string;
}

export interface SearchPage {
  conversations: ConversationSearchItem[];
  cursor: {
    nextTimestamp: string | null;
    nextContactId: string | null;
    hasNext: boolean;
  };
}

export interface HistoryEvent {
  id: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

export interface RequestRecord {
  id: string;
  bot_id: string;
  channel_id: string;
  contact_id: string;
  message_id: string;
  outcome: string;
  created_on: string;
  customer_message: string;
  intent: string | null;
}

export type MessageRole = "user" | "assistant" | "system";

export interface NormalizedMessage {
  id: string;
  timestamp: string;
  role: MessageRole;
  kind:
    | "text"
    | "button_click"
    | "remote_action"
    | "llm_action"
    | "event"
    | "answer_end";
  text?: string;
  payload?: string;
  messageId?: string | null;
  requestId?: string | null;
  outcome?: string | null;
  intent?: string | null;
  details?: Record<string, unknown>;
}

export interface NormalizedTranscript {
  contactId: string;
  initialRequest: string;
  lastRequestTimestamp: string;
  outcomes: string[];
  messages: NormalizedMessage[];
}

export interface TruncatedResult {
  conversationsTruncated: boolean;
  omittedConversationCount: number;
}

export interface SearchSummary {
  conversationCount: number;
  dateFrom: string;
  dateTo: string;
}

export interface FetchSummary extends SearchSummary {
  loadedConversationCount: number;
  failedConversationCount: number;
}

export interface ConversationAggregate {
  conversationCount: number;
  totalMessageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  buttonClickCount: number;
  systemEventCount: number;
  conversationsWithButtonClicks: number;
  conversationsWithRemoteActions: number;
  messagesPerConversationAvg: number;
  outcomesBreakdown: Record<string, number>;
  messageKindBreakdown: Record<string, number>;
}

export interface SearchToolResult {
  contactIds: string[];
  summary: SearchSummary;
  truncated: TruncatedResult;
}

export interface FetchToolResult {
  transcripts: NormalizedTranscript[];
  summary: FetchSummary;
  truncated: TruncatedResult;
  failedContactIds: string[];
  warnings: string[];
}

export interface AnalyzeToolResult extends FetchToolResult {
  contactIds: string[];
  aggregate: ConversationAggregate;
}
