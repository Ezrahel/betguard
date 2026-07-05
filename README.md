# 🛡️ BetSafe — Responsible Gambling Wallet

> Built on Nomba APIs for the Nomba Hackathon 2026  
> *"Gamble what you plan to, not all that you have."*

---

## The Problem

Betting platforms want you to deposit more. You want to set a limit and stick to it. These two incentives are in direct conflict. Traditional budgets (spreadsheets, mental notes, "I'll stop after this one") fail because **the betting platform always has your money**.

BetSafe flips the model: **the money never sits in your betting account**. It lives in a ring-fenced Nomba virtual wallet that releases only what your weekly budget allows — and physically cannot dispense more.

---

## How It Works (The Full Flow)

```
┌──────────────────────────────────────────────────────────────────┐
│                        1. ONBOARD                                │
│                                                                  │
│  User fills in name, phone, bank account, weekly budget          │
│       │                                                          │
│       ▼                                                          │
│  POST /api/onboard                                               │
│       │                                                          │
│       ├──→ Nomba: Create Virtual Account (ring-fenced wallet)    │
│       │      Returns: unique NUBAN account number                │
│       │                                                          │
│       └──→ Nomba: Create Direct Debit Mandate (via NIBSS)        │
│              User authorises their bank to let BetSafe pull     │
│              funds weekly (cost: ₦50 one-time NIBSS token)       │
│                                                                  │
│  Result: User now has a wallet + an active mandate               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   2. MANDATE ACTIVATION                          │
│                                                                  │
│  Mandate is PENDING until user pays the ₦50 NIBSS token fee      │
│  to the account number shown in the activation instructions.     │
│                                                                  │
│  Once paid, Nomba confirms → status becomes ACTIVE + ADVICE_SENT │
│                                                                  │
│  BetGuard polls every 15 minutes via mandatePoller.js:           │
│  GET /v1/direct-debits/status → updates db → emits SSE event    │
│  User sees green dot in the UI. Wallet is ready.                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│             3. WEEKLY AUTO-TOPUP (Every Monday 00:05 WAT)        │
│                                                                  │
│  Cron job runs weeklyCycle.js:                                   │
│       │                                                          │
│       ├──→ For every user with an ACTIVE mandate:                │
│       │     POST /v1/direct-debits/debit-mandate                 │
│       │     → Pulls user.weeklyBudget from their bank            │
│       │     → Credits it to their Nomba virtual wallet           │
│       │     → Resets weeklySpent to 0                            │
│       │                                                          │
│  The wallet now has this week's budget. No manual top-up needed. │
│  No way to add more until next Monday.                           │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│             4. PLACE A BET (The Spending Gate)                   │
│                                                                  │
│  User wants to bet ₦X via Bet9ja.                                │
│       │                                                          │
│       ▼                                                          │
│  POST /api/bet/place                                             │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────── spendingGate.js ──────────────────────┐    │
│  │                                                          │    │
│  │  GATE 1: Mandate Check                                   │    │
│  │  ├── Is mandate ACTIVE + ADVICE_SENT?                    │    │
│  │  └── NO → 403 "Mandate not active yet"                   │    │
│  │                                                          │    │
│  │  GATE 2: Budget Check                                    │    │
│  │  ├── weeklySpent + ₦X ≤ weeklyBudget?                    │    │
│  │  └── NO → 403 { blocked: true, reason: "BUDGET_EXHAUSTED"│    │
│  │             } + records GATE_BLOCK transaction            │    │
│  │                                                          │    │
│  │  GATE 3: Cooldown Check                                  │    │
│  │  ├── Is lastBetAt within cooldownMinutes?                │    │
│  │  └── YES → 403 { blocked: true, reason: "COOLDOWN_ACTIVE"│    │
│  │               minutesRemaining: X }                      │    │
│  │                                                          │    │
│  │  GATE 4: Warning (non-blocking)                          │    │
│  │  ├── Is weeklySpent ≥ 80% of budget?                     │    │
│  │  └── YES → attach warning to response (bet still allowed)│    │
│  │                                                          │    │
│  │  ALL GATES PASSED → req.spendContext set → next()        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  Nomba Betting API: POST /v1/bill/betting/vend                  │
│  → Funds leave virtual wallet → arrive in user's betting acct   │
│  → weeklySpent += ₦X, totalBets += 1, lastBetAt = now           │
│  → SSE event "bet:success" emitted to UI                        │
│                                                                  │
│  If Nomba call fails: transaction recorded as FAILED,            │
│  spend is NOT incremented (money never left).                    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│             5. REAL-TIME UPDATES (Server-Sent Events)            │
│                                                                  │
│  GET /api/events/:userId — persistent SSE connection             │
│                                                                  │
│  Events emitted to the frontend:                                 │
│  ┌─────────────┬──────────────────────────────────────┐          │
│  │ wallet:topup │ ₦X loaded to wallet (from webhook)  │          │
│  │ bet:success  │ Bet placed, ₦X sent to provider     │          │
│  │ bet:blocked  │ Budget/cooldown blocked the bet     │          │
│  │ mandate:ready│ Mandate just activated               │          │
│  └─────────────┴──────────────────────────────────────┘          │
│                                                                  │
│  Heartbeat comment every 30s keeps connection alive.             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│             6. INSIGHTS & RISK SCORING                           │
│                                                                  │
│  GET /api/wallet/:userId/insights                                │
│       │                                                          │
│       ├── dailySpend[7] — Mon to Sun bar chart data              │
│       ├── peakBettingHour — hour with most bets this week        │
│       ├── averageBetSize — mean amount per successful bet        │
│       ├── blockedAttempts — count of GATE_BLOCKs this week       │
│       ├── streakWeeks — consecutive weeks within budget          │
│       └── riskScore — LOW (<50%), MEDIUM (50-80%), HIGH (>80%)   │
│                                                                  │
│  Shown as a spending bar chart in the History tab.               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Why This Actually Stops Overspending

| Mechanism | How it works |
|-----------|-------------|
| **Ring-fenced wallet** | Money lives in a Nomba virtual account, not in the betting platform. The betting platform never has direct access to the user's bank account. |
| **Hard weekly cap** | The spending gate physically blocks any transaction that would exceed `weeklyBudget`. Not a soft warning — a 403 rejection. Nomba is never called. No money moves. |
| **No manual top-up** | The wallet can only be loaded by the Monday cron job via Direct Debit mandate. The user cannot add funds mid-week even if they want to. |
| **Cooldown timer** | Forces a configurable pause (10/30/60/120 min) between bets — prevents impulsive consecutive losses. |
| **Transparent history** | Every success, every block, every top-up is timestamped and visible. No hidden movements. |
| **Risk score** | Automated flagging when spend exceeds 50%/80% or when blocks occur. Users see it before they act. |

---

## API Routes

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/api/auth/signup` | Create account with email/password | — |
| POST | `/api/auth/signin` | Sign in, returns JWT access + refresh token | — |
| GET | `/api/auth/me` | Verify token, get user + wallet + mandate status | JWT |
| POST | `/api/onboard` | Register user, create virtual account + mandate | JWT |
| GET | `/api/onboard/mandate-status/:userId` | Poll Nomba for mandate activation status | JWT |
| GET | `/api/bet/providers` | List supported betting platforms | JWT |
| POST | `/api/bet/verify-account` | Verify a betting account ID | JWT |
| POST | `/api/bet/place` | Gated bet placement (spendingGate runs) | JWT |
| GET | `/api/wallet/:userId` | Wallet state + cooldown info + live Nomba balance | JWT |
| GET | `/api/wallet/:userId/history` | Transaction history (newest first) | JWT |
| GET | `/api/wallet/:userId/insights` | Daily spend, peak hour, avg size, risk score | JWT |
| PATCH | `/api/wallet/:userId/budget` | Update weekly budget (min ₦500) | JWT |
| PATCH | `/api/wallet/:userId/cooldown` | Set cooldown minutes (0/10/30/60/120) | JWT |
| POST | `/api/webhooks/nomba` | Nomba payment event receiver | Webhook secret |
| GET | `/api/events/:userId` | Server-Sent Events real-time stream | Token (query) |
| POST | `/api/admin/trigger-cycle` | Manual weekly cycle (demo trigger) | JWT |
| GET | `/api/health` | Health check + version + user count | — |

