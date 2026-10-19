# API

NestJS API backed by PostgreSQL and Drizzle. Requires Bun 1.4+, Node.js 24+, and PostgreSQL.

Follow the root [setup instructions](../../README.md#install-and-run) to install dependencies, configure `.env`, and prepare the database. Run these commands from the repository root:

```powershell
bun --env-file=.env run dev:api
```

The API listens on `API_PORT` (4000 by default):

- `GET /health` returns `{ "ok": true }`.
- `GET /users` returns demo users from the database.

## Checks

```powershell
bun run test
bun run --filter api typecheck
bun run --filter api lint
```

Tests run without a database connection. To start without file watching:

```powershell
bun --env-file=.env run --filter api start
```
