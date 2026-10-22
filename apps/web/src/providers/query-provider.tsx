"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [client] = useState(() => {
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => {
          if (error instanceof ApiError && error.status === 401) {
            client.clear();
            client.setQueryData(["session"], null);
            router.replace("/login");
            router.refresh();
          }
        },
      }),
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 },
        mutations: { retry: false },
      },
    });
    return client;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
