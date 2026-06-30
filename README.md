# 🛡️ BetGuard — Responsible Gambling Wallet

> Built on Nomba APIs for the Nomba Hackathon 2026

BetGuard gives users a ring-fenced weekly betting wallet that **auto-loads from their bank every Monday via Direct Debit and hard-blocks bets the moment they exceed their own limit** — using Nomba's Betting API to vend directly, no manual top-up possible.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your credentials
cp .env.example .env
# Edit .env — credentials are already pre-filled from your hackathon email

# 3. Start the server
npm run dev

# 4. Open the demo UI
open http://localhost:3000
```

---

## Architecture

```
User
 │
 ├─ POST /api/onboard
 │    ├─ Creates Nomba virtual account (ring-fenced wallet)
 │    └─ Creates Direct Debit mandate via NIBSS
 │
 ├─ CRON (every Monday 00:05 WAT)
 │    └─ Debits mandate → credits virtual account → resets spend tracker
 │
 ├─ POST /api/bet/place
 │    ├─ [spendingGate middleware]
 │    │    ├─ mandate ACTIVE + ADVICE_SENT?
 │    │    ├─ balance ≥ bet amount?
 │    │    └─ (spent + amount) ≤ weeklyBudget?
 │    └─ POST /v1/bill/betting/vend  ← Nomba Betting API
 │
 └─ POST /api/webhooks/nomba
      └─ Confirms credits, records transaction
```

---

## API routes

| Method | Route | What it does |
|--------|-------|-------------|
| POST | `/api/onboard` | Register user, create virtual account + mandate |
| GET | `/api/onboard/mandate-status/:userId` | Poll mandate activation |
| GET | `/api/bet/providers` | List Nomba betting providers |
| POST | `/api/bet/verify-account` | Verify a betting account ID |
| POST | `/api/bet/place` | Gated bet placement |
| GET | `/api/wallet/:userId` | Wallet state + live balance |
| GET | `/api/wallet/:userId/history` | Transaction history |
| PATCH | `/api/wallet/:userId/budget` | Update weekly budget |
| POST | `/api/webhooks/nomba` | Nomba payment event receiver |
| POST | `/api/admin/trigger-cycle` | Manual cycle trigger (demo) |

---

## Nomba APIs used

| API | Endpoint | Purpose |
|-----|----------|---------|
| Virtual Accounts | `POST /v1/accounts/virtual` | Create ring-fenced wallet |
| Direct Debit | `POST /v1/direct-debits` | Create mandate |
| Direct Debit | `GET /v1/direct-debits/status` | Poll activation |
| Direct Debit | `POST /v1/direct-debits/debit-mandate` | Weekly auto-topup |
| Betting | `GET /v1/bill/betting/providers` | List providers |
| Betting | `GET /v1/bill/betting/customer-info` | Verify account |
| Betting | `POST /v1/bill/betting/vend` | Fund betting account |
| Webhooks | (incoming) | Confirm payment events |

---

## Demo script (judges)

1. **Onboard tab** → fill form → "Create account & mandate"
   - Shows virtual wallet account number
   - Shows NIBSS activation instructions
2. **Demo tab** → paste `userId` → "Load user"
3. **Demo tab** → "Run weekly cycle now" (simulates Monday auto-topup)
4. **Demo tab** → "Place ₦1,000 bet" → succeeds, wallet updates live
5. **Demo tab** → "Try ₦99,999 bet" → **hard blocked**, no money moved
6. **History tab** → shows full transaction log including the block event

Total demo time: ~90 seconds.

---

## Webhook setup

Register your webhook URL in the Nomba dashboard:
```
https://your-app-url.com/api/webhooks/nomba
Sub-account ID: b76e2955-8376-46b0-8f34-7e70e3f31261
```

For local development, use [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# Copy the https URL and register it on Nomba
```
