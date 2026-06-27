import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    owner_email   TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    trial_ends_at TEXT NOT NULL,
    plan_status   TEXT NOT NULL DEFAULT 'trialing',  -- trialing | active | past_due | canceled
    stripe_customer_id TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 30,
    price_cents INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Working hours: one row per weekday the business is open.
  -- weekday: 0=Sunday ... 6=Saturday. Times stored as "HH:MM".
  CREATE TABLE IF NOT EXISTS availability (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    weekday     INTEGER NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    UNIQUE(business_id, weekday)
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id    INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    customer_name  TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    starts_at     TEXT NOT NULL,   -- ISO "YYYY-MM-DDTHH:MM"
    ends_at       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | canceled
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appt_business_start
    ON appointments(business_id, starts_at);
`);

export default db;
