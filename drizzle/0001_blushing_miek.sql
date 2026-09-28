ALTER TABLE `users` ADD `emailNotifications` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `phoneNumber` varchar(16);--> statement-breakpoint
ALTER TABLE `users` ADD `smsOptIn` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `smsOptInAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `smsOptOutAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `lastEmailTestAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `lastSmsTestAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `aiDailyRequestDate` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `aiDailyRequests` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastAiRequestAt` timestamp;