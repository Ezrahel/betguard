# BetGuard / BetSafe — Project Status Report

**Generated**: 2026-07-05
**Project**: Responsible Gambling Wallet (Nomba Hackathon 2026)
**Team**: Ezrahel (Solo — Adelakin Israel)
**Version**: 1.0.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Inventory & Status](#2-file-inventory--status)
3. [Architecture](#3-architecture)
4. [Database Schema (Supabase PostgreSQL)](#4-database-schema-supabase-postgresql)
5. [API Surface — All Endpoints](#5-api-surface--all-endpoints)
6. [Dependencies & Versions](#6-dependencies--versions)
7. [External Integrations](#7-external-integrations)
8. [Cron Jobs](#8-cron-jobs)
9. [Security Model](#9-security-model)
10. [Known Issues & Observations](#10-known-issues--observations)
11. [Deployment Configuration](#11-deployment-configuration)
12. [What Works / What Doesn't](#12-what-works--what-doesnt)

---

## 1. Project Overview

BetGuard (also branded BetSafe) is a **responsible gambling wallet** that sits between a user's bank account and betting platforms (Bet9ja, SportyBet, 1xBet). It uses Nomba's banking APIs to create ring-fenced virtual accounts and NIBSS Direct Debit mandates. The key innovation: **the money never lives in the betting platform**. A "spending gate" physically blocks any bet exceeding the user's weekly budget — no override possible.

**Core flow**: Onboard → Create virtual account + mandate → Weekly auto-topup (cron) → Gated bet placement (4 gates) → Real-time SSE updates.

---

## 2. File Inventory & Status

### 2.1 Root Configuration Files

| File | Status | Purpose |
|------|--------|---------|
| `package.json` | ✅ Complete | Project manifest, scripts, dependencies |
| `package-lock.json` | ✅ Present | Lock file (53KB) |
| `.env` | ✅ Present | Live credentials (not tracked in git) |
| `.env.example` | ✅ Complete | Template with empty fields |
| `.gitignore` | ✅ Complete | Ignores: node_modules, .env, data/db.json, *.zip |
| `Procfile` | ✅ Complete | Render process config: `web: node src/server.js` |
| `railway.json` | ✅ Complete | Nixpacks deploy config with health check |
| `README.md` | ✅ Complete | 290-line documentation covering everything |
| `PROJECT_STATUS.md` | ✅ This file | — |

### 2.2 Source Code — Entry Point

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/server.js` | 212 | ✅ Complete | Express server entry. Mounts all routes, starts cron jobs, sets up keep-alive. Auth routes (signup/signin/me) defined inline. Serves SPA as catch-all. |

### 2.3 Source Code — Routes

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/routes/onboard.js` | 155 | ✅ Complete | User onboarding: creates Nomba virtual account + mandate. Gracefully handles Nomba failures (logs but continues to create local records). |
| `src/routes/bet.js` | 105 | ✅ Complete | Gated bet placement. Lists providers, verifies accounts, vends bets through spendingGate middleware. Records success/failure transactions. |
| `src/routes/wallet.js` | 139 | ✅ Complete | Wallet operations: state, history, budget updates, cooldown settings, insights. Supports `:userId` = "me" shorthand. |
| `src/routes/webhooks.js` | 73 | ✅ Complete | Nomba webhook receiver. Handles payment.success/transaction.credit (top-up) and payment.failed/transaction.debit.failed. Responds 200 immediately, processes async. |
| `src/routes/events.js` | 90 | ✅ Complete | SSE real-time stream. Verifies token via query param (for EventSource API) or Authorization header. Heartbeat every 30s. Returns 401 on invalid token. |

### 2.4 Source Code — Middleware

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/middleware/auth.js` | 57 | ✅ Complete | JWT verification via Supabase `auth.getUser()`. Caches anon client. Sets `req.userId` and `req.userEmail`. |
| `src/middleware/spendingGate.js` | 132 | ✅ Complete | 4-gate enforcement: (1) Mandate must be ACTIVE+ADVICE_SENT, (2) Budget check, (3) Cooldown check, (4) 80% warning. Records BLOCKED transactions and emits SSE events. |

### 2.5 Source Code — Services

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/services/nomba.js` | 264 | ✅ Complete | Full Nomba API client with auth token management (55-min cache). `safeGet()` handles inconsistent response shapes (double-wrapped data, arrays, flat). Covers auth, virtual accounts, direct debits, and betting APIs. |
| `src/services/insights.js` | 109 | ✅ Complete | Weekly analytics engine: daily spend (Mon-Sun), peak betting hour, average bet size, blocked attempts, streak weeks, risk score (LOW/MEDIUM/HIGH). |
| `src/services/supabase.js` | 29 | ✅ Complete | Singleton Supabase admin client using SERVICE_ROLE_KEY. Server-to-server only (bypasses RLS). |

### 2.6 Source Code — Models

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/models/db.js` | 372 | ✅ Complete | Full data access layer for 4 tables (users, wallets, mandates, transactions). Maps snake_case (Supabase) to camelCase (JS). Includes `getUserCount()`, `daysUntilNextMonday()`, `mondayOfThisWeek()` helpers. |

### 2.7 Source Code — Jobs

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/jobs/weeklyCycle.js` | 73 | ✅ Complete | Weekly auto-topup cron: Sunday 23:05 UTC (Monday 00:05 WAT). Iterates users with ACTIVE+ADVICE_SENT mandates, calls `debitMandate()`, resets `weeklySpent` to 0. Also exports `runCycleNow(userId)` for demo manual trigger. |
| `src/jobs/mandatePoller.js` | 46 | ✅ Complete | Polls Nomba every 15 min for pending mandate status updates. Logs newly activated mandates. |

### 2.8 Source Code — Scripts

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `src/scripts/verify.js` | 254 | ✅ Complete | Standalone sandbox verification script. Tests all Nomba endpoints (auth, virtual accounts, balance, providers, vend, mandate). Handles expected 404/422 gracefully. Run with `node src/scripts/verify.js`. |
| `src/seed.js` | — | ❌ **MISSING** | Referenced in `package.json` as `"seed": "node src/seed.js"` but does not exist in the codebase. |

### 2.9 Frontend

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `public/index.html` | 1,057 | ✅ Complete | Full SPA: glassmorphism UI with Tailwind CSS + Chart.js. Features auth overlay (sign-in/sign-up), onboarding form, bet placement, transaction history with spending chart, demo flow for judges, SSE real-time updates with toast notifications, cooldown timer with SVG ring animation. |

### 2.10 Database

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `supabase/schema.sql` | 122 | ✅ Complete | PostgreSQL schema: 4 tables with constraints, indexes, auto-profile trigger on auth signup, full RLS policies on all tables. |

### 2.11 Support & Config

| File | Status | Purpose |
|------|--------|---------|
| `scripts/keep-alive.sh` | ✅ Complete | Bash script pinging `/api/health` every 10 min for Render free-tier spin-down prevention. |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   CLIENT (Browser)                           │
│  public/index.html                                           │
│  - Glassmorphism SPA (Tailwind + Chart.js)                   │
│  - Supabase Auth (email/password)                            │
│  - SSE real-time updates via EventSource                    │
└─────────────────────┬────────────────────────────────────────┘
                      │ HTTP + JWT Bearer Auth
                      ▼
┌──────────────────────────────────────────────────────────────┐
│              SERVER (Node.js + Express)                      │
│  src/server.js — Port 3000                                   │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ Routes Layer │ Middleware   │ Service Layer│ Jobs (Cron)     │
├──────────────┼──────────────┼──────────────┼─────────────────┤
│ onboard.js   │ auth.js      │ nomba.js     │ weeklyCycle.js  │
│ bet.js       │ spendingGate │ insights.js  │ mandatePoller.js│
│ wallet.js    │              │ supabase.js  │ keep-alive      │
│ webhooks.js  │              │              │                 │
│ events.js    │              │              │                 │
└──────────────┴──────────────┴──────────────┴─────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     ┌────────┐  ┌─────────┐  ┌───────┐
     │Supabase│  │  Nomba  │  │ Self  │
     │(Postgr)│  │ (Bank)  │  │Ping   │
     └────────┘  └─────────┘  └───────┘
```

**Key architectural decisions**:
- **Single process**: Web server + cron jobs run in the same Node.js process
- **SSE in-memory Map**: Not scalable across multiple instances (fine for hackathon)
- **Supabase service_role_key**: Server-side only; no direct client DB access
- **Nomba API client**: Cached auth tokens with 55-min expiry

---

## 4. Database Schema (Supabase PostgreSQL)

4 tables, all with RLS:

### `public.users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | References `auth.users(id)` ON DELETE CASCADE |
| `full_name` | TEXT | Not null, default '' |
| `phone` | TEXT | Default '' |
| `email` | TEXT | Default '' |
| `weekly_budget` | NUMERIC | Default 5000 |
| `cooldown_minutes` | INTEGER | Default 0 |
| `streak_weeks` | INTEGER | Default 0 |
| `created_at` | TIMESTAMPTZ | Default NOW() |

### `public.wallets`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | gen_random_uuid() |
| `user_id` | UUID FK → users(id) | UNIQUE, ON DELETE CASCADE |
| `nomba_account_ref` | TEXT | Default '' |
| `nomba_bank_account_number` | TEXT | Default '' |
| `weekly_spent` | NUMERIC | Default 0 |
| `cycle_start_date` | TIMESTAMPTZ | Default NOW() |
| `total_bets` | INTEGER | Default 0 |
| `last_bet_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | Default NOW() |

### `public.mandates`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | gen_random_uuid() |
| `user_id` | UUID FK → users(id) | UNIQUE, ON DELETE CASCADE |
| `mandate_id` | TEXT | Default '' |
| `merchant_reference` | TEXT | Default '' |
| `description` | TEXT | Default '' |
| `status` | TEXT | Default 'PENDING' |
| `advice_status` | TEXT | Default 'ADVICE_NOT_SENT' |
| `created_at` | TIMESTAMPTZ | Default NOW() |

### `public.transactions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | gen_random_uuid() |
| `user_id` | UUID FK → users(id) | ON DELETE CASCADE |
| `type` | TEXT | Not null (BET_VEND, GATE_BLOCK, WALLET_TOPUP) |
| `amount` | NUMERIC | Default 0 |
| `provider` | TEXT | Default '' |
| `customer_id` | TEXT | Default '' |
| `status` | TEXT | Default 'SUCCESS' (SUCCESS, FAILED, BLOCKED) |
| `nomba_ref` | TEXT | Default '' |
| `created_at` | TIMESTAMPTZ | Default NOW() |

**Indexes**: `idx_transactions_user_id`, `idx_transactions_created_at`, `idx_wallets_user_id`, `idx_mandates_user_id`

**Auto-profile trigger**: `handle_new_user()` function inserts into `users` on auth.users INSERT.

**RLS**: All 4 tables have SELECT/INSERT/UPDATE policies scoped to `auth.uid()`.

---

## 5. API Surface — All Endpoints

| Method | Route | Auth | Source | Description |
|--------|-------|------|--------|-------------|
| POST | `/api/auth/signup` | ❌ | `server.js` (inline) | Create account with email/password. Returns session if auto-confirmed, else 201 with confirmation message. |
| POST | `/api/auth/signin` | ❌ | `server.js` (inline) | Sign in with email/password. Returns JWT access_token + refresh_token. |
| GET | `/api/auth/me` | ✅ JWT | `server.js` (inline) | Verify token, return user info + hasWallet + hasMandate flags. |
| POST | `/api/onboard` | ✅ JWT | `routes/onboard.js` | Full onboarding: create virtual account + mandate + wallet. |
| GET | `/api/onboard/mandate-status/:userId` | ✅ JWT | `routes/onboard.js` | Poll Nomba for mandate activation status. |
| GET | `/api/bet/providers` | ✅ JWT | `routes/bet.js` | List supported betting platforms from Nomba. |
| POST | `/api/bet/verify-account` | ✅ JWT | `routes/bet.js` | Verify betting account ID with Nomba. |
| POST | `/api/bet/place` | ✅ JWT | `routes/bet.js` | Gated bet placement (through spendingGate). |
| GET | `/api/wallet/:userId` | ✅ JWT | `routes/wallet.js` | Wallet state + live Nomba balance + cooldown info. |
| GET | `/api/wallet/:userId/history` | ✅ JWT | `routes/wallet.js` | Transaction history (newest first). |
| GET | `/api/wallet/:userId/insights` | ✅ JWT | `routes/wallet.js` | Spending insights + risk score. |
| PATCH | `/api/wallet/:userId/budget` | ✅ JWT | `routes/wallet.js` | Update weekly budget (min ₦500). |
| PATCH | `/api/wallet/:userId/cooldown` | ✅ JWT | `routes/wallet.js` | Set cooldown (0/10/30/60/120 min). |
| POST | `/api/admin/trigger-cycle` | ✅ JWT | `server.js` (inline) | Manual weekly cycle trigger (demo). |
| POST | `/api/webhooks/nomba` | ❌ | `routes/webhooks.js` | Nomba payment event receiver. |
| GET | `/api/events/:userId` | ✅ Token query | `routes/events.js` | SSE real-time stream. |
| GET | `/api/health` | ❌ | `server.js` (inline) | Health check + version + user count. |

---

## 6. Dependencies & Versions

### Production Dependencies

| Package | Version | Status | Purpose |
|---------|---------|--------|---------|
| `express` | ^4.18.2 | ✅ Latest | Web framework |
| `@supabase/supabase-js` | ^2.110.0 | ✅ Latest | Supabase client (auth + DB) |
| `axios` | ^1.6.0 | ✅ Latest | HTTP client for Nomba API |
| `dotenv` | ^16.3.1 | ✅ Latest | Environment variable loading |
| `node-cron` | ^3.0.3 | ✅ Latest | Cron job scheduling |

### Dev Dependencies

| Package | Version | Status | Purpose |
|---------|---------|--------|---------|
| `nodemon` | ^3.0.1 | ✅ Latest | Auto-restart during development |

### npm Scripts

| Script | Command | Status |
|--------|---------|--------|
| `start` | `node src/server.js` | ✅ Works |
| `dev` | `nodemon src/server.js` | ✅ Works |
| `seed` | `node src/seed.js` | ❌ **Broken** — `src/seed.js` doesn't exist |

---

## 7. External Integrations

### 7.1 Nomba APIs (Banking/Payments)

| API Endpoint | Used In | Status | Purpose |
|-------------|---------|--------|---------|
| `POST /v1/auth/token/issue` | `nomba.js` | ✅ Implemented | Get Bearer token (with `accountId` header) |
| `POST /v1/accounts/virtual` | `nomba.js` → `onboard.js` | ✅ Implemented | Create ring-fenced wallet per user |
| `GET /v1/accounts/virtual/:ref` | `nomba.js` → `wallet.js` | ✅ Implemented | Fetch live balance |
| `POST /v1/direct-debits` | `nomba.js` → `onboard.js` | ✅ Implemented | Create NIBSS Direct Debit mandate |
| `GET /v1/direct-debits/status` | `nomba.js` → `mandatePoller.js` | ✅ Implemented | Poll mandate activation |
| `POST /v1/direct-debits/debit-mandate` | `nomba.js` → `weeklyCycle.js` | ✅ Implemented | Weekly auto-topup |
| `GET /v1/bill/betting/providers` | `nomba.js` → `bet.js` | ✅ Implemented | List supported betting platforms |
| `GET /v1/bill/betting/customer-info` | `nomba.js` → `bet.js` | ✅ Implemented | Verify betting account |
| `POST /v1/bill/betting/vend` | `nomba.js` → `bet.js` | ✅ Implemented | Fund betting account |

**Note**: Direct Debit endpoints may return 404 in the Nomba sandbox (not enabled for all sandbox accounts). The verify script handles this gracefully.

### 7.2 Supabase

| Feature | Used In | Status | Purpose |
|---------|---------|--------|---------|
| Auth (email/password) | `server.js`, `auth.js`, `events.js` | ✅ Implemented | User authentication + JWT tokens |
| Database (PostgreSQL) | `db.js` via `supabase.js` | ✅ Implemented | All data persistence |
| RLS policies | `schema.sql` | ✅ Implemented | Row-level security on all 4 tables |
| Auto-profile trigger | `schema.sql` | ✅ Implemented | Auto-create user row on auth signup |

---

## 8. Cron Jobs

| Job | Schedule | Interval | File | Status |
|-----|----------|----------|------|--------|
| Weekly Auto-Topup | `5 23 * * 0` | Every Sunday 23:05 UTC (Monday 00:05 WAT) | `src/jobs/weeklyCycle.js` | ✅ Active |
| Mandate Status Poller | `*/15 * * * *` | Every 15 minutes | `src/jobs/mandatePoller.js` | ✅ Active |
| Keep-Alive Self-Ping | `*/10 * * * *` | Every 10 minutes | `src/server.js` (inline) | ✅ Active |

---

## 9. Security Model

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **Auth** | Supabase Auth (email/password) + JWT Bearer tokens | ✅ Complete |
| **Server DB** | SERVICE_ROLE_KEY (admin bypasses RLS) — safe because server is the only caller | ✅ Correct |
| **Client DB** | No direct client DB access — all operations through Express API | ✅ Correct |
| **Auth Middleware** | Verifies JWT on every protected endpoint, sets `req.userId` | ✅ Complete |
| **Ownership Checks** | Every wallet/history endpoint verifies `userId === req.userId` | ✅ Complete |
| **Spending Gate** | Server-side enforcement — 4 sequential checks, client cannot bypass | ✅ Complete |
| **Webhooks** | Public endpoint (no JWT), but WEBHOOK_SECRET can be verified | ⚠️ Webhook secret not actually verified in code |
| **CORS** | `Access-Control-Allow-Origin: *` | ⚠️ Permissive (acceptable for hackathon) |
| **SSE** | Token verified via both query param `?token=` and Authorization header | ✅ Complete |

---

## 10. Known Issues & Observations

### 🔴 Critical Issues

| # | Issue | File | Detail |
|---|-------|------|--------|
| 1 | **`seed` script missing** | `package.json` | `npm run seed` fails because `src/seed.js` doesn't exist. The script is referenced but was never created or was deleted. |

### 🟡 Moderate Issues

| # | Issue | File | Detail |
|---|-------|------|--------|
| 2 | **Webhook secret not verified** | `routes/webhooks.js` | `WEBHOOK_SECRET` is in `.env.example` but never actually used to verify incoming webhook signatures. Anybody can POST to `/api/webhooks/nomba`. |
| 3 | **No request validation library** | All routes | All validation is manual (inline checks). No Joi/Zod/express-validator. Prone to missing edge cases. |
| 4 | **No rate limiting** | All routes | No protection against brute-force or excessive requests. |
| 5 | **SSE in-memory state** | `routes/events.js` | Uses a `Map<userId, Set<Response>>` — won't scale across multiple server instances (fine for hackathon). |
| 6 | **`NOMBA_SUB_ACCOUNT_ID` unused** | `.env` | Set in environment but the code primarily uses `NOMBA_PARENT_ACCOUNT_ID` for API calls. May be intended for future use. |

### 🟢 Minor Observations

| # | Issue | File | Detail |
|---|-------|------|--------|
| 7 | **No tests** | — | Zero test files. No Jest, Vitest, or any test framework configured. Entirely untested codebase. |
| 8 | **`data/db.json` in gitignore** | `.gitignore` | Legacy reference — the project moved from file-based storage to Supabase but `data/db.json` is still in gitignore. |
| 9 | **No ESLint/Prettier config** | — | No code quality or formatting tools configured. |
| 10 | **Single process architecture** | `server.js` | Cron jobs and web server share the same process. If the server restarts, in-progress cron jobs are lost. Fine for hackathon. |
| 11 | **Comment quality** | Various | Many files have excellent inline documentation, but some are sparse. The `/me` endpoint comment is misleading ("verify token and return user info" — also checks wallet/mandate). |
| 12 | **README mentions `data/db.json`** | `README.md` | README's file structure still references `data/db.json` ("File-persisted data store") which is no longer accurate after the Supabase migration. |
| 13 | **Budget color thresholds hardcoded** | `public/index.html` (JS) | Chart colors use `5000 / 7` as a hardcoded daily share reference instead of using the user's actual budget. |

---

## 11. Deployment Configuration

| Platform | Config File | Start Command | Health Check |
|----------|------------|---------------|--------------|
| **Render** | `Procfile` | `node src/server.js` | Not configured (but `/api/health` exists) |
| **Railway** | `railway.json` | `node src/server.js` | `GET /api/health` (configured) |

**Environment Variables Required** (20 vars in `.env`):

```
NOMBA_PARENT_ACCOUNT_ID=     # Nomba account ID for API calls
NOMBA_SUB_ACCOUNT_ID=        # Sub-account (currently unused)
NOMBA_CLIENT_ID=             # OAuth client ID
NOMBA_PRIVATE_KEY=           # OAuth client secret
NOMBA_BASE_URL=              # https://sandbox.nomba.com (sandbox) or production URL
PORT=3000                    # Express listen port
APP_URL=                     # Public URL for keep-alive pings
WEBHOOK_SECRET=              # Webhook verification secret (not actually used in code)
SUPABASE_URL=                # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=   # Admin key for server DB operations
SUPABASE_ANON_KEY=           # Anon key for client-side auth verification
```

---

## 12. What Works / What Doesn't

### ✅ What Works

- **Authentication**: Signup, signin, JWT token management, token verification, session persistence in localStorage
- **Onboarding**: Virtual account creation, mandate creation, wallet record creation, SSE events
- **Bet Placement**: Provider listing, account verification, gated bet placement, spending gate enforcement
- **Wallet Operations**: Balance display, transaction history, budget updates, cooldown settings, insights
- **Real-time Updates**: SSE connections, event emission (bet:success, bet:blocked, wallet:topup, mandate:ready)
- **Cron Jobs**: Weekly cycle, mandate polling, keep-alive
- **Webhooks**: Receipt and processing of Nomba payment events
- **Frontend**: Full glassmorphism SPA with auth overlay, tab navigation, demo flow, toast notifications, cooldown timer, spending chart
- **Email Confirmation**: Full flow for handling Supabase email confirmation redirect with `#access_token=` parsing

### ❌ What Doesn't Work / Is Missing

- **`npm run seed`** — crashes because `src/seed.js` is missing
- **Webhook signature verification** — `WEBHOOK_SECRET` is configured but never used to verify incoming webhooks
- **No tests** — zero test coverage across the entire codebase
- **No CI/CD** — no GitHub Actions or similar pipeline configured
- **README outdated** — still references `data/db.json` file-based storage that was replaced with Supabase

### 📊 Code Statistics

| Category | Files | Lines of Code |
|----------|-------|---------------|
| Node.js (src/) | 12 | ~2,630 |
| HTML/CSS/JS (public/) | 1 | ~1,057 |
| SQL | 1 | ~122 |
| Shell | 1 | ~16 |
| JSON/YAML configs | 3 | ~35 |
| **Total** | **18 source files** | **~3,860** |

---

*End of project status report. Generated from full codebase analysis.*
