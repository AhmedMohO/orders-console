# API

NestJS API backed by PostgreSQL and Drizzle.

Requires:

- Bun 1.4+
- Node.js 24+
- PostgreSQL

## Start the API

Follow the [root setup instructions](../../README.md#install-and-run) first.
Then run this command from the repository root:

```powershell
bun --env-file=.env run dev:api
```

The API runs at `http://localhost:4000` by default. The web app sends its
relative `/api/*` requests to this API.

To run without file watching:

```powershell
bun --env-file=.env run --filter api start
```

## Endpoints

All paths include the `/api` prefix.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | Public | Returns `{ "ok": true }` |
| POST | `/auth/login` | Public | Logs in and sets an HttpOnly cookie |
| GET | `/auth/me` | Staff | Returns the current user |
| POST | `/auth/logout` | Public | Revokes the current session and clears the cookie |
| GET | `/orders` | Staff | Lists orders using cursor pagination |
| POST | `/orders` | Staff | Creates an order |
| DELETE | `/orders/:id` | Admin | Deletes an order |

### Login

Send:

```json
{
  "email": "admin@example.com",
  "password": "AdminDemo123!"
}
```

The request must include an `Origin` header matching `APP_ORIGIN`.
The response sets the configured authentication cookie. Postman and browsers
send this cookie automatically on later requests.

Seeded accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `AdminDemo123!` |
| Agent | `agent@example.com` | `AgentDemo123!` |

### List orders

`GET /api/orders` accepts:

- `search` — case-insensitive name or email search
- `status` — `pending`, `processing`, `completed`, or `cancelled`
- `sort` — `createdAt` or `totalCents`
- `direction` — `asc` or `desc`
- `pageSize` — 1 to 100; default is 50
- `after` — cursor returned by the previous response

Example:

```text
GET /api/orders?status=pending&pageSize=25&sort=createdAt&direction=desc
```

Response:

```json
{
  "items": [],
  "nextCursor": null
}
```

Use `nextCursor` as `after` to fetch the next page. Keep the other query
parameters unchanged when using a cursor.

### Create an order

Send exactly one printable ASCII `Idempotency-Key` header, between 1 and 128
characters. Use the same key and the same body when retrying a request.

```json
{
  "customerName": "Jane Doe",
  "customerEmail": "jane.doe@example.com",
  "items": [
    {
      "description": "Blue Widget",
      "quantity": 2,
      "unitPriceCents": 1250
    }
  ],
  "totalCents": 2500
}
```

The API recalculates the total and rejects mismatches. It validates all fields,
including item count, descriptions, quantities, prices, and email format.
The order, items, and idempotency receipt are saved atomically.

### Delete an order

`DELETE /api/orders/:id` requires an admin session and a matching `Origin`
header. It returns `204` when the order is deleted.

Invalid IDs return `400`, missing orders return `404`, and agents return `403`.
The idempotency receipt is retained, so retrying an old create request does not
recreate a deleted order.

## Security

- Login, logout, order creation, and deletion require an `Origin` matching `APP_ORIGIN`.
- Authentication uses an HttpOnly, SameSite=Lax cookie.
- Cookies use `Path=/api`.
- Cookies are Secure in production and work over HTTP in development/test mode.
- Tokens are not returned in JSON, URLs, or Authorization headers.
- Login is limited to 5 attempts per minute per IP.
- JSON request bodies are limited to 32 KB.
- `AUTH_COOKIE` controls the cookie name.
- `TOKEN_SECONDS` controls the session lifetime. The default is 900 seconds.
- Every protected request validates the database session and the user's current role.

## Checks

Run from the repository root:

```powershell
bun run test:api
bun run test:idempotency
bun run --filter api typecheck
bun run --filter api lint
```

Integration tests use the separate `.env.test` configuration and a PostgreSQL
database whose name ends with `_test`. Prepare it with:

```powershell
bun run db:test:migrate
```

To demonstrate idempotent order creation:

```powershell
bun run demo:idempotency
```

