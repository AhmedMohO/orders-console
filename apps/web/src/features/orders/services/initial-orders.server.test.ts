import { test, mock } from "bun:test";
import assert from "node:assert/strict";
import { QueryClient, hydrate } from "@tanstack/react-query";

mock.module("server-only", () => ({}));
let requestCookies = new Map([
  ["orders_access", { name: "orders_access", value: "private-token" }],
  ["analytics", { name: "analytics", value: "unrelated-cookie" }],
]);
mock.module("next/headers", () => ({ cookies: async () => requestCookies }));
const { loadInitialOrders } = await import("./initial-orders.server");
const { loadServerSession } = await import("@/features/auth/services/session.server");

const user = { id: 7, name: "Staff", email: "staff@example.com", role: "admin" };
const orders = { items: [], nextCursor: null };

test("the shared layout can load the session without fetching orders", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async (url: string) => {
    requests.push(String(url));
    return Response.json(user);
  } });
  try {
    assert.deepEqual(await loadServerSession(), user);
    assert.equal(requests.length, 1);
    assert.ok(requests[0].endsWith("/api/auth/me"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("initial reads run together, forward the cookie without caching, and hydrate staff-scoped data", async () => {
  const originalFetch = globalThis.fetch;
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const requests: { url: string; options?: RequestInit }[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async (url: string | URL | Request, options?: RequestInit) => {
    requests.push({ url: String(url), options });
    if (requests.length === 2) started.resolve();
    await release.promise;
    return Response.json(String(url).includes("/auth/me") ? user : orders);
  } });
  const client = new QueryClient();
  try {
    const loading = loadInitialOrders();
    await started.promise;
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.options?.cache, "no-store");
      assert.equal(request.options?.redirect, "error");
      assert.ok(request.options?.signal instanceof AbortSignal);
      assert.equal(new Headers(request.options?.headers).get("cookie"), "orders_access=private-token");
    }
    assert.ok(requests[0].url.endsWith("/api/auth/me"));
    const query = new URL(requests[1].url).searchParams;
    assert.equal(query.get("sort"), "createdAt");
    assert.equal(query.get("direction"), "desc");
    assert.equal(query.get("pageSize"), "50");
    release.resolve();
    const state = await loading;
    assert.ok(state);
    hydrate(client, state);
    assert.deepEqual(client.getQueryData(["session"]), user);
    assert.deepEqual(client.getQueryData(["orders", 7, {
      search: "", sort: "createdAt", direction: "desc", pageSize: 50,
    }]), { pages: [orders], pageParams: [undefined] });
    assert.equal(client.getQueryData(["orders", 8, {}]), undefined);
    assert.ok(!JSON.stringify(state).includes("private-token"));
  } finally {
    release.resolve();
    client.clear();
    globalThis.fetch = originalFetch;
  }
});

test("unauthorized bootstrap returns no private state; other failures stay retryable", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [401, 403, 503]) {
      Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async () => new Response("private error details", { status }) });
      if (status === 401) assert.equal(await loadInitialOrders(), null);
      else await assert.rejects(loadInitialOrders(), /Unable to load session/);
    }
    for (const status of [401, 503]) {
      Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async (url: string) =>
        String(url).includes("/auth/me") ? Response.json(user) : new Response(null, { status }) });
      if (status === 401) assert.equal(await loadInitialOrders(), null);
      else await assert.rejects(loadInitialOrders(), /Unable to load orders/);
    }
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async () => { throw new TypeError("Offline"); } });
    await assert.rejects(loadInitialOrders(), /Offline/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server reads use the configured auth cookie from each request, including anonymous requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalCookies = requestCookies;
  const originalName = process.env.AUTH_COOKIE;
  const originalUrl = process.env.API_URL;
  const forwarded: (string | null)[] = [];
  process.env.AUTH_COOKIE = "staff_session";
  process.env.API_URL = "https://api.example.test";
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async (url: string, options?: RequestInit) => {
    assert.equal(String(url), "https://api.example.test/api/auth/me");
    const cookie = new Headers(options?.headers).get("cookie");
    forwarded.push(cookie);
    return cookie ? Response.json(user) : new Response(null, { status: 401 });
  } });
  try {
    for (const value of ["first-token", "second-token"]) {
      requestCookies = new Map([
        ["staff_session", { name: "staff_session", value }],
        ["orders_access", { name: "orders_access", value: "wrong-cookie" }],
      ]);
      assert.deepEqual(await loadServerSession(), user);
    }
    requestCookies = new Map([["analytics", { name: "analytics", value: "unrelated" }]]);
    assert.equal(await loadServerSession(), null);
    assert.deepEqual(forwarded, ["staff_session=first-token", "staff_session=second-token", null]);
  } finally {
    globalThis.fetch = originalFetch;
    requestCookies = originalCookies;
    if (originalName === undefined) delete process.env.AUTH_COOKIE;
    else process.env.AUTH_COOKIE = originalName;
    if (originalUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalUrl;
  }
});
