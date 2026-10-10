// PREVIEW ONLY. Runs the project's REAL service, domain rules and route tables (server/services, server/domain,
// server/http/routes) in the browser, on top of in-memory tables instead of SQLite. Only the storage below is a
// stand-in: every validation, state transition, capacity check and error message is the real backend code.
// Data is the demo catalogue from server/seed-data.js plus the same sample registrations server/seed.js creates.
// Nothing is saved: a reload starts again from the sample data.
const { createClubService } = require('../../server/services/club');
const { toIso } = require('../../server/domain/registration');
const { buildCatalog, FORMS } = require('../../server/seed-data');
const { rand, signPass } = require('../../server/domain/pass');
const publicRoutes = require('../../server/http/routes/public');
const adminRoutes = require('../../server/http/routes/admin');

const ORGANIZER_KEY = 'demo-organizer-key', SECRET = 'preview-secret';
const KIND_STATUS = { validation: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, payload: 413, rate_limited: 429 };
const SEATS = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
const has = (s, q) => String(s || '').toLowerCase().includes(String(q).toLowerCase());
// Stand-in for the server's organizer JWT: same shape (so the app can read `exp`) but NOT signed, like everything here.
const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sessions = new Set();
const issueToken = () => { const now = Math.floor(Date.now() / 1000), t = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'organizer', iat: now, exp: now + 8 * 3600, jti: Math.random().toString(36).slice(2) })}.preview`; sessions.add(t); return t; };
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function createMemoryDb() {
  const T = { clubs: [], fests: [], events: [], registrations: [], passes: [], volunteers: [] }, seq = {};
  const next = (t) => (seq[t] = (seq[t] || 0) + 1);
  const byId = (t, id) => T[t].find((r) => r.id === Number(id));
  const drop = (t, id) => { const i = T[t].findIndex((r) => r.id === Number(id)); if (i >= 0) T[t].splice(i, 1); };
  const takenOf = (eventId) => T.registrations.filter((r) => r.event_id === eventId && SEATS.includes(r.status)).length;
  const festOf = (e) => byId('fests', e.fest_id), clubOf = (f) => byId('clubs', f.club_id) || {};
  const passOf = (regId) => T.passes.find((p) => p.registration_id === regId);
  const eventRow = (e) => { const f = festOf(e), c = clubOf(f); return { ...e, form_schema: JSON.parse(JSON.stringify(e.form_schema)), fest_name: f.name, fest_archived_at: f.archived_at, club_id: f.club_id, club_name: c.name, taken: takenOf(e.id) }; };
  const festRow = (f) => { const c = clubOf(f), live = T.events.filter((e) => e.fest_id === f.id && !e.archived_at);
    return { ...f, club_name: c.name, club_slug: c.slug, club_emoji: c.emoji, event_count: live.length, capacity: live.reduce((n, e) => n + e.capacity, 0), taken: live.reduce((n, e) => n + takenOf(e.id), 0) }; };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const events = {
    count: () => T.events.length,
    counts: () => ({ fests: T.fests.filter((f) => !f.archived_at).length, events: T.events.filter((e) => !e.archived_at && !festOf(e).archived_at).length }),
    archivedCounts: () => ({ fests: T.fests.filter((f) => f.archived_at).length, events: T.events.filter((e) => e.archived_at).length }),
    listClubs: () => T.clubs.map((c) => { const fs = T.fests.filter((f) => f.club_id === c.id && !f.archived_at);
      return { ...c, fest_count: fs.length, event_count: T.events.filter((e) => !e.archived_at && fs.some((f) => f.id === e.fest_id)).length }; }),
    findClub: (id) => { const c = byId('clubs', id); return c && { ...c }; },
    listFests({ club = null, includeArchived = false } = {}) {
      return T.fests.filter((f) => (!Number.isInteger(club) || f.club_id === club) && (includeArchived || !f.archived_at))
        .sort((a, b) => (Number.isInteger(club) ? 0 : a.club_id - b.club_id) || cmp(a.starts_on, b.starts_on)).map(festRow);
    },
    findFest: (id) => { const f = byId('fests', id); return f && festRow(f); },
    findById: (id) => { const e = byId('events', id); return e && eventRow(e); },
    insertFest: (f) => { const id = next('fests'); T.fests.push({ id, club_id: f.club_id, name: f.name, description: f.description, starts_on: f.starts_on, ends_on: f.ends_on, venue: f.venue, archived_at: null }); return id; },
    updateFest: (id, f) => Object.assign(byId('fests', id), { club_id: f.club_id, name: f.name, description: f.description, starts_on: f.starts_on, ends_on: f.ends_on, venue: f.venue }),
    setFestArchived: (id, at) => { byId('fests', id).archived_at = at; },
    deleteFest: (id) => drop('fests', id),
    countEventsInFest: (id) => T.events.filter((e) => e.fest_id === Number(id)).length,
    insertEvent: (e) => { const id = next('events'); T.events.push({ id, fest_id: e.fest_id, title: e.title, category: e.category, description: e.description, rules: e.rules || '', venue: e.venue, starts_at: e.starts_at, deadline: e.deadline,
      capacity: e.capacity, auto_confirm: e.auto_confirm ? 1 : 0, form_schema: JSON.parse(JSON.stringify(e.form_schema || [])), archived_at: null }); return id; },
    updateEvent: (id, e) => Object.assign(byId('events', id), { fest_id: e.fest_id, title: e.title, category: e.category, description: e.description, rules: e.rules || '', venue: e.venue, starts_at: e.starts_at, deadline: e.deadline,
      capacity: e.capacity, auto_confirm: e.auto_confirm ? 1 : 0, form_schema: JSON.parse(JSON.stringify(e.form_schema || [])) }),
    setEventArchived: (id, at) => { byId('events', id).archived_at = at; },
    deleteEvent: (id) => drop('events', id),
    list({ q, category, fest, club, limit, offset, includeArchived = false }) {
      return T.events.filter((e) => { const f = festOf(e);
        return (!q || has(e.title, q) || has(e.description, q)) && (!category || e.category === category) && (!Number.isInteger(fest) || e.fest_id === fest) && (!Number.isInteger(club) || f.club_id === club) && (includeArchived || (!e.archived_at && !f.archived_at)); })
        .sort((a, b) => cmp(a.starts_at, b.starts_at) || a.id - b.id).slice(offset, offset + limit).map(eventRow);
    },
  };

  const adminRow = (r) => { const e = byId('events', r.event_id), f = festOf(e), p = passOf(r.id);
    return { id: r.id, event_id: r.event_id, name: r.name, email: r.email, status: r.status, answers: r.answers, created_at: r.created_at, pass_status: p ? p.status : null, checked_in_at: p ? p.checked_in_at : null, event_title: e.title, fest_id: f.id, fest_name: f.name }; };
  const registrations = {
    findLive: (eventId, email) => T.registrations.find((r) => r.event_id === eventId && r.email === email && r.status !== 'CANCELLED') && { x: 1 },
    insert({ eventId, name, email, answers, status, manageToken }) {
      const r = { id: next('registrations'), event_id: eventId, name, email, answers: JSON.stringify(answers), status, manage_token: manageToken, created_at: sqlNow(), updated_at: null };
      T.registrations.push(r); return { id: r.id, status: r.status, manage_token: r.manage_token };
    },
    findById: (id) => { const r = byId('registrations', id); return r && { id: r.id, event_id: r.event_id, status: r.status }; },
    findByToken: (token) => { const r = T.registrations.find((x) => x.manage_token === token); return r && { id: r.id, status: r.status, starts_at: byId('events', r.event_id).starts_at }; },
    findViewByToken(token) {
      const r = T.registrations.find((x) => x.manage_token === token); if (!r) return undefined;
      const e = byId('events', r.event_id), f = festOf(e), c = clubOf(f), p = passOf(r.id);
      return { id: r.id, name: r.name, email: r.email, status: r.status, answers: r.answers, created_at: r.created_at, event_id: e.id, fest_id: e.fest_id, title: e.title, venue: e.venue, starts_at: e.starts_at,
        fest_name: f.name, club_name: c.name, pass_token: p ? p.token : null, pass_status: p ? p.status : null, checked_in_at: p ? p.checked_in_at : null };
    },
    setStatus: (id, status, at = null) => Object.assign(byId('registrations', id), { status, updated_at: at }),
    countForEvent: (eventId) => T.registrations.filter((r) => r.event_id === Number(eventId)).length,
    listAdmin({ eventId, festId, status, q, limit, offset }) {
      const rows = T.registrations.filter((r) => (!eventId || r.event_id === eventId) && (!festId || byId('events', r.event_id).fest_id === festId) && (!status || r.status === status) && (!q || has(r.name, q) || has(r.email, q))).sort((a, b) => b.id - a.id);
      return { total: rows.length, rows: rows.slice(offset, offset + limit).map(adminRow) };
    },
    allForEvent: (eventId) => T.registrations.filter((r) => r.event_id === Number(eventId)).sort((a, b) => a.id - b.id).map((r) => { const p = passOf(r.id); return { ...r, pass_status: p ? p.status : null, checked_in_at: p ? p.checked_in_at : null }; }),
    statusCounts: () => Object.entries(T.registrations.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {})).map(([status, n]) => ({ status, n })),
    seatsByEvent: () => T.events.filter((e) => !e.archived_at && !festOf(e).archived_at).sort((a, b) => a.id - b.id).map((e) => { const f = festOf(e);
      return { id: e.id, title: e.title, category: e.category, capacity: e.capacity, fest_id: f.id, fest_name: f.name, club_name: clubOf(f).name || 'Other', taken: takenOf(e.id) }; }),
  };

  const passes = {
    findByRegistration: (regId) => { const p = passOf(regId); return p && { ...p }; },
    insert: (regId, token) => { T.passes.push({ id: next('passes'), registration_id: regId, token, status: 'ISSUED', checked_in_at: null }); },
    reinstate: (id) => { byId('passes', id).status = 'ISSUED'; },
    revoke: (id) => { byId('passes', id).status = 'REVOKED'; },
    checkIn(token, at) {
      const p = T.passes.find((x) => x.token === token); if (!p || p.status !== 'ISSUED' || byId('registrations', p.registration_id).status !== 'CONFIRMED') return false;
      p.status = 'CHECKED_IN'; p.checked_in_at = at; return true;
    },
    findInfoByToken(token) {
      const p = T.passes.find((x) => x.token === token); if (!p) return undefined;
      const r = byId('registrations', p.registration_id), e = byId('events', r.event_id);
      return { registration_id: r.id, name: r.name, email: r.email, registration_status: r.status, event_id: e.id, title: e.title, status: p.status, checked_in_at: p.checked_in_at };
    },
  };
  const volunteers = {
    findByEmail: (email) => { const v = T.volunteers.find((x) => x.email === email); return v && { id: v.id }; },
    insert: (v) => { const id = next('volunteers'); T.volunteers.push({ id, ...v, created_at: sqlNow() }); return id; },
    list: () => [...T.volunteers].sort((a, b) => b.id - a.id).slice(0, 500),
  };
  return { T, next, events, registrations, passes, volunteers };
}

// Same catalogue and sample activity as `npm run seed` (server/seed.js), written through the in-memory tables.
function seed(db, now = new Date()) {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), byTitle = {};
  for (const c of buildCatalog(now)) {
    const cid = db.next('clubs'); db.T.clubs.push({ id: cid, name: c.name, slug: slug(c.name), description: c.description, emoji: c.emoji });
    for (const f of c.fests) {
      const fid = db.events.insertFest({ club_id: cid, name: f.name, description: f.description, starts_on: f.starts_on, ends_on: f.ends_on, venue: f.venue });
      for (const e of f.events) byTitle[e.title] = db.events.insertEvent({ fest_id: fid, title: e.title, category: e.category, description: e.description, rules: e.rules, venue: e.venue, starts_at: toIso(e.start), deadline: toIso(e.deadline), capacity: e.capacity, auto_confirm: e.auto, form_schema: FORMS[e.form] });
    }
  }
  const NAMES = ['Ayesha Rahman', 'Tanvir Hasan', 'Nusrat Jahan', 'Rafi Ahmed', 'Mehnaz Akter', 'Sabbir Hossain', 'Farhana Islam', 'Imran Khan'];
  const checkedAt = new Date(now.getTime() - 864e5).toISOString();
  const mk = (title, name, answers, status) => {
    const { id } = db.registrations.insert({ eventId: byTitle[title], name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, answers, status, manageToken: rand() });
    if (status === 'CONFIRMED') db.passes.insert(id, signPass(id, SECRET));
    if (status === 'CHECKED_IN') { db.passes.insert(id, signPass(id, SECRET)); Object.assign(db.T.passes[db.T.passes.length - 1], { status: 'CHECKED_IN', checked_in_at: checkedAt }); }
  };
  const solo = { year: '2nd' }, contest = (i) => ({ team: `Team ${i + 1}`, size: '2', phone: '01000000000' });
  NAMES.slice(0, 5).forEach((n, i) => mk('Intro to Git & GitHub', n, solo, i < 4 ? 'CHECKED_IN' : 'CONFIRMED'));
  NAMES.slice(0, 4).forEach((n, i) => mk('Capture the Flag Warm-up', n, { team: `Crew ${i + 1}`, size: '1' }, 'CHECKED_IN'));
  NAMES.slice(0, 6).forEach((n, i) => mk('Opening Keynote', n, solo, i < 4 ? 'CHECKED_IN' : i === 4 ? 'CONFIRMED' : 'CANCELLED'));
  NAMES.slice(0, 4).forEach((n) => mk('AI Web Development Contest', n, solo, 'CONFIRMED'));
  NAMES.slice(0, 6).forEach((n, i) => mk('Programming Contest', n, contest(i), i % 3 === 0 ? 'PENDING' : 'CONFIRMED'));
  NAMES.slice(0, 4).forEach((n, i) => mk('Robotics Challenge', n, { team: `Bot ${i + 1}`, size: '2' }, i < 3 ? 'PENDING' : 'REJECTED'));
  NAMES.slice(0, 5).forEach((n, i) => mk('Gaming Tournament', n, { team: `Squad ${i}`, size: '1' }, i < 2 ? 'CONFIRMED' : 'PENDING'));
  NAMES.slice(2, 8).forEach((n) => mk('Workshop: Web in a Day', n, { year: '3rd' }, 'CONFIRMED'));
}

function createPreviewBackend() {
  const db = createMemoryDb(); seed(db);
  const service = createClubService({ events: db.events, registrations: db.registrations, passes: db.passes, volunteers: db.volunteers, tx: (fn) => fn(), secret: () => SECRET });
  const auth = { login: (key) => { if (key !== ORGANIZER_KEY) throw Object.assign(new Error("That organizer key wasn't accepted."), { kind: 'unauthorized', code: 'invalid_credentials' }); return { token: issueToken(), token_type: 'Bearer', expires_in: 8 * 3600 }; } };
  const routes = [...publicRoutes(service), ...adminRoutes(service, auth)];
  // Mirrors server/http/router.js: route match, organizer bearer-token check, error -> { error, message, ...extra } with the same statuses.
  return function handle(method, pathAndQuery, body, authorization) {
    const url = new URL(pathAndQuery, 'http://preview');
    for (const r of routes) {
      const m = method === r.method && url.pathname.match(r.pattern);
      if (!m) continue;
      if (r.admin && !sessions.has(String(authorization || '').replace(/^Bearer\s+/i, ''))) return { status: 401, type: 'application/json', body: JSON.stringify({ error: 'unauthorized', message: 'Organizer sign-in required.' }) };
      try {
        const out = r.handler({ m, url, body: method === 'GET' ? {} : (body && typeof body === 'object' ? body : {}) });
        return out && out.type ? { status: out.status, type: out.type, body: out.body, headers: out.headers } : { status: 200, type: 'application/json', body: JSON.stringify(out) };
      } catch (e) {
        const status = e.status || KIND_STATUS[e.kind];
        if (!status) { console.error(e); return { status: 500, type: 'application/json', body: JSON.stringify({ error: 'internal_error', message: 'Something went wrong on our side. Please try again.' }) }; }
        return { status, type: 'application/json', body: JSON.stringify({ error: e.code || 'error', message: e.message, ...e.extra }) };
      }
    }
    return { status: 404, type: 'application/json', body: JSON.stringify({ error: 'not_found', message: 'Not found.' }) };
  };
}
module.exports = { createPreviewBackend, ORGANIZER_KEY };
