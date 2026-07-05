// src/seed.js — Seed script for BetGuard
// Creates a test user, wallet, mandate, and sample transactions in Supabase.
// Run with: npm run seed

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("🌱 BetGuard seed script\n");

  // Create test user via Supabase Auth
  const testEmail = "test@betguard.demo";
  const testPassword = "test123456";

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
    user_metadata: { full_name: "Demo User" },
  });

  if (authError) {
    // User may already exist — try to look them up
    console.log("⚠️  Auth create failed (may already exist):", authError.message);
    const { data: existing } = await supabase.auth.admin.listUsers();
    const user = existing?.users?.find((u) => u.email === testEmail);
    if (!user) {
      console.error("❌ Could not find or create test user");
      process.exit(1);
    }
    console.log("✅ Using existing auth user:", user.id);
    await seedData(user.id);
  } else {
    console.log("✅ Created auth user:", authData.user.id);
    await seedData(authData.user.id);
  }
}

async function seedData(userId) {
  // Upsert user profile
  const { error: uErr } = await supabase.from("users").upsert({
    id: userId,
    full_name: "Demo User",
    phone: "08012345678",
    email: "test@betguard.demo",
    weekly_budget: 5000,
    cooldown_minutes: 10,
    streak_weeks: 2,
  });
  if (uErr) throw uErr;
  console.log("✅ User profile created");

  // Upsert wallet
  const { error: wErr } = await supabase.from("wallets").upsert({
    user_id: userId,
    nomba_account_ref: `betguard_${userId}`,
    nomba_bank_account_number: "0123456789",
    weekly_spent: 1500,
    total_bets: 3,
    last_bet_at: new Date().toISOString(),
    cycle_start_date: new Date().toISOString(),
  });
  if (wErr) throw wErr;
  console.log("✅ Wallet created (₦1,500 / ₦5,000 spent)");

  // Upsert mandate
  const { error: mErr } = await supabase.from("mandates").upsert({
    user_id: userId,
    mandate_id: `MANDATE_DEMO_${Date.now()}`,
    merchant_reference: `BG_DEMO_${Date.now()}`,
    description: "BetSafe weekly wallet top-up",
    status: "ACTIVE",
    advice_status: "ADVICE_SENT",
  });
  if (mErr) throw mErr;
  console.log("✅ Mandate created (ACTIVE + ADVICE_SENT)");

  // Sample transactions
  const transactions = [
    { user_id: userId, type: "WALLET_TOPUP", amount: 5000, status: "SUCCESS", provider: "", customer_id: "" },
    { user_id: userId, type: "BET_VEND", amount: 500, status: "SUCCESS", provider: "bet9ja", customer_id: "demo123" },
    { user_id: userId, type: "BET_VEND", amount: 1000, status: "SUCCESS", provider: "sportybet", customer_id: "demo456" },
    { user_id: userId, type: "GATE_BLOCK", amount: 99999, status: "BLOCKED", provider: "bet9ja", customer_id: "demo123" },
  ];

  const { error: tErr } = await supabase.from("transactions").insert(transactions);
  if (tErr) throw tErr;
  console.log("✅ 4 sample transactions created (topup, 2 bets, 1 block)");

  console.log(`\n🎉 Seed complete! Sign in with:`);
  console.log(`   Email:    test@betguard.demo`);
  console.log(`   Password: test123456`);
  console.log(`   Budget:   ₦5,000/week (₦1,500 spent — 30%)`);
  console.log(`   Mandate:  ACTIVE — wallet ready\n`);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
