// Organizer-side registration helpers. Nothing here decides a rule: the server validates every action and its refusal
// is shown as-is. ACTIONS only says which buttons are worth offering for a status, mirroring TRANSITIONS in
// server/domain/registration.js (the API does not return "allowed actions" per registration).
//   PATCH /api/admin/registrations/:id {status}   -> CONFIRMED | REJECTED | CANCELLED
//   POST  /api/admin/registrations/:id/check-in   -> CHECKED_IN (needs an issued pass)
export const PAGE_SIZE = 25;   // the API's own default page size for GET /api/admin/registrations
export const STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "REJECTED", "CANCELLED"];

export const ACTIONS = {
  approve: { label: "Approve", icon: "check", variant: "primary", from: ["PENDING"], to: "CONFIRMED", done: "Registration approved. The participant's pass is now active." },
  reapprove: { label: "Approve after all", icon: "check", variant: "secondary", from: ["REJECTED"], to: "CONFIRMED", done: "Registration approved. The participant's pass is now active." },
  checkin: { label: "Check in", icon: "scan", variant: "secondary", from: ["CONFIRMED"], done: "Participant checked in.",
    confirm: { title: "Check this participant in?", yes: "Yes, check in", busy: "Checking in…",
      body: "This marks the participant as present and uses up their pass. A check-in can't be undone." } },
  reject: { label: "Reject", icon: "x", variant: "danger", from: ["PENDING", "CONFIRMED"], to: "REJECTED", done: "Registration rejected.",
    confirm: { title: "Reject this registration?", yes: "Yes, reject", busy: "Rejecting…",
      body: "The seat is released and any pass stops working. The record stays as rejected, so this email can't register for the event again; you can still approve it later if a seat is free." } },
  cancel: { label: "Cancel registration", icon: "trash", variant: "danger", from: ["PENDING", "CONFIRMED"], to: "CANCELLED", done: "Registration cancelled.",
    confirm: { title: "Cancel this registration?", yes: "Yes, cancel it", busy: "Cancelling…",
      body: "The seat is released and any pass stops working. A cancelled registration can't be restored; the participant would have to register again." } },
};
export const actionsFor = (status) => Object.keys(ACTIONS).filter((k) => ACTIONS[k].from.includes(status));

// What a status means from the organizer's side (the participant-facing wording lives in lib/format.js).
export const ORGANIZER_NOTE = {
  PENDING: "Waiting for your decision. Holds a seat meanwhile.", CONFIRMED: "Holds a seat and a valid pass.", CHECKED_IN: "Attended. The pass has been used.",
  REJECTED: "Not approved. The seat was released.", CANCELLED: "Cancelled. The seat was released.",
};
// passes.status as returned in `pass_status` (null when no pass was ever issued).
export const PASS_STATUS = { ISSUED: "Issued, valid for entry", REVOKED: "Revoked", CHECKED_IN: "Used at check-in" };
export const passLabel = (s) => PASS_STATUS[s] || (s ? String(s) : "No pass issued");

const humanize = (k) => String(k).replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
// Answers are dynamic per event: rows follow the event's form_schema order and labels; anything the schema no longer
// lists is appended under a readable form of its key, so nothing a participant submitted is hidden.
export function answerRows(schema, answers) {
  const a = answers && typeof answers === "object" ? answers : {}, fields = Array.isArray(schema) ? schema : [];
  const rows = fields.filter((f) => a[f.key] !== undefined && a[f.key] !== "").map((f) => ({ key: f.key, label: f.label, value: String(a[f.key]) }));
  for (const k of Object.keys(a)) if (!fields.some((f) => f.key === k) && a[k] !== "" && a[k] != null) rows.push({ key: k, label: humanize(k), value: String(a[k]) });
  return rows;
}
export const percent = (taken, capacity) => (capacity > 0 ? Math.max(0, Math.min(100, Math.round((taken / capacity) * 100))) : 0);
