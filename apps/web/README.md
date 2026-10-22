# Web

Next.js frontend for the Orders Console. Built with React 19, TanStack Query v5, React Hook Form, Tailwind CSS v4, and Zod.

Requires **Bun 1.4+** and **Node.js 24+**.

---

## Getting Started

Follow the [root setup instructions](../../README.md#install-and-run) first to configure your environment variables and database.

### Run in Development

Start both the web frontend (`http://localhost:3000`) and the API backend (`http://localhost:4000`) concurrently from the repository root:

```powershell
bun run dev
```

Or run only the web frontend:

```powershell
bun --env-file=.env run --filter web dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build & Production Run

```powershell
$env:NODE_ENV = 'production'
bun run build
bun --env-file=.env run --filter web start
```

Use HTTPS and production API configuration for deployment. For local HTTP login, use the development commands above. Remove the shell override with `Remove-Item Env:NODE_ENV` when returning to development.

---

## Authentication & API Routing

- **Next.js Rewrite**: All relative browser calls to `/api/*` are rewritten by Next.js to the NestJS API (configured via `API_URL` in `.env`, e.g. `http://localhost:4000`).
- **Server Reads**: Feature loaders call `serverFetch("/resource")` from `src/lib/api.server.ts`. It reads and forwards only `AUTH_COOKIE` (default `orders_access`) using the same server environment as the API. Pages do not pass cookies. The helper returns a `Response`; loaders handle resource-specific errors and hydration. Reads use a ten-second timeout, no response caching, and no redirects.
- **HttpOnly Cookies**: Session tokens (`orders_access`) are stored exclusively in secure `HttpOnly` cookies. No authentication tokens are ever stored in `localStorage`, `sessionStorage`, or JavaScript state.
- **CSRF & Origin Guard**: Non-GET/HEAD mutations automatically send the browser's `Origin` header matching `APP_ORIGIN` (`http://localhost:3000`).

---

## Key Features & Architecture

### 1. Orders Table & Cursor Pagination

- **Keyset Cursor Pagination**: Uses opaque `nextCursor` tokens for reliable, fast navigation.
- **Filters & Reset**: Changing search, status, sort field, direction, or page size automatically resets pagination to page one.
- **Sorting**: Supports ascending and descending sorting by creation date (`createdAt`) and amount (`totalCents`).
- **Debounced Search**: Search input debounces for 1 second to prevent excessive backend queries; other filters apply instantly.
- **TanStack Query Caching**: Manages server state and cached pages. Previous page navigation and retries use cache without extra index counters.

### 2. Resilient Order Creation & Idempotency

- **Forms & Client Validation**: Login and order forms use React Hook Form Zod schemas validate customer information, positive quantities (1–999), and exact bounded totals (`totalCents`) in integer minor units (EGP cents).
- **Double-Click Lock**: Submissions lock synchronously via React refs (`pendingAttempt`) and an active `AbortController` before state updates.
- **Server Confirmation**: The table displays confirmed server rows only. Saving and unknown-outcome notices stay in the form; successful creation refreshes the current filters from page one. Optimistic creation is omitted at the user's request.
- **Session Storage Crash Recovery**: If a network error, timeout, or tab refresh occurs while an order is in-flight, the payload and its unique `Idempotency-Key` are saved to `sessionStorage` (scoped by staff ID). The agent can safely retry without creating duplicate orders.
- **Explicit Discard**: Staff can discard local recovery after inspecting existing orders.

### 3. Role-Based Permissions

- **Admin & Agent**: Can view, filter, paginate, and create orders.
- **Admin Only**: Can delete individual orders with confirmation modal protection and lockouts during deletion.

---

## Project Structure

```
apps/web/
├── src/
│   ├── app/                 # Root layout, /login, (authenticated)/layout + / page
│   ├── components/layout/   # Shared authenticated shell and Header
│   ├── features/orders/     # Order management feature module:
│   │   ├── components/      # OrdersWorkspace, OrderForm, OrdersTable, DeleteDialog
│   │   ├── hooks/           # useOrders, useCreateOrder, useDeleteOrder
│   │   ├── services/        # Fetch API calls (createOrder, listOrders, deleteOrder)
│   │   ├── schemas/         # Zod schemas for order drafts, payloads, and queries
│   │   ├── types/           # Order domain and draft types
│   │   └── utils/           # Money formatters and sessionStorage recovery helpers
│   ├── lib/                 # Core API client & error handling
│   ├── providers/           # TanStack Query client provider
│   └── shared/              # Reusable UI formatters and debounce utilities
└── scripts/                 # End-to-end browser regression checks
```

---

## Quality Checks & Testing

Run all checks from the repository root:

```powershell
# Typecheck
bun run --filter web typecheck

# Lint
bun run --filter web lint

# Component & Unit tests
bun run --filter web test
```

On a fresh checkout, build or start Next first so its generated route types exist before standalone typechecking.

### Browser regressions

These optional checks use an **existing global Playwright installation and installed Chromium**, supplied through `NODE_PATH`. Do not install a project runner or download browsers for them. They mutate a guarded disposable test database; finish `bun run test` before preparing fixtures.

From the root, with `.env.test` configured and `bun run db:test:migrate` completed:

```powershell
bun apps/api/test/browser-fixture.ts prepare
bun --env-file=.env.test apps/api/src/main.ts
```

Leave that API running at 4001. In a second terminal, build/start the separate test frontend:

```powershell
$env:NODE_ENV = 'production'
$env:API_URL = 'http://localhost:4001'
$env:NEXT_DIST_DIR = '.next-browser'
bun run build
bun run --filter web start --port 2001
```

In a third terminal, point `NODE_PATH` at the existing global Node modules directory containing `playwright`, then run:

```powershell
$env:NODE_PATH = '<existing global Node modules directory>'
bun apps/web/scripts/browser-check.mjs
bun apps/api/test/browser-fixture.ts clean
```

Stop both temporary services afterward. The script checks real cookie login, stale filters, pagination, confirmed-only creation, lost-response/reload/staff isolation with SQL assertions, validation, storage failures, revoked sessions, keyboard focus, and delete/error recovery. On failure it saves a screenshot and DOM diagnostics. It does not install dependencies or claim screen-reader/cross-browser coverage.
