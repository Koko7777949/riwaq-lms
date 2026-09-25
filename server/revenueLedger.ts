export type Participant = { instructorId: number; weight: number | bigint };
export type Allocation = { instructorId: number; amountMinor: bigint; remainder: bigint };

function nonNegativeInteger(value: number | bigint, label: string): bigint {
  const asBigInt = typeof value === "bigint" ? value : Number.isSafeInteger(value) ? BigInt(value) : -BigInt(1);
  if (asBigInt < BigInt(0)) throw new RangeError(`${label} must be a non-negative safe integer`);
  return asBigInt;
}

/** Integer half-up fee calculation; all money is in minor units, fee in basis points. */
export function calculatePlatformFee(grossMinor: number | bigint, feeBps: number): bigint {
  const gross = nonNegativeInteger(grossMinor, "grossMinor");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new RangeError("feeBps must be an integer from 0 through 10000");
  }
  return (gross * BigInt(feeBps) + BigInt(5000)) / BigInt(10000);
}

/** Deterministic proportional allocation. Equal remainders are settled by ascending instructor ID. */
export function allocateLargestRemainder(totalMinor: number | bigint, participants: Participant[]): Allocation[] {
  const total = nonNegativeInteger(totalMinor, "totalMinor");
  if (participants.length === 0) {
    if (total === BigInt(0)) return [];
    throw new RangeError("At least one participant is required for a non-zero allocation");
  }
  const seen = new Set<number>();
  const normalized = participants.map((participant) => {
    if (!Number.isSafeInteger(participant.instructorId) || participant.instructorId < 0) {
      throw new RangeError("instructorId must be a non-negative safe integer");
    }
    if (seen.has(participant.instructorId)) throw new RangeError("instructorId values must be unique");
    seen.add(participant.instructorId);
    const weight = nonNegativeInteger(participant.weight, "weight");
    if (weight === BigInt(0)) throw new RangeError("weight must be positive");
    return { instructorId: participant.instructorId, weight };
  });
  const totalWeight = normalized.reduce((sum, participant) => sum + participant.weight, BigInt(0));
  const rows = normalized.map(({ instructorId, weight }) => {
    const numerator = total * weight;
    return { instructorId, amountMinor: numerator / totalWeight, remainder: numerator % totalWeight };
  });
  const baseTotal = rows.reduce((sum, row) => sum + row.amountMinor, BigInt(0));
  const centsLeft = total - baseTotal;
  const order = [...rows].sort((a, b) => a.remainder === b.remainder ? a.instructorId - b.instructorId : a.remainder > b.remainder ? -1 : 1);
  for (let i = BigInt(0); i < centsLeft; i += BigInt(1)) {
    const recipient = order[Number(i % BigInt(order.length))];
    if (recipient) recipient.amountMinor += BigInt(1);
  }
  return rows.sort((a, b) => a.instructorId - b.instructorId);
}

function utcDay(timestamp: Date): number {
  if (Number.isNaN(timestamp.getTime())) throw new RangeError("Invalid date");
  return Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate());
}

/** Straight-line recognition in UTC calendar days over the half-open [start,end) interval. */
export function earnedToDate(allocatedMinor: number | bigint, start: Date, end: Date, asOf: Date): bigint {
  const allocated = nonNegativeInteger(allocatedMinor, "allocatedMinor");
  const startDay = utcDay(start);
  const endDay = utcDay(end);
  const asOfDay = utcDay(asOf);
  const termDays = BigInt(Math.floor((endDay - startDay) / 86_400_000));
  if (termDays <= BigInt(0)) throw new RangeError("Term must be at least one UTC calendar day");
  const elapsedMs = Math.max(0, Math.min(endDay, asOfDay) - startDay);
  const elapsedDays = BigInt(Math.floor(elapsedMs / 86_400_000));
  return (allocated * elapsedDays) / termDays;
}

/** Allocates a refund only against each instructor's still-unearned share. */
export function allocateUnearnedRefund(
  refundMinor: number | bigint,
  allocations: Array<{ instructorId: number; allocatedMinor: number | bigint; earnedMinor: number | bigint; refundedMinor: number | bigint }>,
): Allocation[] {
  const refund = nonNegativeInteger(refundMinor, "refundMinor");
  const remaining = allocations.map((row) => {
    const allocated = nonNegativeInteger(row.allocatedMinor, "allocatedMinor");
    const earned = nonNegativeInteger(row.earnedMinor, "earnedMinor");
    const refunded = nonNegativeInteger(row.refundedMinor, "refundedMinor");
    if (earned + refunded > allocated) throw new RangeError("Earned and refunded amounts cannot exceed original allocation");
    return { instructorId: row.instructorId, weight: allocated - earned - refunded };
  }).filter((row) => row.weight > BigInt(0));
  const pool = remaining.reduce((sum, row) => sum + row.weight, BigInt(0));
  if (refund > pool) throw new RangeError("Refund exceeds the remaining unearned instructor allocation");
  if (refund === BigInt(0)) return [];
  return allocateLargestRemainder(refund, remaining);
}

export type PayoutState = "PENDING" | "PROCESSING" | "VERIFY" | "SUCCEEDED" | "FAILED";
export type ProviderOutcome = "SUCCESS" | "PERMANENT_FAILURE" | "TIMEOUT_AFTER_SUCCESS" | "STATUS_UNKNOWN" | "STATUS_SUCCEEDED" | "STATUS_FAILED";
export type PayoutTransition = { state: PayoutState; reservation: "KEEP" | "SETTLE" | "RELEASE"; retryProviderWithSameKey: boolean };

/** A timeout never proves that money did not move; VERIFY keeps funds reserved. */
export function transitionPayout(state: PayoutState, outcome: ProviderOutcome): PayoutTransition {
  if (state === "SUCCEEDED" || state === "FAILED") return { state, reservation: "KEEP", retryProviderWithSameKey: false };
  if (outcome === "TIMEOUT_AFTER_SUCCESS" || outcome === "STATUS_UNKNOWN") return { state: "VERIFY", reservation: "KEEP", retryProviderWithSameKey: true };
  if (outcome === "SUCCESS" || outcome === "STATUS_SUCCEEDED") return { state: "SUCCEEDED", reservation: "SETTLE", retryProviderWithSameKey: false };
  if (outcome === "PERMANENT_FAILURE" || outcome === "STATUS_FAILED") return { state: "FAILED", reservation: "RELEASE", retryProviderWithSameKey: false };
  return { state, reservation: "KEEP", retryProviderWithSameKey: true };
}

export function availableBalance(earnedMinor: number | bigint, paidMinor: number | bigint, reservedMinor: number | bigint): bigint {
  const available = nonNegativeInteger(earnedMinor, "earnedMinor")
    - nonNegativeInteger(paidMinor, "paidMinor")
    - nonNegativeInteger(reservedMinor, "reservedMinor");
  if (available < BigInt(0)) throw new RangeError("Paid and reserved balances cannot exceed earned balance");
  return available;
}
