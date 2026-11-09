import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { ConnectionConfig } from "@mcp-studio/types";
import type { OAuthCredentials } from "@mcp-studio/mcp-client";

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  connectionConfig: text("connection_config", { mode: "json" })
    .$type<ConnectionConfig | null>()
    .default(null),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** OAuth tokens and client registration for one Connection, bound to the MCP Server URL they were issued for. */
export const oauthCredentials = sqliteTable("oauth_credentials", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  serverUrl: text("server_url").notNull(),
  credentials: text("credentials", { mode: "json" }).$type<OAuthCredentials>().notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const environments = sqliteTable("environments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  variables: text("variables", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
