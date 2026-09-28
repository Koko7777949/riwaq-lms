import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { constructStripeEvent, createHostedCourseSession } from "./stripeService";
import { getPaidCourse } from "./stripeLogic";

const common = {
  secretKey: "sk_test_example_test_key",
  idempotencyKey: "course-order:order-1:attempt:1",
  orderId: "123e4567-e89b-12d3-a456-426614174000",
  userId: 42,
  course: getPaidCourse(1)!,
  origin: "https://riwaq.example",
  customerEmail: "student@example.com",
};

describe("Stripe provider adapter", () => {
  it("sends exact server-owned price, signed-in identity, safe URLs, and stable idempotency key", async () => {
    const session = { id: "cs_test_session", url: "https://checkout.stripe.com/c/pay/cs_test_session", expires_at: 1_800_000_000 };
    const create = vi.fn().mockResolvedValue(session);
    const client = { checkout: { sessions: { create } } } as unknown as Stripe;
    await expect(createHostedCourseSession(common, client)).resolves.toBe(session);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment",
      client_reference_id: "42",
      customer_email: "student@example.com",
      line_items: [{ quantity: 1, price_data: { currency: "sar", unit_amount: 18_900, product_data: expect.objectContaining({ name: common.course.title }) } }],
      success_url: "https://riwaq.example/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://riwaq.example/?checkout=cancelled",
      metadata: expect.objectContaining({ orderId: common.orderId, userId: "42", courseId: "1" }),
      payment_intent_data: { metadata: { orderId: common.orderId, courseId: "1" } },
    }), { idempotencyKey: common.idempotencyKey });
  });

  it("verifies provider signatures with the official SDK and rejects a forged signature", () => {
    const key = "whsec_offline_test_endpoint_secret";
    const payload = JSON.stringify({ id: "evt_test", object: "event", api_version: "2025-01-27.acacia", created: Math.floor(Date.now() / 1_000), data: { object: {} }, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type: "checkout.session.completed" });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: key, timestamp: Math.floor(Date.now() / 1_000) });
    const event = constructStripeEvent({ secretKey: common.secretKey, webhookSecret: key, rawBody: Buffer.from(payload), signature });
    expect(event.id).toBe("evt_test");
    expect(() => constructStripeEvent({ secretKey: common.secretKey, webhookSecret: key, rawBody: Buffer.from(payload), signature: "t=1,v1=bad" })).toThrow();
  });
});
