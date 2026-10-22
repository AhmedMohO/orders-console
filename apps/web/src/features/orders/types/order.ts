import type { z } from "zod";
import type { orderDraftSchema } from "../schemas/order.schema";
import type { pendingAttemptSchema } from "../schemas/pending-order.schema";

export type PendingAttempt = z.infer<typeof pendingAttemptSchema>;
export type OrderDraft = z.input<typeof orderDraftSchema>;
