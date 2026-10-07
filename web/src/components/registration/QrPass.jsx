import { useMemo } from "react";
import { matrix } from "../../lib/qr.js";
// Draws the module matrix produced by lib/qr.js (the project's one QR encoder) as an SVG. Dark on white with a 4-module
// quiet zone so it scans from a phone screen. The pass code is printed beneath for manual entry at the gate.
export default function QrPass({ token, label = "Pass QR code" }) {
  const art = useMemo(() => {
    try {
      const m = matrix(token), n = m.length + 8; let d = "";
      m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4},${y + 4}h1v1h-1z`; }));
      return { n, d };
    } catch { return null; }
  }, [token]);
  return (
    <figure className="qr">
      {art
        ? <svg className="qr-svg" viewBox={`0 0 ${art.n} ${art.n}`} shapeRendering="crispEdges" role="img" aria-label={label}><rect width={art.n} height={art.n} fill="#fff" /><path d={art.d} fill="#021b1a" /></svg>
        : <p className="alert alert-warn" role="alert">The QR code could not be drawn. Show the pass code below at the entrance.</p>}
      <figcaption><span className="muted small">Pass code</span><code className="qr-code">{token}</code></figcaption>
    </figure>
  );
}
