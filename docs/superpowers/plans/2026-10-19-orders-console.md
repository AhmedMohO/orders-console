# Orders Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task in the current session. Steps use checkbox (`- [ ]`) syntax for tracking. Inline execution is the recommended approach for this small, tightly connected task; no parallel implementers are required.

> **User review rule:** Execute one phase only, verify it, record its decisions and remaining issues, then STOP for the user's review. Do not continue to the next phase without explicit user approval. Do not stage, commit, push, or create a PR automatically. Reviewing/approving a phase is not a separate instruction to commit; wait for the user's explicit commit instruction. User instructions take precedence over a skill's default batching or frequent-commit workflow.

**Goal:** Finish the required Orders Console with protected routes, a fast bounded list, retry-safe creation, optimistic state, and evidence from important tests.

**Architecture:** Preserve the Bun workspace and ordinary Nest modules/controllers/services; inject the existing DB provider directly into services. Keep Next routes in `src/app`, with auth/orders feature code in sibling `src/features`. Use the existing PostgreSQL/Drizzle integration and one connection pool per API process.

**Tech Stack:** TypeScript, Bun, Next.js/React, NestJS, PostgreSQL, Drizzle/pg, Nest JWT/validation/throttling, cookie-parser, Helmet, and Bun tests/Supertest. Browser automation, if needed, uses only the existing globally installed Python/Bun Playwright runtime.

**Spec:** [architecture, contracts, full test checklist, and setup](../../IMPLEMENTATION_PLAN.md), [security requirements and roles](../../../SECURITY.md).

## Global constraints

- Bun is required; no Docker, paid/hosted services, queues, Redis, or deployment.
- Do not install Playwright in either app or add a mandatory browser-runner dependency. Use the existing global Python/Bun installation only when needed and verified; otherwise perform and record manual browser checks. No automatic browser download or `bunx` package installation.
- Junior-level structure: keep base Next/Nest layouts; no generic repository layer or enterprise architecture folders.
- Preserve the existing repository/history/data. Existing scaffold files are already staged by the user; do not sweep them into an unrelated commit or reset them.
- Every phase has its own decision record below. During implementation change proposed choices to actual decisions and record the alternative, reason, consequence, and verifying evidence before requesting review.
- Stop after each phase, including failed verification. Report failures and repair that same phase when authorized; never skip its review gate to work on later phases.
- Treat `SECURITY.md` as the security source of truth. All its controls start as planned.
- Real PostgreSQL, at least 50,000 seeded orders, 1–5 items each, and one admin/agent credential pair.
- Exactly three final DECISIONS entries of 5–8 lines each plus truthful AI disclosure; required README answers; SCALE.md only for a senior submission.
- Services own transactions; public API DTOs never expose database user rows or credentials.
- Write a focused failing test, implement, and rerun it for each non-trivial feature. Do not add tests that only mirror implementation.
- Commands below become available as their phase implements them; do not report unimplemented scripts as passed checks.

## Pre-implementation review gate

Read [BASELINE_REVIEW.md](../../BASELINE_REVIEW.md) before feature work. The baseline review was presented and the user explicitly authorized phase 1, reviewed it, and then authorized phase 2. Phase 2 is implemented below and awaits review; authentication and order HTTP controls remain unfinished. No commits are authorized. Do not claim a finite audit proves the absence of all bugs.

Before starting phase 1, present the baseline findings and repair scope for review. If baseline repairs are requested separately, verify and present those changes before beginning the planned feature phases. This planning/audit work does not silently mark an implementation phase complete.

## Required phase handoff

At the end of each phase report: files/behavior changed; decisions and rejected alternatives; commands and actual results; remaining failures/risks; and status `Awaiting user review`. Leave all changes uncommitted, preserve the user's staging area, and stop. Do not interpret a status question, timeout, silence, or a request to explain a decision as approval to continue.

Keep these per-phase records in this plan. The final root `DECISIONS.md` still contains exactly the assignment's three selected decisions, with the other phase reasoning linked from here.

## Review focus

1. Commit succeeded but the HTTP response was lost: same-key retry must return one original order (phase 4).
2. Admin deleted the order: its old key must not recreate it (phase 5).
3. An obsolete request fails or finishes last: it must not replace current rows/error/loading state (phase 6).
4. Filters/account change during an optimistic create: preserve the right operation and never roll back unrelated data or replay as another account (phases 6–7).
5. Test credentials point at development: cleanup must stop before any delete (phase 1).

## Phase checklist

| Phase                                | Status               |
| ------------------------------------ | -------------------- |
| 1. Environment and boundaries        | Reviewed by user     |
| 2. Schema, indexes, seed             | Awaiting user review |
| 3. Authentication and roles          | Not started          |
| 4. Transactional creation            | Not started          |
| 5. Bounded reads and admin delete    | Not started          |
| 6. Feature UI and optimistic state   | Not started          |
| 7. Combined verification             | Not started          |
| 8. Documentation and setup rehearsal | Not started          |

Never omit authentication, transactional duplicate prevention, the three-filter check, or required written answers. Record unfinished optional checks rather than claiming full coverage.

## Phase 1 — environment and safe test boundaries

**Decisions — implemented; awaiting user review:**

