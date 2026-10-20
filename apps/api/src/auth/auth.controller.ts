import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { UserResponse } from '@repo/contracts/users';
import { APP_ENV } from '../common/consts/tokens.js';
import type { AppEnv } from '../common/types/env.js';
import { AuthService } from './auth.service.js';
import type { AuthRequest } from './types/auth.js';
import { LoginDto } from './login.dto.js';
import { Public } from './decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) { }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/api',
      secure: this.env.nodeEnv === 'production',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const result = await this.auth.login(input);
    response.setHeader('Cache-Control', 'no-store');
    response.cookie(this.env.authCookie, result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
    return result.user;
  }

  @Get('me')
  me(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): UserResponse {
    response.setHeader('Cache-Control', 'no-store');
    const { id, name, email, role, createdAt } = request.user;
    return { id, name, email, role, createdAt };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies?.[this.env.authCookie]);
    response.setHeader('Cache-Control', 'no-store');
    response.clearCookie(this.env.authCookie, this.cookieOptions());
  }
}
