# AI handoff: Smart Club Operations Platform (DRMC IT Club)

Read this first, then `PHASE3_STATUS.md` (the phase-by-phase log with test evidence). `HANDOFF.md` is an older note kept for history.

> Merged on 7 Oct 2026 from two sources: the project owner's original handoff (deadline, priorities, working rules, innovation plan) and the technical handoff written at the end of Phase 3C. If this file and the code disagree, the code and the backend API win.

## Deadline and priorities

**Hard deadline: 8 October 2026. Submission / presentation: 9 October 2026.**

Priority order: 1. working core functionality, 2. registration flow, 3. organizer operations, 4. QR check-in, 5. reliability / QA, 6. visual polish, 7. innovation features, 8. documentation. Do not trade core functionality for extra architecture or polish.

## Where the project stands

| Phase | Scope | State |
|---|---|---|
| 1, 2 | Backend: clubs > fests > events > registrations > passes, organizer API, tests | Complete |
| 3A | React foundation: router, API client, UI kit, layouts, organizer sign-in | Complete |
| 3B | Public experience: events, registration, QR pass, my registrations, volunteer, gallery | Complete |
| 3C | Organizer dashboard, registration management | Complete |
| 3D | QR scanner / check-in screen | **Not built. Optional, not a blocker** (project owner's decision). `/organizer/check-in` is a placeholder |
| 3E | Event & fest management: create, edit, archive, restore, delete; registration form builder | Complete |
| 3E.5 | Persistence | **Verified. No migration was needed:** the backend already used persistent SQLite (see "Data storage") |
| extras | Gallery slideshow with real photographs | Done (see "Latest work") |
| 3F | Event assistant ("Tech Guide"): public, read-only, answers from the live event data | **Complete** (see "Event assistant") |
| 3G | UI/UX polish: design tokens, club-first branding, responsive and accessibility pass | **Complete** (see "Design system and branding") |
| 3H | Quick release check | **Complete: ready with limitations** (top of `PHASE3_STATUS.md`). All suites green; one small CSS fix; production build still blocked in the sandbox |
| 3I | Production build / deployment | **Next. Not started.** Start with `npm run web:install && npm run web:build` on a machine with npm access |
| 3J | Submission | Package prepared on 8 Oct 2026 (`Smart-Club-Operations-Platform-Final-Submission.zip`: source, docs, 23 current screenshots; no `club.db`, no build output). README "Deployment URL" is still to be filled in after 3I |

**Never verified anywhere so far:** the production `vite build` and the Orbitron heading font. Both sandboxes used could not reach the npm registry. All browser testing used `tools/web-standin-build.mjs` (esbuild bundle of the same source, fonts stubbed). First thing to do on a normal machine: `npm run web:install && npm run web:build`, then open the site.

## Run it

```bash
npm run seed            # demo data, only if the database is empty
npm start               # http://localhost:3000  (serves web/dist if built, else the classic UI in public/)
npm test                # backend: 97 tests, 34 of them for the assistant (in-memory and temp databases; never touches club.db)
node tools/persistence-check.mjs   # restart + crash persistence on a temporary SQLite file
npm run web:install && npm run web:build     # React build -> web/dist (restart the server afterwards)
npm run web:dev         # Vite dev server on :5173, proxies /api to :3000
```

Node >= 22.13 (the built-in SQLite driver needs it). The backend has zero npm dependencies. Demo organizer key: `demo-organizer-key`, exchanged at `POST /api/admin/login` for a JWT sent as `Authorization: Bearer <token>`. In production `ORGANIZER_KEY`, `PASS_SECRET` and `JWT_SECRET` are mandatory.

The server picks `web/dist` or `public/` **once at startup**: restart it after the first build.

## Data storage (read this before touching the data layer)

**The server is NOT in-memory.** It has stored everything in a SQLite file since Phase 1/2:

- `server/db.js` opens `DB_FILE` (default `./club.db`; `/data/club.db` in Docker) with Node's built-in `node:sqlite`. No npm driver; do not add `better-sqlite3` or `sqlite3`.
- Schema changes are an ordered `MIGRATIONS` array in `db.js`, each run once (tracked by `PRAGMA user_version`). To change the schema, append a migration; never edit an old one.
- Startup never wipes or seeds. `npm run seed` seeds only an empty database; `npm run seed:reset` wipes and reseeds (refused in production).
- Tests use `open(':memory:')` or temporary folders and never touch `club.db`. There is no `db.reset()`.
- `node tools/persistence-check.mjs` proves restart and crash persistence end to end (9 checks, no dependencies).
- **`club.db` is the live data. Never include it in a delivery zip and never overwrite the owner's copy.** An empty `club.db` in a zip is what makes the site look like it "lost everything".
- The only in-memory storage is `preview.html` (the clickable demo built by `tools/build-preview.mjs`).

The full schema is tabulated under "Phase 3E.5" in `PHASE3_STATUS.md`.

## Architecture

**Backend** (`server/`): `domain` (pure rules) -> `repository` (SQL only) -> `services/club.js` (transactions, orchestration) -> `http/routes` (public.js, admin.js) -> `http/router.js` (auth, rate limits, JSON, security headers). `ai/intent-client.js` is the optional outbound call for the assistant (off unless configured). SQLite via `node:sqlite`. Errors are `{ error, message, field? }` with 400/401/403/404/409/413/429.

**Frontend** (`web/src/`): React 19, Vite, plain CSS. No router, icon or CSS library.

| Piece | File | Rule |
|---|---|---|
| Router | `router.jsx` | History API. `useSearchParams` for URL state, `Link`, `Navigate`, `usePageTitle` |
| API client | `lib/api.js` | The only place that calls `fetch`. Throws `ApiError {code, message, status, field, kind}`. A 401 on an organizer call fires `AUTH_EXPIRED` |
| Data loading | `hooks/useApi.js` | Abort on change (no stale overwrite), `reload()` keeps data on screen |
| States | `components/common/States.jsx` | `Async` turns a `useApi` result into loading / error + retry / empty / content |
| Layouts | `layouts/` | `PublicLayout`; `OrganizerLayout` (guard, sidebar >= 1024px, drawer below, expiry redirect) |
| Design tokens | `styles/tokens.css` | The only place a solid colour, radius, shadow or timing is defined. Reference: `docs/design-system.md` |
| Brand | `components/brand/Brand.jsx` | `Brand`, `ClubLogo`, `Institution`. Club mark is primary; the college crest only in the footer |

### Rules that are easy to break

- **The backend is the source of truth.** Pages show `registration_state`, `status`, `remaining`, `can_cancel` as returned and never recompute them. Read the route, service and repository before using an endpoint.
- **Strict CSP: `style-src 'self'`.** No `style=""` attributes and no inline `<style>`. Variable sizes are done with SVG attributes (see `components/organizer/SeatMeter.jsx`) or classes.
- **Never mutate locally.** After a change, re-read from the server (`reload()`).
- Filters, page numbers and the open record live in the URL.
- Client-side validation and action tables are convenience copies of backend rules (`lib/validation.js`, `lib/volunteer.js`, `lib/registrationAdmin.js`). If the backend rule changes, update the copy.
- Dates are displayed in Asia/Dhaka (`lib/dates.js`). The backend decides every date-based rule.

## Routes

Public: `/`, `/events`, `/events/:id`, `/events/:id/register`, `/registration/:token`, `/my-registrations`, `/clubs`, `/clubs/:id`, `/fests/:id`, `/volunteer`, `/gallery`. Public API beyond the obvious reads: `POST /api/events/:id/register`, `POST /api/registrations/:token/cancel`, `POST /api/volunteers`, `GET /api/assistant` (suggested questions), `POST /api/assistant` (ask; see "Event assistant").

Organizer (all behind the key): `/organizer/login`, `/organizer` (dashboard), `/organizer/registrations` (list; `?status&event&q&page`; `?reg=<id>` opens one registration), `/organizer/events` (`?q&club&fest&category&state&sort`), `/organizer/events/new` (`?fest=`), `/organizer/events/:id`, `/organizer/events/:id/edit`, `/organizer/fests` (`?view&club`), `/organizer/fests/new`, `/organizer/fests/:id`, `/organizer/fests/:id/edit`, `/organizer/volunteers`, `/organizer/check-in` (**placeholder**).

## Organizer API in one glance

`GET /api/admin/stats`, `GET /api/admin/events[?q&fest&club&limit&offset]`, `GET /api/admin/events/:id`, `GET /api/admin/registrations[?event&fest&status&q&limit&offset]` -> `{items,total,limit,offset}`, `PATCH /api/admin/registrations/:id {status: CONFIRMED|REJECTED|CANCELLED}`, `POST /api/admin/registrations/:id/check-in`, `POST /api/admin/checkin {token, event_id?}` (pass scan, unused so far), `GET /api/admin/events/:id/export.csv`, `GET /api/admin/volunteers`, and for fests and events: `GET /api/admin/fests[/:id]`, `POST`, `PATCH`, `DELETE`, `POST .../archive`, `POST .../restore` (used by Phase 3E). Exact shapes and refusals are tabulated in `PHASE3_STATUS.md`. An event has no end time, no "registration opens" time and no draft state; its one state is `registration_state` (open, full, closed, ended, archived).

Status machine (`server/domain/registration.js`): PENDING -> CONFIRMED / REJECTED / CANCELLED; CONFIRMED -> REJECTED / CANCELLED / CHECKED_IN (check-in only through the check-in endpoints); REJECTED -> CONFIRMED (needs a free seat); CANCELLED and CHECKED_IN are final. A seat is held by PENDING, CONFIRMED and CHECKED_IN.

**Gaps in the API that shaped the UI:** no "get one registration by id" endpoint and no per-registration "allowed actions". See "Known limitations" in `PHASE3_STATUS.md`.

## Testing

```bash
npm test                                                         # backend
# browser suites: need Playwright, and a server on a FRESH seeded database serving web/dist
DB_FILE=/tmp/t.db npm run seed:reset
L="RATE_LIMIT_PER_MIN=100000 ADMIN_RATE_LIMIT_PER_MIN=100000 AUTH_FAIL_LIMIT_PER_MIN=100000 ASSISTANT_RATE_LIMIT_PER_MIN=100000"
env $L DB_FILE=/tmp/t.db PORT=3111 npm start &
env $L DB_FILE=/tmp/empty.db PORT=3112 npm start &   # un-seeded, for empty states
BASE=http://localhost:3111 node tools/browser-3b.mjs             # public flows incl. gallery slideshow, 57 checks
BASE=http://localhost:3111 node tools/browser-3b-audit.mjs       # 8 checks
BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3c.mjs    # organizer dashboard + registrations, 61 checks
BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3e.mjs    # event + fest management, 40 checks
BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3f.mjs    # event assistant, 27 checks
BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3g.mjs    # layout, brand, accessibility, 49 checks (about 12 minutes)
```

Raise the rate limits as shown: the suites make deliberate wrong-key calls and the default limit of 10 per minute would lock the organizer API. Use a fresh database for each suite.

## Event assistant (Phase 3F)

"Tech Guide" is the floating assistant on every public page. It is a **public, read-only event-discovery assistant**: it answers questions about published events, fests and clubs, and nothing else.

**Flow:** `components/assistant/AssistantWidget.jsx` -> `lib/api.js` (`api.assistant`, `api.assistantStarters`) -> `POST /api/assistant` / `GET /api/assistant` (`http/routes/public.js`) -> `services/club.js` (`assistantAsk`, `assistantStarters`) -> `domain/assistant.js` (all the logic, pure) -> the same repository reads the public pages use. Nothing new in the database; no new npm dependency.

**Request / reply:** `POST /api/assistant {"message": "...", "context": {"event": id} | {"fest": id}}` (context optional: the event or fest a follow-up refers to) -> `{intent, message, sources: [{type, id, title, href, ...}], suggestions: [...], focus?, total?, ai}`. `message` is plain text ("• " lines are list items). `sources` are the records the answer was built from, with real page links. `GET /api/assistant` -> `{suggestions}`: starter questions built from what is published, each checked to be answerable.

**How it stays truthful** (`server/domain/assistant.js`, read its header comment first):
- The service hands the domain module the public catalogue only (non-archived events with seat counts, fests, clubs). Registrations, volunteers and passes are never loaded, so there is nothing private it could repeat.
- A question becomes a small closed *query* (kind, record ids, filters); `execute` builds the reply by copying fields from real records. No free text is ever generated about an event.
- A record is only "named" when the words of its published name appear in order. A different year ("Tech Carnival 2025"), an extra word in front ("National Programming Contest") or a typo gives "I couldn't find ..." with the real record offered as the closest name. Part of a name ("the keynote") is answered, and the reply starts with `Taking "..." to mean ...`.
- A search word must match a published title, category, fest or club name. Words that match nothing are reported ("Nothing in the event data matches ..."), never silently used or dropped. A widened search says "related to".
- A date phrase it cannot read ("before Friday", "31 November", a time of day) gets intent `unclear` and an explanation, never a guess. Dates are Dhaka time; weeks run Sunday to Saturday; the weekend is Friday and Saturday.
- Things the data does not hold (fees, prizes, judges, eligibility, end time) are answered with "I couldn't find that information in the club's event data."
- Requests for participants, contact details, credentials, the database, SQL, or prompt-injection attempts are refused before any data is read. Instructions to change something get "I can only look things up".

**Optional AI helper** (`server/ai/intent-client.js`): off by default. Set `AI_API_KEY` **and** `AI_MODEL` (optionally `AI_BASE_URL`, default `https://api.openai.com/v1`, and `AI_TIMEOUT_MS`, default 8000) to turn it on; any provider with an OpenAI-compatible `chat/completions` endpoint works. It is consulted only when the rules could not place a question (`unknown`) or found nothing under the words used (`not_found`). It receives the visitor's question and the public names already on the site (event titles, fest names, club names, categories); it returns a query in the same closed shape, and `fromModel` validates every field against the catalogue. Its text is never shown. If it is missing, slow, failing or wrong, the rule-based answer is used and the reply's `ai` field says `off` / `unavailable`. **It has only been exercised against a local stand-in provider in tests, never against a real one** (no key and no outbound access where it was built). The key is server-side only; never commit one.

**Rate limit:** assistant questions have their own bucket (`ASSISTANT_RATE_LIMIT_PER_MIN`, default 20 per IP), separate from registrations.

**Tests:** `server/test-assistant.js` (34, part of `npm test`: the brief's TEST 1-9 against the real seeded catalogue over HTTP, privacy and injection batteries, read-only proof, AI helper against a stand-in provider, plus a regression test for every defect two independent review passes found) and `tools/browser-3f.mjs` (27 browser checks: real answers, refusals, states, keyboard, reduced motion, 320-1440 px).

**When changing it:** every new question type goes through `interpret` -> query -> `execute`; never build a sentence about an event from anything but a record. Add a test with the truth read from the public API. The preview (`tools/preview/`) runs the same domain code, so it follows automatically.

## Design system and branding (Phase 3G)

- **Tokens:** `web/src/styles/tokens.css`. No hex colour anywhere else (print styles aside), no inline `style` (CSP). A new colour is a new token with its contrast checked. Full reference and the accessibility floor: `docs/design-system.md`.
- **Identity is fixed:** dark teal / near-black, emerald action colour, cyan and lime accents, glass panels, Orbitron + Inter with system fallbacks, no font CDN. UI/UX Pro Max was used for structure and checklists; its generated palette (purple / orange, light) and type (Playfair, Google Fonts) were rejected on purpose. Do not "apply" them later.
- **Brand hierarchy:** DRMC IT Club's mark (`web/src/assets/ditc.png`) is the brand: header, organizer shell, sign-in, hero, pass, footer, tab icon. The college crest (`crest.png`) appears once, in the footer's "Affiliation" block, smaller than every club mark. Use `Brand` / `ClubLogo` / `Institution`; never place the crest elsewhere or redraw a logo. `tools/browser-3g.mjs` enforces this.
- **Touch:** controls grow to 44px under `@media (pointer: coarse)`. Add new control classes to those rules (end of `components.css`, `layout.css`, `public.css`, `organizer.css`).
- **Section headings:** `components/common/SectionHead.jsx` (heading + optional action).
- **CSS order matters:** tokens, base, components, layout, public, organizer. A later file wins at equal specificity; `.pass-card` must stay `position: sticky` on desktop (a 3G draft broke that by re-declaring `position` further down).
- **Screenshots:** `docs/screenshots/` (23 files, taken 8 Oct 2026 from the current build; README section 10 lists them). Retake after a real `vite build` so headings show Orbitron. `README.md` was rewritten on 8 Oct 2026 to describe the final application.
- **Open asset request:** a transparent PNG or SVG of the club logo. The current file has a baked-in background and is blended with `mix-blend-mode: lighten`.

## Full preview

The project owner wants a full clickable preview with every delivery. Build it, check it, and send the file:

```bash
ESBUILD_DIR=<node_modules>/esbuild NODE_PATH=<node_modules> node tools/build-preview.mjs /abs/path/preview.html
NODE_PATH=<node_modules> node tools/preview-check.mjs /abs/path/preview.html      # 9 checks, needs Playwright
```

`preview.html` is one file that opens by double-click. It contains the unchanged frontend plus the real `server/services`, `server/domain` and `server/http/routes` code running in the browser on in-memory sample data. The stand-ins are in `tools/preview/` (storage, address bar via the URL hash, browser storage, non-cryptographic pass signing). It is a demo only: nothing is saved and it is not the production build. If a repository method is added or changed in `server/repository/`, mirror it in `tools/preview/backend.js`.

## Phase 3E notes (event & fest management)

- Request shapes and mirrored limits: `lib/eventAdmin.js`. Lifecycle wording and API calls: `components/organizer/lifecycle.js`. Confirmation dialog: `useConfirmAction.jsx`. Form builder: `FormSchemaEditor.jsx` (reads and writes the backend's `form_schema`; its preview uses the `Control` exported by `pages/RegisterPage.jsx`).
- Delete is offered only when it can succeed as far as the page knows (event: no seats taken; fest: no events). The server still decides.
- Remaining limitations are listed at the end of the Phase 3E section of `PHASE3_STATUS.md`.

## For Phase 3D (not built)

- `/organizer/check-in` renders `pages/Placeholder.jsx`; replace it in `App.jsx`.
- Backend is ready: `POST /api/admin/checkin {token, event_id?}` (400 `invalid_pass`, 404 `pass_not_found`, 409 `wrong_event` / `already_checked_in`, 403 `pass_revoked`). `api.admin.checkIn(token, eventId)` already exists in `lib/api.js`.
- `BarcodeDetector` is missing on iOS Safari; a camera scanner needs a fallback (manual pass-code entry works with the same endpoint). The server's `Permissions-Policy` header already allows `camera=(self)`.
- The manual "Check in" button on the registration detail (3C) already uses `POST /api/admin/registrations/:id/check-in`.

## Latest work (7 October 2026)

### Visual reference
The supplied `DRMC IT Club _ Live with Tech.html` and the two club posters are the visual reference for public-facing styling: dark teal/black foundation, glass panels, cyan/emerald/lime accents, Orbitron display type, Inter body type, rounded panels, technical/circuit decoration, restrained glow. Use their visual language, not their literal text or dates.

### Gallery
`/gallery` is a slideshow (`pages/Gallery.jsx`): photo frame with previous/next, a bar under the photo with album, caption, Play/Pause and Fullscreen, a thumbnail strip, arrow keys / Space / F / Esc, swipe on touch screens. It starts paused for visitors who prefer reduced motion.

Content is `web/src/gallery/albums.js` plus files in `web/src/assets/gallery/`. It holds **three real photographs** supplied by the project owner (two from the 8th DRMC International Tech Carnival 2025, one unattributed). There are no placeholders left. Captions state only what is visible in each picture; do not invent event names, dates or people. Adding photos: steps at the top of `albums.js`. There is no image backend, by design.

Fullscreen is rendered on `<body>` through a portal on purpose: `position: fixed` inside the page container is positioned against that container (its entry animation makes it a containing block), not the screen.

## Working rules for any AI model continuing this project

Before changing anything: read this file and `PHASE3_STATUS.md`; inspect the actual code and the actual backend route, service and repository; work out exactly what the current task needs; reuse existing components; make the smallest reasonable change; run the tests; browser-test the affected flows; update `PHASE3_STATUS.md`; report what changed and what remains.

Do not: rebuild completed phases; replace the router or the API client; invent backend endpoints or fields; use fake production data; hard-code event information or dates taken from design references; add dependencies without need; rewrite working architecture; start a later phase without being asked.

**Work in focused phases** (models have limited context): inspect, plan briefly, implement, test, update `PHASE3_STATUS.md`, then stop. A phase is complete only when it has been implemented and verified, and nothing may be reported as verified (above all the Vite build) unless it was actually run.

A new AI account should start by reading the two documents and the repository, then report which phases are complete, what remains, the next phase and the verification gaps, and wait for the phase prompt before coding.
