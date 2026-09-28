import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock, envMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  envMock: { stripeSecretKey: "", stripeWebhookSecret: "", isProduction: false },
}));
vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./_core/env", () => ({ ENV: envMock }));

import { appRouter } from "./routers";

const ctxBase: TrpcContext = {
  user: null,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};
const authContext: TrpcContext = { ...ctxBase, user: {
  id: 42, openId: "stripe-test-user", email: "student@example.com", name: "Test Student", loginMethod: "manus", role: "user",
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
} };

describe("billing router", () => {
  it("exposes only safe not-configured status, never a Stripe secret", async () => {
    const result = await appRouter.createCaller(ctxBase).billing.readiness();
    expect(result).toMatchObject({ checkoutConfigured: false, mode: null, currency: "SAR", subscriptionsConfigured: false });
    expect(JSON.stringify(result)).not.toMatch(/sk_(test|live)_|whsec_/);
  });

  it("enables Checkout using only a test API key and exposes no key values", async () => {
    envMock.stripeSecretKey = "sk_test_offline_example_key";
    envMock.stripeWebhookSecret = "pk_test_obsolete_publishable_value";
    try {
      const result = await appRouter.createCaller(ctxBase).billing.readiness();
      expect(result).toMatchObject({ checkoutConfigured: true, mode: "test", currency: "SAR", subscriptionsConfigured: false });
      expect(JSON.stringify(result)).not.toMatch(/sk_test_offline|pk_test_obsolete|whsec_/);
    } finally {
      envMock.stripeSecretKey = "";
      envMock.stripeWebhookSecret = "";
    }
  });

  it("fails closed before database/provider work when test credentials are missing", async () => {
    getDbMock.mockClear();
    await expect(appRouter.createCaller(authContext).billing.checkoutCourse({ courseId: 1 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("rejects draft or unknown course IDs at input validation", async () => {
    await expect(appRouter.createCaller(authContext).billing.checkoutCourse({ courseId: 7 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("requires authentication to enumerate persistent enrollments", async () => {
    getDbMock.mockClear();
    await expect(appRouter.createCaller(ctxBase).billing.myCourses()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
