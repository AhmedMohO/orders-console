# Security rules for Orders Console

**Status:** required implementation policy, not a statement that these controls already exist.

**Scope:** a local operations console using Bun, Next.js, NestJS, PostgreSQL, and Drizzle. No Docker or hosted security services. Implementation stays inside ordinary Nest feature modules and the existing Next App Router structure.

## 1. Roles and access

Staff accounts have exactly one role: `agent` or `admin`. Customers are order data, not staff accounts. Both staff roles work on the same shared order list; this version does not implement tenants or team isolation.

| Action                          | Anonymous                        | Agent           | Admin           |
| ------------------------------- | -------------------------------- | --------------- | --------------- |
| Basic liveness                  | Allowed                          | Allowed         | Allowed         |
| Login                           | Allowed; validated and throttled | Allowed         | Allowed         |
| Read own current staff identity | Denied                           | Allowed         | Allowed         |
| Search/list orders              | Denied                           | Allowed         | Allowed         |
| Create orders                   | Denied                           | Allowed         | Allowed         |
| Delete one order                | Denied                           | Denied          | Allowed         |
| User management, role editing   | Not implemented                  | Not implemented | Not implemented |

- NestJS enforces every permission. A hidden React button is not authorization.
- Protect routes by default with an authentication guard. Login and basic liveness are public; the idempotent logout handler bypasses the active-session guard but independently verifies its cookie and always checks Origin.
- Run authentication before role authorization. Return 401 for invalid credentials and 403 for an authenticated user with insufficient permissions.
- Load the current staff account after verifying the token. Use the database role, not a client field or an unchecked token role.
- The current public `/users` route must be removed. `/api/auth/me` returns only the authenticated user's safe fields.
- Existing sample accounts without a configured password hash cannot log in. Seeding must not silently reset passwords or promote an existing account on an email conflict.

## 2. Credentials and tokens

- Normalize staff email consistently with `trim().toLowerCase()` before lookup and storage. Do not trim or otherwise alter passwords.
- Hash seeded passwords asynchronously with Argon2id using `Bun.password.hash`; verify with `Bun.password.verify`. Never store plaintext passwords, reversible encryption, or fast general-purpose password hashes.
- For an unknown email or an account without a hash, perform a dummy password verification and return the same generic 401 message as a wrong password.
- Sign short-lived JWTs through `@nestjs/jwt`. This application's proposed settings are HS256, issuer `orders-console-api`, audience `orders-console-web`, and a 15-minute lifetime.
- Verification must require and validate subject, expiration, and UUID `sid`, check the signature, and enforce the configured algorithm/issuer/audience. `decode()` is never authentication.
- The subject identifies an existing staff ID. Reject deleted users and accounts without configured credentials. Do not accept a browser-supplied creator or role.
- Accept the browser token only from the intended cookie, `orders_access`. Query-string tokens and an unexpected Authorization header do not authenticate this cookie-only API.
- Require a generated signing secret with at least 32 random bytes. Reject missing secrets and example placeholders at startup; no hardcoded/default signing secret.
- Login returns only safe staff fields; do not return the token in JSON as well as the cookie.

- Store sessions in PostgreSQL: random UUID primary key, user foreign key, absolute expiry matching JWT `exp`. Insert and sign in one transaction; write the cookie only after commit. Store no raw token. Prune only that user's expired rows on successful login; no background worker.
- On every private request, join session and user by verified `sid`/`sub`; require a matching, unexpired session and current staff credentials/role. Do not cache authentication decisions. Database failures fail closed with 503.
- Logout requires the exact Origin, independently verifies the cookie, deletes only its matching session, waits for database success, then clears the cookie and returns 204. Repeated logout, missing cookies, and invalid/expired cookies return 204 with cookie clearing; unverified claims never select a session for deletion. Database deletion failure for a valid token returns 503 without claiming revocation.

**Known limit:** no refresh tokens or logout-all-devices. A deleted session rejects copied tokens at subsequent authentication checks across API processes; other independent logins remain active. Already-authorized requests may finish after logout. Expired sessions never authorize even if their rows remain stored.

## 3. Cookie, Origin, and transport rules

- Browser requests use relative `/api/*` URLs through the Next rewrite to Nest. The local API binds to loopback.
- Set `orders_access` with `HttpOnly`, `SameSite=Lax`, `Path=/api`, no Domain, and a lifetime no longer than the JWT. Enable `Secure` for HTTPS production; local HTTP uses a documented development setting.
- Clear the cookie with the same name and Path. Cookie Path limits where the browser sends it; it is not an authorization boundary.
- Do not store the authentication token in localStorage, sessionStorage, URLs, or browser-readable application state.
- Check `Origin` against the exact configured `APP_ORIGIN` on every unsafe request, including login and logout. Reject missing, `null`, malformed, or unexpected origins. CLI and test clients send the expected Origin explicitly.
- Login/create accept JSON, not HTML-form-compatible content types. GET requests never change state.
- Do not enable permissive credentialed CORS. The normal browser flow is same-origin through Next. CORS does not replace authentication or CSRF protection.
- Never disable certificate verification to make a request succeed. Production deployment would require HTTPS; this document does not establish deployment security.

