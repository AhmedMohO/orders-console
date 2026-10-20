import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { orderStatuses } from "@repo/contracts/orders";
import { createDb, type Database } from "../src/client.js";
import { idempotencyRequests, orderItems, orders, users, type NewOrder, type NewOrderItem } from "../src/schema/index.js";

export interface SeedOptions { count: number; batchSize: number; seed: number }

export function parseSeedOptions(args: string[]): SeedOptions {
  const { values, tokens } = parseArgs({
    args, tokens: true, options: {
      count: { type: "string" }, "batch-size": { type: "string" }, seed: { type: "string" },
    }
  });
  const names = tokens.filter((token) => token.kind === "option").map((token) => token.name);
  if (new Set(names).size !== names.length) throw new Error("Duplicate seed flags");
  const integer = (value: string, name: string, min: number, max: number) => {
    const n = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) {
      throw new Error(`${name} must be an integer from ${min} to ${max}`);
    }
    return n;
  };
  return {
    count: integer(values.count ?? "50000", "count", 1, 1000000),
    batchSize: integer(values["batch-size"] ?? "1000", "batch-size", 1, 1000),
    seed: integer(values.seed ?? "42", "seed", 0, 4294967295),
  };
}

// Public demo credentials only; never overwrite an existing account to make these work.
export const demoAccounts = [
  { name: "Demo Admin", email: "admin@example.com", role: "admin", password: "AdminDemo123!" },
  { name: "Demo Agent", email: "agent@example.com", role: "agent", password: "AgentDemo123!" },
] as const;

export async function seed(db: Database, options: SeedOptions) {
  const { count, batchSize, seed: seedNumber } = options;
  parseSeedOptions(["--count", String(count), "--batch-size", String(batchSize), "--seed", String(seedNumber)]);
  const key = `seed-v1:${seedNumber}`;
  const credentials = await Promise.all(demoAccounts.map(async ({ password, ...account }) => ({
    ...account, passwordHash: await Bun.password.hash(password, { algorithm: "argon2id" }),
  })));

  return db.transaction(async (tx) => {
    const staff = [];
    for (const account of credentials) {
      await tx.insert(users).values(account).onConflictDoNothing({ target: users.email });
      const [existing] = await tx.select().from(users).where(eq(users.email, account.email));
      if (existing.role !== account.role || !existing.passwordHash ||
        !await Bun.password.verify(demoAccounts.find((demo) => demo.email === account.email)!.password, existing.passwordHash)) {
        throw new Error(`Seed account conflict for ${account.email}; existing credentials/role were preserved`);
      }
      staff.push(existing);
    }
    const creatorId = staff[0].id;
    const claimed = await tx.insert(idempotencyRequests).values({ creatorId, key })
      .onConflictDoNothing({ target: [idempotencyRequests.creatorId, idempotencyRequests.key] }).returning({ id: idempotencyRequests.id });
    if (!claimed.length) {
      const [receipt] = await tx.select().from(idempotencyRequests).where(and(eq(idempotencyRequests.creatorId, creatorId), eq(idempotencyRequests.key, key)));
      if (receipt.responseStatus !== 200) throw new Error("Seed receipt is incomplete");
      return { skipped: true };
    }

    let state = seedNumber >>> 0;
    const random = (max: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % max;
    };
    let itemCount = 0;
    for (let start = 0; start < count; start += batchSize) {
      const drafts: { order: NewOrder; items: Omit<NewOrderItem, "orderId">[] }[] = [];
      for (let n = start; n < Math.min(start + batchSize, count); n++) {
        const items = Array.from({ length: 1 + random(5) }, (_, position) => ({
          position, description: `Sample item ${1 + random(50)}`, quantity: 1 + random(10), unitPriceCents: 100 + random(10000),
        }));
        drafts.push({
          items, order: {
            creatorId: staff[n % staff.length].id,
            customerName: `Customer ${String(n + 1).padStart(6, "0")}`,
            customerEmail: `seed-v1.${seedNumber}.${n}@example.com`,
            status: orderStatuses[n % orderStatuses.length],
            totalCents: items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
            createdAt: new Date(Date.UTC(2026, 0, 1) + n * 1000),
          }
        });
      }
      const inserted = await tx.insert(orders).values(drafts.map((draft) => draft.order))
        .returning({ id: orders.id, email: orders.customerEmail });
      const ids = new Map(inserted.map((row) => [row.email, row.id]));
      const items = drafts.flatMap((draft) => {
        const orderId = ids.get(draft.order.customerEmail);
        if (orderId === undefined) throw new Error("Seed order mapping failed");
        return draft.items.map((item) => ({ ...item, orderId }));
      });
      await tx.insert(orderItems).values(items);
      itemCount += items.length;
    }
    await tx.update(idempotencyRequests).set({ responseStatus: 200, responseBody: { count, items: itemCount, seed: seedNumber } })
      .where(eq(idempotencyRequests.id, claimed[0].id));
    return { skipped: false, count, items: itemCount };
  });
}

if (import.meta.main) {
  const options = parseSeedOptions(process.argv.slice(2));
  const db = createDb(process.env.DATABASE_URL);
  try {
    console.log(await seed(db, options));
  } catch (error) {
    // Database errors can contain SQL parameters; omit private row data.
    console.error(error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Seed failed; transaction rolled back");
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
