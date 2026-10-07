// Fest details page: fest header + the list of its events. Pick an event -> #/event/:id.
import { api, apiLatest, debounce, toast } from '../api.js';
import { $, esc, hydrate, countTo, crumbs, dateRange, eventCard, ic } from '../ui.js';

export async function fest({ view, params, onCleanup }) {
  const f = await api('/fests/' + params[0]), st = { q: '', cat: '' }, cats = [...new Set(f.events.map((e) => e.category))];
  const open = f.events.filter((e) => !e.closed), seats = open.reduce((n, e) => n + e.remaining, 0);
  view.innerHTML = `${crumbs([['Directory', '#/'], [f.club_name || 'Club', '#/'], [f.name]])}
    <section class="page-head glass"><span class="chip">${esc(f.club_name || 'DRMC club')}</span><h1>${esc(f.name)}</h1><p class="mute">${esc(f.description || '')}</p>
      <div class="facts"><span>${ic('cal')}${dateRange(f.starts_on, f.ends_on)}</span><span>${ic('pin')}${esc(f.venue || 'Venue TBA')}</span></div>
      <div class="mini-stats"><div><b data-stat="e">0</b><span>Events</span></div><div><b data-stat="o">0</b><span>Open for registration</span></div><div><b data-stat="s">0</b><span>Seats left</span></div></div></section>
    <div class="filters"><label class="sr" for="fq">Search events in this fest</label><input id="fq" class="grow" type="search" autocomplete="off" placeholder="Search events in this fest…">
      <div class="pills scroll" id="cats" role="group" aria-label="Categories"></div></div>
    <h2 class="sect">Events <span class="mute small" id="cnt"></span></h2><div class="bento" id="list" aria-live="polite"></div>`;
  countTo($('[data-stat=e]'), f.events.length); countTo($('[data-stat=o]'), open.length); countTo($('[data-stat=s]'), seats);
  const pills = () => { $('#cats').innerHTML = ['', ...cats].map((c) => `<button class="pill ${st.cat === c ? 'on' : ''}" data-c="${esc(c)}" aria-pressed="${st.cat === c}">${c ? esc(c) : 'All'}</button>`).join(''); };
  const paint = (events) => { $('#cnt').textContent = `(${events.length})`; $('#list').innerHTML = events.map(eventCard).join('') || '<div class="empty"><b>No results</b>No events match.</div>'; hydrate($('#list')); };
  const load = async () => { const p = new URLSearchParams(Object.entries({ fest: f.id, q: st.q.trim(), category: st.cat }).filter(([, v]) => v)); const ev = await apiLatest('fest-events', '/events?' + p); if (ev) paint(ev); };
  const run = debounce(() => { st.q = $('#fq').value; load().catch((e) => toast(e.message, 'error')); }, 300);   // debounced search
  $('#fq').addEventListener('input', run);
  $('#cats').onclick = (e) => { const b = e.target.closest('.pill'); if (b) { st.cat = b.dataset.c; pills(); load(); } };
  view.addEventListener('pointermove', (e) => { const c = e.target.closest('.card'); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); } });
  pills(); paint(f.events);
  const timer = setInterval(() => { if (!document.hidden && !st.q && !st.cat) load().catch(() => {}); }, 20000);
  onCleanup(() => { clearInterval(timer); run.cancel(); });
}
