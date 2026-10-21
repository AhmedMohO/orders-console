import 'reflect-metadata';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  spyOn,
  test,
} from 'bun:test';
import {
  Controller,
  Delete,
  Get,
  Module,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { eq, sessions, users, type Database, type User } from '@repo/db';
import { demoAccounts } from '@repo/db/scripts/seed.js';
import { openTestDatabase } from '@repo/db/test/database.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { APP_ENV, DB } from '../src/common/consts/tokens.js';
import { readEnv } from '../src/env.js';
import type { AppEnv } from '../src/common/types/env.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';

const origin = 'http://localhost:2001';
const cookieName = 'orders_access';
const savedEnv = { ...process.env };
let db: Database;
let app: INestApplication;
let admin: User;
let agent: User;
let unconfigured: User;
let apps: INestApplication[] = [];
const ownedUsers: number[] = [];
let roleCalls = 0;

@Controller('auth-proof')
class ProofController {
  @Get()
  privateRoute() {
    return { ok: true };
  }

  @Delete()
  @Roles(['admin'])
  adminRoute() {
    roleCalls++;
    return { ok: true };
  }
}

@Module({ imports: [AppModule], controllers: [ProofController] })
class ProofModule {}

async function makeApp(
  options: {
    production?: boolean;
    dropLogout?: boolean;
    env?: Partial<AppEnv>;
  } = {},
) {
  const connection = await openTestDatabase();
  const builder = Test.createTestingModule({ imports: [ProofModule] })
    .overrideProvider(DB)
    .useValue(connection);
  if (options.production || options.env)
    builder.overrideProvider(APP_ENV).useValue({
      ...readEnv(process.env),
      ...options.env,
      ...(options.production ? { nodeEnv: 'production' } : {}),
    });
  const module = await builder.compile();
  const instance = module.createNestApplication({
    bodyParser: false,
    logger: false,
  });
  configureApp(instance);
  if (options.dropLogout) {
    let dropped = false;
    instance.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/api/auth/logout' && !dropped) {
        dropped = true;
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

function cookieOf(response: request.Response) {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  expect(cookies).toHaveLength(1);
  return cookies[0].split(';')[0];
}

function login(instance = app, staff = admin) {
  const password = demoAccounts.find(
    (account) => account.email === staff.email,
  )!.password;
  return request(instance.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: staff.email, password });
}

function logout(cookie?: string, instance = app) {
  const call = request(instance.getHttpServer())
    .post('/api/auth/logout')
    .set('Origin', origin);
  return cookie ? call.set('Cookie', cookie) : call;
}

async function signedClaims(
  claims: object,
  options: Parameters<JwtService['signAsync']>[1] = {},
) {
  return (
    cookieName + '=' + (await app.get(JwtService).signAsync(claims, options))
  );
}

async function sessionCookie(
  staff = admin,
  expiresAt = new Date(Date.now() + 900000),
) {
  const sid = crypto.randomUUID();
  await db.insert(sessions).values({ id: sid, userId: staff.id, expiresAt });
  return {
    sid,
    cookie: await signedClaims({
      sub: String(staff.id),
      sid,
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
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
  // Always use the verified test database; never reset an existing account's credentials.
  for (const account of demoAccounts) {
    const inserted = await db
      .insert(users)
      .values({
        name: account.name,
        email: account.email,
        role: account.role,
        passwordHash: await Bun.password.hash(account.password, {
          algorithm: 'argon2id',
        }),
      })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (inserted.length) ownedUsers.push(inserted[0].id);
    const [staff] = await db
      .select()
      .from(users)
      .where(eq(users.email, account.email));
    expect(staff.role).toBe(account.role);
    expect(
      await Bun.password.verify(account.password, staff.passwordHash!),
    ).toBe(true);
    if (account.role === 'admin') admin = staff;
    else agent = staff;
  }
  [unconfigured] = await db
    .insert(users)
    .values({
      name: 'Unconfigured',
      email: 'auth-' + crypto.randomUUID() + '@example.com',
    })
    .returning();
  ownedUsers.push(unconfigured.id);
});
beforeEach(async () => {
  app = await makeApp();
});
afterEach(async () => {
  await Promise.all(apps.map((instance) => instance.close()));
  apps = [];
});
afterAll(async () => {
  try {
    for (const id of ownedUsers) await db.delete(users).where(eq(users.id, id));
  } finally {
    await db?.$client.end();
    process.env = savedEnv;
  }
});

test('auth accepts both demo credentials, normalizes email and returns only safe fields', async () => {
  for (const staff of [admin, agent]) {
    const password = demoAccounts.find(
      (account) => account.email === staff.email,
    )!.password;
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: ' ' + staff.email.toUpperCase() + ' ', password })
      .expect(200);
    expect(response.body).toEqual({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      createdAt: staff.createdAt.toISOString(),
    });
    const cookie = cookieOf(response);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual(response.body);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|token|sessionId|sid/,
    );
  }
});

test('auth cookies use bounded expiry, HttpOnly, Lax, /api and production Secure', async () => {
  const response = await login().expect(200);
  const raw = (response.headers['set-cookie'] as unknown as string[])[0];
  expect(raw).toContain('HttpOnly');
  expect(raw).toContain('SameSite=Lax');
  expect(raw).toContain('Path=/api');
  expect(raw).not.toContain('Domain=');
  expect(raw).not.toContain('Secure');
  const token = cookieOf(response).slice(cookieName.length + 1);
  const claims = app
    .get(JwtService)
    .verify<{ sub: string; sid: string; exp: number; iat: number }>(token);
  expect(claims.exp - claims.iat).toBeGreaterThan(0);
  expect(claims.exp - claims.iat).toBeLessThanOrEqual(900);
  expect(claims).not.toHaveProperty('role');
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, claims.sid));
  expect(session.expiresAt.getTime()).toBe(claims.exp * 1000);
  const expires = raw.match(/Expires=([^;]+)/)![1];
  expect(new Date(expires).getTime()).toBe(claims.exp * 1000);
  const production = await makeApp({ production: true });
  expect(String((await login(production)).headers['set-cookie'])).toContain(
    'Secure',
  );
});

