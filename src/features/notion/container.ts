import "server-only";
import { db } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { NotionOAuthRepository } from "./notion-oauth-repository";
import { NotionOAuthService } from "./notion-oauth-service";
import { TokenCipher } from "./token-crypto";

const env = getServerEnv();
const encryptionSecret =
  env.AGENT_PROVIDER === "azure"
    ? env.AZURE_OPENAI_API_KEY
    : `local-fake-provider:${env.SUPABASE_AGENT_URL}`;

export const notionOAuthService = new NotionOAuthService(
  new NotionOAuthRepository(db),
  new TokenCipher(encryptionSecret),
);
