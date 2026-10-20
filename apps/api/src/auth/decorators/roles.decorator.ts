import { Reflector } from '@nestjs/core';
import type { UserRole } from '@repo/contracts/users';

export const Roles = Reflector.createDecorator<UserRole[]>();
