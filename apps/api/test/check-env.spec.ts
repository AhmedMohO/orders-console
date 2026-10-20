import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEnv } from '../src/check-env.js';

const directory = mkdtempSync(join(tmpdir(), 'orders-env-'));
const file = join(directory, '.env');
const valid = `DATABASE_URL=postgresql://staff:password@localhost:5432/orders_console
API_PORT=4000
APP_ORIGIN=http://localhost:3000
JWT_SECRET=${'a'.repeat(64)}
AUTH_COOKIE=orders_access
TOKEN_SECONDS=900
NODE_ENV=development
API_URL=http://localhost:4000
`;

afterAll(() => rmSync(directory, { recursive: true, force: true }));

test('accepts a configured env file without connecting to the database', () => {
  writeFileSync(file, valid);
  expect(() => checkEnv(file)).not.toThrow();
});

test('requires the env file even when shell variables are set', () => {
  expect(() => checkEnv(join(directory, 'missing.env'))).toThrow('.env');
});

test.each([
  [
    'DATABASE_URL=postgresql://staff:password',
    'DATABASE_URL=postgresql://staff:CHANGE_ME',
    'DATABASE_URL',
  ],
  ['API_PORT=4000', 'API_PORT=0', 'API_PORT'],
  ['APP_ORIGIN=http://localhost:3000', 'APP_ORIGIN=invalid', 'APP_ORIGIN'],
  [
    `JWT_SECRET=${'a'.repeat(64)}`,
    'JWT_SECRET=REPLACE_WITH_RANDOM_SECRET',
    'JWT_SECRET',
  ],
  ['NODE_ENV=development', 'NODE_ENV=staging', 'NODE_ENV'],
  ['AUTH_COOKIE=orders_access', '', 'AUTH_COOKIE'],
  ['AUTH_COOKIE=orders_access', 'AUTH_COOKIE="bad;cookie"', 'AUTH_COOKIE'],
  ['AUTH_COOKIE=orders_access', 'AUTH_COOKIE=__Host-access', 'AUTH_COOKIE'],
  ['AUTH_COOKIE=orders_access', 'AUTH_COOKIE=__Secure-access', 'AUTH_COOKIE'],
  ['AUTH_COOKIE=orders_access', 'AUTH_COOKIE=__Http-access', 'AUTH_COOKIE'],
  ['TOKEN_SECONDS=900', '', 'TOKEN_SECONDS'],
  ['TOKEN_SECONDS=900', 'TOKEN_SECONDS=0', 'TOKEN_SECONDS'],
  ['TOKEN_SECONDS=900', 'TOKEN_SECONDS=-1', 'TOKEN_SECONDS'],
  ['TOKEN_SECONDS=900', 'TOKEN_SECONDS=1.5', 'TOKEN_SECONDS'],
  ['TOKEN_SECONDS=900', 'TOKEN_SECONDS=86401', 'TOKEN_SECONDS'],
  ['API_URL=http://localhost:4000', '', 'API_URL'],
  ['API_URL=http://localhost:4000', 'API_URL=ftp://localhost', 'API_URL'],
  [
    'API_URL=http://localhost:4000',
    'API_URL=http://user:password@localhost',
    'API_URL',
  ],
  [
    'API_URL=http://localhost:4000',
    'API_URL=http://localhost/users',
    'API_URL',
  ],
  ['API_URL=http://localhost:4000', 'API_URL=http://localhost?x=1', 'API_URL'],
  [
    'API_URL=http://localhost:4000',
    'API_URL="http://localhost#users"',
    'API_URL',
  ],
])(
  'rejects invalid file configuration %#',
  (from: string, to: string, variable: string) => {
    writeFileSync(file, valid.replace(from, to));
    expect(() => checkEnv(file)).toThrow(variable);
  },
);
