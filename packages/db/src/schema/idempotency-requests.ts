import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const idempotencyRequests = pgTable("idempotency_requests", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  key: text("key").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body").$type<unknown>(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, (t) => [
  unique("idempotency_requests_creator_key_unique").on(t.creatorId, t.key),
  check("idempotency_requests_key_check", sql`${t.key} ~ '^[ -~]{1,128}$'`),
  check("idempotency_requests_response_check", sql`(${t.responseStatus} is null and ${t.responseBody} is null) or (${t.responseStatus} is not null and ${t.responseStatus} between 200 and 299 and ${t.responseBody} is not null)`),
]);

export type IdempotencyRequest = typeof idempotencyRequests.$inferSelect;
export type NewIdempotencyRequest = typeof idempotencyRequests.$inferInsert;
