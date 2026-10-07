# Smart Club Operations Platform

## 1. Project name
Smart Club Operations Platform (Smart Club Ops), built for the DRMC IT Club.

## 2. Project description
An open-source web app that lets a student club run its fests and events without Google Forms and spreadsheets. Clubs publish fests and events, students register through forms the organizers design, every confirmed registration gets a signed digital pass with a QR code, and organizers manage events, seats and participants from one console.

Everything follows one hierarchy: **Club > Fest > Event > Registration > Pass**, for example DRMC IT Club > Tech Carnival 2026 > Programming Contest.

## 3. Features

**For students (no account needed)**
- Home page with live figures, events open for registration and current fests.
- Event directory with search, club and category filters and status chips (open, full, closed, ended). Filters live in the address, so a filtered view can be shared or reloaded.
- Club pages and fest pages listing their events.
- Event page with date, time, venue, seats left, deadline and rules.
- Registration with a form built per event (text, long text, number, email, phone, dropdown; required or optional). The server enforces the deadline, the seat limit and one registration per email.
- Instant confirmation or organizer approval, set per event.
- Registration confirmation page with an entry pass: status, event details and a QR code. Passes are signed, and are revoked automatically when a registration is rejected or cancelled.
- My Registrations: the passes made on this device, with cancel (which frees the seat).
- Volunteer application form.
- Photo gallery slideshow with keyboard, swipe and fullscreen.
- **Tech Guide**, an event assistant (see below).

**For organizers (behind an organizer key)**
- Dashboard: pending approvals, confirmed, checked in, seats taken, recent registrations, upcoming events.
- Fest management: create, edit, archive, restore, delete.
- Event management: create, edit, archive, restore, delete; seats, deadline, instant or approved registration.
- Registration form builder: add, reorder and remove questions, with a live preview of what participants will see.
- Participant management: search, filter by event and status, approve, reject, cancel, mark checked in, view each participant's answers, export an event's registrations as CSV.
- Volunteer applications list.

**Tech Guide (AI assistant)**
- Answers questions about published events, fests and clubs: when, where, seats left, deadlines, what is open, what is on this week.
- Every answer is built from the live database records and links to the pages it used. It does not invent events: an unknown name gets "I couldn't find anything about ...".
- Read-only. It refuses requests for participant details, organizer access or anything internal.
- Works with no AI provider at all (a rule-based interpreter in `server/domain/assistant.js`). An optional AI helper can be switched on with server-side environment variables to interpret unusual phrasings; its output is validated and it still answers only from real records. See "Third-party services".

**Across the app**
- Responsive from 320px phones to desktop; keyboard accessible; honours reduced-motion settings.
- Hardening: atomic seat allocation, rate limiting on public writes, on the assistant and on all organizer routes (plus throttling of wrong organizer keys), a strict Content-Security-Policy (no inline scripts or styles), input validation, pagination, production refuses to start with missing or demo secrets.

## 4. Tech stack
- **Frontend:** React 19 with Vite 5 (`web/`). Plain CSS with design tokens (`web/src/styles/tokens.css`), a small in-house History-API router, inline SVG icons, self-hosted Inter and Orbitron fonts through `@fontsource`. No UI framework, Tailwind or router package.
- **Backend:** Node.js 22.13 or newer, no framework and **zero npm dependencies** (`server/`). Layers: `domain` (pure rules) > `repository` (SQL) > `services` > `http/routes` > `http/router`.
- **Database:** persistent SQLite through Node's built-in `node:sqlite` (WAL mode, ordered migrations in `server/db.js`). Data lives in one file (`DB_FILE`, default `./club.db`) and survives restarts.
- **QR codes:** an in-house encoder (`web/src/lib/qr.js`), no library.

Design decisions: [ADR-001 zero dependencies](docs/architecture/adr-001-zero-dependencies.md), [ADR-002 SQLite on a persistent disk](docs/architecture/adr-002-sqlite-persistent-disk.md), [ADR-003 capability-token identity](docs/architecture/adr-003-capability-token-identity.md). The design system is described in [docs/design-system.md](docs/design-system.md).

## 5. Setup instructions

