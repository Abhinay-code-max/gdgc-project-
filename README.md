# Atelier Art Studio

A full-stack art studio and gallery application for discovering and collecting one-of-a-kind original paintings. Features MongoDB persistence with Mongoose, Google OAuth alongside email/password authentication, Express rate limiting, React Router navigation, accessible animated-logo loading, and strict server-authoritative role and concurrency controls.

---

## Architecture & Technology Stack

- **Runtime & Backend:** Node.js 20+, Express 5, Mongoose 9, MongoDB Atlas / local MongoDB, `express-session` with `connect-mongo`.
- **Authentication:** Passport.js Google OAuth 2.0 strategy (`passport-google-oauth20`) alongside bcrypt-hashed email/password credentials.
- **Security & Reliability:** `helmet`, `express-rate-limit`, SameSite HTTP-only session cookies, server-authoritative role checks, and origin verification on state-changing requests.
- **Concurrency & Atomicity:** MongoDB multi-document transactions and partial unique index on orders (`{ paintingId: 1 }, { unique: true, partialFilterExpression: { status: 'placed' } }`) guaranteeing single active ownership.
- **Frontend:** React 19, Vite 7, React Router 7 (`react-router-dom`), custom accessible animated-logo loader, responsive DM Sans / Playfair Display styling.

---

## Why MongoDB Was Chosen

1. **Transactional Integrity & Concurrency:** MongoDB 4.0+ multi-document transactions combined with partial unique indexes provide strict atomicity. Even under competing simultaneous purchase requests, exactly one buyer succeeds (HTTP 201) and competing attempts receive HTTP 409 `PAINTING_UNAVAILABLE`.
2. **Derived Availability Model:** Art Studio treats availability as derived from the presence of an active `placed` order rather than an easily desynchronized boolean column. Cancelling an order instantly releases the painting for repurchase without schema locking.
3. **Flexible User Profiles:** Supports local password credentials and Google OAuth identifiers, provider metadata, and profile avatars within a unified, strictly indexed User model.
4. **Atlas Production Readiness:** High availability, automated backups, and scalable clustering on MongoDB Atlas without reliance on local SQLite file-locking.

---

## Environment Variables

Copy `.env.example` to `.env` and configure the values:

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=art_studio
SESSION_SECRET=replace-with-at-least-32-random-characters-secret
APP_ORIGIN=http://localhost:5173
SERVER_ORIGIN=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
STUDIO_EMAIL=studio@artstudio.com
STUDIO_PASSWORD=replace-with-a-strong-studio-password-min-12-chars
```

> **Security Notice:** Never commit `.env`, OAuth credentials, MongoDB connection strings, or session secrets. All environment and database credential files are explicitly ignored in `.gitignore`.

---

## Database Setup

### 1. MongoDB Atlas Setup (Production / Cloud Dev)
1. Create a cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user with read/write privileges.
3. Whitelist your IP address in Network Access (or `0.0.0.0/0` for production hosting).
4. Set `MONGODB_URI` in `.env` to your connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/art_studio?retryWrites=true&w=majority
   ```

### 2. Local MongoDB Setup
Ensure a MongoDB instance is running locally on port 27017:
```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=art_studio
```

### 3. Test Environment (No Atlas Dependency)
Automated tests execute against an isolated in-memory replica set (`mongodb-memory-server` with `MongoMemoryReplSet`). This provides transaction support and partial unique index validation locally and in CI without consuming Atlas resources or requiring manual setup.

---

## Google Cloud OAuth 2.0 Configuration

1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services > Credentials**.
3. Create an **OAuth 2.0 Client ID** with Application type **Web application**.
4. Set **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://localhost:3000`
5. Set **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/google/callback`
   - *(Note: When deploying to production later, add the production callback URL, e.g. `https://your-domain.com/api/auth/google/callback`)*
6. Copy the generated Client ID and Client Secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

> **Graceful Degradation:** If Google credentials are not provided in `.env`, the application remains fully functional with email/password authentication. The "Continue with Google" button displays a clear configuration message rather than crashing the server.

---

## Buyer & Seller Roles

Internal roles are maintained as `customer` and `studio` to prevent breaking authorization middleware and API contracts:
- In the interface, `customer` is displayed as **Buyer** and `studio` is displayed as **Seller**.
- **Buyer (`customer`):** Public registration and new Google OAuth users always receive the Buyer role. Buyers can browse the gallery, purchase available original paintings, view their own order history (`/buyer`), and cancel active orders.
- **Seller (`studio`):** Controlled studio account created via `npm run db:seed`. Sellers can add paintings to the catalogue, edit unsold paintings, view sold/available statuses, and inspect all customer orders with buyer contact email addresses (`/seller`).
- **Safe Account Linking:** When a user logs in with Google whose verified email matches an existing studio account, Google ID is linked safely without changing the role. Google users can never escalate or inject the studio role.

