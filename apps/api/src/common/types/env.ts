import type { readEnv } from '../../env.js';

export type AppEnv = ReturnType<typeof readEnv>;
