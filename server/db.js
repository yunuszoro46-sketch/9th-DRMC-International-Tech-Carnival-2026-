// Persistence: one SQLite file on disk, through Node's built-in driver (no npm package). The file is DB_FILE, or
// club.db in the project root; it is created on first start and never wiped or reseeded by the server.
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch {
  throw new Error(`This server needs Node.js 22.13 or newer for its built-in SQLite driver (node:sqlite). You are running ${process.version}.`);
}
const fs = require('fs');
const path = require('path');

// Schema changes are an ordered list; PRAGMA user_version records how many have run, so every database
// (fresh, pre-clubs, or in production) converges on the same schema and each step runs exactly once.
const MIGRATIONS = [
  // 1: original schema + the "clubs" upgrade (adds fests.club_id and files orphan fests under the IT Club)
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clubs (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, emoji TEXT);
      CREATE TABLE IF NOT EXISTS fests (
        id INTEGER PRIMARY KEY, club_id INTEGER REFERENCES clubs(id), name TEXT NOT NULL, description TEXT,
        starts_on TEXT, ends_on TEXT, venue TEXT);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY, fest_id INTEGER NOT NULL REFERENCES fests(id),
        title TEXT NOT NULL, category TEXT, description TEXT, venue TEXT,
        starts_at TEXT, deadline TEXT, capacity INTEGER NOT NULL,
        auto_confirm INTEGER NOT NULL DEFAULT 0,
        form_schema TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
        name TEXT NOT NULL, email TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL CHECK (status IN ('PENDING','CONFIRMED','REJECTED','CANCELLED')),
        manage_token TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_live_reg ON registrations(event_id, email) WHERE status != 'CANCELLED';
      CREATE TABLE IF NOT EXISTS volunteers (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, cls TEXT NOT NULL, roll TEXT NOT NULL, phone TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL, domain TEXT NOT NULL, why TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS passes (
        id INTEGER PRIMARY KEY, registration_id INTEGER UNIQUE NOT NULL REFERENCES registrations(id),
        token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','CHECKED_IN','REVOKED')),
        checked_in_at TEXT);
    `);
    if (!db.prepare('PRAGMA table_info(fests)').all().some((c) => c.name === 'club_id')) db.exec('ALTER TABLE fests ADD COLUMN club_id INTEGER REFERENCES clubs(id)');
    if (db.prepare('SELECT COUNT(*) n FROM fests WHERE club_id IS NULL').get().n) {
      db.prepare("INSERT OR IGNORE INTO clubs(name, slug, emoji, description) VALUES ('DRMC IT Club', 'it-club', '💻', 'Coding, AI, robotics and gaming.')").run();
      db.prepare("UPDATE fests SET club_id = (SELECT id FROM clubs WHERE slug = 'it-club') WHERE club_id IS NULL").run();
    }
  },
  // 2: archive support, event rules, CHECKED_IN as a real registration status, indexes.
  // SQLite can't alter a CHECK constraint, so registrations is rebuilt (copy -> drop -> rename) inside the migration transaction.
  (db) => {
    const has = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
    if (!has('fests', 'archived_at')) db.exec('ALTER TABLE fests ADD COLUMN archived_at TEXT');
    if (!has('events', 'archived_at')) db.exec('ALTER TABLE events ADD COLUMN archived_at TEXT');
    if (!has('events', 'rules')) db.exec("ALTER TABLE events ADD COLUMN rules TEXT NOT NULL DEFAULT ''");
    db.exec(`
      CREATE TABLE registrations_new (
        id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
        name TEXT NOT NULL, email TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL CHECK (status IN ('PENDING','CONFIRMED','REJECTED','CANCELLED','CHECKED_IN')),
        manage_token TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT);
      INSERT INTO registrations_new(id, event_id, name, email, answers, status, manage_token, created_at)
        SELECT id, event_id, name, email, answers, status, manage_token, created_at FROM registrations;
      DROP TABLE registrations;
      ALTER TABLE registrations_new RENAME TO registrations;
      CREATE UNIQUE INDEX uq_live_reg ON registrations(event_id, email) WHERE status != 'CANCELLED';
      CREATE INDEX idx_reg_event_status ON registrations(event_id, status);
      CREATE INDEX idx_events_fest ON events(fest_id);
      UPDATE registrations SET status = 'CHECKED_IN'
        WHERE status = 'CONFIRMED' AND id IN (SELECT registration_id FROM passes WHERE status = 'CHECKED_IN');
    `);
  },
];

function migrate(db) {
  const version = () => db.prepare('PRAGMA user_version').get().user_version;
  db.exec('PRAGMA foreign_keys = OFF'); // required while rebuilding a referenced table; restored below
  try {
    for (let v = version(); v < MIGRATIONS.length; v = version()) {
      db.exec('BEGIN IMMEDIATE');
      try { MIGRATIONS[v](db); db.exec(`PRAGMA user_version = ${v + 1}`); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  } finally { db.exec('PRAGMA foreign_keys = ON'); }
}

function open(file = process.env.DB_FILE || path.join(__dirname, '..', 'club.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

// One immediate (write-locking) transaction; callers never nest.
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
module.exports = { open, transaction, migrate, MIGRATIONS };
