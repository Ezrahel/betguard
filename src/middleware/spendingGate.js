// src/middleware/spendingGate.js — Budget enforcement + cooldown gate with SSE (async)

const db = require("../models/db");
const { emit } = require("../routes/events");

async function spendingGate(req, res, next) {
  const userId = req.userId;
  const { amount } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: "userId and amount are required." });
  }

  const betAmount = parseFloat(amount);
  if (isNaN(betAmount) || betAmount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number." });
  }

  const user = await db.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const wallet = await db.getWallet(userId);
  if (!wallet) {
    return res.status(404).json({ error: "Wallet not found. Complete onboarding first." });
  }

  const mandate = await db.getMandate(userId);
  if (!mandate || mandate.status !== "ACTIVE" || mandate.adviceStatus !== "ADVICE_SENT") {
    return res.status(403).json({
      error: "Mandate not active yet.",
      detail: "Your bank is still authorising the mandate. You'll be notified when it's ready.",
      mandateStatus: mandate?.status || "NOT_CREATED",
    });
  }

  const remaining = user.weeklyBudget - wallet.weeklySpent;
  const percentSpent = Math.round((wallet.weeklySpent / user.weeklyBudget) * 100);

  // ── Gate 1: Budget check ──────────────────────────────────────────────────
  if (wallet.weeklySpent + betAmount > user.weeklyBudget) {
    await db.recordTransaction({
      userId,
      type: "GATE_BLOCK",
      amount: betAmount,
      provider: req.body.billerId,
      customerId: req.body.customerId,
      status: "BLOCKED",
      nombaRef: null,
    });

    emit(userId, "bet:blocked", {
      reason: "BUDGET_EXHAUSTED",
      remaining: 0,
      resetsIn: `${db.daysUntilNextMonday()} days`,
    });

    return res.status(403).json({
      blocked: true,
      reason: "BUDGET_EXHAUSTED",
      message: `Wallet locked. You've used ₦${wallet.weeklySpent.toLocaleString()} of your ₦${user.weeklyBudget.toLocaleString()} weekly limit.`,
      remaining: 0,
      resetsIn: `${db.daysUntilNextMonday()} days`,
    });
  }

  // ── Gate 2: Cooldown check ────────────────────────────────────────────────
  const cooldownMinutes = user.cooldownMinutes || 0;
  if (cooldownMinutes > 0 && wallet.lastBetAt) {
    const lastBet = new Date(wallet.lastBetAt).getTime();
    const now = Date.now();
    const elapsedMs = now - lastBet;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const remainingMs = cooldownMs - elapsedMs;

    if (remainingMs > 0) {
      const minutesRemaining = Math.ceil(remainingMs / 60000);

      await db.recordTransaction({
        userId,
        type: "GATE_BLOCK",
        amount: betAmount,
        provider: req.body.billerId,
        customerId: req.body.customerId,
        status: "BLOCKED",
        nombaRef: null,
      });

      const resetsIn = `${db.daysUntilNextMonday()} days`;

      emit(userId, "bet:blocked", {
        reason: "COOLDOWN_ACTIVE",
        minutesRemaining,
        remaining: Math.max(0, remaining),
        resetsIn,
      });

      return res.status(403).json({
        blocked: true,
        reason: "COOLDOWN_ACTIVE",
        message: `Cooldown active. Please wait ${minutesRemaining} minute(s) before placing another bet.`,
        minutesRemaining,
        resetsIn,
      });
    }
  }

  // ── Gate 3: Warn at 80% spent ────────────────────────────────────────────
  if (percentSpent >= 80) {
    req.budgetWarning = {
      level: "HIGH",
      message: `Heads up — you've used ${percentSpent}% of your weekly budget. ₦${remaining.toLocaleString()} left.`,
    };
  }

  // All gates passed
  req.spendContext = {
    userId,
    betAmount,
    weeklySpent: wallet.weeklySpent,
    weeklyBudget: user.weeklyBudget,
    remaining,
    wallet,
    user,
  };

  next();
}

module.exports = { spendingGate };