**Token-storage** The token lives in an HttpOnly cookie, which stops JavaScript from reading it but does not stop injected scripts from acting through the signed-in browser. SameSite plus exact Origin checks reduce cross-site request forgery; they do not remove the need to prevent script injection. Logout deletes its server-side session and clears the cookie, so copied tokens fail subsequent authentication checks.

## 4. Input and money validation

Enable global Nest validation with transformation, whitelisting, and rejection of unexpected fields. Validate nested items. TypeScript types are not runtime validation. Repeat useful checks in the form, but trust the server checks.

| Input            | Required rule                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer name    | Trimmed, 1–100 characters                                                                                                                   |
| Customer email   | Valid email, at most 254 characters; consistently normalized                                                                                |
| Items            | 1–5 nested items                                                                                                                            |
| Item description | Trimmed, 1–200 characters                                                                                                                   |
| Quantity         | Integer, 1–999                                                                                                                              |
| Unit price       | Integer cents, 1–10,000,000                                                                                                                 |
| Order total      | Positive integer cents, at most 2,000,000,000; equals server sum                                                                            |
| Request key      | Printable ASCII, 1–128 characters; one value per request                                                                                    |
| Search           | At most 100 characters; blank means no search                                                                                               |
| Cursor / size    | Optional `after`, canonical base64url JSON, max 2048 chars, strict query-bound shape/types; page size 1–100, default 50; reject page/offset |
| Sorting          | `createdAt` or `totalCents`; `asc` or `desc`; ID tie-breaker                                                                                |
| JSON body        | Maximum 32 KB                                                                                                                               |
| Delete ID        | Positive safe integer within the database ID range                                                                                          |

- Cursor pagination pairs the allowlisted sort value with ID, uses exclusive `>` for ascending or `<` for descending, and applies every filter/access predicate. Treat cursors as untrusted positions, never permissions. Reject query mismatches and malformed values with 400; parameterize SQL. Date cursors use the database's `timestamptz(3)` precision so serialization cannot lose ordering information. Full contract and tests: [list design](docs/IMPLEMENTATION_PLAN.md#list).

- New orders receive `pending`, creator ID, and creation timestamp from the server. Reject these fields if provided in the create body.
- Allow only `pending`, `processing`, `completed`, and `cancelled` in stored statuses/filter input.
- Compute amounts from bounded integer cents; verify total against the sum of items. Reject overflow and inconsistent totals before any write.
- The form parses decimal money strings with at most two decimal places. Do not silently round extra decimals or accept exponent notation as currency input.
- Use database checks/foreign keys as another boundary, especially for scripts. Customer/staff records must not disappear through a staff-account cascade.

## 5. Database and idempotency

- Reuse one injected `pg.Pool` per API process through the existing DB provider. Set a finite connection timeout and close the pool on shutdown.
- Application credentials must not be the PostgreSQL superuser. Local migration credentials may own only the application's databases; deployed runtime permissions would be narrower.
- Parameterize values. Select sort identifiers from a fixed allowlist. Escape `%`, `_`, and backslash for literal substring searches; SQL parameterization alone does not make LIKE wildcards literal.
- Limit returned rows and avoid one item query per order. Do not expose internal SQL or connection details in error responses.
- Enforce unique `(creator_id, key)` in the request-receipt table. This version has one idempotent create operation; adding other operations requires including their identity in the key scope.
- Authenticate and validate before claiming a key.
- Claim the receipt, insert order/items, and save the successful response in one transaction. Never implement uniqueness with an unprotected check-then-insert.
- A replay for the same creator/key returns the original status/body without replacing the receipt or changing the order.
- Under READ COMMITTED, read a conflicting committed receipt in a subsequent SQL statement after the claim attempt; do not rely on a same-statement snapshot to see a concurrent winner.
- Roll back every part if creation fails before commit. A timeout/5xx does not prove no order was committed.
- Retain receipts after order deletion and across API restarts. Do not cascade-delete them with orders or automatically expire them in this assignment.

**Guarantee:** at most one committed order per creator/key. Different keys, separate agents, or independently entered identical orders are not business-level duplicate detection. Receipts preserve historical response data, including after deletion; their storage/privacy retention requires a product policy before production.

## 6. Browser state and customer data

