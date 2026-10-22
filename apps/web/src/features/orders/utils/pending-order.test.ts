import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearPending,
  pendingStorageKey,
  readPending,
  savePending,
} from "./pending-order";
import type { PendingAttempt } from "@/features/orders/types/order";

test("pending recovery validates frozen input and stays isolated to its staff account", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    const attempt: PendingAttempt = {
      staffId: 1,
      key: "fixed-operation",
      state: "sending",
      input: {
        customerName: "Customer",
        customerEmail: "customer@example.com",
        items: [{ description: "Item", quantity: 1, unitPriceCents: 100 }],
        totalCents: 100,
      },
    };
    savePending(attempt);
    assert.deepEqual(readPending(1), { ...attempt, state: "unknown" });
    assert.equal(readPending(2), null);
    values.set(pendingStorageKey(2), values.get(pendingStorageKey(1))!);
    assert.throws(() => readPending(2));
    values.set(
      pendingStorageKey(1),
      JSON.stringify({
        ...attempt,
        input: { ...attempt.input, totalCents: 1 },
      }),
    );
    assert.throws(() => readPending(1));
    values.set(pendingStorageKey(1), "{");
    assert.throws(() => readPending(1));
    savePending(attempt);
    clearPending(1, attempt.key);
    assert.equal(readPending(1), null);
    assert.equal(values.has(pendingStorageKey(2)), true);
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

test("an older completion cannot remove a newer pending request for the same account", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    values.set(
      pendingStorageKey(1),
      JSON.stringify({ key: "newer-operation" }),
    );
    clearPending(1, "older-operation");
    assert.equal(
      values.get(pendingStorageKey(1)),
      JSON.stringify({ key: "newer-operation" }),
    );
    clearPending(1, "newer-operation");
    assert.equal(values.has(pendingStorageKey(1)), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