Requirements: Node.js 22.13 or newer.

```bash
npm run web:install   # installs the frontend's packages (React, Vite, fonts) into web/
npm run web:build     # builds the React app into web/dist
npm run seed          # demo data, ONLY if the database is empty (never wipes registrations)
npm start             # http://localhost:3000
```

The server has no packages of its own to install. It serves `web/dist` when that folder exists. **Build the frontend before starting the server:** without `web/dist` the server falls back to an earlier, simpler interface kept in `public/`, which is not the current design. The choice is made once at startup, so restart after the first build.

For frontend development with hot reload: `npm start` in one terminal, `npm run web:dev` in another (Vite on port 5173, proxying `/api` to port 3000).

Settings are environment variables; `.env.example` lists all of them (port, database file, organizer key, pass secret, proxy trust, rate limits, optional assistant helper). `npm run seed:reset` wipes and re-seeds a local database and is refused in production.

### Deployment
With Docker (the image builds the frontend itself):
```bash
docker build -t club-ops .
docker run -p 3000:3000 -v club-data:/data \
  -e ORGANIZER_KEY='<long random value>' -e PASS_SECRET='<long random value>' -e TRUST_PROXY=1 club-ops
```
Without Docker: build the frontend as above, then start with `NODE_ENV=production`, `ORGANIZER_KEY`, `PASS_SECRET` and `DB_FILE` set.

- With `NODE_ENV=production` the server **refuses to start** if `ORGANIZER_KEY` or `PASS_SECRET` is missing or still a demo value.
- Mount a persistent disk for the database (`DB_FILE=/data/club.db` in the image) and run exactly **one** instance.
- Set `TRUST_PROXY=1` behind one reverse proxy so rate limits see real client addresses.
- The container runs `seed` on start, which does nothing once the database has events.

### Testing
```bash
npm test                              # backend: 97 tests (API, units, flows, assistant); uses temporary databases
node tools/persistence-check.mjs      # 9 checks: data survives a restart and a crash
```
Browser suites (need Playwright, which is not a project dependency, and a server on a freshly seeded database serving `web/dist`): `tools/browser-3b.mjs` (public flows, 57 checks), `browser-3b-audit.mjs` (8), `browser-3c.mjs` (organizer dashboard and registrations, 61), `browser-3e.mjs` (fest and event management, 40), `browser-3f.mjs` (assistant, 27), `browser-3g.mjs` (layout, branding, accessibility, 49). How to run them is in `AI_HANDOFF.md`. All passed on 8 October 2026 against a test bundle of this source (see "Known limitations" for what that does and does not cover).

`tools/build-preview.mjs` builds `preview.html`, a single clickable file of the whole app on sample data, for demos without a server.

### Data model
`clubs` > `fests` > `events` > `registrations` > `passes`, plus `volunteers`. The demo catalogue is in `server/seed-data.js` (16 DRMC clubs with sample fests and events). The schema is tabulated in `PHASE3_STATUS.md`.

### Project layout
```
server/   domain/ (rules: registration, pass, intake, csv, assistant)   repository/ (SQL)   services/   http/ (router, rate limit, static, routes)
          ai/ (optional assistant helper)   db.js   config.js   seed.js   seed-data.js   tests (test*.js)
web/      React app: src/pages, src/components, src/layouts, src/lib, src/styles, src/assets
public/   earlier zero-build interface, served only when web/dist is missing
tools/    browser suites, persistence check, preview builder
docs/     screenshots/, architecture/ (ADRs), design-system.md
```

## 6. Deployment URL
Not deployed yet.

## 7. Demo credentials
Organizer key for local development: `demo-organizer-key` (Organizer > sign in). It is a placeholder, and the server will not start in production with it. Participants need no login.

## 8. Third-party services/APIs
None are required at runtime: no external database, authentication, email, analytics, font or CDN service. Fonts are bundled with the app.

Optional: the Tech Guide can call an AI provider with an OpenAI-compatible "chat completions" endpoint if `AI_API_KEY` and `AI_MODEL` are set on the server (`AI_BASE_URL` selects the provider). It is off by default, the key never reaches the browser, and no key is included in this repository. This helper has not been tested against a real provider.