- Render customer/item text through React's normal escaping; do not inject raw HTML.
- Keep pending submissions separate from confirmed server pages. Roll back only the rejected operation, not a saved snapshot of the entire list.
- Use cancellation plus a current-query check before updating results, errors, or loading state. Never let obsolete responses replace the current view.
- Keep one submission key and frozen payload for every unresolved attempt, including double-click, timeout, retry, and same-tab reload.
- sessionStorage may hold that pending attempt for reload recovery, but never the auth token. It contains customer data: minimize fields, remove it after a confirmed outcome, and stop before sending if required persistence fails.
- Partition stored attempts by the authenticated staff ID. On logout retain an unresolved attempt only for that same account; another account must not see or replay it. Provide explicit discard on a shared device with a warning that discarding does not cancel a possibly committed request.
- A definite validation rejection removes its optimistic row and preserves an editable draft. A network failure/abort/5xx keeps an 'outcome unknown' state and retries the same frozen operation.
- Do not generate a new key or edit an unresolved operation until its outcome is reconciled.

## 7. Abuse, errors, and logging

- Rate-limit login, initially 5 attempts per minute per source IP for the local single-process demo. Bound body size before expensive hashing.
- An in-memory limiter does not coordinate multiple API instances. Do not claim distributed brute-force protection. Do not trust arbitrary forwarded IP headers.
- Use generic credential failures. Handle missing orders and database failures with intentional responses; do not swallow errors as successful writes or replays.
- Return 400 for invalid input, 401 for invalid credentials, 403 for denied role/Origin, 404 for a missing order, 413 for oversized bodies, and 429 for throttling.
- API security headers apply to API responses; they do not automatically secure Next-served HTML. Verify the browser app separately.
- Never log passwords, hashes, cookies, tokens, database URLs, complete request bodies, or customer datasets. Log only enough identifiers/status to diagnose failures.

## 8. Secrets, migrations, and test safety

- Commit `.env.example` and `.env.test.example` with fake values. Ignore real `.env*` files while explicitly allowing those examples.
- Do not expose database URLs or signing secrets through `NEXT_PUBLIC_` variables or browser bundles.
- Document seeded passwords as local demo credentials only; hash them before inserting. Do not silently change existing users' credentials during a seed rerun.
- Commit reviewed migrations and the Bun lockfile. Do not regenerate projects or upgrade dependencies to `@latest` when a reviewer merely installs the submission.
- Use a separate PostgreSQL test database. Before destructive cleanup, check test mode, the actual connected database ending `_test`, and that it differs from the configured development target. Refuse cleanup if verification is inconclusive.
- Use bounded deterministic seed batches and a transactional seed receipt; rerunning the same dataset must not duplicate it or erase manual orders.
- Security and idempotency integration tests must use PostgreSQL and real transactions. Fixtures must permit concurrent requests on separate connections; a single enclosing test transaction would hide the required race.
- A check is complete only after its assertions passed; document anything not run.
- Browser automation must use the existing globally installed Python/Bun Playwright runtime when available and needed. Do not add Playwright to the apps or download browsers during project setup. Manual browser checks remain required when automation is not used; identify them honestly in the evidence.

## 9. Implementation status and required evidence

| Control                                | Owning phase | Required evidence                                                                                                                          |
| -------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-01 Environment/test isolation      | 1            | Invalid env and unsafe test-target checks fail safely                                                                                      |
| SEC-02 Integrity and durable receipts  | 2 / 4        | Migration/seed invariants; rollback; parallel create                                                                                       |
| SEC-03 Credentials and verified tokens | 3            | Login; forged/expired/mismatched-session rejection; copied-token replay denied after logout across instances; safe logout retries/failures |
| SEC-04 Cookie and CSRF checks          | 3            | Cookie attributes; hostile/missing Origin denied                                                                                           |
| SEC-05 Roles and private data          | 3 / 5        | No public users; agent delete denied without SQL changes                                                                                   |
| SEC-06 Validation and bounded SQL      | 4 / 5        | Nested invalid input, totals, pagination, sort allowlist                                                                                   |
| SEC-07 Retry and deletion safety       | 4 / 5        | Lost-response replay, restart replay, replay after deletion                                                                                |
| SEC-08 Safe browser state              | 6 / 7        | Three-filter race, targeted rollback, retry key/account isolation                                                                          |
| SEC-09 Abuse and error handling        | 3 / 7        | Login throttle, 413, safe error/log inspection                                                                                             |
| SEC-10 Honest delivery                 | 8            | README rehearsal and recorded check results                                                                                                |

## 10. Reporting and known limits

Report sensitive findings privately to the repository owner. Do not publish credentials, working session tokens, database URLs, or customer data in an issue or test screenshot.

This assignment does not implement MFA, password reset, account administration, refresh-token rotation, logout-all-devices, tenant isolation, snapshot pagination, distributed rate limiting, encrypted browser drafts, or a production retention/backup/deployment policy. Per-session revocation and cursor pagination are required planned controls. The current code remains unsafe for exposed real customer data until the planned controls are implemented and tested.

References: [Nest authorization](https://docs.nestjs.com/security/authorization), [Bun hashing](https://bun.sh/docs/runtime/hashing), [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [PostgreSQL conflict handling](https://www.postgresql.org/docs/current/sql-insert.html).
