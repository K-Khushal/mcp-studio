import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { ConnectionConfig } from "@mcp-studio/types";

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tool: text("tool").notNull(),
  params: text("params", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  connectionConfig: text("connection_config", { mode: "json" })
    .$type<ConnectionConfig | null>()
    .default(null),
  createdAt: integer("created_at").notNull(),
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
