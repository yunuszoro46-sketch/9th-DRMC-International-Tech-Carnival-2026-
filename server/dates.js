// Date helpers for seeds and tests: wall times relative to `now` in club-local time (Dhaka, UTC+6).
// day(n) -> "YYYY-MM-DD" n days from today; at(n, "HH:MM") -> ISO-8601 with the +06:00 offset.
const DAY = 864e5, OFFSET_HOURS = 6;
function makeDates(now = new Date()) {
  const day = (n) => new Date(now.getTime() + OFFSET_HOURS * 36e5 + n * DAY).toISOString().slice(0, 10);
  const at = (n, hm) => `${day(n)}T${hm}+06:00`;
  return { day, at };
}
module.exports = { makeDates };
