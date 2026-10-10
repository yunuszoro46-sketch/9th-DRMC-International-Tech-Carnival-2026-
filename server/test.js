// Zero-dependency integration tests: node --no-warnings server/test.js
const assert = require('assert');
const { open } = require('./db');
const { seedFixtures: seed } = require('./fixtures'); // original 3-fest/10-event dataset, independent of the demo catalogue
const { createApp } = require('./app');
const { makeDates } = require('./dates');
const { at, day } = makeDates();
process.env.RATE_LIMIT_PER_MIN = '1000'; process.env.ORGANIZER_KEY = 'k'; process.env.PASS_SECRET = 's';
const db = seed(open(':memory:'));
const { server } = createApp(db);
const A = {};   // organizer headers: filled with the session JWT once the server is up
let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; } };
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const call = async (m, p, body, h = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body && JSON.stringify(body) }); const ct = r.headers.get('content-type'); return { s: r.status, j: ct.includes('json') ? await r.json() : await r.text() }; };
  const id = (title) => db.prepare('SELECT id FROM events WHERE title LIKE ?').get(title + '%').id;

  await t('health 200', async () => assert.equal((await call('GET', '/api/health')).s, 200));
  await t('3 fests, 8+ events', async () => { assert.equal((await call('GET', '/api/fests')).j.length, 3); assert((await call('GET', '/api/events')).j.length >= 8); });
  await t('search + category filter', async () => { assert.equal((await call('GET', '/api/events?q=Quiz')).j.length, 2); assert((await call('GET', '/api/events?category=AI')).j.every((e) => e.category === 'AI')); });
  let tok;
  await t('register on open event (auto-confirm issues pass)', async () => { const r = await call('POST', `/api/events/${id('AI Prompt')}/register`, { name: 'Test', email: 'T@x.com', answers: { year: '1st' } }); assert.equal(r.s, 201); assert.equal(r.j.status, 'CONFIRMED'); tok = r.j.manage_token; });
  await t('duplicate email blocked (case-insensitive)', async () => assert.equal((await call('POST', `/api/events/${id('AI Prompt')}/register`, { name: 'T', email: 't@x.com', answers: { year: '1st' } })).s, 409));
  await t('past deadline blocked', async () => assert.equal((await call('POST', `/api/events/${id('Hack the Winter')}/register`, { name: 'T', email: 'a@b.co', answers: { team: 'x', size: '1' } })).s, 409));
  await t('full event blocked', async () => assert.equal((await call('POST', `/api/events/${id('Valorant')}/register`, { name: 'T', email: 'a@b.co', answers: { team: 'x', size: '1' } })).j.error, 'event_full'));
  await t('required dynamic field enforced', async () => assert.equal((await call('POST', `/api/events/${id('Code Rush')}/register`, { name: 'T', email: 'a@b.co', answers: {} })).s, 400));
  await t('organizer endpoints need a token', async () => assert.equal((await call('GET', '/api/admin/stats')).s, 401));
  await t('login: wrong key 401, right key issues a bearer JWT', async () => {
    assert.equal((await call('POST', '/api/admin/login', { key: 'nope' })).s, 401);
    const r = await call('POST', '/api/admin/login', { key: 'k' }); assert.equal(r.s, 200); assert.equal(r.j.token_type, 'Bearer'); assert(r.j.expires_in > 0);
    A.authorization = 'Bearer ' + r.j.token;
  });
  await t('stats', async () => assert((await call('GET', '/api/admin/stats', null, A)).j.fests === 3));
  let passTok;
  await t('participant sees confirmed pass', async () => { const r = await call('GET', `/api/registrations/${tok}`); passTok = r.j.pass_token; assert(passTok); });
  await t('check-in once OK, twice = already_checked_in', async () => { assert.equal((await call('POST', '/api/admin/checkin', { token: passTok }, A)).j.result, 'CHECKED_IN'); const r = await call('POST', '/api/admin/checkin', { token: passTok }, A); assert.equal(r.s, 409); assert.equal(r.j.error, 'already_checked_in'); });
  await t('forged token rejected', async () => assert.equal((await call('POST', '/api/admin/checkin', { token: '1.abc.def' }, A)).s, 400));
  await t('rejecting revokes pass; check-in then refused', async () => {
    const r = await call('POST', `/api/events/${id('Web in')}/register`, { name: 'R', email: 'r@x.com', answers: { year: '1st' } });
    const view = await call('GET', `/api/registrations/${r.j.manage_token}`);
    await call('PATCH', `/api/admin/registrations/${r.j.id}`, { status: 'REJECTED' }, A);
    assert.equal((await call('POST', '/api/admin/checkin', { token: view.j.pass_token }, A)).s, 403);
  });
  await t('cancel frees capacity', async () => { const fresh = (await call('POST', `/api/events/${id('AI Prompt')}/register`, { name: 'Test', email: 'c@x.com', answers: { year: '1st' } })).j.manage_token; const before = (await call('GET', `/api/events/${id('AI Prompt')}`)).j.taken; assert.equal((await call('POST', `/api/registrations/${fresh}/cancel`)).s, 200); assert.equal((await call('GET', `/api/events/${id('AI Prompt')}`)).j.taken, before - 1); });
  await t('re-register after cancel allowed', async () => assert.equal((await call('POST', `/api/events/${id('AI Prompt')}/register`, { name: 'Test', email: 'c@x.com', answers: { year: '1st' } })).s, 201));
  await t('CSV export includes dynamic answers', async () => { const r = await call('GET', `/api/admin/events/${id('Code Rush')}/export.csv`, null, A); assert(r.j.split('\n')[0].includes('Team name')); });
  await t('50 concurrent registrations never oversell', async () => {
    const eid = id('Intro to Robotics'); db.prepare('UPDATE events SET capacity = 10 WHERE id = ?').run(eid);
    const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => call('POST', `/api/events/${eid}/register`, { name: 'C' + i, email: `c${i}@x.com`, answers: { year: '1st' } })));
    assert.equal(rs.filter((r) => r.s === 201).length, 10);
  });
  await t('null / array / garbage bodies give 400, not 500', async () => {
    for (const raw of ['null', '[]', '"x"', '{bad']) { const r = await fetch(`${base}/api/events/1/register`, { method: 'POST', body: raw }); assert.equal(r.status, 400, raw); } });
  await t('pagination limit/offset honoured', async () => { assert.equal((await call('GET', '/api/events?limit=3')).j.length, 3); assert.equal((await call('GET', '/api/events?limit=3&offset=9')).j.length, 1); });
  await t('security headers present', async () => { const r = await fetch(base + '/'); assert(r.headers.get('content-security-policy').includes("script-src 'self'")); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); });
  await t('HTML in names is stored raw, API returns JSON (UI escapes on render)', async () => { const r = await call('POST', `/api/events/${id('Freshers Quiz')}/register`, { name: '<img src=x onerror=alert(1)>', email: 'xss@x.com', answers: { year: '1st' } }); assert.equal(r.s, 201); });
  await t('volunteer application: validates, stores, blocks duplicate email', async () => {
    const v = { name: 'Nabila Karim', cls: '10 / A', roll: '42', phone: '01712345678', email: 'N@x.com', domain: 'Robotics', why: 'I build small robots at home and want to learn more.' };
    assert.equal((await call('POST', '/api/volunteers', { ...v, domain: 'Cooking' })).s, 400);
    assert.equal((await call('POST', '/api/volunteers', { ...v, why: 'short' })).s, 400);
    assert.equal((await call('POST', '/api/volunteers', v)).s, 201);
    assert.equal((await call('POST', '/api/volunteers', { ...v, email: 'n@x.com' })).s, 409);
    assert.equal((await call('GET', '/api/admin/volunteers')).s, 401);
    assert.equal((await call('GET', '/api/admin/volunteers', null, A)).j[0].email, 'n@x.com');
  });
  await t('organizer can create a fest and an event; bad input is 400; key required', async () => {
    const club = db.prepare('SELECT id FROM clubs').get().id, fest = { club_id: club, name: 'Spring Fest', description: 'd', starts_on: day(40), ends_on: day(41), venue: 'Hall' };
    assert.equal((await call('POST', '/api/admin/fests', fest)).s, 401);
    assert.equal((await call('POST', '/api/admin/fests', { ...fest, ends_on: day(30) }, A)).s, 400);
    const f = await call('POST', '/api/admin/fests', fest, A); assert.equal(f.s, 201); assert.equal(f.j.name, 'Spring Fest');
    const ev = { fest_id: f.j.id, title: 'Open Mic', category: 'Culture', description: 'd', venue: 'Hall', starts_at: at(40, '10:00'), deadline: at(35, '23:59'), capacity: 5, auto_confirm: true, form_schema: [{ key: 'year', label: 'Year', type: 'select', required: true, options: ['1st', '2nd'] }] };
    assert.equal((await call('POST', '/api/admin/events', { ...ev, deadline: at(45, '10:00') }, A)).s, 400);
    assert.equal((await call('POST', '/api/admin/events', { ...ev, form_schema: [{ key: 'Bad Key', label: 'x', type: 'text' }] }, A)).s, 400);
    const e = await call('POST', '/api/admin/events', ev, A); assert.equal(e.s, 201); assert.equal(e.j.remaining, 5);
    assert.equal((await call('POST', `/api/events/${e.j.id}/register`, { name: 'Zed', email: 'z@x.com', answers: { year: '1st' } })).s, 201);
  });
  await t('rate limit returns 429', async () => { process.env.RATE_LIMIT_PER_MIN = '1'; const rs = []; for (let i = 0; i < 3; i++) rs.push((await call('POST', `/api/events/${id('Freshers Quiz')}/register`, { name: 'R', email: `rl${i}@x.com`, answers: { year: '1st' } })).s); assert(rs.includes(429), rs.join()); process.env.RATE_LIMIT_PER_MIN = '1000'; });
  console.log(`\n${pass} passed`); server.close();
});
