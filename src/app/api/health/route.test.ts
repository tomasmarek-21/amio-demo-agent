import { expect, it } from "vitest";
import { GET } from "./route";

it("returns liveness without configuration values", async () => {
  const response = GET();
  expect(await response.json()).toEqual({ status: "ok" });
});
