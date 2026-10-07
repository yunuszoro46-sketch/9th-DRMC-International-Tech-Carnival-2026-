// Pure helpers for the dynamic registration form. The schema comes from the event (`form_schema`); nothing here knows any event.
import { validateField, validateIdentity } from "./validation.js";

export const emptyAnswers = (schema) => Object.fromEntries(schema.map((f) => [f.key, ""]));

export function validateRegistration(schema, identity, answers) {
  const fields = {};
  for (const f of schema) { const m = validateField(f, answers[f.key]); if (m) fields[f.key] = m; }
  return { identity: validateIdentity(identity), answers: fields };
}
export const hasErrors = (e) => Object.keys(e.identity).length + Object.keys(e.answers).length > 0;

// Only answered fields are sent, trimmed (the server drops blanks too).
export function cleanAnswers(schema, answers) {
  const out = {};
  for (const f of schema) { const v = String(answers[f.key] ?? "").trim(); if (v) out[f.key] = v; }
  return out;
}

const CLOSED = new Set(["event_full", "registration_closed", "event_ended"]);
// Turns an ApiError from POST /events/:id/register into one of: closed | duplicate | field | general.
export function interpretRegisterError(err, schema) {
  if (CLOSED.has(err.code)) return { kind: "closed", message: err.message };
  if (err.code === "duplicate_registration") return { kind: "duplicate", message: err.message };
  if (err.code === "event_not_found" || err.status === 404) return { kind: "gone", message: "This event is no longer available." };
  if (err.status === 400 && err.field) {
    // The server's field is "name"/"email" for the identity box, or an answer key. If a custom field reuses one of those
    // keys the server's message quotes that field's label, which tells the two apart.
    const custom = schema.find((f) => f.key === err.field);
    const quoted = custom && err.message.includes(`"${custom.label}"`);
    if (custom && (quoted || !["name", "email"].includes(err.field))) return { kind: "field", scope: "answers", key: err.field, message: err.message };
    if (err.field === "name" || err.field === "email") return { kind: "field", scope: "identity", key: err.field, message: err.message };
  }
  return { kind: "general", message: err.message };
}
