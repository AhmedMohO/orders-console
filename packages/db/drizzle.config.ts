import { defineConfig } from "drizzle-kit";
import { requireDatabaseUrl } from "./src/env.js";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/schema/index.ts",
    out: "./drizzle",
    dbCredentials: {
        url: requireDatabaseUrl(process.env.DATABASE_URL),
    },
});