- Chose explicit root `.env` / `.env.test` selection over automatic package-local loading. `bunfig.toml` disables implicit Bun loading: otherwise the root process preloads development values that override the later test file. A regression proves normal `bun run test` selects test mode/a separate target. Cost: run the documented root commands, or explicitly select the root file when launching the API directly.
- Chose Bun tests over the empty Vitest setup to match the required runtime and future native password hashing. Removed only unused Vitest/Vite tooling/config, retained Nest testing and Supertest. No new package was installed; the user had already installed Bun types and the DB compiler/types.
- Reused the DB workspace's own installed compiler/Node types and added its typecheck command instead of relying on the API's tooling. All three independent workspace checks pass.
- Chose one shared PostgreSQL-URL validator in the DB package over non-null assertions or separate unchecked callers. The API factory and Drizzle configuration reject an absent/invalid URL before using a default target. Cost: connection URLs must explicitly name a PostgreSQL host and database.
- Kept destructive-cleanup validation in `test/database.ts`, not production environment code. It requires test mode, a confirmed matching `_test` database, and a database name different from development even through host aliases. It refuses database query overrides rather than guessing driver target precedence. Cost: conservative rejection of ambiguous cleanup configurations; no cleanup SQL exists yet.
- Required generated secrets of at least 64 non-whitespace characters, with example placeholders rejected. The local secrets were generated as 32 random bytes encoded in hex. API_PORT replaces the shared PORT setting; build explicitly selects production NODE_ENV so development configuration cannot break prerendering.

**Rulings / scope:**

- The repository has no initial HEAD and the user forbids commits. Work stayed in the existing checkout; no worktree/helper operation that requires a commit, staging change, or branch creation was used. This phase section is the durable execution ledger.
- Created ignored root local environment files only because they were absent, deriving matching existing API/DB settings and generating separate secrets. Hash checks confirmed all three original package-local environment files were unchanged. No SQL writes, migrations, seed, database creation, or destructive cleanup were run.
- Moved success JSX outside try/catch to fix the demonstrated lint failure. Kept the existing users demo and left its removal/authentication to phase 3 as planned; it remains a known exposure and is not suitable for real data.
- Added a truthful Phase 1 root README and corrected obsolete API startup instructions. Final assignment answers and DECISIONS.md remain phase 8 work.

**Review status:** Reviewed by the user, who explicitly authorized phase 2 on 2026-10-19. No changes staged or committed by the agent.

**Files:** Modify `package.json`, `.gitignore`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/web/package.json`, `packages/db/package.json`, and the existing web page's failing try/catch rendering. Create `.env.example`, `.env.test.example`, `apps/api/src/env.ts`, and `apps/api/test/env.spec.ts`.

**Interfaces:** `readEnv(env: NodeJS.ProcessEnv)` returns validated database URL, API port, frontend Origin, signing secret, and runtime mode. `assertTestDatabase(testUrl: string, developmentUrl: string, actualName: string, mode: string): void` throws unless test mode and database separation are verified. Test cleanup consumes this check before issuing deletes.

- [x] Write `env.spec.ts` using `bun:test`: missing URL, placeholder/short secret, malformed Origin, and invalid port throw. Cleanup rejects a non-test database, equal dev/test target, unknown actual database, or non-test mode.
- [x] Observe test-first failures: the environment module was absent; the existing DB factory accepted four invalid URLs; whitespace secrets and two ambiguous cleanup URLs failed their regression assertions. The test-runner regression also rejects deliberate development-env inheritance and passes under the corrected normal root command.
- [x] Add validated environment handling and only currently supported script contracts. Reuse the DB package's declared compiler/Node types; add workspace checks. Move API tests to Bun and remove the unused Vitest/Vite scaffold.
- [x] Add example files/ignore rules. Preserve all original package-local configuration. Use API_PORT and explicit development/test selection.
- [x] Fix the web lint error and verify workspace checks, production build, root test selection, and startup. Remaining auth/order gaps are documented.
- [x] Review checkpoint: decisions, results, and remaining risks recorded. Awaiting user review; all edits left uncommitted. STOP before phase 2.

**Verification evidence (2026-10-19):**

| Command / check                              | Actual result                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run test`                               | 44 passed, 0 failed across 3 files; no database connections/writes                             |
| `bun run typecheck`                          | API, web, and DB passed with their own workspace compilers                                     |
| `bun run lint`                               | API and web passed                                                                             |
| `bun run build`                              | Production web build passed after forcing production NODE_ENV                                  |
| `bun install --frozen-lockfile`              | Existing lockfile/install accepted; no changes                                                 |
| Temporary API + production web on free ports | `/health` returned ok and the page rendered users through the API; owned process trees stopped |
| Local configuration                          | Root files ignored; original API/web/DB `.env` files preserved                                 |

Actual files extend the initial list: `bunfig.toml`, root `README.md`, API README/main/DB provider, DB shared env helper/client/config/export, test-only cleanup helper, and three test files. These changes are necessary for the validated configuration to reach real callers and startup, rather than existing only as uncalled helpers.

