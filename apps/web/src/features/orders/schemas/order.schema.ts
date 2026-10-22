import { z } from "zod";

const quantityError = "Quantity must be a whole number from 1 to 999.";
const priceError = "Unit price must be EGP 0.01–100,000.00.";
const totalError =
  "Order total must match the items and be at most EGP 20,000,000.00.";
const quantitySchema = z
  .int({ error: quantityError })
  .min(1, quantityError)
  .max(999, quantityError);
const priceCentsSchema = z
  .int({ error: priceError })
  .min(1, priceError)
  .max(10000000, priceError);

export const unitPriceSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(\.\d{1,2})?$/,
    "Price must be a number and with at most two decimal places.",
  )
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(priceCentsSchema);

const orderItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Descriptions must contain 1–200 characters.")
    .refine(
      (value) => [...value].length <= 200,
      "Descriptions must contain 1–200 characters.",
    ),
  quantity: quantitySchema,
  unitPriceCents: priceCentsSchema,
});

const orderSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, "Customer name must contain 1–100 characters.")
    .refine(
      (value) => [...value].length <= 100,
      "Customer name must contain 1–100 characters.",
    ),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Enter a valid customer email.")
    .pipe(z.email({ error: "Enter a valid customer email." })),
  items: z
    .array(orderItemSchema)
    .min(1, "Include 1–5 items.")
    .max(5, "Include 1–5 items."),
  totalCents: z
    .int({ error: totalError })
    .min(1, totalError)
    .max(2000000000, totalError),
});

export const orderInputSchema = orderSchema.refine(
  (input) =>
    input.totalCents ===
    input.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    ),
  { message: totalError, path: ["totalCents"] },
);

export const orderDraftSchema = orderSchema
  .omit({ items: true, totalCents: true })
  .extend({
    items: z
      .array(
        orderItemSchema.omit({ unitPriceCents: true }).extend({
          quantity: z
            .string()
            .pipe(z.coerce.number({ error: quantityError }))
            .pipe(quantitySchema),
          unitPrice: unitPriceSchema,
        }),
      )
      .min(1, "Include 1–5 items.")
      .max(5, "Include 1–5 items."),
  });
