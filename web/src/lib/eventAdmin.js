// Organizer-side helpers for fests and events. The request shapes are exactly what server/domain/intake.js parses
// (parseFest, parseEvent, parseSchema); the limits below mirror it so obvious mistakes are caught before sending.
// The server validates everything again and its message wins.
//   Fest:  { club_id, name, description, starts_on, ends_on, venue }                      dates are YYYY-MM-DD
//   Event: { fest_id, title, category, description, rules, venue, starts_at, deadline, capacity, auto_confirm, form_schema }
//   form_schema: up to 10 of { key, label, type, required, options? }   type: text | textarea | select | email | tel | number
// The backend has no end time, no "registration opens" time and no draft state, so none is offered.
import { fromLocalInput, toLocalInput } from "./dates.js";

export const MAX_FIELDS = 10, MAX_OPTIONS = 20;
export const KEY = /^[a-z][a-z0-9_]{0,23}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v) => String(v ?? "").trim();
let uid = 0;
export const newUid = () => `q${++uid}`;

// ---- fests --------------------------------------------------------------------------------------------------------
export const emptyFest = (clubId = "") => ({ club_id: clubId ? String(clubId) : "", name: "", description: "", starts_on: "", ends_on: "", venue: "" });
export const festToForm = (f) => ({ club_id: String(f.club_id ?? ""), name: f.name || "", description: f.description || "", starts_on: f.starts_on || "", ends_on: f.ends_on || "", venue: f.venue || "" });
export const festPayload = (v) => ({ club_id: Number(v.club_id), name: t(v.name), description: t(v.description), starts_on: v.starts_on, ends_on: v.ends_on, venue: t(v.venue) });
export const FEST_FIELDS = ["club_id", "name", "description", "starts_on", "ends_on", "venue"];
export function validateFest(v) {
  const e = {};
  if (!v.club_id) e.club_id = "Choose the club that runs this fest.";
  if (t(v.name).length < 3) e.name = t(v.name) ? "Use at least 3 characters." : "Enter the fest's name."; else if (t(v.name).length > 120) e.name = "Keep the name under 120 characters.";
  if (t(v.description).length > 500) e.description = "Keep the description under 500 characters.";
  if (!DATE.test(v.starts_on)) e.starts_on = "Choose the first day.";
  if (!DATE.test(v.ends_on)) e.ends_on = "Choose the last day."; else if (DATE.test(v.starts_on) && v.ends_on < v.starts_on) e.ends_on = "The last day can't be before the first day.";
  if (!t(v.venue)) e.venue = "Enter where it takes place."; else if (t(v.venue).length > 120) e.venue = "Keep the venue under 120 characters.";
  return e;
}

// ---- events -------------------------------------------------------------------------------------------------------
export const emptyEvent = (festId = "") => ({ fest_id: festId ? String(festId) : "", title: "", category: "", description: "", rules: "", venue: "", starts_at: "", deadline: "", capacity: "", auto_confirm: true, form_schema: [] });
export const eventToForm = (e) => ({ fest_id: String(e.fest_id), title: e.title || "", category: e.category || "", description: e.description || "", rules: e.rules || "", venue: e.venue || "",
  starts_at: toLocalInput(e.starts_at), deadline: toLocalInput(e.deadline), capacity: String(e.capacity), auto_confirm: !!e.auto_confirm,
  form_schema: (e.form_schema || []).map((f) => ({ uid: newUid(), key: f.key, label: f.label, type: f.type, required: !!f.required, options: (f.options || []).join("\n"), saved: true })) });
export const optionList = (text) => String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
export const schemaPayload = (fields) => fields.map((f) => ({ key: f.key, label: t(f.label), type: f.type, required: !!f.required, ...(f.type === "select" ? { options: optionList(f.options) } : {}) }));
export const eventPayload = (v) => ({ fest_id: Number(v.fest_id), title: t(v.title), category: t(v.category), description: t(v.description), rules: t(v.rules), venue: t(v.venue),
  starts_at: fromLocalInput(v.starts_at), deadline: fromLocalInput(v.deadline), capacity: Number(v.capacity), auto_confirm: !!v.auto_confirm, form_schema: schemaPayload(v.form_schema) });
export const EVENT_FIELDS = ["fest_id", "title", "category", "description", "rules", "venue", "starts_at", "deadline", "capacity", "form_schema"];

// "Team name" -> team_name, unique among the keys already used. Answers are stored under this key.
export function keyFromLabel(label, used = []) {
  let base = t(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 20) || "field";
  let key = base, n = 2;
  while (used.includes(key)) key = `${base.slice(0, 20)}_${n++}`;
  return key;
}
export const newField = (used) => ({ uid: newUid(), key: keyFromLabel("question", used), label: "", type: "text", required: false, options: "", saved: false, autoKey: true });

// Returns { perField: { uid: { label?, key?, options? } }, summary: "" }.
export function validateSchema(fields) {
  const perField = {}, seen = new Set(); let summary = "";
  if (fields.length > MAX_FIELDS) summary = `A form can have at most ${MAX_FIELDS} questions.`;
  for (const f of fields) {
    const e = {};
    if (!t(f.label)) e.label = "Enter the question."; else if (t(f.label).length > 60) e.label = "Keep the question under 60 characters.";
    if (!KEY.test(f.key)) e.key = "Use a lowercase letter first, then letters, digits or _ (24 at most)."; else if (seen.has(f.key)) e.key = "Another question already uses this key.";
    seen.add(f.key);
    if (f.type === "select") {
      const o = optionList(f.options);
      if (!o.length) e.options = "Add at least one option, one per line."; else if (o.length > MAX_OPTIONS) e.options = `Use at most ${MAX_OPTIONS} options.`; else if (o.some((x) => x.length > 40)) e.options = "Keep each option under 40 characters.";
    }
    if (Object.keys(e).length) perField[f.uid] = e;
  }
  if (!summary && Object.keys(perField).length) summary = "Some questions need attention.";
  return { perField, summary };
}
export function validateEvent(v) {
  const e = {};
  if (!v.fest_id) e.fest_id = "Choose the fest this event belongs to.";
  if (t(v.title).length < 3) e.title = t(v.title) ? "Use at least 3 characters." : "Enter the event's title."; else if (t(v.title).length > 120) e.title = "Keep the title under 120 characters.";
  if (t(v.category).length > 40) e.category = "Keep the category under 40 characters.";
  if (t(v.description).length > 1000) e.description = "Keep the description under 1000 characters.";
  if (t(v.rules).length > 2000) e.rules = "Keep the rules under 2000 characters.";
  if (!t(v.venue)) e.venue = "Enter where it takes place."; else if (t(v.venue).length > 120) e.venue = "Keep the venue under 120 characters.";
  const start = v.starts_at ? new Date(fromLocalInput(v.starts_at)).getTime() : NaN, dead = v.deadline ? new Date(fromLocalInput(v.deadline)).getTime() : NaN;
  if (Number.isNaN(start)) e.starts_at = "Choose the start date and time.";
  if (Number.isNaN(dead)) e.deadline = "Choose when registration closes."; else if (!Number.isNaN(start) && dead > start) e.deadline = "Registration must close at or before the start.";
  const cap = Number(v.capacity);
  if (t(v.capacity) === "" || !Number.isInteger(cap) || cap < 1 || cap > 10000) e.capacity = "Enter a whole number from 1 to 10000.";
  const s = validateSchema(v.form_schema);
  if (s.summary) e.form_schema = s.summary;
  return { errors: e, schema: s.perField };
}
