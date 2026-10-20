import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service.js';
import { APP_ENV } from '../../common/consts/tokens.js';
import type { AppEnv } from '../../common/types/env.js';
import type { AuthRequest } from '../types/auth.js';
import { Public } from '../decorators/public.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) { }

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride(Public, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user = await this.auth.authenticate(
      request.cookies?.[this.env.authCookie],
    );
    return true;
  }
}