## 9. AI tools/features used
- **In the product:** Tech Guide, the event assistant described above.
- **In development:** Claude (Anthropic) was used throughout: scoping the original plan, writing the server, the React frontend, the QR encoder, the assistant and the tests, reviewing the work, and triaging an external AI code review (see `docs/CODE_REVIEW_TRIAGE.md`). The UI/UX Pro Max design skill was consulted during the interface polish; what was adopted and what was rejected is recorded in `docs/design-system.md`. Generated code was checked by running the automated tests and by driving the real pages in a headless browser.

## 10. Screenshots
Taken on 8 October 2026 from the current build (React frontend, Phase 3G design, seeded demo data). All files are in `docs/screenshots/`.

**Public site**

![Home: hero with live figures, open events, fests and the footer](docs/screenshots/home.png)
![Events directory with search, filters and event cards](docs/screenshots/events.png)
![Fest page with its events](docs/screenshots/fest.png)
![Event details with the facts card and Register button](docs/screenshots/event-details.png)
![Registration form](docs/screenshots/registration.png)
![Registration confirmation: the entry pass with its QR code](docs/screenshots/pass.png)
![My registrations](docs/screenshots/my-registrations.png)
![Gallery](docs/screenshots/gallery.png)
![Tech Guide, the event assistant, answering from the live event data](docs/screenshots/tech-guide.png)

**Organizer**

![Organizer sign in](docs/screenshots/organizer-login.png)
![Organizer dashboard](docs/screenshots/organizer-dashboard.png)
![Organizer events management](docs/screenshots/organizer-events.png)
![Managing one event: details, seats and its registration form](docs/screenshots/organizer-event.png)
![Registrations list with approve and view actions](docs/screenshots/organizer-registrations.png)
![Registration form builder](docs/screenshots/organizer-form-builder.png)

**Phone (390px wide)**

<img src="docs/screenshots/mobile-home.png" width="240" alt="Home on a phone"> <img src="docs/screenshots/mobile-events.png" width="240" alt="Events on a phone"> <img src="docs/screenshots/mobile-event-details.png" width="240" alt="Event details on a phone">

<img src="docs/screenshots/mobile-menu.png" width="240" alt="Menu on a phone"> <img src="docs/screenshots/mobile-tech-guide.png" width="240" alt="Tech Guide on a phone"> <img src="docs/screenshots/mobile-organizer-dashboard.png" width="240" alt="Organizer dashboard on a phone">

<img src="docs/screenshots/mobile-pass.png" width="240" alt="Entry pass on a phone"> <img src="docs/screenshots/mobile-footer.png" width="240" alt="Footer on a phone">

Note: these were captured from a build without the bundled web fonts, so headings appear in the fallback typeface rather than Orbitron. Retake them after `npm run web:install && npm run web:build` if the heading font matters for the submission.

## 11. Known limitations
- **Check-in:** there is no QR scanner screen yet (the Check-in page is a placeholder). Organizers mark a participant as checked in from the registration's detail view; the pass check-in API exists.
- **Organizer access** is one shared key, not individual accounts.
- **Participant identity** is a private link stored in the browser. Clearing browser data loses access unless the link was saved. There are no email notifications.
- **SQLite** needs a persistent disk and a single running instance. The rate limiter is in memory, per instance.
- **Tech Guide** understands English questions about events, fests and clubs only; it does not hold a general conversation.
- **Gallery** photos are files in the source (`web/src/gallery/albums.js`); there is no image upload.
- **Verification gaps:** at the time of packaging the production Vite build had not been run, because the development environment could not reach the npm registry. All browser testing used an esbuild bundle of the same source without the web fonts, in headless Chromium only. Run `npm run web:install && npm run web:build` and check the site (especially Orbitron headings on small phones) before deploying. Firefox, Safari, real phones and screen readers have not been tested.
- The club logo file is low resolution with a dark background baked in; a transparent version would look cleaner.
- The QR encoder supports pass tokens up to 106 bytes (current tokens are about 35).

## 12. License
MIT, see [LICENSE](LICENSE).
