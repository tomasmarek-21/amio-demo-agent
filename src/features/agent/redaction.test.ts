import { expect, it } from "vitest";
import { redact } from "./redaction";

it("redacts secrets, emails, identifiers, and sensitive URL parameters", () => {
  const value = JSON.stringify({
    authorization: "Bearer secret",
    email: "person@example.com",
    distinct_id: "abc-123",
    url: "https://amio.io/pricing?token=secret&utm_source=google",
  });

  const result = redact(value);
  expect(result).not.toContain("secret");
  expect(result).not.toContain("person@example.com");
  expect(result).not.toContain("abc-123");
  expect(result).toContain("utm_source=google");
});

it("limits persisted tool output", () => {
  expect(redact("x".repeat(3_000))).toHaveLength(2_000);
});
