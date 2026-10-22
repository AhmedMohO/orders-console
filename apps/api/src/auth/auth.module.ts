import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { readEnv } from '../env.js';
import { APP_ENV } from '../common/consts/tokens.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { OriginGuard } from './guards/origin.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: readEnv(process.env).jwtSecret,
        signOptions: {
          algorithm: 'HS256',
          issuer: 'orders-console-api',
          audience: 'orders-console-web',
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: 'orders-console-api',
          audience: 'orders-console-web',
        },
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 5 }],
      errorMessage: (_context, { timeToBlockExpire }) =>
        `Too many login attempts. Please try again in ${timeToBlockExpire} second${timeToBlockExpire === 1 ? '' : 's'}.`,
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_ENV, useFactory: () => readEnv(process.env) },
    AuthService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, APP_ENV],
})
export class AuthModule { }
