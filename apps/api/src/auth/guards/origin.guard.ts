import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { APP_ENV, type AppEnv } from '../../env.js';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) { }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== this.env.appOrigin
    ) {
      throw new ForbiddenException('Invalid Origin');
    }
    return true;
  }
}
