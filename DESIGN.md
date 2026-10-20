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
Standalone MongoDB deployments that do not support transactions are rejected with an explicit
error.

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

Google OAuth security and flow:
- `GET /api/auth/google` creates a cryptographically secure 32-byte session-bound `state` nonce and starts the flow.
- `GET /api/auth/google/callback` strictly checks `req.query.state` against `req.session.oauthState` before continuing, mitigating login-CSRF attacks. Once validated, the state nonce is consumed immediately, preventing replay attacks.
- Authoritative email claim pairing: requires Google's verified email claim strictly paired with the respective email:
  - `_json.email` is accepted only when `_json.email_verified === true`.
  - An `emails[]` value is accepted only when that exact entry has `verified === true`.
  - Cross-pairing verification claims from one source with an email from another source is strictly prohibited.
  - Emails are normalized (trimmed and lowercased) only after successful claim pairing and validation.
- Missing, unverified, or mismatched emails are rejected with `unverified_email`.
- Malformed or missing emails are rejected with `invalid_email`.
- New Google users are automatically assigned the `customer` (Buyer) role.
- If a verified Google email matches an existing account (including studio), it is safely linked
  without altering its existing role. Google users can never inject or escalate to the studio role.
- Missing Google credentials are handled gracefully: the application displays a helpful
  configuration message without crashing.
- Verification status: The Google OAuth implementation is automated-test verified using mocked provider responses and mocked Passport flows; live end-to-end authentication with Google remains pending until real credentials and production callback URLs are supplied.

Server middleware is the authority: missing authentication returns `401`, a wrong role returns
`403`, and a customer asking for another customer's order receives `404`. Purchase and
cancellation ownership always comes from the server session; the client never supplies a customer ID.

## Rate limiting & proxy trust

Configured via `express-rate-limit`:
- `trust proxy`: Defaults to `false` for direct or local exposure to prevent `X-Forwarded-For` rate-limit spoofing. Configurable via `TRUST_PROXY` (e.g. `1` or `true`) when running behind reverse proxies.
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

Order serialization is stable: `orderJson` always returns a 24-character hex `customerId`
string regardless of whether the customer relationship was populated or unpopulated, and
supplies `customerEmail` when accessed by studio sellers.

## Interface and loading experience

- Dedicated pages: `/` (Home), `/login` (Login), `/register` (Registration), `/gallery` (Paintings),
  `/buyer` (Buyer Dashboard), `/seller` (Seller Dashboard), and `*` (Branded 404 Page).
- Animated Logo Loader: Atelier easel canvas monogram with animated brush stroke and serif letter 'A'.
  Accessible with `role="status"` and live region. Complies with `@media (prefers-reduced-motion: reduce)`.
  Does not permanently block pages if an API request fails.
- All views feature loading, empty, pending, error, and conflict states.

## Verification record

Checks executed on 2026-10-20 on branch `feature/mongodb-google-auth`:

- `npm test`: 5 test files and 33 tests passed with zero failures and zero warnings in parallel default portable mode.
  1. Production session secret validation (rejects missing or <32 characters in production mode);
  2. MongoDB connection failure provides clear startup error;
  3. Standalone MongoDB topology without transaction support is explicitly rejected;
  4. Customer-only public registration, session persistence, logout, and login;
  5. Duplicate account rejection, credential checks, and mutation origin protection;
  6. Authoritatively verified `_json.email` accepted;
  7. Authoritatively verified `emails[]` entry accepted;
  8. Unverified array email combined with verified `_json` claim rejected (prevents cross-source spoofing);
  9. Multiple array emails correctly selects the verified entry;
  10. Google unverified email (`verified: false` / `email_verified: false`) rejected;
  11. Missing Google verification claim rejected;
  12. Malformed or missing Google email rejected;
  13. Safe Google account linking to existing studio account without role modification;
  14. Session-bound CSRF state creation upon OAuth initiation;
  15. Valid matching state reaches Passport callback flow without contacting Google;
  16. Consumed state single-use enforcement (replay rejected with `oauth_csrf_rejected`);
  17. Missing OAuth callback state rejected;
  18. Mismatched OAuth callback state rejected;
  19. Safe provider error handling (error redirection to `/login?error=...`);
  20. Rate-limit spoofing prevented under default `trustProxy: false`;
  21. Reverse-proxy forwarding headers respected under configured `trustProxy`;
  22. Required MongoDB indexes verified (including partial unique index on placed orders);
  23. Public browsing and studio mutation validation;
  24. Concurrent purchase collision test (one winner 201, one conflict 409 `PAINTING_UNAVAILABLE`);
  25. Sold painting edit rejection (409 `PAINTING_SOLD`);
  26. Ownership hiding (404 `ORDER_NOT_FOUND`), stable `customerId` string serialization, price snapshot immutability, and cancellation/repurchase restoration;
  27. Complete end-to-end studio and two-buyer journey with persistence across app restarts;
  28. Frontend routing contract (SPA index.html served for client routes and JSON for API routes);
  29. Routing tests run with isolated temporary fixture, leaving no repo `dist/` pollution;
  30. Narrow Vite Rollup warning filter suppresses known React Router directive warnings;
  31. Application source directive warnings pass through to the default handler;
  32. Unrelated Rollup warnings pass through to the default handler;
  33. Invalid `MONGOMS_SYSTEM_BINARY` fails clearly during startup before test suites execute.
- `npm run test:system-mongo`: 5 test files and 33 tests passed serially (`--no-file-parallelism`) against MongoDB 8.3.4 with zero version conflicts and zero replica-set startup collisions.
- `npm run build`: Cross-env production build (`cross-env NODE_ENV=production`) compiles deterministically to `index-B2VCdnYL.js` (292.70 kB / 91.19 kB gzip) with 0 warnings in both development workspaces and clean checkouts.
- `npm run lint`: oxlint passed with 0 warnings and 0 errors across all 13 client files using the single root package configuration.
- `npm audit` and `npm audit --omit=dev`: Found 0 vulnerabilities.
- `npm run db:init`: Idempotent index initialization completed successfully.
- `npm run db:seed`: Idempotent seeding completed successfully.
- Dependency model: Single authoritative root `package.json` and lockfile with redundant `client/package.json` and `client/node_modules` eliminated. Clean checkouts install cleanly via `npm ci` with two documented expected lifecycle warnings (`allow-scripts` for `esbuild` and `mongodb-memory-server`).

## Five-minute demonstration

1. **Home Page (45 sec):** Start on `/`. Show the Atelier introduction, animated-logo loader, honest service descriptions, and featured paintings.
2. **Login & Google OAuth (60 sec):** Go to `/login`. Point out the Google OAuth button and email form. Show how missing Google configuration gracefully surfaces helpful guidance. Log in with studio credentials (`studio@artstudio.com`). Show the navigation indicates **Seller**.
3. **Seller Workspace (60 sec):** Go to `/seller`. Add a new painting. Point out that unsold paintings can be edited and appear in the gallery.
4. **Buyer Registration & Concurrent Purchase (75 sec):** Open buyer window, register `buyer1@example.com`, purchase the painting. Attempt simultaneous purchase from `buyer2@example.com` to demonstrate 409 `PAINTING_UNAVAILABLE`. Show the placed order with exact price snapshot in `/buyer`.
5. **Cancellation & Repurchase (45 sec):** In `/buyer`, cancel the order. Point out that `/gallery` immediately shows the painting as available again. Buyer 2 purchases it, confirming repurchase availability.
6. **404 & Rate Limiting (15 sec):** Visit `/some-unknown-path` to show the branded 404 page with return links. Demonstrate rate limiting on repeated failed attempts.
