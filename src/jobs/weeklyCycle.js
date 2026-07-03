// src/jobs/weeklyCycle.js — Weekly auto-topup cron (async)

const cron = require("node-cron");
const nomba = require("../services/nomba");
const db = require("../models/db");

const PARENT_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

const WEEKLY_TOPUP_SCHEDULE = "5 23 * * 0"; // every Sunday 23:05 UTC = Monday 00:05 WAT

function startWeeklyCycleJob() {
  cron.schedule(WEEKLY_TOPUP_SCHEDULE, async () => {
    console.log("⏰ Weekly cycle job starting...");

    const allUsers = await db.getAllUsers();
    console.log(`Processing ${allUsers.length} users`);

    for (const user of allUsers) {
      try {
        const mandate = await db.getMandate(user.id);

        if (!mandate || mandate.status !== "ACTIVE" || mandate.adviceStatus !== "ADVICE_SENT") {
          console.log(`⏭️  Skipping ${user.fullName} — mandate not ready`);
          continue;
        }

        const result = await nomba.debitMandate(
          mandate.mandateId,
          user.weeklyBudget,
          PARENT_ACCOUNT_ID
        );

        await db.resetWeeklyCycle(user.id);

        console.log(`✅ Topped up ${user.fullName}: ₦${user.weeklyBudget} — ref: ${result.mandateId}`);
      } catch (err) {
        console.error(`❌ Failed to top up ${user.fullName}:`, err.response?.data || err.message);
      }
    }

    console.log("✅ Weekly cycle job complete");
  });

  console.log("⏰ Weekly cycle cron scheduled (every Monday 00:05 WAT)");
}

async function runCycleNow(userId = null) {
  const users = userId
    ? [(await db.getUser(userId))].filter(Boolean)
    : await db.getAllUsers();

  const results = [];
  for (const user of users) {
    const mandate = await db.getMandate(user.id);
    if (!mandate || mandate.status !== "ACTIVE") {
      results.push({ userId: user.id, status: "SKIPPED", reason: "Mandate not active" });
      continue;
    }

    try {
      await nomba.debitMandate(mandate.mandateId, user.weeklyBudget, PARENT_ACCOUNT_ID);
      await db.resetWeeklyCycle(user.id);
      results.push({ userId: user.id, status: "SUCCESS", amount: user.weeklyBudget });
    } catch (err) {
      results.push({ userId: user.id, status: "FAILED", error: err.message });
    }
  }

  return results;
}

module.exports = { startWeeklyCycleJob, runCycleNow };
