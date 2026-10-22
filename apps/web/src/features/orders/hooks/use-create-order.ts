import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { CreateOrderRequest } from "@repo/contracts/orders";
import { ApiError, errorMessage } from "@/lib/api";
import { createOrder } from "@/features/orders/services/api";
import {
  clearPending,
  pendingStorageKey,
  readPending,
  savePending,
} from "../utils/pending-order";
import type { PendingAttempt } from "@/features/orders/types/order";

export function useCreateOrder(
  staffId: number,
  onCreated: () => void,
  onUnauthorized: () => void,
) {
  const mutation = useMutation({
    mutationFn: ({
      key,
      input,
      signal,
    }: PendingAttempt & { signal: AbortSignal }) => createOrder(key, input, signal),
  });

  const [state, setState] = useState(() => {
    try {
      return { attempt: readPending(staffId), error: "", blocked: false };
    } catch {
      return {
        attempt: null,
        error:
          "Cannot read saved submission. Discard local recovery explicitly before starting another order.",
        blocked: true,
      };
    }
  });

  const pendingAttempt = useRef(state.attempt);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  function updateAttempt(attempt: PendingAttempt | null, error = "") {
    pendingAttempt.current = attempt;
    if (mounted.current) setState({ attempt, error, blocked: false });
  }

  async function send(operation: PendingAttempt): Promise<boolean> {
    if (controller.current) return false;
    const pending = { ...operation, state: "sending" as const };
    try {
      savePending(pending);
    } catch {
      setState((previous) => ({
        ...previous,
        error: "Recovery could not be saved. No request was sent. Allow session storage and retry.",
      }));
      return false;
    }

    updateAttempt(pending);
    const request = new AbortController();
    controller.current = request;

    try {
      await mutation.mutateAsync({
        ...pending,
        signal: request.signal,
      });
      clearPending(staffId, pending.key);
      updateAttempt(null);
      if (mounted.current) onCreated();
      return true;
    } catch (error) {
      let recovery: PendingAttempt | null = { ...pending, state: "unknown" };
      let message =
        "Could not confirm if the order was saved due to a network issue. Please retry to safely complete or verify your order.";
      if (
        error instanceof ApiError &&
        [400, 403, 404, 413, 422, 429].includes(error.status)
      ) {
        try {
          clearPending(staffId, pending.key);
          recovery = null;
          message = errorMessage(error);
        } catch {
          message = "The request was rejected, but local recovery could not be cleared. Retry after allowing session storage.";
        }
      }

      updateAttempt(recovery, message);
      if (mounted.current && error instanceof ApiError && error.status === 401)
        onUnauthorized();
      return false;
    } finally {
      controller.current = null;
    }
  }

  async function submit(input: CreateOrderRequest) {
    if (state.blocked || pendingAttempt.current) return false;
    return send({ staffId, key: crypto.randomUUID(), input, state: "sending" });
  }

  async function retry() {
    return pendingAttempt.current ? send(pendingAttempt.current) : false;
  }

  function discard() {
    if (
      controller.current ||
      !window.confirm(
        "Discard local recovery? This does not cancel a request that may already have saved an order. Check existing orders before creating it again.",
      )
    )
      return;
    try {
      sessionStorage.removeItem(pendingStorageKey(staffId));
    } catch {
      setState((previous) => ({
        ...previous,
        error: "Cannot discard local recovery. Allow session storage and retry.",
      }));
      return;
    }
    updateAttempt(null);
  }
  return { ...state, submit, retry, discard };
}
