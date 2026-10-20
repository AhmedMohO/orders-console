import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { Database } from "../src/client.js";
import { demoAccounts, parseSeedOptions, seed } from "../scripts/seed.js";
import { checkDatabase } from "../scripts/check.js";
import { openTestDatabase } from "./database.js";

test("seed flags reject ambiguous or unbounded input before writes", () => {
  expect(parseSeedOptions([])).toEqual({ count: 50000, batchSize: 1000, seed: 42 });
  for (const args of [["--count", "0"], ["--count", "1.5"], ["--count", "1000001"], ["--batch-size", "1001"], ["--seed", "-1"], ["--count"], ["--wipe"], ["--count", "2", "--count", "3"]]) {
    expect(() => parseSeedOptions(args)).toThrow();
  }
});

let db: Database;
beforeAll(async () => { db = await openTestDatabase(); });
afterAll(async () => { await db?.$client.end(); });

test("seed is atomic, concurrent reruns skip, conflicts roll back, and data checks find corruption", async () => {
  // The connection is verified as a separate _test database before fixture cleanup.
  await db.execute(sql`delete from idempotency_requests`);
  await db.execute(sql`delete from orders`);
  await db.execute(sql`delete from users where email in ('admin@example.com', 'agent@example.com')`);
  try {
    await db.execute(sql`insert into users (name,email,role) values ('Existing','admin@example.com','agent')`);
    await expect(seed(db, { count: 12, batchSize: 4, seed: 42 })).rejects.toThrow("conflict");
    expect((await db.execute(sql`select 1 from orders`)).rows).toHaveLength(0);
    await db.execute(sql`delete from users where email = 'admin@example.com'`);

    await db.execute(sql`create function pg_temp.fail_seed_item() returns trigger language plpgsql as $$ begin raise exception 'simulated interrupted seed'; end $$`);
    await db.execute(sql`create trigger fail_seed_item before insert on order_items for each row execute function pg_temp.fail_seed_item()`);
    try {
      await expect(seed(db, { count: 12, batchSize: 4, seed: 42 })).rejects.toThrow();
      expect((await db.execute(sql`select 1 from orders`)).rows).toHaveLength(0);
      expect((await db.execute(sql`select 1 from idempotency_requests`)).rows).toHaveLength(0);
      expect((await db.execute(sql`select 1 from users where email in ('admin@example.com','agent@example.com')`)).rows).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger fail_seed_item on order_items`);
    }

    const results = await Promise.all([seed(db, { count: 12, batchSize: 4, seed: 42 }), seed(db, { count: 12, batchSize: 3, seed: 42 })]);
    expect(results.map((r) => r.skipped).sort()).toEqual([false, true]);
    expect((await db.execute(sql`select 1 from orders`)).rows).toHaveLength(12);
    const report = await checkDatabase(db, 12);
    expect(report.orders).toBe(12);
    expect(report.items).toBeGreaterThanOrEqual(12);
    expect(report.items).toBeLessThanOrEqual(60);
    expect(report.sessions).toBe(0);
    const staff = (await db.execute<{ id: number; email: string; password_hash: string }>(sql`select id,email,password_hash from users where password_hash is not null order by email`)).rows;
    for (const account of demoAccounts) {
      expect(await Bun.password.verify(account.password, staff.find((row) => row.email === account.email)!.password_hash)).toBe(true);
    }
    await expect(seed(db, { count: 13, batchSize: 4, seed: 42 })).resolves.toEqual({ skipped: true });
    expect((await db.execute(sql`select 1 from orders`)).rows).toHaveLength(12);

    const sid = crypto.randomUUID();
    await db.execute(sql`insert into sessions (id,user_id,expires_at) values (${sid},${staff[0].id},now() + interval '15 minutes')`);
    const [manual] = (await db.execute<{ id: number }>(sql`insert into orders (creator_id,customer_name,customer_email,total_cents) values (${staff[0].id},'Manual order','manual@example.com',100) returning id`)).rows;
    await db.execute(sql`insert into order_items (order_id,position,description,quantity,unit_price_cents) values (${manual.id},0,'Manual item',1,100)`);
    await seed(db, { count: 12, batchSize: 2, seed: 42 });
    expect((await db.execute(sql`select 1 from orders where id = ${manual.id}`)).rows).toHaveLength(1);
    expect((await db.execute(sql`select 1 from sessions where id = ${sid}`)).rows).toHaveLength(1);
    expect((await db.execute(sql`select id,email,password_hash from users where password_hash is not null order by email`)).rows).toEqual(staff);

    const dataset = sql`select customer_name,customer_email,status,total_cents,created_at,
      (select jsonb_agg(jsonb_build_array(i.position,i.description,i.quantity,i.unit_price_cents) order by i.position) from order_items i where i.order_id = o.id) as items
      from orders o where customer_email like 'seed-v1.42.%' order by customer_email`;
    const first = (await db.execute(dataset)).rows;
    await db.execute(sql`delete from orders where customer_email like 'seed-v1.42.%'`);
    await db.execute(sql`delete from idempotency_requests where key = 'seed-v1:42'`);
    await seed(db, { count: 12, batchSize: 5, seed: 42 });
    expect((await db.execute(dataset)).rows).toEqual(first);

    const [order] = (await db.execute<{ id: number }>(sql`select id from orders where customer_email like 'seed-v1.42.%' order by id limit 1`)).rows;
    await db.execute(sql`update orders set total_cents = total_cents + 1 where id = ${order.id}`);
    await expect(checkDatabase(db, 12)).rejects.toThrow("totals");
    await db.execute(sql`update orders set total_cents = total_cents - 1 where id = ${order.id}`);
    await db.execute(sql`delete from order_items where order_id = ${order.id}`);
    await expect(checkDatabase(db, 12)).rejects.toThrow("items");
  } finally {
    await db.execute(sql`delete from idempotency_requests`);
    await db.execute(sql`delete from orders`);
    await db.execute(sql`delete from sessions where user_id in (select id from users where email in ('admin@example.com', 'agent@example.com'))`);
    await db.execute(sql`delete from users where email in ('admin@example.com', 'agent@example.com')`);
  }
}, 30000);
