import 'reflect-metadata';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import {
  and,
  eq,
  idempotencyRequests,
  orderItems,
  orders,
  sql,
  users,
  type Database,
  type User,
} from '@repo/db';
import { openTestDatabase } from '@repo/db/test/database.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DB } from '../src/common/consts/tokens.js';

const origin = 'http://localhost:2001';
const savedEnv = { ...process.env };
const password = 'phase-four-fixture-password';
const payload = {
  customerName: ' Customer ',
  customerEmail: ' CUSTOMER@Example.com ',
  items: [
    { description: ' First ', quantity: 2, unitPriceCents: 125 },
    { description: 'Second', quantity: 1, unitPriceCents: 50 },
  ],
  totalCents: 300,
};
let db: Database;
let app: INestApplication;
let staff: User[] = [];
let cookies: string[] = [];
const apps: INestApplication[] = [];

async function makeApp(dropResponse = false) {
  const connection = await openTestDatabase();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(connection)
    .compile();
  const instance = module.createNestApplication({
    bodyParser: false,
    logger: false,
  });
  configureApp(instance);
  if (dropResponse) {
    instance.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/api/orders') {
        res.end = (() => {
          res.destroy();
          return res;
        }) as Response['end'];
      }
      next();
    });
  }
  await instance.init();
  apps.push(instance);
  return instance;
}

function create(
  key: string = crypto.randomUUID(),
  input: unknown = payload,
  instance = app,
  cookie = cookies[0],
) {
  const call = request(instance.getHttpServer())
    .post('/api/orders')
    .set('Origin', origin)
    .set('Cookie', cookie);
  return call.set('Idempotency-Key', key).send(input as object);
}

async function counts(creatorId = staff[0].id) {
  return {
    orders: (
      await db.select().from(orders).where(eq(orders.creatorId, creatorId))
    ).length,
    receipts: (
      await db
        .select()
        .from(idempotencyRequests)
        .where(eq(idempotencyRequests.creatorId, creatorId))
    ).length,
  };
}

beforeAll(async () => {
  db = await openTestDatabase();
  Object.assign(
    process.env,
    parseEnv(
      readFileSync(new URL('../../../.env.test', import.meta.url), 'utf8'),
    ),
  );
  const hash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  for (const role of ['admin', 'agent'] as const) {
    const [user] = await db
      .insert(users)
      .values({
        name: 'Creation fixture',
        email: crypto.randomUUID() + '@example.com',
        role,
        passwordHash: hash,
      })
      .returning();
    staff.push(user);
  }
  app = await makeApp();
  for (const user of staff) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password })
      .expect(200);
    cookies.push(
      (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    );
  }
});

afterAll(async () => {
  try {
    await Promise.all(apps.map((instance) => instance.close()));
    if (db)
      for (const user of staff) {
        await db.delete(orders).where(eq(orders.creatorId, user.id));
        await db
          .delete(idempotencyRequests)
          .where(eq(idempotencyRequests.creatorId, user.id));
        await db.delete(users).where(eq(users.id, user.id));
      }
  } finally {
    await db?.$client.end();
    process.env = savedEnv;
  }
});

test('idempotency parallel create returns one order', async () => {
  const key = crypto.randomUUID();
  const before = await counts();
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => create(key)),
  );
  const first = responses[0];
  expect(responses.map(({ status }) => status)).toEqual(Array(10).fill(201));
  for (const response of responses) expect(response.body).toEqual(first.body);
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, first.body.id));
  expect(rows).toHaveLength(1);
  expect(await counts()).toEqual({
    orders: before.orders + 1,
    receipts: before.receipts + 1,
  });
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, first.body.id))
    .orderBy(orderItems.position);
  expect(items).toHaveLength(2);
  expect(
    items.map(({ position, description, quantity, unitPriceCents }) => ({
      position,
      description,
      quantity,
      unitPriceCents,
    })),
  ).toEqual([
    { position: 0, description: 'First', quantity: 2, unitPriceCents: 125 },
    { position: 1, description: 'Second', quantity: 1, unitPriceCents: 50 },
  ]);
  expect(first.body).toEqual({
    id: rows[0].id,
    creatorId: staff[0].id,
    customerName: 'Customer',
    customerEmail: 'customer@example.com',
    status: 'pending',
    totalCents: 300,
    createdAt: rows[0].createdAt.toISOString(),
    items: items.map(
      ({ id, position, description, quantity, unitPriceCents }) => ({
        id,
        position,
        description,
        quantity,
        unitPriceCents,
      }),
    ),
  });
  const receipts = await db
    .select()
    .from(idempotencyRequests)
    .where(
      and(
        eq(idempotencyRequests.creatorId, staff[0].id),
        eq(idempotencyRequests.key, key),
      ),
    );
  expect(receipts).toHaveLength(1);
  expect(receipts[0].responseStatus).toBe(201);
  expect(receipts[0].responseBody).toEqual(first.body);
  expect(first.headers['cache-control']).toBe('no-store');
  console.info(
    `Idempotency proof: staff ${staff[0].id}; key ${key}\n` +
    `HTTP statuses: ${responses.map(({ status }) => status).join(', ')}\n` +
    `Order IDs: ${responses.map(({ body }) => body.id).join(', ')}\n` +
    `SQL order count ${rows.length}; items ${items.length}; receipts ${receipts.length}; stored status ${receipts[0].responseStatus}; stored response matches all 10 HTTP bodies`,
  );
});

