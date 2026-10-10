// PREVIEW ONLY. Loaded before the app inside preview.html. It gives the unmodified React app what a server would:
//   - /api/* requests are answered in the page by tools/preview/backend.js (the real service code on in-memory data)
//   - the address bar is emulated: the app's path lives in the URL hash (#/events/3), so one file can show every page,
//     Back/Forward work, and a link to a page can be shared
//   - sessionStorage / localStorage are in memory (a sandboxed viewer may forbid the real ones)
const { createPreviewBackend } = require('./backend');
const handle = createPreviewBackend();
const realLocation = window.location, realHistory = window.history, realFetch = window.fetch.bind(window);

// ---- address ----
const hier = /^(https?|file):$/.test(realLocation.protocol);
const origin = hier ? realLocation.href.split('#')[0] + '#' : 'https://preview.invalid';
const parse = (to) => { const u = new URL(to || '/', 'https://preview.invalid'); return { pathname: u.pathname, search: u.search, hash: '' }; };
const fromHash = () => parse((realLocation.hash || '').replace(/^#/, '') || '/');
const loc = { ...fromHash(), origin, get href() { return origin + this.pathname + this.search; }, reload: () => realLocation.reload() };
const apply = (to, replace) => {
  Object.assign(loc, parse(to)); const target = '#' + loc.pathname + loc.search;
  try { if (replace) realHistory.replaceState(null, '', target); else if (realLocation.hash !== target) realLocation.hash = target; } catch { /* viewer forbids it: navigation still works, Back does not */ }
};
window.__pvLoc = loc;
window.__pvHist = { pushState: (s, t, url) => apply(url, false), replaceState: (s, t, url) => apply(url, true), back: () => realHistory.back(), forward: () => realHistory.forward(), get length() { return realHistory.length; } };
window.addEventListener('hashchange', () => { const next = fromHash(); if (next.pathname !== loc.pathname || next.search !== loc.search) { Object.assign(loc, next); window.dispatchEvent(new PopStateEvent('popstate')); } });

// ---- storage ----
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear() }; };
window.__pvSession = memory(); window.__pvLocal = memory();

// ---- network ----
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith('/api/')) return realFetch(input, init);
  await new Promise((ok) => setTimeout(ok, 120));                                    // a little latency, so loading states are visible
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const headers = new Headers(init.headers || {}); let body = {};
  try { body = init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
  const out = handle((init.method || 'GET').toUpperCase(), url, body, headers.get('authorization'));   // route patterns include the /api prefix
  return new Response(out.body, { status: out.status, headers: { 'content-type': out.type, ...(out.headers || {}) } });
};
