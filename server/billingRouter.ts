import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { courseEnrollments, courseOrders, stripeCheckoutAttempts } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { createHostedCourseSession, retrieveHostedCourseSession } from "./stripeService";
import { getCheckoutOrigin, getPaidCourse, stripeTestApiKeyReady } from "./stripeLogic";
import { reconcileCourseCheckoutSession } from "./stripeFulfillment";

function providerReady() {
  return stripeTestApiKeyReady(ENV.stripeSecretKey);
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "الخدمة غير متاحة حالياً." });
  return db;
}

async function getVerifiedSessionStatus(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  order: typeof courseOrders.$inferSelect,
) {
  if (!order.stripeSessionId) throw new TRPCError({ code: "CONFLICT", message: "جلسة الدفع لم تكتمل تهيئتها بعد." });
  let session;
  try {
    session = await retrieveHostedCourseSession(ENV.stripeSecretKey, order.stripeSessionId);
  } catch {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "تعذّر التحقق من حالة الدفع مع Stripe. حاول مجدداً بعد قليل." });
  }
  const status = await reconcileCourseCheckoutSession(db, session, order);
  if (status === "mismatch") throw new TRPCError({ code: "CONFLICT", message: "تعذّر مطابقة عملية الدفع مع هذا الطلب." });
  return status;
}

