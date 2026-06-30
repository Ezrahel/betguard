// src/server.js — BetGuard Express server entry point

require("dotenv").config();
const express = require("express");
const path = require("path");

const onboardRouter = require("./routes/onboard");
const betRouter = require("./routes/bet");
const walletRouter = require("./routes/wallet");
const webhookRouter = require("./routes/webhooks");
const eventsRouter = require("./routes/events").router;
const { startWeeklyCycleJob, runCycleNow } = require("./jobs/weeklyCycle");
const { startMandatePoller } = require("./jobs/mandatePoller");
const db = require("./models/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/onboard", onboardRouter);
app.use("/api/bet", betRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api/events", eventsRouter);

app.post("/api/admin/trigger-cycle", async (req, res) => {
  const { userId } = req.body;
  try {
    const results = await runCycleNow(userId);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    userCount: db.getUserCount(),
    env: process.env.NOMBA_BASE_URL,
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  BetGuard running on http://localhost:${PORT}`);
  console.log(`   Nomba env: ${process.env.NOMBA_BASE_URL}`);
  startWeeklyCycleJob();
  startMandatePoller();
});
