import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type {
  CreateOrderItemRequest,
  CreateOrderRequest,
} from '@repo/contracts/orders';

export class CreateOrderItemDto implements CreateOrderItemRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @IsInt()
  @Min(1)
  @Max(10000000)
  unitPriceCents: number;
}

export class CreateOrderDto implements CreateOrderRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  customerName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  customerEmail: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsInt()
  @Min(1)
  @Max(2000000000)
  totalCents: number;
}
