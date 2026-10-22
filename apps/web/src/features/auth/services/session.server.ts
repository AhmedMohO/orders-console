import "server-only";

import { cache } from "react";
import type { UserResponse } from "@repo/contracts/users";
import { serverFetch } from "@/lib/api.server";

export const loadServerSession = cache(async (): Promise<UserResponse | null> => {
  const response = await serverFetch("/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load session. Please retry.");
  return response.json();
});
