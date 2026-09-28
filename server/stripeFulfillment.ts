import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { courseEnrollments, courseOrders, stripeCheckoutAttempts } from "../drizzle/schema";
import type { getDb } from "./db";
import { getPaidCourse, isCourseCheckoutSession, isPaidCourseCheckoutSession } from "./stripeLogic";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ReconciliationResult = "paid" | "pending" | "expired" | "mismatch";

/**
 * Reconcile a server-fetched Stripe Checkout Session against the owned order.
 * This function never trusts browser-provided payment status or URL parameters.
 */
export async function reconcileCourseCheckoutSession(
  db: Database,
  session: Stripe.Checkout.Session,
  order: typeof courseOrders.$inferSelect,
): Promise<ReconciliationResult> {
  const attempt = await db.select().from(stripeCheckoutAttempts)
    .where(eq(stripeCheckoutAttempts.stripeSessionId, session.id))
    .limit(1);
  const course = getPaidCourse(order.courseId);
  if (!attempt[0] || attempt[0].orderId !== order.orderId || !course
    || order.amountMinor !== course.amountMinor
    || order.platformFeeBps !== course.platformFeeBps
    || order.platformFeeMinor !== course.platformFeeMinor
    || order.instructorShareMinor !== course.instructorShareMinor
    || order.currency.toLowerCase() !== "sar"
    || !isCourseCheckoutSession(session, {
      orderId: order.orderId,
      userId: order.userId,
      courseId: order.courseId,
      stripeSessionId: order.stripeSessionId,
      amountMinor: order.amountMinor,
      currency: order.currency,
    })) return "mismatch";

  if (isPaidCourseCheckoutSession(session, {
    orderId: order.orderId,
    userId: order.userId,
    courseId: order.courseId,
    stripeSessionId: order.stripeSessionId,
    amountMinor: order.amountMinor,
    currency: order.currency,
  })) {
    await db.transaction(async (tx) => {
      await tx.update(courseOrders).set({ status: "paid", paidAt: new Date() })
        .where(eq(courseOrders.orderId, order.orderId));
      await tx.update(stripeCheckoutAttempts).set({ status: "paid" })
        .where(eq(stripeCheckoutAttempts.stripeSessionId, session.id));
      await tx.insert(courseEnrollments).values({
        userId: order.userId,
        courseId: order.courseId,
        orderId: order.orderId,
      }).onDuplicateKeyUpdate({ set: { orderId: order.orderId } });
    });
    return "paid";
  }

  if (session.status === "expired" && session.payment_status !== "paid") {
    await db.transaction(async (tx) => {
      await tx.update(courseOrders).set({ status: "expired" })
        .where(and(eq(courseOrders.orderId, order.orderId), eq(courseOrders.status, "pending")));
      await tx.update(stripeCheckoutAttempts).set({ status: "expired" })
        .where(and(eq(stripeCheckoutAttempts.stripeSessionId, session.id), eq(stripeCheckoutAttempts.status, "pending")));
    });
    return "expired";
  }

  return "pending";
}