export const billingRouter = router({
  readiness: publicProcedure.query(() => ({
    checkoutConfigured: providerReady(),
    mode: providerReady() ? "test" as const : null,
    currency: "SAR" as const,
    subscriptionsConfigured: false,
  })),

  myCourses: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    if (providerReady()) {
      const pendingOrders = await db.select().from(courseOrders)
        .where(and(eq(courseOrders.userId, ctx.user.id), eq(courseOrders.status, "pending")))
        .orderBy(desc(courseOrders.createdAt)).limit(12);
      for (const order of pendingOrders) {
        if (!order.stripeSessionId) continue;
        try {
          await getVerifiedSessionStatus(db, order);
        } catch {
          // A temporary Stripe/network issue must not hide existing enrollments.
        }
      }
    }
    const rows = await db.select({ courseId: courseEnrollments.courseId })
      .from(courseEnrollments).where(eq(courseEnrollments.userId, ctx.user.id));
    return { courseIds: rows.map((row) => row.courseId) };
  }),

  studentDashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    if (providerReady()) {
      const pendingOrders = await db.select().from(courseOrders)
        .where(and(eq(courseOrders.userId, ctx.user.id), eq(courseOrders.status, "pending")))
        .orderBy(desc(courseOrders.createdAt)).limit(12);
      for (const order of pendingOrders) {
        if (!order.stripeSessionId) continue;
        try {
          await getVerifiedSessionStatus(db, order);
        } catch {
          // Preserve the dashboard during transient Stripe failures; pending is not proof of payment.
        }
      }
    }

    const [orders, enrollments] = await Promise.all([
      db.select({
        courseId: courseOrders.courseId,
        amountMinor: courseOrders.amountMinor,
        currency: courseOrders.currency,
        status: courseOrders.status,
        createdAt: courseOrders.createdAt,
        paidAt: courseOrders.paidAt,
      }).from(courseOrders)
        .where(eq(courseOrders.userId, ctx.user.id))
        .orderBy(desc(courseOrders.createdAt)).limit(50),
      db.select({
        courseId: courseEnrollments.courseId,
        enrolledAt: courseEnrollments.enrolledAt,
      }).from(courseEnrollments)
        .where(eq(courseEnrollments.userId, ctx.user.id)),
    ]);

    const enrollmentByCourse = new Map(enrollments.map((enrollment) => [enrollment.courseId, enrollment]));
    const payments = orders.flatMap((order) => {
      const course = getPaidCourse(order.courseId);
      if (!course) return [];
      return [{
        courseId: course.id,
        courseTitle: course.title,
        instructor: course.instructor,
        amountMinor: order.amountMinor,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      }];
    });
    const courses = payments.flatMap((payment) => {
      const enrollment = enrollmentByCourse.get(payment.courseId);
      if (payment.status !== "paid" || !enrollment) return [];
      return [{
        courseId: payment.courseId,
        title: payment.courseTitle,
        instructor: payment.instructor,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        purchasedAt: payment.paidAt ?? enrollment.enrolledAt,
      }];
    });

    return { courses, payments };
  }),

  orderStatus: protectedProcedure
    .input(z.object({ sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9_]+$/).max(255) }))
    .query(async ({ ctx, input }) => {
      if (!providerReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الدفع غير مفعّل حالياً." });
      const db = await database();
      const [order] = await db.select().from(courseOrders)
        .where(and(eq(courseOrders.userId, ctx.user.id), eq(courseOrders.stripeSessionId, input.sessionId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "لم يُعثر على طلب الدفع." });
      const status = await getVerifiedSessionStatus(db, order);
      return { orderId: order.orderId, courseId: order.courseId, status, amountMinor: order.amountMinor, currency: order.currency };
    }),

  checkoutCourse: protectedProcedure
    .input(z.object({ courseId: z.number().int().min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      if (!providerReady()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الدفع التجريبي غير مفعّل بعد. أضف مفتاح Stripe التجريبي إلى أسرار المشروع." });
      }
      const course = getPaidCourse(input.courseId);
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "هذه الدورة غير متاحة للشراء." });
      const db = await database();
      const [enrollment] = await db.select({ id: courseEnrollments.id })
        .from(courseEnrollments)
        .where(and(eq(courseEnrollments.userId, ctx.user.id), eq(courseEnrollments.courseId, course.id)))
        .limit(1);
      if (enrollment) return { status: "owned" as const };

      let [order] = await db.select().from(courseOrders)
        .where(and(eq(courseOrders.userId, ctx.user.id), eq(courseOrders.courseId, course.id)))
        .limit(1);
      if (!order) {
        try {
          await db.insert(courseOrders).values({
            orderId: randomUUID(), userId: ctx.user.id, courseId: course.id,
            amountMinor: course.amountMinor, platformFeeBps: course.platformFeeBps,
            platformFeeMinor: course.platformFeeMinor, instructorShareMinor: course.instructorShareMinor,
            currency: "sar", status: "pending",
          });
        } catch {
          // A simultaneous checkout may have created the unique user/course order.
        }
        [order] = await db.select().from(courseOrders)
          .where(and(eq(courseOrders.userId, ctx.user.id), eq(courseOrders.courseId, course.id)))
          .limit(1);
      }
      if (!order) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء طلب الدفع." });
      if (order.status === "paid") {
        throw new TRPCError({ code: "CONFLICT", message: "تم تأكيد الدفع ويجري تحديث مسارك؛ لا تعِد الدفع." });
      }
      if (order.amountMinor !== course.amountMinor || order.currency.toLowerCase() !== "sar"
        || order.platformFeeBps !== course.platformFeeBps
        || order.platformFeeMinor !== course.platformFeeMinor
        || order.instructorShareMinor !== course.instructorShareMinor) {
        throw new TRPCError({ code: "CONFLICT", message: "تعذر التحقق من سعر هذه الدورة؛ تواصل مع الدعم." });
      }

      let [attempt] = await db.select().from(stripeCheckoutAttempts)
        .where(eq(stripeCheckoutAttempts.orderId, order.orderId))
        .orderBy(desc(stripeCheckoutAttempts.attemptNo)).limit(1);
      const now = Date.now();
      let reusableAttempt = attempt?.status === "pending" && (!attempt.expiresAt || attempt.expiresAt.getTime() > now);
      if (attempt?.status === "pending" && attempt.stripeSessionId && attempt.expiresAt && attempt.expiresAt.getTime() <= now) {
        let remoteSession;
        try {
          remoteSession = await retrieveHostedCourseSession(ENV.stripeSecretKey, attempt.stripeSessionId);
        } catch {
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "جارٍ التحقق من جلسة Stripe السابقة؛ لم ننشئ دفعة مكرّرة." });
        }
        const verifiedStatus = await reconcileCourseCheckoutSession(db, remoteSession, order);
        if (verifiedStatus === "paid") return { status: "owned" as const };
        if (remoteSession.status === "expired") {
          await db.update(stripeCheckoutAttempts).set({ status: "expired" }).where(eq(stripeCheckoutAttempts.id, attempt.id));
          await db.update(courseOrders).set({ status: "expired" }).where(and(eq(courseOrders.orderId, order.orderId), eq(courseOrders.status, "pending")));
          attempt = { ...attempt, status: "expired" };
          reusableAttempt = false;
        } else if (remoteSession.status === "open" && remoteSession.url) {
          const refreshedExpiry = remoteSession.expires_at ? new Date(remoteSession.expires_at * 1_000) : null;
          await db.update(stripeCheckoutAttempts).set({ checkoutUrl: remoteSession.url, expiresAt: refreshedExpiry }).where(eq(stripeCheckoutAttempts.id, attempt.id));
          await db.update(courseOrders).set({ checkoutUrl: remoteSession.url, expiresAt: refreshedExpiry }).where(eq(courseOrders.orderId, order.orderId));
          return { status: "checkout" as const, url: remoteSession.url };
        } else {
          throw new TRPCError({ code: "CONFLICT", message: "وصلت إلى صفحة Stripe بالفعل؛ تحقّق من مسارك قبل بدء دفعة أخرى." });
        }
      }
      if (!reusableAttempt) {
        const attemptNo = (attempt?.attemptNo ?? 0) + 1;
        const idempotencyKey = `course-order:${order.orderId}:attempt:${attemptNo}`;
        try {
          await db.insert(stripeCheckoutAttempts).values({ orderId: order.orderId, attemptNo, idempotencyKey, status: "pending" });
        } catch {
          // Concurrent clicks converge on the same order/attempt unique keys.
        }
        [attempt] = await db.select().from(stripeCheckoutAttempts)
          .where(and(eq(stripeCheckoutAttempts.orderId, order.orderId), eq(stripeCheckoutAttempts.attemptNo, attemptNo)))
          .limit(1);
        if (!attempt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر تهيئة جلسة الدفع." });
        await db.update(courseOrders).set({ status: "pending", checkoutAttempts: attemptNo }).where(eq(courseOrders.orderId, order.orderId));
      }
      if (!attempt) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر تهيئة جلسة الدفع." });
      if (attempt.checkoutUrl && attempt.stripeSessionId && reusableAttempt) return { status: "checkout" as const, url: attempt.checkoutUrl };

      let origin: string;
      try {
        origin = getCheckoutOrigin({
          originHeader: typeof ctx.req.headers.origin === "string" ? ctx.req.headers.origin : undefined,
          host: ctx.req.get("host"), isProduction: ENV.isProduction,
        });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "تعذر تحديد موقع العودة الآمن من صفحة الدفع." });
      }

      let session;
      try {
        session = await createHostedCourseSession({
          secretKey: ENV.stripeSecretKey, idempotencyKey: attempt.idempotencyKey,
          orderId: order.orderId, userId: ctx.user.id, course, origin, customerEmail: ctx.user.email,
        });
      } catch {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "تعذر الاتصال بصفحة Stripe الآن. حاول مرة أخرى بعد قليل." });
      }
      if (!session.url || !Number.isSafeInteger(session.expires_at) || new URL(session.url).hostname !== "checkout.stripe.com") {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "أعاد Stripe رابط دفع غير صالح." });
      }
      const expiresAt = new Date(session.expires_at * 1_000);
      await db.update(stripeCheckoutAttempts)
        .set({ stripeSessionId: session.id, checkoutUrl: session.url, expiresAt, status: "pending" })
        .where(eq(stripeCheckoutAttempts.id, attempt.id));
      await db.update(courseOrders)
        .set({ stripeSessionId: session.id, checkoutUrl: session.url, expiresAt, status: "pending" })
        .where(eq(courseOrders.orderId, order.orderId));
      return { status: "checkout" as const, url: session.url };
    }),
});