**Remaining limits:** the test DB itself is not created/migrated yet and destructive cleanup is not implemented; the guard is tested offline. `/users` remains public, authentication/order features are not implemented, and browser/load/retry behavior is not claimed. A filtered root command with a spaced test-name argument hit Bun's Windows executable-path quoting issue; the full root suite and direct focused checks were used instead.

## Phase 2 — schema, indexes, and reproducible seed

**Decisions — implemented; awaiting user review:**

- Kept PostgreSQL/Drizzle and serial IDs. Added relational items, durable receipts, and UUID sessions instead of embedded items or another store. Staff deletion is restricted by orders/receipts, deleting an order cascades its own items, and deleting otherwise-unreferenced staff cascades sessions. Receipts have no order FK and survive order deletion.
- Added `@repo/contracts` with explicit resource subpaths (`/users`, `/orders`) instead of deriving HTTP types from database rows or growing a single shared barrel. Shared role/status literals feed the DB's inferred unions; HTTP dates are strings. The web now has no DB dependency. Future HTTP contracts belong here; Nest DTOs retain runtime validation and web feature-local types are only for UI state. No new external dependency was needed: the workspace reuses the installed compiler and Bun types.
- Replaced `Omit<User, 'createdAt'>` and row spreading with an explicit public interface plus selected/mapped fields. A failing regression reproduced a password-hash leak before this change; it now passes. This safe projection was necessary before adding credentials, while removal of the public demo route remains phase 3.
- Chose bounded deterministic batches and one durable `seed-v1:<seed>` receipt over destructive resets or append-on-rerun. The transaction includes account conflict checks, receipt claim, every order/item batch, and the final summary. Normal generated IDs are mapped by deterministic customer email, never RETURNING position. Reruns with the same seed skip regardless of the requested count. Batch size does not change data. Demo hashes use asynchronous Argon2id; existing accounts are never promoted or reset.
- Set one pool per API process to at most 10 connections with a five-second connection timeout. Scripts/tests close their pool in `finally`; Nest closes it on shutdown and bootstrap enables shutdown hooks. Natural script exits were observed without `process.exit()`.

**Rulings / scope:**

- The inspected development DB contained four users, zero orders, and no migration history. The generated baseline was amended to adopt those existing scaffold tables. The next migration explicitly interprets naive timestamps as UTC and refuses a nonempty legacy order table: the old schema has no item/customer snapshots to reconstruct. This refuses a migration rather than deleting/inventing history; another nonempty legacy installation needs a reviewed backfill. Fresh empty setup, scaffold adoption, UTC preservation, and refusal-with-rows-preserved were rehearsed in a temporary `_test` database, then that database was removed.
- Added a third generated migration after a regression exposed PostgreSQL CHECK's NULL behavior in a partially filled receipt. The fix explicitly requires a non-null response status when a response body exists. Printable ASCII keys include spaces, matching the documented contract.
- The current checkout had 14 API tests, rather than the historical phase-1 record's 44. The new guard lives in `packages/db/test/database.ts` and reads both real root configuration files, verifies test mode, the distinct `_test` target (including actual `current_database()`), and refuses query-string overrides before fixture cleanup. Created the separately configured test DB and migrated it. All test writes/cleanup used that verified target; development data was only migrated/seeded, never cleaned.
- Continued in the existing checkout to preserve the user's uncommitted work and staging area. No worktree, branch, staging, commit, push, or PR operation was performed. The existing configured development role is `postgres`; local files were preserved. A narrower runtime role remains a setup requirement before production use.

**Verification evidence (2026-10-19):**

| Command / check                                                       | Actual result                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test-first failures                                                   | Safe-user regression exposed `passwordHash`; schema tests showed missing tables/constraints; seed/check modules were absent; partial-receipt regression resolved instead of rejecting before the explicit NULL check                                                                                                                                                                                                         |
| `bun run test`                                                        | 20 passed, 0 failed: 14 API + 6 PostgreSQL tests across five files                                                                                                                                                                                                                                                                                                                                                           |
| Seed fixture checks                                                   | Invalid flags rejected; conflicting existing account unchanged; forced item-insert failure rolled back accounts/orders/items/receipt; retry succeeded; concurrent runs returned one insertion and one skip; changed-count rerun skips without adding orders; changed batch size reproduced identical data; manual order, active session, and password hashes preserved; checker detected missing items and mismatched totals |
| `bun run db:migrate` and rerun                                        | Passed; four original users retained as unconfigured agents; inspected constraints and all 15 indexes                                                                                                                                                                                                                                                                                                                        |
| `bun run db:seed --count 50000 --batch-size 1000 --seed 42` and rerun | First inserted 50,000 orders; matching repeat skipped; counts stayed fixed                                                                                                                                                                                                                                                                                                                                                   |
| `bun run db:check`                                                    | 50,000 orders, 150,238 items, 0 sessions; roles/statuses/item counts/totals/receipt scope/required indexes valid                                                                                                                                                                                                                                                                                                             |
| `bun run db:test:migrate`                                             | Passed against verified separate test DB; migration rerun passed                                                                                                                                                                                                                                                                                                                                                             |
| Fresh migration rehearsal                                             | Empty DB and rerun passed; old scaffold user ID/name/email/UTC timestamp preserved; nonempty legacy orders rejected without data loss; owned temporary DB removed                                                                                                                                                                                                                                                            |
| Date precision                                                        | `.123456Z` stored/read as `.123Z`; its ISO value matched the stored timestamp exactly                                                                                                                                                                                                                                                                                                                                        |
| `bun run typecheck`, `bun run lint`                                   | Passed in all applicable workspaces; contracts compile independently with no platform/global types                                                                                                                                                                                                                                                                                                                           |
| Production `bun run build`                                            | Passed with `NODE_ENV=production`; Next resolved the shared resource import                                                                                                                                                                                                                                                                                                                                                  |
| `EXPLAIN (ANALYZE, BUFFERS)` after ANALYZE                            | 51 date rows used `orders_created_at_id_idx` (0.027 ms); 51 pending/amount rows used `orders_status_total_cents_id_idx` (0.034 ms); one selective name search used `orders_customer_name_trgm_idx` (0.303 ms). Local samples, not general latency guarantees                                                                                                                                                                 |
| Independent read-only review                                          | No Critical/Important implementation findings. Corrected old README setup/seed instructions and added explicit `.env` selection to `db:studio`                                                                                                                                                                                                                                                                               |
| `bun install --frozen-lockfile --offline`                             | Checked 651 installs across 844 packages; no changes                                                                                                                                                                                                                                                                                                                                                                         |

