# Smart Club Operations Platform

### A complete digital platform for managing student clubs, fests, events, and registrations — without Google Forms.

**Built for DRMC IT Club**

> **Smart Club Operations** replaces fragmented event-registration workflows with one connected system for publishing events, collecting registrations, managing participants, and issuing digital entry passes.

**Project:** Smart Club Operations Platform  
**Organization:** DRMC IT Club  
**Theme:** Smart Club Operations  
**License:** MIT

---

## Overview

Student clubs often depend on Google Forms, spreadsheets, messaging apps, and manual processes to organize events.

Smart Club Operations brings those workflows into one platform.

The system follows a simple hierarchy:

```text
Club
 └── Fest
      └── Event
           └── Registration
                └── Digital Pass
```

For example:

```text
DRMC IT Club
 └── Tech Carnival 2026
      ├── Programming Contest
      ├── AI Web Development Contest
      ├── Robotics Challenge
      └── Gaming Tournament
```

Students can discover events and register without creating an account.

Organizers can create fests and events, design registration forms, manage participants, control registration status, and monitor event activity from one organizer console.

---

## Why Smart Club Operations?

Traditional club event workflows can become fragmented:

- Google Forms for registration
- Spreadsheets for participants
- Separate pages or posts for event information
- Manual approval processes
- Manual participant tracking
- No unified registration history
- No dedicated digital pass

Smart Club Operations combines these workflows into one application.

### Core goals

- Make event discovery simple.
- Replace third-party registration forms.
- Give organizers one management console.
- Make registration status and capacity reliable.
- Give every registration a digital pass.
- Provide useful event information from live application data.
- Work responsively across phones, tablets, and desktops.

---

# Features

## Student Experience

### Event Discovery

- Home page with current event and fest information.
- Event directory with search.
- Club and category filtering.
- Registration-status indicators.
- Shareable URL filters.
- Club and fest pages.

### Event Details

Each event provides:

- Description
- Date
- Time
- Venue
- Available seats
- Registration deadline
- Registration state
- Rules
- Registration requirements

### Dynamic Registration

Organizers can design the registration form for each event.

Supported question types include:

- Short text
- Long text
- Number
- Email
- Phone
- Dropdown

Questions can be required or optional.

The server enforces:

- Registration deadlines
- Seat limits
- Duplicate registration prevention
- Registration state
- Event capacity

### Registration & Digital Pass

Depending on the event configuration, registrations can be confirmed immediately or require organizer approval.

A confirmed registration produces a digital entry pass containing:

- Registration status
- Event information
- Pass information
- QR code

Passes are generated from server-side registration data and can be revoked when the associated registration is rejected or cancelled.

### My Registrations

Participants can access registrations created on their current device.

They can:

- View registration status
- View their digital pass
- Check event information
- Cancel eligible registrations

### Volunteer Applications

Students can also submit volunteer applications through the platform.

### Gallery

The public site includes a responsive photo gallery with:

- Slideshow navigation
- Previous/next controls
- Keyboard controls
- Mobile swipe support
- Fullscreen mode
- Reduced-motion support

---

# Organizer Console

Organizers access a dedicated management interface.

## Dashboard

The dashboard provides an overview of:

- Pending registrations
- Confirmed registrations
- Checked-in participants
- Seats taken
- Recent registrations
- Upcoming events

## Fest Management

Organizers can:

- Create fests
- Edit fests
- Archive fests
- Restore fests
- Delete eligible fests
- View events belonging to a fest

## Event Management

Organizers can:

- Create events
- Edit events
- Archive events
- Restore events
- Delete eligible events
- Configure capacity
- Configure registration deadlines
- Choose instant or approval-based registration
- Configure event rules
- Build registration forms

## Registration Form Builder

The form builder allows organizers to:

- Add questions
- Remove questions
- Reorder questions
- Select answer types
- Mark questions as required
- Configure dropdown choices
- Preview the participant form

The public registration page uses the saved form definition.

## Participant Management

Organizers can:

- Search participants
- Filter registrations
- Filter by event
- Filter by registration status
- Approve registrations
- Reject registrations
- Cancel registrations
- Mark participants as checked in
- View submitted answers
- Export event registrations as CSV

## Volunteer Management

Organizers can review submitted volunteer applications and contact applicants using the information they provided.

