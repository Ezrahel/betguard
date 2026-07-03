// src/routes/bet.js — Gated bet placement (auth-protected)

const express = require("express");
const nomba = require("../services/nomba");
const db = require("../models/db");
const { spendingGate } = require("../middleware/spendingGate");
const { emit } = require("./events");

const router = express.Router();
const ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

router.get("/providers", async (req, res) => {
  try {
    const providers = await nomba.getBettingProviders(ACCOUNT_ID);
    res.json({ providers });
  } catch (err) {
    console.error("Providers error:", err.response?.data || err.message);
    res.status(500).json({ error: "Could not fetch betting providers." });
  }
});

router.post("/verify-account", async (req, res) => {
  const { billerId, customerId } = req.body;
  if (!billerId || !customerId) {
    return res.status(400).json({ error: "billerId and customerId are required." });
  }
  try {
    const info = await nomba.getBettingCustomerInfo({ billerId, customerId, subAccountId: ACCOUNT_ID });
    res.json({ valid: true, accountInfo: info });
  } catch (err) {
    res.status(400).json({ valid: false, error: "Betting account not found. Check the ID and try again." });
  }
});

router.post("/place", spendingGate, async (req, res) => {
  const { billerId, customerId } = req.body;
  const { userId, betAmount, wallet, user } = req.spendContext;

  try {
    const result = await nomba.vendBet({
      billerId,
      customerId,
      amount: betAmount,
      subAccountId: ACCOUNT_ID,
      payerName: user.fullName,
      phoneNumber: user.phone,
    });

    await db.incrementSpend(userId, betAmount);

    await db.recordTransaction({
      userId,
      type: "BET_VEND",
      amount: betAmount,
      provider: billerId,
      customerId,
      status: "SUCCESS",
      nombaRef: result?.transactionRef || result?.reference || null,
    });

    const updatedWallet = await db.getWallet(userId);
    const newRemaining = user.weeklyBudget - updatedWallet.weeklySpent;

    emit(userId, "bet:success", {
      amount: betAmount,
      provider: billerId,
      remaining: newRemaining,
    });

    res.json({
      success: true,
      message: `₦${betAmount.toLocaleString()} sent to your ${billerId} account.`,
      transaction: {
        amount: betAmount,
        provider: billerId,
        customerId,
        nombaRef: result?.transactionRef || result?.reference,
      },
      wallet: {
        weeklyBudget: user.weeklyBudget,
        weeklySpent: updatedWallet.weeklySpent,
        remaining: newRemaining,
        percentUsed: Math.round((updatedWallet.weeklySpent / user.weeklyBudget) * 100),
      },
      warning: req.budgetWarning || null,
    });
  } catch (err) {
    console.error("Bet vend error:", err.response?.data || err.message);

    await db.recordTransaction({
      userId,
      type: "BET_VEND",
      amount: betAmount,
      provider: billerId,
      customerId,
      status: "FAILED",
      nombaRef: null,
    });

    res.status(502).json({ error: "Bet could not be placed. Try again.", detail: err.response?.data });
  }
});

module.exports = router;
