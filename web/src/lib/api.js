// The only place that talks to the network. Every failure becomes an ApiError {code, message, status, field, kind} so
// components never parse responses or see "Failed to fetch". `message` is always safe to show to a person.
import { organizerToken, apiTimeoutMs } from "./storage.js";

export class ApiError extends Error {
  constructor({ code, message, status = 0, field, kind = "http", data }) { super(message); this.name = "ApiError"; Object.assign(this, { code, status, field, kind, data }); }
  get isNetwork() { return this.kind === "network" || this.kind === "timeout"; }
}
const DEFAULT = {
  400: "Please check the details and try again.", 401: "Your organizer session has expired.", 403: "You don't have permission to do that.",
  404: "We couldn't find that.", 409: "That can't be done right now.", 413: "That request is too large.", 429: "Too many requests. Please wait a minute and try again.",
};
const fromResponse = (status, data) => {
  const body = data && typeof data === "object" ? data : {};
  return new ApiError({ status, data: body, code: body.error || `http_${status}`, field: body.field,
    message: body.message || DEFAULT[status] || "Something went wrong on our side. Please try again." });
};
export const AUTH_EXPIRED = "ditc:auth-expired";

// Low level: returns the Response, or throws ApiError for network failures / timeouts. A caller-supplied `signal`
// that aborts rethrows a plain AbortError (callers treat that as "superseded", never as an error to display).
async function send(path, { method = "GET", body, admin = false, signal, timeout } = {}) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout ?? apiTimeoutMs());
  const relay = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", relay); }
  try {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (admin) headers.authorization = `Bearer ${organizerToken.get()}`;
    return await fetch("/api" + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw timedOut
      ? new ApiError({ kind: "timeout", code: "timeout", message: "The server took too long to respond. Please try again." })
      : new ApiError({ kind: "network", code: "network_error", message: "Unable to connect to the server. Check your connection and try again." });
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}
async function request(path, opts = {}) {
  const res = await send(path, opts);
  const isJson = (res.headers.get("content-type") || "").includes("json");
  let data = null;
  try { data = isJson ? await res.json() : await res.text(); } catch { /* unreadable body: fall through with null */ }
  if (!res.ok) {
    const err = fromResponse(res.status, data);
    if (opts.admin && res.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED)); // a rejected or expired session token: back to the login page
    throw err;
  }
  return data;
}
const qs = (o = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, v); const s = p.toString(); return s ? "?" + s : ""; };
const J = (method, body) => ({ method, body });
const A = { admin: true };

export const api = {
  // Event assistant (public, read-only). `context` = { event } or { fest }: what a follow-up question refers to.
  assistant: (message, context, o) => request("/assistant", { ...o, ...J("POST", context ? { message, context } : { message }) }),
  assistantStarters: (o) => request("/assistant", o),
  clubs: (o) => request("/clubs", o),
  club: (id, o) => request(`/clubs/${id}`, o),
  fests: (params, o) => request("/fests" + qs(params), o),
  fest: (id, o) => request(`/fests/${id}`, o),
  events: (params, o) => request("/events" + qs(params), o),
  event: (id, o) => request(`/events/${id}`, o),
  register: (id, body) => request(`/events/${id}/register`, J("POST", body)),
  registration: (token, o) => request(`/registrations/${token}`, o),
  cancelRegistration: (token) => request(`/registrations/${token}/cancel`, J("POST", {})),
  volunteer: (body) => request("/volunteers", J("POST", body)),
  admin: {
    // Organizer key -> { token, token_type, expires_in }. Not an `admin` call: a wrong key must not fire AUTH_EXPIRED.
    login: (key) => request("/admin/login", J("POST", { key })),
    stats: (o) => request("/admin/stats", { ...A, ...o }),
    fests: (o) => request("/admin/fests", { ...A, ...o }),
    fest: (id, o) => request(`/admin/fests/${id}`, { ...A, ...o }),            // fest + its events (archived ones included)
    createFest: (b) => request("/admin/fests", { ...A, ...J("POST", b) }),
    updateFest: (id, b) => request(`/admin/fests/${id}`, { ...A, ...J("PATCH", b) }),
    archiveFest: (id) => request(`/admin/fests/${id}/archive`, { ...A, ...J("POST", {}) }),
    restoreFest: (id) => request(`/admin/fests/${id}/restore`, { ...A, ...J("POST", {}) }),
    deleteFest: (id) => request(`/admin/fests/${id}`, { ...A, ...J("DELETE") }),
    events: (params, o) => request("/admin/events" + qs(params), { ...A, ...o }),
    event: (id, o) => request(`/admin/events/${id}`, { ...A, ...o }),
    createEvent: (b) => request("/admin/events", { ...A, ...J("POST", b) }),
    updateEvent: (id, b) => request(`/admin/events/${id}`, { ...A, ...J("PATCH", b) }),
    archiveEvent: (id) => request(`/admin/events/${id}/archive`, { ...A, ...J("POST", {}) }),
    restoreEvent: (id) => request(`/admin/events/${id}/restore`, { ...A, ...J("POST", {}) }),
    deleteEvent: (id) => request(`/admin/events/${id}`, { ...A, ...J("DELETE") }),
    registrations: (params, o) => request("/admin/registrations" + qs(params), { ...A, ...o }),
    setStatus: (id, status) => request(`/admin/registrations/${id}`, { ...A, ...J("PATCH", { status }) }),
    checkInRegistration: (id) => request(`/admin/registrations/${id}/check-in`, { ...A, ...J("POST", {}) }),
    checkIn: (token, eventId) => request("/admin/checkin", { ...A, ...J("POST", { token, event_id: eventId || undefined }) }),
    volunteers: (o) => request("/admin/volunteers", { ...A, ...o }),
    // CSV arrives as a file: fetched with the Authorization header (a plain link can't send it), handed back as text + filename.
    async csv(eventId) {
      const res = await send(`/admin/events/${eventId}/export.csv`, A);
      if (!res.ok) { let d = null; try { d = await res.json(); } catch { /* not json */ } const e = fromResponse(res.status, d); if (res.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED)); throw e; }
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") || "");
      return { text: await res.text(), filename: name ? name[1] : `event-${eventId}-participants.csv` };
    },
  },
};
