// src/routes/events.js — Server-Sent Events for real-time updates

const express = require("express");
const router = express.Router();

// Map of userId → Set of response objects
const clients = new Map();

function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);

  // Remove on disconnect
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

// GET /api/events/:userId — SSE endpoint
router.get("/:userId", (req, res) => {
  const { userId } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial connection event
  res.write(`event: connected\ndata: {}\n\n`);

  addClient(userId, res);

  // Heartbeat every 30s
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
