// src/routes/onboard.js — User signup + mandate creation

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const nomba = require("../services/nomba");
const db = require("../models/db");
const { emit } = require("./events");

const router = express.Router();
const SUB_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

router.post("/", async (req, res) => {
  const {
    fullName, email, phone,
    weeklyBudget,
    bankAccountNumber,
    bankCode,
    address,
  } = req.body;

  if (!fullName || !email || !phone || !weeklyBudget || !bankAccountNumber || !bankCode) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (weeklyBudget < 500) {
    return res.status(400).json({ error: "Minimum weekly budget is ₦500." });
  }

  const userId = uuidv4();

  try {
    const user = db.createUser({ id: userId, fullName, phone, email, weeklyBudget });

    const virtualAccount = await nomba.createVirtualAccount({
      userId,
      userFullName: fullName,
      subAccountId: SUB_ACCOUNT_ID,
    });

    const acctRef = virtualAccount?.accountRef || `betguard_${userId}`;
    const acctNum = virtualAccount?.accountNumber || virtualAccount?.nuban || "N/A";

    db.createWallet({
      userId,
      nombaAccountRef: acctRef,
      nombaBankAccountNumber: acctNum,
    });

    const merchantReference = `BG${Date.now()}`;
    const mandate = await nomba.createMandate({
      customerAccountNumber: bankAccountNumber,
      bankCode,
      customerName: fullName,
      customerAddress: address || "Nigeria",
      customerEmail: email,
      customerPhoneNumber: phone,
      merchantReference,
      subAccountId: SUB_ACCOUNT_ID,
    });

    const mandateId = mandate?.mandateId || mandate?.id || "N/A";
    const mandateDesc = mandate?.description || mandate?.narration || "Transfer ₦50 to activate your mandate";

    db.saveMandateRecord({
      userId,
      mandateId,
      merchantReference,
      description: mandateDesc,
    });

    res.status(201).json({
      success: true,
      userId,
      wallet: {
        accountRef: acctRef,
        accountNumber: acctNum,
        weeklyBudget,
      },
      mandate: {
        mandateId,
        activationInstructions: mandateDesc,
        status: "PENDING",
        note: "Mandate can take up to 72 hours to activate after you send the ₦50 token payment.",
      },
    });
  } catch (err) {
    console.error("Onboarding error:", err.response?.data || err.message);
    res.status(500).json({ error: "Onboarding failed.", detail: err.response?.data || err.message });
  }
});

router.get("/mandate-status/:userId", async (req, res) => {
  const { userId } = req.params;
  const mandate = db.getMandate(userId);

  if (!mandate) {
    return res.status(404).json({ error: "No mandate found for this user." });
  }

  try {
    const liveStatus = await nomba.getMandateStatus(mandate.mandateId, SUB_ACCOUNT_ID);

    const status = (liveStatus.mandateStatus || liveStatus.status || "").toUpperCase();
    const advice = (liveStatus.mandateAdviceStatus || liveStatus.adviceStatus || "").replace(/[\s-]/g, "_").toUpperCase();

    const prevStatus = mandate.status;
    db.updateMandateStatus(userId, { status, adviceStatus: advice });

    const isReady = status === "ACTIVE" && advice === "ADVICE_SENT";

    // Emit SSE if newly activated
    if (isReady && prevStatus !== "ACTIVE") {
      emit(userId, "mandate:ready", {});
    }

    res.json({
      mandateId: mandate.mandateId,
      status,
      adviceStatus: advice,
      isReady,
      message: isReady
        ? "✅ Mandate is active. Your BetGuard wallet is ready!"
        : "⏳ Still waiting for your bank to confirm. Check back in a few hours.",
    });
  } catch (err) {
    console.error("Mandate status error:", err.response?.data || err.message);
    res.status(500).json({ error: "Could not fetch mandate status." });
  }
});

module.exports = router;
