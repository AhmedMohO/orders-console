export const orderStatuses = ["pending", "processing", "completed", "cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export interface CreateOrderItemRequest {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateOrderRequest {
  customerName: string;
  customerEmail: string;
  items: CreateOrderItemRequest[];
  totalCents: number;
}

export interface OrderResponse {
  id: number;
  creatorId: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  items: (CreateOrderItemRequest & { id: number; position: number })[];
}
