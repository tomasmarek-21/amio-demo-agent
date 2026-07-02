import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/chat-api", () => api);

import { ChatShell } from "./chat-shell";

const first = {
  id: "session-1",
  title: "Nová konverzace",
  lastResponseId: null,
  createdAt: new Date("2026-07-02T10:00:00Z"),
  updatedAt: new Date("2026-07-02T10:00:00Z"),
};
const second = { ...first, id: "session-2" };
let sent = false;

beforeEach(() => {
  sent = false;
  vi.clearAllMocks();
  api.listSessions.mockResolvedValue([]);
  api.createSession
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  api.getSession.mockImplementation(async (id: string) => ({
    ...(id === first.id ? first : second),
    messages:
      id === first.id && sent
        ? [
            {
              id: "user-1",
              sessionId: first.id,
              role: "user",
              content: "Kolik lidí navštívilo pricing?",
              createdAt: new Date(),
            },
            {
              id: "assistant-1",
              sessionId: first.id,
              role: "assistant",
              content: "42 návštěvníků",
              createdAt: new Date(),
            },
          ]
        : [],
    evidence: [],
  }));
  api.sendMessage.mockImplementation(async function* () {
    yield { type: "status", label: "Analyzuji data v PostHogu" };
    yield { type: "text_delta", delta: "42 návštěvníků" };
    sent = true;
    yield {
      type: "completed",
      responseId: "resp-1",
      inputTokens: 10,
      outputTokens: 5,
    };
  });
});

it("creates a session and streams a response", async () => {
  render(<ChatShell />);
  expect(
    await screen.findByText("Zeptejte se na data v PostHogu."),
  ).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Zeptejte se na PostHog…"), {
    target: { value: "Kolik lidí navštívilo pricing?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Odeslat" }));

  await waitFor(() =>
    expect(
      screen.getByText("Kolik lidí navštívilo pricing?"),
    ).toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByText("42 návštěvníků")).toBeInTheDocument(),
  );
  expect(api.sendMessage).toHaveBeenCalledWith(
    first.id,
    "Kolik lidí navštívilo pricing?",
  );
});

it("starts a visibly clean conversation", async () => {
  api.listSessions.mockResolvedValue([first]);
  render(<ChatShell />);
  await waitFor(() => expect(api.getSession).toHaveBeenCalledWith(first.id));

  fireEvent.click(screen.getByRole("button", { name: "Nová konverzace" }));

  await waitFor(() => expect(api.getSession).toHaveBeenCalledWith(second.id));
  expect(screen.getByText("Zeptejte se na data v PostHogu.")).toBeInTheDocument();
});
