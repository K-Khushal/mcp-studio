import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fullFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

// Migrations folder frozen at the schema that predates the Connection rename.
function preRenameFolder(): string {
  const folder = join(mkdtempSync(join(tmpdir(), "studio-migrations-")), "drizzle");
  cpSync(fullFolder, folder, { recursive: true });
  const journalPath = join(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => e.tag <= "0001_handy_wendell_rand");
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe("Connection rename migration", () => {
  it("keeps rows saved as requests readable as Connections", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: preRenameFolder() });
    sqlite.exec(
      "INSERT INTO collections (id, name, created_at, updated_at) VALUES ('c1', 'Mine', 1, 2)"
    );
    sqlite
      .query(
        "INSERT INTO requests (id, collection_id, name, connection_config, created_at, updated_at) VALUES ('r1', 'c1', 'Local', ?, 3, 4)"
      )
      .run(JSON.stringify({ transport: "http", config: { url: "http://x", headers: {} } }));

    migrate(db, { migrationsFolder: fullFolder });

    const rows = sqlite.query("SELECT * FROM connections").all() as Record<string, unknown>[];
    expect(rows).toEqual([
      {
        id: "r1",
        collection_id: "c1",
        name: "Local",
        connection_config: JSON.stringify({
          transport: "http",
          config: { url: "http://x", headers: {} },
        }),
        created_at: 3,
        updated_at: 4,
      },
    ]);
    expect(sqlite.query("SELECT name FROM sqlite_master WHERE name = 'requests'").all()).toEqual(
      []
    );

    // FK to collections still cascades after the rename
    sqlite.exec("DELETE FROM collections WHERE id = 'c1'");
    expect(sqlite.query("SELECT * FROM connections").all()).toEqual([]);
  });
});
