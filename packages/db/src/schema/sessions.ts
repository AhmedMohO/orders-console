import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
}, (t) => [index("sessions_user_expires_idx").on(t.userId, t.expiresAt)]);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
