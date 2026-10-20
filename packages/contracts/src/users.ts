export const userRoles = ["admin", "agent"] as const;
export type UserRole = (typeof userRoles)[number];

// Public fields are explicit: adding a database column cannot expose it over HTTP.
export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
