import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { readEnv } from './env.js';

export function checkEnv(
  file: string | URL = new URL('../../../.env', import.meta.url),
) {
  const env = parseEnv(readFileSync(file, 'utf8'));
  const { databaseUrl } = readEnv(env);
  if (/CHANGE_ME|REPLACE/i.test(decodeURIComponent(new URL(databaseUrl).password))) {
    throw new Error('DATABASE_URL must use your database password, not the example placeholder');
  }

  try {
    const url = new URL(env.API_URL ?? '');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('API_URL must be one HTTP(S) origin without credentials, path, or query');
  }
}

if (import.meta.main) {
  try {
    checkEnv();
    console.log('Root .env configuration is valid (database connection not tested).');
  } catch (error) {
    console.error(`Root .env check failed: ${error instanceof Error ? error.message : 'invalid configuration'}`);
    process.exitCode = 1;
  }
}
