import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getServerEnv } from "@/lib/env";
import { createSchema } from "./schema-bootstrap";
import * as schema from "./schema";

const path = resolve(getServerEnv().DATABASE_URL);
mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
createSchema(sqlite);

export const db = drizzle(sqlite, { schema });
export type DatabaseClient = typeof db;
