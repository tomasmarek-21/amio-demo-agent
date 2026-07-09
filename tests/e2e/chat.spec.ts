import { expect, test } from "@playwright/test";

test("creates a session, streams an answer, and starts a clean session", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByPlaceholder("Ask about PostHog or Stripe…")
    .fill("How many people visited the pricing page last week?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("42 visitors")).toBeVisible();
  await page
    .getByRole("button", { name: /How I got this answer/ })
    .click();
  await expect(page.getByText("execute-sql")).toBeVisible();

  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.getByText("42 visitors")).not.toBeVisible();
  await expect(
    page.getByText("Ask something about AMIO."),
  ).toBeVisible();
});