---

## Nomba APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| Auth | `POST /v1/auth/token/issue` | Get Bearer token (requires `accountId` header) |
| Virtual Accounts | `POST /v1/accounts/virtual` | Create ring-fenced wallet per user |
| Virtual Accounts | `GET /v1/accounts/virtual/:ref` | Fetch live balance |
| Direct Debit | `POST /v1/direct-debits` | Create mandate |
| Direct Debit | `GET /v1/direct-debits/status` | Poll activation |
| Direct Debit | `POST /v1/direct-debits/debit-mandate` | Weekly auto-topup |
| Betting | `GET /v1/bill/betting/providers` | List providers |
| Betting | `GET /v1/bill/betting/customer-info` | Verify betting account |
| Betting | `POST /v1/bill/betting/vend` | Fund betting account (with `payerName` + `phoneNumber`) |
| Webhooks | (incoming) | Confirm payment events |

---

## File Structure

```
betguard/
├── src/
│   ├── server.js                # Express entry point
│   ├── services/
│   │   ├── nomba.js             # Nomba API client (safeGet, logging)
│   │   ├── supabase.js          # Supabase admin client init
│   │   └── insights.js          # Weekly insights engine
│   ├── models/
│   │   └── db.js                # Supabase data access layer (users, wallets, mandates, transactions)
│   ├── middleware/
│   │   ├── auth.js              # JWT verification via Supabase
│   │   └── spendingGate.js      # Budget + cooldown enforcement
│   ├── routes/
│   │   ├── onboard.js           # User registration + mandate
│   │   ├── bet.js               # Gated bet placement
│   │   ├── wallet.js            # Balance, history, cooldown, insights
│   │   ├── webhooks.js          # Nomba event receiver
│   │   └── events.js            # SSE real-time stream
│   ├── jobs/
│   │   ├── weeklyCycle.js       # Monday auto-topup cron
│   │   └── mandatePoller.js     # 15-min mandate status check
│   └── scripts/
│       └── verify.js            # Sandbox API verification
├── supabase/
│   └── schema.sql               # PostgreSQL schema + RLS policies
├── public/
│   └── index.html               # Glassmorphism SPA (Tailwind + Chart.js)
├── scripts/
│   └── keep-alive.sh            # Render spin-down prevention ping
├── Procfile                     # Render: web node src/server.js
├── railway.json                 # Nixpacks deploy config
├── .env                         # Nomba + Supabase credentials
└── .env.example                 # Environment variable template
```