**Remaining limits:** `/users` is still publicly reachable (safe fields only), and auth/role enforcement is phase 3. API create/list/delete and HTTP idempotency remain phases 4–5. DB checks constrain each row and max five item positions; minimum item count and cross-row totals are verified by the checker and must also be enforced in phase-4 transactions. No browser/race/load/HTTP replay claims, no fresh-machine installation claim. The local development role is still superuser-configured. Old scaffold orders require an explicit migration backfill.

**Review status:** Reviewed by the user, who explicitly authorized Phase 3 on 2026-10-20. All work remains uncommitted; the user's existing staging area was preserved.

**Files:** Modify `packages/db/src/schema/users.ts`, `orders.ts`, `schema/index.ts`, `src/index.ts`, `src/client.ts`, `src/seed.ts`, `drizzle.config.ts`, and `apps/api/src/db/db.module.ts`. Create `schema/order-items.ts`, `schema/idempotency-requests.ts`, `schema/sessions.ts`, `src/check.ts`, and committed SQL under `packages/db/drizzle/`.

**Interfaces:** Keep `createDb(connectionString: string)` and the existing Nest `DB` token. Schema exports `users`, `orders`, `orderItems`, `idempotencyRequests`, and `sessions`. Sessions contain UUID `id`, user foreign key, and expiry; order creation dates use non-null `timestamptz(3)` for lossless date cursors. The seed consumes `--count`, `--batch-size`, and `--seed`; the check command exits nonzero on missing/invalid data.

- [x] Add failing invariant checks for required roles, item counts 1–5, totals equaling item sums, valid statuses, and unique receipt scope. Use existing real DB types rather than a second test-only model.
- [x] Implement the guide's five-table model, keeping existing serial IDs and using a random UUID only for sessions. Preserve existing sample users with an unconfigured hash and agent role; they cannot authenticate. Reject seed email conflicts that would silently change credentials/permissions.
- [x] Add foreign keys/checks, timezone-aware dates, stable sort indexes, unique receipt `(creator_id, key)`, unique item `(order_id, position)`, and customer-name/email trigram indexes. Change staff deletion from order cascade to restriction. Generate and inspect the migration before applying it.
- [x] Add the session primary key, cascading user FK, and `(user_id, expires_at)` index. Explicitly migrate order timestamps to millisecond precision; assert date cursor serialization round-trips the stored timestamp exactly. Seed/check must not create active login sessions or delete existing ones.
- [x] Implement deterministic bulk seed statements inside a transaction with a durable internal dataset receipt. Reruns with the same seed skip even if the requested count changes. Generate IDs normally and map returning rows explicitly; do not rely on row-return ordering. Never truncate manual data.
- [x] Run `bun run db:migrate`, `bun run db:seed --count 50000 --batch-size 1000 --seed 42`, and `bun run db:check`; repeat migration/seed and confirm counts do not grow. Inspect SQL constraints/indexes and pool cleanup. Record actual observations only.
- [x] Run `bun run db:test:migrate` against the verified separate test DB. Record actual phase decisions and checks, set `Awaiting user review`, leave changes uncommitted, and STOP before phase 3.

## Phase 3 — authentication, roles, and request security

**Decisions — implemented (2026-10-20):**

- Choose a short-lived verified JWT cookie backed by one PostgreSQL session row over stateless JWTs. Logout deletes the row so copied tokens fail subsequent checks; exact Origin checks remain required.
- Choose one session/current-user join per guarded request over cached permissions or trusting old JWT roles. No additional session abstraction or revocation blacklist is needed.
- Choose one Next API rewrite over duplicate Next auth/order handlers; Nest remains the single security/business boundary. Local browser traffic stays same-origin.
  **Decision evidence:** real PostgreSQL auth/Origin/cookie/role tests, including a second independently pooled API instance and a deliberately dropped logout response. The public users route and web caller are removed. **Review status:** Awaiting user review. Phase 4 has not started.

**Execution ledger:**

