# Orders Console

Next.js frontend, NestJS API, and PostgreSQL with Drizzle.

## Install and run

Requires Bun 1.4+, Node.js 24+, and local PostgreSQL. Run commands from the repository root.

1. Create a database user and database:

   **Via PostgreSQL CLI:**

   ```sh
   createuser -h localhost -U postgres --pwprompt orders_app
   createdb -h localhost -U postgres --owner=orders_app orders_console
   ```

   _(Windows note: if `createuser` is not recognized, run with the full path, e.g. `& "C:\Program Files\PostgreSQL\<version>\bin\createuser.exe"`, or add PostgreSQL's `bin` directory to your `PATH`)._

   **Or via any SQL client (`psql`, pgAdmin, VS Code extension):**

   ```sql
   CREATE USER orders_app WITH PASSWORD 'your_password';
   CREATE DATABASE orders_console OWNER orders_app;
   ```

2. Install dependencies and copy the environment template (PowerShell):

   ```powershell
   bun install --frozen-lockfile
   Copy-Item .env.example .env
   bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   In `.env`, replace the password in `DATABASE_URL` with the one you chose and set `JWT_SECRET` to the generated value. Keep `.env` private. Leave `API_PORT=4000`, `API_URL=http://localhost:4000`, and `APP_ORIGIN=http://localhost:3000` for local use. `AUTH_COOKIE=orders_access` and `TOKEN_SECONDS=900` configure the cookie name and 15-minute session lifetime.

3. Validate the root `.env`, apply the schema, seed the database, and start both apps:

   ```powershell
   bun run check:env
   bun run db:migrate
   bun run db:seed --count 600000 --batch-size 1000 --seed 42
   bun run db:check
   bun run dev
   ```

### Seeded accounts:

| Role  | Email               | Password        |
| ----- | ------------------- | --------------- |
| Admin | `admin@example.com` | `AdminDemo123!` |
| Agent | `agent@example.com` | `AgentDemo123!` |

Passwords are stored as Argon2id hashes. Sign in with one of these accounts to search orders and create phone orders; admins can also delete individual orders.

Open [Orders Console](http://localhost:3000). The public API route is [health](http://localhost:4000/api/health). Browser requests use the Next `/api` rewrite; see [API routes and cookie/Origin requirements](apps/api/README.md) and [browser behavior and checks](apps/web/README.md).

## Checks

```powershell
bun run check:env
bun run db:test:migrate
bun run test
bun run typecheck
bun run lint
bun run test:race -- --concurrency 5
```

Integration tests require a separate database, such as `orders_console_test`, owned by your local application role. Copy `.env.test.example` to `.env.test`, configure its test credentials and a separate generated signing secret, and run `bun run db:test:migrate` before tests. Test helpers verify test mode.

## Code review task

### Security Category Issues

1. Hardcoded secret: I have put the secret in an environment variable and validated it at startup and in tests.
2. Pass Tokens in query: Removed query-string tokens and used HttpOnly cookies to prevent token exposure in URLs.
3. jwt.decode: typically we use jwt.decode for debugging or getting token payload without verification but not for varification instead we must use jwt.verify to verify the token signature.
4. Client side authorization: Added server-side role guards and admin-only order deletion.
5. Plain password: Replaced plaintext password comparisons with Argon2id password hashing and verification.

### Design Category Issues

1. Spliting auth header with no validation: either we validate that this is a bearer or remove it completely as we are using httpOnly cookies.
2. No token expiration: Added 15-minute token expiration and database-backed sessions that can be revoked on logout.
3. No error handling, ratelimting, input validation: Added error handling, ratelimting, input validation.

## Client token storage

I store the 15-minute token in an HttpOnly, SameSite=Lax cookie, with Secure enabled over HTTPS. HttpOnly prevents JavaScript from reading it. Exact Origin checks on unsafe requests help prevent CSRF. Logout deletes its server-side session and clears the cookie, so copied tokens fail subsequent authentication checks.

## Product question: “Delete all cancelled orders”

QS 1: Could you tell me more about the issue we are facing with cancelled orders?

Suggestion: I suggest hiding cancelled orders by default instead of deleting them permanently. This way, we keep the order history for auditing, reporting, and future reference while keeping the orders list clean. We can also add a filter to view cancelled orders when needed.

## What I skipped and why

- Registration, password reset, MFA, and refresh tokens: seeded staff accounts keep the scope small; sessions expire after 15 minutes.
- Snapshot pagination, page-number jumps, and logout-all-devices: cursor navigation and revoking the current session cover the required workflow.
- Optimistic updates: Given the time constraints, I prioritized following best practices and delivering the core application with the fewest possible logic and business errors.

See [DECISIONS.md](DECISIONS.md) for design choices and AI use.
