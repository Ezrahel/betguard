// src/routes/webhooks.js — Nomba payment event receiver with SSE emission (async)

const express = require("express");
const db = require("../models/db");
const { emit } = require("./events");

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function verifyWebhookSecret(req) {
  if (!WEBHOOK_SECRET) return true; // no secret configured — accept all

  const headerSecret = req.headers["x-webhook-secret"] || req.headers["x-nomba-signature"] || "";
  const bodySecret = req.body?.secret || "";

  return headerSecret === WEBHOOK_SECRET || bodySecret === WEBHOOK_SECRET;
}

router.post("/nomba", (req, res) => {
  if (!verifyWebhookSecret(req)) {
    console.warn("📥 Nomba webhook rejected — invalid secret");
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const event = req.body;
  console.log("📥 Nomba webhook received:", JSON.stringify(event, null, 2));

  res.status(200).json({ received: true });

  handleEvent(event).catch((err) =>
    console.error("Webhook handler error:", err.message)
  );
});

async function handleEvent(event) {
  const { type, data } = event;

  switch (type) {
    case "payment.success":
    case "transaction.credit": {
      const ref = data?.accountRef || data?.virtualAccountRef;
      if (!ref) break;

      const userId = ref.replace("betguard_", "");
      const wallet = await db.getWallet(userId);
      if (!wallet) break;

      const amount = parseFloat(data.amount);
      console.log(`✅ Wallet topped up for user ${userId}: ₦${amount}`);

      await db.recordTransaction({
        userId,
        type: "WALLET_TOPUP",
        amount,
        provider: null,
        customerId: null,
        status: "SUCCESS",
        nombaRef: data.transactionRef || data.reference,
      });

      const updatedWallet = await db.getWallet(userId);
      emit(userId, "wallet:topup", {
        amount,
        newBalance: updatedWallet?.weeklyBudget
          ? updatedWallet.weeklyBudget - updatedWallet.weeklySpent
          : null,
      });

      break;
    }

    case "payment.failed":
    case "transaction.debit.failed": {
      const ref = data?.accountRef;
      const userId = ref?.replace("betguard_", "");
      if (userId) {
        console.warn(`⚠️ Wallet top-up failed for user ${userId}`);
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

module.exports = router;
