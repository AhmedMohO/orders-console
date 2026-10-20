import { requireDatabaseUrl } from '@repo/db';

export const APP_ENV = 'APP_ENV';
export type AppEnv = ReturnType<typeof readEnv>;

export function readEnv(env: NodeJS.ProcessEnv) {
  const databaseUrl = requireDatabaseUrl(env.DATABASE_URL);
  const port = env.API_PORT ?? '4000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('API_PORT must be an integer from 1 to 65535');
  }

  let appOrigin: string;
  try {
    const url = new URL(env.APP_ORIGIN ?? '');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    appOrigin = url.origin;
  } catch {
    throw new Error(
      'APP_ORIGIN must be one HTTP(S) origin without credentials, path, or query',
    );
  }

  const jwtSecret = env.JWT_SECRET;
  if (
    !jwtSecret ||
    jwtSecret.length < 64 ||
    /\s|REPLACE|CHANGE_ME/i.test(jwtSecret)
  ) {
    throw new Error(
      'JWT_SECRET must be a generated secret of at least 64 characters',
    );
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  return { databaseUrl, apiPort: Number(port), appOrigin, jwtSecret, nodeEnv };
}
