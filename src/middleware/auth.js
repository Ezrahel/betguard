// src/middleware/auth.js — Supabase JWT verification middleware
// Extracts the user ID from the Authorization Bearer token

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }

  const token = authHeader.slice(7);

  // Create an anon client just to verify the token
  const anonClient = createClient(
    SUPABASE_URL || "http://localhost:54321",
    SUPABASE_ANON_KEY || "placeholder",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  anonClient.auth.getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) {
        return res.status(401).json({ error: "Invalid or expired token." });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: "Token verification failed." });
    });
}

module.exports = { authMiddleware };
