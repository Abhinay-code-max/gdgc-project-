# Frozen implementation contracts

This file is the integration contract agreed for the Art Studio application.

## Stack

- Node.js 20+, Express 5, React 19, React Router 7, Vite 7.
- MongoDB with Mongoose 9. Database is accessed via `MONGODB_URI` (MongoDB Atlas or replica set in dev/production). Tests use an isolated in-memory replica set (`MongoMemoryReplSet`) supporting multi-document transactions. Standalone topologies without transaction support are rejected.
- `express-session` with MongoDB-backed session store (`connect-mongo`), HTTP-only same-site (lax for OAuth redirect compatibility) cookies, `bcryptjs` password hashes, JSON body limits, and an Origin check on mutations.
- Passport.js with Google OAuth 2.0 strategy (`passport-google-oauth20`) with CSRF `state` enforcement.
- `express-rate-limit` for tiered endpoint protection with configurable `trustProxy`.
- Vitest/Supertest for server integration and concurrency checks.

## Response and error format

Success responses are `{ "data": <resource> }`. List resources are arrays in `data`.
Delete-style mutations still return the updated resource. Errors are:

```json
{ "error": { "code": "STABLE_CODE", "message": "Human-readable message", "fields": {} } }
```

`fields` is optional. Status rules:
- Malformed JSON / request `400`
- Unauthenticated `401`
- Forbidden / wrong role / bad origin `403`
- Missing or another customer's resource `404`
- Uniqueness or state conflict `409`
- Field / business validation `422`
- Rate limit exceeded `429`
- Server error `500`

Dates are `YYYY-MM-DD`; timestamps are UTC ISO strings. Money is integer INR paise and
is exposed as `priceMinor`. IDs are string representations of MongoDB ObjectIds.

## Authentication routes

- `POST /api/auth/register` body `{ email, password }` -> `201 { data: { user } }`.
  Always assigns role `customer` (Buyer). Duplicate email: `409 EMAIL_TAKEN`. Protected by `authLimiter`.
- `POST /api/auth/login` body `{ email, password }` -> `200 { data: { user } }`.
  Bad credentials: `401 INVALID_CREDENTIALS`. Protected by `authLimiter`.
- `POST /api/auth/logout` -> `200 { data: { loggedOut: true } }`.
- `GET /api/auth/me` -> `200 { data: { user } }`; no session: `401 AUTH_REQUIRED`.
- `GET /api/auth/config` -> `200 { data: { googleAuthAvailable: boolean } }`.
- `GET /api/auth/google` -> Starts Google OAuth 2.0 flow; generates cryptographically secure 32-byte session-bound `state` nonce; redirects to Google consent or `/login?error=oauth_not_configured` if credentials missing. Protected by `oauthLimiter`.
- `GET /api/auth/google/callback?state=...&code=...` -> Google OAuth callback. Validates incoming `state` against session-bound nonce (rejects mismatch/missing with redirect `/login?error=oauth_csrf_rejected`). Requires authoritative verified email claim (`email_verified === true`). Successful authentication establishes session and redirects to `/seller` (studio) or `/buyer` (customer). Failed, unverified, or cancelled redirects to `/login?error=...`. Protected by `oauthLimiter`.

User shape: `{ id, email, role, displayName, avatarUrl, createdAt }`.
Internal roles are `customer` and `studio`, displayed in UI as **Buyer** and **Seller**.

## Painting and order routes

- `GET /api/paintings` is public -> painting summaries with derived `available` boolean.
- `GET /api/paintings/:id` is public -> one painting with derived `available` boolean. Invalid ID or missing: `404 PAINTING_NOT_FOUND`.
- `POST /api/paintings` studio only; body `{ title, description, priceMinor, imageUrl? }` -> `201 { data: { painting } }`.
- `PATCH /api/paintings/:id` studio only; partial body -> `200 { data: { painting } }`.
  A painting with an active `placed` order returns `409 PAINTING_SOLD`.
- `POST /api/paintings/:id/purchase` customer only, no body -> `201 { data: { order } }`.
  Contention or already sold returns `409 PAINTING_UNAVAILABLE`.
- `GET /api/orders` authenticated. Customer receives own orders; studio receives all orders with `customerEmail`.
- `GET /api/orders/:id` authenticated. Another customer's order is hidden behind `404 ORDER_NOT_FOUND`. Studio receives any order with `customerEmail`.
- `POST /api/orders/:id/cancel` customer owner only -> `200 { data: { order } }`.
  Non-placed or already cancelled order returns `409 ORDER_NOT_CANCELLABLE`.

Painting shape: `{ id, title, description, priceMinor, imageUrl, available, createdAt, updatedAt }`.
Order shape: `{ id, customerId, paintingId, paintingTitle, priceMinor, status, createdAt, updatedAt, cancelledAt, customerEmail? }`.
`customerId` is always a 24-character hex ObjectId string, regardless of population.
Order statuses: `placed | cancelled`. Customer ownership is strictly derived from server session.

## Concurrency and database indexes

- Orders collection enforces single active placed order:
  `{ paintingId: 1 }, { unique: true, partialFilterExpression: { status: 'placed' } }`
- Users collection enforces unique email and sparse unique Google ID:
  `{ email: 1 }, { unique: true }`
  `{ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }`
- Multi-document transactions guarantee that purchasing checks painting availability and creates exactly one placed order atomically.

## Frontend client routes

- `/` — Public home page with studio overview, featured paintings, and service transparency.
- `/login` — Dedicated login page with email form and Google button.
- `/register` — Dedicated Buyer registration page.
- `/gallery` — Public paintings gallery with real-time availability badges.
- `/buyer` — Protected Buyer dashboard (order history, cancellation).
- `/seller` — Protected Seller dashboard (catalogue management, all orders).
- `*` — Branded 404 page with return navigation.
