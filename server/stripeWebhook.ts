import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { courseEnrollments, courseOrders, stripeCheckoutAttempts, stripeWebhookEvents } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { constructStripeEvent } from "./stripeService";
import { getPaidCourse, isCourseCheckoutSession, isPaidCourseCheckoutSession, stripeCredentialsReady, stripeEventModeMatches, type CheckoutSessionSnapshot } from "./stripeLogic";

const checkoutEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

function logWebhook(outcome: string, eventId?: string, eventType?: string) {
  // Never include payloads, signatures, buyer details, Session URLs, or credentials in logs.
  console.info(`[Stripe webhook] ${outcome}${eventId ? ` event=${eventId}` : ""}${eventType ? ` type=${eventType}` : ""}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createStripeWebhookHandler(config: typeof ENV = ENV) {
 return async function handleStripeWebhook(req: Request, res: Response) {
  const secretKey = config.stripeSecretKey;
  const webhookSecret = config.stripeWebhookSecret;
  if (!stripeCredentialsReady({ secretKey, webhookSecret })) {
    logWebhook("rejected: billing not configured");
    return res.status(503).send("Stripe webhook is not configured");
  }
  if (!Buffer.isBuffer(req.body)) return res.status(400).send("Raw webhook body is required");
  const signature = req.get("stripe-signature");
  if (!signature) return res.status(400).send("Stripe signature is required");

  let event: ReturnType<typeof constructStripeEvent>;
  try {
    event = constructStripeEvent({ secretKey, webhookSecret, rawBody: req.body, signature });
  } catch {
    logWebhook("rejected: signature verification failed");
    return res.status(400).send("Invalid Stripe webhook signature");
  }
  if (!stripeEventModeMatches(secretKey, event.livemode)) {
    logWebhook("rejected: test/live event mode mismatch", event.id, event.type);
    return res.status(400).send("Stripe event mode mismatch");
  }
  if (!checkoutEvents.has(event.type)) return res.status(200).send("Ignored");

  const session = event.data.object;
  if (!isRecord(session) || typeof session.id !== "string" || !/^cs_(test|live)_[A-Za-z0-9_]+$/.test(session.id)
    || !isRecord(session.metadata) || typeof session.metadata.orderId !== "string"
    || !/^[-A-Za-z0-9_]{16,36}$/.test(session.metadata.orderId)) {
    logWebhook("rejected: invalid Checkout Session", event.id, event.type);
    return res.status(400).send("Invalid Checkout Session");
  }
  const sessionSnapshot = session as unknown as CheckoutSessionSnapshot;

  const db = await getDb();
  if (!db) return res.status(503).send("Database unavailable");
  const [order] = await db.select().from(courseOrders)
    .where(eq(courseOrders.orderId, session.metadata.orderId))
    .limit(1);
  if (!order) {
    // Session creation may have succeeded before its ID was persisted; retry rather than drop this event.
    logWebhook("retry: order association is not ready", event.id, event.type);
    return res.status(503).send("Order association is not ready");
  }
  const [attempt] = await db.select().from(stripeCheckoutAttempts)
    .where(eq(stripeCheckoutAttempts.stripeSessionId, session.id))
    .limit(1);
  if (!attempt) {
    // The Session may be created before its attempt row receives the ID; Stripe retries 5xx deliveries.
    logWebhook("retry: Checkout Session not yet associated", event.id, event.type);
    return res.status(503).send("Checkout Session association is not ready");
  }
  if (attempt.orderId !== order.orderId) {
    logWebhook("rejected: Session attempt belongs to another order", event.id, event.type);
    return res.status(400).send("Checkout Session does not match the order");
  }
  const course = getPaidCourse(order.courseId);
  if (!course || order.amountMinor !== course.amountMinor || order.currency.toLowerCase() !== "sar"
    || order.platformFeeBps !== course.platformFeeBps
    || order.platformFeeMinor !== course.platformFeeMinor
    || order.instructorShareMinor !== course.instructorShareMinor) {
    logWebhook("rejected: stored order does not match catalog", event.id, event.type);
    return res.status(400).send("Order mismatch");
  }

  const orderSnapshot = {
    orderId: order.orderId,
    userId: order.userId,
    courseId: order.courseId,
    stripeSessionId: session.id as string,
    amountMinor: order.amountMinor,
    currency: order.currency,
  };
  if (!isCourseCheckoutSession(sessionSnapshot, orderSnapshot)) {
    logWebhook("rejected: Session does not match order", event.id, event.type);
    return res.status(400).send("Checkout Session does not match the order");
  }
  const paidEvent = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  const paid = isPaidCourseCheckoutSession(sessionSnapshot, orderSnapshot);
  if (paidEvent && session.payment_status === "paid" && !paid) {
    logWebhook("rejected: paid Session attributes mismatch", event.id, event.type);
    return res.status(400).send("Paid Checkout Session does not match the order");
  }
  if (event.type === "checkout.session.async_payment_succeeded" && !paid) {
    logWebhook("retry: asynchronous payment not confirmed", event.id, event.type);
    return res.status(503).send("Payment confirmation is not ready");
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(stripeWebhookEvents).values({ eventId: event.id, eventType: event.type });
      if (paidEvent && paid) {
        await tx.update(courseOrders)
          .set({ status: "paid", paidAt: new Date() })
          .where(eq(courseOrders.orderId, order.orderId));
        await tx.update(stripeCheckoutAttempts)
          .set({ status: "paid" })
          .where(eq(stripeCheckoutAttempts.stripeSessionId, session.id as string));
        await tx.insert(courseEnrollments).values({
          userId: order.userId,
          courseId: order.courseId,
          orderId: order.orderId,
        }).onDuplicateKeyUpdate({ set: { orderId: order.orderId } });
      } else if ((event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") && session.payment_status !== "paid") {
        const status = event.type === "checkout.session.expired" ? "expired" as const : "failed" as const;
        await tx.update(courseOrders)
          .set({ status })
          .where(and(eq(courseOrders.orderId, order.orderId), eq(courseOrders.status, "pending")));
        await tx.update(stripeCheckoutAttempts)
          .set({ status })
          .where(and(eq(stripeCheckoutAttempts.stripeSessionId, session.id as string), eq(stripeCheckoutAttempts.status, "pending")));
      }
    });
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ER_DUP_ENTRY" || code === "1062") {
      const [processed] = await db.select({ eventId: stripeWebhookEvents.eventId })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.eventId, event.id))
        .limit(1);
      if (processed) return res.status(200).send("Already processed");
    }
    logWebhook("retry: transaction failed", event.id, event.type);
    return res.status(503).send("Webhook will be retried");
  }
  logWebhook("processed", event.id, event.type);
  return res.status(200).send("OK");
 };
}

export const handleStripeWebhook = createStripeWebhookHandler();
