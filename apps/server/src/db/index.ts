import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const DATA_DIR = join(homedir(), ".mcp-studio");
const dbPath = process.env["STUDIO_DB_PATH"] ?? join(DATA_DIR, "studio.db");
if (dbPath !== ":memory:") {
  const directory = dirname(dbPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (directory === DATA_DIR) chmodSync(directory, 0o700);
}
const sqlite = new Database(dbPath);
if (dbPath !== ":memory:") chmodSync(dbPath, 0o600);

// Enable foreign keys (SQLite disables them by default)
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundledMigrations = join(__dirname, "drizzle");
const migrationsFolder = process.env["STUDIO_RESOURCE_DIR"]
  ? join(process.env["STUDIO_RESOURCE_DIR"], "drizzle")
  : existsSync(bundledMigrations) ? bundledMigrations : join(__dirname, "../../drizzle");

migrate(db, { migrationsFolder });
console.log("[db] Migrations applied");
