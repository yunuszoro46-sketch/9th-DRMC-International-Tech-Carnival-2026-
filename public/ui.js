// Shared DOM helpers: escaping, formatting, animated counters/meters (CSP-safe), modals, local registration store.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const P={cal:'<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',pin:'<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'};
export const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'TBA');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Count-up animation from the element's previous value (so live updates tick instead of restarting at 0).
export function countTo(el, n) {
  const from = Number(el._n ?? 0); el._n = n; cancelAnimationFrame(el._raf);
  if (reduce || from === n) { el.textContent = n.toLocaleString(); return; }
  const t0 = performance.now(), tick = (t) => {
    const k = Math.min(1, (t - t0) / 700), e = 1 - (1 - k) ** 3;
    el.textContent = Math.round(from + (n - from) * e).toLocaleString(); if (k < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}
// Animated meters: <i data-meter="63" data-key="ev5">. Width is driven through --pct via CSSOM (allowed under CSP,
// unlike style="" attributes). A data-key remembers the last value so re-renders animate from it, not from 0.
const seen = new Map();
export function hydrate(root = document) {
  $$('[data-meter]', root).forEach((el) => {
    const to = Math.max(0, Math.min(100, +el.dataset.meter || 0)), key = el.dataset.key;
    el.style.setProperty('--pct', (key && seen.has(key) ? seen.get(key) : 0) + '%'); if (key) seen.set(key, to);
    requestAnimationFrame(() => requestAnimationFrame(() => el.style.setProperty('--pct', to + '%')));
  });
}
export const pctOf = (taken, cap) => (cap ? Math.min(100, Math.round((taken / cap) * 100)) : 0);
export const tone = (pct, closed) => (closed ? 'bad' : pct >= 80 ? 'warn' : 'ok');

// ---- modals ----
const dlg = document.getElementById('dlg'), conf = document.getElementById('confirm');
dlg.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c || e.target === dlg) { dlg.close(); if (c && c.dataset.go) location.hash = c.dataset.go; }
});
export function openModal(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); hydrate(dlg); return dlg; }
export const closeModal = () => dlg.open && dlg.close();
export function confirmDialog(message, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    conf.innerHTML = `<div class="modal small"><h2>${esc(message)}</h2><div class="actions"><button class="btn ghost" value="no" autofocus>Keep it</button><button class="btn danger" value="yes">${esc(okLabel)}</button></div></div>`;
    conf.returnValue = 'no';
    conf.onclick = (e) => { const b = e.target.closest('button'); if (b) conf.close(b.value); else if (e.target === conf) conf.close('no'); };
    conf.onclose = () => resolve(conf.returnValue === 'yes');
    conf.showModal();
  });
}

// ---- registrations remembered on this device (capability tokens) ----
export const store = {
  get() { try { return JSON.parse(localStorage.getItem('myRegs') || '[]'); } catch { return []; } },
  set(list) { try { localStorage.setItem('myRegs', JSON.stringify(list)); } catch { /* storage unavailable */ } },
  add(token, title) { const l = store.get(); if (!l.some((x) => x.token === token)) store.set([...l, { token, title }]); },
  remove(token) { store.set(store.get().filter((x) => x.token !== token)); },
};

// ---- shared presentation helpers ----
export const ICON = { Coding: '💻', AI: '🤖', Robotics: '🦾', Gaming: '🎮', Quiz: '🧠', Hackathon: '🚀', Workshop: '🛠️', Science: '🔬', Photography: '📷', Service: '🤝', Sports: '⚽', Training: '🏕️', Math: '➗', Art: '🎨', Music: '🎵', Debate: '🎤', Language: '📚', Culture: '🕌', Business: '📈' };
export const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`)).join('<i aria-hidden="true">›</i>')}</nav>`;
export const dateRange = (a, b) => { const f = (d) => new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); return a && b && a !== b ? `${f(a)} – ${f(b)}` : a ? f(a) : 'Dates TBA'; };
export const evLabel = (e) => (e.deadline_passed ? 'Closed' : e.full ? 'Full' : `${e.remaining} of ${e.capacity} left`);
export function eventCard(e) {
  const pct = pctOf(e.taken, e.capacity), t = tone(pct, e.closed);
  return `<a class="card glass${e.closed ? ' is-closed' : ''}" href="#/event/${e.id}" aria-label="${esc(e.title)}, ${esc(evLabel(e))}">
    <div class="card-top"><span class="chip">${esc(e.category)}</span><span class="badge ${e.closed ? 'bad' : t}">${esc(evLabel(e))}</span></div>
    <h3>${esc(e.title)}</h3><div class="mute small">${esc(e.club_name || '')} · ${esc(e.fest_name)}</div><p class="desc clamp">${esc(e.description)}</p>
    <div class="meta"><span>${ic('cal')}${fmt(e.starts_at)}</span><span>${ic('pin')}${esc(e.venue)}</span></div>
    <div class="meter" role="progressbar" aria-label="Seats taken" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i class="${t}" data-meter="${pct}" data-key="ev${e.id}"></i></div>
    <div class="meter-foot"><span>${e.taken}/${e.capacity} seats</span><span class="go">${e.closed ? 'View details' : 'Register'}</span></div></a>`;
}
