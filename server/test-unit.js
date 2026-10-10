// Unit + persistence tests for the pre-deploy fixes: node --no-warnings server/test-unit.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, parseTrustProxy } = require('./config');
const { parseInstant, isPast, shapeEvent } = require('./domain/registration');
const { csvCell, toCsv } = require('./domain/csv');
const { signPass, verifyPass, safeEqual } = require('./domain/pass');
const { createRateLimiter, clientIp } = require('./http/rate-limit');
const { open } = require('./db');
const { seed } = require('./seed');
const { createApp } = require('./app');
const { signJwt, verifyJwt, bearer } = require('./domain/jwt');
const { createAuthService } = require('./services/auth');

let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; } };

(async () => {
  await t('TRUST_PROXY "0"/"false"/unset/garbage are boolean false', () => {
    for (const v of ['0', 'false', 'FALSE', 'off', 'no', '', undefined, 'banana']) assert.strictEqual(parseTrustProxy(v), false, String(v));
    assert.strictEqual(parseTrustProxy('1'), 1); assert.strictEqual(parseTrustProxy('true'), 1); assert.strictEqual(parseTrustProxy('2'), 2);
  });
  await t('clientIp: ignores X-Forwarded-For unless trusted; reads rightmost hop', () => {
    const req = { headers: { 'x-forwarded-for': 'spoofed, 9.9.9.9' }, socket: { remoteAddress: '1.1.1.1' } };
    assert.equal(clientIp(req, false), '1.1.1.1'); assert.equal(clientIp(req, 1), '9.9.9.9');
  });
  await t('production refuses to start without ORGANIZER_KEY / PASS_SECRET / JWT_SECRET', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /ORGANIZER_KEY and PASS_SECRET and JWT_SECRET/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', ORGANIZER_KEY: 'k' }), /PASS_SECRET/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', ORGANIZER_KEY: 'k', PASS_SECRET: 's' }), /JWT_SECRET/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', ORGANIZER_KEY: 'demo-organizer-key', PASS_SECRET: 'x', JWT_SECRET: 'j' }), /placeholder/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', ORGANIZER_KEY: 'k', PASS_SECRET: 'x', JWT_SECRET: 'dev-jwt-secret' }), /placeholder/);
    assert.equal(loadConfig({ NODE_ENV: 'production', ORGANIZER_KEY: 'k', PASS_SECRET: 's', JWT_SECRET: 'j' }).production, true);
    assert.doesNotThrow(() => loadConfig({}));
  });
  await t('deadlines: explicit offsets honoured, naive strings are UTC (host TZ irrelevant)', () => {
    assert.equal(parseInstant('2026-11-15T23:59+06:00').toISOString(), '2026-11-15T17:59:00.000Z');
    assert.equal(parseInstant('2026-11-15T23:59').toISOString(), '2026-11-15T23:59:00.000Z');
    assert.equal(parseInstant('2026-11-15 23:59:00').toISOString(), '2026-11-15T23:59:00.000Z');
    assert.equal(parseInstant('garbage'), null);
    const now = new Date('2026-11-15T18:00:00Z');
    assert.equal(isPast('2026-11-15T23:59+06:00', now), true);   // 17:59Z already passed
    assert.equal(isPast('2026-11-15T23:59', now), false);        // naive = 23:59Z, still open
    assert.equal(shapeEvent({ deadline: '2026-11-15T23:59', starts_at: null, capacity: 2, taken: 2, form_schema: '[]' }, now).closed, true);
  });
  await t('csv: formula guard, quoting, CRLF', () => {
    assert.equal(csvCell('=1+1'), "'=1+1"); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('x\r\ny'), '"x\r\ny"'); assert.equal(toCsv([['a', null], [1, 2]]), 'a,\n1,2');
  });
  await t('pass tokens: verify with right secret, reject tamper / wrong secret, constant-time equal', () => {
    const tok = signPass(7, 's1'); assert(verifyPass(tok, 's1')); assert(!verifyPass(tok, 's2')); assert(!verifyPass(tok.replace(/^7/, '8'), 's1')); assert(!verifyPass('a.b', 's1'));
    assert(safeEqual('abc', 'abc')); assert(!safeEqual('abc', 'abcd')); assert(!safeEqual(undefined, 'x'));
  });
  await t('rate limiter: window, blocked(), per-key', () => {
    const l = createRateLimiter({ max: 2, windowMs: 1000 });
    assert(!l.hit('a', 0)); assert(!l.hit('a', 1)); assert(l.hit('a', 2)); assert(l.blocked('a', 3)); assert(!l.blocked('b', 3)); assert(!l.hit('a', 2000));
  });

  await t('jwt: round trip; tampered, expired, wrong-secret, wrong-audience and alg=none tokens rejected', () => {
    const tok = signJwt({ sub: 'x', aud: 'a' }, 'sec', { ttl: 60, at: 1000 });
    assert.equal(verifyJwt(tok, 'sec', { aud: 'a', at: 1030 }).sub, 'x');
    assert.equal(verifyJwt(tok, 'sec', { at: 1100 }), null, 'expired (past exp + 30s leeway)');
    assert.equal(verifyJwt(tok, 'other', { at: 1030 }), null, 'wrong secret');
    assert.equal(verifyJwt(tok, 'sec', { aud: 'b', at: 1030 }), null, 'wrong audience');
    const [h, p, sig] = tok.split('.'), forged = Buffer.from(JSON.stringify({ sub: 'admin', aud: 'a', exp: 9e9 })).toString('base64url');
    assert.equal(verifyJwt(`${h}.${forged}.${sig}`, 'sec', { at: 1030 }), null, 'payload swapped');
    assert.equal(verifyJwt(`${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`, 'sec', { at: 1030 }), null, 'alg none');
    for (const junk of [undefined, null, '', 'a.b', 'a.b.c', 42, {}]) assert.equal(verifyJwt(junk, 'sec'), null);
    assert.equal(bearer('Bearer ' + tok), tok); assert.equal(bearer('bearer  ' + tok), tok); assert.equal(bearer(tok), null); assert.equal(bearer('Basic abc'), null);
  });
  await t('auth service: login checks the key; rotating ORGANIZER_KEY or JWT_SECRET signs everyone out', () => {
    const cfg = { organizerKey: 'k', jwtSecret: 'j', jwtTtlSec: 60 }, auth = createAuthService(cfg);
    assert.throws(() => auth.login('nope'), (e) => e.kind === 'unauthorized'); assert.throws(() => auth.login(undefined), (e) => e.kind === 'unauthorized');
    const { token, token_type, expires_in } = auth.login('k'); assert.equal(token_type, 'Bearer'); assert.equal(expires_in, 60);
    assert.equal(auth.verify(token).role, 'organizer');
    assert.equal(createAuthService({ ...cfg, organizerKey: 'k2' }).verify(token), null);
    assert.equal(createAuthService({ ...cfg, jwtSecret: 'j2' }).verify(token), null);
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'club-'));
  const file = path.join(tmp, 'sub', 'club.db');       // nested dir: open() must create it
  const env = { ORGANIZER_KEY: 'k', PASS_SECRET: 's', RATE_LIMIT_PER_MIN: '1000' }; Object.assign(process.env, env);
  const boot = async () => { const app = createApp(seed(open(file)), loadConfig()); await new Promise((r) => app.server.listen(0, r)); const base = `http://localhost:${app.server.address().port}`;
    const call = async (m, p, body, h = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
    const org = () => ({ authorization: 'Bearer ' + createAuthService(app.config).login('k').token });   // minted directly: doesn't use up admin rate-limit hits
    return { app, call, org, stop: () => new Promise((r) => app.server.close(() => { app.db.close(); r(); })) }; };

  let token;
  await t('seed() on empty DB seeds; registrations survive a full server restart + re-seed', async () => {
    let s = await boot(); const events = (await s.call('GET', '/api/events')).j; assert.equal(events.length, 42);
    const ev = events.find((e) => e.title === 'AI Web Development Contest');
    const r = await s.call('POST', `/api/events/${ev.id}/register`, { name: 'Persist Me', email: 'persist@x.com', answers: { year: '1st' } }); assert.equal(r.s, 201); token = r.j.manage_token;
    const before = (await s.call('GET', '/api/admin/stats', null, s.org())).j.registrations;
    await s.stop();
    s = await boot();                                   // "restart": reopen file, seed() runs again
    assert.equal((await s.call('GET', '/api/events')).j.length, 42, 'no duplicate seeding');
    const view = await s.call('GET', `/api/registrations/${token}`); assert.equal(view.s, 200); assert.equal(view.j.name, 'Persist Me'); assert(Number.isInteger(view.j.fest_id), 'confirmation page needs fest_id'); assert(view.j.pass_token);
    assert.deepEqual((await s.call('GET', '/api/admin/stats', null, s.org())).j.registrations, before);
    await s.stop();
  });
  await t('hierarchy API: 16 clubs, fests per club, fest page lists its events in order', async () => {
    const s = await boot(); const clubs = (await s.call('GET', '/api/clubs')).j; assert.equal(clubs.length, 16);
    const it = clubs[0]; assert.equal(it.name, 'DRMC IT Club'); assert.equal(it.fest_count, 4); assert.equal(it.event_count, 12);
    const club = (await s.call('GET', '/api/clubs/' + it.id)).j;
    assert.deepEqual(club.fests.map((f) => f.name), ['Open Source Week 2026', 'Tech Carnival 2026', 'Winter Tech Fest 2026', 'Freshers Tech Fest 2027']);
    assert.deepEqual(club.fests.map((f) => f.status), ['past', 'live', 'upcoming', 'upcoming'], 'fest status is computed server-side');
    const fest = (await s.call('GET', '/api/fests/' + club.fests[1].id)).j;
    assert.deepEqual(fest.events.map((e) => e.title), ['Opening Keynote', 'AI Web Development Contest', 'Robotics Challenge', 'Programming Contest', 'Gaming Tournament']);
    assert.equal(fest.club_name, 'DRMC IT Club'); assert.equal(fest.event_count, 5); assert(fest.events.every((e) => e.fest_id === fest.id && e.club_name === 'DRMC IT Club'));
    assert.equal((await s.call('GET', '/api/events?club=' + it.id)).j.length, 12); assert.equal((await s.call('GET', '/api/fests?club=' + it.id)).j.length, 4);
    assert.equal((await s.call('GET', '/api/fests/9999')).s, 404); assert.equal((await s.call('GET', '/api/clubs/9999')).s, 404);
    assert((await s.call('GET', '/api/clubs')).j.every((c) => c.fest_count >= 1 && c.event_count >= 2), 'every club has a fest with events');
    await s.stop();
  });
  await t('migration: a pre-club database gets fests.club_id and a default IT Club, data kept', async () => {
    const { DatabaseSync } = require('node:sqlite'); const f = path.join(tmp, 'old.db'); const old = new DatabaseSync(f);
    old.exec("CREATE TABLE fests (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, starts_on TEXT, ends_on TEXT, venue TEXT); INSERT INTO fests(name) VALUES ('Legacy Fest');"); old.close();
    const db = open(f); const row = db.prepare('SELECT f.name, c.name AS club FROM fests f JOIN clubs c ON c.id = f.club_id').get();
    assert.deepEqual({ ...row }, { name: 'Legacy Fest', club: 'DRMC IT Club' }); db.close(); open(f).close(); // second open is a no-op
  });
  await t('admin routes are rate limited (429 + retry-after) and wrong-key guessing is throttled', async () => {
    process.env.ADMIN_RATE_LIMIT_PER_MIN = '3'; const s = await boot(); const A = s.org();
    const codes = []; for (let i = 0; i < 5; i++) codes.push((await s.call('GET', '/api/admin/stats', null, A)).s);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]); await s.stop();
    process.env.ADMIN_RATE_LIMIT_PER_MIN = '1000'; process.env.AUTH_FAIL_LIMIT_PER_MIN = '3'; const s2 = await boot(); const bad = [];
    for (let i = 0; i < 5; i++) bad.push((await s2.call('GET', '/api/admin/stats', null, { authorization: 'Bearer bad.token.' + i })).s);
    assert.deepEqual(bad, [401, 401, 401, 429, 429]);
    assert.equal((await s2.call('GET', '/api/admin/stats', null, s2.org())).s, 429, 'valid token also blocked while throttled'); await s2.stop();
    const s3 = await boot(), guesses = [];                                      // wrong keys at the login endpoint share that throttle
    for (let i = 0; i < 5; i++) guesses.push((await s3.call('POST', '/api/admin/login', { key: 'nope' + i })).s);
    assert.deepEqual(guesses, [401, 401, 401, 429, 429]);
    assert.equal((await s3.call('POST', '/api/admin/login', { key: 'k' })).s, 429, 'right key also blocked while throttled'); await s3.stop();
    delete process.env.ADMIN_RATE_LIMIT_PER_MIN; delete process.env.AUTH_FAIL_LIMIT_PER_MIN;
  });
  await t('static: serves modules, blocks path traversal, 404 for missing assets, SPA fallback for routes', async () => {
    const s = await boot(); const base = `http://localhost:${s.app.server.address().port}`;
    assert.equal((await fetch(base + '/nope.js')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
    assert.equal((await fetch(base + '/..%2fserver%2fdb.js')).status, 404);
    const spa = await fetch(base + '/some/route'); assert.equal(spa.status, 200); assert((await spa.text()).includes('<!doctype html>'));
    await s.stop();
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
})();
