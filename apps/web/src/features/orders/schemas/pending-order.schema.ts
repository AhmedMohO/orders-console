import { z } from "zod";
import { orderInputSchema } from "./order.schema";

export const pendingAttemptSchema = z.object({
  staffId: z.int().positive().max(2147483647),
  key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[\x20-\x7e]+$/),
  input: orderInputSchema,
  state: z.enum(["sending", "unknown"]),
});
