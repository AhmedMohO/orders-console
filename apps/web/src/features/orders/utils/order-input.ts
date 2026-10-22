import type { CreateOrderRequest } from "@repo/contracts/orders";
import type { OrderDraft } from "../types/order";
import {
  orderDraftSchema,
  orderInputSchema,
  unitPriceSchema,
} from "../schemas/order.schema";

export const parseMoney = (value: string) => unitPriceSchema.parse(value);

export function buildOrderInput(draft: OrderDraft): CreateOrderRequest {
  const validated = orderDraftSchema.parse(draft);
  const items = validated.items.map(({ unitPrice, ...item }) => ({
    ...item,
    unitPriceCents: unitPrice,
  }));
  return orderInputSchema.parse({
    customerName: validated.customerName,
    customerEmail: validated.customerEmail,
    items,
    totalCents: items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    ),
  });
}
