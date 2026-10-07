# Code review triage

An external review ("Request changes") was run on this codebase. Each finding was checked against the actual code instead of accepted at face value.

| # | Finding | Verdict | What was done |
|---|---|---|---|
| 1 | Missing error handling in async ops | **Partly valid** | Server: the single request handler already wraps everything in try/catch (there is no Express middleware to miss). Client: `route()` caught errors, but click-handler promises did not. Added a global `unhandledrejection` handler. |
| 2 | No input boundary validation | **Valid (real bug)** | Body `null` crashed with HTTP 500. Bodies must now be a JSON object (400 otherwise). Name/email/dynamic answers were already validated against `form_schema`. Test added. |
| 3 | Generic variable names | **Not actionable** | No `temp`-style names in `lib.js`; left as is. |
| 4 | Dead / commented-out code | **Not present** | Grep for debug logs, `debugger`, and commented-out blocks found none. |
| 5 | Tight coupling, no repository layer | **Agree, done** | Split into `domain/` (pure rules), `repository/` (SQL), `services/` (orchestration) and `http/` (router, rate limit, static, routes). Routes contain no SQL. See `docs/architecture/`. |
| 6 | SQL injection risk | **Already safe** | Every value is a bound `?` parameter, including LIKE patterns. The one assembled fragment (`w`) is built only from constant strings. Probed with `' OR 1=1--`: returned `[]`. |
| 7 | `.innerHTML` XSS | **Mostly handled, one gap found** | All server data already went through `esc()`; verified in a real browser with `<b>` in a name. Found one unescaped spot (category pill label), fixed. Also removed all inline `onclick` handlers and added a CSP (`script-src 'self'`) as defense in depth. |
| 8 | Unbounded list queries | **Valid** | `/api/events` (default 100, max 200) and organizer participant list (default 500, max 1000) now take `limit`/`offset`. CSV export stays unbounded on purpose. |
| 9 | (unlisted) rate limiting | From our own HANDOFF list | In-memory per-IP limiter on public POSTs (default 30/min, `RATE_LIMIT_PER_MIN`; set `TRUST_PROXY=1` behind a proxy). |

Not a substitute for a real security review before a public launch.
