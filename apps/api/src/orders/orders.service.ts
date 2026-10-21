import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  idempotencyRequests,
  orderItems,
  orders,
  sql,
  type Database,
} from '@repo/db';
import type { OrderListResponse, OrderResponse } from '@repo/contracts/orders';
import { DB } from '../common/consts/tokens.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersDto } from './dto/list-orders.dto.js';
import { decodeCursor, encodeCursor } from './cursor.js';

@Injectable()
export class OrdersService {
  constructor(@Inject(DB) private readonly db: Database) { }

  async list(query: ListOrdersDto): Promise<OrderListResponse> {
    const cursor = decodeCursor(query);
    const column = orders[query.sort];
    const order = query.direction === 'asc' ? asc : desc;
    const pattern = '%' + query.search.replace(/[\\%_]/g, '\\$&') + '%';
    try {
      const rows = await this.db
        .select({
          id: orders.id,
          creatorId: orders.creatorId,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          status: orders.status,
          totalCents: orders.totalCents,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(
          and(
            query.status ? eq(orders.status, query.status) : undefined,
            query.search
              ? sql`(${orders.customerName} ilike ${pattern} or ${orders.customerEmail} ilike ${pattern})`
              : undefined,
            cursor
              ? query.direction === 'asc'
                ? sql`(${column}, ${orders.id}) > (${cursor.value}, ${cursor.id})`
                : sql`(${column}, ${orders.id}) < (${cursor.value}, ${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(order(column), order(orders.id))
        .limit(query.pageSize + 1);
      const items = rows
        .slice(0, query.pageSize)
        .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
      return {
        items,
        nextCursor:
          rows.length > query.pageSize
            ? encodeCursor(query, items[items.length - 1])
            : null,
      };
    } catch {
      throw new ServiceUnavailableException('Order list unavailable');
    }
  }

  async remove(orderId: number): Promise<void> {
    let deleted: { id: number }[];
    try {
      deleted = await this.db
        .delete(orders)
        .where(eq(orders.id, orderId))
        .returning({ id: orders.id });
    } catch {
      throw new ServiceUnavailableException('Order deletion unavailable');
    }
    if (!deleted.length) throw new NotFoundException('Order not found');
  }

  async create(
    creatorId: number,
    key: string,
    input: CreateOrderDto,
  ): Promise<{ statusCode: 201; body: OrderResponse }> {
    const totalCents = input.items.reduce(
      (total, item) => total + item.quantity * item.unitPriceCents,
      0,
    );
    if (
      !Number.isSafeInteger(totalCents) ||
      totalCents < 1 ||
      totalCents > 2000000000 ||
      totalCents !== input.totalCents
    ) {
      throw new BadRequestException(
        'Order total must equal the bounded sum of its items',
      );
    }
    try {
      return await this.db.transaction(
        async (tx) => {
          const [claim] = await tx
            .insert(idempotencyRequests)
            .values({ creatorId, key })
            .onConflictDoNothing({
              target: [idempotencyRequests.creatorId, idempotencyRequests.key],
            })
            .returning({ id: idempotencyRequests.id });
          if (!claim) {
            // A separate READ COMMITTED statement sees a concurrent winner after the claim waits.
            const [receipt] = await tx
              .select()
              .from(idempotencyRequests)
              .where(
                and(
                  eq(idempotencyRequests.creatorId, creatorId),
                  eq(idempotencyRequests.key, key),
                ),
              );
            if (receipt?.responseStatus !== 201 || !receipt.responseBody)
              throw new Error('Incomplete create receipt');
            return {
              statusCode: 201,
              body: receipt.responseBody as OrderResponse,
            };
          }
          const [order] = await tx
            .insert(orders)
            .values({
              creatorId,
              customerName: input.customerName,
              customerEmail: input.customerEmail,
              totalCents,
            })
            .returning();
          const items = await tx
            .insert(orderItems)
            .values(
              input.items.map((item, position) => ({
                orderId: order.id,
                position,
                description: item.description,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
              })),
            )
            .returning();
          const body: OrderResponse = {
            id: order.id,
            creatorId: order.creatorId,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            status: order.status,
            totalCents: order.totalCents,
            createdAt: order.createdAt.toISOString(),
            items: items
              .sort((a, b) => a.position - b.position)
              .map(
                ({ id, position, description, quantity, unitPriceCents }) => ({
                  id,
                  position,
                  description,
                  quantity,
                  unitPriceCents,
                }),
              ),
          };
          await tx
            .update(idempotencyRequests)
            .set({ responseStatus: 201, responseBody: body })
            .where(eq(idempotencyRequests.id, claim.id));
          return { statusCode: 201, body };
        },
        { isolationLevel: 'read committed' },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Order creation unavailable; retry with the same request key',
      );
    }
  }
}
