# Current monorepo baseline review

**Original audit:** 2026-10-19. The findings/results below record the pre-implementation baseline. No commits or staging changes were made by the agent.

**Phase 1 update:** environment/test foundations are implemented and awaiting user review. B2 now passes with the workspace's own installed compiler/types; B3 is fixed; B4 is fixed at the shared DB factory, API startup, and Drizzle config. B5 has current root setup/examples and corrected API startup commands, while final assignment documentation remains phase 8 work. B1 is still open until phase 3: the demo `/users` endpoint remains public. The new Bun suite has 44 passing tests, all workspace typechecks and lint pass, production web build passes, and temporary API/web startup was verified. No schema changes or SQL writes were made. See the execution plan for actual decisions and evidence.

**Phase 3 update (2026-10-20):** the user reviewed Phase 2 and authorized Phase 3. B1 is fixed: `/users` and `/api/users` return 404, the public listing service and web caller are removed, and `/api/auth/me` returns only the authenticated staff member's safe fields. Session-backed login/logout, role/Origin guards, bounded JSON validation, throttling, and the Next rewrite are implemented. The older findings/results below remain historical baseline evidence; current verification is recorded in the execution plan and SECURITY.md.

Scope: current API/web/database source and callers, package/config scripts, assignment requirements, type/lint/test/build commands, an HTTP probe with fixture data, and read-only database counts/schema metadata. This is evidence from the stated checks, not proof that all possible bugs are absent.

## Current defects

### B1 — unauthenticated staff/customer identity exposure

- **Where:** `apps/api/src/app.controller.ts:13`, `apps/api/src/app.service.ts:10`, and the current web page fetching `/users`.
- **Reproduction:** start the real Nest application with a fixture DB provider; a request to `/users` with no credentials returns 200 and includes an email. The endpoint performs an unrestricted users-table select.
- **Why it matters:** anyone who can reach the API can read user names/emails. CORS does not authenticate a caller. Adding password hashes later would make returning full user rows even more dangerous.
- **Smallest repair scope:** remove the demo public-list route and its web caller; introduce safe explicit identity responses behind authentication. Until that repair is reviewed, keep the scaffold local and use no real customer data. If done as an isolated baseline repair before auth exists, remove both the endpoint and demo listing and present a static scaffold page rather than claiming auth is implemented.

### B2 — database workspace fails standalone typechecking

- **Where:** `packages/db/tsconfig.json:9` requests Node types, but the DB package does not declare its own `@types/node`/compiler development dependencies.
- **Reproduction:** from the root run `bun apps/api/node_modules/typescript/bin/tsc --noEmit --project packages/db/tsconfig.json`; TS2688 reports that the `node` type-definition file cannot be found. Confirmed outside the sandbox too.
- **Why it matters:** the database workspace cannot pass an independent check and relies on another workspace's tooling.
- **Smallest repair scope:** declare the DB workspace's compiler/Node types and add its own `typecheck` script. Rerun the check without borrowing the API's executable.

### B3 — current web page fails its configured lint rules

- **Where:** `apps/web/src/app/page.tsx:12` and `:15`.
- **Reproduction:** `bun run lint` in `apps/web` reports two `react-hooks/error-boundaries` errors for success JSX inside try/catch.
- **Why it matters:** web lint is red; try/catch is not a React render error boundary.
- **Smallest repair scope:** keep fetch/JSON failure handling inside try/catch and render the result afterward, or remove the demo users UI as part of B1. Do not add a framework just to avoid moving these returns.

### B4 — missing database URL is silently accepted

- **Where:** `apps/api/src/db/db.module.ts:11`, `packages/db/src/client.ts:5`, and `packages/db/drizzle.config.ts:8` use assertions without runtime validation.
- **Reproduction:** `createDb(undefined)` creates a pool successfully; the read-only probe printed `Missing URL rejected: false` and closed the unused pool. The API provider passes exactly that undefined value when DATABASE_URL is absent.
- **Why it matters:** a TypeScript `!` is erased at runtime. pg can fall back to its other configuration/defaults, so the API can start without its intended database target and fail later or use an unintended local target.
- **Smallest repair scope:** validate a non-empty intended connection URL at the shared factory boundary and in CLI configuration before connections/migrations are attempted. Test the rejection without connecting; keep the existing valid configuration untouched.

### B5 — a fresh checkout lacks reliable configuration instructions

- **Where:** no committed environment example or root README; `apps/api/README.md` advertises `start:dev`/`start:prod`, which do not exist in its package scripts.
- **Reproduction:** compare the advertised commands with `apps/api/package.json`; API bootstrap also requires CORS_ORIGIN but its required values are not supplied by a committed example.
- **Why it matters:** a reviewer cannot reproduce the configured local setup from tracked instructions.
- **Smallest repair scope:** add truthful environment examples and baseline setup commands, preserving the user's real `.env` files. Document only currently working behavior; add feature commands when implemented.

## Unfinished assignment scope, not evidence of a new regression

- Orders listing and login/create routes do not exist: `GET /api/orders` and `POST /api/auth/login` return 404.
- The schema lacks credentials/roles, customer snapshots, line items, idempotency receipts, and the planned query indexes/constraints.
- Read-only SQL confirms 4 users and 0 orders. The seed inserts four demo users, not 50,000 complete orders.
- There are no API test files. `bun run test` exits 1 with `No test files found`; that is not a passing test suite.
- There is no order form, latest-filter handling, optimistic creation, or rollback logic to validate yet.
- DECISIONS.md remains empty and the required final README answers remain unfinished.

These are the implementation phases' work. Do not describe the current application as satisfying the assignment merely because the scaffold compiles or the web builds.

## Verification results

| Check | Result |
|---|---|
| API typecheck | Pass outside sandbox |
| API lint | Pass |
| Web typecheck | Pass |
| Web lint | Fail: two JSX-in-try/catch errors |
| Database package typecheck | Fail: missing Node definitions |
| API tests | Fail: no test files |
| Web production build | Pass with access to configured Google font downloads |
| Anonymous fixture-backed `/users` request | 200, email field present |
| Orders/login route probes | 404 |
| Database counts | 4 users, 0 orders |
| Missing URL validation probe | Undefined URL accepted |

### Environment artifacts excluded from findings

Inside the sandbox, API probes initially reported missing transitive packages such as methods/tslib/pg-types, and API typechecking reported TS2883. Outside the sandbox, the probes/imports and API typecheck passed. These are resolution-environment artifacts, not confirmed source defects.

`bun install --frozen-lockfile` outside the sandbox checked the existing install and reported no changes. The lockfile/dependency manifests were not modified by the audit. Do not add those transitive packages as direct dependencies to hide the environment issue.

## Repair and review gate

The user's required order is: review this baseline, agree the repair scope, repair/verify the current defects, stop for review with uncommitted changes, then begin the approved feature phase. No baseline repairs or feature phases were executed by this review.

During each later phase record its actual decisions, rejected alternatives, verification results, and risks in the execution plan. Stop at `Awaiting user review`; do not continue automatically and do not commit unless explicitly instructed.

**Not checked:** full fresh-machine installation, a real 50,000-order query workload, browser interaction races, or concurrent create behavior; the necessary features/data are absent. Source review also identifies future integrity risks such as cascading user deletion and unconstrained order status/amount, which phase 2 must replace and test before real order writes exist.