- User approval: Phase 2 reviewed; Phase 3 authorized on 2026-10-20. Only this phase is authorized. Preserve all pre-existing staged/unstaged work and do not stage or commit.
- Ruling: continue the existing working tree on `main` — Phase 3 consumes the user's uncommitted Phase 2 schema/contracts and the established phase-review workflow; a new checkout would omit those prerequisites. No branch or history changes.
- Pre-flight: Phase 2 provides users, roles, Argon2id credentials, sessions, DB shutdown, and safe test-target verification. Phase 3 adds `role` to the explicit shared `UserResponse` and `LoginRequest` beside it; public types/fixtures are updated, and the obsolete `/users` service/test/caller are removed together.
- Ruling: use `auth.e2e.spec.ts`, rather than the proposed `auth.e2e-spec.ts`, so Bun's ordinary `bun test ./src ./test` discovers it. Import DB test helpers through package subpaths so API typechecking respects its `rootDir`.
- DTO validation supplies `expectedType: LoginDto` explicitly because Bun does not emit Nest's parameter-type metadata. The shared global and DTO pipe options reject unknown input fields and omit submitted values from validation errors.
- RED: the first real-DB login assertion returned 404 instead of 200 before implementation. GREEN: 28 auth cases pass, including both demo credentials, production/development cookie settings, generic credential failures, invalid DTOs, form/oversized rejection, hostile/missing Origins, throttling, token/claim failures, current role changes, absent credentials/accounts, revocation across instances, real dropped-response retry, signing rollback, scoped cleanup, and simulated DB outages.
- Environment: sandbox runs reproduce baseline missing transitive runtime/type packages. Unrestricted runs resolve them without new dependencies. Typecheck exposed actual relative cross-workspace test imports and Set-Cookie declaration mismatches; corrected both. The first escalation review timed out, and the allowed retry succeeded.
- Final review: an independent read-only reviewer found no Critical/Important auth defects. Its minor documentation findings were covered by the pending handoff updates. Its timing finding was resolved in the test: issuance can cross a second boundary during SQL, so assert `0 < exp - iat <= 900`, while retaining exact JWT/session/cookie expiry equality. No deferred review findings remain.

**Verification evidence (2026-10-20):**

| Check                                                      | Result                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Initial `bun test ./test/auth.e2e-spec.ts` from `apps/api` | Expected RED: login returned 404 instead of 200 before auth existed                       |
| `bun run test:api --test-name-pattern auth`                | 28 auth cases passed against the verified separate PostgreSQL database                    |
| Final `bun run test`                                       | 47 passed, 0 failed: 6 DB + 28 auth + 13 configuration cases                              |
| Final `bun run typecheck`                                  | API, web, DB, and contracts all passed                                                    |
| Final `bun run lint`                                       | API and web passed without warnings                                                       |
| `bun run build`                                            | Production Next build passed; scaffold renders statically without the removed users fetch |
| `bun install --lockfile-only --ignore-scripts`             | Lockfile synchronized; no new library or version upgrade                                  |
| Independent source review                                  | No Critical/Important findings; test-timing/docs minors resolved                          |

**Remaining limits:** actual orders routes and copied-token/SQL-write checks for them remain phases 4–5. Browser cookie forwarding through Next and login UI remain phase 6; no browser or fresh-machine setup claim. Login throttling is per process and proxy clients share its source-IP bucket. No refresh tokens, logout-all-devices, or cancellation of already-authorized requests. The pre-existing development database role remains superuser-configured; this phase did not change database credentials or development data. No files staged, committed, or pushed by the agent.

**Files:** Modify `apps/api/src/main.ts`, `app.module.ts`, `app.controller.ts`, and the example environment files. Remove the public user endpoint and its now-unused `app.service.ts` if no callers remain. Create `src/app.setup.ts`, the `src/auth/` module/controller/service, auth/roles/Origin guards and public/roles decorators, `login.dto.ts`, and `test/auth.e2e-spec.ts`. Modify `apps/web/next.config.ts` for the API rewrite.

**Interfaces:** `configureApp(app: INestApplication): void` applies shared HTTP configuration in main and tests. `AuthService.login(input: LoginDto)` verifies credentials, transactionally inserts a session and signs `{ sub, sid }`, then returns token/safe user data; the controller sets the cookie only after commit and returns only the user. `AuthGuard` verifies JWT/session expiry and subject ownership in a current-user join, supplying `{ id, name, email, role, sessionId }` internally. `AuthService.logout(cookie: string | undefined)` independently verifies the cookie and deletes its matching session; the controller clears the cookie only after success. Endpoints: login, logout, me, and health as defined in the guide; logout always checks Origin but bypasses the active-session guard for idempotent retries.