test('auth wrong, unknown, unconfigured and whitespace-altered passwords have one generic failure', async () => {
  const bodies = [];
  for (const [email, password] of [
    [admin.email, 'wrong'],
    ['unknown@example.com', 'wrong'],
    [unconfigured.email, 'wrong'],
    [admin.email, ' AdminDemo123! '],
  ]) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(401);
    expect(response.headers['set-cookie']).toBeUndefined();
    bodies.push(response.body);
  }
  expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  expect(bodies[0].message).toBe('Invalid email or password');
});

test('auth uses the configured cookie name and lifetime for login, authentication and logout', async () => {
  const configured = await makeApp({
    env: { authCookie: 'review_access', tokenSeconds: 60 },
  });
  const response = await login(configured).expect(200);
  const cookie = cookieOf(response);
  expect(cookie.startsWith('review_access=')).toBe(true);
  const claims = configured
    .get(JwtService)
    .verify<{ exp: number; iat: number }>(
      cookie.slice('review_access='.length),
    );
  expect(claims.exp - claims.iat).toBe(60);
  await request(configured.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', cookie)
    .expect(200);
  const cleared = await logout(cookie, configured).expect(204);
  expect(String(cleared.headers['set-cookie'])).toStartWith('review_access=;');
  await request(configured.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', cookie)
    .expect(401);
});

test.each([
  {},
  { email: 'invalid', password: 'x' },
  { email: 'admin@example.com', password: '' },
  { email: 42, password: 'x' },
  { email: 'admin@example.com', password: 42 },
  { email: 'admin@example.com', password: 'x', role: 'admin' },
  { email: 'admin@example.com', password: 'x'.repeat(1025) },
])(
  'auth login validates input without leaking submitted values %#',
  async (input) => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send(input)
      .expect(400);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('x'.repeat(100));
  },
);

test('auth rejects form-compatible content and oversized JSON before credentials', async () => {
  await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', origin)
    .type('form')
    .send({ email: admin.email, password: 'AdminDemo123!' })
    .expect(400);
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: admin.email, password: 'x'.repeat(33 * 1024) })
    .expect(413);
  expect(response.text).not.toContain('x'.repeat(100));
});

