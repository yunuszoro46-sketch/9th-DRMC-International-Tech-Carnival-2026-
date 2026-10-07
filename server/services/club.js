// Application service: orchestrates repositories + pure domain rules + transactions.
// The only layer that touches both; HTTP routes call it, never SQL.
const { fail, invalid } = require('../domain/errors');
const D = require('../domain/registration');
const { rand, signPass, verifyPass } = require('../domain/pass');
const { toCsv } = require('../domain/csv');
const I = require('../domain/intake');
const A = require('../domain/assistant');

const parseJson = (s) => { try { return JSON.parse(s) || {}; } catch { return {}; } };

function createClubService({ events, registrations, passes, volunteers, tx, secret, interpreter = null, clock = () => new Date() }) {
  const now = () => clock();
  // Public callers never see archived events; organizers (`admin`) do.
  const loadEvent = (id, { admin = false } = {}) => {
    const ev = D.shapeEvent(events.findById(id), now());
    if (!ev || (!admin && ev.archived)) throw fail('not_found', 'event_not_found', 'Event not found');
    return ev;
  };
  const loadFest = (id, { admin = false } = {}) => {
    const f = D.shapeFest(events.findFest(id), now());
    if (!f || (!admin && f.archived)) throw fail('not_found', 'fest_not_found', 'Fest not found');
    return f;
  };
  const festView = (f) => ({ ...f, events: events.list({ fest: f.id, limit: 200, offset: 0, includeArchived: true }).map((r) => D.shapeEvent(r, now())) });
  const shapeReg = (r) => ({ ...r, answers: parseJson(r.answers), created_at: D.toIso(r.created_at), checked_in_at: D.toIso(r.checked_in_at) });
  function syncPass(regId, status) {
    const pass = passes.findByRegistration(regId), action = D.passActionFor(status, pass);
    if (action === 'issue') passes.insert(regId, signPass(regId, secret()));
    else if (action === 'reinstate') passes.reinstate(pass.id);
    else if (action === 'revoke') passes.revoke(pass.id);
  }
  // Gate check-in. Runs inside a transaction opened by the caller: the pass flips ISSUED -> CHECKED_IN and the
  // registration follows in the same unit, so the two can never disagree.
  function checkInToken(token, eventId) {
    const info = passes.findInfoByToken(token);
    if (!info) throw fail('not_found', 'pass_not_found', 'Pass not found');
    if (eventId && info.event_id !== eventId) throw fail('conflict', 'wrong_event', `This pass is for "${info.title}".`, { pass: info });
    const at = now().toISOString(), changed = passes.checkIn(token, at);
    if (changed) registrations.setStatus(info.registration_id, 'CHECKED_IN', at);
    return D.checkInOutcome(changed, passes.findInfoByToken(token));
  }
  const pageArgs = (f) => ({ limit: f.limit, offset: f.offset });
  // What a visitor can already see, loaded at most once per question and only if the question needs it.
  function publicCatalogue() {
    let ev, fe, cl;
    const allEvents = () => { const rows = []; for (let offset = 0; offset < 1000; offset += 200) { const page = events.list({ limit: 200, offset }); rows.push(...page); if (page.length < 200) break; } return rows.map((r) => D.shapeEvent(r, now())); };
    return { events: () => ev || (ev = allEvents()), fests: () => fe || (fe = events.listFests({}).map((f) => D.shapeFest(f, now()))), clubs: () => cl || (cl = events.listClubs()) };
  }

  return {
    // ---- public ----
    listClubs: () => events.listClubs(),
    getClub(id) { const c = events.findClub(id); if (!c) throw fail('not_found', 'club_not_found', 'Club not found'); return { ...c, fests: events.listFests({ club: id }).map((f) => D.shapeFest(f, now())) }; },
    listFests: (club) => events.listFests({ club }).map((f) => D.shapeFest(f, now())),
    getFest(id) { const f = loadFest(id); return { ...f, events: events.list({ fest: id, limit: 200, offset: 0 }).map((r) => D.shapeEvent(r, now())) }; },
    listEvents: (f) => events.list(f).map((r) => D.shapeEvent(r, now())),
    getEvent: (id) => loadEvent(id),

    register(eventId, body) {
      const { name, email } = D.parseIdentity(body);
      return tx(() => {                              // capacity check + insert are one atomic unit
        const ev = loadEvent(eventId);
        D.assertOpen(ev);
        const answers = D.parseAnswers(ev.form_schema, body.answers);
        if (registrations.findLive(eventId, email)) throw fail('conflict', 'duplicate_registration', 'This email is already registered for this event.');
        const status = D.initialStatus(ev);
        const reg = registrations.insert({ eventId, name, email, answers, status, manageToken: rand() });
        syncPass(reg.id, status);
        return reg;
      });
    },
    getRegistration(token) {
      const r = registrations.findViewByToken(token);
      if (!r) throw fail('not_found', 'registration_not_found', 'Registration not found');
      const started = D.isPast(r.starts_at, now());
      return { ...shapeReg(r), starts_at: D.toIso(r.starts_at), pass_token: D.visiblePassToken(r), can_cancel: !started && ['PENDING', 'CONFIRMED'].includes(r.status) };
    },
    cancelRegistration(token) {
      return tx(() => {
        const r = registrations.findByToken(token);
        if (!r) throw fail('not_found', 'registration_not_found', 'Registration not found');
        D.assertTransition(r.status, 'CANCELLED');
        if (D.isPast(r.starts_at, now())) throw fail('conflict', 'event_ended', 'This event has already started, so the registration can no longer be cancelled.');
        registrations.setStatus(r.id, 'CANCELLED', now().toISOString()); syncPass(r.id, 'CANCELLED');
        return { ok: true, status: 'CANCELLED' };
      });
    },
    applyVolunteer(body) {
      const v = I.parseVolunteer(body);
      return tx(() => {
        if (volunteers.findByEmail(v.email)) throw fail('conflict', 'duplicate_application', 'This email has already applied.');
        return { id: volunteers.insert(v) };
      });
    },

    // ---- public assistant: read-only, public catalogue only ----
    // Answers come from domain/assistant.js, which is handed the same events/fests/clubs the public pages show and
    // nothing else. The optional AI helper is consulted only when the rules could not place the question; its output
    // is a query that is validated against this catalogue, never text for the visitor. Returns a plain object unless
    // the helper has to be awaited.
    assistantAsk(body) {
      const { message, context } = A.parseRequest(body);
      const data = publicCatalogue(), at = now(), { reply, miss, label } = A.answer(message, data, at, context);
      const finish = (out, ai) => ({ ...(out || A.fallback(ai)), ai });
      if (!miss) return finish(reply, interpreter ? 'idle' : 'off');
      if (!interpreter) return finish(reply, 'off');
      return interpreter(message, A.vocabulary(data))
        .then((m) => { const alt = A.fromModel(m, data, at, { related: miss === 'not_found', label }); return finish(alt || reply, alt ? 'used' : 'idle'); })
        .catch(() => finish(reply, 'unavailable'));          // provider down, slow or talking nonsense: the visitor still gets the rule-based answer
    },
    assistantStarters: () => ({ suggestions: A.starters(publicCatalogue(), now()) }),
    // ---- organizer: fests ----
    adminListFests: () => events.listFests({ includeArchived: true }).map((f) => D.shapeFest(f, now())),
    adminGetFest: (id) => festView(loadFest(id, { admin: true })),
    createFest(body) {
      const f = I.parseFest(body);
      if (!events.findClub(f.club_id)) throw invalid('Club not found', 'club_id');
      return D.shapeFest(events.findFest(events.insertFest(f)), now());
    },
    updateFest(id, patch) {
      return tx(() => {
        const f = I.parseFestPatch(patch, loadFest(id, { admin: true }));
        if (!events.findClub(f.club_id)) throw invalid('Club not found', 'club_id');
        events.updateFest(id, f);
        return loadFest(id, { admin: true });
      });
    },
    setFestArchived(id, archived) { loadFest(id, { admin: true }); events.setFestArchived(id, archived ? now().toISOString() : null); return loadFest(id, { admin: true }); },
    deleteFest(id) {
      return tx(() => {
        loadFest(id, { admin: true });
        if (events.countEventsInFest(id)) throw fail('conflict', 'has_events', 'This fest still has events. Archive it instead.');
        events.deleteFest(id); return { ok: true };
      });
    },

    // ---- organizer: events ----
    adminListEvents: (f) => events.list({ ...f, includeArchived: true }).map((r) => D.shapeEvent(r, now())),
    adminGetEvent: (id) => loadEvent(id, { admin: true }),
    createEvent(body) {
      const e = I.parseEvent(body);
      const fest = events.findFest(e.fest_id);
      if (!fest) throw invalid('Fest not found', 'fest_id');
      if (fest.archived_at) throw fail('conflict', 'fest_archived', 'This fest is archived. Restore it before adding events.');
      return loadEvent(events.insertEvent(e), { admin: true });
    },
    updateEvent(id, patch) {
      return tx(() => {
        const cur = loadEvent(id, { admin: true }), e = I.parseEventPatch(patch, cur);
        if (!events.findFest(e.fest_id)) throw invalid('Fest not found', 'fest_id');
        if (e.capacity < cur.taken) throw fail('conflict', 'capacity_below_registrations', `Capacity can't be lower than the ${cur.taken} seats already taken.`, { taken: cur.taken, field: 'capacity' });
        if (registrations.countForEvent(id)) I.assertSchemaCompatible(cur.form_schema, e.form_schema);
        events.updateEvent(id, e);
        return loadEvent(id, { admin: true });
      });
    },
    setEventArchived(id, archived) { loadEvent(id, { admin: true }); events.setEventArchived(id, archived ? now().toISOString() : null); return loadEvent(id, { admin: true }); },
    deleteEvent(id) {
      return tx(() => {
        loadEvent(id, { admin: true });
        if (registrations.countForEvent(id)) throw fail('conflict', 'has_registrations', 'This event has registrations. Archive it instead.');
        events.deleteEvent(id); return { ok: true };
      });
    },

    // ---- organizer: registrations, check-in, reporting ----
    listVolunteers: () => volunteers.list(),
    stats() {
      const by = Object.fromEntries(D.STATUSES.map((s) => [s, 0]));
      for (const r of registrations.statusCounts()) by[r.status] = r.n;
      const capacity = registrations.seatsByEvent(), sum = (k) => capacity.reduce((a, c) => a + c[k], 0);
      by.total = D.STATUSES.reduce((a, s) => a + by[s], 0);
      return { ...events.counts(), archived: events.archivedCounts(), registrations: by, checkedIn: by.CHECKED_IN, capacity,
        seats: { capacity: sum('capacity'), taken: sum('taken'), remaining: capacity.reduce((a, c) => a + Math.max(0, c.capacity - c.taken), 0) } };
    },
    listRegistrations(f) {
      if (f.status && !D.STATUSES.includes(f.status)) throw invalid(`status must be one of ${D.STATUSES.join(', ')}`, 'status');
      const { rows, total } = registrations.listAdmin({ ...f, ...pageArgs(f) });
      return { items: rows.map(shapeReg), total, limit: f.limit, offset: f.offset };
    },
    setRegistrationStatus(id, status) {
      D.assertOrganizerTarget(status);
      return tx(() => {
        const r = registrations.findById(id);
        if (!r) throw fail('not_found', 'registration_not_found', 'Registration not found');
        D.assertTransition(r.status, status);
        if (r.status === 'REJECTED') D.assertSeatFree(loadEvent(r.event_id, { admin: true })); // un-rejecting takes a seat back
        registrations.setStatus(r.id, status, now().toISOString());
        syncPass(r.id, status);
        return { ok: true, id: r.id, status };
      });
    },
    exportCsv(eventId) {
      const ev = loadEvent(eventId, { admin: true }), schema = ev.form_schema;
      const rows = registrations.allForEvent(ev.id).map((r) => { const a = parseJson(r.answers);
        return [r.id, r.name, r.email, r.status, D.toIso(r.created_at), D.toIso(r.checked_in_at), ...schema.map((f) => a[f.key])]; });
      return { csv: toCsv([['id', 'name', 'email', 'status', 'registered_at', 'checked_in_at', ...schema.map((f) => f.label)], ...rows]), filename: `event-${ev.id}-participants.csv` };
    },
    checkIn(token, { eventId } = {}) {
      if (!verifyPass(token, secret())) throw fail('validation', 'invalid_pass', 'Invalid pass');   // MAC first: forgeries never reach the DB
      return tx(() => checkInToken(token, eventId));
    },
    checkInRegistration(id) {
      return tx(() => {
        if (!registrations.findById(id)) throw fail('not_found', 'registration_not_found', 'Registration not found');
        const pass = passes.findByRegistration(id);
        if (!pass) throw fail('conflict', 'no_pass', 'This registration has no pass yet. Approve it first.');
        return checkInToken(pass.token);
      });
    },
  };
}
module.exports = { createClubService };
