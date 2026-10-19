# Wall-booking contract and validation design

Status: **design only; not enabled**. The painting purchase/cancellation checkpoint has
not passed, and the official `seedData.zip` rate is unavailable. This document does
not claim that wall bookings are implemented or verified.

## Dependencies and ownership

- Agent 1 owns the database migration, shared application wiring, authentication,
  permission helpers, and the controlled seed process.
- Agent 3 may implement `server/routes/wallBookings.js` and wall-booking integration
  tests only after the core painting checkpoint and Agent 1's migration/rate work.
- The official wall rate must come from the supplied seed dataset. No temporary or
  invented rate may be presented as official, and the endpoints must remain disabled
  until an official rate is installed by the controlled seed process.
- Agent 4 should add wall-booking screens only after the backend is enabled and its
  integration checks pass.

## Resource shape

All successful responses use `{ "data": <resource> }`; errors use the shared error
envelope in `CONTRACTS.md`.

```json
{
  "id": 1,
  "customerId": 7,
  "customerEmail": "customer@example.com",
  "serviceDate": "2026-11-01",
  "wallSizeSqFt": 120,
  "address": "12 Example Road, Kolkata",
  "rateMinor": 2500,
  "priceMinor": 300000,
  "status": "requested",
  "createdAt": "2026-10-19T12:00:00.000Z",
  "updatedAt": "2026-10-19T12:00:00.000Z",
  "cancelledAt": null,
  "decidedAt": null
}
```

`customerEmail` is included for studio list/detail responses and may be omitted from
customer responses. Monetary values are integer INR paise. `rateMinor` and
`priceMinor` are immutable snapshots; `priceMinor = wallSizeSqFt * rateMinor` is
calculated on the server. A request body must never accept a customer ID, role, rate,
price, or status.

## Routes and authorization

| Method and route | Allowed role | Body | Success |
| --- | --- | --- | --- |
| `POST /api/wall-bookings` | customer | `{ serviceDate, wallSizeSqFt, address }` | `201 {data:{booking}}` |
| `GET /api/wall-bookings` | customer or studio | none | `200 {data:[booking]}` |
| `GET /api/wall-bookings/:id` | customer owner or studio | none | `200 {data:{booking}}` |
| `POST /api/wall-bookings/:id/confirm` | studio | no body | `200 {data:{booking}}` |
| `POST /api/wall-bookings/:id/decline` | studio | no body | `200 {data:{booking}}` |
| `POST /api/wall-bookings/:id/cancel` | customer owner | no body | `200 {data:{booking}}` |

All routes require authentication. Missing authentication is `401 AUTH_REQUIRED`;
the wrong role is `403 ROLE_FORBIDDEN`. Customer lists contain only records owned by
the session user. Customer detail/cancel access to a missing or another customer's
record is `404 WALL_BOOKING_NOT_FOUND`. The studio can list and inspect all bookings.
List ordering is `serviceDate ASC, id ASC` so results are stable.

## Input validation

Validation uses the current calendar date in `Asia/Kolkata`, not the server's local
timezone and not a rolling 24-hour duration.

- `serviceDate` must be a real, zero-padded `YYYY-MM-DD` calendar date. It must be in
  the inclusive range `today + 7` through `today + 90`. Invalid/out-of-range values
  return `422 INVALID_SERVICE_DATE` with a `fields.serviceDate` message.
- `wallSizeSqFt` must be a JSON integer from 10 through 500 inclusive. Numeric strings,
  decimals, booleans, and non-finite values are rejected with
  `422 INVALID_WALL_SIZE` and `fields.wallSizeSqFt`.
- `address` must be a string that is non-empty after trimming. Proposed storage/API
  maximum is 500 Unicode characters; an absent, empty, or longer value returns
  `422 INVALID_ADDRESS` and `fields.address`. The normalized stored value is trimmed.
- Unknown request fields should be ignored consistently with the painting endpoints;
  security-sensitive values are always derived server-side.

The window calculation must parse and compare date-only values without converting the
requested date through UTC. Tests should inject/freeze the current instant and derive
the Kolkata date, including around `18:30 UTC`, when the Kolkata calendar day changes.

## Status machine

Statuses are exactly `requested | confirmed | declined | cancelled`.

```text
requested --studio confirm--> confirmed
requested --studio decline--> declined
requested --owner cancel----> cancelled
confirmed --owner cancel----> cancelled
```

No other transition is permitted. Confirm and decline require the current status to
be `requested`; otherwise return `409 WALL_BOOKING_NOT_DECIDABLE`. Cancellation
requires `requested` or `confirmed` and must also satisfy the cutoff; a terminal
status returns `409 WALL_BOOKING_NOT_CANCELLABLE`.

