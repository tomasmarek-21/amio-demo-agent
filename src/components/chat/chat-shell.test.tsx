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
  title: "New conversation",
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
              content: "How many people visited pricing?",
              createdAt: new Date(),
            },
            {
              id: "assistant-1",
              sessionId: first.id,
              role: "assistant",
              content: "42 visitors",
              createdAt: new Date(),
            },
          ]
        : [],
    evidence: [],
  }));
  api.sendMessage.mockImplementation(async function* () {
    yield { type: "status", label: "Analyzing data in PostHog" };
    yield { type: "text_delta", delta: "42 visitors" };
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
    await screen.findByText("Ask something about AMIO."),
  ).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Ask about PostHog or Stripe…"), {
    target: { value: "How many people visited pricing?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() =>
    expect(
      screen.getByText("How many people visited pricing?"),
    ).toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.getByText("42 visitors")).toBeInTheDocument(),
  );
  expect(api.sendMessage).toHaveBeenCalledWith(
    first.id,
    "How many people visited pricing?",
  );
});

it("starts a visibly clean conversation", async () => {
  api.listSessions.mockResolvedValue([first]);
  render(<ChatShell />);
  await waitFor(() => expect(api.getSession).toHaveBeenCalledWith(first.id));

  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));

  await waitFor(() => expect(api.getSession).toHaveBeenCalledWith(second.id));
  expect(screen.getByText("Ask something about AMIO.")).toBeInTheDocument();
});
