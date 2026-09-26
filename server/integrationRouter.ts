import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { integrationReadiness } from "./integrationConfig";
import {
  assistantCourses,
  dailyRequestCount,
  emailTestBlockReason,
  isWithinCooldown,
  isValidE164Phone,
  smsTestBlockReason,
} from "./integrationsLogic";
import {
  requestOpenAIAnswer,
  sendSendGridTestEmail,
  sendTwilioTestSms,
  type LessonChatTurn,
} from "./integrationProviders";

const messageFailure = () =>
  new TRPCError({ code: "PRECONDITION_FAILED", message: "خدمة الإرسال غير مهيّأة بعد. أكمل إعداد مفاتيح المزود أولاً." });

async function requireProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "خدمة الملف الشخصي غير متاحة الآن." });
  const [profile] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "تعذّر العثور على إعدادات الحساب." });
  return { db, profile };
}

export const integrationsRouter = router({
  availability: publicProcedure.query(() => integrationReadiness(ENV)),

  settings: protectedProcedure.query(async ({ ctx }) => {
    const { profile } = await requireProfile(ctx.user.id);
    return {
      email: profile.email ?? "",
      emailNotifications: profile.emailNotifications,
      phoneNumber: profile.phoneNumber ?? "",
      smsOptIn: profile.smsOptIn,
      providers: integrationReadiness(ENV),
    };
  }),

  saveSettings: protectedProcedure
    .input(z.object({
      emailNotifications: z.boolean(),
      phoneNumber: z.string().trim().max(16).optional().nullable(),
      smsOptIn: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, profile } = await requireProfile(ctx.user.id);
      const phoneNumber = input.phoneNumber?.trim() || null;
      if (phoneNumber && !isValidE164Phone(phoneNumber)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب رقم الهاتف بصيغة دولية مثل ‎+9665XXXXXXXX." });
      }
      if (input.smsOptIn && !phoneNumber) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "أضف رقم هاتف بصيغة دولية قبل تفعيل موافقة SMS." });
      }
      const now = new Date();
      await db.update(users).set({
        emailNotifications: input.emailNotifications,
        phoneNumber,
        smsOptIn: input.smsOptIn,
        smsOptInAt: input.smsOptIn ? (profile.smsOptInAt ?? now) : profile.smsOptInAt,
        smsOptOutAt: profile.smsOptIn && !input.smsOptIn ? now : profile.smsOptOutAt,
      }).where(eq(users.id, ctx.user.id));
      return { success: true as const };
    }),

  askAboutCourse: protectedProcedure
    .input(z.object({
      courseId: z.number().int().min(1).max(6),
      turns: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1200),
      })).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!integrationReadiness(ENV).openAi) throw messageFailure();
      const course = assistantCourses[input.courseId];
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "لم نعثر على الدورة." });
      if (input.turns[input.turns.length - 1]?.role !== "user") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "أرسل سؤالك الأخير كرسالة طالب." });
      }
      const totalChars = input.turns.reduce((sum, turn) => sum + turn.content.length, 0);
      if (totalChars > 5000) throw new TRPCError({ code: "BAD_REQUEST", message: "اختصر المحادثة قبل إرسال سؤال جديد." });

      const { db, profile } = await requireProfile(ctx.user.id);
      const now = new Date();
      if (isWithinCooldown(profile.lastAiRequestAt, now, 30_000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "انتظر قليلاً قبل إرسال سؤال آخر." });
      }
      const utcDate = now.toISOString().slice(0, 10);
      const count = dailyRequestCount(profile.aiDailyRequestDate, profile.aiDailyRequests, utcDate);
      if (count >= 20) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "وصلت إلى حد الأسئلة التجريبي لهذا اليوم. عُد غداً." });
      }
      await db.update(users).set({
        aiDailyRequestDate: utcDate,
        aiDailyRequests: count + 1,
        lastAiRequestAt: now,
      }).where(eq(users.id, ctx.user.id));

      try {
        const answer = await requestOpenAIAnswer(
          { apiKey: ENV.openAiApiKey },
          course,
          input.turns as LessonChatTurn[],
        );
        return { answer, requestsRemainingToday: 19 - count };
      } catch {
        throw new TRPCError({ code: "BAD_GATEWAY", message: "تعذّر الوصول إلى المساعد الآن. لم نرسل محتوى إضافياً؛ حاول لاحقاً." });
      }
    }),

  sendTestEmail: protectedProcedure.mutation(async ({ ctx }) => {
    if (!integrationReadiness(ENV).sendGridEmail) throw messageFailure();
    const { db, profile } = await requireProfile(ctx.user.id);
    if (emailTestBlockReason(profile)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "فعّل البريد وأكّد توفر بريد حسابك أولاً." });
    }
    const now = new Date();
    if (isWithinCooldown(profile.lastEmailTestAt, now, 60_000)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "انتظر دقيقة قبل إرسال رسالة تحقق أخرى." });
    }
    await db.update(users).set({ lastEmailTestAt: now }).where(eq(users.id, ctx.user.id));
    try {
      await sendSendGridTestEmail(
        { apiKey: ENV.sendGridApiKey, fromEmail: ENV.sendGridFromEmail },
        profile.email!,
      );
    } catch {
      throw new TRPCError({ code: "BAD_GATEWAY", message: "تعذّر إرسال رسالة التحقق. تحقق من إعداد SendGrid ومرسل النطاق." });
    }
    return { success: true as const };
  }),

  sendTestSms: protectedProcedure.mutation(async ({ ctx }) => {
    if (!integrationReadiness(ENV).twilioSms) throw messageFailure();
    const { db, profile } = await requireProfile(ctx.user.id);
    const blockReason = smsTestBlockReason(profile);
    if (blockReason === "opt_in_required") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "فعّل موافقتك على SMS قبل إرسال الرسالة." });
    }
    if (blockReason === "phone_required") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "أضف رقماً صحيحاً بصيغة دولية وفعّل الموافقة." });
    }
    const now = new Date();
    if (isWithinCooldown(profile.lastSmsTestAt, now, 60_000)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "انتظر دقيقة قبل إرسال رسالة تحقق أخرى." });
    }
    await db.update(users).set({ lastSmsTestAt: now }).where(eq(users.id, ctx.user.id));
    try {
      await sendTwilioTestSms({
        accountSid: ENV.twilioAccountSid,
        apiKeySid: ENV.twilioApiKeySid,
        apiKeySecret: ENV.twilioApiKeySecret,
        messagingServiceSid: ENV.twilioMessagingServiceSid,
      }, profile.phoneNumber!);
    } catch {
      throw new TRPCError({ code: "BAD_GATEWAY", message: "تعذّر إرسال SMS. تحقق من Messaging Service وبلد الرقم." });
    }
    return { success: true as const };
  }),
});
