// src/routes/wallet.js — Wallet state, history, insights, cooldown (auth-protected)

const express = require("express");
const nomba = require("../services/nomba");
const db = require("../models/db");
const { computeInsights } = require("../services/insights");

const router = express.Router();
const ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

// GET /api/wallet/:userId — overload: if userId === "me", use req.userId
router.get("/:userId", async (req, res) => {
  const userId = req.params.userId === "me" ? req.userId : req.params.userId;
  // Must be accessing own wallet
  if (userId !== req.userId) {
    return res.status(403).json({ error: "You can only view your own wallet." });
  }

  const [user, wallet, mandate] = await Promise.all([
    db.getUser(userId),
    db.getWallet(userId),
    db.getMandate(userId),
  ]);

  if (!user || !wallet) {
    return res.status(404).json({ error: "User or wallet not found. Complete onboarding first." });
  }

  let liveBalance = null;
  try {
    const acct = await nomba.getVirtualAccountBalance(wallet.nombaAccountRef, ACCOUNT_ID);
    liveBalance = acct.balance || acct.amount || acct.availableBalance || null;
  } catch (_) {}

  const remaining = user.weeklyBudget - wallet.weeklySpent;
  const percentUsed = Math.round((wallet.weeklySpent / user.weeklyBudget) * 100);

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

router.get("/:userId/history", async (req, res) => {
  const userId = req.params.userId === "me" ? req.userId : req.params.userId;
  if (userId !== req.userId) {
    return res.status(403).json({ error: "You can only view your own history." });
  }
  const txs = await db.getUserTransactions(userId);
  res.json({ transactions: txs });
});

router.patch("/:userId/budget", async (req, res) => {
  const userId = req.params.userId === "me" ? req.userId : req.params.userId;
  if (userId !== req.userId) {
    return res.status(403).json({ error: "You can only update your own budget." });
  }

  const { weeklyBudget } = req.body;
  if (!weeklyBudget || weeklyBudget < 500) {
    return res.status(400).json({ error: "Minimum weekly budget is ₦500." });
  }

  const user = await db.updateUser(userId, { weeklyBudget });
  if (!user) return res.status(404).json({ error: "User not found." });

  res.json({
    success: true,
    message: `Budget updated to ₦${weeklyBudget.toLocaleString()}. Takes effect from next Monday.`,
    weeklyBudget,
  });
});

router.patch("/:userId/cooldown", async (req, res) => {
  const userId = req.params.userId === "me" ? req.userId : req.params.userId;
  if (userId !== req.userId) {
    return res.status(403).json({ error: "You can only update your own cooldown." });
  }

  const { cooldownMinutes } = req.body;
  const valid = [0, 10, 30, 60, 120];
  if (!valid.includes(cooldownMinutes)) {
    return res.status(400).json({ error: "cooldownMinutes must be one of: 0, 10, 30, 60, 120" });
  }

  const user = await db.updateUser(userId, { cooldownMinutes });
  if (!user) return res.status(404).json({ error: "User not found." });

  res.json({
    success: true,
    cooldownMinutes,
    message: cooldownMinutes > 0
      ? `Cooldown set to ${cooldownMinutes} minutes between bets.`
      : "Cooldown disabled.",
  });
});

router.get("/:userId/insights", async (req, res) => {
  const userId = req.params.userId === "me" ? req.userId : req.params.userId;
  if (userId !== req.userId) {
    return res.status(403).json({ error: "You can only view your own insights." });
  }

  const insights = await computeInsights(userId);
  if (!insights) return res.status(404).json({ error: "User not found." });
  res.json(insights);
});

module.exports = router;
