# Orders Console: implementation plan

> For agentic workers: use `superpowers:executing-plans` to implement this plan task by task. This document is a proposal, not evidence that its features or tests already exist.

**Goal:** Finish the application, including the requested cursor pagination and server-side logout revocation, using a simple structure that a junior developer can explain.

**Architecture:** Keep the existing Bun workspace, Next.js App Router, NestJS modules, PostgreSQL, and Drizzle. Nest controllers handle HTTP, services handle rules and transactions, and the existing database provider supplies one shared connection pool. Next routes remain in `src/app`; feature code lives beside them in `src/features`.

**Tech stack:** Bun, TypeScript, Next.js, React, NestJS, PostgreSQL, Drizzle, `@nestjs/jwt`, class-validator/class-transformer, cookie-parser, Helmet, Nest throttling, Bun's test runner, and Supertest. Verify browser scenarios manually or, when useful, through an existing globally installed Python/Bun Playwright runtime; add no Playwright dependency to the project.

**Spec:** the user's requirements: no Docker, local services, Bun, familiar framework structures, feature-based web code, important tests, security rules, and honest decisions.

**Execution checklist:** [Superpowers phases](superpowers/plans/2026-10-19-orders-console.md) names the exact files, interfaces, failing tests, verification commands, and completion gates for each phase.

**Security source of truth:** [SECURITY.md](../SECURITY.md) defines role permissions, input limits, implementation status, and required evidence. This guide supplies design context; implementation and its tests must follow that policy, including staff-scoped recovery of pending submissions.

**User review workflow:** Each phase has its own decision record in the execution checklist. Complete and verify only one phase, report its decisions/results/risks, then stop for explicit user review before continuing. Do not stage, commit, push, or create a PR automatically; a commit requires a separate user instruction. Read [the baseline review](BASELINE_REVIEW.md) before implementation; known bugs are not cleared by writing this plan.

## 1. Constraints and assumptions

- Preserve the existing repository and commit history. Do not regenerate either existing app.
- Bun, Node, and a running local PostgreSQL installation must be available. The earlier review confirmed that PostgreSQL is reachable in this workspace.
- A reviewer without PostgreSQL must install it first. Do not promise installation plus application setup in under five minutes on every machine.
- Use one currency, integer cents, and UTC timestamps. This plan chooses USD for sample display; changing the display currency is a product choice, not currency conversion.
- Admin and agent are staff accounts. A customer does not need an application account.
- Both roles can see and create all orders. Only admin can delete an order. Do not build a user-management screen or bulk deletion.
- Authentication, roles, validation, idempotency, and atomic writes are required.
- Proposed limits: customer name 1–100 trimmed characters; email at most 254; item description 1–200 trimmed characters; 1–5 items; quantity 1–999; unit price 1–10,000,000 cents; total at most 2,000,000,000 cents; search at most 100 characters; JSON body at most 32 KB.
- New orders always start as `pending`. Seed data uses `pending`, `processing`, `completed`, and `cancelled`. The client cannot set creator, creation date, role, or status during creation.
- SQL migrations and queries support PostgreSQL. Script names and seed parameters remain stable if the engine later changes; changing `DATABASE_URL` alone cannot convert a PostgreSQL app to SQLite/MySQL/MongoDB.

## 2. Implementation milestones

| Deliverable and completion check                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate environment, agree on DTOs/routes, fix current lint/type issues, add environment examples. Both apps boot.                                               |
| Five tables including sessions, constraints, migrations, indexes, deterministic batched seed. At least 50,000 orders, 1–5 items per order, admin and agent exist. |
| Login/logout/me, session-backed JWT cookie, logout revocation, role guard, Origin checks, login throttling. Auth and role tests pass.                             |
| Transactional order creation with permanent request receipts. Two parallel identical requests return one order ID and create one order.                           |
| Search/filter, date/amount cursor pagination in both directions, and admin delete. Query contract tests pass.                                                     |
| Login page, order table, form, latest-request handling, optimistic rows, retry/rollback. Manually pass the three-filter race and double-click scenarios.          |
| Consolidate critical API tests; browser race/rollback checks; seed/query checks. Fix failures, not styling.                                                       |
| README, SECURITY.md, exactly three decisions, AI disclosure, clean setup rehearsal, final type/lint/build checks.                                                 |

**A working vertical slice, not a production platform.**

Write the relevant failing test inside each feature phase, implement the feature, then rerun that test. The final test phase is for combined behavior and regressions. Each milestone ends with uncommitted changes, a decision record, verification evidence, and a stop for the user's review.

**Lower-priority work:** visual polish, extra browser automation, optional SCALE.md when not submitting as senior. Never cut the parallel-create proof, stale-response check, role enforcement, or required documentation.

## 3. Database choice and engine differences

An engine is the software that stores records, maintains indexes, coordinates concurrent operations, and recovers committed changes after failure. Drizzle is a query/schema tool above the engine; it is not the database.

### PostgreSQL — keep it for this repository

- A separate database server accessed through a connection pool.
- Ordinary tables use heap pages; indexes are separate structures. B-tree indexes serve equality/range/sort queries; GIN indexes can serve trigram substring search.
- MVCC gives statements a consistent view of row versions. Row locks and unique constraints coordinate competing writers; transactions commit the request receipt, order, and items together.
- Foreign keys/checks protect relationships and basic values even when a script bypasses the API.
- `pg_trgm` supports indexed `ILIKE '%term%'` searches, unlike a normal B-tree on a name/email field.
- Cost: install/start a service, create a database/user, configure credentials. For this repo those costs have already been paid.

