# Smart Club Ops: Idea to Action

*Brainstorm → Filter → Execute, Reality-First.*

## Phase 1: Founder's Summary

**What is this?** A free, self-hosted app where a student club runs a fest end to end: publish events, take registrations with real capacity limits, confirm people, and check them in at the gate with a pass.

**Why will it work?** Clubs today glue together Google Forms + Sheets + WhatsApp. That breaks at exactly three moments: the form keeps accepting people after the venue is full, organizers can't tell who is confirmed, and gate entry is a paper list. This product fixes those three moments and nothing else.

**How Might We** let a 5-person club run a 300-person fest without a spreadsheet becoming the source of truth?

**Who it's for:** a club organizer (primary buyer/user) and a participant (must register in under 60 seconds on a phone).

**Success looks like:** one real DRMC IT Club fest run on it, zero oversold events, gate check-in under 5 seconds per person.

## Phase 2: System view

| Moving part | Input | Output |
|---|---|---|
| Directory | fests/events in DB | searchable cards with live seats left |
| Registration engine | name, email, dynamic answers | PENDING/CONFIRMED row, or a clear refusal (full/closed/duplicate) |
| Participant view | private link token | status, pass, cancel |
| Organizer console | organizer key | stats, participant table, status changes, CSV |
| Pass + gate | signed token | one-time CHECKED_IN, or "Already used" / "Revoked" |

**Secret sauce (the differentiators vs Google Forms):**
1. Capacity check and insert are *one transaction*, so oversell is impossible (tested with 50 concurrent requests).
2. Passes are signed and tied to status: reject or cancel a person and their pass dies instantly.
3. Check-in is one atomic `UPDATE ... WHERE status='ISSUED'`, so two gate volunteers can never both admit the same pass.

**Design decisions made from the original plan's gaps:**

| Gap in the plan | Decision |
|---|---|
| No auth | Single organizer key header now; real accounts are v2 |
| "Account" identity unspecified | Each registration gets an unguessable manage token (capability link); no accounts, no one can cancel someone else's seat |
| Capacity race | `BEGIN IMMEDIATE` transaction |
| Tickets vs Passes | Table is `passes` everywhere |
| Pass vs rejected/cancelled | Pass auto-revokes; re-confirming re-issues (never un-checks someone already inside) |
| Stack ambiguity | Zero-dependency Node 22 + built-in `node:sqlite` + vanilla JS. No `npm install`, nothing to break on demo day |
| Cancelled then re-register | Allowed (partial unique index ignores CANCELLED) |

## Phase 3: Execution plan

**Actionable steps (status as of this session)**
- [x] 1. Repo scaffold, Dockerfile, `.env.example`, health endpoint
- [x] 2. Schema: fests, events, registrations, passes
- [x] 3. Seed: 3 fests, 10 events, 21 registrations (open, full, closed-deadline, PENDING/CONFIRMED samples)
- [x] 4. Directory UI with search, category pills, fest filter, detail dialog
- [x] 5. Registration engine (deadline, capacity, duplicate, dynamic field validation)
- [x] 6. My registrations + cancel
- [x] 7. Organizer console (stats, searchable participant table, status change)
- [x] 8. CSV export (with spreadsheet-formula-injection guard)
- [x] 9. Gate check-in (manual token + camera via `BarcodeDetector`)
- [x] 10. 23 integration tests, all passing
- [x] 11. QR image on the pass (in-house encoder, decode-verified)
- [x] 11b. Code-review triage + hardening (CSP, rate limit, pagination, null-body fix)
- [x] 12a. README screenshots
- [ ] 12. Deploy (Render/Railway/Fly), fill in README URL
- [ ] 13. Dry-run with 3 real friends on phones

**Schedule**
- Day 1 (done): backend, tests, UI skeleton
- Day 2: QR rendering, mobile polish, screenshots, README
- Day 3: deploy, demo credentials, friend dry run, fix what breaks
- Day 4: buffer, record demo video, submit

**Risk analysis**

| Type | Risk | Mitigation |
|---|---|---|
| Technical | SQLite file lost on ephemeral hosts (Render free tier) | Mount a persistent disk, or run `seed` on boot for demo only; say so in Known Limitations |
| Technical | `node:sqlite` is still flagged experimental in Node 22 | Pinned `engines`; Dockerfile uses node:22; swap to `better-sqlite3` is a one-file change (`db.js`) |
| Technical | Camera scanning unsupported on iOS Safari (`BarcodeDetector`) | Manual token entry exists; v2: bundle `jsQR` |
| Technical | Shared organizer key leaks | Rotate via env var; v2 per-organizer accounts |
| Market | Clubs prefer Google Forms because it's zero-setup | Win on the three failure moments, import-from-CSV later; don't compete on form flexibility |
| Market | Only one club exists as a user | Treat DRMC IT Club as design partner, run one real event before adding features |

## Multilevel explanations

**ELI5 / investor pitch:** "When a school club has a party, they hand out invitations. Sometimes they hand out too many and not everyone fits. This app counts the seats so it never gives out too many, and gives each kid a magic ticket that only works once."

**Specs (engineer):** Node 22 HTTP server, no framework. SQLite (WAL) via `node:sqlite`. REST JSON. Dynamic forms via `events.form_schema` JSON array `[{key,label,type,required,options}]`. Registration = `BEGIN IMMEDIATE` → count PENDING+CONFIRMED → validate → insert → sync pass → `COMMIT`. Pass token = `regId.rand.hmac16` (HMAC-SHA256 with `PASS_SECRET`), verified before DB access; check-in = conditional UPDATE, rows-affected decides the outcome. Organizer routes gated by constant-time compare of `x-organizer-key`.

## Hidden assumptions (named on purpose)

**Betting on:** clubs will accept link-based identity (no logins) for participants; one deployed instance can serve multiple clubs later; organizers have phones with a camera or can paste a token.

**Could kill it:** a single bad event day (outage, lost DB) destroys trust faster than any feature builds it; participants lose the device that holds their registration tokens (mitigation in v2: email magic link).

**Choosing to ignore (for now):** payments, multi-club tenancy, notifications, accessibility audit beyond basics.

## The "Not Doing" list

| Not building | Why |
|---|---|
| Payments/ticket sales | Compliance + support burden; most club events are free |
| User accounts / passwords | Capability links cover the need; accounts add reset flows and attack surface |
| Email/SMS notifications | Needs a provider, deliverability work; v2 |
| Multi-club tenancy / roles | One organizer key is enough until a second club asks |
| Drag-and-drop form builder | JSON schema in seed is enough; builder is a project of its own |
| Waitlists | Real need, but only after a real event shows how often events fill |
| Analytics dashboards beyond 4 numbers | Counts answer every question a club actually asks |
| Native mobile app | Responsive web + camera API covers the gate |

## MVP scope in one line

Browse → register (never oversold) → organizer confirms → pass → gate scan once. Everything else waits for a real event to demand it.
