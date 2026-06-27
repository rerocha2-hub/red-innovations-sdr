import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- The account: one solo sales rep.
  CREATE TABLE IF NOT EXISTS reps (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    trial_ends_at TEXT NOT NULL,
    plan_status   TEXT NOT NULL DEFAULT 'trialing',  -- trialing | active | past_due | canceled
    stripe_customer_id TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Pipeline stages, ordered. Terminal stages flagged by 'kind'.
  CREATE TABLE IF NOT EXISTS stages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_id    INTEGER NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    position  INTEGER NOT NULL,
    kind      TEXT NOT NULL DEFAULT 'open'  -- open | won | lost
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_id     INTEGER NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    company    TEXT,
    email      TEXT,
    phone      TEXT,
    notes      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_id        INTEGER NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
    contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    title         TEXT NOT NULL,
    value_cents   INTEGER NOT NULL DEFAULT 0,
    stage_id      INTEGER NOT NULL REFERENCES stages(id),
    status        TEXT NOT NULL DEFAULT 'open',   -- open | won | lost
    next_action      TEXT,        -- "Ligar de novo", "Enviar proposta"...
    next_action_at   TEXT,        -- ISO date/time when the rep should act
    last_activity_at TEXT,        -- updated whenever an activity is logged
    closed_at     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_deals_rep_status ON deals(rep_id, status);
  CREATE INDEX IF NOT EXISTS idx_deals_next_action ON deals(rep_id, next_action_at);

  -- Activity log: the "1-tap" interactions that keep deals warm.
  CREATE TABLE IF NOT EXISTS activities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_id     INTEGER NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
    deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'note',  -- call | email | meeting | whatsapp | note
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id, created_at);
`);

// Default pipeline stages created for every new rep.
export const DEFAULT_STAGES = [
  { name: 'Novo lead', kind: 'open' },
  { name: 'Contatado', kind: 'open' },
  { name: 'Qualificado', kind: 'open' },
  { name: 'Proposta', kind: 'open' },
  { name: 'Negociação', kind: 'open' },
  { name: 'Ganho', kind: 'won' },
  { name: 'Perdido', kind: 'lost' },
];

export default db;
