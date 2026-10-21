import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotContains,
} from 'class-validator';
import {
  orderStatuses,
  type OrderQuery,
  type OrderStatus,
} from '@repo/contracts/orders';

export class ListOrdersDto implements OrderQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  @NotContains('\0')
  search = '';

  @IsOptional()
  @IsIn(orderStatuses)
  status?: OrderStatus;

  @IsIn(['createdAt', 'totalCents'])
  sort: 'createdAt' | 'totalCents' = 'createdAt';

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc' = 'desc';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  after?: string;
}
