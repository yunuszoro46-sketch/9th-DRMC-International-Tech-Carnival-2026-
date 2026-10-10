// Minimal JSON Web Tokens (RFC 7519), HS256 only. Pure: only node:crypto, no HTTP/SQL, secret is injected.
// Deliberately narrow: the header must be exactly {alg:"HS256",typ:"JWT"}, so "alg":"none" and algorithm-confusion
// tricks are rejected before the signature is even looked at.
const crypto = require('crypto');
const { safeEqual } = require('./pass');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const HEADER = b64({ alg: 'HS256', typ: 'JWT' });
const sig = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');
const now = () => Math.floor(Date.now() / 1000);

// `ttl` in seconds. Standard claims (iat, exp, jti) are added; `claims` may add sub/iss/aud/role etc.
function signJwt(claims, secret, { ttl = 3600, at = now() } = {}) {
  const body = `${HEADER}.${b64({ ...claims, iat: at, exp: at + ttl, jti: crypto.randomBytes(9).toString('base64url') })}`;
  return `${body}.${sig(body, secret)}`;
}

// Returns the payload, or null for anything malformed, forged, expired or issued for someone else.
function verifyJwt(token, secret, { iss, aud, at = now(), leeway = 30 } = {}) {
  const parts = typeof token === 'string' && token.length < 4096 ? token.split('.') : [];
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  if (!safeEqual(parts[2], sig(`${parts[0]}.${parts[1]}`, secret))) return null;
  let p; try { p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p !== 'object' || !Number.isFinite(p.exp) || p.exp + leeway <= at) return null;
  if (Number.isFinite(p.nbf) && p.nbf - leeway > at) return null;
  if (Number.isFinite(p.iat) && p.iat - leeway > at) return null;       // minted "in the future": clock games
  if (iss !== undefined && p.iss !== iss) return null;
  if (aud !== undefined && p.aud !== aud) return null;
  return p;
}

// "Authorization: Bearer <token>" -> token, or null.
const bearer = (header) => { const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)\s*$/i.exec(String(header || '')); return m ? m[1] : null; };
module.exports = { signJwt, verifyJwt, bearer };
