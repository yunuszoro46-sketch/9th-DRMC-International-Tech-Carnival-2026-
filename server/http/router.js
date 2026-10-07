// Matches routes, applies rate limits + organizer auth, parses JSON bodies, serialises responses.
// Contains NO business rules and NO SQL.
const { safeEqual } = require('../domain/pass');
const { createRateLimiter, clientIp } = require('./rate-limit');

const KIND_STATUS = { validation: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, payload: 413, rate_limited: 429 };
// Fallback machine-readable codes for errors raised outside the domain (HTTP-level problems).
const STATUS_CODE = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'payload_too_large', 429: 'rate_limited' };
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin', 'permissions-policy': 'camera=(self), microphone=(), geolocation=()' };

// `limit` names the rate-limit bucket for a public route; without it public POSTs share the `write` bucket.
const route = (method, pattern, handler, { admin = false, limit = null } = {}) => ({ method, pattern, handler, admin, limit });
const json = (data, status = 200) => ({ status, type: 'application/json', body: JSON.stringify(data) });
const csvFile = ({ csv, filename }) => ({ status: 200, type: 'text/csv; charset=utf-8', body: csv, headers: { 'content-disposition': `attachment; filename="${filename}"` } });
const paging = (url, def, max) => [Math.min(max, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || def)), Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0)];

function createRouter({ routes, config, serveStatic }) {
  const limiters = {
    write: createRateLimiter({ max: () => config.rateLimitPerMin }),           // public POSTs
    admin: createRateLimiter({ max: () => config.adminRateLimitPerMin }),      // every /api/admin/* call
    authFail: createRateLimiter({ max: () => config.authFailLimitPerMin }),    // wrong-key guesses (brute force)
    assistant: createRateLimiter({ max: () => config.assistantRateLimitPerMin }), // assistant questions: never eat into the registration allowance
  };
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 1e5) throw Object.assign(new Error('Request body is too large.'), { status: 413, code: 'payload_too_large' }); chunks.push(c); }
    const raw = Buffer.concat(chunks).toString('utf8'); let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Request body is not valid JSON.'), { status: 400, code: 'invalid_json' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Request body must be a JSON object.'), { status: 400, code: 'invalid_body' });
    return body;
  }
  return async function handle(req, res) {
    const headers = { ...SECURITY_HEADERS }; if (config.production) headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
    const send = (out) => { res.writeHead(out.status, { 'content-type': out.type, ...headers, ...out.headers }); res.end(out.body); };
    const err = (status, code, message, extra, h) => send({ ...json({ error: code, message, ...extra }, status), headers: h });
    try {
      let url; try { url = new URL(req.url, 'http://x'); } catch { return err(400, 'bad_request', 'That address is not valid.'); }   // "//" and friends are a bad request, not a server error
      const ip = clientIp(req, config.trustProxy);
      for (const r of routes) {
        const m = req.method === r.method && url.pathname.match(r.pattern);
        if (!m) continue;
        if (r.admin) {
          if (limiters.admin.hit(ip) || limiters.authFail.blocked(ip)) return err(429, 'rate_limited', 'Too many requests. Try again in a minute.', null, { 'retry-after': String(limiters.admin.retryAfter(ip)) });
          if (!safeEqual(req.headers['x-organizer-key'], config.organizerKey)) { limiters.authFail.hit(ip); return err(401, 'unauthorized', 'Organizer key required.'); }
        } else {
          const bucket = limiters[r.limit || (r.method === 'POST' ? 'write' : '')];
          if (bucket && bucket.hit(ip)) return err(429, 'rate_limited', 'Too many requests. Try again in a minute.', null, { 'retry-after': String(bucket.retryAfter(ip)) });
        }
        const body = r.method === 'GET' ? {} : await readBody(req);
        const out = await r.handler({ m, url, body });
        return send(out && out.type ? out : json(out));
      }
      if (url.pathname.startsWith('/api/')) return err(404, 'not_found', 'Not found.');
      return send(await serveStatic(url.pathname));
    } catch (e) {
      const status = e.status || KIND_STATUS[e.kind];
      if (!status) console.error(e);
      if (status) err(status, e.code || STATUS_CODE[status] || 'error', e.message, e.extra);
      else err(500, 'internal_error', 'Something went wrong on our side. Please try again.');
    }
  };
}
module.exports = { createRouter, route, json, csvFile, paging };
