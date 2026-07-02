import { defineConfig } from "@playwright/test";
import { join } from "node:path";

const e2eDatabase = join(
  process.env.TMPDIR ?? "/tmp",
  `amio-agent-e2e-${process.pid}.sqlite`,
);

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      AGENT_PROVIDER: "fake",
      DATABASE_URL: e2eDatabase,
    },
  },
});
