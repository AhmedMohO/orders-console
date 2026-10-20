# Web

Next.js for the Orders Console. Requires Bun 1.4+ and Node.js 24+.

Follow the root [setup instructions](../../README.md#install-and-run) first. Start the API, then run this command from the repository root:

```powershell
bun --env-file=.env run dev:web
```

Open [http://localhost:3000](http://localhost:3000). Set `API_URL` in the root `.env` to the API origin without `/api`. Next rewrites relative `/api/*` requests to Nest, which owns authentication and business rules. No auth token belongs in browser storage or response JSON.

## Orders and logout

The following UI behavior is planned for phase 6 and is not implemented yet:

Use Next/Previous to navigate cursor pages. Changing search, status, sort, direction, or page size resets navigation; Refresh and confirmed create/delete do the same. Date/amount sorting supports both directions. Failed navigation keeps the previous position for retry, and late responses cannot replace the current query.

Logout waits for server-side session revocation before clearing the signed-in view. A failed logout shows Retry. Logout or a 401 clears private rows and navigation history; late responses cannot restore them. Other tabs sharing the cookie lose access on their next request, while separate logins stay active.

## Checks

```powershell
bun run --filter web typecheck
bun run --filter web lint
```

## Build and start

Run from the repository root with the API available:

```powershell
bun --env-file=.env run build
bun --env-file=.env run --filter web start
```
