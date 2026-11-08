import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fullFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

// Migrations folder frozen at the schema that predates OAuth credential storage.
function preOAuthFolder(): string {
  const folder = join(mkdtempSync(join(tmpdir(), "studio-migrations-")), "drizzle");
  cpSync(fullFolder, folder, { recursive: true });
  const journalPath = join(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag <= "0002_rename_requests_to_connections");
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe("OAuth credentials migration", () => {
  it("keeps existing Collections, Connections and Environments, and credentials follow their Connection", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: preOAuthFolder() });
    const config = JSON.stringify({ transport: "http", config: { url: "http://x/mcp", headers: {}, auth: { type: "bearer", token: "{{TOKEN}}" } } });
    sqlite.exec("INSERT INTO collections (id, name, created_at, updated_at) VALUES ('c1', 'Mine', 1, 2)");
    sqlite.query("INSERT INTO connections (id, collection_id, name, connection_config, created_at, updated_at) VALUES ('r1', 'c1', 'Remote', ?, 3, 4)").run(config);
    sqlite.exec(`INSERT INTO environments (id, name, variables, is_active, created_at, updated_at) VALUES ('e1', 'Dev', '{"TOKEN":"t"}', 1, 5, 6)`);

    migrate(db, { migrationsFolder: fullFolder });

    expect(sqlite.query("SELECT * FROM collections").all()).toEqual([{ id: "c1", name: "Mine", created_at: 1, updated_at: 2 }]);
    expect(sqlite.query("SELECT * FROM connections").all()).toEqual([
      { id: "r1", collection_id: "c1", name: "Remote", connection_config: config, created_at: 3, updated_at: 4 },
    ]);
    expect(sqlite.query("SELECT * FROM environments").all()).toEqual([
      { id: "e1", name: "Dev", variables: '{"TOKEN":"t"}', is_active: 1, created_at: 5, updated_at: 6 },
    ]);
    expect(sqlite.query("SELECT * FROM oauth_credentials").all()).toEqual([]);

    sqlite.exec(`INSERT INTO oauth_credentials (connection_id, server_url, credentials, updated_at) VALUES ('r1', 'http://x/mcp', '{}', 7)`);
    sqlite.exec("DELETE FROM connections WHERE id = 'r1'");
    expect(sqlite.query("SELECT * FROM oauth_credentials").all()).toEqual([]);
  });
});
