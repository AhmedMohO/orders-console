# API

NestJS API backed by PostgreSQL and Drizzle. Requires Bun 1.4+, Node.js 24+, and PostgreSQL.

Follow the root [setup instructions](../../README.md#install-and-run) to install dependencies, configure `.env`, and prepare the database. Run these commands from the repository root:

```powershell
bun --env-file=.env run dev:api
```

The API runs on API_PORT (default: 4000). Next.js proxies browser requests from /api/* to the API.

GET /api/health — Public endpoint returning { "ok": true }.

POST /api/auth/login — Accepts email and password, creates a session, sets an HttpOnly cookie, and returns staff information (including role).

GET /api/auth/me — Requires authentication and returns the logged-in staff member.

POST /api/auth/logout — Revokes the current session, clears the cookie, and returns 204, including on repeated requests.

Security:

All requests that modify data (including login and logout) must have an Origin header matching APP_ORIGIN.

Login is limited to 5 attempts per minute per IP. Proxy-forwarded IP headers are ignored, so clients behind the same proxy share a rate-limit bucket.

JSON request bodies are limited to 32 KB.

Authentication uses an HttpOnly cookie with Path=/api, SameSite=Lax, and a 15-minute expiration.

Cookies are Secure in production (HTTPS required). Local HTTP development uses development/test mode.

Tokens are never returned in JSON or accepted through URLs or Authorization headers.

Orders and Sessions:

- Orders API:

GET /api/orders supports:

search and status for filtering.

sort=createdAt|totalCents and direction=asc|desc for sorting.

pageSize between 1 and 100 (default: 50).

- Session management:

Login creates a PostgreSQL session and issues a 15-minute JWT cookie.

Every protected request validates the session and checks the staff member's current role.

Logout checks the Origin, revokes the session, and clears the cookie. It returns 204 even if the user is already logged out.

Logging out one session does not invalidate other sessions. Requests already authorized may finish.

## Checks

```powershell
bun run test:api
bun run --filter api typecheck
bun run --filter api lint
```

Configuration validation does not require a database connection.

Authentication integration tests use the root .env.test file and a verified, separate PostgreSQL database ending in _test.

Tests cover authentication, sessions, guards, validation, token security across API instances, lost logout responses, signing failures, database failures, Origin checks, roles, cookies, and input validation.

Orders tests are implemented in phases 4–5.
Next.js browser cookie forwarding is tested in phase 6.

To start without file watching:

```powershell
bun --env-file=.env run --filter api start
```
