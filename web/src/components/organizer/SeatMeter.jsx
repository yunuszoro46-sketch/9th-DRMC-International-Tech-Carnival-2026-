import { percent } from "../../lib/registrationAdmin.js";
// Seats taken out of capacity, as text plus a bar. The bar is an SVG so its length is an attribute, not an inline style
// (the server's CSP forbids inline styles).
export default function SeatMeter({ taken, capacity, compact = false }) {
  const pct = percent(taken, capacity), full = capacity > 0 && taken >= capacity;
  return (
    <div className={`meter${compact ? " meter-compact" : ""}${full ? " meter-full" : ""}`}>
      <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect className="meter-track" width="100" height="4" /><rect className="meter-fill" width={pct} height="4" /></svg>
      <span className="meter-text">{taken} of {capacity} seats taken{full ? " (full)" : ""}</span>
    </div>
  );
}
