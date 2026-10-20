import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTH_COOKIE,
  AuthService,
  type AuthenticatedUser,
} from '../auth.service.js';
import { Public } from '../decorators/public.decorator.js';

export interface AuthRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
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
    request.user = await this.auth.authenticate(request.cookies?.[AUTH_COOKIE]);
    return true;
  }
}
