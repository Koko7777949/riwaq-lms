import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  emailNotifications: boolean("emailNotifications").default(false).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 16 }),
  smsOptIn: boolean("smsOptIn").default(false).notNull(),
  smsOptInAt: timestamp("smsOptInAt"),
  smsOptOutAt: timestamp("smsOptOutAt"),
  lastEmailTestAt: timestamp("lastEmailTestAt"),
  lastSmsTestAt: timestamp("lastSmsTestAt"),
  aiDailyRequestDate: varchar("aiDailyRequestDate", { length: 10 }),
  aiDailyRequests: int("aiDailyRequests").default(0).notNull(),
  lastAiRequestAt: timestamp("lastAiRequestAt"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const courseOrders = mysqlTable("course_orders", {
  orderId: varchar("orderId", { length: 36 }).primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  courseId: int("courseId").notNull(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }).unique(),
  checkoutUrl: text("checkoutUrl"),
  checkoutAttempts: int("checkoutAttempts").default(1).notNull(),
  expiresAt: timestamp("expiresAt"),
  amountMinor: int("amountMinor").notNull(),
  platformFeeBps: int("platformFeeBps").notNull(),
  platformFeeMinor: int("platformFeeMinor").notNull(),
  instructorShareMinor: int("instructorShareMinor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "expired", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
}, (table) => ({
  userCourse: uniqueIndex("course_orders_user_course_uq").on(table.userId, table.courseId),
}));

export const courseEnrollments = mysqlTable("course_enrollments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  courseId: int("courseId").notNull(),
  orderId: varchar("orderId", { length: 36 }).notNull().references(() => courseOrders.orderId).unique(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
}, (table) => ({
  userCourse: uniqueIndex("course_enrollments_user_course_uq").on(table.userId, table.courseId),
}));

export const stripeWebhookEvents = mysqlTable("stripe_webhook_events", {
  eventId: varchar("eventId", { length: 255 }).primaryKey(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export const stripeCheckoutAttempts = mysqlTable("stripe_checkout_attempts", {
  id: int("id").autoincrement().primaryKey(),
  orderId: varchar("orderId", { length: 36 }).notNull().references(() => courseOrders.orderId),
  attemptNo: int("attemptNo").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 100 }).notNull().unique(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }).unique(),
  checkoutUrl: text("checkoutUrl"),
  status: mysqlEnum("attemptStatus", ["pending", "paid", "expired", "failed"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  orderAttempt: uniqueIndex("stripe_checkout_attempt_order_no_uq").on(table.orderId, table.attemptNo),
}));
