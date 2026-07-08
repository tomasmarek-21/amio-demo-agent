import { describe, expect, it, vi } from "vitest";
import { createConversationSearchService } from "./conversation-search-service";

describe("conversation search service", () => {
  it("returns aggregate counts and records failed contacts without truncating messages", async () => {
    const api = {
      searchConversations: vi.fn().mockResolvedValue({
        conversations: [
          {
            contactId: "c1",
            initialRequest: "Ahoj",
            outcomes: ["REQUEST_STARTED"],
            lastRequestTimestamp: "2026-07-01T10:00:00.000Z",
          },
          {
            contactId: "c2",
            initialRequest: "Pomoc",
            outcomes: ["REQUEST_STARTED"],
            lastRequestTimestamp: "2026-07-01T10:05:00.000Z",
          },
        ],
        cursor: { nextTimestamp: null, nextContactId: null, hasNext: false },
      }),
      getConversationHistory: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "evt_1",
            timestamp: "2026-07-01T10:00:00.000Z",
            type: "message",
            data: {
              direction: "received",
              content: { payload: "Ahoj" },
            },
          },
        ])
        .mockRejectedValueOnce(new Error("boom")),
      getConversationRequests: vi.fn().mockResolvedValue([]),
    };

    const service = createConversationSearchService({
      api: api as never,
      maxConversations: 50,
    });
    const result = await service.analyzeConversationBatch({
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-02T00:00:00.000Z",
      includeSystemEvents: false,
    });

    expect(result.summary.loadedConversationCount).toBe(1);
    expect(result.failedContactIds).toEqual(["c2"]);
    expect(result.aggregate.totalMessageCount).toBe(1);
    expect(result.contactIds).toEqual(["c1"]);
  });

  it("filters by local text query and reports omitted conversations by limit", async () => {
    const api = {
      searchConversations: vi
        .fn()
        .mockResolvedValueOnce({
          conversations: [
            {
              contactId: "c1",
              initialRequest: "Order tracking",
              outcomes: [],
              lastRequestTimestamp: "2026-07-01T10:00:00.000Z",
            },
            {
              contactId: "c2",
              initialRequest: "Refund request",
              outcomes: [],
              lastRequestTimestamp: "2026-07-01T10:05:00.000Z",
            },
          ],
          cursor: {
            nextTimestamp: "2026-07-01T09:00:00.000Z",
            nextContactId: "c2",
            hasNext: true,
          },
        })
        .mockResolvedValueOnce({
          conversations: [
            {
              contactId: "c3",
              initialRequest: "Order status",
              outcomes: [],
              lastRequestTimestamp: "2026-07-01T09:30:00.000Z",
            },
          ],
          cursor: { nextTimestamp: null, nextContactId: null, hasNext: false },
        }),
      getConversationHistory: vi.fn(),
      getConversationRequests: vi.fn(),
    };

    const service = createConversationSearchService({
      api: api as never,
      maxConversations: 1,
    });
    const result = await service.searchConversations({
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-02T00:00:00.000Z",
      textQuery: "order",
    });

    expect(result.contactIds).toEqual(["c1"]);
    expect(result.truncated).toEqual({
      conversationsTruncated: true,
      omittedConversationCount: 1,
    });
  });
});
