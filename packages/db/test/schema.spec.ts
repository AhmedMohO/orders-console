import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Database } from "../src/client.js";
import { openTestDatabase } from "./database.js";
import { orders } from "../src/schema/index.js";

let db: Database;
beforeAll(async () => { db = await openTestDatabase(); });
afterAll(async () => { await db?.$client.end(); });

test("migrations supply all five resource tables", async () => {
  const result = await db.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
  expect(result.rows.map((row) => row.table_name)).toEqual(["idempotency_requests", "order_items", "orders", "sessions", "users"]);
});

test("database rejects invalid roles, amounts, statuses, items, and duplicate receipt scopes", async () => {
  await db.transaction(async (tx) => {
    const [{ id }] = (await tx.execute<{ id: number }>(sql`insert into users (name,email) values ('Fixture','schema-fixture@example.com') returning id`)).rows;
    const reject = async (query: ReturnType<typeof sql>) => {
      await tx.execute(sql`savepoint invalid_input`);
      try {
        await expect(tx.execute(query).execute()).rejects.toThrow();
      } finally {
        await tx.execute(sql`rollback to savepoint invalid_input`);
      }
    };
    await reject(sql`update users set role = 'customer' where id = ${id}`);
    await reject(sql`update users set email = ' NOT-NORMALIZED@example.com ' where id = ${id}`);
    for (const [status, amount] of [["unknown", 100], ["pending", 0], ["pending", 2000000001]] as const) {
      await reject(sql`insert into orders (creator_id,customer_name,customer_email,status,total_cents) values (${id},'Customer','customer@example.com',${status},${amount})`);
    }
    const [order] = (await tx.execute<{ id: number }>(sql`insert into orders (creator_id,customer_name,customer_email,total_cents) values (${id},'Customer','customer@example.com',100) returning id`)).rows;
    for (const [position, quantity, price, description] of [[5, 1, 100, "Item"], [0, 0, 100, "Item"], [0, 1, 10000001, "Item"], [0, 1, 100, " "]] as const) {
      await reject(sql`insert into order_items (order_id,position,description,quantity,unit_price_cents) values (${order.id},${position},${description},${quantity},${price})`);
    }
    await tx.execute(sql`insert into order_items (order_id,position,description,quantity,unit_price_cents) values (${order.id},0,'Item',1,100)`);
    await reject(sql`insert into order_items (order_id,position,description,quantity,unit_price_cents) values (${order.id},0,'Item',1,100)`);
    await tx.execute(sql`insert into idempotency_requests (creator_id,key) values (${id},'fixture-key')`);
    await reject(sql`insert into idempotency_requests (creator_id,key) values (${id},'fixture-key')`);
    await reject(sql`insert into idempotency_requests (creator_id,key,response_body) values (${id},'partial-response','{}'::jsonb)`);
    await reject(sql`delete from users where id = ${id}`);
    await tx.execute(sql`delete from orders where id = ${order.id}`);
    expect((await tx.execute(sql`select 1 from order_items where order_id = ${order.id}`)).rows).toHaveLength(0);
    expect((await tx.execute(sql`select 1 from idempotency_requests where creator_id = ${id}`)).rows).toHaveLength(1);
    await tx.execute(sql`delete from idempotency_requests where creator_id = ${id}`);
    await tx.execute(sql`delete from users where id = ${id}`);
  });
});

test("timestamps round-trip at millisecond precision and sessions follow their staff account", async () => {
  await db.transaction(async (tx) => {
    const [{ id }] = (await tx.execute<{ id: number }>(sql`insert into users (name,email) values ('Fixture','session-fixture@example.com') returning id`)).rows;
    const sid = crypto.randomUUID();
    await tx.execute(sql`insert into sessions (id,user_id,expires_at) values (${sid},${id},now() + interval '15 minutes')`);
    const [row] = await tx.insert(orders).values({
      creatorId: id, customerName: "Customer", customerEmail: "customer@example.com", totalCents: 100,
      createdAt: sql`'2026-10-19T12:34:56.123456Z'::timestamptz`,
    }).returning();
    expect(row.createdAt.toISOString()).toBe("2026-10-19T12:34:56.123Z");
    expect((await tx.execute(sql`select 1 from orders where id = ${row.id} and created_at = ${row.createdAt.toISOString()}::timestamptz`)).rows).toHaveLength(1);
    await tx.execute(sql`delete from orders where id = ${row.id}`);
    await tx.execute(sql`delete from users where id = ${id}`);
    expect((await tx.execute(sql`select 1 from sessions where id = ${sid}`)).rows).toHaveLength(0);
  });
});
