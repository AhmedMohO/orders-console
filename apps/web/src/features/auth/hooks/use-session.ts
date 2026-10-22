import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser } from "../services/api";
import type { UserResponse } from "@repo/contracts/users";

export function useSession() {
  const router = useRouter();
  const client = useQueryClient();
  const session = useQuery<UserResponse | null>({
    queryKey: ["session"],
    queryFn: ({ signal }) => getCurrentUser(signal),
  });
  const unauthorized = useCallback(() => {
    client.clear();
    client.setQueryData(["session"], null);
    router.replace("/login");
    router.refresh();
  }, [client, router]);
  return { ...session, unauthorized };
}