---

## Demo Script (90 seconds for judges)

1. **Onboard tab** → fill form with name, phone, bank, budget → hit "Create account & mandate"
   - Shows the virtual account NUBAN and NIBSS activation instructions

2. **Demo tab** → paste the returned `userId` → "Load user"
   - Wallet card populates, SSE connects in real-time

3. **Demo tab** → "Run weekly cycle now"
   - Simulates Monday morning: debits mandate → credits wallet → resets counter

4. **Demo tab** → "Place ₦1,000 bet"
   - Gate passes → vend succeeds → wallet updates live (SSE toast appears)

5. **Demo tab** → "Try ₦99,999 bet"
   - Gate blocks it → red pulse on budget bar → SSE blocked toast

6. **History tab** → Spending chart + full transaction log with both the success and the block

7. **Cooldown card** → Set 10m cooldown → try betting again → blocked with countdown timer

---

## Quick Start

```bash
npm install
cp .env.example .env   # Credentials are pre-filled
npm run dev

# Run sandbox verification first:
node src/scripts/verify.js

# Open browser at http://localhost:3000
```

## Webhook Setup

Register your webhook URL on the Nomba dashboard:

```
https://your-app.com/api/webhooks/nomba
```

For local testing with ngrok:

```bash
npx ngrok http 3000
# Register the https://xxxx.ngrok.io/api/webhooks/nomba URL
```

---

## Built By

**Adelakin Israel — Solo Team** | **Team name: Ezrahel**

*Nomba Hackathon 2026 — Responsible Gambling Wallet*
