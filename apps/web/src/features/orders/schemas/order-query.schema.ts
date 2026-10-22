import { z } from "zod";
import { orderStatuses } from "@repo/contracts/orders";
import type { OrderQuery } from "@repo/contracts/orders";

export const initialOrderQuery = {
  search: "",
  sort: "createdAt",
  direction: "desc",
  pageSize: 50,
} satisfies OrderQuery;

export const orderQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, "Search must contain at most 100 characters.")
    .refine(
      (value) => !value.includes("\0"),
      "Search contains an invalid character.",
    )
    .optional(),
  status: z.enum(orderStatuses).optional(),
  sort: z.enum(["createdAt", "totalCents"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  pageSize: z.int().min(1).max(100).optional(),
  after: z.string().min(1).max(2048).optional(),
});