test('idempotency keys allow deliberate identical orders and isolate staff', async () => {
  const key = crypto.randomUUID();
  const a = await create(key).expect(201);
  const b = await create(crypto.randomUUID()).expect(201);
  const c = await create(key, payload, app, cookies[1]).expect(201);
  expect(new Set([a.body.id, b.body.id, c.body.id]).size).toBe(3);
  expect(c.body.creatorId).toBe(staff[1].id);
  const replay = await create(key, {
    ...payload,
    customerName: 'Different valid input',
  }).expect(201);
  expect(replay.body).toEqual(a.body);
  console.info(
    `Key/staff scope: original ${a.body.id}; new key ${b.body.id}; other staff ${c.body.id}; same-key replay ${replay.body.id}`,
  );
});

test('idempotency replays after a lost response, app restart, and order deletion', async () => {
  const key = crypto.randomUUID();
  const before = await counts();
  const dropped = await makeApp(true);
  const disconnected = await create(key, payload, dropped).then(
    () => false,
    () => true,
  );
  expect(disconnected).toBe(true);
  expect(await counts()).toEqual({
    orders: before.orders + 1,
    receipts: before.receipts + 1,
  });
  const first = await create(key).expect(201);
  await dropped.close();
  apps.splice(apps.indexOf(dropped), 1);
  const restarted = await makeApp();
  expect((await create(key, payload, restarted).expect(201)).body).toEqual(
    first.body,
  );
  expect(await counts()).toEqual({
    orders: before.orders + 1,
    receipts: before.receipts + 1,
  });
  await db.delete(orders).where(eq(orders.id, first.body.id));
  expect((await create(key, payload, restarted).expect(201)).body).toEqual(
    first.body,
  );
  expect(await counts()).toEqual({
    orders: before.orders,
    receipts: before.receipts + 1,
  });
  console.info(
    `Lost response/restart/deletion: replayed order ${first.body.id}; SQL order count restored to ${before.orders}; receipt delta 1; no replacement order`,
  );
});

test('idempotency item SQL failure rolls back order and receipt, and the same key can retry', async () => {
  const key = crypto.randomUUID();
  const before = await counts();
  // Scoped to this random marker; other tests and ordinary inserts are unaffected.
  const name = sql.identifier('fail_items_' + key.replaceAll('-', ''));
  await db.execute(
    sql`create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'forced item failure'; end $$`,
  );
  try {
    await db.execute(
      sql`create trigger ${name} before insert on order_items for each row when (new.description = ${sql.raw("'" + key + "'")}) execute function ${name}()`,
    );
    try {
      const failed = await create(key, {
        ...payload,
        items: [{ description: key, quantity: 1, unitPriceCents: 300 }],
      }).expect(503);
      expect(JSON.stringify(failed.body)).not.toMatch(
        /forced item failure|insert into|postgres/i,
      );
      expect(await counts()).toEqual(before);
    } finally {
      await db.execute(sql`drop trigger ${name} on order_items`);
    }
  } finally {
    await db.execute(sql`drop function ${name}()`);
  }
  await create(key).expect(201);
  expect(await counts()).toEqual({
    orders: before.orders + 1,
    receipts: before.receipts + 1,
  });
  console.info(
    'Rollback: forced item failure returned 503 with zero new orders/receipts; same-key retry returned 201 with one new order/receipt',
  );
});

