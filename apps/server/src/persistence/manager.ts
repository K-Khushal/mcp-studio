import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Collection, HistoryEntry, Environment } from "@mcp-studio/types";

const DATA_DIR = join(homedir(), ".mcp-studio");
const COLLECTIONS_FILE = join(DATA_DIR, "collections.json");
const HISTORY_FILE = join(DATA_DIR, "history.json");
const ENVIRONMENTS_FILE = join(DATA_DIR, "environments.json");
const HISTORY_LIMIT = 50;

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T): Promise<void> {
  await ensureDataDir();
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function readCollections(): Promise<Collection[]> {
  return readJson<Collection[]>(COLLECTIONS_FILE, []);
}

export async function writeCollections(collections: Collection[]): Promise<void> {
  await writeJson(COLLECTIONS_FILE, collections);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function readHistory(): Promise<HistoryEntry[]> {
  return readJson<HistoryEntry[]>(HISTORY_FILE, []);
}

export async function appendHistory(entry: HistoryEntry): Promise<HistoryEntry[]> {
  const history = await readHistory();
  const updated = [entry, ...history].slice(0, HISTORY_LIMIT);
  await writeJson(HISTORY_FILE, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export async function readEnvironments(): Promise<Environment[]> {
  return readJson<Environment[]>(ENVIRONMENTS_FILE, [
    { id: "default", name: "Local", variables: {}, isActive: true },
  ]);
}

export async function writeEnvironments(environments: Environment[]): Promise<void> {
  await writeJson(ENVIRONMENTS_FILE, environments);
}
