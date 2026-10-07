// Proves that data survives the server: a real server process on a real SQLite file is stopped (cleanly, then killed
// outright) and started again, and everything written through the HTTP API is read back.
//   node tools/persistence-check.mjs            (no dependencies; uses a temporary database, never ./club.db)
// Also checks: startup never seeds or wipes, seeding is idempotent, --reset is refused in production, the database
// file is not reachable over HTTP, and a database failure reaches the client as the generic 500, never as SQLite text.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "club-persist-")), DB = path.join(tmp, "data", "club.db");
const PORT = 3900 + Math.floor(Math.random() * 90), BASE = `http://localhost:${PORT}`, KEY = "persist-key";
const env = { ...process.env, DB_FILE: DB, PORT: String(PORT), ORGANIZER_KEY: KEY, PASS_SECRET: "persist-secret", NODE_ENV: "development", RATE_LIMIT_PER_MIN: "100000", ADMIN_RATE_LIMIT_PER_MIN: "100000" };
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log("  ok  " + name); } catch (e) { results.push(false); console.log("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 4).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const same = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m || "differs"}:\n      got  ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`);
const api = async (method, p, body, admin) => { const r = await fetch(BASE + p, { method, headers: { "content-type": "application/json", ...(admin ? { "x-organizer-key": KEY } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ } return { status: r.status, body: j, text: t }; };
const A = (m, p, b) => api(m, p, b, true);
const node = (...args) => spawnSync(process.execPath, ["--no-warnings", ...args], { cwd: root, env, encoding: "utf8" });

let child = null;
async function start() {
  child = spawn(process.execPath, ["--no-warnings", "server/index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; child.stderr.on("data", (d) => { err += d; });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 50)); }
  throw new Error("server did not start: " + err);
}
const stop = (signal) => new Promise((ok) => { if (!child) return ok(); child.once("exit", () => { child = null; ok(); }); child.kill(signal); });
const counts = () => { const db = new DatabaseSync(DB, { readOnly: true }); const n = Object.fromEntries(["clubs", "fests", "events", "registrations", "passes", "volunteers"].map((t) => [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n])); db.close(); return n; };
const future = (d) => new Date(Date.now() + d * 864e5).toISOString();

console.log(`database file: ${DB}\n`);
console.log("[1] Seeding and startup");
let seeded;
await check("a clean database is created and seeded by `node server/seed.js` (the folder is created too)", async () => {
  assert(!fs.existsSync(DB), "starts clean"); const r = node("server/seed.js"); assert(r.status === 0 && /^Seeded:/.test(r.stdout), r.stdout + r.stderr);
  assert(fs.existsSync(DB), "file exists"); seeded = counts(); assert(seeded.clubs > 0 && seeded.fests > 0 && seeded.events > 0 && seeded.registrations > 0 && seeded.passes > 0, JSON.stringify(seeded));
});
await check("starting the server neither seeds again nor wipes: the API serves exactly the seeded records", async () => {
  await start(); same(counts(), seeded, "row counts after startup");
  const s = (await A("GET", "/api/admin/stats")).body; assert(s.registrations.total === seeded.registrations, "registrations via API"); assert((await api("GET", "/api/clubs")).body.length === seeded.clubs, "clubs via API");
});
await check("restart, then seed again: still the same records, no duplicates; --reset is refused in production", async () => {
  await stop("SIGTERM"); await start(); same(counts(), seeded, "after a restart"); await stop("SIGTERM");
  const again = node("server/seed.js"); assert(again.status === 0 && /seed skipped/.test(again.stdout), again.stdout); same(counts(), seeded, "after seeding twice");
  const prod = spawnSync(process.execPath, ["--no-warnings", "server/seed.js", "--reset"], { cwd: root, env: { ...env, NODE_ENV: "production" }, encoding: "utf8" });
  assert(prod.status !== 0 && /Refusing --reset in production/.test(prod.stderr), "reset refused: " + prod.stderr); same(counts(), seeded, "nothing wiped"); await start();
});

console.log("\n[2] Records written through the API survive a clean restart");
const snap = {}; const stamp = Date.now().toString(36);
const SCHEMA = [{ key: "team", label: "Team name", type: "text", required: true }, { key: "mail", label: "Guardian email", type: "email", required: false }, { key: "mobile", label: "Mobile", type: "tel", required: true },
  { key: "members", label: "Members", type: "number", required: true }, { key: "track", label: "Track", type: "select", required: true, options: ["Beginner", "Advanced"] }, { key: "about", label: "About", type: "textarea", required: false }];
const read = async () => ({
  fest: (await A("GET", `/api/admin/fests/${snap.festId}`)).body, event: (await A("GET", `/api/admin/events/${snap.eventId}`)).body, publicEvent: (await api("GET", `/api/events/${snap.eventId}`)).body,
  archivedEvent: (await A("GET", `/api/admin/events/${snap.archivedId}`)).body, archivedPublic: (await api("GET", `/api/events/${snap.archivedId}`)).status,
  confirmed: (await api("GET", `/api/registrations/${snap.tokens.confirmed}`)).body, checkedIn: (await api("GET", `/api/registrations/${snap.tokens.checkedIn}`)).body,
  cancelled: (await api("GET", `/api/registrations/${snap.tokens.cancelled}`)).body, rejected: (await api("GET", `/api/registrations/${snap.tokens.rejected}`)).body,
  adminRows: (await A("GET", `/api/admin/registrations?event=${snap.eventId}&limit=200`)).body, volunteers: (await A("GET", "/api/admin/volunteers")).body.filter((v) => v.email.includes(stamp)),
  csv: (await A("GET", `/api/admin/events/${snap.eventId}/export.csv`)).text, stats: (await A("GET", "/api/admin/stats")).body.registrations,
});
await check("create a fest, an event with a six-type form, registrations in every status, passes, a check-in and a volunteer", async () => {
  const clubId = (await api("GET", "/api/clubs")).body[0].id;
  const fest = await A("POST", "/api/admin/fests", { club_id: clubId, name: `Persist Fest ${stamp}`, description: "Kept across restarts", starts_on: "2027-01-10", ends_on: "2027-01-11", venue: "Hall" }); assert(fest.status === 201, JSON.stringify(fest.body)); snap.festId = fest.body.id;
  const ev = await A("POST", "/api/admin/events", { fest_id: snap.festId, title: `Persist Event ${stamp}`, category: "Test", description: "d", rules: "Line 1\nLine 2", venue: "Lab", starts_at: future(30), deadline: future(29), capacity: 9, auto_confirm: true, form_schema: SCHEMA });
  assert(ev.status === 201, JSON.stringify(ev.body)); snap.eventId = ev.body.id;
  const arch = await A("POST", "/api/admin/events", { fest_id: snap.festId, title: `Persist Archived ${stamp}`, category: "Test", description: "", rules: "", venue: "Lab", starts_at: future(30), deadline: future(29), capacity: 3, auto_confirm: false, form_schema: [] });
  snap.archivedId = arch.body.id; await A("POST", `/api/admin/events/${snap.archivedId}/archive`);
  const answers = (i) => ({ team: `Team ${i}`, mobile: "01712-345678", members: String(i), track: "Advanced", about: "two\nlines" });
  const reg = async (i) => { const r = await api("POST", `/api/events/${snap.eventId}/register`, { name: `Person ${i}`, email: `p${i}.${stamp}@example.com`, answers: answers(i) }); assert(r.status === 201, JSON.stringify(r.body)); return r.body; };
  const [a, b, c, d] = [await reg(1), await reg(2), await reg(3), await reg(4)]; snap.tokens = { confirmed: a.manage_token, checkedIn: b.manage_token, cancelled: c.manage_token, rejected: d.manage_token };
  assert((await A("POST", `/api/admin/registrations/${b.id}/check-in`)).status === 200, "check-in"); assert((await api("POST", `/api/registrations/${c.manage_token}/cancel`, {})).status === 200, "cancel");
  assert((await A("PATCH", `/api/admin/registrations/${d.id}`, { status: "REJECTED" })).status === 200, "reject");
  assert((await api("POST", "/api/volunteers", { name: "Persist Volunteer", cls: "10 A", roll: "7", phone: "01712345678", email: `vol.${stamp}@example.com`, domain: "Robotics", why: "I want to help run the robotics events." })).status === 201, "volunteer");
  snap.before = await read();
  same(snap.before.event.form_schema, SCHEMA, "form schema as stored"); assert(typeof snap.before.event.id === "number" && snap.before.event.auto_confirm === true && snap.before.event.capacity === 9, "types kept");
  assert(snap.before.confirmed.status === "CONFIRMED" && snap.before.confirmed.pass_token, "confirmed has a pass"); assert(snap.before.checkedIn.status === "CHECKED_IN" && snap.before.checkedIn.checked_in_at, "checked in");
  assert(snap.before.cancelled.status === "CANCELLED" && snap.before.rejected.status === "REJECTED" && snap.before.archivedPublic === 404 && snap.before.archivedEvent.archived === true, "statuses");
});
await check("clean stop (SIGTERM) and start: every record is identical, field for field", async () => {
  await stop("SIGTERM"); await start(); const after = await read();
  for (const k of Object.keys(snap.before)) same(after[k], snap.before[k], `"${k}" after a restart`);
});
await check("the saved form still drives registration after the restart, and the state machine still holds", async () => {
  const bad = await api("POST", `/api/events/${snap.eventId}/register`, { name: "Late Person", email: `late.${stamp}@example.com`, answers: { team: "T", mobile: "01712345678", members: "x", track: "Advanced" } });
  assert(bad.status === 400 && bad.body.field === "members", "number field still validated: " + JSON.stringify(bad.body));
  const dup = await api("POST", `/api/events/${snap.eventId}/register`, { name: "Person 1", email: `p1.${stamp}@example.com`, answers: { team: "T", mobile: "01712345678", members: "2", track: "Advanced" } }); assert(dup.status === 409 && dup.body.error === "duplicate_registration", "duplicate still refused");
  const id = snap.before.adminRows.items.find((r) => r.status === "CHECKED_IN").id; const back = await A("PATCH", `/api/admin/registrations/${id}`, { status: "CANCELLED" }); assert(back.status === 409 && back.body.error === "invalid_transition", "CHECKED_IN is still final");
  assert((await A("POST", `/api/admin/registrations/${id}/check-in`)).status === 409, "a used pass is still used");
});

console.log("\n[3] Crash safety, exposure, errors");
await check("hard kill (SIGKILL, no clean shutdown) right after a write: the write is still there on restart", async () => {
  const r = await api("POST", `/api/events/${snap.eventId}/register`, { name: "Crash Person", email: `crash.${stamp}@example.com`, answers: { team: "C", mobile: "01712345678", members: "2", track: "Beginner" } }); assert(r.status === 201, JSON.stringify(r.body));
  await stop("SIGKILL"); await start(); const v = await api("GET", `/api/registrations/${r.body.manage_token}`); assert(v.status === 200 && v.body.name === "Crash Person" && v.body.pass_token, "registration and pass survived the crash");
  const after = await read(); for (const k of ["checkedIn", "cancelled", "rejected", "confirmed", "archivedEvent", "volunteers"]) same(after[k], snap.before[k], `"${k}" intact after the crash`);
  assert(after.event.taken === snap.before.event.taken + 1 && after.fest.taken === snap.before.fest.taken + 1, "the new registration is counted exactly once");
});
await check("the database is not reachable over HTTP, and SQLite settings are as intended (WAL, foreign keys)", async () => {
  for (const p of ["/club.db", "/data/club.db", "/../club.db", "/%2e%2e/club.db", "/server/db.js", "/.env"]) { const r = await fetch(BASE + p); const t = await r.text(); assert(!t.startsWith("SQLite format 3") && !t.includes("DatabaseSync"), `${p} leaked`); assert(r.status === 404 || /<!doctype html>/i.test(t), `${p}: ${r.status}`); }
  const { open } = require(path.join(root, "server", "db.js")); const db = open(DB); assert(db.prepare("PRAGMA foreign_keys").get().foreign_keys === 1, "foreign keys on"); assert(db.prepare("PRAGMA journal_mode").get().journal_mode === "wal", "WAL");
  let refused = false; try { db.prepare("INSERT INTO events(fest_id,title,capacity) VALUES (999999,'orphan',1)").run(); } catch { refused = true; } assert(refused, "an event without a fest is refused by the database"); db.close();
});
await check("a database failure reaches the client as the generic 500 only: no SQLite text, table names or stack", async () => {
  const breaker = new DatabaseSync(DB); breaker.exec("ALTER TABLE volunteers RENAME TO volunteers_gone"); breaker.close();
  const r = await api("POST", "/api/volunteers", { name: "Error Probe", cls: "10 A", roll: "7", phone: "01712345678", email: `probe.${stamp}@example.com`, domain: "Robotics", why: "Checking what an error looks like." });
  const fix = new DatabaseSync(DB); fix.exec("ALTER TABLE volunteers_gone RENAME TO volunteers"); fix.close();
  assert(r.status === 500, "status " + r.status); same(r.body, { error: "internal_error", message: "Something went wrong on our side. Please try again." }, "error body"); assert(!/sqlite|no such table|volunteers|at\s+\S+\s+\(|SELECT|INSERT/i.test(r.text), "leaked: " + r.text);
  assert((await api("GET", "/api/health")).status === 200 && (await A("GET", "/api/admin/volunteers")).status === 200, "server kept running and recovered");
});
await stop("SIGTERM");
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${results.filter(Boolean).length}/${results.length} persistence checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
