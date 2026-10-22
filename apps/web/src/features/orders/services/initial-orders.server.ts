import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { OrderListResponse } from "@repo/contracts/orders";
import { createLoader, type SearchParams } from "nuqs/server";
import { loadServerSession } from "@/features/auth/services/session.server";
import { serverFetch } from "@/lib/api.server";
import { orderQueryParsers } from "../schemas/order-query.schema";

const loadOrderQuery = createLoader(orderQueryParsers);

export async function loadInitialOrders(searchParams: SearchParams = {}) {
  const parsed = loadOrderQuery(searchParams);
  const query = { ...parsed, search: parsed.search.trim(), status: parsed.status ?? undefined };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const [user, ordersResponse] = await Promise.all([
    loadServerSession(),
    serverFetch(`/orders?${params}`),
  ]);
  if (!user || ordersResponse.status === 401) return null;
  if (!ordersResponse.ok) throw new Error("Unable to load orders. Please retry.");
  const orders = await ordersResponse.json() as OrderListResponse;
  const client = new QueryClient();
  client.setQueryData(["session"], user);
  client.setQueryData(["orders", user.id, query], {
    pages: [orders],
    pageParams: [undefined],
  });
  return dehydrate(client);
}
