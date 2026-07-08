import { describe, expect, it } from "vitest";
import { normalizeTranscript } from "./transcript-normalizer";

describe("normalizeTranscript", () => {
  it("maps received, quick reply, and remote action events", () => {
    const transcript = normalizeTranscript({
      contactId: "contact-1",
      initialRequest: "Kde je objednavka?",
      lastRequestTimestamp: "2026-07-01T10:02:00.000Z",
      outcomes: ["REQUEST_STARTED"],
      includeSystemEvents: true,
      requests: [
        {
          id: "req_1",
          bot_id: "bot-1",
          channel_id: "channel-1",
          contact_id: "contact-1",
          message_id: "msg_1",
          outcome: "REQUEST_STARTED",
          intent: "order_tracking",
          customer_message: "Kde je objednavka?",
          created_on: "2026-07-01T10:00:00.000Z",
        },
      ],
      history: [
        {
          id: "evt_1",
          timestamp: "2026-07-01T10:00:00.000Z",
          type: "message",
          data: {
            direction: "received",
            content: { payload: "Kde je objednavka?" },
            message_id: "msg_1",
          },
        },
        {
          id: "evt_2",
          timestamp: "2026-07-01T10:01:00.000Z",
          type: "quick_reply",
          data: { payload: "TRACK", text: "Track order" },
        },
        {
          id: "evt_3",
          timestamp: "2026-07-01T10:02:00.000Z",
          type: "remote_action",
          data: { requestData: { id: 1 } },
        },
      ],
    });

    expect(transcript.messages.map((item) => [item.role, item.kind])).toEqual([
      ["user", "text"],
      ["user", "button_click"],
      ["system", "remote_action"],
    ]);
    expect(transcript.messages[0]).toMatchObject({
      requestId: "req_1",
      outcome: "REQUEST_STARTED",
      intent: "order_tracking",
    });
  });

  it("omits system events when includeSystemEvents is false", () => {
    const transcript = normalizeTranscript({
      contactId: "contact-1",
      initialRequest: "Ahoj",
      lastRequestTimestamp: "2026-07-01T10:02:00.000Z",
      outcomes: [],
      includeSystemEvents: false,
      requests: [],
      history: [
        {
          id: "evt_1",
          timestamp: "2026-07-01T10:00:00.000Z",
          type: "event",
          data: { text: "wake up" },
        },
        {
          id: "evt_2",
          timestamp: "2026-07-01T10:01:00.000Z",
          type: "message",
          data: {
            direction: "sent",
            content: { payload: "Ahoj!" },
          },
        },
      ],
    });

    expect(transcript.messages).toHaveLength(1);
    expect(transcript.messages[0]).toMatchObject({
      role: "assistant",
      kind: "text",
      text: "Ahoj!",
    });
  });
});
