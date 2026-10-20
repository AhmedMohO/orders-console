import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/types/auth.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) { }

  @Post()
  async create(
    @Req() request: AuthRequest,
    @Body() input: CreateOrderDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const keys = request.headersDistinct['idempotency-key'];
    const key = keys?.[0];
    if (keys?.length !== 1 || !key || !/^[\x20-\x7e]{1,128}$/.test(key)) {
      throw new BadRequestException(
        'One printable ASCII Idempotency-Key of 1–128 characters is required',
      );
    }
    const result = await this.orders.create(request.user.id, key, input);
    response.setHeader('Cache-Control', 'no-store');
    response.status(result.statusCode);
    return result.body;
  }
}
