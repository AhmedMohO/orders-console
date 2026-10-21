import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/types/auth.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';
import { ListOrdersDto } from './dto/list-orders.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersDto) {
    return this.orders.list(query);
  }

  @Delete(':id')
  @Roles(['admin'])
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    if (
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      Number(id) > 2147483647
    ) {
      throw new BadRequestException('Invalid order ID');
    }
    await this.orders.remove(Number(id));
  }

  @Post()
  async create(@Req() request: AuthRequest, @Body() input: CreateOrderDto) {
    const keys = request.headersDistinct['idempotency-key'];
    const key = keys?.[0];
    if (keys?.length !== 1 || !key || !/^[\x20-\x7e]{1,128}$/.test(key)) {
      throw new BadRequestException(
        'One printable ASCII Idempotency-Key of 1–128 characters is required',
      );
    }
    const result = await this.orders.create(request.user.id, key, input);
    return result.body;
  }
}
