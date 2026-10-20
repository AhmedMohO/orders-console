import type { UserResponse } from "../src/users.js";

const user: UserResponse = { id: 1, name: "Staff", email: "staff@example.com", role: "agent", createdAt: "2026-10-19T00:00:00.000Z" };
// @ts-expect-error Database credentials are never a public field.
user.passwordHash;
// @ts-expect-error HTTP dates are JSON strings, not database Date instances.
const date: UserResponse["createdAt"] = new Date();
void date;