test.each([
  undefined,
  'null',
  'https://evil.example',
  origin + '/',
  'http://localhost:20010',
  origin + ', https://evil.example',
])(
  'auth login and every logout path require exact Origin %s',
  async (value) => {
    const { cookie, sid } = await sessionCookie();
    for (const [path, cookies] of [
      ['login', undefined],
      ['logout', cookie],
      ['logout', 'orders_access=invalid'],
      ['logout', undefined],
    ] as const) {
      const call = request(app.getHttpServer()).post('/api/auth/' + path);
      if (value !== undefined) call.set('Origin', value);
      if (cookies) call.set('Cookie', cookies);
      await call
        .send({ email: admin.email, password: 'AdminDemo123!' })
        .expect(403);
    }
    expect(
      await db.select().from(sessions).where(eq(sessions.id, sid)),
    ).toHaveLength(1);
  },
);

test('auth throttles at five attempts and ignores spoofed forwarding headers', async () => {
  for (let i = 0; i < 6; i++) {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '192.0.2.' + i)
      .send({ email: admin.email, password: 'wrong' })
      .expect(i < 5 ? 401 : 429);
  }
});

test('API responses default to no-store on success, auth errors, missing routes and parser errors', async () => {
  const responses = [
    await request(app.getHttpServer()).get('/api/health').expect(200),
    await request(app.getHttpServer()).get('/api/auth/me').expect(401),
    await request(app.getHttpServer()).get('/api/missing').expect(404),
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({})
      .expect(403),
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'x'.repeat(33000) })
      .expect(413),
  ];
  for (const response of responses)
    expect(response.headers['cache-control']).toBe('no-store');
});

test('auth public health is safe, users endpoints are gone, and other routes are private by default', async () => {
  const health = await request(app.getHttpServer())
    .get('/api/health')
    .expect(200);
  expect(health.body).toEqual({ ok: true });
  expect(health.headers['x-content-type-options']).toBe('nosniff');
  expect(health.headers['x-powered-by']).toBeUndefined();
  expect(health.headers['access-control-allow-origin']).toBeUndefined();
  await request(app.getHttpServer()).get('/users').expect(404);
  await request(app.getHttpServer()).get('/api/users').expect(404);
  await request(app.getHttpServer()).get('/api/auth-proof').expect(401);
  await request(app.getHttpServer())
    .delete('/api/auth-proof')
    .set('Origin', origin)
    .expect(401);
});

test('auth only accepts the intended cookie, never query strings or Authorization', async () => {
  const { cookie } = await sessionCookie();
  const token = cookie.slice(cookieName.length + 1);
  await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .query({ token })
    .expect(401);
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Authorization', 'Bearer ' + token)
    .expect(401);
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', 'other=' + token)
    .expect(401);
});

test('auth rejects forged, expired, wrong-algorithm, wrong-issuer/audience and malformed claims', async () => {
  const { sid } = await sessionCookie();
  const valid = {
    sub: String(admin.id),
    sid,
    exp: Math.floor(Date.now() / 1000) + 900,
  };
  const tokens = [
    await signedClaims(valid, { secret: 'forged-secret' }),
    await signedClaims(valid, { algorithm: 'HS384' }),
    await signedClaims(valid, { issuer: 'other' }),
    await signedClaims(valid, { audience: 'other' }),
    await signedClaims({ ...valid, exp: Math.floor(Date.now() / 1000) }),
    await signedClaims({ sub: valid.sub, sid }),
    await signedClaims({ sub: valid.sub, exp: valid.exp }),
    await signedClaims({ ...valid, sid: 'invalid' }),
    await signedClaims({ ...valid, sub: admin.id }),
    await signedClaims({ ...valid, sub: '0' }),
    await signedClaims({ ...valid, sub: '2147483648' }),
    await signedClaims({ ...valid, sub: '0' + admin.id }),
    await signedClaims({ ...valid, sub: '-1' }),
    await signedClaims({ ...valid, sub: '1.5' }),
    await signedClaims({ ...valid, sub: '1e2' }),
    await signedClaims({ ...valid, sid: 42 }),
    await signedClaims({ ...valid, exp: valid.exp + 0.5 }),
    await signedClaims({ sid, exp: valid.exp }),
    'orders_access=garbage',
  ];
  for (const cookie of tokens) {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
    await logout(cookie).expect(204);
  }
  expect(
    await db.select().from(sessions).where(eq(sessions.id, sid)),
  ).toHaveLength(1);
});

