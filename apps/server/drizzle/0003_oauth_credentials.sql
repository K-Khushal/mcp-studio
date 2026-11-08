CREATE TABLE `oauth_credentials` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`server_url` text NOT NULL,
	`credentials` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
