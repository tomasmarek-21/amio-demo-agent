import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Page from "./page";

it("renders the AMIO analytics agent heading", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { name: "AMIO Analytics Agent" }),
  ).toBeInTheDocument();
});
