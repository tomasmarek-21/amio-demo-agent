import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

const env = getServerEnv();

export const db = createClient(
  env.SUPABASE_AGENT_URL,
  env.SUPABASE_AGENT_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

export type DatabaseClient = typeof db;
