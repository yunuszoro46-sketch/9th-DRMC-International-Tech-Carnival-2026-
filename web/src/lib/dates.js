// Display formatting only. The backend decides every date-based rule (open / closed / ended); this file never does.
// The club operates in Asia/Dhaka (UTC+6, no daylight saving), so times are shown and entered in that zone.
const TZ = "Asia/Dhaka", OFFSET = "+06:00", OFFSET_MS = 6 * 36e5;
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const dayShort = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const valid = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };

export const formatDate = (iso) => { const d = iso && valid(iso); return d ? dateFmt.format(d) : ""; };
export const formatTime = (iso) => { const d = iso && valid(iso); return d ? timeFmt.format(d) : ""; };
export const formatDateTime = (iso) => (valid(iso) ? `${formatDate(iso)} · ${formatTime(iso)}` : "");
export const formatShort = (iso) => { const d = iso && valid(iso); return d ? `${shortFmt.format(d)} · ${formatTime(iso)}` : ""; };
// Fest dates are plain calendar days ("2026-11-20"): format them as UTC so no time zone can shift the day.
export function formatRange(from, to) {
  if (!from) return "";
  const a = new Date(from + "T00:00:00Z"), b = new Date((to || from) + "T00:00:00Z");
  if (Number.isNaN(a.getTime())) return "";
  if (!to || to === from || Number.isNaN(b.getTime())) return dayFmt.format(a);
  return `${dayShort.format(a)} – ${dayFmt.format(b)}`;
}
export function timeAgo(iso, now = Date.now()) {
  const d = iso && valid(iso); if (!d) return "";
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return formatDateTime(iso);
}
// <input type="datetime-local"> works in wall-clock text; convert to/from the club zone explicitly.
export const toLocalInput = (iso) => { const d = iso && valid(iso); return d ? new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 16) : ""; };
export const fromLocalInput = (local) => (local ? `${local}:00${OFFSET}` : "");
// SQLite timestamps ("2026-10-05 12:30:00", UTC, no zone marker) -> ISO. Browsers would read them as local time otherwise.
export const fromSqlite = (s) => (/^\d{4}-\d{2}-\d{2} \d/.test(String(s || "")) ? String(s).replace(" ", "T") + "Z" : s);
