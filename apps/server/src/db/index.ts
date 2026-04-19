import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const DATA_DIR = join(homedir(), ".mcp-studio");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(join(DATA_DIR, "studio.db"));

// Enable foreign keys (SQLite disables them by default)
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, "../../drizzle");

migrate(db, { migrationsFolder });
console.log("[db] Migrations applied");