---

# Tech Guide

Smart Club Operations includes **Tech Guide**, a read-only event assistant available throughout the public site.

Tech Guide can answer questions such as:

- What events are open?
- When is an event?
- Where is an event?
- How many seats are left?
- When does registration close?
- What events are happening this week?
- What events are in a particular fest?
- Which programming or coding events are available?

### Grounded responses

Tech Guide answers from the application's published event data.

It does not invent events, dates, venues, or participant information.

For example, when an unknown event is requested, it responds that it could not find the requested information rather than generating fictional details.

### Privacy

Tech Guide is read-only and does not expose:

- Participant names
- Participant emails
- Organizer credentials
- Private registration information
- Database contents
- Internal system information

### AI architecture

The assistant works without an external AI provider.

The default interpreter is rule-based and operates through:

```text
AssistantWidget
      ↓
API
      ↓
Assistant domain logic
      ↓
Public event data
      ↓
Validated response
```

An optional OpenAI-compatible AI provider can be enabled through server-side environment variables to interpret unusual phrasing.

The optional provider is:

- Disabled by default
- Server-side only
- Not given participant/private data
- Validated before its interpretation is used

---

# Design & User Experience

The final interface was redesigned around a modern technical visual language for DRMC IT Club.

### Design characteristics

- Dark teal / black foundation
- Cyan, emerald and lime accents
- Glass-style interface panels
- Technical visual patterns
- Club-first branding
- Responsive event cards
- Ticket-style registration passes
- Clear registration states
- Strong keyboard focus states
- Reduced-motion support
- Touch-friendly controls

The interface was tested at:

```text
320px
375px
768px
1024px
1440px
```

The current screenshot set is available in [`docs/screenshots/`](docs/screenshots/).

---

## Screenshots

### Public Experience

#### Home

![Smart Club Operations home page](docs/screenshots/home.png)

#### Event Directory

![Event directory](docs/screenshots/events.png)

#### Fest

![Fest page](docs/screenshots/fest.png)

#### Event Details

![Event details](docs/screenshots/event-details.png)

#### Registration

![Registration form](docs/screenshots/registration.png)

#### Digital Pass

![Digital registration pass](docs/screenshots/pass.png)

#### My Registrations

![My registrations](docs/screenshots/my-registrations.png)

#### Gallery

![Club gallery](docs/screenshots/gallery.png)

#### Tech Guide

![Tech Guide AI assistant](docs/screenshots/tech-guide.png)

---

## Organizer Experience

![Organizer login](docs/screenshots/organizer-login.png)

![Organizer dashboard](docs/screenshots/organizer-dashboard.png)

![Organizer event management](docs/screenshots/organizer-events.png)

![Organizer event administration](docs/screenshots/organizer-event.png)

![Organizer registrations](docs/screenshots/organizer-registrations.png)

![Registration form builder](docs/screenshots/organizer-form-builder.png)

---

## Mobile Experience

The interface was also tested for phone-sized layouts.

<img src="docs/screenshots/mobile-home.png" width="240" alt="Screenshot of the Smart Club Operations home page on a phone."> <img src="docs/screenshots/mobile-events.png" width="240" alt="Screenshot of the event directory on a phone."> <img src="docs/screenshots/mobile-event-details.png" width="240" alt="Screenshot of event details on a phone.">

<img src="docs/screenshots/mobile-menu.png" width="240" alt="Screenshot of the mobile navigation menu."> <img src="docs/screenshots/mobile-tech-guide.png" width="240" alt="Screenshot of Tech Guide on a phone."> <img src="docs/screenshots/mobile-organizer-dashboard.png" width="240" alt="Screenshot of the organizer dashboard on a phone.">

<img src="docs/screenshots/mobile-pass.png" width="240" alt="Screenshot of a digital pass on a phone."> <img src="docs/screenshots/mobile-footer.png" width="240" alt="Screenshot of the mobile footer.">

---

# Technology Stack

## Frontend

- React 19
- Vite
- Plain CSS
- CSS design tokens
- History API routing
- Inline SVG icons
- Self-hosted Inter and Orbitron fonts through `@fontsource`

No UI framework or Tailwind CSS is used.

## Backend

- Node.js 22.13+
- Native Node HTTP server
- No backend framework
- Layered architecture

