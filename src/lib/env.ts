import { z } from "zod";

const serverEnvSchema = z.object({
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_DEPLOYMENT: z.string().min(1),
  POSTHOG_API_KEY: z.string().min(1),
  POSTHOG_ORGANIZATION_ID: z.string().min(1),
  POSTHOG_PROJECT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1).default("./data/agent.sqlite"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: Record<string, string | undefined>) {
  return serverEnvSchema.parse(input);
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
