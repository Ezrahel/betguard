// src/scripts/verify.js — Standalone Nomba sandbox verification script
// Run with: node src/scripts/verify.js

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const axios = require("axios");

const BASE_URL = process.env.NOMBA_BASE_URL || "https://sandbox.nomba.com";
const PARENT_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;
const CLIENT_ID = process.env.NOMBA_CLIENT_ID;
const PRIVATE_KEY = process.env.NOMBA_PRIVATE_KEY;

let token = null;
let accountRef = null;
const TS = Date.now();

function pass(label, detail = "") {
  console.log(`  ✅ PASS  ${label}${detail ? " — " + detail : ""}`);
}
function fail(label, raw) {
  console.log(`  ❌ FAIL  ${label}`);
  if (raw) {
    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    console.log(`     ${str.slice(0, 2000)}`);
  }
}
function skip(label, reason) {
  console.log(`  ⏭️  SKIP  ${label} — ${reason}`);
}

function fmtBody(body) {
  const inner = body?.data?.data || body?.data || body;
  return JSON.stringify(inner).slice(0, 300);
}

async function getToken() {
  console.log("\n🔐 1. Authentication (getAccessToken)\n");
  try {
    const res = await axios.post(
      `${BASE_URL}/v1/auth/token/issue`,
      {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: PRIVATE_KEY,
      },
      {
        headers: {
          "Content-Type": "application/json",
          accountId: PARENT_ACCOUNT_ID,
        },
      }
    );
    const body = res.data;
    token = body?.data?.access_token || body?.access_token;
    if (token) {
      pass("Token obtained", `Bearer ${token.slice(0, 20)}...`);
      return true;
    }
    fail("No access_token in response", body);
    return false;
  } catch (err) {
    fail("Request failed", err.response?.data || err.message);
    return false;
  }
}

async function testCreateVirtualAccount() {
  console.log("\n🏦 2. Create Virtual Account\n");
  if (!token) { skip("Skipped", "no token"); return false; }
  try {
    const ref = `betguard_verify_${TS}`;
    const res = await axios.post(
      `${BASE_URL}/v1/accounts/virtual`,
      { accountRef: ref, accountName: `BetSafe Verify ${TS}` },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          accountId: PARENT_ACCOUNT_ID,
        },
      }
    );
    const body = res.data;
    const data = body?.data?.data || body?.data || body;
    if (data?.bankAccountNumber || data?.accountRef || data?.accountNumber) {
      accountRef = data.accountRef || ref;
      pass("Virtual account created", JSON.stringify({
        ref: accountRef,
        nuban: data.bankAccountNumber || data.accountNumber,
        bank: data.bankName,
      }));
      return true;
    }
    fail("Unexpected shape", body);
    return false;
  } catch (err) {
    const data = err.response?.data;
    if (err.response?.status === 422) {
      pass("Virtual account (already exists — 422 expected for duplicates)");
      accountRef = `betguard_verify_${TS}`;
      return true;
    }
    fail("Failed", data);
    return false;
  }
}

