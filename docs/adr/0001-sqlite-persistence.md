# SQLite via Drizzle for local persistence

The PRD specified JSON files under `~/.mcp-studio/`. We store Collections, Connections and Environments in SQLite (`~/.mcp-studio/studio.db`) via Drizzle ORM on `bun:sqlite` instead, for granular CRUD, referential integrity (cascade delete of Connections), and versioned migrations. Still local-only: no accounts, no cloud.
