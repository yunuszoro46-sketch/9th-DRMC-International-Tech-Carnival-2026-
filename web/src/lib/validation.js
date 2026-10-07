// Client-side validation is a UX convenience (instant feedback). The server re-validates everything and is authoritative;
// any server message for a field is shown in place of these.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, PHONE = /^\+?\d[\d\s-]{6,18}$/, NUMBER = /^-?\d+(\.\d+)?$/;
const LIMITS = { text: 200, textarea: 1000, select: 100, email: 254, tel: 20, number: 20 };

export function validateField(f, raw) {
  const v = String(raw ?? "").trim();
  if (!v) return f.required ? `${f.label} is required.` : "";
  if (v.length > (LIMITS[f.type] || 200)) return `${f.label} is too long.`;
  if (f.type === "email" && !EMAIL.test(v)) return "Enter a valid email address.";
  if (f.type === "tel" && !PHONE.test(v)) return "Enter a valid phone number, e.g. 01712-345678.";
  if (f.type === "number" && !NUMBER.test(v)) return "Enter a number.";
  if (f.type === "select" && !f.options.includes(v)) return "Choose one of the options.";
  return "";
}
export function validateIdentity({ name, email }) {
  const errors = {};
  if (!String(name || "").trim()) errors.name = "Enter your full name.";
  else if (name.trim().length > 120) errors.name = "That name is too long.";
  if (!EMAIL.test(String(email || "").trim())) errors.email = "Enter a valid email address.";
  return errors;
}
export function validateAll(schema, identity, answers) {
  const errors = validateIdentity(identity);
  for (const f of schema) { const m = validateField(f, answers[f.key]); if (m) errors[f.key] = m; }
  return errors;
}
