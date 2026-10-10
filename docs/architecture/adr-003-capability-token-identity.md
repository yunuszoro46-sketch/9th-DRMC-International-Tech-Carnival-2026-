# ADR-003: Passwordless capability-token identity

- **Status:** Accepted
- **Date:** 2026-10-05

## Context
Participants are students who will use the app once or twice a semester. Asking them to create an account, verify an
email, and remember a password kills conversion and creates support load. We still need: (a) a participant can view or
cancel *their own* registration and show a pass at the gate, (b) nobody can forge a pass, (c) organizers are
authenticated.

## Decision
Identity is a **capability**: possessing an unguessable token is the authorization. There are no participant accounts.

1. **Manage token.** Registering returns `manage_token` (16 random bytes, base64url, `UNIQUE` in the DB). The browser
   stores it in `localStorage`; `GET /api/registrations/:token` and `POST .../cancel` act on whatever that token
   points to. The token is never listed or derivable from other data.
2. **Pass token.** The QR code encodes `"<registrationId>.<random>.<mac>"`, where `mac` is a truncated HMAC-SHA-256
   over the first two parts using `PASS_SECRET`. The mac is verified **in constant time before any database access**,
   so forged or mangled tokens are rejected cheaply with no DB write. Check-in is one atomic
   `UPDATE ... WHERE status='ISSUED'`, so a pass can be used exactly once even under concurrent scans.
3. **Lifecycle.** Pass state follows registration state: `CONFIRMED` issues (or reinstates) the pass; reject or cancel
   revokes it; a checked-in pass is never un-checked-in. A revoked or non-confirmed registration never exposes its
   pass token.
4. **Organizers.** A shared secret `ORGANIZER_KEY` is sent once to `POST /api/admin/login` (compared in constant time),
   which returns a short-lived HS256 JWT (`JWT_TTL_SEC`, default 8 h). Every other `/api/admin/*` call sends
   `Authorization: Bearer <token>`; the router checks signature, `exp`, `iss` and `aud` before any handler runs, and
   only the exact `{"alg":"HS256","typ":"JWT"}` header is accepted (no `alg: none`). The signing key is derived from
   `JWT_SECRET` and `ORGANIZER_KEY`, so rotating either signs every organizer out. The browser keeps the token, never
   the key, in `sessionStorage`. All admin routes and the login sit behind a rate limiter, with a stricter limiter on
   wrong keys and bad tokens to blunt brute force. In production the server refuses to boot if `ORGANIZER_KEY`,
   `PASS_SECRET` or `JWT_SECRET` are missing or still the demo values.

## Consequences
**Good**
- No passwords, no email infrastructure, no PII beyond name and email; registration takes under a minute.
- Pass verification does not need a database lookup to reject fakes.

**Costs we accept**
- **Lose the device or clear the browser storage, lose access** to the registration (the pass QR is the only other
  copy). The v2 answer is an emailed magic link that re-issues access; it needs an email provider, which ADR-001
  deliberately avoids for now.
- **Bearer semantics:** anyone holding the link or QR can use it. A screenshot of a pass can be used by whoever scans
  first; one-time check-in limits the damage to a single use.
- `PASS_SECRET` is critical. Rotating it invalidates every issued pass; leaking it lets an attacker mint valid-looking
  tokens (they still need a real registration id to check in against an existing pass row).
- One shared organizer key means no per-organizer audit trail. An individual JWT cannot be revoked before it expires
  (sign-out only drops it from the browser); rotating `JWT_SECRET` revokes all of them. Per-organizer accounts are future work.
- The MAC is truncated to 16 base64url characters (~96 bits), which is ample for forgery resistance at this scale.

## Revisit when
We add notifications (magic links become natural), multiple organizer roles, or a threat model that includes
screenshot-sharing of passes at high-value events.
