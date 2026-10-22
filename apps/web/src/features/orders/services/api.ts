import type {
  CreateOrderRequest,
  OrderListResponse,
  OrderQuery,
  OrderResponse,
} from "@repo/contracts/orders";
import { api } from "@/lib/api";
import { orderInputSchema } from "../schemas/order.schema";
import { orderQuerySchema } from "../schemas/order-query.schema";

export function listOrders(query: OrderQuery, signal: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(orderQuerySchema.parse(query))) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return api<OrderListResponse>(`/orders?${params}`, { signal });
}

export const createOrder = (
  key: string,
  input: CreateOrderRequest,
  signal: AbortSignal,
) =>
  api<OrderResponse>("/orders", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(orderInputSchema.parse(input)),
    signal,
  });

export const deleteOrder = (id: number) =>
  api<void>(`/orders/${id}`, { method: "DELETE" });
