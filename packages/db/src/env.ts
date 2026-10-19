export function requireDatabaseUrl(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("DATABASE_URL is required");
  }
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length <= 1
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("DATABASE_URL must be an explicit PostgreSQL URL with a host and database name");
  }
  return value.trim();
}
