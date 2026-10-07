# ADR-001: Zero runtime dependencies

- **Status:** Accepted
- **Date:** 2026-10-05

## Context
Smart Club Ops is built for volunteer-run student clubs. The people who will maintain it rotate every year, often
have little ops experience, and deploy on free or cheap hosts. Every dependency is something that can break an
install, ship a vulnerability, or demand an upgrade nobody has time for.

## Decision
The server uses only Node.js built-ins (`node:http`, `node:sqlite`, `node:crypto`, `node:fs`, `node:test`-style
plain assertions) and the browser uses plain ES modules. There is no `npm install`, no bundler, no framework, no
build step. The QR encoder (`public/qr.js`) is in-house and verified by decoding its output with OpenCV
(`tools/qr_check.*`). `package.json` has no `dependencies` or `devDependencies`.

Zero dependencies does not mean zero structure. The code is layered so the "missing framework" does not turn into a
ball of mud:

| Layer | Folder | May depend on |
|---|---|---|
| Domain (pure rules) | `server/domain` | only `node:crypto` |
| Repository (SQL) | `server/repository` | the database handle |
| Service (orchestration) | `server/services` | domain + repositories |
| HTTP (routing, limits, static) | `server/http` | service + domain helpers |

## Consequences
**Good**
- Install is `git clone && node server/index.js`. The Docker image is just `node:22-alpine` plus the source.
- Nothing to audit or patch besides Node itself; no supply-chain exposure at install time.
- The whole backend is small enough to read in an afternoon, which matters for handover between club generations.

**Costs we accept**
- We maintain our own router, rate limiter, static server, CSV escaping, and QR encoder. Each is small and covered by
  tests, but they do not get the battle-testing of Express, `helmet`, or `qrcode`.
- Requires Node >= 22.13 for `node:sqlite` without a flag (22.5 to 22.12 need `--experimental-sqlite`) (still flagged experimental, hence `--no-warnings`). If that API changes, the
  database access is isolated to `server/db.js` and `server/repository/*`.
- No TypeScript, no hot reload, no ORM migrations. Schema changes are `CREATE TABLE IF NOT EXISTS` today; real
  migrations are needed before the first breaking schema change.
- iOS camera scanning would need a vendored library (`jsQR`). That is the first place this rule is likely to bend; if it
  does, vendor the file into `public/` rather than adding a package manager.

## Revisit when
A feature needs something we cannot reasonably own (e.g. email delivery, PDF tickets), or the in-house pieces
become a larger maintenance burden than the dependency they replaced.
