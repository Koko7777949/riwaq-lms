import { calculatePlatformFee } from "./revenueLedger";

export const STRIPE_CURRENCY = "sar" as const;
export const COURSE_PLATFORM_FEE_BPS = 1_000;

export type PaidCourse = {
  id: number;
  title: string;
  instructor: string;
  priceSar: number;
  amountMinor: number;
  platformFeeBps: number;
  platformFeeMinor: number;
  instructorShareMinor: number;
};

const sourceCourses = [
  { id: 1, title: "أساسيات التصميم وتجربة المستخدم", instructor: "سارة العتيبي", priceSar: 189 },
  { id: 2, title: "تحليل البيانات باستخدام بايثون", instructor: "عمر الشمري", priceSar: 229 },
  { id: 3, title: "التسويق الرقمي من الصفر للاحتراف", instructor: "ليان الحربي", priceSar: 159 },
  { id: 4, title: "تصوير المنتجات بالجوال", instructor: "فيصل الدوسري", priceSar: 139 },
  { id: 5, title: "إطلاق مشروعك التجاري الأول", instructor: "نورة القحطاني", priceSar: 199 },
  { id: 6, title: "الهوية البصرية وبناء العلامة", instructor: "سارة العتيبي", priceSar: 179 },
] as const;

export const paidCourseCatalog: readonly PaidCourse[] = sourceCourses.map((course) => {
  const amountMinor = course.priceSar * 100;
  const platformFeeMinor = Number(calculatePlatformFee(amountMinor, COURSE_PLATFORM_FEE_BPS));
  return {
    ...course,
    amountMinor,
    platformFeeBps: COURSE_PLATFORM_FEE_BPS,
    platformFeeMinor,
    instructorShareMinor: amountMinor - platformFeeMinor,
  };
});

export function getPaidCourse(courseId: number): PaidCourse | undefined {
  return paidCourseCatalog.find((course) => course.id === courseId);
}

export function stripeCredentialsReady(input: { secretKey: string; webhookSecret: string }): boolean {
  return /^sk_test_[A-Za-z0-9_]+$/.test(input.secretKey)
    && /^whsec_[A-Za-z0-9_]+$/.test(input.webhookSecret);
}

export function stripeTestApiKeyReady(secretKey: string): boolean {
  return /^sk_test_[A-Za-z0-9_]+$/.test(secretKey);
}

export function stripeEventModeMatches(secretKey: string, liveMode: unknown): boolean {
  return secretKey.startsWith("sk_test_") && liveMode === false;
}

export function getCheckoutOrigin(input: {
  originHeader?: string;
  host?: string;
  isProduction: boolean;
}): string {
  if (!input.originHeader) throw new Error("Missing checkout origin");
  let origin: URL;
  try {
    origin = new URL(input.originHeader);
  } catch {
    throw new Error("Invalid checkout origin");
  }
  const trustedHost = (input.host ?? "").split(",")[0]?.trim();
  if (!trustedHost || origin.host.toLowerCase() !== trustedHost.toLowerCase()) {
    throw new Error("Checkout origin does not match the current host");
  }
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Invalid checkout origin");
  }
  const localHttp = !input.isProduction && origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !localHttp) {
    throw new Error("Checkout requires a secure origin");
  }
  return origin.origin;
}

export function buildCourseCheckoutForm(input: {
  orderId: string;
  userId: number;
  course: PaidCourse;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("client_reference_id", String(input.userId));
  form.set("locale", "auto");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", STRIPE_CURRENCY);
  form.set("line_items[0][price_data][unit_amount]", String(input.course.amountMinor));
  form.set("line_items[0][price_data][product_data][name]", input.course.title);
  form.set("line_items[0][price_data][product_data][description]", `دورة تعليمية من رِواق — ${input.course.instructor}`);
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  if (input.customerEmail) form.set("customer_email", input.customerEmail);
  form.set("metadata[orderId]", input.orderId);
  form.set("metadata[userId]", String(input.userId));
  form.set("metadata[courseId]", String(input.course.id));
  form.set("payment_intent_data[metadata][orderId]", input.orderId);
  form.set("payment_intent_data[metadata][courseId]", String(input.course.id));
  return form;
}

export type CheckoutSessionSnapshot = {
  id?: unknown;
  livemode?: unknown;
  status?: unknown;
  mode?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  client_reference_id?: unknown;
  metadata?: Record<string, unknown> | null;
};

export type CheckoutOrderSnapshot = {
  orderId: string;
  userId: number;
  courseId: number;
  stripeSessionId: string | null;
  amountMinor: number;
  currency: string;
};

export function isCourseCheckoutSession(session: CheckoutSessionSnapshot, order: CheckoutOrderSnapshot): boolean {
  return session.livemode === false
    && session.id === order.stripeSessionId
    && session.mode === "payment"
    && session.amount_total === order.amountMinor
    && typeof session.currency === "string"
    && session.currency.toLowerCase() === order.currency.toLowerCase()
    && session.client_reference_id === String(order.userId)
    && session.metadata?.orderId === order.orderId
    && session.metadata?.userId === String(order.userId)
    && session.metadata?.courseId === String(order.courseId);
}

export function isPaidCourseCheckoutSession(session: CheckoutSessionSnapshot, order: CheckoutOrderSnapshot): boolean {
  return isCourseCheckoutSession(session, order) && session.status === "complete" && session.payment_status === "paid";
}
