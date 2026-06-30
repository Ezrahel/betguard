// src/models/db.js — File-backed persistent store
// Loads from data/db.json on startup, writes on every mutation
// Exported function signatures match the original in-memory store exactly

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// ─── Internal state (loaded from / written to file) ─────────────────────────
let state = {
  users: [],       // array of user objects
  wallets: [],     // array of wallet objects
  mandates: [],    // array of mandate objects
  transactions: [],// array of transaction objects
};

// ─── File I/O helpers ───────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromFile() {
  ensureDataDir();
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      state = {
        users: parsed.users || [],
        wallets: parsed.wallets || [],
        mandates: parsed.mandates || [],
        transactions: parsed.transactions || [],
      };
      console.log(`[db] Loaded ${state.users.length} users, ${state.transactions.length} transactions`);
    } else {
      console.log("[db] No db.json found — starting fresh");
    }
  } catch (err) {
    console.error("[db] Corrupt db.json — starting fresh:", err.message);
    state = { users: [], wallets: [], mandates: [], transactions: [] };
  }
}

function flush() {
  ensureDataDir();
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, DB_PATH);
}

function save() {
  flush();
}

// Load on startup
loadFromFile();

// ─── Users ───────────────────────────────────────────────────────────────────

function createUser({ id, fullName, phone, email, weeklyBudget }) {
  const user = {
    id,
    fullName,
    phone,
    email,
    weeklyBudget,
    cooldownMinutes: 0,
    streakWeeks: 0,
    createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  save();
  return user;
}

function getUser(id) {
  return state.users.find((u) => u.id === id) || null;
}

function updateUser(id, updates) {
  const user = state.users.find((u) => u.id === id);
  if (!user) return null;
  Object.assign(user, updates);
  save();
  return user;
}

function getAllUsers() {
  return state.users;
}

// ─── Wallets ─────────────────────────────────────────────────────────────────

function createWallet({ userId, nombaAccountRef, nombaBankAccountNumber }) {
  const wallet = {
    userId,
    nombaAccountRef,
    nombaBankAccountNumber,
    weeklySpent: 0,
    cycleStartDate: mondayOfThisWeek(),
    totalBets: 0,
    lastBetAt: null,
    createdAt: new Date().toISOString(),
  };
  state.wallets.push(wallet);
  save();
  return wallet;
}

function getWallet(userId) {
  return state.wallets.find((w) => w.userId === userId) || null;
}

function incrementSpend(userId, amount) {
  const wallet = state.wallets.find((w) => w.userId === userId);
  if (!wallet) return null;
  wallet.weeklySpent += amount;
  wallet.totalBets += 1;
  wallet.lastBetAt = new Date().toISOString();
  save();
  return wallet;
}

function resetWeeklyCycle(userId) {
  const wallet = state.wallets.find((w) => w.userId === userId);
  if (!wallet) return null;
  wallet.weeklySpent = 0;
  wallet.cycleStartDate = mondayOfThisWeek();
  save();
  return wallet;
}

// ─── Mandates ────────────────────────────────────────────────────────────────

function saveMandateRecord({ userId, mandateId, merchantReference, description }) {
  const record = {
    userId,
    mandateId,
    merchantReference,
    description,
    status: "PENDING",
    adviceStatus: "ADVICE_NOT_SENT",
    createdAt: new Date().toISOString(),
  };
  // Remove old record for same userId if exists
  const idx = state.mandates.findIndex((m) => m.userId === userId);
  if (idx >= 0) state.mandates.splice(idx, 1);
  state.mandates.push(record);
  save();
  return record;
}

function getMandate(userId) {
  return state.mandates.find((m) => m.userId === userId) || null;
}

function updateMandateStatus(userId, { status, adviceStatus }) {
  const record = state.mandates.find((m) => m.userId === userId);
  if (!record) return null;
  if (status !== undefined) record.status = status;
  if (adviceStatus !== undefined) record.adviceStatus = adviceStatus;
  save();
  return record;
}

function getAllMandates() {
  return state.mandates;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

function recordTransaction({ userId, type, amount, provider, customerId, status, nombaRef }) {
  const tx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    type,
    amount,
    provider,
    customerId,
    status,
    nombaRef,
    createdAt: new Date().toISOString(),
  };
  state.transactions.push(tx);
  save();
  return tx;
}

function getUserTransactions(userId) {
  return state.transactions.filter((t) => t.userId === userId);
}

function getAllTransactions() {
  return state.transactions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mondayOfThisWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysUntilNextMonday() {
  const now = new Date();
  const day = now.getDay();
  return day === 0 ? 1 : 8 - day;
}

function getUserCount() {
  return state.users.length;
}

module.exports = {
  createUser, getUser, updateUser, getAllUsers,
  createWallet, getWallet, incrementSpend, resetWeeklyCycle,
  saveMandateRecord, getMandate, updateMandateStatus, getAllMandates,
  recordTransaction, getUserTransactions, getAllTransactions,
  daysUntilNextMonday, getUserCount, flush,
};
