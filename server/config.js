// Environment -> validated config. Nothing here runs at import time, so tests can set env first.
const PLACEHOLDERS = new Set(['demo-organizer-key', 'change-me-please', 'dev-secret']);

// TRUST_PROXY: "0"/"false"/"no"/"off"/"" -> false; "true"/"yes"/"on" -> 1 hop; "2" -> 2 hops; unknown -> false (fail closed).
function parseTrustProxy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s) > 0 ? Number(s) : false;
  return ['true', 'yes', 'on'].includes(s) ? 1 : false;
}

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production) {
    const missing = ['ORGANIZER_KEY', 'PASS_SECRET'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Refusing to start in production: ${missing.join(' and ')} must be set`);
    const weak = ['ORGANIZER_KEY', 'PASS_SECRET'].filter((k) => PLACEHOLDERS.has(env[k]));
    if (weak.length) throw new Error(`Refusing to start in production: ${weak.join(" and ")} must not use a demo placeholder value`);
  }
  const num = (k, d) => () => +env[k] || d; // read live so limits can be tuned (and tested) at runtime
  return {
    production,
    port: +env.PORT || 3000,
    dbFile: env.DB_FILE || undefined,
    organizerKey: env.ORGANIZER_KEY || 'demo-organizer-key',
    passSecret: env.PASS_SECRET || 'dev-secret',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    get rateLimitPerMin() { return num('RATE_LIMIT_PER_MIN', 30)(); },
    get adminRateLimitPerMin() { return num('ADMIN_RATE_LIMIT_PER_MIN', 120)(); },
    get authFailLimitPerMin() { return num('AUTH_FAIL_LIMIT_PER_MIN', 10)(); },
    get assistantRateLimitPerMin() { return num('ASSISTANT_RATE_LIMIT_PER_MIN', 20)(); },
    // Optional AI helper for the assistant. Server-side only; off unless both a key and a model are set.
    ai: { apiKey: env.AI_API_KEY || '', model: env.AI_MODEL || '', baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1', timeoutMs: +env.AI_TIMEOUT_MS || 8000 },
  };
}
module.exports = { loadConfig, parseTrustProxy };