Sources: [MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html), [storage layout](https://www.postgresql.org/docs/current/storage-page-layout.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html).

### SQLite — strongest alternative for a new, installation-free demo

- An embedded engine: the application opens a local database file; there is no separate service or network connection pool.
- Uses pages and B-trees and supports transactions, constraints, and unique indexes. Enable foreign-key enforcement for each connection.
- WAL mode lets readers overlap a writer, but there is still only one writer at a time. A unique key can absolutely prevent duplicate orders; handle busy/lock errors and keep transactions short.
- Excellent for 50,000 rows and light local workloads. Row count alone is not a reason to reject it.
- `pg_trgm` and PostgreSQL migrations do not transfer; SQLite FTS/search options have different semantics.
- I would choose it if zero database installation outweighed keeping the existing, functioning PostgreSQL integration.

Sources: [appropriate uses](https://www.sqlite.org/whentouse.html), [WAL concurrency](https://www.sqlite.org/wal.html), [file format](https://www.sqlite.org/fileformat.html).

### MySQL with InnoDB — also correct, no advantage here

- A separate SQL server; InnoDB is its normal transactional storage engine.
- The clustered primary-key B-tree holds row data. Secondary index entries reference the primary key; this differs from PostgreSQL's usual separate heap/index arrangement.
- Supports MVCC, row-level locking, foreign keys, transactions, and unique constraints, so it can enforce this idempotency design.
- Upsert syntax, text-search behavior, migrations, and driver differ from PostgreSQL. FULLTEXT search is not a drop-in replacement for arbitrary substring matching.
- Switching now adds installation and rewrite work without solving a current problem.

Source: [InnoDB](https://dev.mysql.com/doc/refman/8.4/en/innodb-introduction.html).

### MongoDB with WiredTiger — workable, less convenient for this slice

- A separate document server, normally using WiredTiger; stores BSON documents rather than relational rows.
- WiredTiger supports document-level concurrency and MVCC. Embedding the 1–5 items in an order makes a single-document order write atomic.
- A unique index can enforce a request key. MongoDB does not lack transactions or duplicate prevention.
- Multi-document transactions require a replica set or sharded deployment, which complicates a simple local setup if receipts and orders are separate documents.
- Relations, integrity rules, and query tooling would change. There is no present reason to replace the existing SQL model.

Sources: [WiredTiger](https://www.mongodb.com/docs/manual/core/wiredtiger/), [unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/), [transaction deployment requirements](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

**Recommendation:** PostgreSQL + the existing Drizzle + `pg`. These engines can all handle 50,000 rows. The useful differences here are setup effort, concurrent writes, search semantics, and how much existing code we preserve.

## 4. Simple code structure

```text
apps/
  api/
    src/
      main.ts
      app.module.ts
      app.controller.ts              # health only; remove public user listing
      app.setup.ts                   # shared HTTP setup for main and tests
      db/db.module.ts                # existing DB token, one pool, shutdown cleanup
      auth/
        auth.module.ts
        auth.controller.ts           # login, logout, me
        auth.service.ts              # credential lookup, hashing verification, signing
        auth.guard.ts                # verified cookie + current staff user
        roles.guard.ts
        roles.decorator.ts
        public.decorator.ts
        origin.guard.ts              # unsafe methods require configured Origin
        login.dto.ts
      orders/
        orders.module.ts
        orders.controller.ts         # list/create/delete routes
        orders.service.ts            # queries, transaction, idempotency
        cursor.ts                    # small query-bound cursor encoder/validator
        dto/
          create-order.dto.ts        # includes nested ItemDto
          list-orders.dto.ts
        orders.service.spec.ts       # only useful pure-rule tests
    test/
      auth.e2e-spec.ts
      orders.e2e-spec.ts
  web/
    src/
      app/
        layout.tsx
        globals.css
        page.tsx                     # renders OrdersPage; routes remain normal Next routes
        login/page.tsx               # renders LoginForm
      features/
        auth/
          login-form.tsx
          api.ts
        orders/
          orders-page.tsx
          orders-table.tsx
          order-form.tsx
          use-orders.ts              # current query, cancellation, active-request check
          api.ts
          types.ts                   # UI-only state; public HTTP contracts live in @repo/contracts
      lib/api.ts                     # small fetch helper: JSON/error/401 handling
    next.config.ts                   # one /api rewrite to Nest
packages/
  contracts/
    src/users.ts                     # explicit public identity fields + role literals
    src/orders.ts                    # status literals; add endpoint contracts when implemented
    package.json                     # resource subpath exports; no DB/framework dependency
  db/
    src/
      client.ts                      # existing createDb
      index.ts
      seed.ts
      check.ts                       # seed/data invariants and counts
      schema/
        index.ts
        users.ts
        sessions.ts                  # one revocable login session per row
        orders.ts
        order-items.ts
        idempotency-requests.ts
    drizzle/                         # committed SQL migrations and metadata
    drizzle.config.ts
README.md
SECURITY.md
DECISIONS.md
.env.example
.env.test.example
package.json
bun.lock
```

Keep existing framework config files even when omitted above. Files are introduced only with the feature that needs them. No domain/application/infrastructure folders, generic base services, repository interfaces, CQRS, shared component package, or separate backend per feature.

Request flow: `Next component -> /api rewrite -> Nest guard -> DTO validation -> controller -> service -> injected DB`.

Controllers translate HTTP inputs/outputs. Services own rules and SQL transactions. Inject the existing DB token directly into services. This is a clean small application; a repository layer is unnecessary while it only passes Drizzle calls through.

The web app must not import database clients or infer public responses from `User` rows: adding `passwordHash` later must not accidentally change an API contract.

**Phase 2 type-sharing decision:** use `@repo/contracts/<resource>` for public HTTP
interfaces and shared literals, with one explicit module/export per resource. Keep
Drizzle's inferred select/insert types in `@repo/db` for server code. API DTO classes
implement request contracts while performing runtime validation; services explicitly
select/map response fields. Feature-local web types describe UI state only. This
replaces the original feature-local HTTP DTO suggestion and avoids a growing central
type file or database-derived response types.

## 5. Database model, connection, and indexes

### Five tables

1. `users`: existing ID, name, normalized unique email, password hash, role constrained to admin/agent, creation timestamp. These are staff, not customers. Preserve the four existing sample users: add a default agent role and allow a missing hash for those unconfigured accounts, which cannot log in. Seed new admin/agent credentials without resetting or promoting an existing account on an email conflict.
2. `orders`: existing ID, customer name/email snapshots, creator user ID, status, total cents, non-null `timestamptz(3)` creation timestamp. Millisecond database precision preserves cursor values exactly through JavaScript ISO serialization; explicitly migrate existing timestamps to that precision. Creator deletion is restricted rather than cascading away orders.
3. `order_items`: ID, order ID, position, description, quantity, unit price cents. Unique `(order_id, position)`; order deletion may cascade its own items.
4. `idempotency_requests`: ID, creator user ID, key, response status/body, created timestamp. Unique `(creator_id, key)` for this create endpoint. A receipt has no cascading order foreign key and survives order deletion. A replay returns the original response snapshot, not a newly created order.
5. `sessions`: random UUID primary key generated with `crypto.randomUUID()`, staff user ID with cascading user-delete foreign key, and non-null timezone-aware expiry. JWT `sid` identifies the row; store neither the JWT nor a copy of its signature. Deleting the row revokes that login. No separate session service, denylist, Redis, or refresh-token subsystem.

Keep existing serial IDs to avoid an unnecessary primary-key migration. The seed uses normal generated order/item IDs and one persistent seed-operation receipt, so reruns neither assign conflicting IDs nor reset sequences. The submitted seed must refuse to wipe data.

Customer snapshots belong on the order: changing staff accounts must not change historical customer identities. Store item descriptions/prices as snapshots too.

### Connecting the database

- Keep `createDb(connectionString)` in `packages/db` and the existing `DB` provider in Nest.
- Fail startup if `DATABASE_URL`, signing secret, or configured frontend Origin is missing/invalid. A TypeScript `!` does not validate environment variables.
- Create one `pg.Pool` per API process, not per request; start with a small connection maximum such as 10 and a finite connection timeout.
- Use Drizzle parameters for values; allowlist sort columns and directions. Never concatenate user text into SQL identifiers.
- Use `db.transaction(...)` for the receipt/order/items operation.
- Close `db.$client` on API shutdown and in script/test `finally` blocks.
- App credentials should not be PostgreSQL superuser credentials. Local migration credentials may own the local application database; a deployed runtime would use a narrower role.
- Keep the web entirely behind the API. A shared database workspace is not permission for browser code to connect to PostgreSQL.

Source: [Drizzle PostgreSQL integration](https://orm.drizzle.team/docs/get-started-postgresql).

### Indexes to create and explain

- Existing unique staff email.
- Session primary key for authentication; `(user_id, expires_at)` for opportunistic expired-session cleanup at login.
- Unique receipt `(creator_id, key)` for correctness.
- B-tree orders `(created_at, id)` and `(total_cents, id)` for unfiltered ordering.
- B-tree orders `(status, created_at, id)` and `(status, total_cents, id)` for filtered ordering.
- GIN trigram indexes on customer name and email for substring search. Add `CREATE EXTENSION IF NOT EXISTS pg_trgm` to a reviewed SQL migration.
- Unique order-item `(order_id, position)` also serves item lookups by order prefix.

Use actual `EXPLAIN (ANALYZE, BUFFERS)` results on seeded data. PostgreSQL may correctly prefer a scan for a common or very short search; an index is not a promise that every query will use it. Do not assert a hardware-independent latency target you have not measured.

## 6. API contracts and important behavior

### Routes

| Route                    | Behavior                                                                | Access                                                                         |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/health`        | Basic liveness, no data                                                 | Public                                                                         |
| `POST /api/auth/login`   | Validate credentials, set cookie, return safe user fields               | Public, Origin checked and rate limited                                        |
| `POST /api/auth/logout`  | Revoke the cookie's verified session, then clear cookie; idempotent 204 | Origin checked; verifies cookie independently so retries work after revocation |
| `GET /api/auth/me`       | ID/name/email/current role only                                         | Admin or agent                                                                 |
| `GET /api/orders`        | Search/filter/sort, bounded page                                        | Admin or agent                                                                 |
| `POST /api/orders`       | Idempotent, transactional creation                                      | Admin or agent, Origin checked                                                 |
| `DELETE /api/orders/:id` | Delete one existing order and its items; preserve receipt               | Admin only, Origin checked                                                     |

Use 400 for malformed input, 401 for missing/invalid credentials, 403 for a forbidden role or Origin, 404 for a missing order, and 429 for login throttling. New and replayed creates both return the stored 201 response/body; document this intentionally.

### List

`GET /api/orders?search=alice&status=pending&sort=createdAt&direction=desc&pageSize=50&after=<cursor>`

Omit `after` for the first page. Return `{ items, nextCursor: string | null }`; fetch `pageSize + 1`, return at most `pageSize`, and emit a cursor from the last returned row only when the extra row exists. Default page size 50, maximum 100. Empty/end pages return `nextCursor: null`. Reject `page`, `offset`, repeated/unknown parameters, and invalid sizes rather than silently mixing contracts.

Sort allowlist: `createdAt` or `totalCents`, `asc` or `desc`. Always use ID as a second sort key in the same direction. Search customer name OR email, combined with the selected status. Treat `%`, `_`, and backslash in input literally by escaping LIKE metacharacters as well as parameterizing the query. Blank/whitespace search means no search. Return summaries; load items in at most one additional bounded query if the list needs them, never one query per order.

Use keyset pagination in the existing orders service, with one small `orders/cursor.ts` encoder/validator. No pagination framework or additional dependency:

- Allowlisted `createdAt` or `totalCents` is paired with `id`, both non-null and sorted in the same direction. For ascending use `(column, id) > (value, id)`; for descending use `<`. Apply search/status and the cursor predicate together, using parameterized values. Existing compound B-tree indexes support either scan direction.
- Encode base64url JSON `{ v: 1, sort, direction, search, status, pageSize, value, id }`. Bind it to the normalized current query: trim search without changing its case, use `null` for absent status, and apply defaults before comparing. Omission of `after` means first page; an explicitly empty `after` is invalid.
- Bound the encoded cursor at 2048 characters before decoding; require canonical base64url, valid UTF-8/JSON, an exact object shape/version, and query-field equality. Require an integer ID from 1 to 2,147,483,647, bounded integer cents for amount sorting, or a canonical valid UTC ISO timestamp with millisecond precision for date sorting. Malformed or mismatched cursors return 400. No SQL column/direction comes from decoded data without allowlisting.
- The cursor is an untrusted position, not an access token. Signing it adds no authorization guarantee here: the guard and all visibility predicates run on every request. A well-formed edited position may skip rows but cannot widen access or bypass bounds.
- Do not look up the anchor row: its values remain usable after deletion. Tied amounts/timestamps use the ID tie-breaker and exclusive comparisons. Date and amount are immutable in this slice; a future edit feature must account for rows moving across cursors.
- This is a live list, not a snapshot. Inserts before the cursor appear on refresh; deleted rows disappear, and future status/sort-value edits may move rows. Never hold a transaction open across HTTP pages or promise frozen results.

The UI has Next/Previous only: keep a stack of prior request cursors (first entry omitted), push `nextCursor` only after a successful Next response, and reuse prior entries for Previous. Disable navigation while fetching. Filter/search/sort/direction/page-size changes clear the stack and start without a cursor. Refresh and confirmed create/delete also restart at the first page; failed requests preserve the last successful position for retry. An empty later page after concurrent deletion still offers Previous and Refresh. Do not add total counts, arbitrary page jumps, or reverse-query machinery.

Reference: [PostgreSQL row comparisons](https://www.postgresql.org/docs/current/functions-comparisons.html#ROW-WISE-COMPARISON).

### Creation and amount validation

The JSON body contains `customerName`, `customerEmail`, `items[{description, quantity, unitPriceCents}]`, and `totalCents`. The server recomputes the total and rejects a mismatch. Never trust the browser's total. Require safe integers and the bounds in section 1; never use floating-point SQL money arithmetic for these values.

The form displays the calculated total. Parse decimal input as a bounded string with at most two decimal places, then convert whole/fractional parts to cents; do not silently round `1.005` or accept scientific notation as money.

Service interfaces stay ordinary: `list(query: ListOrdersDto)`, `create(creatorId: number, key: string, input: CreateOrderDto)`, and `remove(orderId: number)`. The create result contains the stored status/body for both a new request and a replay. Controllers pass the authenticated creator ID; they never read it from the body. Auth exposes `login(input: LoginDto)` and current-user lookup for the guard.

Use Nest's global validation pipe with `transform`, `whitelist`, and `forbidNonWhitelisted`. Validate nested items and reject unknown fields. TypeScript types are not runtime input validation.

Source: [Nest validation](https://docs.nestjs.com/techniques/validation).

## 7. Duplicate prevention: the server guarantee

The guarantee is **at most one committed order for the same authenticated creator and request key**, even after retries, parallel requests, or an API restart. It does not detect two independently entered orders with different keys. Legitimate repeated purchases can have identical contents, so a content hash alone must not be a unique order key.

### Client

1. On a valid submit, synchronously lock that submission and allocate one `crypto.randomUUID()` key. Validate keys server-side as bounded printable ASCII strings of 1–128 characters; internal seed keys can be deterministic strings rather than UUIDs.
2. Freeze the submitted payload. Save its key/payload/pending state in sessionStorage before sending so the same tab can recover after reload. This contains customer data: clear it after a confirmed outcome; never store the auth token there.
3. Send the key in `Idempotency-Key`. Double-clicks and Retry reuse the same operation, key, and frozen payload.
4. A timeout, abort, connection failure, or 5xx is uncertain: the server may have committed. Keep the attempt and retry with the same key. Do not let editing create a fresh key while the original outcome is unresolved.
5. A confirmed success completes the attempt. A definite validation rejection rolls back its optimistic row and keeps an editable form.
6. New deliberate orders get new keys. The UI does not claim to deduplicate separate tabs, different agents, or manually reentered orders.

### Server transaction at PostgreSQL READ COMMITTED

1. Authenticate, validate, and normalize the input before writing. Preserve item order.
2. Start a transaction and insert a receipt using `ON CONFLICT (creator_id, key) DO NOTHING RETURNING id`.
3. If the claim succeeds, insert the order/items, store the finished response snapshot/status in the receipt, then commit.
4. If the claim conflicts, a concurrent insert can wait for the winning transaction. Read the committed receipt in a **separate next SQL statement**, not a same-statement CTE that may have an older snapshot.
5. Return the saved response for the same creator/key. Do not overwrite the existing receipt or order.
6. A failure before commit rolls back receipt, order, and items. A lost HTTP response after commit is safe to replay.

Receipts are retained indefinitely for this assignment; no automatic expiry. Admin deletion removes the order/items but preserves the receipt, so an old retry cannot recreate the deleted order. This is why the design uses one small receipt table rather than a unique key only on the deletable orders table. Receipt retention also retains response data; record this privacy/storage tradeoff and agree a policy before production.

Source: [PostgreSQL INSERT and conflict handling](https://www.postgresql.org/docs/current/sql-insert.html). The transaction flow above is this application's design, not a built-in automatic guarantee supplied by Drizzle.

## 8. Authentication and SECURITY.md policy

Create `SECURITY.md` with the following as implementation rules. Mark incomplete controls as planned until their tests pass; do not describe this plan as deployed security.

### Roles

| Action                                | Anonymous | Agent           | Admin           |
| ------------------------------------- | --------- | --------------- | --------------- |
| Login                                 | Yes       | Yes             | Yes             |
| Read/create orders                    | No        | Yes             | Yes             |
| Delete one order                      | No        | No              | Yes             |
| Change roles/manage users/bulk-delete | No        | Not implemented | Not implemented |

All order records are shared operations data in this assignment. If the product later separates teams/tenants, every query and idempotency scope must include that boundary; this plan does not claim tenant isolation.

### Smallest suitable auth implementation

- `AuthService` finds a normalized email, verifies an asynchronous Argon2id hash with `Bun.password.verify`, and signs a short-lived token using `@nestjs/jwt`. Use an equally expensive dummy verification for unknown emails and the same error message for unknown email/wrong password.
- Seed hashes with asynchronous `Bun.password.hash(..., { algorithm: 'argon2id' })`; never store plaintext or SHA-256 password hashes. Bun records its salt/settings in the hash. The chosen API runtime and API tests run under Bun.
- After password verification, `AuthService` creates a session and signs `{ sub, sid }` with the configured issuer/audience and a 15-minute absolute lifetime. Set the row expiry from the same integer-second `exp` as the JWT. Insert and sign inside one database transaction so signing failure rolls back; set the cookie only after commit. No role is trusted from the token.
- A global guard verifies the cookie's signature, fixed algorithm, issuer, audience, required `exp`/`sub`/UUID `sid`, then joins the session to the current staff record in one query. Require matching session user/subject, unexpired session, and an existing account with credentials; use its current database role. Do not cache active sessions. Database failures return a handled 503 and never allow access.
- Use an explicit public-route decorator for login/health and the specialized logout handler. Logout bypasses the active-session guard only; it still requires exact Origin and independently verifies the cookie. Role authorization runs after authentication on private routes. No Passport layer is needed for one cookie/JWT strategy.
- Use a random secret of at least 32 bytes, supplied through environment variables, with no fallback.
- Logout deletes only the verified `(sid, userId)` session, awaits database success, clears the matching cookie, and returns 204. Already-deleted sessions are success, so retrying after a lost response is safe. Missing/invalid/expired cookies are cleared with 204 without trusting their claims or deleting another session. A database error while deleting a valid session returns 503 without claiming successful logout; the UI keeps a retry action.
- Subsequent authentication checks reject copied tokens for the deleted session, across API processes using the same database. Separate device/browser logins remain active. An already-authorized in-flight request may still finish; no locks or request cancellation protocol are added. No logout-all-devices, sliding expiry, or refresh tokens. Expired rows never authorize; delete that user's expired rows on successful login using the same transaction, with no background cleanup service.

Reference: [OWASP server-side session invalidation](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Sources: [Nest JWT/guard patterns](https://docs.nestjs.com/recipes/passport), [Nest authorization](https://docs.nestjs.com/security/authorization), [Bun password hashing](https://bun.sh/docs/runtime/hashing).

### Cookie and request security

- Serve browser calls through a Next rewrite: browser `/api/*` -> Nest `/api/*`. No Next Route Handlers duplicating order/auth business logic. Bind the local API to loopback.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/api`, no Domain attribute, and `Secure` in HTTPS production. Local HTTP requires a development configuration without Secure. Clear with the same cookie name and Path.
- State-changing requests, **including login**, must have an Origin exactly matching `APP_ORIGIN`; reject a missing, `null`, or unexpected Origin. CLI/test clients must send the configured Origin. Accept only JSON on login/create. Do not confuse CORS or SameSite with a complete CSRF defense.
- No state change on GET. Do not accept tokens in query parameters. Do not enable permissive credentialed CORS; the browser uses the same-origin rewrite.
- Throttle login, for example 5 attempts per minute per source IP for the local demo, and cap body sizes. An in-process limiter is local-instance protection, not distributed brute-force prevention. Set proxy trust deliberately if deployment changes.
- Apply security headers on the API; do not claim API headers establish a CSP for Next-served HTML. Keep React's escaped text rendering and avoid raw HTML injection.
- Return safe response fields explicitly. Never return/log password hashes, cookies, JWTs, or complete request bodies/customer datasets.
- Ignore real `.env*` files while allowing `.env.example` and `.env.test.example`. Never expose database credentials or secrets using `NEXT_PUBLIC_`.
- Tests use a separate database with a `_test` name. Destructive fixture cleanup must verify the actual connected database and require test mode before deleting anything.

Sources: [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [Nest rate limiting](https://docs.nestjs.com/security/rate-limiting).

### README auth-review answer

List the original snippet's actual defects and corresponding fixes: decode instead of verify; hardcoded secret; tokens in URLs; weak Authorization parsing; no expiry; unchecked claims/current user; plaintext password lookup; no server-side admin check; missing request validation; missing login throttling; no defined missing-order behavior. Do not attribute a password-hash leak to the old snippet if it did not return user rows.

Suggested token-storage answer, three sentences:

> I store the 15-minute token in an HttpOnly, SameSite=Lax cookie, with Secure enabled over HTTPS. HttpOnly prevents JavaScript from reading it, but XSS can still act through the signed-in browser; exact Origin checks on unsafe requests help prevent CSRF. Logout deletes its server-side session and clears the cookie, so copied tokens fail subsequent authentication checks.

## 9. Latest-request behavior and optimistic state

Use ordinary React state plus one feature hook. No Redux, global order cache, or query library is necessary for one table.

- Query state includes search, status, sort, direction, page size, current cursor, and the successful cursor-history stack. Reset cursor/history on every query change, refresh, confirmed create/delete, or account change. Debounce search about 250 ms; apply status changes immediately. Next/Previous uses the contract above; include the cursor and staff identity in request tags.
- Each effect owns an AbortController and an active/request-version check. Abort previous work on cleanup, but also ignore late callbacks even if the transport does not honor abort.
- Tag results/loading/errors with the query key so an old response, error, or finally handler cannot overwrite the latest request's state.
- Keep server-page rows separate from pending create attempts. Use the request key as a temporary row ID, never array position.
- Show pending submissions in a clearly labeled section of the list immediately, even when a current filter would hide their eventual pending status. Do not present them as matching server-filtered results or silently corrupt page counts/sort order.
- On success reconcile with the returned ID, reset cursor/history, and refresh the current filters' first page. Avoid a duplicate if a list fetch saw the real order before the create response.
- On a definite server rejection remove only that attempt's temporary row. Do not restore an old whole-list snapshot: that could erase newer requests or another successful submission.
- On an uncertain network outcome keep a visible 'confirmation unknown; retry' state with the same key. Never label it a definite rejection.
- If the user changes filters during creation, keep operation state intact and refresh the new current query, not a captured old query.
- Logout waits for 204 before reporting success; on 503/network failure show a retry without silently declaring revocation. On success or 401 clear private rows, cursor history, and current identity, abort outstanding fetches, and increment the request version so late callbacks cannot restore private data. Keep unresolved create recovery staff-scoped as already specified. Other tabs sharing the cookie clear data on their next 401; no cross-tab event bus is needed.

## 10. Scripts: stable interface, one actual engine

Use Bun scripts and TypeScript for data work. Parameters are parsed with the standard `node:util.parseArgs`; validate them before connecting. Avoid shell-specific SQL loops or a DB-adapter framework.

### Root script contract to implement

```json
{
	"dev": "bun --env-file=.env run --filter './apps/*' dev",
	"dev:api": "bun --env-file=.env run --filter api dev",
	"dev:web": "bun --env-file=.env run --filter web dev",
	"db:generate": "bun --env-file=.env run --filter @repo/db generate",
	"db:migrate": "bun --env-file=.env run --filter @repo/db migrate",
	"db:seed": "bun --env-file=.env run --filter @repo/db seed",
	"db:check": "bun --env-file=.env run --filter @repo/db check",
	"db:test:migrate": "bun --env-file=.env.test run --filter @repo/db migrate",
	"test:api": "bun --env-file=.env.test run --filter api test",
	"test:idempotency": "bun --env-file=.env.test run --filter api test:idempotency",
	"typecheck": "bun run --filter '*' typecheck",
	"lint": "bun run --filter './apps/*' lint",
	"build": "NODE_ENV=production bun --env-file=.env run --filter web build"
}
```

Every workspace must actually define the referenced scripts. `build` builds the web artifact; API safety is checked by typecheck and tests, and the API runs TypeScript under Bun rather than claiming an untested compiled artifact. Phase 1 adds `bunfig.toml` with `env = false`: root scripts explicitly choose `.env` or `.env.test`, so Bun does not preload development values before a test command selects its file. Build explicitly selects production mode. Future-feature scripts in this guide are added only when their implementation exists.

### Workspace scripts

- API: `dev = bun --watch src/main.ts`, `start = bun src/main.ts`, `typecheck = tsc --noEmit`, `test = bun test ./src ./test`, `test:idempotency = bun test ./test/orders.e2e-spec.ts --test-name-pattern idempotency`.
- Web: keep normal Next commands, or use Bun's documented explicit runtime form `bun --bun next dev -p 3000`, `bun --bun next build`, `bun --bun next start -p 3000`; add `typecheck = tsc --noEmit`. No local Playwright package or required Playwright test script.
- DB: `generate = bun --bun drizzle-kit generate`, `migrate = bun --bun drizzle-kit migrate`, `seed = bun src/seed.ts`, `check = bun src/check.ts`, `typecheck = tsc --noEmit`.
- Keep one API test runner. This plan deliberately replaces the empty Vitest scaffold with Bun's runner so Bun.password and Nest run in the same runtime. Retain Supertest and Nest TestingModule. Remove unused Vitest config/dependencies during implementation, not merely by deleting their script references.
- Browser checks do not require a new dependency. If automation is useful, first locate and verify the existing global Python or Bun Playwright installation and its browsers. Use that runtime directly without `bunx` auto-install, a local package, or a browser download. If unavailable, complete and record manual checks rather than claiming automation ran.

Examples after implementation:

```powershell
bun run db:seed --count 50000 --batch-size 1000 --seed 42
bun run db:check
bun run test:idempotency
```

The seed should generate deterministic data, use batches of statements inside one seed transaction, generate 1–5 items/order, report inserted counts, and close its pool. Running it twice must not create another dataset, reset passwords, or delete human-entered records. Claim one persistent internal receipt such as `seed-v1:42`, storing a summary response. Insert all orders/items and finish that receipt in the same transaction. Reruns with the same seed skip, even if the requested count changes; use a different seed for a new dataset. An interrupted seed rolls back and can be rerun. Seed helpers use the same money rules and valid statuses as creation. Give seed orders distinct deterministic customer emails to map returned generated IDs back to item inputs without assuming SQL RETURNING row order. This bulk loader is intentionally for local demo data, not a production ingestion job.

`db:check` verifies at least 50,000 orders, item-count range, totals matching sums, valid roles/statuses, and expected indexes. It fails with a nonzero exit code on invalid data. `test:idempotency` aliases the real database integration test instead of duplicating its logic in another script; print both returned IDs and the SQL row count as proof.

Source: [Bun workspaces](https://bun.sh/docs/pm/workspaces), [environment-file behavior](https://bun.sh/docs/runtime/environment-variables), [Bun test runner](https://bun.sh/docs/test), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).

## 11. Test checklist

This is a scoped checklist, not a claim that finite tests prove every possible failure. **A** means automate; **B** means manually verify or automate next. Several cases should be a single parameterized test, not separate boilerplate files. Assert database effects, not just response codes.

### Authentication and permissions

- [A] Correct admin and agent credentials log in; safe user fields only; password is hashed in SQL.
- [A] Unknown email and wrong password return the same 401/error shape.
- [A] Missing, malformed, expired, wrong-signature, wrong-issuer/audience, or disallowed-algorithm tokens fail. Query tokens do not authenticate.
- [A] Agent can list/create but gets 403 deleting; the target order still exists. Admin can delete.
- [A] Submitted role/creator/status fields are rejected; changing client UI/local state never grants access.
- [A] Cookie is HttpOnly/SameSite/Path as specified; production configuration enables Secure; logout clears the correct cookie.
- [A] Copy a valid cookie, logout, then replay the copy against me/list/create/delete: all fail 401 without writes. Repeat logout with the copied cookie and without a cookie: 204. Verify through a second API instance using the same database; another independent login stays active.
- [A] Missing/malformed `sid`, mismatched session user/subject, deleted/expired session, and absent account fail. Signing failure leaves no session/cookie; database lookup failure returns 503 without access. Logout deletion failure returns 503 and does not report success; a lost successful response can be retried safely.
- [A] Expiry uses the same absolute JWT/session instant; test the boundary. Expired-row cleanup never deletes another user's or an active session. Missing/hostile Origin still blocks repeated and unauthenticated logout.
- [A] Unsafe requests with missing/null/hostile Origin fail, including login; GET remains read-only.
- [B] Login throttling returns 429 at the configured limit; no user enumeration through message differences; role/deletion changes take effect on the next request.
- [B] Password/hash/token/cookie values never appear in responses or normal logs; HTML-like customer names render as text.

### Creation, validation, and money

- [A] Valid 1-item and 5-item orders persist exactly the supplied items with a server-calculated matching total.
- [A] Empty/whitespace name, invalid/oversized email, missing items, 0/6 items, empty description, missing key, and unknown body fields fail without writes.
- [A] Quantity/price/total reject zero where prohibited, negatives, fractions, strings in JSON numeric fields, excessive values, and total mismatch.
- [A] A forced item-insert failure rolls back the order and receipt; retry can subsequently succeed.
- [B] Form amount parsing handles `0.01`, `0.10`, `12.30`; rejects three decimals, exponent notation, and overflow. Test non-finite values internally because JSON cannot encode NaN/Infinity.
- [B] New status/creator/date come from server context; timestamps round-trip as UTC instants near midnight.

### Idempotency — highest priority

- [A] Two parallel HTTP creates, same user/key/body: both return the same ID/body; SQL has exactly one order, one receipt, and one set of items.
- [A] A sequential retry and a new application instance using the same DB replay the original result.
- [A] Same body with different keys creates two intentional orders. The same key for a different user is isolated to that user.
- [A] Commit a create, discard its HTTP response, retry the same request: no second order.
- [A] Delete as admin and replay the old key: return the saved create result without recreating the order.
- [B] Run 10–20 simultaneous retries; one order. Kill/close a connection before commit: no partial rows. Restart after commit: receipt survives.
- [B] Try both transactions racing where the first rolls back; one surviving request can complete. Do not swallow unrelated unique/connection errors as replay success.
- [B] Session reload/retry retains the same key and frozen payload; key reuse after an unresolved edit is prevented. Persistence failures are shown before sending, not ignored.

### Listing, search, pagination, and performance

- [A] Name/email search is case-insensitive; status combines with search; no-results returns an empty bounded page.
- [A] Date/amount sorting works both ways. Equal values use the ID tie-breaker and do not duplicate/skip rows in an unchanged fixture.
- [A] First/last/empty cursor pages and maximum page size behave correctly; invalid status/sort/direction/pageSize and legacy page/offset parameters fail. `nextCursor` comes from the last returned row, not the extra fetched row.
- [A] Traverse a tied-value fixture completely for date/amount, asc/desc, with and without status/search, at page sizes 1 and 50: IDs equal one fully sorted SQL fixture with no gaps or duplicates. Include millisecond timestamp ties and amounts at allowed bounds.
- [A] Reject oversized/noncanonical base64url, invalid UTF-8/JSON/shape/version, invalid IDs/dates/amounts, repeated query fields, and cursor/query mismatch. Deleted anchors still continue correctly; a valid beyond-end cursor returns an empty page.
- [A] 50,000 seed rows never produce more than the API limit in a response or DOM page.
- [B] Empty/whitespace search, Unicode names, apostrophes, SQL-like strings, `%`, `_`, and backslash behave as defined without injection/wildcard surprises.
- [B] Compare real query plans for no filter, selective status, rare/common search, 1–2-character search, both sorts, and a deep page. Record actual timings/environment.
- [B] Insert/delete between cursor pages, including deleting the anchor or remaining rows: unchanged surviving rows are neither duplicated nor skipped; new rows appear according to their position, and Refresh restarts at the first page. Do not assert a frozen snapshot or stable navigation history under writes.
- [B] Database unavailable gives a handled error; empty list is distinct from failed request; no unbounded or per-row queries.

### Browser races and optimistic behavior

- [A] Delay filter A, then B, return C first, and finally release A/B: only C remains visible.
- [A] An obsolete failure/finally callback cannot replace C's data/error/loading state. Changing sort/page/search also invalidates older requests.
- [A] Next/Previous works with every sort/direction; controls are disabled while fetching. Failed Next preserves the successful cursor/history for retry. Changing any query field, confirmed create/delete, Refresh, or account resets history. An empty later page preserves Previous/Refresh.
- [A] Logout/401 clears private rows/history and invalidates late callbacks; failed logout offers Retry and does not claim success. Unresolved create recovery remains available only to the same staff account.
- [A] Double-click submits one logical attempt and renders one temporary row immediately before the response.
- [A] A definite server rejection removes only that row, leaves other rows intact, and keeps the draft editable.
- [A] A server commit followed by a dropped response shows uncertainty; Retry keeps the key and ends with one real row.
- [B] Change filters while creating; old query state never returns. Server list seeing the saved row before create success never leaves duplicate real/temp rows.
- [B] A different filter/page does not hide the labeled pending submission or count it as a confirmed matching result.
- [B] Keyboard/labels/errors/focus work; loading/empty/retry/401/403/500 states are understandable. Session expiry during submit preserves the unresolved attempt for reauthentication/retry.

### Seed, migration, and setup

- [A] Empty database migrates and seeds; second migration/seed adds no duplicate dataset. At least 50,000 orders have 1–5 items and correct totals.
- [A] A dedicated test DB is verified before fixture cleanup; dev DB credentials cannot accidentally be used by destructive tests.
- [B] Invalid seed flags/count/batch size fail before writes; interruption can be rerun without partial data or reset passwords; changing the target count for an already seeded dataset fails clearly.
- [B] Missing environment variables fail clearly; invalid credentials produce useful errors without printing secrets; pools close on success/failure.
- [B] Follow the README from a clean checkout; run typecheck, lint, API tests, browser tests, and web build; record exactly which checks actually ran.

Recommended test files: parameterized validation/auth cases in the two API e2e files; one concurrency test reused by the proof script; one or two pure money tests only if logic warrants them. Verify stale filters, optimistic rejection, and double-click/timeout recovery in the browser; automation may use only the existing global Python/Bun Playwright installation. Record which checks were manual or automated. Security/idempotency tests use PostgreSQL, not mocks or SQLite substitutes.

For test configuration load `.env.test` explicitly before imports. Verify `NODE_ENV=test`, the database's actual name ending `_test`, and a difference from the development target before cleanup. Serialize destructive suites or isolate fixtures. Two parallel requests must reach different available pool connections; wrapping all test work in one outer transaction would hide the actual concurrency behavior.

Browser automation reference, if using the existing global installation: [Next Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright). Its package/browser installation steps are not part of this project's setup.

## 12. DECISIONS.md: exactly three decisions, not a changelog

Use one short heading and 5–8 actual lines per decision. Each should explain a real alternative, why it lost, and a drawback of the chosen option. These are draft wording to adapt only after the implementation matches them.

### Decision 1 — retry keys, not content uniqueness

I treat a retry as the same operation only when it carries the same creator and request key.
The browser keeps that key for an unresolved submission, and PostgreSQL enforces its uniqueness.
I considered making the customer and items hash unique because it would catch duplicates without client state.
I rejected that because customers can legitimately place two identical orders.
I keep the receipt and response in the same transaction as the order, and retain the receipt after deletion.
This costs another table and retained response data, but makes parallel requests and lost responses safe.
It does not identify two independently entered orders with different keys; that needs a business identifier.

### Decision 2 — keep PostgreSQL instead of switching to SQLite

I kept PostgreSQL and Drizzle because they were already connected and working in the repository.
SQLite was a serious alternative: a reviewer could start without installing a database service.
Either engine could handle this dataset and enforce the retry key with a unique constraint.
I favored PostgreSQL's concurrent writes and trigram search over rewriting the existing database layer.
The cost is a documented local PostgreSQL prerequisite, so I cannot promise zero-install setup.
For a new single-machine demo with no database installed, I would choose SQLite instead.

### Decision 3 — compound cursors and explicit React state

I render one server-filtered page and keep pending submissions separate from confirmed page data.
I considered offset pagination because page numbers are simple to implement.
I chose a sort-value/ID cursor to avoid scanning increasingly deep offsets and handle tied values deterministically.
Every request has cancellation plus an active-query check, so an older response cannot replace the current view.
I remove only the rejected optimistic operation instead of restoring a stale snapshot of the whole list.
Next/Previous uses a small cursor stack; live changes are visible on refresh rather than through a frozen snapshot.

Add a separate truthful **AI use** paragraph: name the tools and what they actually did, what was reviewed, and which tests you ran. Do not claim you personally explored an alternative you never considered, or tested behavior you did not execute.

Other decisions you should be ready to explain in the walkthrough, without expanding the required file into ten entries: staff versus customer data; integer cents; current-role checks; cookie versus memory/localStorage; session-backed JWT versus stateless JWT; item snapshots; receipt retention; minimal Nest layering; live cursor limits; Bun runtime and test runner; why there is no universal DB adapter.

## 13. README outline and product answer

README must include: purpose; exact tested versions and prerequisites; local DB creation; install/env/migrate/seed/start commands; seeded credentials; routes and roles; test/proof commands; list indexes and measured observations; auth-code review findings; the three-sentence token-storage answer; links to SECURITY/DECISIONS; product question; and skipped scope with reasons.

Use demo credentials only, for example `admin@example.com` and `agent@example.com` with explicitly labeled local-only passwords. Hash them in the seed; publishing seeded demo passwords is permitted by the task, publishing real `.env` secrets is not.

Suggested product answer, four lines:

> What problem are we solving: screen clutter, storage cost, or a retention obligation?
> Which cancelled orders must remain for refunds, disputes, reporting, and audit, and who owns that policy?
> What age threshold, preview, permissions, and recovery period would make deletion acceptable?
> Until that is answered, I would default the list to hide cancelled orders and propose reversible archiving.

Skipped-work section: no deployment, Docker, queue, Redis, microservices, design system, registration/reset/MFA, refresh-token rotation, logout-all-devices, snapshot pagination/page-number jumps, bulk deletion, or full coverage. Cursor pagination and per-session logout revocation are required, not skipped. Document already-authorized in-flight requests, live cursor behavior, per-instance throttling, and idempotency's key/retention limits. If submitting as senior, add a short SCALE.md about query plans, pool limits, indexes, session/receipt growth, distributed limiting, and backups; do not implement those systems in this scope.

## 14. Step-by-step setup with official tools

These are instructions, not commands executed by this planning task. The scaffold commands are for a new empty repository only. Continue the current repository at step 4; do not overwrite `apps/api` or `apps/web`.

### Step 1 — prerequisites and CLI updates

The environment checked during planning has Bun 1.4.2, Node 24.15.0, and Nest CLI 12.0.0. Next 16.4.2 is installed and its registry latest tag was checked. Official Nest CLI releases list newer 12.0.x releases; update deliberately before development and commit a lockfile after selecting versions. Do not run `@latest` updates automatically every time a reviewer installs.

```powershell
bun --version
node --version
nest --version
bun upgrade
bun add --global @nestjs/cli@latest
nest --version
Get-Command nest -All
```

If `nest` still resolves an older npm-installed copy, use the updated Bun binary explicitly via its global bin path, or use `bunx @nestjs/cli@latest --version` to confirm the current published CLI. Do not uninstall random executables or rewrite PATH blindly. Node is still a framework/tooling prerequisite even when packages and API runtime use Bun; use a supported LTS matching current Nest generator requirements.

Sources: [Bun upgrade](https://bun.sh/docs/installation), [Bun global installation](https://bun.sh/docs/pm/cli/add), [Nest CLI overview](https://docs.nestjs.com/cli/overview), [Nest CLI releases](https://github.com/nestjs/nest-cli/releases).

### Step 2 — new workspace only

In an empty parent directory:

```powershell
New-Item -ItemType Directory -Path orders-console
Set-Location orders-console
git init
bun init -y
```

Edit the root package to be private, remove an unused generated root entry file if present, set workspaces to `["apps/*", "packages/*"]`, and add the root scripts in section 10. Root scaffolding does not implement application behavior.

### Step 3 — scaffold the apps only if absent

```powershell
bun create next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --use-bun --import-alias "@/*" --skip-install --disable-git --no-cache-components --no-react-compiler --no-agent-feedback
nest new api --directory apps/api --package-manager bun --skip-git --skip-install --no-observe
```

Select ESM if the Nest CLI asks. Keep the generated base Next/Nest structures. Disabling optional Next caching/compiler features here avoids work on framework features the console does not need; the current repository can preserve its working configuration rather than being regenerated.

Create `packages/db/package.json` with name `@repo/db`, private/type-module, TypeScript source exports, and the scripts in section 10. Keep app package names `web` and `api` so the filters match.

Sources: [official create-next-app flags](https://nextjs.org/docs/app/api-reference/cli/create-next-app), [Nest new flags](https://docs.nestjs.com/cli/usages), [Bun workspaces](https://bun.sh/docs/pm/workspaces).

### Step 4 — install the dependencies where used

From the root, install the locked existing dependencies first:

```powershell
bun install
Set-Location apps/api
bun add @nestjs/jwt class-validator class-transformer cookie-parser helmet @nestjs/throttler
bun add --dev @types/cookie-parser @types/bun
bun add '@repo/db@workspace:*'
Set-Location ../../packages/db
bun add drizzle-orm pg
bun add --dev drizzle-kit typescript @types/pg @types/node
Set-Location ../..
bun install
```

Retain the already-installed Supertest/Nest testing dependencies. Move API test scripts to Bun imports from `bun:test`, update tsconfig test types from `vitest/globals` to Bun/Node, and remove empty Vitest tooling only after the replacements run. The DB package declares its own compiler and Node types, fixing the earlier independent-typecheck failure.

For generators inside the existing API:

```powershell
Set-Location apps/api
bunx nest generate module auth
bunx nest generate controller auth
bunx nest generate service auth
bunx nest generate module orders
bunx nest generate controller orders
bunx nest generate service orders
Set-Location ../..
```

These use the project's declared local CLI; update that dev dependency deliberately first if needed: `bun add --dev @nestjs/cli@latest @nestjs/schematics@latest` from `apps/api`. Updating a global CLI does not update the local one. Do not use `nest upgrade` casually as a dependency updater: inspect its migration changes when actually changing framework majors.

### Step 5 — install and create local PostgreSQL databases, no Docker

Install stable PostgreSQL using the [official Windows installer](https://www.postgresql.org/download/windows/) if it is not already available. Keep its local service running. Add its `bin` directory to PATH or run these utilities from the installed SQL tools terminal.

```powershell
psql --version
pg_isready -h localhost -p 5432
createuser -h localhost -U postgres --pwprompt orders_app
createdb -h localhost -U postgres --owner=orders_app orders_console
createdb -h localhost -U postgres --owner=orders_app orders_console_test
```

Use the role's prompted password in the local connection URLs; URL-encode reserved characters. The application does not run as `postgres`. A non-default host/port is fine if both URLs match it. Running migrations as the database owner can install trusted `pg_trgm` on a standard local PostgreSQL installation; if local permissions differ, the installer/admin must enable that extension.

Sources: [createuser](https://www.postgresql.org/docs/current/app-createuser.html), [createdb](https://www.postgresql.org/docs/current/app-createdb.html).

### Step 6 — environment files

Commit a root `.env.example` with these names and clearly fake values:

```dotenv
DATABASE_URL=postgresql://orders_app:CHANGE_ME@localhost:5432/orders_console
API_PORT=4000
API_URL=http://localhost:4000
APP_ORIGIN=http://localhost:3000
JWT_SECRET=REPLACE_WITH_RANDOM_SECRET
NODE_ENV=development
```

Use `API_PORT`, not a root `PORT=4000`, so Next does not inherit the API port and conflict. Modify API bootstrap accordingly. `API_URL` is server-only and used by the Next rewrite, never `NEXT_PUBLIC_DATABASE_URL`.

Commit `.env.test.example` using `orders_console_test`, `NODE_ENV=test`, and a separate secret. Browser checks that mutate fixtures use isolated API/web processes and the test database with matching API_URL/APP_ORIGIN; use the test ports recorded in the execution phase. Start the processes explicitly, or use the existing global browser runtime if helpful. Do not point destructive browser checks at the running development API.

```powershell
Copy-Item .env.example .env
Copy-Item .env.test.example .env.test
bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste generated secrets/passwords into the local files. Never run this copy step over an already configured file without first deciding to replace it. Root ignore rules should include `.env*`, `!.env.example`, `!.env.test.example`, build outputs, browser traces/reports, and `*.tsbuildinfo`.

### Step 7 — implement, migrate, and seed

Follow phases 1–6, including the schema/client/provider and script contracts. These commands require those files to be implemented; installing dependencies alone will not create the console.

```powershell
bun run db:generate
bun run db:migrate
bun run db:seed --count 50000 --batch-size 1000 --seed 42
bun run db:check
bun run db:test:migrate
```

Commit generated migrations, including the reviewed extension/index SQL. A reviewer applies committed migrations with `db:migrate`; they do not need to regenerate them. Prefer migrations over `db:push` for reproducible setup.

### Step 8 — start and verify

```powershell
bun run dev
```

Open `http://localhost:3000`, log in with the documented seeded accounts, create one order, search/filter/sort, and test admin versus agent deletion. `/api` calls are rewritten to the API; test cookie forwarding through that real path.

From another root terminal:

```powershell
bun run typecheck
bun run lint
bun run test:api
bun run test:idempotency
bun run build
```

Run and record the required browser scenarios separately. Optional automation uses only the already-installed global Python/Bun Playwright and available browsers; do not add it to app dependencies or download browser binaries as part of setup. Prefer a system/local font so a production build does not depend on Google Fonts availability; the earlier build needed network access for those fonts.

For the submitted README, a returning reviewer with prerequisites installed should only need: `bun install --frozen-lockfile`, configure environment, create local databases if absent, `db:migrate`, `db:seed`, and `dev`. Do not run scaffolding or `@latest` upgrades as part of cloning/running the submission.

## 15. Final acceptance gates

- [ ] No public customer/staff list; login/admin/agent behavior proven at API level.
- [ ] Seeded SQL database has at least 50,000 complete orders, not just rows without items.
- [ ] Browser renders one bounded page; three fast filter changes cannot show stale results.
- [ ] Duplicate proof uses parallel HTTP requests and checks SQL counts and identical IDs.
- [ ] Retry survives a lost response/restart; admin deletion cannot free an old receipt for reuse.
- [ ] Client and server validate; money and transaction rollback tests pass.
- [ ] Optimistic rows appear immediately; definite failures remove only the relevant operation.
- [ ] README setup was actually followed; SECURITY matches implemented controls; three decisions and honest AI disclosure exist.
- [ ] Typecheck/lint/API tests/browser checks/web build results are recorded accurately.

## Review focus

The five easiest-to-miss conditions are committed writes with lost HTTP responses; replay after deletion; stale request errors/loading callbacks; optimistic rollback after filters changed; and test cleanup accidentally targeting the development database. Each has an explicit owning phase and test above.

**Not implemented by this document:** application code, migrations, seed changes, security controls, or new tests. Prioritize the required correctness flows and record any unfinished secondary checks honestly.
