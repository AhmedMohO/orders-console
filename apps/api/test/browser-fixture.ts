import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { openTestDatabase } from '@repo/db/test/database.js';
import {
  eq,
  idempotencyRequests,
  orderItems,
  orders,
  users,
  type User,
} from '@repo/db';

const mode = process.argv[2];
assert(
  mode === 'prepare' || mode === 'clean',
  'Use browser-fixture.ts prepare|clean',
);
const file = new URL('../../../.phase6-fixture.log', import.meta.url);
const db = await openTestDatabase();
try {
  if (mode === 'clean') {
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as {
      adminId: number;
      agentId: number;
      adminEmail: string;
      agentEmail: string;
    };
    await db.transaction(async (tx) => {
      for (const [id, email] of [
        [fixture.adminId, fixture.adminEmail],
        [fixture.agentId, fixture.agentEmail],
      ] as const) {
        assert(
          Number.isInteger(id) &&
            typeof email === 'string' &&
            /^phase6-(admin|agent)-/.test(email),
          'Invalid browser fixture owner',
        );
        const [account] = await tx.select().from(users).where(eq(users.id, id));
        if (!account) continue;
        assert(
          account.email === email,
          'Refusing to clean a different staff account',
        );
        await tx.delete(orders).where(eq(orders.creatorId, id));
        await tx
          .delete(idempotencyRequests)
          .where(eq(idempotencyRequests.creatorId, id));
        await tx.delete(users).where(eq(users.id, id));
      }
    });
    unlinkSync(file);
    console.log(
      'Removed only the browser fixture staff, orders, items, sessions and receipts',
    );
  } else {
    assert(
      !existsSync(file),
      'Clean the previous browser fixture before preparing another',
    );
    const password = 'Phase6Demo123!';
    const hash = await Bun.password.hash(password, { algorithm: 'argon2id' });
    const fixture = await db.transaction(async (tx) => {
      const accounts: User[] = [];
      for (const role of ['admin', 'agent'] as const) {
        const [account] = await tx
          .insert(users)
          .values({
            name: `Browser ${role}`,
            email: `phase6-${role}-${crypto.randomUUID()}@example.com`,
            role,
            passwordHash: hash,
          })
          .returning();
        accounts.push(account);
      }
      const rows = await tx
        .insert(orders)
        .values(
          Array.from({ length: 61 }, (_, i) => ({
            creatorId: accounts[0].id,
            customerName: `Browser Customer ${String(i + 1).padStart(2, '0')}`,
            customerEmail: `browser-${i + 1}@example.com`,
            status: (
              ['pending', 'processing', 'completed', 'cancelled'] as const
            )[i % 4],
            totalCents: (i + 1) * 100,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
          })),
        )
        .returning();
      assert.equal(rows.length, 61);
      await tx
        .insert(orderItems)
        .values(
          rows.map((row) => ({
            orderId: row.id,
            position: 0,
            description: 'Browser fixture item',
            quantity: 1,
            unitPriceCents: row.totalCents,
          })),
        );
      return {
        adminEmail: accounts[0].email,
        agentEmail: accounts[1].email,
        adminId: accounts[0].id,
        agentId: accounts[1].id,
        password,
      };
    });
    writeFileSync(file, JSON.stringify(fixture));
    console.log(
      'Created isolated browser fixture: 2 staff, 61 orders, 61 items',
    );
  }
} finally {
  await db.$client.end();
}
