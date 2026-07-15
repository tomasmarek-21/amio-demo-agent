import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDemoConversationsTools } from "./demo-conversations-capability";

const VALID_ROW = {
  contact_id: "7483096310095826390",
  first_message_at: "2026-07-13T10:00:00+02:00",
  last_message_at: "2026-07-13T10:15:00+02:00",
  initial_request: "How much does Amio cost?",
  classification: "hot" as const,
  insight:
    "Customer asked about pricing for 5,000 conversations per month and Shoptet integration. Agent redirected to the contact form without providing any pricing ranges.",
  amio_history_url:
    "https://automate.amio.io/bots/6950785430289573256/history?dateFrom=2026-07-13T00%3A00%3A00%2B02%3A00&dateTo=2026-07-14T23%3A59%3A59%2B02%3A00&contactId=7483096310095826390",
};

describe("createDemoConversationsTools", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("creates exactly one tool named upsert_demo_conversations", () => {
    const tools = createDemoConversationsTools({
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "test-key",
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("upsert_demo_conversations");
  });

  it("POSTs to the correct RPC endpoint with p_rows", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ upserted: 1 }),
    } as Response);

    const [tool] = createDemoConversationsTools({
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "svc-key",
    });

    await tool.$callback!({ rows: [VALID_ROW] });

    expect(fetch).toHaveBeenCalledWith(
      "https://test.supabase.co/rest/v1/rpc/upsert_demo_conversations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_rows: [VALID_ROW] }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apikey: "svc-key",
          Authorization: "Bearer svc-key",
        }),
      }),
    );
  });

  it("returns the upserted count from Supabase", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ upserted: 2 }),
    } as Response);

    const [tool] = createDemoConversationsTools({
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "svc-key",
    });

    const result = await tool.$callback!({
      rows: [
        VALID_ROW,
        { ...VALID_ROW, contact_id: "999", classification: "cold" as const, insight: null },
      ],
    });
    expect(result).toEqual({ upserted: 2 });
  });

  it("throws when Supabase returns a non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
      statusText: "Internal Server Error",
    } as unknown as Response);

    const [tool] = createDemoConversationsTools({
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "svc-key",
    });

    await expect(tool.$callback!({ rows: [VALID_ROW] })).rejects.toThrow(
      "upsert_demo_conversations failed (500)",
    );
  });
});