---

## Rate Limiting Behavior

Configured via `express-rate-limit` with proxy trust (`app.set('trust proxy', 1)`):
- **General API Limiter:** Protects `/api/*` against excessive traffic (300 requests / 15 min).
- **Authentication Limiter:** Stricter limit on `/api/auth/login` and `/api/auth/register` (10 requests / 15 min).
- **OAuth Limiter:** Protects `/api/auth/google` initiation and callback routes (25 requests / 15 min).
- **429 Response Shape:** Returns HTTP 429 with standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) and standard error body:
  ```json
  {
    "error": {
      "code": "RATE_LIMITED",
      "message": "Too many requests. Please try again later."
    }
  }
  ```

---

## Routed Pages & Loading Experience

Client routing is managed with React Router:
- `/` — Public home page with studio introduction, calls to browse/sign-in, featured paintings from the API, and transparent service status.
- `/login` — Dedicated login page with email/password form, "Continue with Google" button, field validation, rate-limit messages, and OAuth error notices.
- `/register` — Dedicated collector registration page for Buyer accounts.
- `/gallery` — Public gallery of original paintings with live availability badges.
- `/buyer` — Protected Buyer dashboard displaying order history and cancellation actions.
- `/seller` — Protected Seller dashboard for adding/editing paintings and viewing all orders with buyer details.
- `*` — Branded 404 page with helpful navigation back to Home and Gallery (no auto-redirect).

### Animated Logo Loader
- Uses the Atelier visual identity (monogram easel canvas frame, serif 'A', and palette stroke).
- Accessible with `role="status"` and live region.
- Fully honors `@media (prefers-reduced-motion: reduce)`.
- Never permanently blocks rendering if an API request fails.

---

## Useful Commands

```powershell
# 1. Initialize MongoDB collections and build indexes
npm run db:init

# 2. Seed controlled studio account and sample paintings
npm run db:seed

# 3. Run full test suite (16 tests across 4 suites)
npm test

# 4. Lint frontend client (oxlint, 0 errors, 0 warnings)
npm --prefix client run lint

# 5. Build production client bundle (Vite)
npm run build

# 6. Start development server (API + Vite dev server)
npm run dev

# 7. Start production API server
npm start
```

---

## Included vs. Deferred Features

### Completed:
- Full MongoDB Atlas & Mongoose migration.
- MongoDB multi-document transactions & partial unique index on orders.
- Single-ownership guarantee, atomic concurrency handling, cancellation, and repurchase.
- Google OAuth 2.0 with verified email checking and safe account linking.
- Tiered rate limiting with stable `RATE_LIMITED` 429 JSON response.
- Dedicated React Router routes (`/`, `/login`, `/register`, `/gallery`, `/buyer`, `/seller`, `*`).
- Proper JSON 404 for API routes and SPA fallback for frontend routes.
- Atelier animated-logo loader with reduced-motion support.
- Idempotent `db:init` and `db:seed` commands.
- 100% passing test coverage (16 tests).

### Deferred:
- Custom wall mural bookings (rate calculation, date exclusivity, and schedule pending official studio brief).
- Pottery & ceramic store (glaze formulas and shipping trial pending).
- Online payment processing (Stripe / Razorpay).
- Direct file uploads (cloud object storage S3/GCS).
- Cloud production deployment.

---

## Demonstration Outline (5 Minutes)

1. **Introduction & Home Page (45s):** Start at `http://localhost:5173/`. Highlight the studio visual identity, animated logo loader, honest service descriptions, and live featured paintings.
2. **Authentication & Google OAuth (60s):** Navigate to `/login`. Show the Google button (demonstrating graceful notice if credentials are unset or initiating Google OAuth flow). Log in as Seller (`studio@artstudio.com`). Show that the interface identifies the account as **Seller**.
3. **Seller Painting Management (60s):** Navigate to `/seller`. Add a new painting ("Sunlit Terracotta", 95,000 paise). Verify it appears in the catalogue and public gallery.
4. **Buyer Registration & Concurrent Purchase (75s):** Log out and register a new Buyer (`collector1@example.com`). Purchase "Sunlit Terracotta". Show placed order in `/buyer`. Show concurrency: attempt purchase as a second buyer to demonstrate HTTP 409 `PAINTING_UNAVAILABLE`.
5. **Cancellation & Repurchase (45s):** As Buyer 1, cancel the order from `/buyer`. Show that the painting immediately returns to available in `/gallery`. As Buyer 2, purchase the released painting. Show that price snapshots and order history are completely preserved.
6. **404 & Rate Limiting (15s):** Enter an unknown route (e.g. `/unknown-path`) to show the branded 404 page. Hit `/api/unknown` to show JSON 404.
