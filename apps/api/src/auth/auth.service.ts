import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { and, eq, sessions, sql, users, type Database } from '@repo/db';
import type { UserResponse } from '@repo/contracts/users';
import { DB } from '../db/db.module.js';
import type { LoginDto } from './login.dto.js';

export const AUTH_COOKIE = 'orders_access';
export const TOKEN_SECONDS = 15 * 60;
export interface AuthenticatedUser extends UserResponse {
  sessionId: string;
}
interface Claims {
  sub: string;
  sid: string;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly dummyHash = Bun.password.hash(crypto.randomUUID(), {
    algorithm: 'argon2id',
  });

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async login(input: LoginDto) {
    let staff;
    try {
      [staff] = await this.db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }
    let valid = false;
    try {
      valid = await Bun.password.verify(
        input.password,
        staff?.passwordHash ?? (await this.dummyHash),
      );
    } catch {
      // A damaged stored hash must not expose account details to the caller.
    }
    if (!staff?.passwordHash || !valid)
      throw new UnauthorizedException('Invalid email or password');

    const sid = crypto.randomUUID();
    const exp = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
    try {
      const token = await this.db.transaction(async (tx) => {
        await tx
          .delete(sessions)
          .where(
            and(
              eq(sessions.userId, staff.id),
              sql`${sessions.expiresAt} <= now()`,
            ),
          );
        await tx
          .insert(sessions)
          .values({
            id: sid,
            userId: staff.id,
            expiresAt: new Date(exp * 1000),
          });
        return this.jwt.signAsync({ sub: String(staff.id), sid, exp });
      });
      const user: UserResponse = {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        createdAt: staff.createdAt.toISOString(),
      };
      return { token, user, expiresAt: new Date(exp * 1000) };
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }
  }

  private async verify(cookie: unknown): Promise<Claims | undefined> {
    if (typeof cookie !== 'string' || cookie.length > 4096) return;
    try {
      const claims =
        await this.jwt.verifyAsync<Record<string, unknown>>(cookie);
      if (
        typeof claims.sub !== 'string' ||
        !/^[1-9]\d*$/.test(claims.sub) ||
        !Number.isSafeInteger(Number(claims.sub)) ||
        Number(claims.sub) > 2147483647 ||
        typeof claims.sid !== 'string' ||
        !isUUID(claims.sid, '4') ||
        !Number.isSafeInteger(claims.exp) ||
        Number(claims.exp) <= Math.floor(Date.now() / 1000)
      )
        return;
      return { sub: claims.sub, sid: claims.sid, exp: Number(claims.exp) };
    } catch {
      return;
    }
  }

  async authenticate(cookie: unknown): Promise<AuthenticatedUser> {
    const claims = await this.verify(cookie);
    if (!claims) throw new UnauthorizedException();
    let staff;
    try {
      [staff] = await this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
          sessionId: sessions.id,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.id, claims.sid),
            eq(users.id, Number(claims.sub)),
            sql`${sessions.expiresAt} > now()`,
            sql`${users.passwordHash} is not null`,
          ),
        )
        .limit(1);
    } catch {
      throw new ServiceUnavailableException('Authentication unavailable');
    }
    if (!staff) throw new UnauthorizedException();
    return { ...staff, createdAt: staff.createdAt.toISOString() };
  }

  async logout(cookie: unknown): Promise<void> {
    const claims = await this.verify(cookie);
    if (!claims) return;
    try {
      await this.db
        .delete(sessions)
        .where(
          and(
            eq(sessions.id, claims.sid),
            eq(sessions.userId, Number(claims.sub)),
          ),
        );
    } catch {
      throw new ServiceUnavailableException('Logout unavailable; retry');
    }
  }
}
