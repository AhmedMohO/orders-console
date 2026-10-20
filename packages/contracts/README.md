# Shared API contracts

This package contains the public types shared by the API and web app.

## Structure

Use one file per resource:

- `src/users.ts` → `@repo/contracts/users`
- `src/orders.ts` → `@repo/contracts/orders`

When adding a resource:

1. Create `src/<resource>.ts`.
2. Add its subpath to `package.json`.
3. Export its request and response types, shared literals, and union types.

## Rules

- Define public fields explicitly.
- Represent JSON timestamps as strings.
- Keep database, Drizzle, NestJS, and server-only types out of this package.
- Add contracts when the related endpoint is implemented.
- Import contracts in the web app with `import type`.

The API maps database rows to these public types. Runtime validation stays in
the API.

## Check

From the repository root, run:

```powershell
bun run typecheck
```
