import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { DbModule } from './db/db.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [DbModule, AuthModule, OrdersModule],
  controllers: [AppController],
})
export class AppModule {}
