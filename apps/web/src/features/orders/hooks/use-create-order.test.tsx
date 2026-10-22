import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { useCreateOrder } from "./use-create-order";
import { pendingStorageKey } from "../utils/pending-order";

const input = {
  customerName: "Customer",
  customerEmail: "customer@example.com",
  items: [{ description: "Item", quantity: 1, unitPriceCents: 100 }],
  totalCents: 100,
};

async function withHook(
  respond: (options: RequestInit) => Promise<Response>,
  run: (hook: ReturnType<typeof useCreateOrder>, values: Map<string, string>) => Promise<void>,
  saved?: string,
) {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const fetch = globalThis.fetch;
  const values = new Map<string, string>();
  if (saved) values.set(pendingStorageKey(1), saved);
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: (_url: string, options: RequestInit) => respond(options),
  });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  let hook!: ReturnType<typeof useCreateOrder>;
  function Capture() {
    // Server rendering leaves effects unmounted, so late responses must skip UI callbacks.
    hook = useCreateOrder(1, () => assert.fail("Updated an unmounted form"), () => assert.fail("Redirected an unmounted form"));
    return null;
  }
  try {
    renderToStaticMarkup(<QueryClientProvider client={client}><Capture /></QueryClientProvider>);
    await run(hook, values);
  } finally {
    client.clear();
    globalThis.fetch = fetch;
    if (storage) Object.defineProperty(globalThis, "sessionStorage", storage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
}

test("recovery is saved before sending, duplicate submits and retries are locked, late success clears recovery", async () => {
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  let requests = 0;
  await withHook(async () => {
    requests++;
    assert.ok(sessionStorage.getItem(pendingStorageKey(1)));
    started.resolve();
    return response.promise;
  }, async (hook, values) => {
    const submission = hook.submit(input);
    await started.promise;
    assert.equal(await hook.submit(input), false);
    assert.equal(await hook.retry(), false);
    hook.discard();
    assert.equal(values.size, 1);
    response.resolve(Response.json({}));
    assert.equal(await submission, true);
    assert.equal(requests, 1);
    assert.equal(values.size, 0);
    assert.equal(await hook.retry(), false);
  });
});

test("only definite rejections unlock a new order; uncertain failures retry the original key and payload", async () => {
  for (const status of [400, 403, 404, 413, 422, 429, 401, 409, 500]) {
    const requests: RequestInit[] = [];
    await withHook(async (options) => {
      requests.push(options);
      return Response.json({ message: "Rejected" }, { status });
    }, async (hook, values) => {
      assert.equal(await hook.submit(input), false);
      const definite = [400, 403, 404, 413, 422, 429].includes(status);
      assert.equal(values.size, definite ? 0 : 1);
      if (definite) {
        assert.equal(await hook.retry(), false);
        await hook.submit(input);
        assert.notEqual(new Headers(requests[0].headers).get("Idempotency-Key"), new Headers(requests[1].headers).get("Idempotency-Key"));
      } else {
        assert.equal(await hook.submit(input), false);
        assert.equal(await hook.retry(), false);
        assert.equal(requests[0].body, requests[1].body);
        assert.equal(new Headers(requests[0].headers).get("Idempotency-Key"), new Headers(requests[1].headers).get("Idempotency-Key"));
      }
      assert.equal(requests.length, 2);
    });
  }
});

test("network, abort and invalid response failures keep the same retryable operation", async () => {
  for (const failure of [new TypeError("Offline"), new DOMException("Aborted", "AbortError"), null]) {
    const requests: RequestInit[] = [];
    await withHook(async (options) => {
      requests.push(options);
      if (failure) throw failure;
      return new Response("{");
    }, async (hook, values) => {
      assert.equal(await hook.submit(input), false);
      assert.equal(values.size, 1);
      assert.equal(await hook.submit(input), false);
      assert.equal(await hook.retry(), false);
      assert.equal(requests.length, 2);
      assert.equal(requests[0].body, requests[1].body);
      assert.equal(new Headers(requests[0].headers).get("Idempotency-Key"), new Headers(requests[1].headers).get("Idempotency-Key"));
    });
  }
});

test("storage write failure prevents the request and does not leave a submission lock", async () => {
  let requests = 0;
  await withHook(async () => { requests++; return Response.json({}); }, async (hook) => {
    const save = sessionStorage.setItem;
    sessionStorage.setItem = () => { throw new Error("Storage blocked"); };
    assert.equal(await hook.submit(input), false);
    assert.equal(requests, 0);
    sessionStorage.setItem = save;
    assert.equal(await hook.submit(input), true);
    assert.equal(requests, 1);
  });
});

test("cleanup failure after success or rejection retains a retryable attempt", async () => {
  for (const status of [200, 400]) {
    await withHook(async () => Response.json({}, { status }), async (hook, values) => {
      const remove = sessionStorage.removeItem;
      sessionStorage.removeItem = () => { throw new Error("Storage blocked"); };
      assert.equal(await hook.submit(input), false);
      assert.equal(values.size, 1);
      assert.equal(await hook.submit(input), false);
      sessionStorage.removeItem = remove;
      assert.equal(await hook.retry(), status === 200);
      assert.equal(values.size, 0);
    });
  }
});

test("invalid recovery blocks creation, and valid recovery retries the saved key", async () => {
  await withHook(async () => assert.fail("Sent with invalid recovery"), async (hook) => {
    assert.equal(hook.blocked, true);
    assert.equal(await hook.submit(input), false);
  }, "{");
  await withHook(async (options) => {
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), "saved-key");
    assert.deepEqual(JSON.parse(String(options.body)), input);
    return Response.json({});
  }, async (hook) => {
    assert.equal(hook.attempt?.state, "unknown");
    assert.equal(await hook.submit(input), false);
    assert.equal(await hook.retry(), true);
  }, JSON.stringify({ staffId: 1, key: "saved-key", input, state: "sending" }));
});
