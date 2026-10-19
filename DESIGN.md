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

- `npm test`: 3 files and 7 tests passed with zero warnings and zero failures.
  These cover:
  1. Production session secret validation (rejects missing or <32 character secret in production mode);
  2. Authentication, mutation origin checks, session persistence, and customer role restriction;
  3. Public browsing permissions and studio mutation validations;
  4. Concurrency conflict resolution (exactly one winner on competing purchases);
  5. Sold-painting edit rejection (409);
  6. Ownership hiding (404) and price snapshots;
  7. Cancellation and repurchase availability restoration;
  8. Full end-to-end multi-account customer/studio journey and persistence across restarts
     (executed with clean temporary directory cleanup without EPERM/EBUSY handle warnings).
- `npm run build`: passed with Vite 7.3.7.
- `npm --prefix client run lint`: passed with no findings (oxlint, 0 errors, 0 warnings).
- Live development-origin manual browser smoke test:
  1. Public Gallery: Vite served index.html and assets with 200 OK; 4 paintings loaded unauthenticated.
  2. Studio Login: Logged in using configured credentials; session verified on `/api/auth/me`, activating "Manage studio" navigation.
  3. Create & Edit Painting: Created "Sunlit Terracotta" (id=5, 850.00 INR), edited title to "Sunlit Terracotta (Framed)" and price to 950.00 INR; verified update in catalogue.
  4. Customer Registration & Session: Registered "collector.alpha@artstudio.test" with 12+ character password; session verified, activating "My orders" navigation.
  5. Purchase: Purchased painting; received placed order with exact 950.00 INR price snapshot; painting immediately marked unavailable in gallery.
  6. Concurrency / Sold Protection: Attempted studio edit on purchased painting; rejected with 409 PAINTING_SOLD.
  7. Cancellation: Customer cancelled order; order marked cancelled with timestamp; painting instantly restored to available in gallery.
  8. Repurchase: Registered second customer "collector.beta@artstudio.test" and repurchased painting; second placed order created at current price snapshot.
  9. Refresh Persistence: Verified painting availability (sold) and orders persisted across queries.
  10. Role-appropriate Navigation & Order Scoping: Customer A views only own cancelled order; Customer B views only own placed order; Studio views all studio orders.

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