test('auth checks subject/session ownership and persisted session expiry at the boundary', async () => {
  const { sid } = await sessionCookie();
  const mismatch = await signedClaims({
    sub: String(agent.id),
    sid,
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', mismatch)
    .expect(401);
  await logout(mismatch).expect(204);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, sid)),
  ).toHaveLength(1);
  const expired = await sessionCookie(admin, new Date(Date.now() - 1));
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', expired.cookie)
    .expect(401);
  const missing = await signedClaims({
    sub: String(admin.id),
    sid: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 900,
  });
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', missing)
    .expect(401);
});

test('auth reads current role and credentials instead of stale JWT claims', async () => {
  const { cookie } = await sessionCookie(agent);
  const baseline = roleCalls;
  await request(app.getHttpServer())
    .delete('/api/auth-proof')
    .set('Origin', origin)
    .set('Cookie', cookie)
    .expect(403);
  expect(roleCalls).toBe(baseline);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, agent.id));
  try {
    await request(app.getHttpServer())
      .delete('/api/auth-proof')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    expect(roleCalls).toBe(baseline + 1);
    await db
      .update(users)
      .set({ passwordHash: null })
      .where(eq(users.id, agent.id));
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  } finally {
    await db
      .update(users)
      .set({ role: agent.role, passwordHash: agent.passwordHash })
      .where(eq(users.id, agent.id));
  }
});

test('auth rejects a token when its staff account is deleted', async () => {
  const [staff] = await db
    .insert(users)
    .values({
      name: 'Deleted',
      email: 'auth-deleted-' + crypto.randomUUID() + '@example.com',
      passwordHash: admin.passwordHash,
    })
    .returning();
  try {
    const { cookie } = await sessionCookie(staff);
    await db.delete(users).where(eq(users.id, staff.id));
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  } finally {
    await db.delete(users).where(eq(users.id, staff.id));
  }
});

test('auth logout revokes copied cookies across instances, preserves other logins, and retries safely', async () => {
  const first = cookieOf(await login().expect(200));
  const other = cookieOf(await login().expect(200));
  const second = await makeApp();
  await request(second.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', first)
    .expect(200);
  const response = await logout(first).expect(204);
  expect(String(response.headers['set-cookie'])).toContain(
    'Path=/api; Expires=Thu, 01 Jan 1970',
  );
  await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', first)
    .expect(401);
  await request(second.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', first)
    .expect(401);
  await request(second.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', other)
    .expect(200);
  await logout(first).expect(204);
  await logout().expect(204);
});

test('auth logout retry succeeds after the committed response is dropped', async () => {
  const dropping = await makeApp({ dropLogout: true });
  const { cookie, sid } = await sessionCookie();
  const dropped = await logout(cookie, dropping).then(
    () => false,
    () => true,
  );
  expect(dropped).toBe(true);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, sid)),
  ).toHaveLength(0);
  await logout(cookie, dropping).expect(204);
});

test('auth login prunes only its own expired sessions and signing failure writes nothing', async () => {
  const expired = await sessionCookie(admin, new Date(Date.now() - 1000));
  const unrelated = await sessionCookie(agent, new Date(Date.now() - 1000));
  const active = await sessionCookie();
  const before = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, admin.id));
  const signing = spyOn(app.get(JwtService), 'signAsync').mockRejectedValueOnce(
    new Error('simulated signer failure'),
  );
  try {
    const response = await login().expect(503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, admin.id)),
    ).toEqual(before);
  } finally {
    signing.mockRestore();
  }
  await login().expect(200);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, expired.sid)),
  ).toHaveLength(0);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, active.sid)),
  ).toHaveLength(1);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, unrelated.sid)),
  ).toHaveLength(1);
});

test('auth database outages fail closed and never falsely confirm logout or clear its cookie', async () => {
  const { cookie, sid } = await sessionCookie();
  const connection = app.get<Database>(DB);
  const failure = spyOn(connection.$client, 'query').mockImplementation(() => {
    throw new Error('sensitive simulated database failure');
  });
  try {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(503);
    await request(app.getHttpServer())
      .get('/api/auth-proof')
      .set('Cookie', cookie)
      .expect(503);
    const response = await logout(cookie).expect(503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.text).not.toContain('sensitive');
    await login().expect(503);
    await logout('orders_access=invalid').expect(204);
  } finally {
    failure.mockRestore();
  }
  expect(
    await db.select().from(sessions).where(eq(sessions.id, sid)),
  ).toHaveLength(1);
  await logout(cookie).expect(204);
});
