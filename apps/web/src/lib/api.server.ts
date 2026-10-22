import "server-only";

import { cookies } from "next/headers";

export async function serverFetch(path: string): Promise<Response> {
  const name = process.env.AUTH_COOKIE ?? "orders_access";
  const cookie = (await cookies()).get(name);
  const base = process.env.API_URL ?? "http://127.0.0.1:4000";
  return fetch(`${base}/api${path}`, {
    headers: cookie ? { cookie: `${name}=${encodeURIComponent(cookie.value)}` } : {},
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}
