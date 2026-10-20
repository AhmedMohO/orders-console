import { sql } from "drizzle-orm";
import { createDb, type Database } from "../src/client.js";

export async function checkDatabase(db: Database, minimumOrders = 50000) {
  const [counts] = (await db.execute<{ orders: number; items: number; sessions: number }>(sql`
    select (select count(*)::int from orders) as orders,
      (select count(*)::int from order_items) as items,
      (select count(*)::int from sessions) as sessions`)).rows;
  if (counts.orders < minimumOrders) throw new Error(`Expected at least ${minimumOrders} orders, found ${counts.orders}`);
  const [invalid] = (await db.execute<{ items: number; totals: number; statuses: number; roles: number; receipts: number }>(sql`
    with amounts as (
      select o.id, o.total_cents, count(i.id) as item_count,
        coalesce(sum(i.quantity::bigint * i.unit_price_cents), 0) as amount
      from orders o left join order_items i on i.order_id = o.id group by o.id
    ) select
      (select count(*)::int from amounts where item_count not between 1 and 5) as items,
      (select count(*)::int from amounts where total_cents <> amount) as totals,
      (select count(*)::int from orders where status not in ('pending','processing','completed','cancelled')) as statuses,
      (select count(*)::int from users where role not in ('admin','agent')) as roles,
      (select count(*)::int from (select creator_id,key from idempotency_requests group by creator_id,key having count(*) > 1) duplicates) as receipts`)).rows;
  for (const [rule, failures] of Object.entries(invalid)) {
    if (failures) throw new Error(`Invalid ${rule}: ${failures}`);
  }
  const staff = (await db.execute<{ role: string }>(sql`select distinct role from users where password_hash like '$argon2id$%'`)).rows;
  if (!staff.some((u) => u.role === "admin") || !staff.some((u) => u.role === "agent")) throw new Error("Missing hashed admin/agent credentials");
  const indexes = (await db.execute<{ indexname: string }>(sql`select indexname from pg_indexes where schemaname = 'public'`)).rows.map((row) => row.indexname);
  for (const index of ["users_email_unique", "sessions_pkey", "sessions_user_expires_idx", "idempotency_requests_creator_key_unique", "order_items_order_position_unique", "orders_created_at_id_idx", "orders_total_cents_id_idx", "orders_status_created_at_id_idx", "orders_status_total_cents_id_idx", "orders_customer_name_trgm_idx", "orders_customer_email_trgm_idx"]) {
    if (!indexes.includes(index)) throw new Error(`Missing index: ${index}`);
  }
  return { ...counts, indexes: indexes.length };
}

if (import.meta.main) {
  const db = createDb(process.env.DATABASE_URL);
  try {
    console.log(await checkDatabase(db));
  } catch (error) {
    console.error(error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Database checks failed");
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
