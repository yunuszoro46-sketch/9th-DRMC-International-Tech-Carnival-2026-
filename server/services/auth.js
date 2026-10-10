// Organizer sessions. The organizer key is only ever sent once, to log in; every other organizer call carries a
// short-lived JWT ("Authorization: Bearer <token>").
// The signing key is derived from BOTH JWT_SECRET and ORGANIZER_KEY, so rotating either one signs everybody out.
const crypto = require('crypto');
const { safeEqual } = require('../domain/pass');
const { signJwt, verifyJwt } = require('../domain/jwt');
const { fail } = require('../domain/errors');

const ISS = 'smart-club-ops', AUD = 'organizer';

function createAuthService(config) {
  const key = () => crypto.createHmac('sha256', config.jwtSecret).update(`organizer:${config.organizerKey}`).digest();
  return {
    login(organizerKey) {
      if (typeof organizerKey !== 'string' || !organizerKey || !safeEqual(organizerKey, config.organizerKey)) throw fail('unauthorized', 'invalid_credentials', "That organizer key wasn't accepted.");
      const ttl = config.jwtTtlSec;
      return { token: signJwt({ iss: ISS, aud: AUD, sub: 'organizer', role: 'organizer' }, key(), { ttl }), token_type: 'Bearer', expires_in: ttl };
    },
    // Payload of a valid organizer token, or null.
    verify: (token) => { const p = token && verifyJwt(token, key(), { iss: ISS, aud: AUD }); return p && p.role === 'organizer' ? p : null; },
  };
}
module.exports = { createAuthService };
