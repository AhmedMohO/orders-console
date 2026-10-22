import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Enter a valid email.")
    .pipe(z.email({ error: "Enter a valid email." })),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(1024, "Password is too long."),
});
