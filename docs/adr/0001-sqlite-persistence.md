# SQLite via Drizzle for local persistence

The PRD specified JSON files under `~/.mcp-studio/`. We store Collections, Requests and Environments in SQLite (`~/.mcp-studio/studio.db`) via Drizzle ORM on `bun:sqlite` instead, for granular CRUD, referential integrity (cascade delete of Requests), and versioned migrations. Still local-only: no accounts, no cloud.