```text
HTTP / Routes
      ↓
Services
      ↓
Repositories
      ↓
SQLite Database
```

Domain rules are kept separate from persistence and HTTP handling.

## Database

- SQLite
- Node's built-in `node:sqlite`
- Persistent database file
- WAL mode
- Ordered migrations
- Database location configurable through `DB_FILE`

Default:

```text
./club.db
```

## QR

The project contains an in-house QR encoder and does not require a third-party QR package.

---

# Project Architecture

```text
server/
├── domain/
│   ├── registration
│   ├── pass
│   ├── intake
│   ├── csv
│   └── assistant
│
├── repository/
│   └── SQL data access
│
├── services/
│   └── application services
│
├── http/
│   ├── routes
│   └── router
│
├── ai/
│   └── optional assistant provider
│
├── db.js
├── config.js
├── seed.js
└── seed-data.js

web/
└── src/
    ├── pages/
    ├── components/
    ├── layouts/
    ├── lib/
    ├── styles/
    └── assets/

tools/
├── browser tests
├── persistence checks
└── preview builder

docs/
├── screenshots/
├── architecture/
└── design-system.md
```

Architecture decisions are documented in:

- [`ADR-001 — Zero Dependencies`](docs/architecture/adr-001-zero-dependencies.md)
- [`ADR-002 — SQLite on Persistent Disk`](docs/architecture/adr-002-sqlite-persistent-disk.md)
- [`ADR-003 — Capability Token Identity`](docs/architecture/adr-003-capability-token-identity.md)
- [`Design System`](docs/design-system.md)

---

# Getting Started

## Requirements

- Node.js **22.13 or newer**
- npm

## 1. Install frontend dependencies

From the project root:

```bash
npm run web:install
```

## 2. Build the current frontend

```bash
npm run web:build
```

> **Important:** Run `npm run web:install` and `npm run web:build` before `npm start`. The current React interface is served from `web/dist`.

## 3. Seed demo data

For a fresh local database:

```bash
npm run seed
```

The seed command only populates an empty database. It does not wipe existing registrations.

## 4. Start the application

```bash
npm start
```

The application will be available at:

```text
http://localhost:3000
```

### Development mode

Run the backend:

```bash
npm start
```

Then run the Vite development server separately:

```bash
npm run web:dev
```

The frontend development server runs on port `5173` and proxies API requests to the backend.

---

# Environment Configuration

Settings are environment variables. [`.env.example`](.env.example) lists all of them with their defaults.

The server does not read a `.env` file by itself. Either set the variables in your shell or hosting dashboard, or copy the example and pass the file to Node when starting:

```bash
cp .env.example .env
node --env-file=.env --no-warnings server/index.js
```

Available configuration includes:

- Server port
- Database path
- Organizer key
- Pass signing secret
- Proxy configuration
- Rate limits
- Optional AI assistant configuration

### Production secrets

Production requires real values for:

```text
ORGANIZER_KEY
PASS_SECRET
```

The production server refuses to start when required secrets are missing or still using demo values.

Never commit `.env` or real API keys to GitHub.

---

# Demo Credentials

Participants need no login.

The organizer console is opened with an organizer key (**Organizer** in the site menu):

- **Running locally:** `demo-organizer-key`. This placeholder is refused in production.
- **Deployed site:** _to be added here together with the deployment URL._

---

# Demo Data

The project includes sample data for evaluation.

The seed catalogue contains sample DRMC clubs, fests and events so judges can explore the application without having to create the entire system from scratch.

To seed an empty local database:

```bash
npm run seed
```

To intentionally reset and reseed a local development database:

```bash
npm run seed:reset
```

> `seed:reset` is destructive and is refused in production.

---

# Testing

The project contains backend, persistence and browser-level test suites.

### Backend

```bash
npm test
```

Latest verified result:

```text
97 / 97
```

### Persistence

```bash
node tools/persistence-check.mjs
```

Latest verified result:

```text
9 / 9
```

### Browser suites

The latest verified results are:

| Suite | Result |
|---|---:|
| Browser 3B | 57 / 57 |
| Browser 3B Audit | 8 / 8 |
| Browser 3C | 61 / 61 |
| Browser 3E | 40 / 40 |
| Browser 3F | 27 / 27 |
| Browser 3G | 49 / 49 |
| Preview | 9 / 9 |

