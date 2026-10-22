import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body?.message.join(". ")
      : body?.message;
    throw new ApiError(
      response.status,
      typeof message === "string"
        ? message
        : `Request failed (${response.status})`,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues[0]?.message ?? "Check the entered details.";
  return error instanceof ApiError
    ? error.message
    : "Cannot reach the server. Please retry.";
}
