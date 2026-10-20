export const orderStatuses = ["pending", "processing", "completed", "cancelled"] as const;
export type OrderStatus = (typeof orderStatuses)[number];
