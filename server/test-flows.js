// Lifecycle + organizer-management tests: state machine, check-in, edit/archive/delete, admin listing, CSV, typed forms, migration.
// Runs against an in-memory fixture DB through the real HTTP API (no mocks). Dates are relative, so it never expires.
Object.assign(process.env, { ORGANIZER_KEY: 'k', PASS_SECRET: 's', RATE_LIMIT_PER_MIN: '100000', ADMIN_RATE_LIMIT_PER_MIN: '100000', AUTH_FAIL_LIMIT_PER_MIN: '100000' });
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { open, MIGRATIONS } = require('./db');
const { seedFixtures } = require('./fixtures');
const { createApp } = require('./app');
const { makeDates } = require('./dates');
const { at, day } = makeDates();

const db = seedFixtures(open(':memory:'));
const { server } = createApp(db);
const A = { 'x-organizer-key': 'k' };
let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; } };

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const call = async (m, p, b, h = {}) => {
    const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b !== undefined && m !== 'GET' ? JSON.stringify(b) : undefined });
    const ct = r.headers.get('content-type') || '';
    return { s: r.status, j: ct.includes('json') ? await r.json() : await r.text(), h: r.headers };
  };
  const id = (title) => db.prepare('SELECT id FROM events WHERE title LIKE ?').get(title + '%').id;
  const solo = (email, name = 'P') => ({ name, email, answers: { year: '1st' } });
  const team = (email) => ({ name: 'P', email, answers: { team: 'T', size: '2' } });
  const reg = (title, body) => call('POST', `/api/events/${id(title)}/register`, body);
  const view = (tok) => call('GET', '/api/registrations/' + tok);
  const admin = (m, p, b) => call(m, p, b, A);
  const mkEvent = async (over = {}) => {
    const fest = db.prepare('SELECT id FROM fests ORDER BY id').get().id;
    return admin('POST', '/api/admin/events', { fest_id: fest, title: 'Scratch Event ' + Math.random().toString(36).slice(2, 7), category: 'Test', description: 'd', venue: 'Hall',
      starts_at: at(30, '10:00'), deadline: at(20, '23:59'), capacity: 5, auto_confirm: true, form_schema: [], ...over });
  };

  // ---------- error contract ----------
  await t('errors are {error: code, message[, field]}', async () => {
    const full = await reg('Valorant', team('x@x.co'));
    assert.deepEqual([full.s, full.j.error, full.j.message], [409, 'event_full', 'This event is full.']);
    const nf = await call('GET', '/api/events/99999'); assert.deepEqual([nf.s, nf.j.error], [404, 'event_not_found']);
    const bad = await reg('AI Prompt', { name: '', email: 'a@b.co', answers: {} }); assert.deepEqual([bad.s, bad.j.error, bad.j.field], [400, 'validation_failed', 'name']);
    const raw = await fetch(base + '/api/events/1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert.deepEqual([raw.status, (await raw.json()).error], [400, 'invalid_json']);
    assert.equal((await call('GET', '/api/nope')).j.error, 'not_found');
  });

  // ---------- flow 6 / 7: approval-required event ----------
  let approvedTok;
  await t('flow 6: approval event -> PENDING, no pass; organizer approves -> pass appears', async () => {
    const r = await reg('Line Follower', team('ap1@x.co')); assert.equal(r.s, 201); assert.equal(r.j.status, 'PENDING');
    let v = (await view(r.j.manage_token)).j; assert.equal(v.status, 'PENDING'); assert.equal(v.pass_token, null); assert.equal(v.can_cancel, true);
    assert.equal((await admin('PATCH', '/api/admin/registrations/' + r.j.id, { status: 'CONFIRMED' })).s, 200);
    v = (await view(r.j.manage_token)).j; assert.equal(v.status, 'CONFIRMED'); assert(v.pass_token, 'pass issued once confirmed');
    approvedTok = r.j.manage_token;
  });
  await t('flow 7: organizer rejects an approved registration -> pass revoked and unusable', async () => {
    const r = await reg('Line Follower', team('ap2@x.co')); await admin('PATCH', '/api/admin/registrations/' + r.j.id, { status: 'CONFIRMED' });
    const pt = (await view(r.j.manage_token)).j.pass_token;
    assert.equal((await admin('PATCH', '/api/admin/registrations/' + r.j.id, { status: 'REJECTED' })).s, 200);
    const v = (await view(r.j.manage_token)).j; assert.equal(v.status, 'REJECTED'); assert.equal(v.pass_token, null); assert.equal(v.can_cancel, false);
    const ci = await admin('POST', '/api/admin/checkin', { token: pt }); assert.deepEqual([ci.s, ci.j.error], [403, 'pass_revoked']);
  });

  // ---------- flow 8 / 9: check-in ----------
  let checkedTok, checkedId;
  await t('flow 8/9: check-in -> registration CHECKED_IN (seat kept, QR hidden); repeat is rejected', async () => {
    const r = await reg('AI Prompt', solo('ci1@x.co')); checkedTok = r.j.manage_token; checkedId = r.j.id;
    const takenBefore = (await call('GET', `/api/events/${id('AI Prompt')}`)).j.taken;
    const pt = (await view(checkedTok)).j.pass_token;
    const ok = await admin('POST', '/api/admin/checkin', { token: pt }); assert.equal(ok.s, 200); assert.equal(ok.j.result, 'CHECKED_IN');
    const v = (await view(checkedTok)).j; assert.equal(v.status, 'CHECKED_IN'); assert.equal(v.pass_token, null); assert(v.checked_in_at); assert.equal(v.can_cancel, false);
    assert.equal((await call('GET', `/api/events/${id('AI Prompt')}`)).j.taken, takenBefore, 'a checked-in person still holds a seat');
    const again = await admin('POST', '/api/admin/checkin', { token: pt }); assert.deepEqual([again.s, again.j.error], [409, 'already_checked_in']);
  });
  await t('a checked-in registration can no longer be cancelled or rejected (was: contradictory state)', async () => {
    const c = await call('POST', `/api/registrations/${checkedTok}/cancel`); assert.deepEqual([c.s, c.j.error], [409, 'invalid_transition']);
    for (const status of ['REJECTED', 'CANCELLED']) assert.equal((await admin('PATCH', '/api/admin/registrations/' + checkedId, { status })).s, 409);
    assert.equal((await view(checkedTok)).j.status, 'CHECKED_IN');
    assert.equal(db.prepare('SELECT status FROM passes WHERE registration_id = ?').get(checkedId).status, 'CHECKED_IN');
  });
  await t('check-in by registration id; PENDING has no pass; unknown id is 404; wrong event is refused', async () => {
    const r = await reg('Tech Quiz', team('ci2@x.co')); const rid = r.j.id;
    assert.equal((await admin('POST', `/api/admin/registrations/${rid}/check-in`)).j.result, 'CHECKED_IN');
    assert.equal((await admin('POST', `/api/admin/registrations/${rid}/check-in`)).j.error, 'already_checked_in');
    const pending = (await admin('GET', `/api/admin/registrations?event=${id('Code Rush')}&status=PENDING`)).j.items[0];
    assert.deepEqual([(await admin('POST', `/api/admin/registrations/${pending.id}/check-in`)).s, 'no_pass'], [409, 'no_pass']);
    assert.equal((await admin('POST', '/api/admin/registrations/999999/check-in')).s, 404);
    const r2 = await reg('AI Prompt', solo('ci3@x.co')); const pt = (await view(r2.j.manage_token)).j.pass_token;
    const wrong = await admin('POST', '/api/admin/checkin', { token: pt, event_id: id('Code Rush') }); assert.deepEqual([wrong.s, wrong.j.error], [409, 'wrong_event']);
    assert.equal((await admin('POST', '/api/admin/checkin', { token: pt, event_id: id('AI Prompt') })).j.result, 'CHECKED_IN');
  });

  // ---------- state machine ----------
  await t('organizer cannot set arbitrary statuses or illegal transitions', async () => {
    const r = await reg('AI Prompt', solo('sm1@x.co')), p = (status) => admin('PATCH', '/api/admin/registrations/' + r.j.id, { status });
    for (const bad of ['PENDING', 'CHECKED_IN', 'FOO', undefined]) assert.equal((await p(bad)).s, 400, String(bad));
    assert.equal((await p('CONFIRMED')).j.error, 'invalid_transition');          // CONFIRMED -> CONFIRMED
    assert.equal((await p('REJECTED')).s, 200);
    assert.equal((await p('CANCELLED')).j.error, 'invalid_transition');          // REJECTED -> CANCELLED
    assert.equal((await p('CONFIRMED')).s, 200);                                  // REJECTED -> CONFIRMED (seat is free)
    assert.equal((await p('CANCELLED')).s, 200);
    assert.equal((await p('CONFIRMED')).j.error, 'invalid_transition');          // CANCELLED is terminal
    assert.equal((await admin('PATCH', '/api/admin/registrations/999999', { status: 'REJECTED' })).s, 404);
  });
  await t('un-rejecting needs a free seat (seat may have been taken meanwhile)', async () => {
    const first = (await admin('GET', `/api/admin/registrations?event=${id('Valorant')}&limit=1&offset=4`)).j.items[0];   // oldest of 5 seated
    assert.equal((await admin('PATCH', '/api/admin/registrations/' + first.id, { status: 'REJECTED' })).s, 200);
    assert.equal((await reg('Valorant', team('late@x.co'))).s, 201, 'freed seat is reusable');
    const back = await admin('PATCH', '/api/admin/registrations/' + first.id, { status: 'CONFIRMED' }); assert.deepEqual([back.s, back.j.error], [409, 'event_full']);
  });
  await t('participant cancel: frees seat, hides QR, second cancel is 409, same email can re-register', async () => {
    const r = await reg('AI Prompt', solo('pc1@x.co')), before = (await call('GET', `/api/events/${id('AI Prompt')}`)).j.taken;
    assert.equal((await call('POST', `/api/registrations/${r.j.manage_token}/cancel`)).s, 200);
    assert.equal((await call('GET', `/api/events/${id('AI Prompt')}`)).j.taken, before - 1);
    const v = (await view(r.j.manage_token)).j; assert.deepEqual([v.status, v.pass_token], ['CANCELLED', null]);
    assert.equal((await call('POST', `/api/registrations/${r.j.manage_token}/cancel`)).j.error, 'invalid_transition');
    assert.equal((await reg('AI Prompt', solo('pc1@x.co'))).s, 201);
  });

  // ---------- event state: ended / closed / full / archived ----------
  await t('registration_state drives the CTA: open, full, closed, ended', async () => {
    const st = async (title) => (await call('GET', `/api/events/${id(title)}`)).j;
    assert.equal((await st('Code Rush')).registration_state, 'open');
    const v = await st('Valorant'); assert.deepEqual([v.registration_state, v.full, v.remaining, v.closed], ['full', true, 0, true]);
    assert.equal((await st('Hack the Winter')).registration_state, 'closed');
    const old = await mkEvent({ deadline: at(1, '08:00'), starts_at: at(2, '10:00') });
    db.prepare("UPDATE events SET starts_at = ?, deadline = NULL WHERE id = ?").run(new Date(Date.now() - 36e5).toISOString(), old.j.id);   // started an hour ago, legacy NULL deadline
    const e = (await call('GET', `/api/events/${old.j.id}`)).j; assert.deepEqual([e.registration_state, e.ended], ['ended', true]);
    const r = await call('POST', `/api/events/${old.j.id}/register`, { name: 'P', email: 'late@x.co', answers: {} }); assert.deepEqual([r.s, r.j.error], [409, 'event_ended']);
  });
  await t('flow 5: a deadline that passes closes registration; cancelling after the event started is refused', async () => {
    const e = await mkEvent(); const r = await call('POST', `/api/events/${e.j.id}/register`, { name: 'P', email: 'd1@x.co', answers: {} }); assert.equal(r.s, 201);
    db.prepare('UPDATE events SET deadline = ? WHERE id = ?').run(new Date(Date.now() - 6e4).toISOString(), e.j.id);
    const late = await call('POST', `/api/events/${e.j.id}/register`, { name: 'P', email: 'd2@x.co', answers: {} }); assert.deepEqual([late.s, late.j.error], [409, 'registration_closed']);
    db.prepare('UPDATE events SET starts_at = ? WHERE id = ?').run(new Date(Date.now() - 6e4).toISOString(), e.j.id);
    const c = await call('POST', `/api/registrations/${r.j.manage_token}/cancel`); assert.deepEqual([c.s, c.j.error], [409, 'event_ended']);
    assert.equal((await view(r.j.manage_token)).j.can_cancel, false);
  });
  await t('flow 4: capacity is exact; cancelling frees exactly one seat', async () => {
    const e = await mkEvent({ capacity: 2 }), go = (n) => call('POST', `/api/events/${e.j.id}/register`, { name: 'P', email: `cap${n}@x.co`, answers: {} });
    const a = await go(1); await go(2); assert.equal((await go(3)).j.error, 'event_full');
    await call('POST', `/api/registrations/${a.j.manage_token}/cancel`); assert.equal((await go(3)).s, 201); assert.equal((await go(4)).j.error, 'event_full');
  });

  // ---------- flow 12: edit event ----------
  await t('flow 12: organizer edits an event; the public page reflects it', async () => {
    const eid = id('Code Rush');
    const r = await admin('PATCH', `/api/admin/events/${eid}`, { title: 'Code Rush 2.0', capacity: 50, rules: 'Bring a laptop.', venue: 'Lab 9' });
    assert.equal(r.s, 200); const pub = (await call('GET', `/api/events/${eid}`)).j;
    assert.deepEqual([pub.title, pub.capacity, pub.rules, pub.venue, pub.remaining], ['Code Rush 2.0', 50, 'Bring a laptop.', 'Lab 9', 50 - pub.taken]);
    assert.equal((await call('PATCH', `/api/admin/events/${eid}`, { title: 'x' })).s, 401);
    assert.equal((await admin('PATCH', '/api/admin/events/999999', { title: 'Nope Nope' })).s, 404);
    assert.equal((await admin('PATCH', `/api/admin/events/${eid}`, { capacity: 0 })).j.field, 'capacity');
    assert.equal((await admin('PATCH', `/api/admin/events/${eid}`, { deadline: at(60, '10:00') })).j.field, 'deadline');   // after start
  });
  await t('capacity cannot drop below seats already taken', async () => {
    const v = await admin('PATCH', `/api/admin/events/${id('Valorant')}`, { capacity: 3 }); assert.deepEqual([v.s, v.j.error], [409, 'capacity_below_registrations']);
    assert.equal((await admin('PATCH', `/api/admin/events/${id('Valorant')}`, { capacity: 20 })).s, 200);
  });
  await t('form schema is append-only once people registered; free while there are none', async () => {
    const eid = id('Code Rush'), cur = (await call('GET', `/api/events/${eid}`)).j.form_schema, patch = (form_schema) => admin('PATCH', `/api/admin/events/${eid}`, { form_schema });
    assert.equal((await patch(cur.filter((f) => f.key !== 'size'))).j.error, 'form_locked');
    assert.equal((await patch(cur.map((f) => (f.key === 'size' ? { ...f, type: 'text' } : f)))).j.error, 'form_locked');
    assert.equal((await patch(cur.map((f) => (f.key === 'size' ? { ...f, options: ['1'] } : f)))).j.error, 'form_locked');
    assert.equal((await patch([...cur, { key: 'extra', label: 'Extra', type: 'text', required: true }])).j.error, 'form_locked');
    const ok = await patch([...cur, { key: 'phone', label: 'Phone', type: 'tel', required: false }]); assert.equal(ok.s, 200);
    assert.equal((await call('GET', `/api/events/${eid}`)).j.form_schema.length, cur.length + 1);
    const fresh = await mkEvent(); assert.equal((await admin('PATCH', `/api/admin/events/${fresh.j.id}`, { form_schema: [{ key: 'x', label: 'X', type: 'text', required: true }] })).s, 200);
  });

  // ---------- typed fields ----------
  await t('typed form fields validate on the server (email, tel, number, textarea, select)', async () => {
    const e = await mkEvent({ form_schema: [{ key: 'mail', label: 'Mail', type: 'email', required: true }, { key: 'phone', label: 'Phone', type: 'tel', required: true },
      { key: 'age', label: 'Age', type: 'number', required: false }, { key: 'note', label: 'Note', type: 'textarea', required: false }, { key: 'lvl', label: 'Level', type: 'select', required: false, options: ['a', 'b'] }] });
    const go = (answers, email = 'tf@x.co') => call('POST', `/api/events/${e.j.id}/register`, { name: 'P', email, answers });
    const good = { mail: 'a@b.co', phone: '01712-345678', age: '19', note: 'hi', lvl: 'a' };
    for (const [k, v] of [['mail', 'nope'], ['phone', 'abc'], ['age', 'x1'], ['note', 'x'.repeat(1001)], ['lvl', 'z']]) { const r = await go({ ...good, [k]: v }); assert.deepEqual([r.s, r.j.field], [400, k], k); }
    assert.equal((await go({ ...good, phone: '' })).j.field, 'phone');             // required
    assert.equal((await go(good)).s, 201);
  });

  // ---------- archive / delete ----------
  await t('archiving an event hides it publicly, blocks registration, keeps registrations; restore brings it back', async () => {
    const e = await mkEvent(), r = await call('POST', `/api/events/${e.j.id}/register`, { name: 'P', email: 'ar1@x.co', answers: {} });
    const listed = (await call('GET', '/api/events?limit=200')).j.length;
    const a = await admin('POST', `/api/admin/events/${e.j.id}/archive`); assert.deepEqual([a.s, a.j.archived, a.j.registration_state], [200, true, 'archived']);
    assert.equal((await call('GET', `/api/events/${e.j.id}`)).s, 404);
    assert.equal((await call('GET', '/api/events?limit=200')).j.length, listed - 1);
    assert.equal((await call('POST', `/api/events/${e.j.id}/register`, { name: 'P', email: 'ar2@x.co', answers: {} })).j.error, 'event_not_found');
    assert.equal((await admin('GET', `/api/admin/events?limit=500`)).j.find((x) => x.id === e.j.id).registration_state, 'archived');
    assert.equal((await view(r.j.manage_token)).s, 200, 'existing registration page still works');
    assert.equal((await admin('POST', `/api/admin/events/${e.j.id}/restore`)).j.archived, false);
    assert.equal((await call('GET', `/api/events/${e.j.id}`)).s, 200);
  });
  await t('archiving a fest hides it and its events; blocks new events; stats follow; restore reverses', async () => {
    const fid = db.prepare("SELECT id FROM fests WHERE name LIKE 'Winter%'").get().id;
    const s0 = (await admin('GET', '/api/admin/stats')).j;
    assert.equal((await admin('POST', `/api/admin/fests/${fid}/archive`)).j.archived, true);
    assert.equal((await call('GET', `/api/fests/${fid}`)).s, 404);
    assert((await call('GET', '/api/fests')).j.every((f) => f.id !== fid));
    assert.equal((await call('GET', `/api/events?fest=${fid}`)).j.length, 0);
    assert.equal((await call('GET', `/api/events/${id('Web in a Day')}`)).s, 404);
    const s1 = (await admin('GET', '/api/admin/stats')).j; assert.equal(s1.fests, s0.fests - 1); assert(s1.events < s0.events);
    const blocked = await admin('POST', '/api/admin/events', { fest_id: fid, title: 'Late Add', category: 'x', description: '', venue: 'v', starts_at: at(80, '10:00'), deadline: at(70, '10:00'), capacity: 5, form_schema: [] });
    assert.deepEqual([blocked.s, blocked.j.error], [409, 'fest_archived']);
    assert.equal((await admin('POST', `/api/admin/fests/${fid}/restore`)).j.archived, false);
    assert.equal((await call('GET', `/api/events/${id('Web in a Day')}`)).s, 200);
  });
  await t('delete is only allowed when nothing would be lost; otherwise 409 and archive instead', async () => {
    assert.equal((await admin('DELETE', `/api/admin/events/${id('Code Rush')}`)).j.error, 'has_registrations');
    const e = await mkEvent(); assert.equal((await admin('DELETE', `/api/admin/events/${e.j.id}`)).s, 200); assert.equal((await call('GET', `/api/events/${e.j.id}`)).s, 404);
    const fest = db.prepare("SELECT id FROM fests WHERE name LIKE 'Tech Carnival%'").get().id;
    assert.equal((await admin('DELETE', `/api/admin/fests/${fest}`)).j.error, 'has_events');
    const club = db.prepare('SELECT id FROM clubs').get().id;
    const f = await admin('POST', '/api/admin/fests', { club_id: club, name: 'Empty Fest', description: '', starts_on: day(50), ends_on: day(51), venue: 'Hall' });
    assert.equal((await admin('DELETE', `/api/admin/fests/${f.j.id}`)).s, 200); assert.equal((await admin('GET', `/api/admin/fests/${f.j.id}`)).s, 404);
  });
  await t('flow 10/11: a new fest and event appear in the public UI, in the right fest', async () => {
    const club = db.prepare('SELECT id FROM clubs').get().id;
    const f = await admin('POST', '/api/admin/fests', { club_id: club, name: 'Spring Fest', description: 'd', starts_on: day(60), ends_on: day(61), venue: 'Hall' }); assert.equal(f.s, 201); assert.equal(f.j.status, 'upcoming');
    assert((await call('GET', '/api/fests')).j.some((x) => x.id === f.j.id));
    const e = await admin('POST', '/api/admin/events', { fest_id: f.j.id, title: 'Open Mic Night', category: 'Culture', description: 'd', venue: 'Hall', starts_at: at(60, '18:00'), deadline: at(55, '12:00'), capacity: 8, auto_confirm: false, form_schema: [] });
    assert.equal(e.s, 201); const page = (await call('GET', `/api/fests/${f.j.id}`)).j; assert.deepEqual(page.events.map((x) => x.title), ['Open Mic Night']); assert.equal(page.event_count, 1);
    assert.equal((await admin('PATCH', `/api/admin/fests/${f.j.id}`, { name: 'Spring Fest 2', ends_on: day(59) })).j.field, 'ends_on');   // before start
    assert.equal((await admin('PATCH', `/api/admin/fests/${f.j.id}`, { name: 'Spring Fest 2' })).j.name, 'Spring Fest 2');
    assert.equal((await call('GET', `/api/fests/${f.j.id}`)).j.name, 'Spring Fest 2');
  });

  // ---------- organizer tables, stats, CSV ----------
  await t('registration list: filter by event / status / search, paged with a total, newest first', async () => {
    const all = (await admin('GET', '/api/admin/registrations?limit=5')).j; assert.equal(all.items.length, 5); assert(all.total > 5); assert.equal(all.limit, 5);
    assert(all.items[0].id > all.items[1].id, 'newest first'); assert(all.items[0].event_title && all.items[0].fest_name);
    const p2 = (await admin('GET', '/api/admin/registrations?limit=5&offset=5')).j; assert(!p2.items.some((x) => all.items.some((y) => y.id === x.id)));
    const pend = (await admin('GET', '/api/admin/registrations?status=PENDING&limit=200')).j; assert(pend.items.length && pend.items.every((x) => x.status === 'PENDING'));
    const ev = (await admin('GET', `/api/admin/registrations?event=${id('Valorant')}&limit=200`)).j; assert(ev.items.every((x) => x.event_id === id('Valorant')));
    assert.equal((await admin('GET', '/api/admin/registrations?q=zzzz-no-one')).j.total, 0);
    assert((await admin('GET', '/api/admin/registrations?q=ayesha&limit=200')).j.items.every((x) => /ayesha/i.test(x.name + x.email)));
    assert.equal((await admin('GET', '/api/admin/registrations?status=BOGUS')).s, 400);
    assert.equal((await call('GET', '/api/admin/registrations')).s, 401);
    assert(Array.isArray((await admin('GET', `/api/admin/events/${id('Code Rush')}/registrations`)).j), 'classic UI route still returns an array');
  });
  await t('stats cover every status and agree with the tables', async () => {
    const s = (await admin('GET', '/api/admin/stats')).j, r = s.registrations;
    for (const k of ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'CHECKED_IN', 'total']) assert(Number.isInteger(r[k]), k);
    assert.equal(r.total, r.PENDING + r.CONFIRMED + r.REJECTED + r.CANCELLED + r.CHECKED_IN); assert.equal(s.checkedIn, r.CHECKED_IN); assert(r.CHECKED_IN >= 3);
    assert.equal(r.total, (await admin('GET', '/api/admin/registrations?limit=1')).j.total);
    assert.equal(s.seats.taken, s.capacity.reduce((a, c) => a + c.taken, 0)); assert.equal(s.seats.taken, r.PENDING + r.CONFIRMED + r.CHECKED_IN - /* archived/hidden none */ 0);
    assert(s.seats.remaining >= 0 && s.seats.remaining <= s.seats.capacity);
  });
  await t('flow 13: CSV export has check-in column, dynamic answers, formula guard and attachment headers', async () => {
    await reg('AI Prompt', solo('csv1@x.co', '=SUM(1+1)'));
    const r = await admin('GET', `/api/admin/events/${id('AI Prompt')}/export.csv`);
    assert.equal(r.s, 200); assert(/text\/csv/.test(r.h.get('content-type'))); assert(/attachment/.test(r.h.get('content-disposition')));
    const lines = r.j.trim().split(/\r?\n/); assert.equal(lines[0], 'id,name,email,status,registered_at,checked_in_at,Year of study');
    assert.equal(lines.length - 1, db.prepare('SELECT COUNT(*) n FROM registrations WHERE event_id = ?').get(id('AI Prompt')).n);
    assert(r.j.includes("'=SUM(1+1)"), 'formula-injection guard'); assert(lines.some((l) => l.includes('CHECKED_IN') && /\d{4}-\d\d-\d\dT/.test(l)), 'checked-in rows carry a timestamp');
    assert.equal((await call('GET', `/api/admin/events/${id('AI Prompt')}/export.csv`)).s, 401);
  });
  await t('every new organizer endpoint requires the key', async () => {
    const routes = [['GET', '/api/admin/fests'], ['GET', '/api/admin/fests/1'], ['PATCH', '/api/admin/fests/1'], ['DELETE', '/api/admin/fests/1'], ['POST', '/api/admin/fests/1/archive'], ['POST', '/api/admin/fests/1/restore'],
      ['GET', '/api/admin/events'], ['GET', '/api/admin/events/1'], ['PATCH', '/api/admin/events/1'], ['DELETE', '/api/admin/events/1'], ['POST', '/api/admin/events/1/archive'], ['POST', '/api/admin/events/1/restore'],
      ['GET', '/api/admin/registrations'], ['PATCH', '/api/admin/registrations/1'], ['POST', '/api/admin/registrations/1/check-in'], ['POST', '/api/admin/checkin'], ['GET', '/api/admin/stats']];
    for (const [m, p] of routes) { const r = await call(m, p, {}); assert.deepEqual([r.s, r.j.error], [401, 'unauthorized'], `${m} ${p}`); }
    assert.equal((await call('GET', '/api/admin/stats', undefined, { 'x-organizer-key': 'wrong' })).s, 401);
  });
  await t('public responses never leak organizer data or internals', async () => {
    const e = (await call('GET', `/api/events/${id('Code Rush')}`)).j, v = (await view(approvedTok)).j;
    for (const o of [e, v]) { const s = JSON.stringify(o); assert(!/organizer|PASS_SECRET|stack|sqlite/i.test(s)); }
    assert(!('manage_token' in v) && !('email' in e));
  });

  // ---------- migration ----------
  await t('migration 2: CHECKED_IN becomes a real status, data/FKs/unique rule survive, re-open is a no-op', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig-')), 'legacy.db');
    const raw = new DatabaseSync(file);                                   // a database exactly as shipped before this change (schema v1)
    raw.exec('BEGIN'); MIGRATIONS[0](raw); raw.exec('PRAGMA user_version = 1'); raw.exec('COMMIT');
    raw.exec(`INSERT INTO clubs(id,name,slug) VALUES (1,'C','c'); INSERT INTO fests(id,club_id,name) VALUES (1,1,'F');
      INSERT INTO events(id,fest_id,title,capacity) VALUES (1,1,'E',10);
      INSERT INTO registrations(id,event_id,name,email,status,manage_token) VALUES (1,1,'A','a@x.co','CONFIRMED','ta'),(2,1,'B','b@x.co','CONFIRMED','tb'),(3,1,'C','c@x.co','CANCELLED','tc');
      INSERT INTO passes(registration_id,token,status,checked_in_at) VALUES (1,'p1','CHECKED_IN','2026-01-01T00:00:00Z'),(2,'p2','ISSUED',NULL);`);
    assert.throws(() => raw.exec("UPDATE registrations SET status='CHECKED_IN' WHERE id=2"), /CHECK/, 'v1 schema really rejects CHECKED_IN');
    raw.close();
    const m = open(file), st = (n) => m.prepare('SELECT status FROM registrations WHERE id = ?').get(n).status;
    assert.equal(m.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
    assert.deepEqual([st(1), st(2), st(3)], ['CHECKED_IN', 'CONFIRMED', 'CANCELLED']);
    assert.equal(m.prepare('SELECT manage_token FROM registrations WHERE id = 1').get().manage_token, 'ta');
    assert.equal(m.prepare('PRAGMA foreign_key_check').all().length, 0); assert.equal(m.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.throws(() => m.exec("INSERT INTO registrations(event_id,name,email,status,manage_token) VALUES (1,'D','a@x.co','PENDING','td')"), /UNIQUE/, 'one live registration per email still enforced');
    m.exec("UPDATE registrations SET status='CHECKED_IN' WHERE id = 2");   // now legal
    assert.deepEqual(m.prepare('SELECT archived_at FROM fests').get(), { archived_at: null }); m.close();
    const m2 = open(file); assert.equal(m2.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length); assert.equal(m2.prepare('SELECT COUNT(*) n FROM registrations').get().n, 3); m2.close();
  });

  console.log(`\n${passed} passed`);
  server.close();
});
