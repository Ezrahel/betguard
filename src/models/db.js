// src/models/db.js — Supabase-backed data layer
// All functions are async. Every caller was updated to await them.

const supabase = require("../services/supabase");

// ─── Users ───────────────────────────────────────────────────────────────────

async function createUser({ id, fullName, phone, email, weeklyBudget }) {
  const { data, error } = await supabase
    .from("users")
    .upsert({
      id,
      full_name: fullName,
      phone,
      email,
      weekly_budget: weeklyBudget,
    })
    .select()
    .single();

  if (error) {
    console.error("[db] createUser error:", error);
    throw error;
  }
  return mapUser(data);
}

async function getUser(id) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[db] getUser error:", error);
    return null;
  }
  return data ? mapUser(data) : null;
}

async function updateUser(id, updates) {
  const mapped = {};
  if (updates.fullName !== undefined) mapped.full_name = updates.fullName;
  if (updates.phone !== undefined) mapped.phone = updates.phone;
  if (updates.email !== undefined) mapped.email = updates.email;
  if (updates.weeklyBudget !== undefined) mapped.weekly_budget = updates.weeklyBudget;
  if (updates.cooldownMinutes !== undefined) mapped.cooldown_minutes = updates.cooldownMinutes;
  if (updates.streakWeeks !== undefined) mapped.streak_weeks = updates.streakWeeks;

  if (Object.keys(mapped).length === 0) return null;

  const { data, error } = await supabase
    .from("users")
    .update(mapped)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[db] updateUser error:", error);
    return null;
  }
  return data ? mapUser(data) : null;
}

async function getAllUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[db] getAllUsers error:", error);
    return [];
  }
  return (data || []).map(mapUser);
}

// ─── Wallets ─────────────────────────────────────────────────────────────────

async function createWallet({ userId, nombaAccountRef, nombaBankAccountNumber }) {
  const { data, error } = await supabase
    .from("wallets")
    .insert({
      user_id: userId,
      nomba_account_ref: nombaAccountRef || "",
      nomba_bank_account_number: nombaBankAccountNumber || "",
      cycle_start_date: mondayOfThisWeek(),
    })
    .select()
    .single();

  if (error) {
    console.error("[db] createWallet error:", error);
    throw error;
  }
  return mapWallet(data);
}

async function getWallet(userId) {
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db] getWallet error:", error);
    return null;
  }
  return data ? mapWallet(data) : null;
}

async function incrementSpend(userId, amount) {
  const wallet = await getWallet(userId);
  if (!wallet) return null;

  const { data, error } = await supabase
    .from("wallets")
    .update({
      weekly_spent: wallet.weeklySpent + amount,
      total_bets: wallet.totalBets + 1,
      last_bet_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[db] incrementSpend error:", error);
    return null;
  }
  return data ? mapWallet(data) : null;
}

async function resetWeeklyCycle(userId) {
  const { data, error } = await supabase
    .from("wallets")
    .update({
      weekly_spent: 0,
      cycle_start_date: mondayOfThisWeek(),
    })
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[db] resetWeeklyCycle error:", error);
    return null;
  }
  return data ? mapWallet(data) : null;
}

// ─── Mandates ────────────────────────────────────────────────────────────────

async function saveMandateRecord({ userId, mandateId, merchantReference, description }) {
  // Use upsert atomic pattern — no separate delete needed
  const { data, error } = await supabase
    .from("mandates")
    .upsert({
      user_id: userId,
      mandate_id: mandateId || "",
      merchant_reference: merchantReference || "",
      description: description || "",
      status: "PENDING",
      advice_status: "ADVICE_NOT_SENT",
    }, { onConflict: "user_id" })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[db] saveMandateRecord error:", error);
    throw error;
  }
  return data ? mapMandate(data) : null;
}

async function getMandate(userId) {
  const { data, error } = await supabase
    .from("mandates")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db] getMandate error:", error);
    return null;
  }
  return data ? mapMandate(data) : null;
}

async function updateMandateStatus(userId, { status, adviceStatus }) {
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (adviceStatus !== undefined) updates.advice_status = adviceStatus;

  if (Object.keys(updates).length === 0) return null;

  const { data, error } = await supabase
    .from("mandates")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[db] updateMandateStatus error:", error);
    return null;
  }
  return data ? mapMandate(data) : null;
}

async function getAllMandates() {
  const { data, error } = await supabase
    .from("mandates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[db] getAllMandates error:", error);
    return [];
  }
  return (data || []).map(mapMandate);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

async function recordTransaction({ userId, type, amount, provider, customerId, status, nombaRef }) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type,
      amount: amount || 0,
      provider: provider || "",
      customer_id: customerId || "",
      status: status || "SUCCESS",
      nomba_ref: nombaRef || "",
    })
    .select()
    .single();

  if (error) {
    console.error("[db] recordTransaction error:", error);
    throw error;
  }
  return mapTransaction(data);
}

async function getUserTransactions(userId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[db] getUserTransactions error:", error);
    return [];
  }
  return (data || []).map(mapTransaction);
}

async function getAllTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[db] getAllTransactions error:", error);
    return [];
  }
  return (data || []).map(mapTransaction);
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

async function getUserCount() {
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("[db] getUserCount error:", error);
    return 0;
  }
  return count || 0;
}

async function flush() {
  // No-op with Supabase — writes are immediate
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    weeklyBudget: Number(row.weekly_budget),
    cooldownMinutes: row.cooldown_minutes || 0,
    streakWeeks: row.streak_weeks || 0,
    createdAt: row.created_at,
  };
}

function mapWallet(row) {
  return {
    userId: row.user_id,
    nombaAccountRef: row.nomba_account_ref,
    nombaBankAccountNumber: row.nomba_bank_account_number,
    weeklySpent: Number(row.weekly_spent),
    cycleStartDate: row.cycle_start_date,
    totalBets: row.total_bets || 0,
    lastBetAt: row.last_bet_at,
    createdAt: row.created_at,
  };
}

function mapMandate(row) {
  return {
    userId: row.user_id,
    mandateId: row.mandate_id,
    merchantReference: row.merchant_reference,
    description: row.description,
    status: row.status,
    adviceStatus: row.advice_status,
    createdAt: row.created_at,
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: Number(row.amount),
    provider: row.provider,
    customerId: row.customer_id,
    status: row.status,
    nombaRef: row.nomba_ref,
    createdAt: row.created_at,
  };
}

module.exports = {
  createUser, getUser, updateUser, getAllUsers,
  createWallet, getWallet, incrementSpend, resetWeeklyCycle,
  saveMandateRecord, getMandate, updateMandateStatus, getAllMandates,
  recordTransaction, getUserTransactions, getAllTransactions,
  daysUntilNextMonday, getUserCount, flush,
};
