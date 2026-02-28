import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import * as schema from '../db/schema';

const rawUrl = process.env.DATABASE_URL ?? 'file:./db/zkvote.db';
const dbPath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
const absPath = path.resolve(dbPath);

// Ensure the parent directory exists
mkdirSync(path.dirname(absPath), { recursive: true });

const sqlite = new Database(absPath);

// WAL mode for better read concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Bootstrap schema — idempotent, no migration runner needed for Phase 1
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS elections (
    id                 TEXT    PRIMARY KEY,
    title              TEXT    NOT NULL,
    description        TEXT    NOT NULL DEFAULT '',
    candidates         TEXT    NOT NULL,
    voting_start       TEXT    NOT NULL,
    voting_end         TEXT    NOT NULL,
    namespace          TEXT    NOT NULL,
    celestia_height    INTEGER NOT NULL,
    encryption_pubkey  TEXT,
    encryption_privkey TEXT,
    created_at         TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nullifiers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    election_id      TEXT    NOT NULL REFERENCES elections(id),
    nullifier        TEXT    NOT NULL,
    celestia_height  INTEGER NOT NULL,
    created_at       TEXT    NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS nullifiers_election_nullifier_uq
    ON nullifiers (election_id, nullifier);
`);

export const db = drizzle(sqlite, { schema });
