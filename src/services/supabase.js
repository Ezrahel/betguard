// src/services/supabase.js — Supabase admin client (server-side only)
// Uses service_role key to bypass RLS for server-to-server operations
// Routes verify user identity via JWT auth middleware instead

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn(
    "[supabase] ⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. " +
    "Set them in .env or the app will fail on DB calls."
  );
}

const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_SERVICE_KEY || "placeholder",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = supabase;
