import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDb } from '@repo/db';
import type { Database } from '@repo/db';

import { DB } from '../common/consts/tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => createDb(process.env.DATABASE_URL),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Database) { }

  async onApplicationShutdown() {
    await this.db.$client.end();
  }
}
