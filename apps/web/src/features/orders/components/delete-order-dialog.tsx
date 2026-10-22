import type { OrderSummary } from "@repo/contracts/orders";

function openDialog(dialog: HTMLDialogElement | null) {
  if (!dialog) return;
  dialog.showModal();
  return () => dialog.close();
}

export function DeleteOrderDialog({
  order,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  order: Pick<OrderSummary, "id" | "customerName">;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <dialog
      ref={openDialog}
      aria-labelledby="delete-order-title"
      aria-describedby="delete-order-description"
      aria-busy={busy}
      className="m-auto max-h-dvh w-full max-w-md overflow-y-auto rounded-lg border border-border bg-white p-6 text-foreground backdrop:bg-foreground/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onConfirm();
      }}>
        <h2 id="delete-order-title">Delete order #{order.id}?</h2>
        <p id="delete-order-description" className="mt-3 wrap-anywhere text-muted">
          Delete the order for {order.customerName} and all its items? This cannot be undone.
        </p>
        {error && <p role="alert" className="my-3 rounded-md bg-error-surface px-4 py-3 wrap-anywhere text-error">{error}</p>}
        <fieldset disabled={busy} className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button type="button" autoFocus onClick={onCancel}>Cancel</button>
          <button type="submit" className="border-danger bg-danger text-white enabled:hover:border-danger-hover enabled:hover:bg-danger-hover">
            {busy ? "Deleting…" : "Delete order"}
          </button>
        </fieldset>
      </form>
    </dialog>
  );
}
