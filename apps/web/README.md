# Web

Next.js app that displays users from the API. Requires Bun 1.4+ and Node.js 24+.

Follow the root [setup instructions](../../README.md#install-and-run) first. Start the API, then run this command from the repository root:

```powershell
bun --env-file=.env run dev:web
```

Open [http://localhost:3000](http://localhost:3000). Set `API_URL` in the root `.env` if the API uses a different address; requests are made on the server.

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
