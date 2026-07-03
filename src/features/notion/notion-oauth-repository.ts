import { eq } from "drizzle-orm";
import type { DatabaseClient } from "@/db/client";
import {
  notionConnections,
  notionOauthStates,
} from "@/db/schema";

const CONNECTION_ID = "primary";

export interface NotionTokenUpdate {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  authorizedAt?: Date;
  lastRefreshAt: Date;
}

export class NotionOAuthRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getConnection() {
    const [connection] = await this.database
      .select()
      .from(notionConnections)
      .where(eq(notionConnections.id, CONNECTION_ID))
      .limit(1);
    return connection ?? null;
  }

  async saveRegistration(input: {
    redirectUri: string;
    clientId: string;
    clientSecret: string | null;
  }) {
    const now = new Date();
    await this.database
      .insert(notionConnections)
      .values({
        id: CONNECTION_ID,
        redirectUri: input.redirectUri,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: notionConnections.id,
        set: {
          redirectUri: input.redirectUri,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          authorizedAt: null,
          lastRefreshAt: null,
          updatedAt: now,
        },
      });
  }

  async saveOAuthState(input: {
    state: string;
    codeVerifier: string;
    redirectUri: string;
    expiresAt: Date;
  }) {
    await this.database.insert(notionOauthStates).values(input);
  }

  async consumeOAuthState(state: string) {
    const [result] = await this.database
      .select()
      .from(notionOauthStates)
      .where(eq(notionOauthStates.state, state))
      .limit(1);
    if (result) {
      await this.database
        .delete(notionOauthStates)
        .where(eq(notionOauthStates.state, state));
    }
    return result ?? null;
  }

  async saveTokens(input: NotionTokenUpdate) {
    const update: Record<string, Date | string | null> = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      lastRefreshAt: input.lastRefreshAt,
      updatedAt: input.lastRefreshAt,
    };
    if (input.authorizedAt) update.authorizedAt = input.authorizedAt;
    await this.database
      .update(notionConnections)
      .set(update)
      .where(eq(notionConnections.id, CONNECTION_ID));
  }

  async disconnect() {
    await this.database
      .update(notionConnections)
      .set({
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        authorizedAt: null,
        lastRefreshAt: null,
        updatedAt: new Date(),
      })
      .where(eq(notionConnections.id, CONNECTION_ID));
  }
}