- [x] Write API cases for correct demo credentials, generic wrong/unknown credentials, missing/forged/expired/wrong-claim token, absent account, cookie attributes, missing/hostile Origin, oversized body, and login throttling. Assert no hash/token in response JSON.
- [x] Add real-DB cases: copied cookie fails me after logout, including through a second API instance; another login remains valid; repeated/missing/expired/invalid-cookie logout returns 204 without deleting unrelated sessions. Test missing/invalid `sid`, subject/session mismatch, expiry boundary, signing rollback, expired-row cleanup isolation, and database failures (503, no authorization or false logout success). Test retry after a dropped logout response and enforce Origin on every logout path. Extend copied-token denial to list/create/delete when those routes exist in phases 4/5; require no writes.
- [x] Run `bun run test:api --test-name-pattern auth` and confirm the intended failures. Tests use the real schema and shared HTTP setup, not a mock that skips guards/validation.
- [x] Implement the exact roles, Argon2id, session-backed JWT/cookie, Origin, 32 KB body, and safe-field rules from `SECURITY.md`. Verify required `exp`/`sub`/`sid`, fixed algorithm/issuer/audience, matching unexpired session, and current staff credentials. Use one session/user query and no authentication cache. Logout deletion commits before 204/cookie clearing; no in-flight cancellation or logout-all feature. Prune only the logging-in user's expired sessions. Public markers bypass only the global auth guard; login/logout still pass Origin checks, and logout verifies its cookie independently.
- [x] Set `/api` prefix, local API binding, Next rewrite, shared validation setup, security headers, and explicit pool cleanup. Test Set-Cookie forwarding through Next during the browser phase.
- [x] Rerun auth cases and type/lint checks. Unauthenticated `GET /users` no longer exposes data; private API routes deny by default. Update SEC-03/04/05/09 only for checks actually completed.
- [x] Review checkpoint: record actual auth decisions, evidence, and token/throttling limits. Set `Awaiting user review`, leave changes uncommitted, and STOP before phase 4.

## Phase 4 — validated creation and durable idempotency

**Decisions — proposed, not implemented:**

- Choose unique creator/request keys over content uniqueness; legitimate identical orders remain possible. Different keys are outside the retry guarantee.
- Choose one SQL transaction and saved receipt response over a UI lock or an in-process request map; parallel requests and restarts remain safe. The cost is retained response data and a small extra table.
- Choose server-calculated integer cents over trusting client totals or floating-point money; define explicit bounds and reject inconsistent inputs before writes.
  **Decision evidence at handoff:** parallel IDs/counts, rollback and lost-response/restart replay. **Review status:** not started.

**Files:** Create `apps/api/src/orders/orders.module.ts`, `orders.controller.ts`, `orders.service.ts`, `dto/create-order.dto.ts` with nested item DTO, and `test/orders.e2e-spec.ts`. Register OrdersModule in `app.module.ts`; add the `test:idempotency` script without duplicating its test logic.

**Interfaces:** `OrdersService.create(creatorId: number, key: string, input: CreateOrderDto)` returns `{ statusCode: 201, body: OrderResponse }` for new and replayed success. `OrderResponse` contains safe order/customer/item fields with ISO dates. `POST /api/orders` reads a validated single `Idempotency-Key` header and current staff ID; it never reads creator/status/date from the body.

- [ ] Write parameterized body/header/money cases, plus a test named `idempotency parallel create returns one order`. Fire two independent HTTP requests concurrently; assert both statuses 201, equal IDs/bodies, SQL order count 1, one complete item set, and one receipt.
- [ ] Add same payload/different keys => two orders; different staff/key scopes; item-write failure => no partial order/receipt; discarded successful response => safe replay; second app instance => replay.
- [ ] Run `bun run test:idempotency` and the focused creation cases; confirm genuine failures before implementation.
- [ ] Implement all trust-boundary limits from SECURITY. Use one READ COMMITTED transaction for receipt claim, order/items, and saved response. On conflict read in a subsequent statement, and replay the original result. Never treat an unrelated database failure as a successful replay.
- [ ] Rerun the cases with a real connection pool allowing simultaneous requests. Print the two returned IDs and SQL count in the proof test; confirm restart durability and rollback. Update SEC-02/06/07 with the passing evidence.
- [ ] Review checkpoint: record actual transaction/key/money decisions and SQL evidence. Set `Awaiting user review`, leave changes uncommitted, and STOP before phase 5.

## Phase 5 — bounded list and authorized deletion

**Decisions — proposed, not implemented:**

- Choose compound sort-value/ID cursors over offsets to avoid deep-offset scanning. Next/Previous uses a browser cursor stack; no reverse-query engine, arbitrary page jumps, or snapshot transaction.
- Choose parameterized literal substring search with trigram indexes over unrestricted SQL/wildcards or a separate search service. Very short/common terms can still lead to scans; measure them.
- Choose admin-only single-order deletion while retaining receipts over cascading deletion of all associated history. Historical create responses remain replayable without recreating deleted orders.
  **Decision evidence at handoff:** bounded query/sort cases, real query plans, role denial without writes, and replay after deletion. **Review status:** not started.

**Files:** Modify the orders controller/service and `test/orders.e2e-spec.ts`; create `dto/list-orders.dto.ts` and one feature-local `cursor.ts` encoder/validator. No dependency or generic pagination layer.

**Interfaces:** `list(query: ListOrdersDto)` returns `{ items: OrderSummary[], nextCursor: string | null }`. Query fields: `search`, `status`, `sort`, `direction`, `after?`, `pageSize`; reject page/offset and unknown/repeated fields. Follow the guide's exact versioned query-bound base64url cursor contract, 2048-character limit, integer/ISO validation, and millisecond timestamp precision. `remove(orderId: number): Promise<void>` deletes a real order/items or throws 404. Routes: `GET /api/orders` for both roles and `DELETE /api/orders/:id` for admin.

