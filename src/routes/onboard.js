// src/routes/onboard.js — User signup + mandate creation (auth-protected)
// req.userId is set by authMiddleware

const express = require("express");
const nomba = require("../services/nomba");
const db = require("../models/db");
const { emit } = require("./events");

const router = express.Router();
const ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;

router.post("/", async (req, res) => {
  const userId = req.userId;
  const {
    fullName, phone, weeklyBudget,
    bankAccountNumber, bankCode, address,
  } = req.body;

  if (!fullName || !weeklyBudget || !bankAccountNumber || !bankCode) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (weeklyBudget < 500) {
    return res.status(400).json({ error: "Minimum weekly budget is ₦500." });
  }

  try {
    // Update user profile with onboarding data
    const user = await db.updateUser(userId, {
      fullName, phone,
      weeklyBudget,
    });

    // Create ring-fenced virtual account on Nomba
    let virtualAccount;
    try {
      virtualAccount = await nomba.createVirtualAccount({
        userId,
        userFullName: fullName,
        subAccountId: ACCOUNT_ID,
      });
    } catch (nombaErr) {
      // Log but continue — we can still create the local wallet
      console.error("Nomba virtual account creation failed:", nombaErr.message);
      virtualAccount = null;
    }

    const acctRef = virtualAccount?.accountRef || `betguard_${userId}`;
    const acctNum = virtualAccount?.bankAccountNumber || virtualAccount?.accountNumber || "N/A";

    await db.createWallet({
      userId,
      nombaAccountRef: acctRef,
      nombaBankAccountNumber: acctNum,
    });

    // Create Direct Debit mandate
    let mandateResult;
    try {
      const merchantReference = `BG${Date.now()}`;
      mandateResult = await nomba.createMandate({
        customerAccountNumber: bankAccountNumber,
        bankCode,
        customerName: fullName,
        customerAddress: address || "Nigeria",
        customerEmail: req.userEmail || "",
        customerPhoneNumber: phone || "",
        merchantReference,
        subAccountId: ACCOUNT_ID,
      });
    } catch (nombaErr) {
      console.error("Nomba mandate creation failed:", nombaErr.message);
      mandateResult = null;
    }

    const mandateId = mandateResult?.mandateId || mandateResult?.id || "N/A";
    const mandateDesc = mandateResult?.description || mandateResult?.narration || "Transfer ₦50 to activate your mandate";

    await db.saveMandateRecord({
      userId,
      mandateId,
      merchantReference: `BG${Date.now()}`,
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
  const mandate = await db.getMandate(userId);

  if (!mandate) {
    return res.status(404).json({ error: "No mandate found for this user." });
  }

  try {
    const liveStatus = await nomba.getMandateStatus(mandate.mandateId, ACCOUNT_ID);

    const status = (liveStatus.mandateStatus || liveStatus.status || "").toUpperCase();
    const advice = (liveStatus.mandateAdviceStatus || liveStatus.adviceStatus || "").replace(/[\s-]/g, "_").toUpperCase();

    const prevStatus = mandate.status;
    await db.updateMandateStatus(userId, { status, adviceStatus: advice });

    const isReady = status === "ACTIVE" && advice === "ADVICE_SENT";

    if (isReady && prevStatus !== "ACTIVE") {
      emit(userId, "mandate:ready", {});
    }

    res.json({
      mandateId: mandate.mandateId,
      status,
      adviceStatus: advice,
      isReady,
      message: isReady
        ? "✅ Mandate is active. Your BetSafe wallet is ready!"
        : "⏳ Still waiting for your bank to confirm. Check back in a few hours.",
    });
  } catch (err) {
    console.error("Mandate status error:", err.response?.data || err.message);
    res.status(500).json({ error: "Could not fetch mandate status." });
  }
});

module.exports = router;
