// Fest / Event Directory: every DRMC club with its fests. Pick a fest -> #/fest/:id. Searching shows matching events.
import { api, apiLatest, debounce, toast } from '../api.js';
import { $, $$, esc, hydrate, countTo, pctOf, tone, dateRange, eventCard, ic } from '../ui.js';

const state = { q: '', club: '' };   // survives navigation

const festCard = (f) => {
  const pct = pctOf(f.taken, f.capacity);
  return `<a class="card glass" href="#/fest/${f.id}" aria-label="${esc(f.name)}, ${f.event_count} events">
    <div class="card-top"><span class="chip">Fest</span><span class="badge muted">${f.event_count} event${f.event_count === 1 ? '' : 's'}</span></div>
    <h3>${esc(f.name)}</h3><p class="desc clamp">${esc(f.description || '')}</p>
    <div class="meta"><span>${ic('cal')}${dateRange(f.starts_on, f.ends_on)}</span><span>${ic('pin')}${esc(f.venue || 'Venue TBA')}</span></div>
    <div class="meter" role="progressbar" aria-label="Seats taken across the fest" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i class="${tone(pct, false)}" data-meter="${pct}" data-key="fest${f.id}"></i></div>
    <div class="meter-foot"><span>${f.taken}/${f.capacity} seats taken</span><span class="go">View events</span></div></a>`;
};

export async function directory({ view, onCleanup }) {
  let [clubs, fests] = await Promise.all([api('/clubs'), api('/fests')]), sig = '';
  view.innerHTML = `<section class="hero glass"><div><span class="eyebrow"><i class="dot"></i>Live, <span id="upd">syncing…</span></span>
      <h1>DRMC clubs, fests <em>&amp; events.</em></h1><p>Pick a club, choose a fest, then register for the events you want. No account needed.</p>
      <form class="search" role="search" id="sf"><label class="sr" for="q">Search events</label><input id="q" type="search" autocomplete="off" placeholder="Search all events, e.g. robotics" value="${esc(state.q)}"><button class="btn primary">Search</button></form>
      <div class="cta"><button class="btn" id="browse" type="button">Browse fests</button><a class="btn ghost" href="#/organizer">I'm an organizer</a></div></div>
    <div class="hero-stats" aria-label="Live numbers">${[['clubs', 'Clubs'], ['fests', 'Fests'], ['events', 'Events'], ['seats', 'Seats left']].map(([k, l]) => `<div class="stat"><b data-stat="${k}">0</b><span>${l}</span></div>`).join('')}</div></section>
    <div class="filters"><div class="pills scroll" id="clubs" role="group" aria-label="Clubs"></div></div>
    <div id="out" aria-live="polite"><div class="bento">${'<div class="skel"></div>'.repeat(6)}</div></div>`;

  const paintPills = () => { $('#clubs').innerHTML = [{ id: '', name: 'All clubs', emoji: '✨' }, ...clubs].map((c) => `<button class="pill ${String(state.club) === String(c.id) ? 'on' : ''}" data-c="${c.id}" aria-pressed="${String(state.club) === String(c.id)}">${esc(c.name)}</button>`).join(''); };
  const paintStats = () => {
    const v = { clubs: clubs.length, fests: fests.length, events: clubs.reduce((n, c) => n + c.event_count, 0), seats: fests.reduce((n, f) => n + Math.max(0, f.capacity - f.taken), 0) };
    $$('[data-stat]', view).forEach((el) => countTo(el, v[el.dataset.stat])); $('#upd').textContent = 'updated ' + new Date().toLocaleTimeString([], { timeStyle: 'short' });
  };
  const sections = () => {
    const list = clubs.filter((c) => !state.club || String(c.id) === String(state.club));
    $('#out').innerHTML = list.map((c) => { const fs = fests.filter((f) => f.club_id === c.id);
      return `<section class="club" aria-labelledby="club${c.id}"><header class="club-head"><span class="club-emoji" aria-hidden="true">${c.emoji}</span><div><h2 id="club${c.id}">${esc(c.name)}</h2>
        <p class="mute small">${esc(c.description || '')} · ${c.fest_count} fest${c.fest_count === 1 ? '' : 's'} · ${c.event_count} events</p></div></header>
        <div class="bento">${fs.map(festCard).join('') || '<div class="empty">No fests yet.</div>'}</div></section>`; }).join('') || '<div class="empty"><b>No results</b>No clubs match.</div>';
    hydrate($('#out'));
  };
  const search = async () => {
    const p = new URLSearchParams(Object.entries({ q: state.q.trim(), club: state.club }).filter(([, v]) => v));
    const events = await apiLatest('dir-search', '/events?' + p); if (!events) return;
    $('#out').innerHTML = `<p class="mute small results-note">${events.length} event${events.length === 1 ? '' : 's'} matching “${esc(state.q.trim())}”</p><div class="bento">${events.map(eventCard).join('') ||
      '<div class="empty"><b>No results</b>No events match your search.<div class="actions"><button class="btn" id="clear">Clear search</button></div></div>'}</div>`; hydrate($('#out'));
  };
  const render = () => (state.q.trim() ? search() : sections());
  const refresh = async () => { try { const [c, f] = await Promise.all([apiLatest('dir-clubs', '/clubs'), apiLatest('dir-fests', '/fests')]); if (!c || !f) return; const s = JSON.stringify([c, f]); if (s === sig) return; sig = s; clubs = c; fests = f; paintStats(); if (!state.q.trim()) sections(); } catch { /* keep showing last data */ } };

  const run = debounce(() => { state.q = $('#q').value; Promise.resolve(render()).catch((e) => toast(e.message, 'error')); }, 300);   // debounced search
  $('#q').addEventListener('input', run);
  $('#sf').onsubmit = (e) => { e.preventDefault(); run.cancel(); state.q = $('#q').value; render(); $('#out').scrollIntoView({ behavior: 'smooth' }); };
  $('#browse').onclick = () => $('#out').scrollIntoView({ behavior: 'smooth' });
  $('#clubs').onclick = (e) => { const b = e.target.closest('.pill'); if (b) { state.club = b.dataset.c; paintPills(); render(); } };
  view.onclick = (e) => { if (e.target.id === 'clear') { state.q = ''; $('#q').value = ''; render(); } };
  view.addEventListener('pointermove', (e) => { const c = e.target.closest('.card'); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); } });

  sig = JSON.stringify([clubs, fests]); paintPills(); paintStats(); render();
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 20000);   // live seat counts
  onCleanup(() => { clearInterval(timer); run.cancel(); });
}
