import type { LoginRequest, UserResponse } from "@repo/contracts/users";
import { api } from "@/lib/api";
import { loginSchema } from "../schemas/login.schema";

export const getCurrentUser = (signal?: AbortSignal) =>
  api<UserResponse>("/auth/me", { signal });
export const login = (input: LoginRequest) =>
  api<UserResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(loginSchema.parse(input)),
  });
export const logout = () => api<void>("/auth/logout", { method: "POST" });
