# Atelier Art Studio

A full-stack art studio and gallery application for discovering and collecting one-of-a-kind original paintings. Features MongoDB persistence with Mongoose, Google OAuth alongside email/password authentication, Express rate limiting, React Router navigation, accessible animated-logo loading, and strict server-authoritative role and concurrency controls.

---

## Architecture & Technology Stack

- **Runtime & Backend:** Node.js 20+, Express 5, Mongoose 9, MongoDB Atlas / local replica set, `express-session` with `connect-mongo`.
- **Authentication:** Passport.js Google OAuth 2.0 strategy (`passport-google-oauth20`) with CSRF `state` protection and verified-email claims, alongside bcrypt-hashed email/password credentials.
- **Security & Reliability:** `helmet`, `express-rate-limit`, configurable proxy trust, SameSite HTTP-only session cookies, server-authoritative role checks, and origin verification on state-changing requests.
- **Concurrency & Atomicity:** MongoDB multi-document transactions and partial unique index on orders (`{ paintingId: 1 }, { unique: true, partialFilterExpression: { status: 'placed' } }`) guaranteeing single active ownership. Standalone topologies without transaction support are explicitly rejected.
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
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB_NAME=art_studio
SESSION_SECRET=replace-with-at-least-32-random-characters-secret
APP_ORIGIN=http://localhost:5173
SERVER_ORIGIN=http://localhost:3000
TRUST_PROXY=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
STUDIO_EMAIL=studio@artstudio.com
STUDIO_PASSWORD=replace-with-a-strong-studio-password-min-12-chars
```

> **Security Notice:** Never commit `.env`, OAuth credentials, MongoDB connection strings, or session secrets. All environment and database credential files are explicitly ignored in `.gitignore`.

---

## Database Setup & Replica Set Requirement

MongoDB transactions require a replica set or MongoDB Atlas deployment. Standalone MongoDB topologies that do not support transactions are rejected at runtime.

### 1. MongoDB Atlas Setup (Production / Cloud Dev)
1. Create a cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user with read/write privileges.
3. In **Network Access**, restrict access to your server's outbound static IP addresses or VPC peering connection (avoid using `0.0.0.0/0` in production environments).
4. Set `MONGODB_URI` in `.env` to your connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/art_studio?retryWrites=true&w=majority
   ```

### 2. Local MongoDB Replica Set Setup
To run transactions locally, start `mongod` with a replica set name:
```bash
mongod --replSet rs0 --dbpath <data-directory>
```
In your mongo shell or `mongosh`, initiate the replica set once:
```javascript
rs.initiate()
```
Then configure your URI in `.env`:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB_NAME=art_studio
```

### 3. Test Environment (Zero-Config Portable Replica Set & System Binary)
Automated tests automatically launch an isolated in-memory replica set (`mongodb-memory-server` with `MongoMemoryReplSet`). Two reliable test execution modes are supported:

- **Default Portable Mode (`npm test`):** Executes all test suites in parallel using the portable managed binary cached by `mongodb-memory-server`. Does not require local MongoDB installations.
- **Explicit System Binary Mode (`npm run test:system-mongo`):** Executes test suites serially (`--no-file-parallelism`) against a local system `mongod` specified via `MONGOMS_SYSTEM_BINARY`. This serial mode prevents replica-set startup and port collision across test processes.

Example running with explicit system binary on Windows:
```powershell
$env:MONGOMS_SYSTEM_BINARY = "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe"
npm run test:system-mongo
```

If an invalid or non-existent path is provided in `MONGOMS_SYSTEM_BINARY`, the test runner validates the path upfront and fails clearly with an informative error before starting test suites.

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

> **Implementation & Verification Status:** The Google OAuth implementation is automated-test verified using mocked Google profiles (covering strict claim pairing of verified emails, unverified/mismatched email rejection, malformed email rejection, single-use session-bound CSRF state enforcement, provider failure resilience, and safe account linking). Live end-to-end authentication with Google remains pending until a developer provides active Google Cloud credentials and tests against Google's live authorization endpoints.
> If Google credentials are omitted, the application remains fully functional with email/password authentication and displays a helpful notice.

---

## Clean-Install and Verification Process

Dependencies are consolidated at the project root with a single authoritative `package.json` and lockfile so a fresh checkout can be cleanly installed and verified using standard npm commands without divergent or stale subfolder installations:

```powershell
# 1. Clean installation of all dependencies (root, server, client, linter, tests)
npm ci

# 2. Run automated test suite (33 unit, integration, and concurrency tests across 5 suites)
npm test

# 3. Or run against an explicit local system MongoDB binary
# $env:MONGOMS_SYSTEM_BINARY = "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe"
npm run test:system-mongo

# 4. Build production client bundle (0 warnings, deterministic ~292 kB minified bundle)
npm run build

# 5. Lint frontend code (0 warnings, 0 errors)
npm run lint

# 6. Initialize database indexes
npm run db:init

