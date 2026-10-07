// Pass signing + verification. Pure: only node:crypto, no HTTP/SQL, secret is injected.
const crypto = require('crypto');
const rand = (n = 16) => crypto.randomBytes(n).toString('base64url');
const mac = (s, secret) => crypto.createHmac('sha256', secret).update(String(s)).digest('base64url').slice(0, 16);
const digest = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
// Constant-time compare; hashing first makes lengths equal so length never leaks.
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

// Pass token = "<registrationId>.<random>.<mac>" - tamper-evident, verified before any DB write.
function signPass(regId, secret) { const body = `${regId}.${rand(8)}`; return `${body}.${mac(body, secret)}`; }
function verifyPass(token, secret) {
  const parts = String(token || '').split('.');
  return parts.length === 3 && safeEqual(parts[2], mac(`${parts[0]}.${parts[1]}`, secret));
}
module.exports = { rand, signPass, verifyPass, safeEqual };
