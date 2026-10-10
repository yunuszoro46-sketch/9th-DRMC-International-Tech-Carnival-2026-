// Browser storage, always guarded: storage can be blocked (private mode) or hold garbage from an older version.
// Nothing long-lived is kept: the organizer's session token (a JWT, never the organizer key itself) lives in
// sessionStorage only (cleared when the tab closes),
// and participants keep just their private registration links (capability tokens) + the event title for display.
const ORG_TOKEN = "ditc.organizerToken", MINE = "ditc.mine", TIMEOUT = "ditc.apiTimeoutMs";
const read = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const write = (s, k, v) => { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch { /* storage blocked: degrade silently */ } };

// Seconds-since-epoch expiry of a JWT, read without verifying it (only the server can do that). 0 = unreadable.
const jwtExp = (t) => { try { return Number(JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp) || 0; } catch { return 0; } };

// An expired or unreadable token reads as "signed out", so the organizer area sends people to log in straight away
// instead of after the first failed request. The server still checks every token on every call.
export const organizerToken = {
  get() {
    const t = read(sessionStorage, ORG_TOKEN) || "";
    if (t && jwtExp(t) * 1000 <= Date.now()) { write(sessionStorage, ORG_TOKEN, null); return ""; }
    return t;
  },
  set: (v) => write(sessionStorage, ORG_TOKEN, v),
  clear: () => write(sessionStorage, ORG_TOKEN, null),
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
