import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import Stripe from "stripe";

const { getDbMock, constructEventMock } = vi.hoisted(() => ({ getDbMock: vi.fn(), constructEventMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./stripeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripeService")>();
  return { ...actual, constructStripeEvent: constructEventMock };
});

import { courseEnrollments, courseOrders, stripeCheckoutAttempts, stripeWebhookEvents } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { createStripeWebhookHandler } from "./stripeWebhook";

const orderId = "123e4567-e89b-12d3-a456-426614174000";
const sessionId = "cs_test_session_123";
const order = {
  orderId, userId: 42, courseId: 1, stripeSessionId: sessionId, amountMinor: 18_900,
  platformFeeBps: 1_000, platformFeeMinor: 1_890, instructorShareMinor: 17_010, currency: "sar", status: "pending",
};
const attempt = { id: 1, orderId, attemptNo: 1, idempotencyKey: "course-order:order-1:attempt:1", stripeSessionId: sessionId, status: "pending" };
const session = {
  id: sessionId, livemode: false, mode: "payment", payment_status: "paid", status: "complete", amount_total: 18_900, currency: "sar",
  client_reference_id: "42", metadata: { orderId, userId: "42", courseId: "1" },
};

function createDatabase(options: { duplicate?: boolean; processed?: boolean } = {}) {
  const insertEvents: unknown[] = [];
  const enrollmentValues: unknown[] = [];
  const enrollmentUpserts: unknown[] = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const select = () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: async () => table === courseOrders ? [order]
          : table === stripeCheckoutAttempts ? [attempt]
          : options.processed ? [{ eventId: "evt_paid_1" }] : [],
      }),
    }),
  });
  const transaction = async (run: (tx: any) => Promise<void>) => run({
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        if (table === stripeWebhookEvents && options.duplicate) {
          throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
        }
        if (table === stripeWebhookEvents) {
          insertEvents.push(values);
          return Promise.resolve(undefined);
        }
        if (table === courseEnrollments) {
          enrollmentValues.push(values);
          return { onDuplicateKeyUpdate: async (update: unknown) => enrollmentUpserts.push(update) };
        }
        return Promise.resolve(undefined);
      },
    }),
    update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => { updates.push({ table, values }); } }) }),
  });
  return { select, transaction, insertEvents, enrollmentValues, enrollmentUpserts, updates };
}

function responseMock() {
  const out: { statusCode: number; body?: string } = { statusCode: 200 };
  const response = {
    status(code: number) { out.statusCode = code; return response; },
    send(body: string) { out.body = body; return response; },
  } as unknown as Response;
  return { response, out };
}

const config = { ...ENV, stripeSecretKey: "sk_test_offline_test_key", stripeWebhookSecret: "whsec_offline_endpoint_secret" };
const paidEvent = {
  id: "evt_paid_1", object: "event", api_version: "2025-01-27.acacia", created: Math.floor(Date.now() / 1000),
  data: { object: session }, livemode: false, pending_webhooks: 1, request: null, type: "checkout.session.completed",
} as unknown as Stripe.Event;

beforeEach(() => {
  vi.clearAllMocks();
  constructEventMock.mockReturnValue(paidEvent);
});

describe("Stripe webhook fulfillment", () => {
  it("rejects bad signatures before accessing the database", async () => {
    constructEventMock.mockImplementation(() => { throw new Error("bad signature"); });
    const db = createDatabase();
    getDbMock.mockResolvedValue(db);
    const { response, out } = responseMock();
    await createStripeWebhookHandler(config)({ body: Buffer.from("{}"), get: () => "t=1,v1=nope" } as unknown as Request, response);
    expect(out.statusCode).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("enrolls only after a paid, matched Session inside the database transaction", async () => {
    const db = createDatabase();
    getDbMock.mockResolvedValue(db);
    const { response, out } = responseMock();
    await createStripeWebhookHandler(config)({ body: Buffer.from("signed raw bytes"), get: () => "signature" } as unknown as Request, response);
    expect(out.statusCode).toBe(200);
    expect(db.insertEvents).toEqual([{ eventId: "evt_paid_1", eventType: "checkout.session.completed" }]);
    expect(db.enrollmentValues).toEqual([{ userId: 42, courseId: 1, orderId }]);
    expect(db.updates).toContainEqual({ table: courseOrders, values: expect.objectContaining({ status: "paid" }) });
    expect(db.updates).toContainEqual({ table: stripeCheckoutAttempts, values: { status: "paid" } });
  });

  it("does not grant access for a completed-but-unpaid delayed payment", async () => {
    constructEventMock.mockReturnValue({ ...paidEvent, data: { object: { ...session, payment_status: "unpaid" } } });
    const db = createDatabase();
    getDbMock.mockResolvedValue(db);
    const { response, out } = responseMock();
    await createStripeWebhookHandler(config)({ body: Buffer.from("signed raw bytes"), get: () => "signature" } as unknown as Request, response);
    expect(out.statusCode).toBe(200);
    expect(db.enrollmentValues).toHaveLength(0);
    expect(db.insertEvents).toHaveLength(1);
  });

  it("rejects an amount mismatch without journaling or enrolling", async () => {
    constructEventMock.mockReturnValue({ ...paidEvent, data: { object: { ...session, amount_total: 18_901 } } });
    const db = createDatabase();
    getDbMock.mockResolvedValue(db);
    const { response, out } = responseMock();
    await createStripeWebhookHandler(config)({ body: Buffer.from("signed raw bytes"), get: () => "signature" } as unknown as Request, response);
    expect(out.statusCode).toBe(400);
    expect(db.insertEvents).toHaveLength(0);
    expect(db.enrollmentValues).toHaveLength(0);
  });

  it("acknowledges only an exact already-journaled duplicate event", async () => {
    const db = createDatabase({ duplicate: true, processed: true });
    getDbMock.mockResolvedValue(db);
    const { response, out } = responseMock();
    await createStripeWebhookHandler(config)({ body: Buffer.from("signed raw bytes"), get: () => "signature" } as unknown as Request, response);
    expect(out.statusCode).toBe(200);
    expect(db.enrollmentValues).toHaveLength(0);
  });
});
