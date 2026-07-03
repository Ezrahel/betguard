// src/routes/events.js — Server-Sent Events for real-time updates
// Supports token via ?token= query param for EventSource compatibility

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const clients = new Map();

function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);

  res.on("close", () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(userId);
    }
  });
}

function emit(userId, event, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch (_) {
      set.delete(res);
    }
  }
}

// GET /api/events/:userId — SSE endpoint (token via ?token= or Authorization header)
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  // Verify token from query param (for EventSource) or Authorization header
  const token = req.query.token || req.headers.authorization?.slice(7);
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const anonClient = createClient(
      SUPABASE_URL || "http://localhost:54321",
      SUPABASE_ANON_KEY || "placeholder",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data?.user || data.user.id !== userId) {
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (_) {
    return res.status(401).json({ error: "Token verification failed" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write(`event: connected\ndata: {}\n\n`);
  addClient(userId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 30000);

  res.on("close", () => {
    clearInterval(heartbeat);
  });
});

module.exports = { router, emit };
