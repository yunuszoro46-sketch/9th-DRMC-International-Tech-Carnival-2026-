// Volunteer application: the field rules mirror server/domain/intake.js (parseVolunteer). The server is authoritative and
// re-validates everything; these checks only give instant feedback, and any server message for a field replaces them.
// DOMAINS is the same fixed list the backend accepts (there is no endpoint that lists it).
export const DOMAINS = ["Programming", "Graphics Design", "AI Development", "Video Editing", "Robotics"];
export const WHY_MIN = 20, WHY_MAX = 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, PHONE = /^\+?\d[\d\s-]{8,14}$/, DIGITS = /^\d+$/;
export const EMPTY = { name: "", cls: "", roll: "", phone: "", email: "", domain: "", why: "" };

export function validateVolunteer(v) {
  const e = {}, t = (k) => String(v[k] ?? "").trim();
  if (t("name").length < 3) e.name = t("name") ? "Enter your full name (at least 3 characters)." : "Enter your full name.";
  else if (t("name").length > 120) e.name = "That name is too long.";
  if (!t("cls")) e.cls = "Enter your class and section, e.g. 10 Science A."; else if (t("cls").length > 20) e.cls = "Keep this under 20 characters.";
  if (!t("roll")) e.roll = "Enter your roll number."; else if (!DIGITS.test(t("roll")) || t("roll").length > 8) e.roll = "Use digits only, up to 8.";
  if (!t("phone")) e.phone = "Enter a contact number."; else if (!PHONE.test(t("phone"))) e.phone = "Enter a valid number, e.g. 01712-345678.";
  if (!EMAIL.test(t("email")) || t("email").length > 254) e.email = "Enter a valid email address.";
  if (!DOMAINS.includes(v.domain)) e.domain = "Choose the area you're most interested in.";
  if (t("why").length < WHY_MIN) e.why = `Tell us a little more (at least ${WHY_MIN} characters).`; else if (t("why").length > WHY_MAX) e.why = `Keep this under ${WHY_MAX} characters.`;
  return e;
}
export const volunteerPayload = (v) => ({ name: v.name.trim(), cls: v.cls.trim(), roll: v.roll.trim(), phone: v.phone.trim(), email: v.email.trim(), domain: v.domain, why: v.why.trim() });
