import type {
  ConversationSearchItem,
  HistoryEvent,
  RequestRecord,
  SearchCursor,
  SearchFilters,
  SearchPage,
} from "./types";

interface RawSearchPage {
  conversations: Array<{
    contact_id: string;
    initial_request: string;
    outcomes: string[];
    last_request_timestamp: string;
  }>;
  cursor?: {
    next_timestamp?: string | null;
    next_contact_id?: string | null;
    has_next?: boolean;
  };
}

interface RawHistoryPage {
  history_events: HistoryEvent[];
  cursor: {
    next: string | null;
    has_next: boolean;
  };
}

interface AmioApiConfig {
  apiKey: string;
  baseUrl: string;
  botId: string;
  fetchImpl?: typeof fetch;
}

export class AmioConversationsApi {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AmioApiConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async searchConversations(
    input: SearchFilters,
    cursor?: SearchCursor,
    pageSize = 100,
  ): Promise<SearchPage> {
    const url = new URL("/analytics/conversations", this.config.baseUrl);
    url.searchParams.set("botIds", this.config.botId);
    url.searchParams.set("dateFrom", input.dateFrom);
    url.searchParams.set("dateTo", input.dateTo);
    url.searchParams.set("max", String(pageSize));
    if (input.requestOutcomes?.length) {
      url.searchParams.set("requestOutcomes", input.requestOutcomes.join(","));
    }
    if (input.ignoreOutcomes?.length) {
      url.searchParams.set("ignoreOutcomes", input.ignoreOutcomes.join(","));
    }
    if (input.answerId) {
      url.searchParams.set("answerId", input.answerId);
    }
    if (input.channelIds?.length) {
      url.searchParams.set("channelIds", input.channelIds.join(","));
    }
    if (cursor?.nextTimestamp) {
      url.searchParams.set("cursorTimestamp", cursor.nextTimestamp);
      url.searchParams.set("cursorContactId", cursor.nextContactId);
    }

    const page = await this.getJson<RawSearchPage>(url);
    return {
      conversations: page.conversations.map(normalizeConversationSearchItem),
      cursor: {
        nextTimestamp: page.cursor?.next_timestamp ?? null,
        nextContactId: page.cursor?.next_contact_id ?? null,
        hasNext: page.cursor?.has_next ?? false,
      },
    };
  }

  async getConversationHistory(contactId: string): Promise<HistoryEvent[]> {
    const events: HistoryEvent[] = [];
    let cursor: string | null = null;

    do {
      const url = new URL(
        `/analytics/conversations/${contactId}/history`,
        this.config.baseUrl,
      );
      url.searchParams.set("max", "100");
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const page = await this.getJson<RawHistoryPage>(url);
      events.push(...page.history_events);
      cursor = page.cursor.has_next ? page.cursor.next : null;
    } while (cursor);

    return events;
  }

  async getConversationRequests(contactId: string): Promise<RequestRecord[]> {
    const url = new URL(
      `/analytics/conversations/${contactId}/requests`,
      this.config.baseUrl,
    );
    const response = await this.getJson<{ requests: RequestRecord[] }>(url);
    return response.requests;
  }

  private async getJson<T>(url: URL): Promise<T> {
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`AMIO request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}

function normalizeConversationSearchItem(
  item: RawSearchPage["conversations"][number],
): ConversationSearchItem {
  return {
    contactId: item.contact_id,
    initialRequest: item.initial_request,
    outcomes: Array.isArray(item.outcomes) ? item.outcomes : [],
    lastRequestTimestamp: item.last_request_timestamp,
  };
}
