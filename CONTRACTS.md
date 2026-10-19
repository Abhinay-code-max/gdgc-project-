# Frozen implementation contracts

This file is the integration contract agreed before feature coding on 2026-10-19.

## Stack

- Node.js 20+, Express 5, React 19, Vite 7.
- SQLite through `better-sqlite3`, with WAL mode, foreign keys, explicit transactions,
  and partial unique indexes. The repository-local database is persistent and requires
  no external service for the prototype.
- `express-session` with a SQLite-backed session store, HTTP-only same-site cookies,
  `bcryptjs` password hashes, JSON body limits, and an Origin check on mutations.
- Vitest/Supertest for server integration and concurrency checks.

## Response and error format

Success responses are `{ "data": <resource> }`. List resources are arrays in `data`.
Delete-style mutations still return the updated resource. Errors are:

```json
{ "error": { "code": "STABLE_CODE", "message": "Human-readable message", "fields": {} } }
```

`fields` is optional. Status rules: malformed JSON/request `400`, unauthenticated
`401`, wrong role `403`, missing or another customer's resource `404`, uniqueness or
state conflict `409`, field/business validation `422`.

Dates are `YYYY-MM-DD`; timestamps are UTC ISO strings. Money is integer INR paise and
is exposed as `priceMinor`/`rateMinor`. IDs are integer JSON numbers.

## Authentication routes

- `POST /api/auth/register` body `{ email, password }` -> `201 {data:{user}}`.
  Always creates role `customer`. Duplicate email: `409 EMAIL_TAKEN`.
- `POST /api/auth/login` body `{ email, password }` -> `200 {data:{user}}`.
  Bad credentials: `401 INVALID_CREDENTIALS`.
- `POST /api/auth/logout` -> `200 {data:{loggedOut:true}}`.
- `GET /api/auth/me` -> `200 {data:{user}}`; no session: `401 AUTH_REQUIRED`.

User shape: `{ id, email, role, createdAt }`; roles are `customer | studio`.

## Painting and order routes

- `GET /api/paintings` is public -> painting summaries.
- `GET /api/paintings/:id` is public -> one painting.
- `POST /api/paintings` studio only; body
  `{ title, description, priceMinor, imageUrl? }` -> `201`.
- `PATCH /api/paintings/:id` studio only; same fields, partial -> `200`.
  A painting with a placed order returns `409 PAINTING_SOLD`.
- `POST /api/paintings/:id/purchase` customer only, no body -> `201 {data:{order}}`.
  Contention/sold returns `409 PAINTING_UNAVAILABLE`.
- `GET /api/orders` authenticated. Customer gets own orders; studio gets all.
- `GET /api/orders/:id` authenticated. Another customer's order is `404 ORDER_NOT_FOUND`.
- `POST /api/orders/:id/cancel` customer owner only -> updated order.
  Non-placed order returns `409 ORDER_NOT_CANCELLABLE`.

Painting shape: `{ id, title, description, priceMinor, imageUrl, available, createdAt,
updatedAt }`. Order shape: `{ id, customerId, customerEmail?, paintingId, paintingTitle,
priceMinor, status, createdAt, updatedAt, cancelledAt }`. Order statuses:
`placed | cancelled`. Customer ownership is always taken from `req.session.user`.

Purchase transaction: begin an immediate write transaction, load painting, check no
placed order, insert order with the current painting price, commit. A partial unique
index on orders `(painting_id) WHERE status = 'placed'` is the final guard.
Cancellation updates only the owned order from `placed` to `cancelled` in a transaction.
Availability is derived from the absence of a placed order. Editing uses the same
write lock and rejects a sold painting.

## Wall-booking proposed contract (not enabled before core checkpoint)

- `POST /api/wall-bookings` customer body `{ serviceDate, wallSizeSqFt, address }`.
- `GET /api/wall-bookings` authenticated and role-scoped.
- `GET /api/wall-bookings/:id` authenticated and ownership-hidden for customers.
- `POST /api/wall-bookings/:id/confirm` studio only.
- `POST /api/wall-bookings/:id/decline` studio only.
- `POST /api/wall-bookings/:id/cancel` owning customer only.

Statuses: `requested | confirmed | declined | cancelled`. Asia/Kolkata calendar date
boundaries are inclusive: requests allow today + 7 through today + 90; size 10 through
500; cancellation is allowed while requested/confirmed when service date is at least
today + 3. Requested/confirmed dates are protected by a partial unique index.
The server snapshots the official seed rate and calculates `priceMinor = size * rate`.
No endpoint will be enabled until an official rate is available.

## File ownership

- Agent 1: root shared config, `server/db/**`, `server/migrations/**`,
  `server/middleware/**`, `server/routes/auth.js`, `server/app.js`, shared contracts,
  and authentication/foundation tests.
- Agent 2: `server/routes/paintings.js`, `server/routes/orders.js`, and painting/order
  integration tests. Schema/auth changes must be requested from Agent 1.
- Agent 3: `docs/WALL_BOOKING_CONTRACT.md` until the core checkpoint. If enabled,
  `server/routes/wallBookings.js` and wall-booking tests; migration changes remain Agent 1.
- Agent 4: `client/**`, `README.md`, final `DESIGN.md`, and end-to-end integration notes.
  Agent 4 does not edit server feature or schema files.

