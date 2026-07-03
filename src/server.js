// src/server.js — BetSafe Express server (Supabase-backed)

require("dotenv").config();
const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const onboardRouter = require("./routes/onboard");
const betRouter = require("./routes/bet");
const walletRouter = require("./routes/wallet");
const webhookRouter = require("./routes/webhooks");
const eventsRouter = require("./routes/events").router;
const { startWeeklyCycleJob, runCycleNow } = require("./jobs/weeklyCycle");
const { startMandatePoller } = require("./jobs/mandatePoller");
const { authMiddleware } = require("./middleware/auth");
const db = require("./models/db");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// CORS for the frontend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, "../public")));

// ─── Auth Routes (public) ────────────────────────────────────────────────────

// POST /api/auth/signup
app.post("/api/auth/signup", async (req, res) => {
  const { email, password, fullName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || "" } },
    });

    if (error) throw error;

    res.status(201).json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
      message: "Check your email for the confirmation link, or sign in immediately if auto-confirm is enabled.",
    });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/signin
app.post("/api/auth/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    res.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
    });
  } catch (err) {
    console.error("Signin error:", err.message);
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me — verify token and return user info
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const user = await db.getUser(req.userId);
  const wallet = await db.getWallet(req.userId);
  const mandate = await db.getMandate(req.userId);

  res.json({
    user: user || { id: req.userId, email: req.userEmail },
    hasWallet: !!wallet,
    hasMandate: !!mandate,
  });
});

// ─── Protected API Routes ────────────────────────────────────────────────────
app.use("/api/onboard", authMiddleware, onboardRouter);
app.use("/api/bet", authMiddleware, betRouter);
app.use("/api/wallet", authMiddleware, walletRouter);
app.use("/api/events", eventsRouter); // SSE handles auth via token query param

// Webhooks are public (Nomba calls them, not the user)
app.use("/api/webhooks", webhookRouter);

// POST /api/admin/trigger-cycle — requires auth
app.post("/api/admin/trigger-cycle", authMiddleware, async (req, res) => {
  try {
    const results = await runCycleNow(req.userId);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health — public
app.get("/api/health", async (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    userCount: await db.getUserCount(),
    env: process.env.NOMBA_BASE_URL,
  });
});

// Serve frontend for any other route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  BetSafe running on http://localhost:${PORT}`);
  console.log(`   Nomba env: ${process.env.NOMBA_BASE_URL}`);
  console.log(`   Supabase: ${SUPABASE_URL ? "✅ configured" : "❌ not set"}`);
  startWeeklyCycleJob();
  startMandatePoller();
});
