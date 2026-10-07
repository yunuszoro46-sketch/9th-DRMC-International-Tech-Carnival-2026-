// QR encoder copied from public/qr.js (MIT, zero dependencies), exposed as an ES module for the React app.
const holder = {};
// Minimal QR Code encoder: byte mode, ECC level M, versions 1-6 (up to 106 bytes). MIT, zero dependencies.
// Enough for pass tokens (~35 chars). Verified by tools/qr_check.sh (decoded with OpenCV).
(function (root) {
  const ECC = [10, 16, 26, 18, 24, 16], BLOCKS = [1, 1, 2, 2, 2, 4], TOTAL = [26, 44, 70, 100, 134, 172];
  const exp = [], log = [];
  for (let i = 0, x = 1; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  const mul = (a, b) => (a && b ? exp[(log[a] + log[b]) % 255] : 0);
  function rsRemainder(data, n) {
    let g = [1];
    for (let i = 0; i < n; i++) { const nx = new Array(g.length + 1).fill(0); g.forEach((c, j) => { nx[j] ^= c; nx[j + 1] ^= mul(c, exp[i]); }); g = nx; }
    const div = g.slice(1), res = new Array(n).fill(0);
    for (const b of data) { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => { res[i] ^= mul(c, f); }); }
    return res;
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

  function matrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 0;
    while (v < 6 && bytes.length + 2 > TOTAL[v] - ECC[v] * BLOCKS[v]) v++;
    if (v === 6) throw new Error('QR: text too long');
    const size = 21 + 4 * v, nb = BLOCKS[v], total = TOTAL[v], ecl = ECC[v], cap = total - ecl * nb;
    const bits = [], push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, 8); bytes.forEach((b) => push(b, 8)); push(0, Math.min(4, cap * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
    // split into blocks, add ECC, interleave
    const shortLen = Math.floor(total / nb), numShort = nb - (total % nb), blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) { const len = shortLen - ecl + (i < numShort ? 0 : 1), d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, ecl) }); }
    const out = [];
    for (let i = 0; i <= shortLen - ecl; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecl; i++) blocks.forEach((b) => out.push(b.e[i]));
    // function patterns
    const grid = () => Array.from({ length: size }, () => new Array(size).fill(false));
    const m = grid(), fn = grid();
    const set = (x, y, d) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = d; fn[y][x] = true; } };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } });
    if (v > 0) { const c = size - 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const format = (put, mask) => {           // ECC M indicator = 0
      const d = mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits15 = ((d << 10) | rem) ^ 0x5412, bit = (i) => ((bits15 >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) put(8, i, bit(i)); put(8, 7, bit(6)); put(8, 8, bit(7)); put(7, 8, bit(8));
      for (let i = 9; i < 15; i++) put(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) put(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) put(8, size - 15 + i, bit(i));
      put(8, size - 8, true);
    };
    format(set, 0);                           // reserve format areas
    // zig-zag data placement
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && i < out.length * 8) { m[y][x] = ((out[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    const penalty = (g) => {
      let p = 0, dark = 0;
      for (let a = 0; a < size; a++) for (const row of [true, false]) { let run = 1; for (let b = 1; b < size; b++) { const cur = row ? g[a][b] : g[b][a], prev = row ? g[a][b - 1] : g[b - 1][a]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = g[y][x]; if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3; }
      g.forEach((r) => r.forEach((c) => { if (c) dark++; }));
      return p + Math.floor(Math.abs(dark * 20 / (size * size) - 10)) * 10;
    };
    let best = null, bestP = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const g = m.map((r) => r.slice());
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) g[y][x] = !g[y][x];
      format((x, y, d) => { g[y][x] = d; }, mask);
      const p = penalty(g); if (p < bestP) { bestP = p; best = g; }
    }
    return best;
  }
  function svg(text) {
    const m = matrix(text), n = m.length + 8; let d = '';
    m.forEach((r, y) => r.forEach((c, x) => { if (c) d += `M${x + 4},${y + 4}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="Pass QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}"/></svg>`;
  }
  const api = { matrix, svg };
  root.api = api;
})(holder);
export const matrix = holder.api.matrix;

