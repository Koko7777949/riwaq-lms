import { describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { courseEnrollments, courseOrders } from "../drizzle/schema";
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

  it("requires authentication to view purchase history", async () => {
    getDbMock.mockClear();
    await expect(appRouter.createCaller(ctxBase).billing.studentDashboard()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("returns only the signed-in student's orders and opens courses only for paid enrollments", async () => {
    const paidAt = new Date("2026-09-20T10:00:00.000Z");
    const orderRows = [
      { userId: 42, courseId: 1, amountMinor: 18900, currency: "sar", status: "paid", createdAt: paidAt, paidAt, stripeSessionId: "cs_test_private", checkoutUrl: "https://checkout.stripe.com/private", orderId: "private-order" },
      { userId: 42, courseId: 2, amountMinor: 22900, currency: "sar", status: "pending", createdAt: new Date("2026-09-21T10:00:00.000Z"), paidAt: null },
      { userId: 42, courseId: 3, amountMinor: 15900, currency: "sar", status: "expired", createdAt: new Date("2026-09-19T10:00:00.000Z"), paidAt: null },
      { userId: 99, courseId: 6, amountMinor: 17900, currency: "sar", status: "paid", createdAt: paidAt, paidAt },
    ];
    const enrollmentRows = [
      { userId: 42, courseId: 1, enrolledAt: paidAt },
      { userId: 99, courseId: 6, enrolledAt: paidAt },
    ];
    const dialect = new MySqlDialect();
    const ownershipQueries: Array<{ table: unknown; sql: string; params: unknown[] }> = [];
    const db = {
      select: vi.fn(() => {
        let sourceTable: unknown;
        let rows: Array<Record<string, unknown>> = [];
        const builder: any = {
          from(table: unknown) {
            sourceTable = table;
            return builder;
          },
          where(condition: Parameters<typeof dialect.sqlToQuery>[0]) {
            const query = dialect.sqlToQuery(condition);
            ownershipQueries.push({ table: sourceTable, sql: query.sql, params: query.params });
            const candidates = sourceTable === courseOrders ? orderRows : enrollmentRows;
            rows = candidates.filter((row) => row.userId === query.params[0]);
            return builder;
          },
          orderBy() {
            return builder;
          },
          limit() {
            return Promise.resolve(rows);
          },
          then(resolve: (value: Array<Record<string, unknown>>) => unknown, reject: (reason: unknown) => unknown) {
            return Promise.resolve(rows).then(resolve, reject);
          },
        };
        return builder;
      }),
    };
    getDbMock.mockResolvedValueOnce(db);

    const result = await appRouter.createCaller(authContext).billing.studentDashboard();

    expect(result.courses).toEqual([{
      courseId: 1,
      title: "أساسيات التصميم وتجربة المستخدم",
      instructor: "سارة العتيبي",
      amountMinor: 18900,
      currency: "sar",
      purchasedAt: paidAt,
    }]);
    expect(result.payments.map(({ courseId, status }) => [courseId, status])).toEqual([
      [1, "paid"], [2, "pending"], [3, "expired"],
    ]);
    expect(ownershipQueries).toHaveLength(2);
    expect(ownershipQueries.map(({ table, sql, params }) => [table, sql, params])).toEqual([
      [courseOrders, "`course_orders`.`userId` = ?", [42]],
      [courseEnrollments, "`course_enrollments`.`userId` = ?", [42]],
    ]);
    expect(JSON.stringify(result)).not.toMatch(/userId|stripeSessionId|checkoutUrl|orderId|cs_test_/);
  });
});
