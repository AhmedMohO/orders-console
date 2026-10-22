import type { PendingAttempt } from "@/features/orders/types/order";
import { pendingAttemptSchema } from "../schemas/pending-order.schema";

export const pendingStorageKey = (staffId: number) =>
  `orders.pending.${staffId}`;

export function readPending(staffId: number): PendingAttempt | null {
  const stored = sessionStorage.getItem(pendingStorageKey(staffId));
  if (!stored) return null;
  if (stored.length > 32768)
    throw new Error(
      "Saved submission is invalid. Discard it to continue.",
    );
  const value = pendingAttemptSchema.parse(JSON.parse(stored));
  if (value.staffId !== staffId)
    throw new Error(
      "Saved submission is invalid. Discard it to continue.",
    );
  return {
    staffId,
    key: value.key,
    input: value.input,
    state: "unknown",
  };
}

export function savePending(attempt: PendingAttempt): void {
  sessionStorage.setItem(
    pendingStorageKey(attempt.staffId),
    JSON.stringify(attempt),
  );
}

export function clearPending(staffId: number, requestKey: string): void {
  const key = pendingStorageKey(staffId);
  const stored = sessionStorage.getItem(key);
  if (!stored) return;
  const current = pendingAttemptSchema
    .pick({ key: true })
    .parse(JSON.parse(stored));
  if (current.key === requestKey) sessionStorage.removeItem(key);
}