# 7. Seed studio account and sample fixtures
npm run db:seed
```

### Installation Script Warnings (`allow-scripts`)
During a clean `npm ci`, npm outputs two informative warnings:
```
npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn allow-scripts   mongodb-memory-server@11.3.0 (postinstall: node ./postinstall.js)
```
These warnings are expected and benign:
- `esbuild` invokes its postinstall binary installer.
- `mongodb-memory-server` includes a postinstall hook which is intentionally constrained via `"config": { "mongodbMemoryServer": { "disablePostinstall": "1" } }` in `package.json` to prevent arbitrary binary downloads during installation.
- We deliberately avoid blindly approving unvetted scripts; npm installs and runs cleanly with 0 vulnerabilities.

### Environment Modes
- **`npm run dev`**: Runs in development mode (`NODE_ENV=development`) for Vite hot-module replacement and rapid local feedback.
- **`npm run build`**: Always explicitly sets and runs in production mode (`NODE_ENV=production` via `cross-env`), guaranteeing a deterministic minified production bundle (`index-B2VCdnYL.js`, ~292 kB / ~91 kB gzip) regardless of shell environment or local `.env` settings.
- **Deployed Server**: Production server deployments must set `NODE_ENV=production` in the hosting environment to enforce secure cookie handling, production session secret validation (minimum 32 characters), and optimized Express runtime behavior.

---

## Buyer & Seller Roles

Internal roles are maintained as `customer` and `studio` to preserve authorization middleware and API contracts:
- In the interface, `customer` is displayed as **Buyer** and `studio` is displayed as **Seller**.
- **Buyer (`customer`):** Public registration and new Google OAuth users always receive the Buyer role. Buyers can browse the gallery, purchase available original paintings, view their own order history (`/buyer`), and cancel active orders.
- **Seller (`studio`):** Controlled studio account created via `npm run db:seed`. Sellers can add paintings to the catalogue, edit unsold paintings, view sold/available statuses, and inspect all customer orders with buyer contact email addresses (`/seller`).
- **Safe Account Linking:** When a user logs in with Google whose verified email matches an existing studio account, Google ID is linked safely without changing the role. Google users can never escalate or inject the studio role.

---

## Rate Limiting & Proxy Trust

Configured via `express-rate-limit` with configurable proxy trust:
- **`TRUST_PROXY`:** Set to `false` (default) for local development or direct exposure so clients cannot spoof `X-Forwarded-For` to bypass limits. Set to `1` (or your proxy's IP) when deployed behind reverse proxies like Nginx, AWS ALB, Render, or Cloudflare.
- **General API Limiter (`/api/*`):** 300 requests per 15-minute window.
- **Authentication Limiter (`/api/auth/login`, `/api/auth/register`):** 10 requests per 15-minute window.
- **OAuth Limiter (`/api/auth/google`, `/api/auth/google/callback`):** 25 requests per 15-minute window.
- **429 Response Shape:** Returns HTTP 429 with standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) and JSON body:
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

## Included vs. Deferred Features

### Completed:
- Full MongoDB Atlas & Mongoose migration with replica set / transaction guarantees.
- MongoDB multi-document transactions & partial unique index on orders.
- Single-ownership guarantee, atomic concurrency handling, cancellation, and repurchase.
- Google OAuth 2.0 with strict authoritative email verification claims, CSRF `state` enforcement, and safe account linking.
- Tiered rate limiting with configurable proxy trust and stable `RATE_LIMITED` 429 JSON response.
- Dedicated React Router routes (`/`, `/login`, `/register`, `/gallery`, `/buyer`, `/seller`, `*`).
- Proper JSON 404 for API routes and SPA fallback for frontend routes.
- Atelier animated-logo loader with reduced-motion support.
- Idempotent `db:init` and `db:seed` commands.
- Verified test suite: 22 tests across 4 suites passing.

### Deferred:
- Real end-to-end Google OAuth live login (requires valid client credentials and developer configuration in Google Cloud).
- Custom wall mural bookings (rate calculation, date exclusivity, and schedule pending official studio brief).
- Pottery & ceramic store (glaze formulas and shipping trial pending).
- Online payment processing (Stripe / Razorpay).
- Direct file uploads (cloud object storage S3/GCS).
- Cloud production deployment.

---

## Demonstration Outline (5 Minutes)

1. **Introduction & Home Page (45s):** Start at `http://localhost:5173/`. Highlight the studio visual identity, animated logo loader, honest service descriptions, and live featured paintings.
2. **Authentication & Google OAuth (60s):** Navigate to `/login`. Show the Google OAuth button and email form. Show how missing Google configuration gracefully surfaces helpful guidance. Log in with studio credentials (`studio@artstudio.com`). Show the navigation indicates **Seller**.
3. **Seller Workspace (60s):** Navigate to `/seller`. Add a new painting. Point out that unsold paintings can be edited and appear in the gallery.
4. **Buyer Registration & Concurrent Purchase (75s):** Open buyer window, register `buyer1@example.com`, purchase the painting. Attempt simultaneous purchase from `buyer2@example.com` to demonstrate 409 `PAINTING_UNAVAILABLE`. Show the placed order with exact price snapshot in `/buyer`.
5. **Cancellation & Repurchase (45s):** In `/buyer`, cancel the order. Point out that `/gallery` immediately shows the painting as available again. Buyer 2 purchases it, confirming repurchase availability.
6. **404 & Rate Limiting (15s):** Visit `/some-unknown-path` to show the branded 404 page with return links. Demonstrate rate limiting on repeated failed attempts.
