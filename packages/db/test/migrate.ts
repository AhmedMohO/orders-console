import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { openTestDatabase } from "./database.js";

const db = await openTestDatabase();
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("Separate test database migrated.");
} finally {
  await db.$client.end();
}
