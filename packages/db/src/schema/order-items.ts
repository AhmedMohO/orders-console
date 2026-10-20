import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { orders } from "./orders.js";

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
}, (t) => [
  unique("order_items_order_position_unique").on(t.orderId, t.position),
  check("order_items_position_check", sql`${t.position} between 0 and 4`),
  check("order_items_description_check", sql`${t.description} = btrim(${t.description}) and char_length(${t.description}) between 1 and 200`),
  check("order_items_quantity_check", sql`${t.quantity} between 1 and 999`),
  check("order_items_price_check", sql`${t.unitPriceCents} between 1 and 10000000`),
]);

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