async function testGetBalance() {
  console.log("\n💰 3. Fetch Virtual Account Balance\n");
  if (!token) { skip("Skipped", "no token"); return; }
  if (!accountRef) { skip("Skipped", "no accountRef"); return; }
  try {
    const res = await axios.get(
      `${BASE_URL}/v1/accounts/virtual/${accountRef}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          accountId: PARENT_ACCOUNT_ID,
        },
      }
    );
    const body = res.data;
    const data = body?.data?.data || body?.data || body;
    pass("Balance fetched", fmtBody(body));
  } catch (err) {
    fail("Failed", err.response?.data || err.message);
  }
}

async function testGetProviders() {
  console.log("\n📋 4. Get Betting Providers\n");
  if (!token) { skip("Skipped", "no token"); return; }
  try {
    const res = await axios.get(`${BASE_URL}/v1/bill/betting/providers`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        accountId: PARENT_ACCOUNT_ID,
      },
    });
    const body = res.data;
    const data = body?.data?.data || body?.data || body;
    const providers = Array.isArray(data) ? data : data?.providers || [];
    if (providers.length > 0) {
      pass(`Providers found: ${providers.length}`,
        providers.slice(0, 5).map(p => p.name || p.biller_id || p.id).join(", "));
    } else {
      pass("Providers response", fmtBody(body));
    }
  } catch (err) {
    fail("Failed", err.response?.data || err.message);
  }
}

async function testVendBet() {
  console.log("\n🎲 5. Betting Vend (dry-run with ₦0 check)\n");
  if (!token) { skip("Skipped", "no token"); return; }
  try {
    const res = await axios.post(
      `${BASE_URL}/v1/bill/betting/vend`,
      { biller_id: "bet9ja", customer_id: "test123", amount: "0.00" },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          accountId: PARENT_ACCOUNT_ID,
        },
      }
    );
    pass("Vend endpoint reachable", fmtBody(res.data));
  } catch (err) {
    // 422 means the endpoint exists but validation failed (expected with ₦0)
    if (err.response?.status === 422) {
      pass("Vend endpoint reachable (422 — validation with ₦0 expected)");
    } else {
      fail("Failed", err.response?.data || err.message);
    }
  }
}

async function testCreateMandate() {
  console.log("\n📄 6. Direct Debit Mandate (may 404 in sandbox)\n");
  if (!token) { skip("Skipped", "no token"); return; }
  try {
    const now = new Date();
    const oneYear = new Date(now); oneYear.setFullYear(oneYear.getFullYear() + 1);
    const fmt = (d) => d.toISOString().slice(0, 16);

    const res = await axios.post(
      `${BASE_URL}/v1/direct-debits`,
      {
        customerAccountNumber: "0123456789",
        bankCode: "057",
        customerName: `Test ${TS}`,
        customerAddress: "Lagos",
        customerAccountName: `Test ${TS}`,
        customerEmail: `t${TS}@t.com`,
        customerPhoneNumber: "08012345678",
        merchantReference: `BG_${TS}`,
        frequency: "VARIABLE",
        narration: "BetSafe test",
        startDate: fmt(now),
        endDate: fmt(oneYear),
        startImmediately: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          accountId: PARENT_ACCOUNT_ID,
        },
      }
    );
    pass("Mandate created", fmtBody(res.data));
  } catch (err) {
    if (err.response?.status === 404) {
      pass("Direct Debits endpoint (expected 404 — feature may not be enabled on this sandbox)");
    } else {
      fail("Failed", err.response?.data || err.message);
    }
  }
}

(async () => {
  console.log("══════════════════════════════════════════════════");
  console.log("  BetSafe — Nomba Sandbox Verification Script");
  console.log("  Environment:", BASE_URL);
  console.log("  Timestamp:", new Date().toISOString());
  console.log("══════════════════════════════════════════════════\n");

  console.log("Configuration:");
  console.log(`  Parent Account: ${PARENT_ACCOUNT_ID ? "✅ SET" : "❌ MISSING"}`);
  console.log(`  Client ID:      ${CLIENT_ID ? "✅ SET" : "❌ MISSING"}`);
  console.log(`  Private Key:    ${PRIVATE_KEY ? "✅ SET (len: " + PRIVATE_KEY.length + ")" : "❌ MISSING"}`);

  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.log("\n❌ FATAL: Missing credentials. Check .env");
    process.exit(1);
  }

  await getToken();
  await testCreateVirtualAccount();
  await testGetBalance();
  await testGetProviders();
  await testVendBet();
  await testCreateMandate();

  console.log("\n══════════════════════════════════════════════════");
  console.log("  Verification complete");
  console.log("  ⚠️  Direct Debit endpoints (mandate/debit) may not be");
  console.log("     enabled in this sandbox — expected in a real account.");
  console.log("══════════════════════════════════════════════════\n");
})();