- [ ] Write cases for combined name/email search/status, literal wildcard characters, date/amount both directions with tied values, size bounds/no matches, and invalid sort/status/IDs. Traverse the entire unchanged fixture at sizes 1/50 and compare IDs with one fully sorted fixture; test first/last/empty pages and last-returned-row cursor generation. Test agent deletion is 403 with no changes; admin succeeds; missing order is 404.
- [ ] Reject malformed/oversized/noncanonical cursor encoding, invalid UTF-8/JSON/shape/version/IDs/date/amount, and mismatch in any normalized filter/sort/direction/size. Cover timestamp precision, deleted anchors, inserts/deletes between pages, and valid beyond-end cursors. Validate cursor contents before SQL; treat them as positions, never authorization.
- [ ] Add `idempotency replay after deletion does not recreate order`: create, admin-delete, retry the original key/body, assert original saved response and zero corresponding orders/items with the receipt retained.
- [ ] Run focused cases and observe failures; implement parameterized tuple comparisons `(sortColumn, id) > (value, id)` for asc and `<` for desc, applying all filters/access predicates. Use matching ORDER BY/ID direction and `pageSize + 1`; emit nextCursor only when an extra row exists. Never look up the anchor or use OFFSET. Avoid an item query per row. Do not promise snapshot behavior under writes.
- [ ] Implement admin deletion without deleting the retry receipt. Rerun list/role/deletion cases, inspect representative `EXPLAIN (ANALYZE, BUFFERS)` output at 50,000 orders, and record machine/query details without inventing a latency promise.
- [ ] Review checkpoint: record actual pagination/search/deletion decisions and measured limits. Set `Awaiting user review`, leave changes uncommitted, and STOP before phase 6.

## Phase 6 — simple feature UI, latest query, and optimistic create

**Decisions — proposed, not implemented:**

- Choose ordinary feature-local React state over Redux/global order state; one list does not justify another state framework. Keep base Next routing unchanged.
- Choose abort plus a current-query check over cancellation alone so late data/error/finally callbacks cannot overwrite current state.
- Choose per-operation optimistic rows and staff-scoped frozen pending attempts over whole-list snapshot rollback. sessionStorage enables same-tab recovery but contains customer data and needs explicit cleanup/account separation.
  **Decision evidence at handoff:** three-filter race, targeted rollback, double-click, unknown-outcome retry, and account-switch isolation. **Review status:** not started.

**Files:** Modify `apps/web/src/app/page.tsx` and existing layout only as needed. Create `src/app/login/page.tsx`, `src/lib/api.ts`, `src/features/auth/{api.ts,login-form.tsx}`, and `src/features/orders/{types.ts,api.ts,use-orders.ts,orders-page.tsx,orders-table.tsx,order-form.tsx}`. Do not add a local Playwright configuration or dependency. Save a small browser-check script only if useful with the verified global runtime; otherwise record manual reproduction/results here. Remove the web DB dependency if its last import is removed; don't expose database types to the browser.

**Interfaces:** `OrderQuery` matches phase 5; `OrderResponse` matches phase 4. `useOrders(query: OrderQuery)` supplies query-tagged results/loading/error/refetch. `PendingAttempt` contains current staff ID, request key, frozen create input, and pending/unknown status. Relative `/api` requests use the phase 3 rewrite.

- [ ] Write browser checks named `latest filter wins` and `rejected create removes only its pending row`. Delay A/B responses, complete C first, then release A/B/errors; assert only C's results/error/loading state remain. Reject a submitted create and assert its row disappears while the draft and unrelated rows remain.
- [ ] Reproduce the browser scenarios manually, or with the verified existing global Python/Bun Playwright runtime, to confirm absent UI behavior. Configure test API/web at 4001/2001 with separate test DB and Origin; don't reuse development servers/data. Browser checks that intercept list/create responses still use the real login/cookie path where needed. Do not install a local runner or browser.
- [ ] Implement login/current-user handling and ordinary feature components. Add search debounce, immediate filters, cursor/history reset on every query change and confirmed create/delete/Refresh/account change, stable query tags including cursor/staff, AbortController cleanup, and active checks including error/finally handlers. Next pushes the server cursor only after success; Previous reuses history. Disable navigation while fetching; failed navigation keeps the successful position for retry, and empty later pages retain Previous/Refresh.
- [ ] Verify Next/Previous and query resets for both sorts/directions, deleted anchors, empty pages, and late responses. Logout waits for server success, offers Retry on 503/network failure, then clears private data/history and invalidates pending list callbacks; 401 does the same. Keep unresolved creates staff-scoped. Do not add a cross-tab bus or clear another login's session.
- [ ] Implement bounded client validation and cents parsing. Synchronously lock a submitted attempt, persist its key/frozen payload before sending, and immediately show a labeled pending row outside confirmed filter/page counts.
- [ ] Implement success reconciliation/refetch, targeted rejection rollback, and uncertain-outcome retry with the same key. Partition pending storage by staff ID; never let another signed-in account see/replay a stored attempt. Explain explicit discard on shared devices; it does not cancel a request.
- [ ] Rerun browser cases. Manually double-click, change filters during submit, expire login, and retry a dropped-response attempt. Verify keyboard/labels/errors and cookie forwarding. Update SEC-08 only with evidence.
- [ ] Review checkpoint: record actual component/state/recovery decisions and browser evidence. Set `Awaiting user review`, leave changes uncommitted, and STOP before phase 7.

