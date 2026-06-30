const cron = require("node-cron");
const nomba = require("../services/nomba");
const db = require("../models/db");

const PARENT_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

// Runs every Monday at 00:05 WAT (UTC+1 = Sunday 23:05 UTC)
// Cron format: minute hour day-of-month month day-of-week
const WEEKLY_TOPUP_SCHEDULE = "5 23 * * 0"; // every Sunday 23:05 UTC = Monday 00:05 WAT

function startWeeklyCycleJob() {
  cron.schedule(WEEKLY_TOPUP_SCHEDULE, async () => {
    console.log("⏰ Weekly cycle job starting...");

    const allUsers = db.getAllUsers();
    console.log(`Processing ${allUsers.length} users`);

    for (const user of allUsers) {
      try {
        const mandate = db.getMandate(user.id);

        // Skip users without an active mandate
        if (!mandate || mandate.status !== "ACTIVE" || mandate.adviceStatus !== "ADVICE_SENT") {
          console.log(`⏭️  Skipping ${user.fullName} — mandate not ready`);
          continue;
        }

        // Pull the weekly budget from user's bank into their BetGuard wallet
        const result = await nomba.debitMandate(
          mandate.mandateId,
          user.weeklyBudget,
          PARENT_ACCOUNT_ID
        );

        // Reset the spend tracker for the new cycle
        db.resetWeeklyCycle(user.id);

        console.log(`✅ Topped up ${user.fullName}: ₦${user.weeklyBudget} — ref: ${result.mandateId}`);
      } catch (err) {
        console.error(`❌ Failed to top up ${user.fullName}:`, err.response?.data || err.message);
        // In production: queue for retry, alert ops team, notify user
      }
    }

    console.log("✅ Weekly cycle job complete");
  });

  console.log("⏰ Weekly cycle cron scheduled (every Monday 00:05 WAT)");
}

// Manual trigger for demo/testing
async function runCycleNow(userId = null) {
  const users = userId ? [db.getUser(userId)].filter(Boolean) : db.getAllUsers();

  const results = [];
  for (const user of users) {
    const mandate = db.getMandate(user.id);
    if (!mandate || mandate.status !== "ACTIVE") {
      results.push({ userId: user.id, status: "SKIPPED", reason: "Mandate not active" });
      continue;
    }

    try {
      await nomba.debitMandate(mandate.mandateId, user.weeklyBudget, PARENT_ACCOUNT_ID);
      db.resetWeeklyCycle(user.id);
      results.push({ userId: user.id, status: "SUCCESS", amount: user.weeklyBudget });
    } catch (err) {
      results.push({ userId: user.id, status: "FAILED", error: err.message });
    }
  }

  return results;
}

module.exports = { startWeeklyCycleJob, runCycleNow };
