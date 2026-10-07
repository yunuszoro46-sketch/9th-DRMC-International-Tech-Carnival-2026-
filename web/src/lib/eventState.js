import { formatDateTime } from "./dates.js";
// Why registration is unavailable, keyed by the backend's registration_state. Wording only: no date maths happens in the browser.
export const whyClosed = (e) => ({
  full: "All seats have been taken.",
  closed: e.deadline ? `Registration closed on ${formatDateTime(e.deadline)}.` : "Registration has closed.",
  ended: "This event has already started.",
  archived: "This event is no longer available.",
})[e.registration_state];
