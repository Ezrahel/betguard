// src/routes/webhooks.js — Nomba payment event receiver with SSE emission

const express = require("express");
const db = require("../models/db");
const { emit } = require("./events");

const router = express.Router();

router.post("/nomba", (req, res) => {
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
      const wallet = db.getWallet(userId);
      if (!wallet) break;

      const amount = parseFloat(data.amount);
      console.log(`✅ Wallet topped up for user ${userId}: ₦${amount}`);

      db.recordTransaction({
        userId,
        type: "WALLET_TOPUP",
        amount,
        provider: null,
        customerId: null,
        status: "SUCCESS",
        nombaRef: data.transactionRef || data.reference,
      });

      // Emit SSE
      const updatedWallet = db.getWallet(userId);
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
