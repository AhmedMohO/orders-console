import "server-only";

import { cache } from "react";
import type { UserResponse } from "@repo/contracts/users";

export const loadServerSession = cache(async (cookie: string): Promise<UserResponse | null> => {
  const base = process.env.API_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(`${base}/api/auth/me`, {
    headers: { cookie },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to load session. Please retry.");
  return response.json();
});
