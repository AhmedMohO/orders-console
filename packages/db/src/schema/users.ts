import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { userRoles } from "@repo/contracts/users";

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    role: text("role", { enum: userRoles }).notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, (t) => [
    check("users_role_check", sql`${t.role} in ('admin', 'agent')`),
    check("users_email_check", sql`${t.email} = lower(btrim(${t.email})) and char_length(${t.email}) between 3 and 254`),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
