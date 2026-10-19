import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";
import { requireDatabaseUrl } from "./env.js";

export function createDb(connectionString: string | undefined) {
    const pool = new Pool({
        connectionString: requireDatabaseUrl(connectionString),
        max: 10,
        connectionTimeoutMillis: 5000,
    });
    return drizzle({ client: pool, schema });
}

export type Database = ReturnType<typeof createDb>;
