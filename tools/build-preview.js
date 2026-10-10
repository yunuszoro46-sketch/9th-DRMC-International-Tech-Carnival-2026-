// Builds ONE self-contained preview.html: the real UI (theme.css, qr.js, ui/api/views/app) + an in-browser fake /api with sample data.
// Usage: node tools/build-preview.js [out.html]
const fs = require('fs'), path = require('path'), P = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const { CATALOG, FORMS } = require('../server/seed-data');
const mockFn = (CATALOG, FORMS) => {   // serialised into the page; runs in the browser, not at build time
  const base = Date.parse('2026-10-05T00:00:00Z'), shift = Math.max(0, Date.now() - base), rnd = () => Math.random().toString(36).slice(2, 10);
  const when = (local) => new Date(Date.parse(local + ':00+06:00') + shift).toISOString();   // dates slide forward so the preview never goes stale
  const clubs = [], fests = [], events = [];
  CATALOG.forEach((c) => { const club = { id: clubs.length + 1, name: c.name, slug: String(clubs.length + 1), description: c.description, emoji: c.emoji }; clubs.push(club);
    c.fests.forEach((f) => { const fest = { id: fests.length + 1, club_id: club.id, name: f.name, description: f.description, starts_on: f.starts_on, ends_on: f.ends_on, venue: f.venue }; fests.push(fest);
      f.events.forEach((e) => events.push({ id: events.length + 1, fest_id: fest.id, title: e.title, category: e.category, description: e.description, venue: e.venue, starts_at: when(e.start), deadline: when(e.deadline), capacity: e.capacity, auto_confirm: e.auto ? 1 : 0, form_schema: FORMS[e.form] })); }); });
  const regs = []; let rid = 0;
  const add = (event_id, name, email, answers, status) => { const id = ++rid; regs.push({ id, event_id, name, email, answers, status, manage_token: 'm' + rnd() + id, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), pass: status === 'CONFIRMED' ? { token: id + '.' + rnd() + '.' + rnd(), status: 'ISSUED' } : null }); return regs[regs.length - 1]; };
  const evId = (t) => events.find((e) => e.title === t).id, names = ['Ayesha Rahman', 'Tanvir Hasan', 'Nusrat Jahan', 'Rafi Ahmed', 'Mehnaz Akter', 'Sabbir Hossain', 'Farhana Islam', 'Imran Khan'], em = (n) => n.split(' ')[0].toLowerCase() + '@example.com';
  names.slice(0, 6).forEach((n, i) => add(evId('Programming Contest'), n, em(n), { team: 'Team ' + (i + 1), size: '2' }, i % 3 ? 'CONFIRMED' : 'PENDING'));
  names.slice(0, 4).forEach((n) => add(evId('AI Web Development Contest'), n, em(n), { year: '2nd' }, 'CONFIRMED'));
  names.slice(0, 5).forEach((n, i) => add(evId('Gaming Tournament'), n, em(n), { team: 'Squad ' + i, size: '1' }, 'PENDING'));
  names.slice(2, 8).forEach((n, i) => add(evId('Workshop: Web in a Day'), n, em(n), { year: '3rd' }, i % 2 ? 'PENDING' : 'CONFIRMED'));
  const live = ['PENDING', 'CONFIRMED'], taken = (e) => regs.filter((r) => r.event_id === e.id && live.includes(r.status)).length;
  const festOf = (e) => fests.find((f) => f.id === e.fest_id), clubOf = (f) => clubs.find((c) => c.id === f.club_id);
  const shape = (e) => { const f = festOf(e), c = clubOf(f), tk = taken(e), dp = new Date(e.deadline) < new Date(), full = tk >= e.capacity;
    return { ...e, fest_name: f.name, club_id: c.id, club_name: c.name, taken: tk, remaining: Math.max(0, e.capacity - tk), deadline_passed: dp, full, closed: dp || full }; };
  const festCard = (f) => { const c = clubOf(f), es = events.filter((e) => e.fest_id === f.id); return { ...f, club_name: c.name, club_slug: c.slug, club_emoji: c.emoji, event_count: es.length, capacity: es.reduce((n, e) => n + e.capacity, 0), taken: es.reduce((n, e) => n + taken(e), 0) }; };
  const clubCard = (c) => { const fs = fests.filter((f) => f.club_id === c.id); return { ...c, fest_count: fs.length, event_count: events.filter((e) => fs.some((f) => f.id === e.fest_id)).length }; };
  const filterEvents = (q) => { const s = (q.get('q') || '').toLowerCase(); return events.map(shape).filter((e) => (!s || (e.title + ' ' + e.description).toLowerCase().includes(s)) && (!q.get('category') || e.category === q.get('category')) && (!q.get('fest') || e.fest_id === +q.get('fest')) && (!q.get('club') || e.club_id === +q.get('club'))).sort((a, b) => a.starts_at.localeCompare(b.starts_at)); };
  const syncPass = (r) => { if (r.status === 'CONFIRMED') { if (!r.pass) r.pass = { token: r.id + '.' + rnd() + '.' + rnd(), status: 'ISSUED' }; else if (r.pass.status === 'REVOKED') r.pass.status = 'ISSUED'; } else if (r.pass && r.pass.status === 'ISSUED') r.pass.status = 'REVOKED'; };
  const E = (status, error, extra) => ({ status, body: { error, ...extra } });
  function handle(method, path, q, body, key) {
    let m;
    if (path === '/clubs') return { body: clubs.map(clubCard) };
    if ((m = path.match(/^\/clubs\/(\d+)$/))) { const c = clubs.find((x) => x.id === +m[1]); return c ? { body: { ...clubCard(c), fests: fests.filter((f) => f.club_id === c.id).map(festCard) } } : E(404, 'Club not found'); }
    if (path === '/fests') return { body: fests.filter((f) => !q.get('club') || f.club_id === +q.get('club')).map(festCard) };
    if ((m = path.match(/^\/fests\/(\d+)$/))) { const f = fests.find((x) => x.id === +m[1]); return f ? { body: { ...festCard(f), events: filterEvents(new URLSearchParams({ fest: f.id })) } } : E(404, 'Fest not found'); }
    if (path === '/events') return { body: filterEvents(q) };
    if ((m = path.match(/^\/events\/(\d+)$/))) { const e = events.find((x) => x.id === +m[1]); return e ? { body: shape(e) } : E(404, 'Event not found'); }
    if ((m = path.match(/^\/events\/(\d+)\/register$/)) && method === 'POST') {
      const e = events.find((x) => x.id === +m[1]); if (!e) return E(404, 'Event not found'); const s = shape(e);
      const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase();
      if (!name) return E(400, 'Name is required'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return E(400, 'Valid email is required');
      if (s.deadline_passed) return E(409, 'Registration deadline has passed'); if (s.full) return E(409, 'Event is full');
      for (const f of e.form_schema) { const v = String((body.answers || {})[f.key] || '').trim(); if (f.required && !v) return E(400, '"' + f.label + '" is required'); }
      if (regs.some((r) => r.event_id === e.id && r.email === email && r.status !== 'CANCELLED')) return E(409, 'This email is already registered for this event');
      const r = add(e.id, name, email, body.answers || {}, e.auto_confirm ? 'CONFIRMED' : 'PENDING'); return { status: 201, body: { id: r.id, status: r.status, manage_token: r.manage_token } };
    }
    if ((m = path.match(/^\/registrations\/([\w-]+)(\/cancel)?$/))) {
      const r = regs.find((x) => x.manage_token === m[1]); if (!r) return E(404, 'Registration not found');
      if (m[2]) { r.status = 'CANCELLED'; syncPass(r); return { body: { ok: true } }; }
      const e = events.find((x) => x.id === r.event_id); return { body: { id: r.id, name: r.name, email: r.email, status: r.status, answers: JSON.stringify(r.answers), created_at: r.created_at, event_id: e.id, fest_id: e.fest_id, title: e.title, venue: e.venue, starts_at: e.starts_at,
        pass_token: r.status !== 'CONFIRMED' || !r.pass || r.pass.status === 'REVOKED' ? null : r.pass.token, pass_status: r.pass && r.pass.status } };
    }
    if (path === '/admin/login' && method === 'POST') return body.key === 'demo-organizer-key' ? { body: { token: 'preview-session', token_type: 'Bearer', expires_in: 28800 } } : E(401, "That organizer key wasn't accepted.");
    if (path.startsWith('/admin/')) {
      if (key !== 'Bearer preview-session') return E(401, 'Organizer sign-in required');
      if (path === '/admin/stats') { const by = {}; regs.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
        return { body: { fests: fests.length, events: events.length, registrations: Object.entries(by).map(([status, n]) => ({ status, n })), checkedIn: regs.filter((r) => r.pass && r.pass.status === 'CHECKED_IN').length,
          capacity: events.map((e) => ({ id: e.id, title: e.title, category: e.category, capacity: e.capacity, fest_name: festOf(e).name, club_name: clubOf(festOf(e)).name, taken: taken(e) })) } }; }
      if ((m = path.match(/^\/admin\/events\/(\d+)\/registrations$/))) { const s = (q.get('q') || '').toLowerCase();
        return { body: regs.filter((r) => r.event_id === +m[1] && (!q.get('status') || r.status === q.get('status')) && (!s || (r.name + r.email).toLowerCase().includes(s))).map((r) => ({ id: r.id, name: r.name, email: r.email, status: r.status, answers: '{}', created_at: r.created_at, pass_status: r.pass && r.pass.status })) }; }
      if ((m = path.match(/^\/admin\/registrations\/(\d+)$/)) && method === 'PATCH') { const r = regs.find((x) => x.id === +m[1]); if (!r) return E(404, 'Registration not found');
        if (!['PENDING', 'CONFIRMED', 'REJECTED'].includes(body.status)) return E(400, 'Invalid status'); if (r.status === 'CANCELLED') return E(409, 'Registration was cancelled by the participant');
        const e = events.find((x) => x.id === r.event_id); if (r.status === 'REJECTED' && body.status !== 'REJECTED' && taken(e) >= e.capacity) return E(409, 'Event is full'); r.status = body.status; syncPass(r); return { body: { ok: true } }; }
      if ((m = path.match(/^\/admin\/events\/(\d+)\/export\.csv$/))) return { csv: 'id,name,email,status\n' + regs.filter((r) => r.event_id === +m[1]).map((r) => [r.id, r.name, r.email, r.status].join(',')).join('\n') };
      if (path === '/admin/checkin') { const r = regs.find((x) => x.pass && x.pass.token === body.token); if (!r) return E(400, 'Invalid pass'); const e = events.find((x) => x.id === r.event_id), info = { name: r.name, email: r.email, title: e.title, status: r.pass.status };
        if (r.pass.status === 'ISSUED') { r.pass.status = 'CHECKED_IN'; return { body: { ok: true, result: 'CHECKED_IN', ...info, status: 'CHECKED_IN' } }; } return r.pass.status === 'CHECKED_IN' ? E(409, 'Already used', { pass: info }) : E(403, 'Pass revoked', { pass: info }); }
    }
    return E(404, 'Not found');
  }
  window.fetch = async (url, o = {}) => { const u = new URL(url, 'http://x'), out = handle((o.method || 'GET').toUpperCase(), u.pathname.replace(/^\/api/, ''), u.searchParams, o.body ? JSON.parse(o.body) : {}, (o.headers || {}).authorization);
    await new Promise((r) => setTimeout(r, 120));
    return out.csv !== undefined ? new Response(out.csv, { status: 200, headers: { 'content-type': 'text/csv' } }) : new Response(JSON.stringify(out.body), { status: out.status || 200, headers: { 'content-type': 'application/json' } }); };
};
const mock = '(' + mockFn + ')(' + JSON.stringify(CATALOG) + ',' + JSON.stringify(FORMS) + ');';
const strip = (src) => src.replace(/^import .*$/gm, '').replace(/^export (async function|function|const|let)/gm, '$1');
let js = ['ui.js', 'api.js', 'views/directory.js', 'views/fest.js', 'views/event.js', 'views/confirmation.js', 'views/my-registrations.js', 'views/organizer.js', 'app.js'].map((f) => strip(P(f))).join('\n');
js = js.replace(/sessionStorage/g, '__ss').replace("['localhost', '127.0.0.1'].includes(location.hostname)", 'true');
const ss = `const __ss=(()=>{let m={};return{getItem:k=>m[k]??null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}}})();`;
let html = P('index.html').replace('<link rel="stylesheet" href="/css/theme.css">', () => '<style>' + P('css/theme.css') + ':root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>')
  .replace('viewport" content="width=device-width,initial-scale=1"', 'viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"')
  .replace('/img/logo.png', () => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'logo.png')).toString('base64'))
  .replace('<script src="/qr.js"></script>', () => '<script>' + P('qr.js') + '</script>')
  .replace('<script type="module" src="/app.js"></script>', () => '<script>' + mock + '</script><script>(()=>{' + ss + js + '})();</script>')
  .replace('<div class="util"><div>', '<div class="util"><div><span><b>PREVIEW</b> · sample data kept in your browser only · organizer key: <b>demo-organizer-key</b></span></div><div>');
fs.writeFileSync(process.argv[2] || 'preview.html', html); console.log('built', (html.length / 1024).toFixed(0) + ' KB');
