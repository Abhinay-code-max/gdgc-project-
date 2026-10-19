# Art studio prototype design

## Product boundary

This prototype concentrates on the complete lifecycle of a one-of-a-kind painting:
studio creation and editing, public browsing, customer purchase, role-scoped order
history, cancellation, and later purchase by another customer. There is no payment
step. Wall bookings are deliberately not exposed because the official rate in
`seedData.zip` was unavailable and the core checkpoint took priority. Pottery,
uploads, deployment, and account extras are also out of scope.

## Architecture

The browser client is React 19 built with Vite. It talks to an Express JSON API at
`/api`; Vite proxies that path to the server during development. The server stores
application and session data in a persistent repository-local SQLite database using
`better-sqlite3`. WAL mode, foreign keys, explicit immediate transactions, and a
partial unique index provide a compact setup without an external database service.

Success responses use `{ "data": ... }`. Errors use a stable code and human-readable
message under `error`, with optional field errors. Money is always an integer number
of INR paise on the server and is formatted as rupees only for display.

## Login, roles, and ownership

Public registration always creates a `customer`. The sole `studio` account is created
by the controlled seed command. Passwords are hashed; the browser receives only an
HTTP-only, same-site session cookie. The server checks mutation origins.

The UI uses the current-user response to show role-appropriate navigation, but this is
only presentation. Server middleware is the authority: missing authentication returns
`401`, a wrong role returns `403`, and a customer asking for another customer's order
receives `404`. Purchase and cancellation ownership always comes from the session;
the client never supplies a customer ID.

## Painting concurrency and history

Availability is derived from the absence of a `placed` order. Purchase starts an
immediate SQLite write transaction, checks current availability, and inserts an order
with a price snapshot. A partial unique index on `orders(painting_id)` where status is
`placed` remains the final concurrency guard, so two buyers cannot both hold the same
painting. The loser receives `409 PAINTING_UNAVAILABLE`.

Cancellation changes the owning customer's placed order to `cancelled`; it does not
delete history. Because availability is derived, the painting becomes purchasable
again in the same committed state. Studio editing uses the same locking approach and
rejects a sold painting with `409 PAINTING_SOLD`.

## Interface behavior

The gallery is public. Authentication opens a focused login or registration dialog.
Customers can purchase from the gallery and cancel placed orders from **My orders**.
Studio users can add paintings, edit available work, and inspect all orders.

Every data view has loading, empty, and retryable error states. Mutation controls are
disabled while pending. Purchase, cancellation, and edit conflicts are called out and
the relevant collection is refreshed. Prices, statuses, roles, and permissions shown
after a mutation come from a fresh server response rather than optimistic assumptions.

## Seed and fixture policy

The studio account is controlled seed data. Any bundled paintings are visibly labelled
sample fixtures and are not represented as the official brief dataset. No wall rate,
pottery item, or glaze has been invented.

## Verification record

The final repository checks completed on 2026-10-19 were:

- `npm test`: 3 files and 6 tests passed. These cover authentication and mutation
  origin checks; public/studio painting permissions; exactly one winner for competing
  purchases; sold-painting edit rejection; ownership hiding; price snapshots;
  cancellation and repurchase; and a complete studio/two-customer server journey.
- `npm run build`: passed with Vite 7.3.7.
- `npm --prefix client run lint`: passed with no findings.
- Live development-origin smoke: the Vite page and transformed React entry modules
  returned `200`. Through the Vite `/api` proxy, a real cookie-backed customer session
  registered, purchased a painting, observed a matching price snapshot, cancelled it,
  and observed restored availability. A seeded studio session created and edited a
  painting and listed all orders.

Browser UI automation was unavailable, so the rendered screens were not verified by
an automated visual click-through. The live smoke used the same Vite origin, request
shapes, cookies, and server as the UI, but this limitation must remain explicit.

A submission-readiness cleanup pass was completed on 2026-10-19:
- Removed stale CommonJS orphan files (`server/db.js`, `server/server.js`,
  `server/auth.js`, `server/contracts.js`, `server/routes/wallBookings.js`,
  `server/services/`, `server/test_verification.js`, `scripts/verify.js`).
  None of those files are imported by the active ESM application or its tests.
- Fixed registration form password `minLength` from 8 to 12 to match server validation.
- Fixed end-to-end test to use an isolated OS temp directory; added `afterAll` cleanup
  of the temp dir; stops silently swallowing unexpected filesystem errors.
- Updated `.gitignore` to cover all SQLite variants, the root `dist/` directory, and
  test-generated databases.

## Omissions and next steps

1. Obtain the official `seedData.zip`, replace sample fixtures, and retain clear data
   provenance.
2. Add wall booking only with the official server-side rate, Asia/Kolkata date rules,
   active-date uniqueness, and its full permission/state-transition test matrix.
3. Add pottery only after the painting and wall journeys remain green.
4. Add deployment and production secret/session configuration only if the product
   scope expands beyond this local prototype.

## Five-minute demonstration

Before running the demo, copy `.env.example` to `.env` and set `STUDIO_EMAIL`,
`STUDIO_PASSWORD`, and `SESSION_SECRET` to real values. Do not use any hard-coded
credential shown in documentation.

1. Start on the public gallery and point out availability and public access (30 sec).
2. Log in as the seeded studio account using the `.env` credentials, create a painting,
   and edit it (60 sec).
3. Register customer A, purchase that painting, refresh **My orders**, and show the
   stored price (60 sec).
4. Attempt purchase as customer B to show the availability conflict; cancel as
   customer A, then purchase as customer B (75 sec).
5. Return to the studio view to show all preserved order history (30 sec).
6. Walk through the purchase transaction and partial unique index as the featured
   code segment (45 sec).
