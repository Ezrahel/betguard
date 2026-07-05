import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/db", () => {
  const _users = {};
  const _wallets = {};
  const _mandates = {};
  const _transactions = {};
  return {
    __setMockData: (d) => {
      Object.assign(_users, d?.users || {});
      Object.assign(_wallets, d?.wallets || {});
      Object.assign(_mandates, d?.mandates || {});
      Object.assign(_transactions, d?.transactions || {});
    },
    __resetMockData: () => {
      Object.keys(_users).forEach(k => delete _users[k]);
      Object.keys(_wallets).forEach(k => delete _wallets[k]);
      Object.keys(_mandates).forEach(k => delete _mandates[k]);
      Object.keys(_transactions).forEach(k => delete _transactions[k]);
    },
    getUser: (id) => Promise.resolve(_users[id] || null),
    getWallet: (u) => Promise.resolve(_wallets[u] || null),
    getMandate: (u) => Promise.resolve(_mandates[u] || null),
    getUserTransactions: (u) => Promise.resolve(_transactions[u] || []),
    getAllUsers: () => Promise.resolve(Object.values(_users)),
    getAllMandates: () => Promise.resolve(Object.values(_mandates)),
    getUserCount: () => Promise.resolve(Object.keys(_users).length),
    createUser: (u) => Promise.resolve(u),
    updateUser: (id, u) => { if (_users[id]) Object.assign(_users[id], u); return Promise.resolve(_users[id] || null); },
    createWallet: (w) => Promise.resolve({ ...w, weeklySpent: 0, totalBets: 0, lastBetAt: null }),
    incrementSpend: (u, a) => { const w = _wallets[u]; if (w) { w.weeklySpent += a; w.totalBets += 1; } return Promise.resolve(w || null); },
    resetWeeklyCycle: (u) => { const w = _wallets[u]; if (w) w.weeklySpent = 0; return Promise.resolve(w || null); },
    saveMandateRecord: (m) => Promise.resolve(m),
    updateMandateStatus: (u, { status, adviceStatus }) => { const m = _mandates[u]; if (m) { if (status) m.status = status; if (adviceStatus) m.adviceStatus = adviceStatus; } return Promise.resolve(m || null); },
    recordTransaction: (tx) => Promise.resolve(tx),
    getAllTransactions: () => Promise.resolve(Object.values(_transactions).flat()),
    daysUntilNextMonday: () => 5,
    flush: () => Promise.resolve(),
  };
});

import { computeInsights } from "./insights.js";
import * as db from "../models/db.js";

beforeEach(() => {
  db.__resetMockData();
});

describe("computeInsights", () => {
  it("returns null when user not found", async () => {
    expect(await computeInsights("nonexistent")).toBeNull();
  });

  it("returns LOW risk when spend is under 50%", async () => {
    db.__setMockData({ users: { u1: { id: "u1", weeklyBudget: 10000, streakWeeks: 1 } }, wallets: { u1: { userId: "u1", weeklySpent: 1000, totalBets: 2 } } });
    const r = await computeInsights("u1");
    expect(r.riskScore).toBe("LOW");
  });

  it("returns HIGH risk when spend exceeds 80%", async () => {
    db.__setMockData({ users: { u1: { id: "u1", weeklyBudget: 10000, streakWeeks: 0 } }, wallets: { u1: { userId: "u1", weeklySpent: 9000, totalBets: 5 } } });
    const r = await computeInsights("u1");
    expect(r.riskScore).toBe("HIGH");
  });

  it("returns weeklyBudget and weeklySpent", async () => {
    db.__setMockData({ users: { u1: { id: "u1", weeklyBudget: 20000, streakWeeks: 0 } }, wallets: { u1: { userId: "u1", weeklySpent: 5000, totalBets: 0 } } });
    const r = await computeInsights("u1");
    expect(r.weeklyBudget).toBe(20000);
    expect(r.weeklySpent).toBe(5000);
  });
});
