// Labels and tones only; none of this decides business rules. `tone` maps to a badge colour class and each badge also
// carries text + an icon, so status is never conveyed by colour alone.
export const REG_STATUS = {
  PENDING: { label: "Pending", tone: "warn", icon: "clock", note: "Waiting for organizer approval." },
  CONFIRMED: { label: "Confirmed", tone: "ok", icon: "check", note: "You're in. Show your pass at the entrance." },
  REJECTED: { label: "Rejected", tone: "bad", icon: "x", note: "The organizers did not approve this registration." },
  CANCELLED: { label: "Cancelled", tone: "muted", icon: "x", note: "This registration was cancelled." },
  CHECKED_IN: { label: "Checked in", tone: "info", icon: "check", note: "You have been checked in at the event." },
};
export const EVENT_STATE = {
  open: { label: "Open", tone: "ok", icon: "check", cta: "Register Now" },
  full: { label: "Full", tone: "warn", icon: "users", cta: "Registration Full" },
  closed: { label: "Closed", tone: "bad", icon: "clock", cta: "Registration Closed" },
  ended: { label: "Ended", tone: "muted", icon: "calendar", cta: "Event Ended" },
  archived: { label: "Archived", tone: "muted", icon: "list", cta: "Event Archived" },
};
export const FEST_STATUS = { live: { label: "Live now", tone: "ok" }, upcoming: { label: "Upcoming", tone: "info" }, past: { label: "Past", tone: "muted" } };
export const FIELD_TYPES = [
  { value: "text", label: "Short text" }, { value: "textarea", label: "Long text" }, { value: "email", label: "Email" },
  { value: "tel", label: "Phone number" }, { value: "number", label: "Number" }, { value: "select", label: "Choice (dropdown)" },
];
export const stateInfo = (s) => EVENT_STATE[s] || { label: String(s || "Unknown"), tone: "muted", cta: "Unavailable" };
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
