import { expect, test } from "@playwright/test";

test("creates a session, streams an answer, and starts a clean session", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByPlaceholder("Zeptejte se na PostHog…")
    .fill("Kolik lidí navštívilo minulý týden pricing stránku?");
  await page.getByRole("button", { name: "Odeslat" }).click();
  await expect(page.getByText("42 návštěvníků")).toBeVisible();
  await page
    .getByRole("button", { name: /Jak jsem k tomu došel/ })
    .click();
  await expect(page.getByText("execute-sql")).toBeVisible();

  await page
    .getByRole("button", { name: "Nová konverzace", exact: true })
    .click();
  await expect(page.getByText("42 návštěvníků")).not.toBeVisible();
  await expect(
    page.getByText("Zeptejte se na data v PostHogu."),
  ).toBeVisible();
});
