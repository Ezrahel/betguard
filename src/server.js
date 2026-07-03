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
app.use(express.json({ limit: "100kb" }));

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
    return res.status(400).json({ success: false, error: "Email and password are required." });
  }
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ success: false, error: "Email and password must be strings." });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters." });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || "" } },
    });

    if (error) throw error;

    const user = data?.user;
    const session = data?.session ?? null;

    if (!user) {
      throw new Error("Signup succeeded but no user was returned.");
    }

    res.status(session ? 200 : 201).json({
      success: true,
      user: { id: user.id, email: user.email },
      session,
      message: session
        ? "Account created and signed in."
        : "Account created. Check your email for the confirmation link, then sign in.",
    });
  } catch (err) {
    console.error("[auth] Signup error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/auth/signin
app.post("/api/auth/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required." });
  }
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ success: false, error: "Email and password must be strings." });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data?.user;
    const session = data?.session ?? null;

    if (!user || !session) {
      throw new Error("Login succeeded but no session was returned.");
    }

    res.json({
      success: true,
      user: { id: user.id, email: user.email },
      session: { access_token: session.access_token, refresh_token: session.refresh_token },
    });
  } catch (err) {
    console.error("[auth] Signin error:", err);
    res.status(401).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me — verify token and return user info
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const [user, wallet, mandate] = await Promise.all([
      db.getUser(req.userId).catch(() => null),
      db.getWallet(req.userId).catch(() => null),
      db.getMandate(req.userId).catch(() => null),
    ]);

    res.json({
      success: true,
      user: user || { id: req.userId, email: req.userEmail },
      hasWallet: !!wallet,
      hasMandate: !!mandate,
    });
  } catch (err) {
    console.error("[auth] /me error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch user data." });
  }
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
    res.json({ success: true, data: results });
  } catch (err) {
    console.error("[admin] trigger-cycle error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/health — public
app.get("/api/health", async (req, res) => {
  let supabaseStatus = "unknown";
  let userCount = 0;
  try {
    userCount = await db.getUserCount();
    supabaseStatus = "connected";
  } catch (err) {
    supabaseStatus = `error: ${err.message}`;
  }

  res.json({
    success: true,
    data: {
      status: "ok",
      version: "1.0.0",
      uptime: Math.floor(process.uptime()),
      supabase: supabaseStatus,
      userCount,
    },
  });
});

// Serve frontend for any other route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Keep-alive self-ping (prevents Render spin-down, best-effort) ────────────
const cron = require("node-cron");
const http = require("http");

const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

function startKeepAlive() {
  cron.schedule("*/10 * * * *", () => {
    http.get(`${APP_URL}/api/health`, (res) => {
      console.log(`[keepalive] pinged ${APP_URL}/api/health → ${res.statusCode}`);
    }).on("error", (err) => {
      console.error(`[keepalive] ping failed: ${err.message}`);
    });
  });
  console.log(`⏰ Keep-alive cron scheduled (every 10 min → ${APP_URL}/api/health)`);
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  BetSafe running on http://localhost:${PORT}`);
  console.log(`   Nomba env: ${process.env.NOMBA_BASE_URL}`);
  console.log(`   Supabase: ${SUPABASE_URL ? "✅ configured" : "❌ not set"}`);
  startWeeklyCycleJob();
  startMandatePoller();
  startKeepAlive();
});
