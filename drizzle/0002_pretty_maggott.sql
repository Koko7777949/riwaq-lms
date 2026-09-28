CREATE TABLE `course_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`courseId` int NOT NULL,
	`orderId` varchar(36) NOT NULL,
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `course_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_enrollments_orderId_unique` UNIQUE(`orderId`),
	CONSTRAINT `course_enrollments_user_course_uq` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
CREATE TABLE `course_orders` (
	`orderId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`courseId` int NOT NULL,
	`stripeSessionId` varchar(255),
	`checkoutUrl` text,
	`checkoutAttempts` int NOT NULL DEFAULT 1,
	`expiresAt` timestamp,
	`amountMinor` int NOT NULL,
	`platformFeeBps` int NOT NULL,
	`platformFeeMinor` int NOT NULL,
	`instructorShareMinor` int NOT NULL,
	`currency` varchar(3) NOT NULL,
	`status` enum('pending','paid','expired','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	CONSTRAINT `course_orders_orderId` PRIMARY KEY(`orderId`),
	CONSTRAINT `course_orders_stripeSessionId_unique` UNIQUE(`stripeSessionId`),
	CONSTRAINT `course_orders_user_course_uq` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
CREATE TABLE `stripe_checkout_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` varchar(36) NOT NULL,
	`attemptNo` int NOT NULL,
	`idempotencyKey` varchar(100) NOT NULL,
	`stripeSessionId` varchar(255),
	`checkoutUrl` text,
	`attemptStatus` enum('pending','paid','expired','failed') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_checkout_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_checkout_attempts_idempotencyKey_unique` UNIQUE(`idempotencyKey`),
	CONSTRAINT `stripe_checkout_attempts_stripeSessionId_unique` UNIQUE(`stripeSessionId`),
	CONSTRAINT `stripe_checkout_attempt_order_no_uq` UNIQUE(`orderId`,`attemptNo`)
);
--> statement-breakpoint
CREATE TABLE `stripe_webhook_events` (
	`eventId` varchar(255) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_webhook_events_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_enrollments` ADD CONSTRAINT `course_enrollments_orderId_course_orders_orderId_fk` FOREIGN KEY (`orderId`) REFERENCES `course_orders`(`orderId`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `course_orders` ADD CONSTRAINT `course_orders_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stripe_checkout_attempts` ADD CONSTRAINT `stripe_checkout_attempts_orderId_course_orders_orderId_fk` FOREIGN KEY (`orderId`) REFERENCES `course_orders`(`orderId`) ON DELETE no action ON UPDATE no action;