The browser suites were run against the current application source using headless Chromium.

---

# Deployment

The application can be deployed using Docker or a Node.js environment.

## Docker

Build:

```bash
docker build -t smart-club-ops .
```

Run:

```bash
docker run -p 3000:3000 \
  -v club-data:/data \
  -e NODE_ENV=production \
  -e ORGANIZER_KEY="YOUR_LONG_RANDOM_KEY" \
  -e PASS_SECRET="YOUR_LONG_RANDOM_SECRET" \
  -e TRUST_PROXY=1 \
  -e DB_FILE=/data/club.db \
  smart-club-ops
```

### Production database

SQLite requires persistent storage.

For a hosted deployment:

- Use a persistent disk/volume.
- Set `DB_FILE` to the persistent location.
- Run a single application instance for this SQLite architecture.
- Do not use an ephemeral filesystem for the production database.

---

# Security & Privacy

The application includes:

- Input validation
- Public-write rate limiting
- Assistant rate limiting
- Organizer-route rate limiting
- Wrong-key throttling
- Content Security Policy
- Server-side secrets
- Parameterized database operations
- Pagination
- Public/private data separation
- Read-only AI assistant access to public catalogue data

Participant information is not exposed through the public Tech Guide.

---

# Third-Party Services / APIs

None are required at runtime: no external database, authentication, email, analytics, font or CDN service. Fonts are bundled with the application.

Optional: Tech Guide can call an AI provider with an OpenAI-compatible "chat completions" endpoint when `AI_API_KEY` and `AI_MODEL` are set on the server. It is off by default and no key is included in this repository.

---

# AI-Assisted Development

AI tools were used during development.

### Product AI

The application includes **Tech Guide**, the read-only event assistant described above.

### Development workflow

Claude was used as an AI-assisted development tool throughout the project for:

- Project planning
- Backend implementation
- Frontend implementation
- Testing
- Debugging
- UI/UX refinement
- Assistant implementation
- Code review and issue triage

The UI/UX Pro Max design skill was also consulted during the visual redesign.

The implementation was validated through automated tests and browser-based testing rather than relying solely on generated code.

---

# Known Limitations

### QR scanner

A dedicated QR scanner/check-in screen is **not implemented**.

Organizers can mark participants as checked in from the registration management interface, and the pass/check-in API exists.

### Organizer authentication

Organizer access currently uses a shared organizer key rather than individual organizer accounts.

### Participant identity

Participants access their registrations through a private browser-stored link/token.

Clearing browser data can remove convenient access unless the registration link has been saved.

Email notifications are not implemented.

### SQLite deployment

The application uses SQLite and therefore requires:

- Persistent storage
- One running application instance for the database

The in-memory rate limiter is per application instance.

### Tech Guide

Tech Guide is intentionally focused on event, fest and club information.

It is not a general-purpose conversational AI.

### Gallery

Gallery images are stored with the application source. There is no organizer image-upload system.

### Browser coverage

The verified browser testing was performed with headless Chromium.

Firefox, Safari, real mobile devices and screen-reader testing were not part of the final verification suite.

### Production build verification

The final production Vite build must be verified in an environment that can install the frontend dependencies.

---

# Submission Information

**Project:** Smart Club Operations Platform

**Organization:** DRMC IT Club

**Repository:**  
`https://github.com/yunuszoro46-sketch/9th-DRMC-International-Tech-Carnival-2026-`

**Deployment URL:**  
_Not deployed yet._

Once the production deployment is available, the deployment URL should be added here.

---

# Documentation

Additional project documentation:

- [`Phase 3 Status`](PHASE3_STATUS.md)
- [`AI Handoff`](AI_HANDOFF.md)
- [`Design System`](docs/design-system.md)
- [`Architecture Decisions`](docs/architecture/)
- [`Screenshots`](docs/screenshots/)

---

# License

This project is licensed under the **MIT License**.

See [`LICENSE`](LICENSE) for the complete license text.

---

# Organizing Authority Statement

This project was developed as a submission for the **DRMC IT Club Smart Club Operations** challenge/theme.

The project is intended to demonstrate a complete, practical club-event management workflow covering event discovery, registration, organizer management, digital passes and AI-assisted event information.
