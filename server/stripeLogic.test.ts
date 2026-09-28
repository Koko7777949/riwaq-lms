import { describe, expect, it } from "vitest";
import {
  buildCourseCheckoutForm,
  getCheckoutOrigin,
  getPaidCourse,
  isCourseCheckoutSession,
  isPaidCourseCheckoutSession,
  paidCourseCatalog,
  stripeCredentialsReady,
  stripeEventModeMatches,
  stripeTestApiKeyReady,
} from "./stripeLogic";

const order = {
  orderId: "123e4567-e89b-12d3-a456-426614174000",
  userId: 42,
  courseId: 1,
  stripeSessionId: "cs_test_session_123",
  amountMinor: 18_900,
  currency: "sar",
};
const session = {
  id: order.stripeSessionId,
  livemode: false,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: order.amountMinor,
  currency: "sar",
  client_reference_id: "42",
  metadata: { orderId: order.orderId, userId: "42", courseId: "1" },
};

describe("Stripe course payment rules", () => {
  it("uses only the six published server courses and exact SAR minor-unit allocations", () => {
    expect(paidCourseCatalog).toHaveLength(6);
    expect(getPaidCourse(1)).toMatchObject({ amountMinor: 18_900, platformFeeBps: 1_000, platformFeeMinor: 1_890, instructorShareMinor: 17_010 });
    expect(getPaidCourse(4)?.amountMinor).toBe(13_900);
    expect(getPaidCourse(7)).toBeUndefined();
  });

  it("requires test-mode API credentials and an endpoint signing secret", () => {
    expect(stripeCredentialsReady({ secretKey: "sk_test_example_test_key", webhookSecret: "whsec_example_endpoint_secret" })).toBe(true);
    expect(stripeCredentialsReady({ secretKey: "sk_live_example_live_key", webhookSecret: "whsec_example_endpoint_secret" })).toBe(false);
    expect(stripeCredentialsReady({ secretKey: "sk_test_example_test_key", webhookSecret: "" })).toBe(false);
    expect(stripeEventModeMatches("sk_test_example", false)).toBe(true);
    expect(stripeEventModeMatches("sk_test_example", true)).toBe(false);
    expect(stripeEventModeMatches("sk_live_example", true)).toBe(false);
    expect(stripeTestApiKeyReady("sk_test_example_test_key")).toBe(true);
    expect(stripeTestApiKeyReady("sk_live_example_live_key")).toBe(false);
    expect(stripeTestApiKeyReady("pk_test_publishable_key")).toBe(false);
  });

  it("accepts only HTTPS same-host return origins (except local development)", () => {
    expect(getCheckoutOrigin({ originHeader: "https://riwaq.example", host: "riwaq.example", isProduction: true })).toBe("https://riwaq.example");
    expect(getCheckoutOrigin({ originHeader: "http://localhost:3000", host: "localhost:3000", isProduction: false })).toBe("http://localhost:3000");
    expect(() => getCheckoutOrigin({ originHeader: "https://attacker.example", host: "riwaq.example", isProduction: true })).toThrow();
    expect(() => getCheckoutOrigin({ originHeader: "http://riwaq.example", host: "riwaq.example", isProduction: true })).toThrow();
  });

  it("builds exact server-owned form data with identity, fee-bound order metadata, and one-time payment mode", () => {
    const course = getPaidCourse(1)!;
    const form = buildCourseCheckoutForm({ orderId: order.orderId, userId: order.userId, course, successUrl: "https://riwaq.example/?success=1", cancelUrl: "https://riwaq.example/?cancelled=1", customerEmail: "student@example.com" });
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("sar");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("18900");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("customer_email")).toBe("student@example.com");
    expect(form.get("metadata[orderId]")).toBe(order.orderId);
    expect(form.get("payment_intent_data[metadata][orderId]")).toBe(order.orderId);
  });

  it("requires exact Session, order, account, course, currency, amount, and payment-mode matches", () => {
    expect(isCourseCheckoutSession(session, order)).toBe(true);
    expect(isPaidCourseCheckoutSession(session, order)).toBe(true);
    expect(isPaidCourseCheckoutSession({ ...session, payment_status: "unpaid" }, order)).toBe(false);
    expect(isPaidCourseCheckoutSession({ ...session, status: "open" }, order)).toBe(false);
    expect(isCourseCheckoutSession({ ...session, amount_total: 1 }, order)).toBe(false);
    expect(isCourseCheckoutSession({ ...session, livemode: true }, order)).toBe(false);
    expect(isCourseCheckoutSession({ ...session, mode: "subscription" }, order)).toBe(false);
    expect(isCourseCheckoutSession({ ...session, client_reference_id: "99" }, order)).toBe(false);
    expect(isCourseCheckoutSession({ ...session, metadata: { ...session.metadata, courseId: "2" } }, order)).toBe(false);
  });
});
