import { describe, expect, it, vi } from "vitest";
import { AmioConversationsApi } from "./amio-conversations-api";

describe("AmioConversationsApi", () => {
  it("loads paginated history until has_next is false", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            history_events: [
              {
                id: "evt_1",
                timestamp: "2026-07-01T10:00:00.000Z",
                type: "message",
                data: {},
              },
            ],
            cursor: { next: "evt_2", has_next: true },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            history_events: [
              {
                id: "evt_2",
                timestamp: "2026-07-01T10:01:00.000Z",
                type: "message",
                data: {},
              },
            ],
            cursor: { next: null, has_next: false },
          }),
        ),
      );

    const api = new AmioConversationsApi({
      apiKey: "amio-key",
      baseUrl: "https://chatbot-engine.amio.io",
      botId: "6950785430289573256",
      fetchImpl: fetchMock,
    });

    const result = await api.getConversationHistory("contact-1");

    expect(result.map((item) => item.id)).toEqual(["evt_1", "evt_2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds analytics conversation filters from the request input", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          conversations: [],
          cursor: { next_timestamp: null, next_contact_id: null, has_next: false },
        }),
      ),
    );

    const api = new AmioConversationsApi({
      apiKey: "amio-key",
      baseUrl: "https://chatbot-engine.amio.io",
      botId: "6950785430289573256",
      fetchImpl: fetchMock,
    });

    await api.searchConversations({
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-02T00:00:00.000Z",
      requestOutcomes: ["REQUEST_STARTED"],
      ignoreOutcomes: ["CUSTOMER_STARTED_TO_WRITE"],
      answerId: "answer-1",
      channelIds: ["web"],
    });

    const firstCall = fetchMock.mock.calls[0]?.[0];
    expect(firstCall).toBeInstanceOf(URL);
    const url = firstCall as URL;
    expect(url.searchParams.get("botIds")).toBe("6950785430289573256");
    expect(url.searchParams.get("requestOutcomes")).toBe("REQUEST_STARTED");
    expect(url.searchParams.get("ignoreOutcomes")).toBe(
      "CUSTOMER_STARTED_TO_WRITE",
    );
    expect(url.searchParams.get("answerId")).toBe("answer-1");
    expect(url.searchParams.get("channelIds")).toBe("web");
  });
});
