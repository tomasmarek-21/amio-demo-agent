import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Page from "./page";

vi.mock("@/components/chat/chat-shell", () => ({
  ChatShell: () => <h1>AMIO Analytics Agent</h1>,
}));

it("renders the analytics chat shell", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { name: "AMIO Analytics Agent" }),
  ).toBeInTheDocument();
});
