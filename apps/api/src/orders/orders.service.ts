import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  and,
  eq,
  idempotencyRequests,
  orderItems,
  orders,
  type Database,
} from '@repo/db';
import type { OrderResponse } from '@repo/contracts/orders';
import { DB } from '../common/consts/tokens.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';

@Injectable()
export class OrdersService {
  constructor(@Inject(DB) private readonly db: Database) { }

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
