import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import {
  and,
  eq,
  sessions,
  sql,
  users,
  type Database,
  type User,
} from '@repo/db';
import type { UserResponse } from '@repo/contracts/users';
import { APP_ENV, DB } from '../common/consts/tokens.js';
import type { AppEnv } from '../common/types/env.js';
import type { AuthenticatedUser, Claims, SessionUser } from './types/auth.js';
import type { LoginDto } from './login.dto.js';

@Injectable()
export class AuthService {
  private readonly dummyHash = Bun.password.hash(crypto.randomUUID(), {
    algorithm: 'argon2id',
  });

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) { }

  async login(input: LoginDto) {
    let staff: User | undefined;
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
    const exp = Math.floor(Date.now() / 1000) + this.env.tokenSeconds;
    try {
      // Sign first so a signing failure cannot leave a new session behind.
      const token = await this.jwt.signAsync({
        sub: String(staff.id),
        sid,
        exp,
      });
      await this.db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, staff.id),
            sql`${sessions.expiresAt} <= now()`,
          ),
        );
      await this.db.insert(sessions).values({
        id: sid,
        userId: staff.id,
        expiresAt: new Date(exp * 1000),
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
      const { sub, sid, exp } =
        await this.jwt.verifyAsync<Record<string, unknown>>(cookie);
      if (
        typeof sub !== 'string' ||
        !/^[1-9]\d{0,9}$/.test(sub) ||
        Number(sub) > 2147483647
      )
        return;
      if (typeof sid !== 'string' || !isUUID(sid, '4')) return;
      if (
        typeof exp !== 'number' ||
        !Number.isSafeInteger(exp) ||
        exp <= Math.floor(Date.now() / 1000)
      )
        return;
      return { sub, sid, exp };
    } catch {
      return;
    }
  }

  async authenticate(cookie: unknown): Promise<AuthenticatedUser> {
    const claims = await this.verify(cookie);
    if (!claims) throw new UnauthorizedException();
    let staff: SessionUser | undefined;
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
