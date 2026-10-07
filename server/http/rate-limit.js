// Fixed-window in-memory limiter (per instance). `max` may be a number or a function (read live).
function createRateLimiter({ max, windowMs = 60000, maxKeys = 5000 }) {
  const hits = new Map(), limit = () => (typeof max === 'function' ? max() : max);
  const entry = (key, now) => {
    let h = hits.get(key);
    if (!h || h.reset <= now) {
      h = { n: 0, reset: now + windowMs }; hits.set(key, h);
      if (hits.size > maxKeys) { for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); if (hits.size > maxKeys) hits.clear(); }
    }
    return h;
  };
  return {
    hit: (key, now = Date.now()) => ++entry(key, now).n > limit(),                    // count this request; true = over the limit
    blocked: (key, now = Date.now()) => { const h = hits.get(key); return !!h && h.reset > now && h.n >= limit(); },
    retryAfter: (key, now = Date.now()) => Math.max(1, Math.ceil(((hits.get(key) || { reset: now }).reset - now) / 1000)),
  };
}
// Client IP. trustProxy = false | number of trusted proxy hops; we read X-Forwarded-For from the RIGHT
// (the entry our own proxy appended), because anything left of it is client-controlled.
function clientIp(req, trustProxy) {
  if (trustProxy) {
    const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - trustProxy];
    if (ip) return ip;
  }
  return req.socket.remoteAddress || 'unknown';
}
module.exports = { createRateLimiter, clientIp };
