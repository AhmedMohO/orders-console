import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderQuery } from "@repo/contracts/orders";
import { errorMessage } from "@/lib/api";
import { listOrders } from "../services/api";

export function useOrders(query: OrderQuery, staffId: number) {
  const client = useQueryClient();
  const queryKey = ["orders", staffId, query] as const;
  const result = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listOrders({ ...query, after: pageParam }, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    gcTime: 0,
  });

  function previous() {
    if (result.isFetching || !result.data || result.data.pages.length < 2)
      return;
    client.setQueryData(queryKey, {
      pages: result.data.pages.slice(0, -1),
      pageParams: result.data.pageParams.slice(0, -1),
    });
  }

  return {
    data: result.data?.pages.at(-1),
    page: result.data?.pages.length ?? 1,
    loading: result.isPending || result.isFetching,
    error: result.error ? errorMessage(result.error) : "",
    next: result.fetchNextPage,
    previous,
    reset: () => client.resetQueries({ queryKey: ["orders", staffId] }),
    retry: result.isFetchNextPageError ? result.fetchNextPage : result.refetch,
  };
}
