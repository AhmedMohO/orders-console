import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { createDb } from "../src/client.js";
import { sql } from "drizzle-orm";
import { requireDatabaseUrl } from "../src/env.js";

export function assertTestDatabase(testUrl: string, developmentUrl: string, actualName: string, mode: string | undefined) {
  const test = new URL(requireDatabaseUrl(testUrl));
  const development = new URL(requireDatabaseUrl(developmentUrl));
  const name = decodeURIComponent(test.pathname.slice(1));
  if (mode !== "test" || test.search || development.search ||
    !name.endsWith("_test") || name === decodeURIComponent(development.pathname.slice(1)) || actualName !== name) {
    throw new Error("Refusing unsafe test database: require test mode and a verified separate _test database");
  }
}

export async function openTestDatabase() {
  const env = parseEnv(readFileSync(new URL("../../../.env.test", import.meta.url), "utf8"));
  const development = parseEnv(readFileSync(new URL("../../../.env", import.meta.url), "utf8"));
  const testUrl = requireDatabaseUrl(env.DATABASE_URL);
  const developmentUrl = requireDatabaseUrl(development.DATABASE_URL);
  const name = decodeURIComponent(new URL(testUrl).pathname.slice(1));
  assertTestDatabase(testUrl, developmentUrl, name, env.NODE_ENV);
  const db = createDb(testUrl);
  try {
    const result = await db.execute<{ name: string }>(sql`select current_database() as name`);
    assertTestDatabase(testUrl, developmentUrl, result.rows[0].name, env.NODE_ENV);
    return db;
  } catch (error) {
    await db.$client.end();
    throw error;
  }
}
