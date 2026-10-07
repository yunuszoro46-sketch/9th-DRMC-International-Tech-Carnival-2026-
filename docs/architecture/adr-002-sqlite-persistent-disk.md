# ADR-002: SQLite on a persistent disk volume

- **Status:** Accepted
- **Date:** 2026-10-05

## Context
Traffic is bursty and small: a few hundred participants, spikes when registration opens, near zero otherwise.
The hard requirement is correctness under concurrency (never oversell a seat) and never losing registrations.
A managed Postgres adds cost, credentials, and a second thing to run.

## Decision
Use the built-in `node:sqlite` with a single database file on a **persistent disk** mounted at `/data`
(`DB_FILE=/data/club.db`).

- `PRAGMA journal_mode = WAL` for concurrent readers during writes, `busy_timeout = 5000`, `foreign_keys = ON`.
- Capacity is enforced inside `BEGIN IMMEDIATE` transactions: the seat count check and the insert are one atomic unit
  (covered by the "50 concurrent registrations never oversell" test). A partial unique index also makes
  "one live registration per email per event" a database guarantee.
- **Seeding never destroys data.** `seed()` inserts demo data only when the `events` table is empty; restarts and
  redeploys keep every registration. Wiping is an explicit local-dev command (`npm run seed:reset`) that refuses to run
  when `NODE_ENV=production`.
- Timestamps are stored as UTC ISO 8601 strings (`...Z`). Naive legacy strings are interpreted as UTC, never as
  server-local time.
- The Docker image declares `VOLUME /data`; without a mounted disk the container filesystem is ephemeral and data is
  lost on redeploy. Mounting the disk is a deployment requirement, not an option.

## Consequences
**Good**
- One file to back up (copy `club.db` plus `club.db-wal`, or use `sqlite3 .backup`). Zero extra services.
- Transactions give us the strong guarantees we need with very little code.

**Costs we accept**
- **Single writer, single instance.** SQLite on a network or shared volume with multiple app instances is unsafe.
  Run exactly one instance (no horizontal scaling). The in-memory rate limiter has the same per-instance limit.
- Deploys cause a short restart gap because only one process may own the file.
- A lost or unmounted disk means lost data. Mitigation: scheduled copies of the database file to off-box storage.
- Migrating to Postgres later is feasible because all SQL lives in `server/repository/*` behind small functions, but
  it would not be free (placeholder syntax, transactions, `CURRENT_TIMESTAMP` defaults).

## Revisit when
We need more than one app instance, multi-region reads, or sustained write rates beyond a single SQLite writer
(thousands of registrations per minute).
