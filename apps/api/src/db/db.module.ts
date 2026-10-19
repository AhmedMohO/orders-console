import { Global, Module } from '@nestjs/common';
import { createDb } from '@repo/db';

export const DB = 'DB';

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
export class DbModule { }
