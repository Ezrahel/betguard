// src/jobs/mandatePoller.js — Polls Nomba every 15m for pending mandate status (async)

const cron = require("node-cron");
const nomba = require("../services/nomba");
const db = require("../models/db");

const SUB_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

function startMandatePoller() {
  cron.schedule("*/15 * * * *", async () => {
    console.log("[mandatePoller] Checking pending mandates...");
    const allMandates = await db.getAllMandates();
    let activated = 0;

    for (const record of allMandates) {
      if (record.status === "ACTIVE" && record.adviceStatus === "ADVICE_SENT") {
        continue;
      }

      try {
        const liveStatus = await nomba.getMandateStatus(record.mandateId, SUB_ACCOUNT_ID);
        const status = (liveStatus.mandateStatus || liveStatus.status || "").toUpperCase();
        const advice = (liveStatus.mandateAdviceStatus || liveStatus.adviceStatus || "").replace(/[\s-]/g, "_").toUpperCase();

        const prevStatus = record.status;
        await db.updateMandateStatus(record.userId, { status, adviceStatus: advice });

        if (status === "ACTIVE" && advice === "ADVICE_SENT" && prevStatus !== "ACTIVE") {
          console.log(`✅ Mandate activated for ${record.userId}`);
          activated++;
        }
      } catch (err) {
        console.error(`[mandatePoller] Error checking mandate ${record.mandateId}:`, err.message);
      }
    }

    if (activated > 0) {
      console.log(`[mandatePoller] ${activated} mandate(s) activated this cycle`);
    }
  });

  console.log("⏰ Mandate poller scheduled (every 15 minutes)");
}

module.exports = { startMandatePoller };