const invalidBodies: [string, unknown][] = [
  ['null body', null],
  ['array body', []],
  ['empty body', {}],
  ['blank name', { ...payload, customerName: ' \t ' }],
  ['long name', { ...payload, customerName: 'x'.repeat(101) }],
  ['non-string name', { ...payload, customerName: 42 }],
  ['invalid email', { ...payload, customerEmail: 'broken' }],
  ['long email', { ...payload, customerEmail: 'x'.repeat(250) + '@a.com' }],
  [
    'missing items',
    { customerName: 'A', customerEmail: 'a@b.com', totalCents: 1 },
  ],
  ['empty items', { ...payload, items: [] }],
  [
    'six items',
    { ...payload, items: Array(6).fill(payload.items[0]), totalCents: 1500 },
  ],
  ['non-array items', { ...payload, items: {} }],
  ['null item', { ...payload, items: [null] }],
  [
    'blank description',
    { ...payload, items: [{ ...payload.items[0], description: ' ' }] },
  ],
  [
    'long description',
    {
      ...payload,
      items: [{ ...payload.items[0], description: 'x'.repeat(201) }],
    },
  ],
  [
    'nested unknown field',
    { ...payload, items: [{ ...payload.items[0], orderId: 1 }] },
  ],
  ...['creatorId', 'status', 'createdAt', 'role', 'extra'].map(
    (field): [string, unknown] => [
      'forbidden ' + field,
      { ...payload, [field]: 1 },
    ],
  ),
  ...[0, -1, 0.5, '1', null, 1000, Number.MAX_SAFE_INTEGER + 1].map(
    (quantity): [string, unknown] => [
      'quantity ' + quantity,
      {
        ...payload,
        items: [{ description: 'Item', quantity, unitPriceCents: 1 }],
        totalCents: 1,
      },
    ],
  ),
  ...[0, -1, 0.5, '1', null, 10000001, 1e100].map(
    (unitPriceCents): [string, unknown] => [
      'price ' + unitPriceCents,
      {
        ...payload,
        items: [{ description: 'Item', quantity: 1, unitPriceCents }],
        totalCents: 1,
      },
    ],
  ),
  ...[0, -1, 0.5, '300', null, 2000000001, 299].map(
    (totalCents): [string, unknown] => [
      'total ' + totalCents,
      { ...payload, totalCents },
    ],
  ),
  [
    'sum over limit',
    {
      ...payload,
      items: [{ description: 'Item', quantity: 999, unitPriceCents: 10000000 }],
      totalCents: 1,
    },
  ],
];

test.each(invalidBodies)(
  'rejects %s before any writes',
  async (_name, input) => {
    const before = await counts();
    await create(crypto.randomUUID(), input).expect(400);
    expect(await counts()).toEqual(before);
  },
);

test.each([
  ['missing', null],
  ['empty', ''],
  ['oversized', 'x'.repeat(129)],
  ['control', 'a\tb'],
  ['non-ASCII', 'café'],
  ['repeated', ['one', 'two']],
] as const)('rejects %s request key before any writes', async (_name, key) => {
  const before = await counts();
  const call = request(app.getHttpServer())
    .post('/api/orders')
    .set('Origin', origin)
    .set('Cookie', cookies[0]);
  if (key !== null)
    call.set({ 'Idempotency-Key': typeof key === 'string' ? key : [...key] });
  await call.send(payload).expect(400);
  expect(await counts()).toEqual(before);
});

test('accepts one/five items and exact money/key limits', async () => {
  for (const items of [
    [{ description: 'Small', quantity: 1, unitPriceCents: 1 }],
    Array.from({ length: 5 }, () => ({
      description: 'x'.repeat(200),
      quantity: 40,
      unitPriceCents: 10000000,
    })),
    [{ description: 'Quantity limit', quantity: 999, unitPriceCents: 1 }],
  ]) {
    const totalCents = items.reduce(
      (total, item) => total + item.quantity * item.unitPriceCents,
      0,
    );
    const response = await create(crypto.randomUUID().padEnd(128, '~'), {
      ...payload,
      customerName: 'x'.repeat(100),
      items,
      totalCents,
    }).expect(201);
    expect(response.body.totalCents).toBe(totalCents);
    expect(response.body.items).toHaveLength(items.length);
  }
});

test('real order route enforces authentication, Origin, size, and logout revocation', async () => {
  const before = await counts();
  await request(app.getHttpServer())
    .post('/api/orders')
    .set('Origin', origin)
    .send(payload)
    .expect(401);
  for (const hostile of [undefined, 'null', 'https://hostile.example']) {
    const call = request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', cookies[0]);
    if (hostile) call.set('Origin', hostile);
    await call.send(payload).expect(403);
  }
  await create(crypto.randomUUID(), {
    ...payload,
    customerName: 'x'.repeat(33000),
  }).expect(413);
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: staff[0].email, password })
    .expect(200);
  const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(
    ';',
  )[0];
  await request(app.getHttpServer())
    .post('/api/auth/logout')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .expect(204);
  const second = await makeApp();
  await create(crypto.randomUUID(), payload, app, cookie).expect(401);
  await create(crypto.randomUUID(), payload, second, cookie).expect(401);
  expect(await counts()).toEqual(before);
});
