import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest } from './auth.guard.js';
import { Roles } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) { }

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      roles &&
      !roles.includes(
        context.switchToHttp().getRequest<AuthRequest>().user?.role,
      )
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
