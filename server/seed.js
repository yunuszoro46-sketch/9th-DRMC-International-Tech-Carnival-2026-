const { open } = require('./db');
const { loadConfig } = require('./config');
const { rand, signPass } = require('./domain/pass');
const { toIso } = require('./domain/registration');
const { createEventsRepo } = require('./repository/events');
const { buildCatalog, FORMS } = require('./seed-data');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const NAMES = ['Ayesha Rahman', 'Tanvir Hasan', 'Nusrat Jahan', 'Rafi Ahmed', 'Mehnaz Akter', 'Sabbir Hossain', 'Farhana Islam', 'Imran Khan'];

// Seeds the DRMC catalogue (clubs > fests > events) ONLY when the events table is empty. Never touches existing registrations.
// `force` (CLI --reset, refused in production) wipes and re-seeds for local demos. Dates are relative to `now`.
function seed(db = open(), { force = false, now = new Date() } = {}) {
  const events = createEventsRepo(db);
  if (!force && events.count() > 0) return db;
  const secret = loadConfig().passSecret;
  const q = (sql) => db.prepare(sql);
  db.exec('BEGIN');
  try {
    if (force) db.exec('DELETE FROM passes; DELETE FROM registrations; DELETE FROM events; DELETE FROM fests; DELETE FROM clubs;');
    const byTitle = {};
    for (const c of buildCatalog(now)) {
      const cid = Number(q('INSERT OR IGNORE INTO clubs(name,slug,description,emoji) VALUES (?,?,?,?)').run(c.name, slug(c.name), c.description, c.emoji).lastInsertRowid)
        || q('SELECT id FROM clubs WHERE slug = ?').get(slug(c.name)).id;
      for (const f of c.fests) {
        const fid = Number(q('INSERT INTO fests(club_id,name,description,starts_on,ends_on,venue) VALUES (?,?,?,?,?,?)').run(cid, f.name, f.description, f.starts_on, f.ends_on, f.venue).lastInsertRowid);
        for (const e of f.events) byTitle[e.title] = Number(q('INSERT INTO events(fest_id,title,category,description,rules,venue,starts_at,deadline,capacity,auto_confirm,form_schema) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(fid, e.title, e.category, e.description, e.rules, e.venue, toIso(e.start), toIso(e.deadline), e.capacity, e.auto ? 1 : 0, JSON.stringify(FORMS[e.form])).lastInsertRowid);
      }
    }
    // Sample activity on the IT Club so dashboards, capacity bars and the check-in screen have something to show.
    // Participants are obviously fake (@example.com); statuses cover every state of the lifecycle.
    const reg = q('INSERT INTO registrations(event_id,name,email,answers,status,manage_token) VALUES (?,?,?,?,?,?)');
    const pass = q('INSERT INTO passes(registration_id,token,status,checked_in_at) VALUES (?,?,?,?)');
    const checkedAt = new Date(now.getTime() - 864e5).toISOString();
    const mk = (title, name, answers, status) => {
      const id = Number(reg.run(byTitle[title], name, `${name.split(' ')[0].toLowerCase()}@example.com`, JSON.stringify(answers), status, rand()).lastInsertRowid);
      if (status === 'CONFIRMED') pass.run(id, signPass(id, secret), 'ISSUED', null);
      if (status === 'CHECKED_IN') pass.run(id, signPass(id, secret), 'CHECKED_IN', checkedAt);
    };
    const solo = { year: '2nd' }, contest = (i) => ({ team: `Team ${i + 1}`, size: '2', phone: '01000000000' });
    NAMES.slice(0, 5).forEach((n, i) => mk('Intro to Git & GitHub', n, solo, i < 4 ? 'CHECKED_IN' : 'CONFIRMED'));   // past: attended + a no-show
    NAMES.slice(0, 4).forEach((n, i) => mk('Capture the Flag Warm-up', n, { team: `Crew ${i + 1}`, size: '1' }, 'CHECKED_IN'));
    NAMES.slice(0, 6).forEach((n, i) => mk('Opening Keynote', n, solo, i < 4 ? 'CHECKED_IN' : i === 4 ? 'CONFIRMED' : 'CANCELLED'));
    NAMES.slice(0, 4).forEach((n) => mk('AI Web Development Contest', n, solo, 'CONFIRMED'));                          // open, auto-confirm
    NAMES.slice(0, 6).forEach((n, i) => mk('Programming Contest', n, contest(i), i % 3 === 0 ? 'PENDING' : 'CONFIRMED')); // open, approval required
    NAMES.slice(0, 4).forEach((n, i) => mk('Robotics Challenge', n, { team: `Bot ${i + 1}`, size: '2' }, i < 3 ? 'PENDING' : 'REJECTED')); // closed
    NAMES.slice(0, 5).forEach((n, i) => mk('Gaming Tournament', n, { team: `Squad ${i}`, size: '1' }, i < 2 ? 'CONFIRMED' : 'PENDING')); // FULL (capacity 5)
    NAMES.slice(2, 8).forEach((n) => mk('Workshop: Web in a Day', n, { year: '3rd' }, 'CONFIRMED'));
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return db;
}
module.exports = { seed };

if (require.main === module) {
  const config = loadConfig(), force = process.argv.includes('--reset');
  if (force && config.production) { console.error('Refusing --reset in production: it would wipe all registrations.'); process.exit(1); }
  const db = open(config.dbFile), n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  const had = createEventsRepo(db).count() > 0;
  seed(db, { force });
  console.log(had && !force ? `Database already has data: seed skipped (${n('events')} events, ${n('registrations')} registrations kept)`
    : `Seeded: ${n('clubs')} clubs, ${n('fests')} fests, ${n('events')} events, ${n('registrations')} registrations, ${n('passes')} passes`);
}