Cancellation is allowed through service date minus three calendar days. Equivalently,
at the time of cancellation `serviceDate >= KolkataToday + 3`, inclusive. A booking
for `today + 3` can be cancelled; one for `today + 2` cannot and returns
`409 CANCELLATION_CUTOFF_PASSED`. This rule applies equally to requested and confirmed
bookings.

Declined and cancelled records remain in history; they do not reserve their dates.
There is no delete endpoint.

## Availability, transactions, and conflicts

Creating, confirming, declining, and cancelling use explicit immediate write
transactions. A date is reserved while a booking is `requested` or `confirmed`.
The database partial unique index is the final concurrency guard:

```sql
CREATE UNIQUE INDEX wall_bookings_one_active_per_date
ON wall_bookings(service_date)
WHERE status IN ('requested', 'confirmed');
```

Creation reads the official rate within the write transaction, calculates the price,
inserts the `requested` record, and commits. A partial-index uniqueness failure maps
to `409 DATE_UNAVAILABLE`, never a raw SQLite error. Two competing creates for one
date must yield exactly one `201` and one `409`, leaving exactly one active booking.

Confirm/decline use conditional updates (`... WHERE id = ? AND status = 'requested'`)
inside a transaction. Cancel first scopes by the authenticated customer and uses a
conditional update from an eligible state. A zero-row conditional update is followed
by a scoped read so the route can distinguish hidden/missing `404`, terminal-state
`409`, and cutoff `409`. This prevents two competing decisions from both succeeding.

## Migration proposal for Agent 1

The migration should add `wall_bookings` with:

- integer primary key;
- `customer_id` foreign key to `users(id)` with no client-controlled assignment;
- `service_date` as canonical `TEXT` date;
- integer `wall_size_sq_ft`, `rate_minor`, and `price_minor`;
- non-empty `address` text;
- checked status values;
- UTC `created_at`, `updated_at`, nullable `cancelled_at`, and nullable `decided_at`;
- checks for wall size `10..500`, positive rate, non-negative price, and
  `price_minor = wall_size_sq_ft * rate_minor`;
- the active-date partial unique index above;
- indexes supporting customer history and studio date/status listing.

The controlled seed design also needs one authoritative wall-rate record/value with a
clear lookup contract. Preferred proposal: a singleton `studio_settings` row or a
versioned `wall_rates` row seeded from `seedData.zip`; booking rows snapshot the chosen
positive `rate_minor`. Agent 1 should select and publish the lookup before route work.

## Error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | No authenticated session |
| 403 | `ROLE_FORBIDDEN` | Authenticated role cannot perform the action |
| 404 | `WALL_BOOKING_NOT_FOUND` | Missing or ownership-hidden record |
| 409 | `DATE_UNAVAILABLE` | Date already reserved by an active booking |
| 409 | `WALL_BOOKING_NOT_DECIDABLE` | Confirm/decline attempted outside `requested` |
| 409 | `WALL_BOOKING_NOT_CANCELLABLE` | Cancellation attempted from a terminal status |
| 409 | `CANCELLATION_CUTOFF_PASSED` | Eligible status, but fewer than three calendar days remain |
| 422 | `INVALID_SERVICE_DATE` | Malformed or outside inclusive date window |
| 422 | `INVALID_WALL_SIZE` | Not an integer in the inclusive range |
| 422 | `INVALID_ADDRESS` | Missing, blank, or beyond the agreed maximum |
| 503 | `WALL_BOOKING_UNAVAILABLE` | Optional defensive response if official rate configuration is absent |

Normal deployment should not mount/enable the feature until the official rate exists;
the `503` is only a defensive guard against configuration drift.

## Required verification before enablement

- Dates exactly `today + 7` and `today + 90` succeed; `+6` and `+91` fail.
- Sizes exactly 10 and 500 succeed; 9, 501, decimals, and numeric strings fail.
- Price is calculated only from the seeded rate and remains unchanged if a future rate
  changes.
- Competing requests for one date result in one success and one `DATE_UNAVAILABLE`.
- Decline and cancellation release the date for a later customer request.
- Confirm versus decline contention yields one transition only.
- Cancellation succeeds at `today + 3` and fails at `today + 2`.
- Unauthenticated, wrong-role, and cross-customer access return 401, 403, and hidden
  404 respectively.
- Customer and studio lists are role-scoped, persistent after process restart, and
  contain preserved terminal-state history.

No verification above has been run yet because the feature, schema, and official rate
are intentionally absent.
