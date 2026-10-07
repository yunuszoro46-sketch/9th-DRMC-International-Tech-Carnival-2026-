// PREVIEW ONLY. Stands in for node:crypto inside preview.html so server/domain/pass.js can run in a browser.
// NOT cryptographic: preview passes are not secure and never leave the page.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function hash(str, seed) {                      // cyrb53-style mixing, repeated to get enough characters
  let out = '';
  for (let r = 0; out.length < 24; r++) {
    let h1 = 0xdeadbeef ^ (seed + r), h2 = 0x41c6ce57 ^ (seed + r);
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    for (const n of [h1 >>> 0, h2 >>> 0]) for (let k = 0; k < 5; k++) out += B64[(n >>> (k * 6)) & 63];
  }
  return out;
}
const digestOf = (parts, seed) => ({ update(s) { parts.push(String(s)); return this; }, digest() { return hash(parts.join('\u0000'), seed); } });
module.exports = {
  randomBytes: (n) => ({ toString() { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); let s = ''; for (const b of a) s += B64[b & 63] + B64[(b >> 2) & 63]; return s.slice(0, Math.ceil(n * 4 / 3)); } }),
  createHmac: (alg, secret) => digestOf([String(secret)], 7),
  createHash: () => digestOf([], 3),
  timingSafeEqual: (a, b) => a === b,
};
