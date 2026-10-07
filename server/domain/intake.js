// Pure input rules for organizer-created fests/events and volunteer applications. No HTTP, no SQL.
const { fail, invalid } = require('./errors');
const { EMAIL, toIso } = require('./registration');

const DOMAINS = ['Programming', 'Graphics Design', 'AI Development', 'Video Editing', 'Robotics'];
const FIELD_TYPES = ['text', 'textarea', 'select', 'email', 'tel', 'number'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, label, min, max, field) => {
  const s = String(v ?? '').trim();
  if (s.length < min) throw invalid(min ? `${label} is required` : `${label} is invalid`, field);
  if (s.length > max) throw invalid(`${label} is too long`, field);
  return s;
};
const int = (v, label, min, max, field) => {
  const n = Number(v);
  if (v === '' || v == null || !Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number from ${min} to ${max}`, field);
  return n;
};
const date = (v, label, field) => {
  const s = String(v ?? '').trim();
  if (!DATE.test(s) || Number.isNaN(new Date(s + 'T00:00:00Z').getTime())) throw invalid(`${label} must be a date (YYYY-MM-DD)`, field);
  return s;
};
const bool = (v) => v === true || v === 1 || v === 'true' || v === '1';
// A PATCH is "current values + the fields that were sent", validated by the same parser as a create.
const merge = (current, patch, keys) => Object.fromEntries(keys.map((k) => [k, k in patch ? patch[k] : current[k]]));

const FEST_KEYS = ['club_id', 'name', 'description', 'starts_on', 'ends_on', 'venue'];
function parseFest(b) {
  const f = { club_id: int(b.club_id, 'Club', 1, 1e9, 'club_id'), name: text(b.name, 'Fest name', 3, 120, 'name'), description: text(b.description, 'Description', 0, 500, 'description'),
    starts_on: date(b.starts_on, 'Start date', 'starts_on'), ends_on: date(b.ends_on, 'End date', 'ends_on'), venue: text(b.venue, 'Venue', 1, 120, 'venue') };
  if (f.ends_on < f.starts_on) throw invalid('End date must not be before the start date', 'ends_on');
  return f;
}
const parseFestPatch = (patch, current) => parseFest(merge(current, patch, FEST_KEYS));

function parseSchema(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 10) throw invalid('form_schema must be a list of at most 10 fields', 'form_schema');
  const seen = new Set();
  return raw.map((f) => {
    const key = String(f && f.key || '');
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(key) || seen.has(key)) throw invalid(`Invalid or duplicate field key "${key}"`, 'form_schema');
    seen.add(key);
    if (!FIELD_TYPES.includes(f.type)) throw invalid(`Field "${key}" must be one of: ${FIELD_TYPES.join(', ')}`, 'form_schema');
    const out = { key, label: text(f.label, 'Field label', 1, 60, 'form_schema'), type: f.type, required: bool(f.required) };
    if (f.type === 'select') {
      if (!Array.isArray(f.options) || !f.options.length || f.options.length > 20) throw invalid(`Field "${key}" needs 1-20 options`, 'form_schema');
      out.options = f.options.map((o) => text(o, 'Option', 1, 40, 'form_schema'));
    }
    return out;
  });
}

const EVENT_KEYS = ['fest_id', 'title', 'category', 'description', 'rules', 'venue', 'starts_at', 'deadline', 'capacity', 'auto_confirm', 'form_schema'];
function parseEvent(b) {
  const e = { fest_id: int(b.fest_id, 'Fest', 1, 1e9, 'fest_id'), title: text(b.title, 'Title', 3, 120, 'title'), category: text(b.category || 'General', 'Category', 1, 40, 'category'),
    description: text(b.description, 'Description', 0, 1000, 'description'), rules: text(b.rules, 'Rules', 0, 2000, 'rules'), venue: text(b.venue, 'Venue', 1, 120, 'venue'),
    starts_at: toIso(b.starts_at), deadline: toIso(b.deadline), capacity: int(b.capacity, 'Capacity', 1, 10000, 'capacity'),
    auto_confirm: bool(b.auto_confirm), form_schema: parseSchema(b.form_schema) };
  if (!e.starts_at) throw invalid('Start time is required', 'starts_at');
  if (!e.deadline) throw invalid('Registration deadline is required', 'deadline');
  if (e.deadline > e.starts_at) throw invalid('The deadline must not be after the event starts', 'deadline');
  return e;
}
const parseEventPatch = (patch, current) => parseEvent(merge(current, patch, EVENT_KEYS));

// Once people have registered their answers are keyed by the current fields, so the form may only grow:
// nothing removed or retyped, no option dropped, no old field made stricter, new fields optional.
function assertSchemaCompatible(oldSchema, newSchema) {
  const locked = (m) => fail('conflict', 'form_locked', `${m} because people have already registered.`, { field: 'form_schema' });
  const byKey = new Map(newSchema.map((f) => [f.key, f]));
  for (const o of oldSchema) {
    const n = byKey.get(o.key);
    if (!n) throw locked(`"${o.label}" can't be removed`);
    if (n.type !== o.type) throw locked(`"${o.label}" can't change type`);
    if (n.required && !o.required) throw locked(`"${o.label}" can't become required`);
    if (o.type === 'select' && o.options.some((x) => !n.options.includes(x))) throw locked(`Options of "${o.label}" can't be removed`);
  }
  const added = newSchema.find((n) => n.required && !oldSchema.some((o) => o.key === n.key));
  if (added) throw locked(`New field "${added.label}" must be optional`);
}

function parseVolunteer(b) {
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw invalid('Valid email is required', 'email');
  const phone = text(b.phone, 'Contact number', 1, 20, 'phone');
  if (!/^\+?\d[\d\s-]{8,14}$/.test(phone)) throw invalid('Contact number is invalid', 'phone');
  const roll = text(b.roll, 'Roll number', 1, 8, 'roll');
  if (!/^\d+$/.test(roll)) throw invalid('Roll number must be digits only', 'roll');
  const domain = String(b.domain ?? '');
  if (!DOMAINS.includes(domain)) throw invalid('Pick one of the listed domains', 'domain');
  return { name: text(b.name, 'Name', 3, 120, 'name'), cls: text(b.cls, 'Class / section', 1, 20, 'cls'), roll, phone, email, domain, why: text(b.why, 'Your statement', 20, 1000, 'why') };
}
module.exports = { DOMAINS, FIELD_TYPES, parseFest, parseFestPatch, parseEvent, parseEventPatch, parseSchema, assertSchemaCompatible, parseVolunteer };
