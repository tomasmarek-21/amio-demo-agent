import { z } from "zod";

const commonEnv = z.object({
  DATABASE_URL: z.string().min(1).default("./data/agent.sqlite"),
});

const serverEnvSchema = z.discriminatedUnion("AGENT_PROVIDER", [
  commonEnv.extend({
    AGENT_PROVIDER: z.literal("azure"),
    AZURE_OPENAI_ENDPOINT: z.string().url(),
    AZURE_OPENAI_API_KEY: z.string().min(1),
    AZURE_OPENAI_DEPLOYMENT: z.string().min(1),
    POSTHOG_API_KEY: z.string().min(1),
    POSTHOG_ORGANIZATION_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    POSTHOG_PROJECT_ID: z.string().min(1),
    STRIPE_API_KEY: z.string().regex(
      /^rk_live_/,
      "STRIPE_API_KEY must be a production restricted key",
    ),
  }),
  commonEnv.extend({
    AGENT_PROVIDER: z.literal("fake"),
  }),
]);

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: Record<string, string | undefined>) {
  return serverEnvSchema.parse({
    ...input,
    AGENT_PROVIDER: input.AGENT_PROVIDER ?? "azure",
  });
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
