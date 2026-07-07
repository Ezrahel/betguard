// src/services/nomba.js — Nomba API client with flexible response handling

const axios = require("axios");

const BASE_URL = process.env.NOMBA_BASE_URL || "https://sandbox.nomba.com";
const PARENT_ACCOUNT_ID = process.env.NOMBA_PARENT_ACCOUNT_ID;
const CLIENT_ID = process.env.NOMBA_CLIENT_ID;
const PRIVATE_KEY = process.env.NOMBA_PRIVATE_KEY;

let cachedToken = null;
let tokenExpiry = null;

// ─── Safe response extraction ─────────────────────────────────────────────
// Nomba sandbox may return { data: { ... } } or { data: { data: { ... } } }
// or flatten fields differently across endpoints. This helper tries all shapes.

function safeGet(axiosResponse, label = "response") {
  const body = axiosResponse?.data;
  if (!body) {
    console.warn(`[nomba] ⚠️ safeGet("${label}"): no response data`);
    return null;
  }
  // Case 1: { data: { data: { actualFields } } }  (double-wrapped)
  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    const inner = body.data;
    // If inner also has a 'data' field that's an object, unwrap again
    if (inner.data && typeof inner.data === "object" && !Array.isArray(inner.data)) {
      return inner.data;
    }
    return inner;
  }
  // Case 2: { data: [ ... ] } — array at top level
  if (Array.isArray(body.data)) {
    return body.data;
  }
  // Case 3: flat { field: value }
  return body;
}

function logFullResponse(err, context) {
  const data = err?.response?.data || err;
  console.error(`[nomba] ❌ ${context} — full response:`, JSON.stringify(data, null, 2).slice(0, 3000));
}

// ─── Authentication ──────────────────────────────────────────────────────────

async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

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

    const data = safeGet(res, "getAccessToken");
    cachedToken = data?.access_token || res.data?.access_token;
    if (!cachedToken) {
      logFullResponse(res.data, "getAccessToken — no access_token field");
      throw new Error("Authentication failed: no access_token in response");
    }
    tokenExpiry = Date.now() + 55 * 60 * 1000;
    return cachedToken;
  } catch (err) {
    if (err.response) logFullResponse(err, "getAccessToken");
    throw err;
  }
}

function authHeaders(subAccountId = null) {
  return async () => {
    const token = await getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      accountId: subAccountId || PARENT_ACCOUNT_ID,
      "Content-Type": "application/json",
    };
  };
}

// ─── Virtual Accounts ────────────────────────────────────────────────────────

async function createVirtualAccount({ userId, userFullName, subAccountId }) {
  try {
    const headers = await authHeaders(subAccountId)();
    const res = await axios.post(
      `${BASE_URL}/v1/accounts/virtual`,
      {
        accountRef: `betguard_${userId}`,
        accountName: `BetSafe Wallet — ${userFullName}`,
      },
      { headers }
    );
    const data = safeGet(res, "createVirtualAccount");
    if (!data) logFullResponse(res.data, "createVirtualAccount — empty data");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "createVirtualAccount");
    throw err;
  }
}

async function getVirtualAccountBalance(accountRef, subAccountId) {
  try {
    const headers = await authHeaders(subAccountId)();
    const res = await axios.get(
      `${BASE_URL}/v1/accounts/virtual/${accountRef}`,
      { headers }
    );
    const data = safeGet(res, "getVirtualAccountBalance");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "getVirtualAccountBalance");
    throw err;
  }
}

// ─── Direct Debit ────────────────────────────────────────────────────────────

async function createMandate({
  customerAccountNumber, bankCode, customerName, customerAddress,
  customerEmail, customerPhoneNumber, merchantReference, subAccountId,
}) {
  try {
    const headers = await authHeaders(subAccountId)();
    const now = new Date(Date.now() + 120_000); // 2 min buffer for clock drift
    const oneYearLater = new Date(now);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const fmt = (d) => d.toISOString().slice(0, 16);

    const res = await axios.post(
      `${BASE_URL}/v1/direct-debits`,
      {
        customerAccountNumber,
        bankCode,
        customerName,
        customerAddress,
        customerAccountName: customerName,
        customerEmail,
        customerPhoneNumber,
        merchantReference,
        amount: 50,
        frequency: "VARIABLE",
        narration: "BetSafe weekly wallet top-up",
        startDate: fmt(now),
        endDate: fmt(oneYearLater),
        startImmediately: true,
      },
      { headers }
    );
    const data = safeGet(res, "createMandate");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "createMandate");
    throw err;
  }
}

async function getMandateStatus(mandateId, subAccountId) {
  try {
    const headers = await authHeaders(subAccountId)();
    const res = await axios.get(
      `${BASE_URL}/v1/direct-debits/status?mandateId=${mandateId}`,
      { headers }
    );
    const data = safeGet(res, "getMandateStatus");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "getMandateStatus");
    throw err;
  }
}

async function debitMandate(mandateId, amount, subAccountId) {
  try {
    const headers = await authHeaders(subAccountId)();
    const res = await axios.post(
      `${BASE_URL}/v1/direct-debits/debit-mandate`,
      { mandateId, amount: amount.toFixed(2) },
      { headers }
    );
    const data = safeGet(res, "debitMandate");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "debitMandate");
    throw err;
  }
}

// ─── Betting API ─────────────────────────────────────────────────────────────

async function getBettingProviders(subAccountId) {
  try {
    const headers = await authHeaders(subAccountId)();
    const res = await axios.get(`${BASE_URL}/v1/bill/betting/providers`, { headers });
    const data = safeGet(res, "getBettingProviders");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "getBettingProviders");
    throw err;
  }
}

async function getBettingCustomerInfo({ billerId, customerId, subAccountId }) {
  try {
    const headers = await authHeaders(subAccountId)();
    const res = await axios.get(
      `${BASE_URL}/v1/bill/betting/customer-info?biller_id=${billerId}&customer_id=${customerId}`,
      { headers }
    );
    const data = safeGet(res, "getBettingCustomerInfo");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "getBettingCustomerInfo");
    throw err;
  }
}

async function vendBet({ billerId, customerId, amount, subAccountId, payerName, phoneNumber }) {
  try {
    const headers = await authHeaders(subAccountId)();
    const body = {
      biller_id: billerId,
      customer_id: customerId,
      amount: amount.toFixed(2),
    };
    if (payerName) body.payerName = payerName;
    if (phoneNumber) body.phoneNumber = phoneNumber;
    const res = await axios.post(
      `${BASE_URL}/v1/bill/betting/vend`,
      body,
      { headers }
    );
    const data = safeGet(res, "vendBet");
    return data || res.data;
  } catch (err) {
    logFullResponse(err, "vendBet");
    throw err;
  }
}

module.exports = {
  getAccessToken,
  createVirtualAccount,
  getVirtualAccountBalance,
  createMandate,
  getMandateStatus,
  debitMandate,
  getBettingProviders,
  getBettingCustomerInfo,
  vendBet,
};
