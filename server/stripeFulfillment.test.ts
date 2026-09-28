import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { courseEnrollments, courseOrders, stripeCheckoutAttempts } from "../drizzle/schema";
import { reconcileCourseCheckoutSession } from "./stripeFulfillment";

const order = {
  orderId: "123e4567-e89b-12d3-a456-426614174000", userId: 42, courseId: 1,
  stripeSessionId: "cs_test_session_123", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_session_123",
  checkoutAttempts: 1, expiresAt: new Date(Date.now() + 60_000), amountMinor: 18_900,
  platformFeeBps: 1_000, platformFeeMinor: 1_890, instructorShareMinor: 17_010,
  currency: "sar", status: "pending" as const, createdAt: new Date(), paidAt: null,
};
const attempt = {
  id: 1, orderId: order.orderId, attemptNo: 1, idempotencyKey: "course-order:order-1:attempt:1",
  stripeSessionId: order.stripeSessionId, checkoutUrl: order.checkoutUrl, status: "pending" as const,
  expiresAt: order.expiresAt, createdAt: new Date(),
};
const paidSession = {
  id: order.stripeSessionId, object: "checkout.session", livemode: false, mode: "payment",
  payment_status: "paid", status: "complete", amount_total: order.amountMinor, currency: "sar",
  client_reference_id: String(order.userId),
  metadata: { orderId: order.orderId, userId: String(order.userId), courseId: String(order.courseId) },
} as unknown as Stripe.Checkout.Session;

function createDatabase(attemptRow = attempt) {
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const enrollments: unknown[] = [];
  const select = () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === stripeCheckoutAttempts ? [attemptRow] : [] }) }) });
  const transaction = async (run: (tx: any) => Promise<void>) => run({
    update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => { updates.push({ table, values }); } }) }),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      if (table === courseEnrollments) enrollments.push(values);
      return { onDuplicateKeyUpdate: async () => undefined };
    } }),
  });
  return { select, transaction, updates, enrollments };
}

describe("API-verified Checkout Session fulfillment", () => {
  it("atomically records payment and grants the matching course once", async () => {
    const db = createDatabase();
    await expect(reconcileCourseCheckoutSession(db as never, paidSession, order)).resolves.toBe("paid");
    expect(db.updates).toContainEqual({ table: courseOrders, values: expect.objectContaining({ status: "paid", paidAt: expect.any(Date) }) });
    expect(db.updates).toContainEqual({ table: stripeCheckoutAttempts, values: { status: "paid" } });
    expect(db.enrollments).toEqual([{ userId: 42, courseId: 1, orderId: order.orderId }]);
  });

  it("does not grant access while payment is unpaid or still processing", async () => {
    const db = createDatabase();
    const session = { ...paidSession, payment_status: "unpaid", status: "complete" } as Stripe.Checkout.Session;
    await expect(reconcileCourseCheckoutSession(db as never, session, order)).resolves.toBe("pending");
    expect(db.updates).toHaveLength(0);
    expect(db.enrollments).toHaveLength(0);
  });

  it("rejects live-mode, amount-mismatched, or wrong-user Sessions without mutations", async () => {
    for (const change of [{ livemode: true }, { amount_total: 1 }, { client_reference_id: "99" }]) {
      const db = createDatabase();
      await expect(reconcileCourseCheckoutSession(db as never, { ...paidSession, ...change } as Stripe.Checkout.Session, order)).resolves.toBe("mismatch");
      expect(db.updates).toHaveLength(0);
      expect(db.enrollments).toHaveLength(0);
    }
  });

  it("marks an unpaid expired Session and attempt expired without enrolling", async () => {
    const db = createDatabase();
    const session = { ...paidSession, payment_status: "unpaid", status: "expired" } as Stripe.Checkout.Session;
    await expect(reconcileCourseCheckoutSession(db as never, session, order)).resolves.toBe("expired");
    expect(db.updates).toContainEqual({ table: courseOrders, values: { status: "expired" } });
    expect(db.updates).toContainEqual({ table: stripeCheckoutAttempts, values: { status: "expired" } });
    expect(db.enrollments).toHaveLength(0);
  });
});
