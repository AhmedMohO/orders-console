import { Inject, Injectable } from '@nestjs/common';
import { users } from '@repo/db';
import type { Database } from '@repo/db';
import { DB } from './db/db.module.js';

@Injectable()
export class AppService {
  constructor(@Inject(DB) private readonly db: Database) { }

  getUsers() {
    return this.db.select().from(users);
  }
}