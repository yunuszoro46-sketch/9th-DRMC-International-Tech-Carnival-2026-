// Pure registration rules: validation, event state, the status machine, pass lifecycle.
// No HTTP, no SQL, no clock access (callers pass `now`).
const { fail, invalid } = require('./errors');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d[\d\s-]{6,18}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

// ---- time: everything is an absolute instant ------------------------------------------------
// Strings WITH an offset/Z are honoured. Naive strings ("2026-11-20T10:00", SQLite "YYYY-MM-DD HH:MM:SS")
// are interpreted as UTC, never as server-local time, so behaviour is identical on every host.
const NAIVE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
function parseInstant(v) {
  if (v == null || v === '') return null;
  let s = String(v).trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2');
  if (NAIVE.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
const toIso = (v) => { const d = parseInstant(v); return d ? d.toISOString() : null; };
const isPast = (v, now) => { const d = parseInstant(v); return !!d && d.getTime() < now.getTime(); };

// ---- registration status machine ------------------------------------------------------------
// CHECKED_IN is reached only through the gate (check-in), never through the organizer PATCH endpoint.
const STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'CHECKED_IN'];
const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['REJECTED', 'CANCELLED', 'CHECKED_IN'],
  REJECTED: ['CONFIRMED'],          // organizer changed their mind; needs a free seat
  CANCELLED: [],
  CHECKED_IN: [],
};
const ORGANIZER_TARGETS = ['CONFIRMED', 'REJECTED', 'CANCELLED'];
const word = (s) => s.toLowerCase().replace('_', '-');

function assertOrganizerTarget(status) {
  if (!ORGANIZER_TARGETS.includes(status)) throw invalid(`status must be one of ${ORGANIZER_TARGETS.join(', ')}`, 'status');
}
function assertTransition(current, next) {
  if ((TRANSITIONS[current] || []).includes(next)) return;
  const msg = current === next ? `This registration is already ${word(current)}.` : `A ${word(current)} registration can't be changed to ${word(next)}.`;
  throw fail('conflict', 'invalid_transition', msg, { from: current, to: next });
}
const assertSeatFree = (ev) => { if (ev.taken >= ev.capacity) throw fail('conflict', 'event_full', 'This event is full.'); };

// ---- events ---------------------------------------------------------------------------------
// `row` = event + `taken` (PENDING + CONFIRMED + CHECKED_IN seats; REJECTED/CANCELLED free the seat).
// registration_state is the single source the UI uses to pick its call to action.
function registrationState(row, now) {
  if (row.archived_at || row.fest_archived_at) return 'archived';
  if (isPast(row.starts_at, now)) return 'ended';
  if (isPast(row.deadline, now)) return 'closed';
  if (row.taken >= row.capacity) return 'full';
  return 'open';
}
function shapeEvent(row, now = new Date()) {
  if (!row) return null;
  const state = registrationState(row, now);
  return { ...row, starts_at: toIso(row.starts_at), deadline: toIso(row.deadline), rules: row.rules || '', auto_confirm: !!row.auto_confirm,
    form_schema: typeof row.form_schema === 'string' ? JSON.parse(row.form_schema) : row.form_schema,
    remaining: Math.max(0, row.capacity - row.taken), full: row.taken >= row.capacity, deadline_passed: isPast(row.deadline, now),
    ended: isPast(row.starts_at, now), archived: state === 'archived', registration_state: state, closed: state !== 'open' };
}
const CLOSED = { ended: ['event_ended', 'This event has already started.'], closed: ['registration_closed', 'Registration has closed.'],
  full: ['event_full', 'This event is full.'], archived: ['event_not_found', 'Event not found'] };
function assertOpen(ev) {
  const c = CLOSED[ev.registration_state];
  if (c) throw fail(ev.registration_state === 'archived' ? 'not_found' : 'conflict', c[0], c[1]);
}
const initialStatus = (ev) => (ev.auto_confirm ? 'CONFIRMED' : 'PENDING');

// Fest status is judged in club-local time (Dhaka, UTC+6) so "live" matches what people see on campus.
const CLUB_UTC_OFFSET_HOURS = 6;
function festStatus(f, now) {
  const today = new Date(now.getTime() + CLUB_UTC_OFFSET_HOURS * 36e5).toISOString().slice(0, 10);
  return f.ends_on && f.ends_on < today ? 'past' : f.starts_on && f.starts_on > today ? 'upcoming' : 'live';
}
const shapeFest = (row, now = new Date()) => row && { ...row, archived: !!row.archived_at, status: festStatus(row, now) };

// ---- input ----------------------------------------------------------------------------------
function parseIdentity(body) {
  const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase();
  if (!name) throw invalid('Name is required', 'name');
  if (name.length > 120) throw invalid('Name is too long', 'name');
  if (!EMAIL.test(email) || email.length > 254) throw invalid('Valid email is required', 'email');
  return { name, email };
}
const LIMITS = { text: 200, textarea: 1000, select: 100, email: 254, tel: 20, number: 20 };
function checkAnswer(f, v) {
  const bad = (m) => invalid(m, f.key);
  if (v.length > (LIMITS[f.type] || 200)) throw bad(`"${f.label}" is too long`);
  if (f.type === 'select' && !f.options.includes(v)) throw bad(`Invalid option for "${f.label}"`);
  if (f.type === 'email' && !EMAIL.test(v)) throw bad(`"${f.label}" must be a valid email`);
  if (f.type === 'tel' && !PHONE.test(v)) throw bad(`"${f.label}" must be a valid phone number`);
  if (f.type === 'number' && !NUMBER.test(v)) throw bad(`"${f.label}" must be a number`);
}
function parseAnswers(schema, raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, answers = {};
  for (const f of schema) {
    const v = String(src[f.key] ?? '').trim();
    if (f.required && !v) throw invalid(`"${f.label}" is required`, f.key);
    if (v) { checkAnswer(f, v); answers[f.key] = v; }
  }
  return answers;
}

// ---- pass lifecycle ---------------------------------------------------------------------------
// CONFIRMED -> issue (or reinstate a revoked pass); REJECTED/CANCELLED -> revoke. A checked-in pass is never touched.
function passActionFor(status, pass) {
  if (status === 'CONFIRMED') return !pass ? 'issue' : pass.status === 'REVOKED' ? 'reinstate' : 'none';
  return pass && pass.status === 'ISSUED' ? 'revoke' : 'none';
}
// The QR token is only shown while it can still be used at the gate.
const visiblePassToken = (reg) => (reg.status !== 'CONFIRMED' || reg.pass_status !== 'ISSUED' ? null : reg.pass_token);
function checkInOutcome(changed, info) {
  if (!info) throw fail('not_found', 'pass_not_found', 'Pass not found');
  if (changed) return { ok: true, result: 'CHECKED_IN', ...info };
  if (info.status === 'CHECKED_IN') throw fail('conflict', 'already_checked_in', 'Already checked in', { pass: info });
  throw fail('forbidden', 'pass_revoked', 'This pass is no longer valid', { pass: info });
}
module.exports = { EMAIL, STATUSES, TRANSITIONS, parseInstant, toIso, isPast, shapeEvent, shapeFest, festStatus, registrationState, assertOpen,
  initialStatus, parseIdentity, parseAnswers, assertOrganizerTarget, assertTransition, assertSeatFree, passActionFor, visiblePassToken, checkInOutcome };
