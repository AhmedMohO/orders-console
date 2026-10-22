import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { OrderListResponse } from "@repo/contracts/orders";
import { loadServerSession } from "@/features/auth/services/session.server";
import { serverFetch } from "@/lib/api.server";
import { initialOrderQuery } from "../schemas/order-query.schema";

export async function loadInitialOrders() {
  const params = new URLSearchParams({
    ...initialOrderQuery,
    pageSize: String(initialOrderQuery.pageSize),
  });
  const [user, ordersResponse] = await Promise.all([
    loadServerSession(),
    serverFetch(`/orders?${params}`),
  ]);
  if (!user || ordersResponse.status === 401) return null;
  if (!ordersResponse.ok) throw new Error("Unable to load orders. Please retry.");
  const orders = await ordersResponse.json() as OrderListResponse;
  const client = new QueryClient();
  client.setQueryData(["session"], user);
  client.setQueryData(["orders", user.id, initialOrderQuery], {
    pages: [orders],
    pageParams: [undefined],
  });
  return dehydrate(client);
}
