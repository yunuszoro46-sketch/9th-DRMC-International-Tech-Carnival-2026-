# HANDOFF: pick up here

> **Out of date.** This file predates Phase 2 and the React frontend. Read `AI_HANDOFF.md` (current state) and `PHASE3_STATUS.md` (phase log) instead. Kept for history.

## Run it
```bash
npm run seed        # seeds only if the DB is empty
npm start           # http://localhost:3000
npm test            # 23 integration tests + unit/persistence tests
./tools/qr_check.sh                     # needs python3 + opencv-python; decodes JS-made QR codes
```
Node >= 22.5, no `npm install`. Demo organizer key: `demo-organizer-key` (set `ORGANIZER_KEY`, `PASS_SECRET` in production).

## State
Plan Tasks 1-10 done except deployment. Pre-deploy fixes done (non-destructive seed, required prod secrets, admin rate limiting, UTC deadlines, TRUST_PROXY parsing, debounced UI); code split into layers; UI rebuilt (glassmorphism/Bento); ADRs in `docs/architecture/`. Verified: 23 API tests, headless-browser run at 375px (register -> QR renders -> QR decodes to the real token -> organizer sees the row, HTML in names stays escaped). Review triage: `docs/CODE_REVIEW_TRIAGE.md`.

## Next, in order
1. **Deploy** (Dockerfile ready; seeding no longer wipes data). Needs a persistent disk at `/data`, `ORGANIZER_KEY`, `PASS_SECRET` (server refuses to start in production without them), `TRUST_PROXY=1`. Run ONE instance. Consider not seeding demo events in a real deployment. Then fill README "Deployment URL".
2. **Admin create/edit for fests and events** (API + UI). Today events only come from seed/SQL. This is the biggest functional gap. Layering is in place (`domain/` -> `repository/` -> `services/` -> `http/routes`): add event CRUD as a new service method + admin route.
3. **iOS scanning**: `BarcodeDetector` is missing on iOS Safari. Needs a vendored `jsQR` (no network here, so not done). Manual token entry works meanwhile.
4. Dry-run with 3 real people on phones; fix what breaks.
5. Review README "AI tools" section so it states your real usage.

## Known rough edges
- Rate limiter is in-memory and per instance.
- Participant identity = token stored in the browser's localStorage; clearing it loses access (email magic link is the v2 answer).
- Tokens > 106 bytes would exceed the QR encoder (current ones are ~35).
- Seed dates are fixed (Nov 2026 - Feb 2027); deadlines pass over time, so re-date the seed for demos after those dates.


## Club hierarchy (latest)
- Data: `clubs > fests > events`; catalogue in `server/seed-data.js` (16 DRMC clubs; non-IT clubs have sample fests/events to replace). `server/fixtures.js` is the test-only dataset the 23 integration tests use.
- UI routes: `#/` directory, `#/fest/:id`, `#/event/:id`, `#/confirmed/:token`, `#/mine`, `#/organizer`.
- `node tools/build-preview.js out.html` rebuilds the single-file preview from `seed-data.js` and the current UI.
