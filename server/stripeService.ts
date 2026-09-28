import Stripe from "stripe";
import type { PaidCourse } from "./stripeLogic";

export function makeStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { timeout: 12_000, maxNetworkRetries: 1 });
}

export async function createHostedCourseSession(input: {
  secretKey: string;
  idempotencyKey: string;
  orderId: string;
  userId: number;
  course: PaidCourse;
  origin: string;
  customerEmail?: string | null;
}, stripeClient: Stripe = makeStripeClient(input.secretKey)): Promise<Stripe.Checkout.Session> {
  const stripe = stripeClient;
  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: String(input.userId),
    locale: "auto",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "sar",
        unit_amount: input.course.amountMinor,
        product_data: {
          name: input.course.title,
          description: `دورة تعليمية من رِواق — ${input.course.instructor}`,
        },
      },
    }],
    success_url: `${input.origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/?checkout=cancelled`,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    metadata: {
      orderId: input.orderId,
      userId: String(input.userId),
      courseId: String(input.course.id),
    },
    payment_intent_data: {
      metadata: {
        orderId: input.orderId,
        courseId: String(input.course.id),
      },
    },
  }, { idempotencyKey: input.idempotencyKey });
}

export async function retrieveHostedCourseSession(secretKey: string, sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = makeStripeClient(secretKey);
  return stripe.checkout.sessions.retrieve(sessionId);
}

export function constructStripeEvent(input: {
  secretKey: string;
  webhookSecret: string;
  rawBody: Buffer;
  signature: string;
}): Stripe.Event {
  const stripe = makeStripeClient(input.secretKey);
  return stripe.webhooks.constructEvent(input.rawBody, input.signature, input.webhookSecret);
}
