# Atelier art studio prototype

A small full-stack prototype for buying one-of-a-kind paintings. It includes customer
registration and sessions, a public gallery, purchase without payment, customer order
history and cancellation, plus studio painting management and all-order visibility.

## Requirements

- Node.js 20 or newer
- npm

SQLite is embedded; no external database service is needed.

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and replace placeholder secrets. Keep the permitted
   client origin as `http://localhost:5173` for the default local setup.

   ```powershell
   Copy-Item .env.example .env
   ```

3. Apply migrations and seed the controlled studio account plus clearly labelled
   sample painting fixtures:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

4. Start the API and Vite client together:

   ```powershell
   npm run dev
   ```

5. Open `http://localhost:5173`.

The studio login is configured by the seed email and password variables in `.env`.
Public registration creates customer accounts only. The SQLite file persists between
restarts; rerunning the seed is intended to preserve existing paintings.

## Useful commands

```powershell
npm test          # server integration tests
npm run build     # production client build
npm run dev       # server and client development processes
npm start         # API only
```

## API and behavior

The frozen routes, shapes, status values, and error rules are in
[`CONTRACTS.md`](CONTRACTS.md). All mutations are authorized on the server. A customer
cannot submit an owner ID, studio-only operations reject customers, and another
customer's order is hidden behind a `404`.

The Vite development server reads `PORT` from the root environment and proxies `/api`
to that local server. The browser therefore uses one origin for session-safe requests.

## Included and deferred

Included: authentication, public painting browsing, studio create/edit, customer
purchase, role-scoped order lists and details, owner cancellation, persistent SQLite
data, and conflict-safe single ownership.

Deferred: wall bookings because the official rate file was not supplied; pottery;
payments; uploads; deployment; password reset; and other account extras. Seeded
paintings are sample fixtures, not the official dataset.

See [`DESIGN.md`](DESIGN.md) for the security/concurrency decisions, honest verification
record, omissions, and a demonstration outline under five minutes.
