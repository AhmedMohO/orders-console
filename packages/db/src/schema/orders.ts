import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { orderStatuses } from "@repo/contracts/orders";
import { users } from "./users.js";

export const orders = pgTable("orders", {
    id: serial("id").primaryKey(),
    creatorId: integer("creator_id")
        .notNull()
        .references(() => users.id, { onDelete: "restrict" }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    status: text("status", { enum: orderStatuses }).notNull().default("pending"),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, (t) => [
    check("orders_status_check", sql`${t.status} in ('pending', 'processing', 'completed', 'cancelled')`),
    check("orders_total_check", sql`${t.totalCents} between 1 and 2000000000`),
    check("orders_customer_name_check", sql`${t.customerName} = btrim(${t.customerName}) and char_length(${t.customerName}) between 1 and 100`),
    check("orders_customer_email_check", sql`${t.customerEmail} = lower(btrim(${t.customerEmail})) and char_length(${t.customerEmail}) between 3 and 254`),
    index("orders_created_at_id_idx").on(t.createdAt, t.id),
    index("orders_total_cents_id_idx").on(t.totalCents, t.id),
    index("orders_status_created_at_id_idx").on(t.status, t.createdAt, t.id),
    index("orders_status_total_cents_id_idx").on(t.status, t.totalCents, t.id),
    index("orders_customer_name_trgm_idx").using("gin", t.customerName.op("gin_trgm_ops")),
    index("orders_customer_email_trgm_idx").using("gin", t.customerEmail.op("gin_trgm_ops")),
]);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