## Phase 7 — combined failure cases and final checks

**Decisions — proposed, not implemented:**

- Choose real PostgreSQL integration tests over mocked uniqueness/transactions; only real competing connections test the server guarantee.
- Choose focused manual browser checks with optional existing global Playwright automation over a new local test dependency; prioritize stale filters, optimistic rejection, and uncertain retry recovery. Record the runtime and whether each check was manual or automated.
- Treat sandbox/package/network failures separately from code failures; rerun in an appropriate environment before assigning a defect to source. Record all skipped checks rather than hiding them.
  **Decision evidence at handoff:** actual command output, reproduced regression checks, and an explicit untested list. **Review status:** not started.

**Files:** Extend the existing API/browser test files; change product files only to fix demonstrated failures. Add no second proof script or test runner.

**Interfaces:** Reuse phases 1–6 contracts and the complete checklist in `docs/IMPLEMENTATION_PLAN.md` section 11.

- [ ] Add a browser case for commit followed by lost response: first response is dropped, Retry sends the same key/body, SQL still has one order. Include same-tab reload and staff-switch isolation. Add duplicate real/temp-row reconciliation when the list sees the order before create success.
- [ ] Exercise 10 concurrent retries; invalid nested values/money bounds; latest-request failures; missing/hostile Origin; throttling; and cleanup refusal against development credentials. Avoid a single enclosing database transaction masking concurrency.
- [ ] Run `bun run typecheck`, `bun run lint`, `bun run test:api`, `bun run test:idempotency`, `bun run db:check`, and `bun run build`. Run browser scenarios separately, manually or with the verified global runtime, without installing Playwright locally. Record exact results, failures, and skipped checks. New failures get a focused regression assertion before their minimal fix.
- [ ] Complete manual accessibility and failure-state checks from the checklist. Replace Google font downloads with a local/system font only if needed to make the promised local build independent of that network request.
- [ ] Review checkpoint: record actual testing tradeoffs, failures/fixes, and untested cases. Set `Awaiting user review`, leave changes uncommitted, and STOP before phase 8.

## Phase 8 — written answers and clean setup rehearsal

**Decisions — proposed, not implemented:**

- Keep detailed phase reasoning here and exactly three weighed decisions in root DECISIONS.md rather than turning the required submission into an eight-phase changelog.
- Choose prerequisite-explicit local setup over Docker/hosted provisioning; measure real application setup and state database/browser installation separately.
- Document security/scale limits and skipped features over claiming production readiness; add SCALE.md only for a senior submission.
  **Decision evidence at handoff:** actual README rehearsal, documentation/implementation agreement, and final check results. **Review status:** not started.

**Files:** Create root `README.md`; fill existing `DECISIONS.md`; update `SECURITY.md` status/evidence and this plan. Create `SCALE.md` only if submitting as senior. Keep examples/scripts synchronized with actual commands.

**Interfaces:** README is the executable user setup path; SECURITY states implemented rules and remaining limits; DECISIONS contains exactly three weighed decisions plus actual AI use. Draft text is in the architecture guide, not proof of implementation.

- [ ] Write setup with prerequisites, Bun install, DB creation, env, committed migrations, deterministic seed, start, and test/proof commands. Document seeded local-only credentials and role behavior.
- [ ] List the original contractor-auth defects and actual fixes, give the 2–3-sentence token-storage answer, the at-most-five-line product answer, and skipped-work reasons. Cursor pagination and per-session logout revocation are included. State live-list/in-flight-request limits, per-process limiting, and receipt/key retention; do not describe offset pages or copied-token validity after logout as the design.
- [ ] Fill three decisions: idempotency versus content uniqueness; PostgreSQL versus SQLite; compound cursors/explicit React state versus offset pages. Each is 5–8 lines with an alternative, rejection reason, and drawback. AI disclosure describes only actual work and executed checks.
- [ ] Rehearse README setup against a fresh local demo database without dropping the development database or overwriting configured environment files. Time the actual steps; separate prerequisite installation from application setup and state the measured limit honestly.
- [ ] Update this plan's boxes/status and SECURITY evidence only for completed work. Preserve failures/unchecked cases. Record final decisions, set `Awaiting user review`, leave changes uncommitted, and STOP; do not commit/push/publish automatically.

## Execution and delivery notes

Phases 1–2 were reviewed by the user. Phase 3 is implemented and **awaiting user review**; phases 4–8 have not started. Before resuming, read this phase's decisions/results, inspect the current working tree, and follow the user's review gate. No command here authorizes destructive data resets or bundling unrelated staged work into a commit.

Native inline execution is recommended because phases share schema/API contracts. Phase 3 received an independent source review. At every later phase boundary, wait for the human's explicit review approval and keep all work uncommitted unless separately instructed to commit.
