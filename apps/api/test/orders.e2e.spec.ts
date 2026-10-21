import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { rejects } from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import {
  and,
  asc,
  desc,
  eq,
  idempotencyRequests,
  orderItems,
  orders,
  sql,
  users,
  type Database,
  type User,
  type Order,
} from '@repo/db';
import { openTestDatabase } from '@repo/db/test/database.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DB } from '../src/common/consts/tokens.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { ListOrdersDto } from '../src/orders/dto/list-orders.dto.js';

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

describe('phase 5 list and deletion', () => {
  const marker = crypto.randomUUID();
  let fixture: Order[];
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const list = (query: Record<string, unknown> = {}, cookie = cookies[1]) =>
    request(app.getHttpServer())
      .get('/api/orders')
      .set('Cookie', cookie)
      .query(query);
  const remove = (id: number | string, cookie = cookies[0]) =>
    request(app.getHttpServer())
      .delete('/api/orders/' + id)
      .set('Cookie', cookie)
      .set('Origin', origin);

  beforeAll(async () => {
    fixture = await db
      .insert(orders)
      .values(
        Array.from({ length: 67 }, (_, i) => ({
          creatorId: staff[i % 2].id,
          customerName: `${marker} ${i === 0 ? "Élodie O'Brien %_\\" : 'Customer ' + i}`,
          customerEmail: `${marker}-${i}@example.com`,
          status: (i % 2 ? 'pending' : 'completed') as 'pending' | 'completed',
          totalCents:
            i === 66 ? 2000000000 : i === 0 ? 1 : Math.ceil(i / 4) * 100,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, Math.floor(i / 4))),
        })),
      )
      .returning();
  });

  test('list defaults are bounded, authenticated, shared by both roles and contain only summary fields', async () => {
    await request(app.getHttpServer()).get('/api/orders').expect(401);
    const agent = await list({ search: marker }).expect(200);
    const admin = await list({ search: marker }, cookies[0]).expect(200);
    expect(admin.body).toEqual(agent.body);
    expect(agent.body.items).toHaveLength(50);
    expect(agent.headers['cache-control']).toBe('no-store');
    expect(Object.keys(agent.body.items[0]).sort()).toEqual(
      [
        'id',
        'creatorId',
        'customerName',
        'customerEmail',
        'status',
        'totalCents',
        'createdAt',
      ].sort(),
    );
    const maximum = await list({ search: marker, pageSize: 100 }).expect(200);
    expect(maximum.body.items).toHaveLength(67);
    expect(maximum.body.nextCursor).toBeNull();
    expect(
      (await list({ search: crypto.randomUUID() }).expect(200)).body,
    ).toEqual({ items: [], nextCursor: null });
    expect((await list({ search: '   ' }).expect(200)).body).toEqual(
      (await list().expect(200)).body,
    );
  });

  for (const sort of ['createdAt', 'totalCents'] as const)
    for (const direction of ['asc', 'desc'] as const)
      for (const pageSize of [1, 50])
        for (const filters of [
          { search: marker },
          { search: marker, status: 'pending' },
          {},
          { status: 'pending' },
        ])
          test(`list traverses tied ${sort} ${direction}, size ${pageSize}, filters ${JSON.stringify(filters)}`, async () => {
            const order = direction === 'asc' ? asc : desc;
            const expected = (
              await db
                .select()
                .from(orders)
                .where(
                  and(
                    filters.search
                      ? sql`${orders.customerName} like ${marker + '%'}`
                      : undefined,
                    filters.status ? eq(orders.status, 'pending') : undefined,
                  ),
                )
                .orderBy(order(orders[sort]), order(orders.id))
            ).map((row) => row.id);
            const ids: number[] = [];
            let after: string | undefined;
            do {
              const response = await list({
                ...filters,
                sort,
                direction,
                pageSize,
                after,
              }).expect(200);
              expect(response.body.items.length).toBeLessThanOrEqual(pageSize);
              ids.push(
                ...response.body.items.map((row: { id: number }) => row.id),
              );
              after = response.body.nextCursor ?? undefined;
              if (after) {
                const cursor = JSON.parse(
                  Buffer.from(after, 'base64url').toString(),
                );
                expect(cursor.id).toBe(response.body.items.at(-1).id);
                expect(cursor.value).toBe(response.body.items.at(-1)[sort]);
              }
              expect(ids.length).toBeLessThanOrEqual(expected.length);
            } while (after);
            expect(ids).toEqual(expected);
          });

  test('list searches name or email case-insensitively with status and literal LIKE characters', async () => {
    for (const search of ['ÉLODIE', "O'BRIEN", '%', '_', '\\']) {
      const result = await list({
        search,
        status: 'completed',
        pageSize: 100,
      }).expect(200);
      expect(result.body.items.map((row: { id: number }) => row.id)).toContain(
        fixture[0].id,
      );
      expect(
        result.body.items.filter((row: { customerName: string }) =>
          row.customerName.startsWith(marker),
        ),
      ).toHaveLength(1);
    }
    const email = await list({
      search: `${marker.toUpperCase()}-1@`,
      status: 'pending',
    }).expect(200);
    expect(email.body.items.map((row: { id: number }) => row.id)).toEqual([
      fixture[1].id,
    ]);
    expect(
      (await list({ search: `${marker}-1@`, status: 'completed' }).expect(200))
        .body.items,
    ).toEqual([]);
    expect(
      (await list({ search: "' OR 1=1 --" }).expect(200)).body.items,
    ).toEqual([]);
  });

  test('list rejects invalid, repeated and unknown query fields', async () => {
    for (const query of [
      { sort: 'id' },
      { sort: '' },
      { direction: 'DESC' },
      { status: 'other' },
      { status: '' },
      { pageSize: '0' },
      { pageSize: '101' },
      { pageSize: '1.5' },
      { pageSize: '1e1' },
      { pageSize: '' },
      { page: '1' },
      { offset: '0' },
      { search: 'x'.repeat(101) },
      { search: '\0' },
      { after: '' },
      { search: ['a', 'b'] },
      { sort: ['createdAt', 'totalCents'] },
      { status: ['pending', 'completed'] },
      { direction: ['asc', 'desc'] },
      { pageSize: ['1', '2'] },
      { after: ['a', 'b'] },
      { unknown: 'value' },
    ])
      await list(query).expect(400);
  });

  test('list rejects malformed cursor encoding, shape, values and every query mismatch', async () => {
    const first = await list({ search: marker, pageSize: 1 }).expect(200);
    const valid = JSON.parse(
      Buffer.from(first.body.nextCursor, 'base64url').toString(),
    );
    expect(valid).not.toHaveProperty('v');
    const malformed = [
      'x'.repeat(2049),
      '***',
      first.body.nextCursor + '=',
      'Zh',
      Buffer.from([0xff]).toString('base64url'),
      Buffer.from('{').toString('base64url'),
      ...[
        null,
        [],
        {},
        { ...valid, extra: true },
        { ...valid, v: 1 },
        ...[0, -1, 1.5, 2147483648, '1', null].map((id) => ({ ...valid, id })),
        ...[
          'invalid',
          '2026-02-30T00:00:00.000Z',
          '0000-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00Z',
          '2026-01-01T00:00:00.000+00:00',
          1,
        ].map((value) => ({ ...valid, value })),
        ...[
          'sort',
          'direction',
          'search',
          'status',
          'pageSize',
          'value',
          'id',
        ].map((key) => {
          const copy = { ...valid };
          delete copy[key];
          return copy;
        }),
      ].map(encode),
    ];
    for (const after of malformed)
      await list({ search: marker, pageSize: 1, after }).expect(400);
    for (const query of [
      { search: marker.toUpperCase() },
      { search: 'other' },
      { status: 'pending' },
      { sort: 'totalCents' },
      { direction: 'asc' },
      { pageSize: 2 },
    ])
      await list({
        search: marker,
        pageSize: 1,
        ...query,
        after: first.body.nextCursor,
      }).expect(400);
    const amount = JSON.parse(
      Buffer.from(
        (
          await list({
            search: marker,
            sort: 'totalCents',
            pageSize: 1,
          }).expect(200)
        ).body.nextCursor,
        'base64url',
      ).toString(),
    );
    for (const value of [0, -1, 0.5, 2000000001, '100', null])
      await list({
        search: marker,
        sort: 'totalCents',
        pageSize: 1,
        after: encode({ ...amount, value }),
      }).expect(400);
    const beyond = await list({
      search: marker,
      sort: 'totalCents',
      direction: 'asc',
      pageSize: 1,
      after: encode({
        ...amount,
        direction: 'asc',
        value: 2000000000,
        id: 2147483647,
      }),
    }).expect(200);
    expect(beyond.body).toEqual({ items: [], nextCursor: null });
    await list({
      search: ` ${marker} `,
      pageSize: 1,
      sort: 'createdAt',
      direction: 'desc',
      after: first.body.nextCursor,
    }).expect(200);
  });

  test('idempotency replay after HTTP deletion does not recreate order; agent denial changes nothing', async () => {
    const key = crypto.randomUUID();
    const created = await create(key).expect(201);
    const id = created.body.id;
    const before = await counts();
    await remove(id, cookies[1]).expect(403);
    expect(await counts()).toEqual(before);
    expect(
      await db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    ).toHaveLength(2);
    for (const bad of ['0', '-1', '1.5', '1e2', '2147483648', 'abc'])
      await remove(bad).expect(400);
    await request(app.getHttpServer())
      .delete('/api/orders/' + id)
      .set('Origin', origin)
      .expect(401);
    for (const hostile of [undefined, 'null', 'https://hostile.example']) {
      const call = request(app.getHttpServer())
        .delete('/api/orders/' + id)
        .set('Cookie', cookies[0]);
      if (hostile) call.set('Origin', hostile);
      await call.expect(403);
    }
    await remove(id).expect(204);
    await remove(id).expect(404);
    expect(await db.select().from(orders).where(eq(orders.id, id))).toEqual([]);
    expect(
      await db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    ).toEqual([]);
    expect((await create(key).expect(201)).body).toEqual(created.body);
    expect(await counts()).toEqual({
      orders: before.orders - 1,
      receipts: before.receipts,
    });
  });

  test('database errors are safe 503s and invalid cursors are rejected before list SQL', async () => {
    const service = new OrdersService(db);
    const failure = spyOn(db.$client, 'query').mockImplementation(() => {
      throw new Error('sensitive SQL and connection details');
    });
    try {
      await rejects(service.list(new ListOrdersDto()), {
        status: 503,
        message: 'Order list unavailable',
      });
      await rejects(service.remove(fixture[0].id), {
        status: 503,
        message: 'Order deletion unavailable',
      });
      await rejects(
        service.list(Object.assign(new ListOrdersDto(), { after: '***' })),
        { status: 400 },
      );
    } finally {
      failure.mockRestore();
    }
    expect(
      await db.select().from(orders).where(eq(orders.id, fixture[0].id)),
    ).toHaveLength(1);
  });

  test('live cursors survive deleted anchors and insertions without losing unchanged rows', async () => {
    const first = await list({
      search: marker,
      sort: 'totalCents',
      direction: 'asc',
      pageSize: 1,
    }).expect(200);
    const second = await list({
      search: marker,
      sort: 'totalCents',
      direction: 'asc',
      pageSize: 1,
      after: first.body.nextCursor,
    }).expect(200);
    const anchor = second.body.items[0];
    await remove(anchor.id).expect(204);
    const inserted = await db
      .insert(orders)
      .values(
        [1, 150].map((amount) => ({
          creatorId: staff[0].id,
          customerName: marker + ' new',
          customerEmail: marker + '@example.com',
          totalCents: amount,
          createdAt: new Date(),
        })),
      )
      .returning();
    const rest = await list({
      search: marker,
      sort: 'totalCents',
      direction: 'asc',
      pageSize: 1,
      after: second.body.nextCursor,
    }).expect(200);
    expect(rest.body.items[0].id).toBe(fixture[2].id);
    const remainingIds: number[] = [];
    let after = second.body.nextCursor;
    while (after) {
      const page = await list({
        search: marker,
        sort: 'totalCents',
        direction: 'asc',
        pageSize: 1,
        after,
      }).expect(200);
      remainingIds.push(
        ...page.body.items.map((row: { id: number }) => row.id),
      );
      after = page.body.nextCursor;
      expect(remainingIds.length).toBeLessThanOrEqual(fixture.length);
    }
    const expected = fixture
      .slice(2)
      .sort((a, b) => a.totalCents - b.totalCents || a.id - b.id);
    expect(remainingIds).toEqual(
      [...expected, inserted[1]]
        .sort((a, b) => a.totalCents - b.totalCents || a.id - b.id)
        .map((row) => row.id),
    );
    expect(remainingIds).not.toContain(inserted[0].id);
    expect(
      (
        await list({
          search: marker,
          sort: 'totalCents',
          direction: 'asc',
          pageSize: 100,
        }).expect(200)
      ).body.items.map((row: { id: number }) => row.id),
    ).toContain(inserted[0].id);
    await db
      .delete(orders)
      .where(sql`${orders.customerName} like ${marker + '%'}`);
    expect(
      (
        await list({
          search: marker,
          sort: 'totalCents',
          direction: 'asc',
          pageSize: 1,
          after: rest.body.nextCursor,
        }).expect(200)
      ).body,
    ).toEqual({ items: [], nextCursor: null });
  });
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
