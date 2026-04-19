// Use an in-memory SQLite DB for all tests; must be set before db/index.ts is imported
process.env["STUDIO_DB_PATH"] = ":memory:";
