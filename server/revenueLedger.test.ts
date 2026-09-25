import { describe, expect, it } from "vitest";
import {
  allocateLargestRemainder,
  allocateUnearnedRefund,
  availableBalance,
  calculatePlatformFee,
  earnedToDate,
  transitionPayout,
} from "./revenueLedger";

describe("exact instructor revenue ledger rules", () => {
  it("calculates the platform fee using half-up integer arithmetic", () => {
    expect(calculatePlatformFee(101, 500)).toBe(BigInt(5));
    expect(calculatePlatformFee(100, 500)).toBe(BigInt(5));
    expect(calculatePlatformFee(999, 10_000)).toBe(BigInt(999));
    expect(calculatePlatformFee(999, 0)).toBe(BigInt(0));
  });

  it("allocates odd minor units by largest remainder then instructor ID", () => {
    const rows = allocateLargestRemainder(10_000, [
      { instructorId: 12, weight: 1 },
      { instructorId: 11, weight: 1 },
      { instructorId: 10, weight: 1 },
    ]);
    expect(rows.map((row) => [row.instructorId, row.amountMinor])).toEqual([
      [10, BigInt(3334)], [11, BigInt(3333)], [12, BigInt(3333)],
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountMinor, BigInt(0))).toBe(BigInt(10_000));
  });

  it("supports weighted allocation and preserves the full distributable amount", () => {
    const rows = allocateLargestRemainder(101, [
      { instructorId: 2, weight: 2 },
      { instructorId: 1, weight: 1 },
    ]);
    expect(rows.map((row) => row.amountMinor)).toEqual([BigInt(34), BigInt(67)]);
    expect(rows.reduce((sum, row) => sum + row.amountMinor, BigInt(0))).toBe(BigInt(101));
  });

  it("recognizes straight-line earned value by UTC calendar day", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-11T00:00:00Z");
    expect(earnedToDate(10_000, start, end, new Date("2025-12-31T22:00:00Z"))).toBe(BigInt(0));
    expect(earnedToDate(10_000, start, end, new Date("2026-01-06T19:00:00Z"))).toBe(BigInt(5000));
    expect(earnedToDate(10_000, start, end, end)).toBe(BigInt(10_000));
    expect(earnedToDate(10_000, start, end, new Date("2026-02-01T00:00:00Z"))).toBe(BigInt(10_000));
  });

  it("caps mid-term refunds at remaining unearned allocations", () => {
    const rows = allocateUnearnedRefund(30, [
      { instructorId: 1, allocatedMinor: 100, earnedMinor: 50, refundedMinor: 0 },
      { instructorId: 2, allocatedMinor: 100, earnedMinor: 0, refundedMinor: 0 },
    ]);
    expect(rows.map((row) => row.amountMinor)).toEqual([BigInt(10), BigInt(20)]);
    expect(() => allocateUnearnedRefund(151, [
      { instructorId: 1, allocatedMinor: 100, earnedMinor: 50, refundedMinor: 0 },
      { instructorId: 2, allocatedMinor: 100, earnedMinor: 0, refundedMinor: 0 },
    ])).toThrow(/unearned/);
  });

  it("keeps reservations on timeout/unknown and only releases on a definitive failure", () => {
    expect(transitionPayout("PROCESSING", "TIMEOUT_AFTER_SUCCESS")).toEqual({
      state: "VERIFY", reservation: "KEEP", retryProviderWithSameKey: true,
    });
    expect(transitionPayout("VERIFY", "STATUS_UNKNOWN").reservation).toBe("KEEP");
    expect(transitionPayout("VERIFY", "STATUS_SUCCEEDED").reservation).toBe("SETTLE");
    expect(transitionPayout("PROCESSING", "PERMANENT_FAILURE").reservation).toBe("RELEASE");
    expect(transitionPayout("SUCCEEDED", "SUCCESS").retryProviderWithSameKey).toBe(false);
  });

  it("computes available balance without allowing negative reservations", () => {
    expect(availableBalance(8_200, 4_200, 500)).toBe(BigInt(3500));
    expect(() => availableBalance(1_000, 800, 300)).toThrow(/exceed earned/);
  });
});
