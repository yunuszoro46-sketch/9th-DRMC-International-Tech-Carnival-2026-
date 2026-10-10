// Organizer console: login, live stat widgets, capacity board, gate check-in, filterable participant table.
import { api, apiLatest, debounce, toast, orgToken, downloadCsv } from '../api.js';
import { $, $$, esc, fmt, hydrate, countTo, pctOf, tone } from '../ui.js';

const STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'];

export async function organizer(ctx) {
  const { view } = ctx;
  if (!orgToken.get()) return login(ctx);
  const first = await api('/admin/stats', { admin: true }).catch((e) => { if (e.status === 401 || e.status === 429) { if (e.status === 401) orgToken.clear(); toast(e.status === 401 ? 'Organizer session expired. Please sign in again.' : e.message, 'error'); return null; } throw e; });
  if (!first) return login(ctx);

  const sel = { ev: first.capacity[0]?.id ?? '', status: '', q: '' };
  const guard = async (fn) => { try { return await fn(); } catch (e) { if (e.status === 401) { orgToken.clear(); toast('Session expired. Sign in again.', 'warn'); organizer(ctx); } else toast(e.message, 'error'); } };

  view.innerHTML = `<div class="dash-head"><div><h1>Organizer console</h1><p class="mute small"><span class="dot"></span> Live · updated <span id="upd">now</span></p></div>
      <div class="actions"><button class="btn" id="refresh">Refresh</button><button class="btn ghost" id="logout">Log out</button></div></div>
    <section class="bento dash" aria-label="Key numbers">${[['events', 'Events'], ['fests', 'Fests'], ['total', 'Registrations'], ['CONFIRMED', 'Confirmed'], ['PENDING', 'Awaiting approval'], ['checkedIn', 'Checked in']]
      .map(([k, l]) => `<div class="widget glass"><span>${l}</span><b data-stat="${k}">0</b></div>`).join('')}
      <div class="widget glass wide"><span>Registration status</span><div class="stack" id="stack" role="img" aria-label="Registration status distribution"></div><div class="legend" id="legend"></div></div>
      <div class="widget glass wide"><span>Capacity by event (click to filter)</span><div id="caps"></div></div></section>
    <section class="panel glass"><h2>Gate check-in</h2><div class="row"><label class="sr" for="tok">Pass token</label><input id="tok" placeholder="Paste or scan a pass token" autocomplete="off"><button class="btn primary" id="ci">Check in</button><button class="btn" id="cam">Scan with camera</button></div>
      <div id="cires" aria-live="polite"></div><video id="vid" class="vid" hidden playsinline muted></video></section>
    <section class="panel glass"><h2>Participants</h2><div class="row"><label class="sr" for="ev">Event</label><select id="ev"></select>
      <label class="sr" for="pq">Search</label><input id="pq" type="search" placeholder="Search name or email" autocomplete="off"><label class="sr" for="ps">Status</label>
      <select id="ps"><option value="">Any status</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select><button class="btn" id="csv">Export CSV</button></div>
      <p class="mute small" id="count"></p><div class="tablewrap" id="tbl"></div></section>`;

  function paintStats(s) {
    const by = s.registrations, total = by.total;
    const v = { events: s.events, fests: s.fests, total, CONFIRMED: by.CONFIRMED || 0, PENDING: by.PENDING || 0, checkedIn: s.checkedIn };
    $$('[data-stat]', view).forEach((el) => countTo(el, v[el.dataset.stat]));
    $('#stack').innerHTML = STATUSES.map((k) => `<i class="${k}" data-meter="${pctOf(by[k] || 0, total)}" data-key="st${k}" title="${k}"></i>`).join('');
    $('#legend').innerHTML = STATUSES.map((k) => `<span><span class="badge ${k}">${k}</span> ${by[k] || 0}</span>`).join('');
    $('#caps').innerHTML = [...s.capacity].sort((a, b) => pctOf(b.taken, b.capacity) - pctOf(a.taken, a.capacity)).map((e) => {
      const p = pctOf(e.taken, e.capacity);
      return `<button class="caprow" data-ev="${e.id}"><span class="t"><span>${esc(e.title)}</span><span>${e.taken}/${e.capacity}</span></span><div class="meter"><i class="${tone(p, false)}" data-meter="${p}" data-key="cap${e.id}"></i></div></button>`;
    }).join('');
    const evSel = $('#ev'), cur = sel.ev || evSel.value;
    const groups = {}; s.capacity.forEach((e) => (groups[e.club_name] ||= []).push(e));
    evSel.innerHTML = Object.entries(groups).map(([club, list]) => `<optgroup label="${esc(club)}">${list.map((e) => `<option value="${e.id}" ${String(e.id) === String(cur) ? 'selected' : ''}>${esc(e.title)} · ${esc(e.fest_name)}</option>`).join('')}</optgroup>`).join(''); sel.ev = evSel.value;
    hydrate(view); $('#upd').textContent = new Date().toLocaleTimeString([], { timeStyle: 'medium' });
  }
  const loadStats = () => guard(async () => { const s = await api('/admin/stats', { admin: true }); paintStats(s); });
  const loadTable = () => guard(async () => {
    if (!sel.ev) { $('#tbl').innerHTML = '<p class="mute">No events yet.</p>'; return; }
    const p = new URLSearchParams(Object.entries({ q: sel.q.trim(), status: sel.status }).filter(([, v]) => v));
    const rows = await apiLatest('org-table', `/admin/events/${sel.ev}/registrations?${p}`, { admin: true }); if (!rows) return;
    $('#count').textContent = `${rows.length} participant${rows.length === 1 ? '' : 's'}`;
    $('#tbl').innerHTML = rows.length ? `<table><thead><tr><th>Name</th><th>Email</th><th>Registered</th><th>Status</th><th>Pass</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td class="mute">${fmt(r.created_at.replace(' ', 'T') + 'Z')}</td>
      <td>${r.status === 'CANCELLED' ? '<span class="badge CANCELLED">CANCELLED</span>' : `<select data-id="${r.id}" aria-label="Status for ${esc(r.name)}">${['PENDING', 'CONFIRMED', 'REJECTED'].map((x) => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select>`}</td>
      <td>${r.pass_status ? `<span class="badge ${r.pass_status}">${r.pass_status}</span>` : '<span class="mute">·</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">No participants match.</p>';
  });
  paintStats(first); loadTable();

  // filters: text search debounced, selects immediate; latest request wins
  const search = debounce(() => { sel.q = $('#pq').value; loadTable(); }, 300);
  $('#pq').addEventListener('input', search);
  $('#ev').onchange = (e) => { sel.ev = e.target.value; loadTable(); };
  $('#ps').onchange = (e) => { sel.status = e.target.value; loadTable(); };
  $('#caps').onclick = (e) => { const b = e.target.closest('[data-ev]'); if (b) { sel.ev = b.dataset.ev; $('#ev').value = sel.ev; loadTable(); $('#tbl').scrollIntoView({ behavior: 'smooth', block: 'center' }); } };
  $('#tbl').onchange = (e) => { const s = e.target.closest('select[data-id]'); if (s) guard(async () => { try { await api('/admin/registrations/' + s.dataset.id, { method: 'PATCH', admin: true, body: { status: s.value } }); toast(`Marked ${s.value.toLowerCase()}`, 'success'); } catch (x) { if (x.status === 401) throw x; toast(x.message, 'error'); } await Promise.all([loadTable(), loadStats()]); }); };
  $('#refresh').onclick = () => { loadStats(); loadTable(); };
  $('#logout').onclick = () => { orgToken.clear(); toast('Signed out', 'success'); organizer(ctx); };
  $('#csv').onclick = () => guard(async () => { await downloadCsv(`/admin/events/${sel.ev}/export.csv`, `event-${sel.ev}-participants.csv`); toast('CSV downloaded', 'success'); });

  // gate check-in
  const out = (m, c) => { $('#cires').innerHTML = `<div class="result ${c}">${esc(m)}</div>`; };
  const check = (token) => guard(async () => {
    try { const r = await api('/admin/checkin', { method: 'POST', admin: true, body: { token } }); out(`✓ Welcome ${r.name} · ${r.title}`, 'ok'); toast(`Checked in ${r.name}`, 'success'); $('#tok').value = ''; loadStats(); loadTable(); }
    catch (e) { if (e.status === 401) throw e; out(`✕ ${e.message}${e.data && e.data.pass ? ` (${e.data.pass.name})` : ''}`, e.status === 409 ? 'warn' : 'bad'); }
  });
  $('#ci').onclick = () => { const t = $('#tok').value.trim(); if (t) check(t); else toast('Paste a pass token first', 'warn'); };
  $('#tok').onkeydown = (e) => { if (e.key === 'Enter') $('#ci').click(); };
  let stream; const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; const v = $('#vid'); if (v) v.hidden = true; };
  $('#cam').onclick = async () => {
    if (!('BarcodeDetector' in window)) return out('Camera scanning is not supported in this browser. Paste the token instead.', 'warn');
    const v = $('#vid');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch { return out('Camera blocked. Paste the token instead.', 'warn'); }
    v.srcObject = stream; v.hidden = false; await v.play();
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    const tick = async () => { if (!stream) return; const c = await det.detect(v).catch(() => []); if (c[0]) { stopCam(); return check(c[0].rawValue); } requestAnimationFrame(tick); }; tick();
  };

  const timer = setInterval(() => { if (document.hidden) return; loadStats(); if (!['SELECT', 'INPUT'].includes(document.activeElement?.tagName)) loadTable(); }, 15000);
  ctx.onCleanup(() => { clearInterval(timer); search.cancel(); stopCam(); });
}

function login(ctx) {
  const { view } = ctx, demo = ['localhost', '127.0.0.1'].includes(location.hostname);
  view.innerHTML = `<section class="login glass"><h1>Organizer login</h1><p class="mute">Enter the organizer key to manage events and check people in.</p>
    <form id="lf"><label for="k">Organizer key</label><input id="k" type="password" autocomplete="current-password" required placeholder="${demo ? 'Local demo key: demo-organizer-key' : 'Organizer key'}">
    <div class="actions"><button class="btn primary" id="go">Enter console</button></div></form></section>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault(); const go = $('#go'); go.disabled = true;
    try { orgToken.set((await api('/admin/login', { method: 'POST', body: { key: $('#k').value } })).token); toast('Welcome back', 'success'); organizer(ctx); }
    catch (x) { orgToken.clear(); toast(x.status === 401 ? 'Wrong organizer key' : x.message, 'error'); go.disabled = false; $('#k').select(); }
  };
}
