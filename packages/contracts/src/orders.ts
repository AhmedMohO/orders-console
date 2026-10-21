export const orderStatuses = ["pending", "processing", "completed", "cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export interface OrderQuery {
  search?: string;
  status?: OrderStatus;
  sort?: 'createdAt' | 'totalCents';
  direction?: 'asc' | 'desc';
  pageSize?: number;
  after?: string;
}

export interface OrderSummary {
  id: number;
  creatorId: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
}

export interface OrderListResponse {
  items: OrderSummary[];
  nextCursor: string | null;
}

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

export interface OrderResponse extends OrderSummary {
  items: (CreateOrderItemRequest & { id: number; position: number })[];
}
