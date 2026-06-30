// src/services/insights.js — Weekly insights engine

const db = require("../models/db");

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function computeInsights(userId) {
  const user = db.getUser(userId);
  const wallet = db.getWallet(userId);
  if (!user || !wallet) return null;

  const { monday, sunday } = getWeekRange();
  const allTx = db.getUserTransactions(userId);

  // Filter this week's transactions
  const weekTx = allTx.filter((tx) => {
    const d = new Date(tx.createdAt);
    return d >= monday && d <= sunday;
  });

  // ── dailySpend: Mon-Sun ──────────────────────────────────────────────────
  const dailySpend = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const dayTx = weekTx.filter((tx) => {
      const d = new Date(tx.createdAt);
      return d >= dayStart && d <= dayEnd && tx.type === "BET_VEND" && tx.status === "SUCCESS";
    });

    const total = dayTx.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    dailySpend.push({
      day: DAY_NAMES[day.getDay()],
      date: dayStart.toISOString().slice(0, 10),
      amount: total,
    });
  }

  // ── peakBettingHour ──────────────────────────────────────────────────────
  const hourCounts = {};
  const successTx = weekTx.filter((tx) => tx.type === "BET_VEND" && tx.status === "SUCCESS");
  for (const tx of successTx) {
    const hour = new Date(tx.createdAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }
  let peakBettingHour = -1;
  let maxCount = 0;
  for (let h = 0; h < 24; h++) {
    if ((hourCounts[h] || 0) > maxCount) {
      maxCount = hourCounts[h];
      peakBettingHour = h;
    }
  }

  // ── averageBetSize ───────────────────────────────────────────────────────
  const betAmounts = successTx.map((tx) => tx.amount);
  const averageBetSize = betAmounts.length > 0
    ? betAmounts.reduce((a, b) => a + b, 0) / betAmounts.length
    : 0;

  // ── blockedAttempts ──────────────────────────────────────────────────────
  const blockedAttempts = weekTx.filter((tx) => tx.status === "BLOCKED").length;

  // ── streakWeeks ──────────────────────────────────────────────────────────
  const streakWeeks = user.streakWeeks || 0;

  // ── riskScore ────────────────────────────────────────────────────────────
  const percentUsed = user.weeklyBudget > 0
    ? (wallet.weeklySpent / user.weeklyBudget) * 100
    : 0;

  let riskScore;
  if (blockedAttempts > 0 || percentUsed > 80) {
    riskScore = "HIGH";
  } else if (percentUsed >= 50) {
    riskScore = "MEDIUM";
  } else {
    riskScore = "LOW";
  }

  return {
    dailySpend,
    peakBettingHour: peakBettingHour >= 0 ? peakBettingHour : null,
    averageBetSize: Math.round(averageBetSize * 100) / 100,
    blockedAttempts,
    streakWeeks,
    riskScore,
  };
}

module.exports = { computeInsights };
