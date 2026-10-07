// Browser storage, always guarded: storage can be blocked (private mode) or hold garbage from an older version.
// Nothing sensitive is kept: the organizer key lives in sessionStorage only (cleared when the tab closes),
// and participants keep just their private registration links (capability tokens) + the event title for display.
const ORG_KEY = "ditc.organizerKey", MINE = "ditc.mine", TIMEOUT = "ditc.apiTimeoutMs";
const read = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const write = (s, k, v) => { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch { /* storage blocked: degrade silently */ } };

export const organizerKey = {
  get: () => read(sessionStorage, ORG_KEY) || "",
  set: (v) => write(sessionStorage, ORG_KEY, v),
  clear: () => write(sessionStorage, ORG_KEY, null),
};

// A registration token is URL-safe and opaque; anything else is rejected before it can reach the API or a URL.
const TOKEN = /^[\w-]{8,128}$/;
export const isToken = (t) => typeof t === "string" && TOKEN.test(t);
// Accepts a bare token or a pasted private link ("https://site/registration/<token>?new=1").
export function extractToken(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/registration\/([\w-]+)/);
  const t = m ? m[1] : s.split(/[?#]/)[0];
  return isToken(t) ? t : null;
}

export const savedRegistrations = {
  list() {
    try {
      const raw = JSON.parse(read(localStorage, MINE) || "[]");
      return Array.isArray(raw) ? raw.filter((m) => m && isToken(m.token)).map((m) => ({ token: m.token, title: String(m.title || "").slice(0, 120) })) : [];
    } catch { return []; }
  },
  add(token, title = "") {
    if (!isToken(token)) return;
    write(localStorage, MINE, JSON.stringify([{ token, title }, ...this.list().filter((m) => m.token !== token)].slice(0, 30)));
  },
  remove(token) { write(localStorage, MINE, JSON.stringify(this.list().filter((m) => m.token !== token))); },
};

// Dev/test override for the request timeout (milliseconds).
export const apiTimeoutMs = () => Number(read(localStorage, TIMEOUT)) || 15000;
