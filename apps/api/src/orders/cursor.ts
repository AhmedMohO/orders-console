import { BadRequestException } from '@nestjs/common';
import type { OrderSummary } from '@repo/contracts/orders';
import type { ListOrdersDto } from './dto/list-orders.dto.js';

function queryFields(query: ListOrdersDto) {
  return {
    sort: query.sort,
    direction: query.direction,
    search: query.search,
    status: query.status ?? null,
    pageSize: query.pageSize,
  };
}

export function encodeCursor(query: ListOrdersDto, row: OrderSummary): string {
  return Buffer.from(
    JSON.stringify({
      ...queryFields(query),
      value: row[query.sort],
      id: row.id,
    }),
  ).toString('base64url');
}

export function decodeCursor(
  query: ListOrdersDto,
): { value: string | number; id: number } | undefined {
  if (query.after === undefined) return undefined;

  const cursor = parseCursor(query.after);
  const expectedQuery = queryFields(query);
  const expectedKeys = [...Object.keys(expectedQuery), 'value', 'id'];
  const hasExactFields =
    Object.keys(cursor).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(cursor, key));
  if (!hasExactFields) throw new BadRequestException('Invalid cursor fields');

  const matchesQuery = Object.entries(expectedQuery).every(
    ([key, value]) => cursor[key] === value,
  );
  if (!matchesQuery)
    throw new BadRequestException('Cursor does not match this query');

  const { id, value } = cursor;
  if (!isIntegerInRange(id, 2147483647)) {
    throw new BadRequestException('Invalid cursor ID');
  }
  if (!isValidSortValue(value, query.sort)) {
    throw new BadRequestException('Invalid cursor sort value');
  }
  return { id, value };
}

function parseCursor(encoded: string): Record<string, unknown> {
  try {
    if (encoded.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(encoded))
      throw new Error();

    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.toString('base64url') !== encoded) throw new Error();

    const cursor: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor))
      throw new Error();
    return cursor as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Invalid cursor encoding');
  }
}

function isIntegerInRange(value: unknown, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maximum
  );
}

function isValidSortValue(
  value: unknown,
  sort: ListOrdersDto['sort'],
): value is string | number {
  if (sort === 'totalCents') return isIntegerInRange(value, 2000000000);
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  // PostgreSQL has no year zero, although JavaScript accepts it.
  if (value.startsWith('0000-')) return false;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
