// API client: JSON fetch with typed errors, abort-on-supersede for search/filter calls, debounce, and toasts.
export function debounce(fn, ms = 300) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d;
}

export function toast(message, type = 'info', ms = 4200) {
  const host = document.getElementById('toasts'); if (!host) return;
  while (host.children.length >= 4) host.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast glass ${type}`; el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = ({ success: '✓ ', error: '✕ ', warn: '! ' }[type] || '') + message;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  el.onclick = close; host.append(el); setTimeout(close, ms);
}

// Organizer session JWT (from POST /api/admin/login). The organizer key itself is never stored.
export const orgToken = { get: () => sessionStorage.getItem('orgToken') || '', set: (t) => sessionStorage.setItem('orgToken', t), clear: () => sessionStorage.removeItem('orgToken') };

export async function api(path, { method = 'GET', body, admin = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin) headers.authorization = `Bearer ${orgToken.get()}`;
  let r;
  try { r = await fetch('/api' + path, { method, headers, signal, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw Object.assign(new Error('Network problem. Check your connection and try again.'), { network: true }); }
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw Object.assign(new Error((data && (data.message || data.error)) || 'Request failed'), { status: r.status, data });
  return data;
}

// Latest-wins: starting a request with the same key aborts the previous one, so slow responses can never
// overwrite newer results. Returns undefined when superseded.
const inflight = new Map();
export async function apiLatest(key, path, opt = {}) {
  inflight.get(key)?.abort(); const ac = new AbortController(); inflight.set(key, ac);
  try { return await api(path, { ...opt, signal: ac.signal }); }
  catch (e) { if (e.name === 'AbortError') return undefined; throw e; }
  finally { if (inflight.get(key) === ac) inflight.delete(key); }
}

export async function downloadCsv(path, filename) {
  const r = await fetch('/api' + path, { headers: { authorization: `Bearer ${orgToken.get()}` } });
  if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).message || 'Export failed'), { status: r.status });
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
