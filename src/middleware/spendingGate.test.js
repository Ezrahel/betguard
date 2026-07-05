// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockGetWallet, mockGetMandate, mockRecordTransaction, mockDaysUntilNextMonday, mockEmit } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetWallet: vi.fn(),
  mockGetMandate: vi.fn(),
  mockRecordTransaction: vi.fn(),
  mockDaysUntilNextMonday: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock("../models/db", () => ({
  getUser: mockGetUser,
  getWallet: mockGetWallet,
  getMandate: mockGetMandate,
  recordTransaction: mockRecordTransaction,
  daysUntilNextMonday: mockDaysUntilNextMonday,
}));

vi.mock("../routes/events", () => ({
  emit: mockEmit,
}));

const { spendingGate } = await import("./spendingGate.js");

function mockReq(overrides = {}) {
  return {
    userId: "user1",
    body: { amount: "1000", billerId: "bet9ja", customerId: "demo123" },
    ...overrides,
  };
}
function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaysUntilNextMonday.mockReturnValue(5);
});

describe("spendingGate", () => {
  it("returns 400 if userId or amount missing", async () => {
    const req = mockReq({ userId: null });
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    const req2 = mockReq({ body: {} });
    const res2 = mockRes();
    await spendingGate(req2, res2, vi.fn());
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 if amount is not a positive number", async () => {
    const req = mockReq({ body: { amount: "-100" } });
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 if user not found", async () => {
    mockGetUser.mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 if wallet not found", async () => {
    mockGetUser.mockResolvedValue({ id: "user1", weeklyBudget: 5000 });
    mockGetWallet.mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 if mandate is not active", async () => {
    mockGetUser.mockResolvedValue({ id: "user1", weeklyBudget: 5000 });
    mockGetWallet.mockResolvedValue({ userId: "user1", weeklySpent: 0 });
    mockGetMandate.mockResolvedValue({ status: "PENDING", adviceStatus: "ADVICE_NOT_SENT" });
    const req = mockReq();
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 if budget would be exceeded", async () => {
    mockGetUser.mockResolvedValue({ id: "user1", weeklyBudget: 5000 });
    mockGetWallet.mockResolvedValue({ userId: "user1", weeklySpent: 4800 });
    mockGetMandate.mockResolvedValue({ status: "ACTIVE", adviceStatus: "ADVICE_SENT" });
    mockRecordTransaction.mockResolvedValue({});

    const req = mockReq({ body: { amount: "500" } });
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockRecordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "BLOCKED", type: "GATE_BLOCK" })
    );
  });

  it("returns 403 if cooldown is active", async () => {
    const recentDate = new Date();
    recentDate.setMinutes(recentDate.getMinutes() - 5);

    mockGetUser.mockResolvedValue({ id: "user1", weeklyBudget: 5000, cooldownMinutes: 10 });
    mockGetWallet.mockResolvedValue({
      userId: "user1", weeklySpent: 0, lastBetAt: recentDate.toISOString(),
    });
    mockGetMandate.mockResolvedValue({ status: "ACTIVE", adviceStatus: "ADVICE_SENT" });
    mockRecordTransaction.mockResolvedValue({});

    const req = mockReq({ body: { amount: "500" } });
    const res = mockRes();
    await spendingGate(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("passes all gates and calls next() with spendContext", async () => {
    mockGetUser.mockResolvedValue({ id: "user1", weeklyBudget: 5000, cooldownMinutes: 0 });
    mockGetWallet.mockResolvedValue({ userId: "user1", weeklySpent: 1000, lastBetAt: null });
    mockGetMandate.mockResolvedValue({ status: "ACTIVE", adviceStatus: "ADVICE_SENT" });

    const req = mockReq({ body: { amount: "500" } });
    const res = mockRes();
    const next = vi.fn();

    await spendingGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.spendContext).toBeDefined();
    expect(req.spendContext.betAmount).toBe(500);
  });

  it("sets budgetWarning when spend >= 80%", async () => {
    mockGetUser.mockResolvedValue({ id: "user1", weeklyBudget: 5000, cooldownMinutes: 0 });
    mockGetWallet.mockResolvedValue({ userId: "user1", weeklySpent: 4000, lastBetAt: null });
    mockGetMandate.mockResolvedValue({ status: "ACTIVE", adviceStatus: "ADVICE_SENT" });

    const req = mockReq({ body: { amount: "100" } });
    const res = mockRes();
    const next = vi.fn();

    await spendingGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.budgetWarning).toBeDefined();
    expect(req.budgetWarning.level).toBe("HIGH");
  });
});
