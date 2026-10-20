# Art studio prototype design

## Product boundary

This prototype concentrates on the complete lifecycle of a one-of-a-kind painting:
studio creation and editing, public browsing, customer purchase, role-scoped order
history, cancellation, and later purchase by another customer. There is no payment
step. Wall bookings are deliberately not exposed because the official rate in
`seedData.zip` was unavailable and the core checkpoint took priority. Pottery,
uploads, deployment, and account extras are also out of scope.

## Architecture

The browser client is React 19 built with Vite and routed with React Router 7 (`react-router-dom`).
It talks to an Express 5 JSON API at `/api`; Vite proxies that path to the server during
development. In production, Express serves built assets and delegates unknown non-API routes
to the React application so client routes (and the custom 404 page) render cleanly.

The server stores application data in MongoDB using Mongoose 9, with session storage
backed by MongoDB via `connect-mongo`. Data integrity and concurrency are guaranteed through
MongoDB multi-document transactions and a partial unique index on orders
(`{ paintingId: 1 }, { unique: true, partialFilterExpression: { status: 'placed' } }`).

Success responses use `{ "data": ... }`. Errors use a stable code and human-readable
message under `error`, with optional field errors. Money is always an integer number
of INR paise on the server and is formatted as rupees only for display.

## Login, roles, and ownership

The application provides dual authentication: standard password login (hashed with `bcryptjs`)
and Google OAuth 2.0 via `passport-google-oauth20`.

Internal authorization roles remain `customer` and `studio` to preserve permission middleware.
In the user interface, these roles are presented as **Buyer** and **Seller**.
Public registration always creates a `customer` (Buyer). The sole `studio` (Seller) account is
created by the idempotent seed command.

Google OAuth flow:
- `GET /api/auth/google` starts the flow.
- `GET /api/auth/google/callback` processes provider callback.
- New Google users are automatically assigned the `customer` (Buyer) role.
- Only provider-verified emails are trusted.
- If a verified Google email matches an existing account (including studio), it is safely linked
  without altering its existing role. Google users can never inject or escalate to the studio role.
- Missing Google credentials are handled gracefully: the application displays a helpful
  configuration message without crashing.

Server middleware is the authority: missing authentication returns `401`, a wrong role returns
`403`, and a customer asking for another customer's order receives `404`. Purchase and
cancellation ownership always comes from the server session; the client never supplies a customer ID.

## Rate limiting

Configured via `express-rate-limit`:
- Standard API limiter on `/api/*` (300 req / 15 min).
- Strict auth limiter on registration and password login (10 req / 15 min).
- OAuth limiter on initiation and callback endpoints (25 req / 15 min).
- Returns standard HTTP 429 status with code `RATE_LIMITED` and standard headers.
- Isolated limiter state in tests prevents pollution across suites.

## Painting concurrency and history

Availability is derived from the absence of an active `placed` order. Purchase runs inside
a MongoDB transaction session: checks existence and availability, and inserts an order
with a price snapshot. The partial unique index on `orders` where `status = 'placed'` serves
as the final concurrency guard at the database engine level. If two buyers attempt to purchase
the same painting simultaneously, exactly one order is created (201) and the competing purchase
is rejected with `409 PAINTING_UNAVAILABLE`.

Cancellation updates only the owned placed order to `cancelled` with `cancelledAt` timestamp.
Because availability is derived, the painting becomes immediately purchasable again.
Studio editing uses the same atomic lock and rejects a sold painting with `409 PAINTING_SOLD`.

## Interface and loading experience

- Dedicated pages: `/` (Home), `/login` (Login), `/register` (Registration), `/gallery` (Paintings),
  `/buyer` (Buyer Dashboard), `/seller` (Seller Dashboard), and `*` (Branded 404 Page).
- Animated Logo Loader: Atelier easel canvas monogram with animated brush stroke and serif letter 'A'.
  Accessible with `role="status"` and live region. Complies with `@media (prefers-reduced-motion: reduce)`.
  Does not permanently block pages if an API request fails.
- All views feature loading, empty, pending, error, and conflict states.

## Verification record

Checks executed on 2026-10-20 on branch `feature/mongodb-google-auth`:

- `npm test`: 4 test suites and 16 tests passed with zero failures.
  1. Production session secret validation (rejects missing or <32 characters in production mode);
  2. MongoDB connection failure provides clear startup error;
  3. Customer-only public registration, session persistence, logout, and login;
  4. Duplicate account rejection, credential checks, and mutation origin protection;
  5. Google OAuth verified email checking, customer assignment, and unverified email rejection;
  6. Safe Google account linking to existing studio account without role modification;
  7. Missing OAuth configuration handled safely;
  8. Authentication rate limiting returning HTTP 429 with `RATE_LIMITED` code;
  9. Backend API 404 returning JSON `ROUTE_NOT_FOUND`;
  10. Required MongoDB indexes verified (including partial unique index on placed orders);
  11. Public browsing and studio mutation validation;
  12. Concurrent purchase collision test (one winner 201, one conflict 409 `PAINTING_UNAVAILABLE`);
  13. Sold painting edit rejection (409 `PAINTING_SOLD`);
  14. Ownership hiding (404 `ORDER_NOT_FOUND`), price snapshot immutability, and cancellation/repurchase restoration;
  15. Complete end-to-end studio and two-buyer journey with persistence across app restarts;
  16. Frontend routing contract (SPA index.html served for client routes and JSON for API routes).
- `npm run build`: Vite 7 production bundle built successfully.
- `npm --prefix client run lint`: oxlint passed with 0 warnings and 0 errors across all 14 files.
- `npm run db:init`: Idempotent index initialization completed successfully.
- `npm run db:seed`: Idempotent seeding completed successfully.
- Concurrency and transaction tests run against in-memory replica set (`MongoMemoryReplSet`).

## Five-minute demonstration

1. **Home Page (45 sec):** Start on `/`. Show the Atelier introduction, animated-logo loader, honest service descriptions, and featured paintings.
2. **Login & Google OAuth (60 sec):** Go to `/login`. Point out the Google OAuth button and email form. Show how missing Google configuration gracefully surfaces helpful guidance. Log in with studio credentials (`studio@artstudio.com`). Show the navigation indicates **Seller**.
3. **Seller Workspace (60 sec):** Go to `/seller`. Add a new painting. Point out that unsold paintings can be edited and appear in the gallery.
4. **Buyer Registration & Concurrent Purchase (75 sec):** Open buyer window, register `buyer1@example.com`, purchase the painting. Attempt simultaneous purchase from `buyer2@example.com` to demonstrate 409 `PAINTING_UNAVAILABLE`. Show the placed order with exact price snapshot in `/buyer`.
5. **Cancellation & Repurchase (45 sec):** In `/buyer`, cancel the order. Point out that `/gallery` immediately shows the painting as available again. Buyer 2 purchases it, confirming repurchase availability.
6. **404 & Rate Limiting (15 sec):** Visit `/some-unknown-path` to show the branded 404 page with return links. Demonstrate rate limiting on repeated failed attempts.
