// src/middleware/auth.js — Supabase JWT verification middleware
// Extracts the user ID from the Authorization Bearer token

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Cache a single anon client — no need to re-create on every request
let _anonClient = null;
function getAnonClient() {
  if (!_anonClient) {
    _anonClient = createClient(
      SUPABASE_URL || "http://localhost:54321",
      SUPABASE_ANON_KEY || "placeholder",
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
  }
  return _anonClient;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing or invalid Authorization header." });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return res.status(401).json({ success: false, error: "Empty token." });
  }

  getAnonClient()
    .auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error) {
        return res.status(401).json({ success: false, error: `Token verification failed: ${error.message}` });
      }
      if (!data?.user) {
        return res.status(401).json({ success: false, error: "Token valid but no user found." });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email ?? null;
      next();
    })
    .catch((err) => {
      console.error("[auth] Middleware error:", err);
      res.status(401).json({ success: false, error: "Token verification failed." });
    });
}

module.exports = { authMiddleware };
