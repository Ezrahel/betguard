// src/routes/wallet.js — Balance, history, budget, insights, cooldown

const express = require("express");
const nomba = require("../services/nomba");
const db = require("../models/db");
const { computeInsights } = require("../services/insights");

const router = express.Router();
const SUB_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

// GET /api/wallet/:userId
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  const user = db.getUser(userId);
  const wallet = db.getWallet(userId);
  const mandate = db.getMandate(userId);

  if (!user || !wallet) {
    return res.status(404).json({ error: "User or wallet not found." });
  }

  let liveBalance = null;
  try {
    const acct = await nomba.getVirtualAccountBalance(wallet.nombaAccountRef, SUB_ACCOUNT_ID);
    liveBalance = acct.balance || acct.amount || acct.availableBalance || null;
  } catch (_) {}

  const remaining = user.weeklyBudget - wallet.weeklySpent;
  const percentUsed = Math.round((wallet.weeklySpent / user.weeklyBudget) * 100);

  // Cooldown info
  const cooldownMinutes = user.cooldownMinutes || 0;
  let cooldownRemainingMs = 0;
  if (cooldownMinutes > 0 && wallet.lastBetAt) {
    const elapsed = Date.now() - new Date(wallet.lastBetAt).getTime();
    cooldownRemainingMs = Math.max(0, cooldownMinutes * 60 * 1000 - elapsed);
  }

  res.json({
    user: { fullName: user.fullName, email: user.email, cooldownMinutes },
    wallet: {
      accountNumber: wallet.nombaBankAccountNumber,
      liveBalance,
      weeklyBudget: user.weeklyBudget,
      weeklySpent: wallet.weeklySpent,
      remaining,
      percentUsed,
      cycleStartDate: wallet.cycleStartDate,
      resetsIn: `${db.daysUntilNextMonday()} days`,
      totalBets: wallet.totalBets,
      lastBetAt: wallet.lastBetAt,
      cooldown: {
        active: cooldownRemainingMs > 0,
        cooldownMinutes,
        remainingMs: cooldownRemainingMs,
        remainingSeconds: Math.ceil(cooldownRemainingMs / 1000),
      },
    },
    mandate: {
      status: mandate?.status || "NOT_CREATED",
      adviceStatus: mandate?.adviceStatus || null,
      isReady: mandate?.status === "ACTIVE" && mandate?.adviceStatus === "ADVICE_SENT",
    },
  });
});

// GET /api/wallet/:userId/history
router.get("/:userId/history", (req, res) => {
  const { userId } = req.params;
  const txs = db.getUserTransactions(userId);
  res.json({ transactions: txs.reverse() });
});

// PATCH /api/wallet/:userId/budget
router.patch("/:userId/budget", (req, res) => {
  const { userId } = req.params;
  const { weeklyBudget } = req.body;

  if (!weeklyBudget || weeklyBudget < 500) {
    return res.status(400).json({ error: "Minimum weekly budget is ₦500." });
  }

  const user = db.updateUser(userId, { weeklyBudget });
  if (!user) return res.status(404).json({ error: "User not found." });

  res.json({
    success: true,
    message: `Budget updated to ₦${weeklyBudget.toLocaleString()}. Takes effect from next Monday.`,
    weeklyBudget,
  });
});

// PATCH /api/wallet/:userId/cooldown
router.patch("/:userId/cooldown", (req, res) => {
  const { userId } = req.params;
  const { cooldownMinutes } = req.body;

  const valid = [0, 10, 30, 60, 120];
  if (!valid.includes(cooldownMinutes)) {
    return res.status(400).json({ error: "cooldownMinutes must be one of: 0, 10, 30, 60, 120" });
  }

  const user = db.updateUser(userId, { cooldownMinutes });
  if (!user) return res.status(404).json({ error: "User not found." });

  res.json({
    success: true,
    cooldownMinutes,
    message: cooldownMinutes > 0
      ? `Cooldown set to ${cooldownMinutes} minutes between bets.`
      : "Cooldown disabled.",
  });
});

// GET /api/wallet/:userId/insights
router.get("/:userId/insights", (req, res) => {
  const { userId } = req.params;
  const insights = computeInsights(userId);
  if (!insights) return res.status(404).json({ error: "User not found." });
  res.json(insights);
});

module.exports = router;
