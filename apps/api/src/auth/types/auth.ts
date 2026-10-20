import type { Request } from 'express';
import type { UserResponse } from '@repo/contracts/users';

export interface AuthenticatedUser extends UserResponse {
  sessionId: string;
}

export interface AuthRequest extends Request {
  user: AuthenticatedUser;
}

export interface Claims {
  sub: string;
  sid: string;
  exp: number;
}

export type SessionUser = Omit<AuthenticatedUser, 'createdAt'> & {
  createdAt: Date;
};
