import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const path = process.env.DATABASE_URL ?? "./data/agent.sqlite";
mkdirSync(dirname(resolve(path)), { recursive: true });
const sqlite = new Database(path);
migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
sqlite.close();
