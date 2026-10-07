// Browser verification for Phase 3C (organizer dashboard + registration management) against the REAL Node server.
// Needs: a server serving web/dist on a freshly seeded database (BASE, default http://localhost:3111) and Playwright.
//   NODE_PATH=<global node_modules> BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3c.mjs
// EMPTY_BASE (optional) is a second server on a brand-new, un-seeded database, used for the true empty states.
// Start the servers with AUTH_FAIL_LIMIT_PER_MIN / ADMIN_RATE_LIMIT_PER_MIN / RATE_LIMIT_PER_MIN raised (the run makes
// deliberate wrong-key calls). Every expectation is read from the API during the run; nothing is hard-coded from the seed.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3111", EMPTY = process.env.EMPTY_BASE || "", SHOTS = process.env.SHOTS || "/tmp/shots", KEY = "demo-organizer-key";
fs.mkdirSync(SHOTS, { recursive: true });

const results = []; let quiet = 0; const consoleErrors = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log("  ok  " + name); }
  catch (e) { results.push([false, name]); console.log("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 5).join("\n      ")); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => assert(a === b, `${m || "expected equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const stamp = Date.now().toString(36);
const adminAt = (base) => async (method, path, body) => {
  const r = await fetch(base + "/api/admin" + path, { method, headers: { "content-type": "application/json", "x-organizer-key": KEY }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`); return j;
};
const admin = adminAt(BASE);
const pub = async (path, body) => { const r = await fetch(BASE + "/api" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); return { status: r.status, body: await r.json().catch(() => null) }; };
const future = (days) => new Date(Date.now() + days * 864e5).toISOString();
const one = async (reg) => (await admin("GET", `/registrations?event=${reg.event_id}&q=${encodeURIComponent(reg.email)}&limit=200`)).items.find((r) => r.id === reg.id);

const browser = await chromium.launch();
const newPage = async (w = 1366, h = 900, { signedIn = true, base = BASE } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  if (signedIn) await ctx.addInitScript((k) => { if (!sessionStorage.getItem("ditc.test-signed-out")) sessionStorage.setItem("ditc.organizerKey", k); }, KEY);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !quiet) consoleErrors.push(`${m.text()} @ ${page.url()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !quiet && !/\/api\//.test(r.url())) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message} @ ${page.url()}`));
  page.base = base;
  return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const text = (loc) => loc.innerText();
const toast = async (page, re) => { await page.waitForFunction((src) => [...document.querySelectorAll(".toast")].some((t) => new RegExp(src, "i").test(t.textContent)), re.source, { timeout: 8000 }); };
const rows = (page) => page.locator("table.reg-table tbody tr");
const settle = (page) => page.waitForFunction(() => !/updating…/.test(document.querySelector('.org-intro [role="status"]')?.textContent || ""));

// ---- fixtures through the real API ----------------------------------------------------------------------------------
const seedEvents = await admin("GET", "/events?limit=500");
const festId = seedEvents[0].fest_id;
const ALL_TYPES = [
  { key: "team", label: "Team name", type: "text", required: true },
  { key: "contact_email", label: "Guardian email", type: "email", required: false },
  { key: "mobile", label: "Mobile number", type: "tel", required: true },
  { key: "members", label: "Number of members", type: "number", required: true },
  { key: "track", label: "Track", type: "select", required: true, options: ["Beginner", "Advanced"] },
  { key: "about", label: "About the project", type: "textarea", required: false },
];
const mkEvent = (title, extra = {}) => admin("POST", "/events", { fest_id: festId, title: `${title} ${stamp}`, category: "Test", description: "Phase 3C browser test", rules: "", venue: "Test Lab", starts_at: future(9), deadline: future(8), capacity: 20, auto_confirm: false, form_schema: ALL_TYPES, ...extra });
const ev = await mkEvent("3C actions");
const tiny = await mkEvent("3C one seat", { capacity: 1, form_schema: [] });
const answersFor = (i) => ({ team: `Team ${i}`, mobile: "01712-345678", members: String(i + 1), track: i % 2 ? "Advanced" : "Beginner", about: `Line one for ${i}\nLine two` });
const register = async (event, i, answers = answersFor(i)) => {
  const email = `p${i}.${stamp}@example.com`, name = `Tester ${i} ${stamp}`;
  const r = await pub(`/events/${event.id}/register`, { name, email, answers }); assert(r.status === 201, "fixture register failed: " + JSON.stringify(r.body));
  return { id: r.body.id, name, email, event_id: event.id };
};
const P = []; for (let i = 0; i < 12; i++) P.push(await register(ev, i));
const tinyA = await register(tiny, 90, {}); await admin("PATCH", `/registrations/${tinyA.id}`, { status: "REJECTED" });
const tinyB = await register(tiny, 91, {});                                  // takes the only seat: the event is now full
const detailUrl = (reg, extra = "") => `${BASE}/organizer/registrations?event=${reg.event_id}${extra}&reg=${reg.id}`;
const openDetail = async (page, reg, extra) => { await page.goto(detailUrl(reg, extra)); await page.waitForSelector(".reg-head"); await page.waitForSelector(".detail-cards dl"); };
const statusOnPage = (page) => text(page.locator(".reg-head-status .badge"));
const buttons = async (page) => (await page.locator(".action-bar button").allInnerTexts()).map((s) => s.trim());

// =====================================================================================================================
console.log("\n[1] Organizer authentication");
let p = await newPage(1366, 900, { signedIn: false });
await check("dashboard is guarded: no key -> sign-in page; nothing organizer-only is requested", async () => {
  const calls = []; p.on("request", (r) => { if (r.url().includes("/api/admin/")) calls.push(r.url()); });
  await p.goto(BASE + "/organizer"); await p.waitForURL(/\/organizer\/login\?next=%2Forganizer$/);
  await p.waitForSelector('input[type="password"]');
  eq(calls.length, 0, "admin API calls before sign-in");
});
await check("wrong key is refused with a clear message; the right key opens the dashboard", async () => {
  quiet++; await p.fill('input[type="password"]', "not-the-key"); await p.click('button[type="submit"]'); await p.waitForSelector("text=wasn't accepted"); quiet--;
  await p.fill('input[type="password"]', KEY); await p.click('button[type="submit"]');
  await p.waitForURL(BASE + "/organizer"); await p.waitForSelector(".stat-grid");
  eq(await text(p.locator(".org-bar h1")), "Dashboard");
});
await check("registrations and events routes are guarded too and return to the page asked for after sign-in", async () => {
  const q = await newPage(1366, 900, { signedIn: false });
  await q.goto(BASE + "/organizer/registrations"); await q.waitForURL(/login\?next=%2Forganizer%2Fregistrations/);
  await q.fill('input[type="password"]', KEY); await q.click('button[type="submit"]'); await q.waitForURL(BASE + "/organizer/registrations"); await q.waitForSelector("table.reg-table");
  await q.context().close();
});

// =====================================================================================================================
console.log("\n[2] Dashboard (GET /admin/stats, /admin/events, /admin/registrations?limit=6)");
p = await newPage();
const stats = await admin("GET", "/stats"), allEvents = await admin("GET", "/events?limit=500");
await check("every statistic equals the backend's numbers", async () => {
  await p.goto(BASE + "/organizer"); await p.waitForSelector(".stat-grid"); await p.waitForSelector(".rows li");
  const tiles = await p.locator(".stat").evaluateAll((els) => Object.fromEntries(els.map((e) => [e.querySelector(".stat-label").textContent.trim(), { value: e.querySelector(".stat-value").textContent.trim(), sub: e.querySelector(".stat-sub")?.textContent.trim() || "", href: e.getAttribute("href") }])));
  const r = stats.registrations;
  eq(tiles["Pending approval"].value, String(r.PENDING)); eq(tiles["Confirmed"].value, String(r.CONFIRMED)); eq(tiles["Checked in"].value, String(r.CHECKED_IN));
  eq(tiles["All registrations"].value, String(r.total)); eq(tiles["All registrations"].sub, `${r.REJECTED} rejected · ${r.CANCELLED} cancelled`);
  eq(tiles["Events"].value, String(stats.events));
  const open = allEvents.filter((e) => !e.archived && e.registration_state === "open").length;
  assert(tiles["Events"].sub.startsWith(`${open} open for registration`), `open events: ${tiles["Events"].sub} vs ${open}`);
  assert(tiles["Events"].sub.includes(`${stats.fests} fests`), "fest count");
  eq(tiles["Seats"].value.replace(/\s+/g, ""), `${stats.seats.taken}/${stats.seats.capacity}`); eq(tiles["Seats"].sub, `${stats.seats.remaining} remaining`);
  eq(tiles["Pending approval"].href, "/organizer/registrations?status=PENDING");
  await shot(p, "3c-dashboard-desktop");
});
await check("recent registrations are the six newest from the API, with their status", async () => {
  const api6 = (await admin("GET", "/registrations?limit=6")).items;
  const names = await p.locator('section[aria-labelledby="recent-h"] .row-title').allInnerTexts();
  eq(JSON.stringify(names), JSON.stringify(api6.map((r) => r.name)));
  const badges = await p.locator('section[aria-labelledby="recent-h"] .badge').allInnerTexts();
  eq(badges.length, 6); assert(badges.every((b) => /Pending|Confirmed|Rejected|Cancelled|Checked in/.test(b)), "status badges");
});
await check("coming up lists the next events that have not started, in the API's order, with seats and state", async () => {
  const want = allEvents.filter((e) => !e.archived && e.registration_state !== "ended").slice(0, 5);
  const sec = p.locator('section[aria-labelledby="next-h"]');
  eq(JSON.stringify(await sec.locator(".row-title").allInnerTexts()), JSON.stringify(want.map((e) => e.title)));
  const meters = await sec.locator(".meter-text").allInnerTexts();
  want.forEach((e, i) => assert(meters[i].startsWith(`${e.taken} of ${e.capacity} seats taken`), `seats for ${e.title}: ${meters[i]}`));
});
await check("pending tile opens the registration list filtered to PENDING; a recent row opens that registration", async () => {
  await p.click(".stat-attn, a.stat >> nth=0"); await p.waitForURL(/registrations\?status=PENDING/); await p.waitForSelector("table.reg-table");
  const badges = await rows(p).locator(".badge").allInnerTexts(); assert(badges.length > 0 && badges.every((b) => b.trim() === "Pending"), "only pending rows");
  await p.goBack(); await p.waitForSelector(".rows li");
  const first = (await admin("GET", "/registrations?limit=6")).items[0];
  await p.click('section[aria-labelledby="recent-h"] .row-title >> nth=0'); await p.waitForSelector(".reg-head");
  eq(await text(p.locator("#reg-name")), first.name); assert(p.url().endsWith(`reg=${first.id}`), "url carries the registration id");
});
await check("dashboard: a failed statistics request shows an error with Try again, which recovers; other panels keep working", async () => {
  quiet++;
  await p.route("**/api/admin/stats", (r) => r.abort());
  await p.goto(BASE + "/organizer"); await p.waitForSelector("text=Unable to connect to the server"); await p.waitForSelector('section[aria-labelledby="recent-h"] .rows li');
  await p.unroute("**/api/admin/stats"); quiet--;
  await p.click('button:has-text("Try again")'); await p.waitForSelector(".stat-grid");
});
await check("dashboard Refresh re-reads all three endpoints", async () => {
  const seen = new Set(); const on = (r) => { const m = r.url().match(/\/api\/admin\/(\w+)/); if (m) seen.add(m[1]); }; p.on("request", on);
  await p.click(".org-intro >> text=Refresh"); await p.waitForFunction(() => /Refresh$/.test(document.querySelector(".org-intro button").textContent.trim()));
  p.off("request", on); eq([...seen].sort().join(), "events,registrations,stats");
});

// =====================================================================================================================
console.log("\n[3] Registration list (GET /admin/registrations: event, status, q, limit, offset)");
const total = (await admin("GET", "/registrations?limit=1")).total;
await check("lists the newest 25 with the real total; Next/Previous page through it and the URL follows", async () => {
  await p.goto(BASE + "/organizer/registrations"); await p.waitForSelector("table.reg-table");
  eq(await rows(p).count(), Math.min(25, total)); assert((await text(p.locator('.org-intro [role="status"]'))).startsWith(`${total} registrations`), "total line");
  assert((await text(p.locator(".pager"))).includes(`Showing 1–25 of ${total} registrations`), "pager summary");
  const firstApi = (await admin("GET", "/registrations?limit=25")).items;
  eq(await text(rows(p).first().locator(".row-title")), firstApi[0].name);
  await p.click(".pager >> text=Next"); await p.waitForURL(/page=2/); await settle(p);
  const page2 = (await admin("GET", "/registrations?limit=25&offset=25")).items;
  await p.waitForFunction((n) => document.querySelectorAll("table.reg-table tbody tr").length === n, page2.length);
  // (3G) page 1 and page 2 can both hold 25 rows, so the count alone does not prove the new page has rendered: the old rows
  // stay for a few milliseconds after the address changes. Wait for the first row to change, then assert it as before.
  await p.waitForFunction((n) => document.querySelector("table.reg-table tbody tr .row-title")?.textContent !== n, firstApi[0].name);
  eq(await text(rows(p).first().locator(".row-title")), page2[0].name);
  await p.goBack(); await p.waitForFunction(() => !location.search.includes("page=")); await settle(p);
  await p.waitForFunction((n) => document.querySelector("table.reg-table tbody tr .row-title")?.textContent === n, firstApi[0].name);
  await shot(p, "3c-registrations-desktop");
});
await check("search by name and by email goes to the API (debounced) and is kept in the URL", async () => {
  const term = P[3].email;
  await p.fill('input[type="search"]', term); await p.waitForURL((u) => u.searchParams.get("q") === term); await settle(p);
  await p.waitForFunction(() => document.querySelectorAll("table.reg-table tbody tr").length === 1);
  eq(await text(rows(p).first().locator(".row-title")), P[3].name);
  await p.fill('input[type="search"]', `Tester 1 ${stamp}`.slice(0, 8)); await p.waitForURL((u) => u.searchParams.get("q") === "Tester 1"); await settle(p);
  const want = (await admin("GET", "/registrations?q=Tester%201&limit=25")).total;
  await p.waitForFunction((n) => document.querySelector('.org-intro [role="status"]').textContent.startsWith(`${n} registration`), want);
  assert(want >= 3, "Tester 1, 10, 11 expected");
});
await check("no-match state explains itself; Clear filters restores the list and empties the box", async () => {
  await p.fill('input[type="search"]', "zzzz-nobody"); await p.waitForSelector("text=No registrations match");
  await p.click(".state >> text=Clear filters"); await p.waitForSelector("table.reg-table"); eq(await p.inputValue('input[type="search"]'), "");
  await p.waitForFunction((n) => document.querySelector('.org-intro [role="status"]').textContent.startsWith(`${n} registrations`), total);
});
await check("event filter (options from /admin/events, grouped by fest) shows only that event", async () => {
  assert(await p.locator("select optgroup").count() > 1, "events are grouped by fest");
  await p.selectOption("select", String(ev.id)); await p.waitForURL(new RegExp(`event=${ev.id}`)); await settle(p);
  await p.waitForFunction((n) => document.querySelectorAll("table.reg-table tbody tr").length === n, P.length);
  const titles = await rows(p).locator('td[data-label="Event"]').allInnerTexts(); assert(titles.every((t) => t.includes(ev.title)), "all rows are the chosen event");
});
await check("status chips filter by the backend's status values; counts agree with /admin/stats", async () => {
  await p.goto(BASE + "/organizer/registrations"); await p.waitForSelector("table.reg-table");
  const fresh = (await admin("GET", "/stats")).registrations;
  for (const [label, key] of [["Pending", "PENDING"], ["Confirmed", "CONFIRMED"], ["Checked in", "CHECKED_IN"], ["Rejected", "REJECTED"], ["Cancelled", "CANCELLED"]]) {
    await p.click(`.chip:text-is("${label}")`); await p.waitForURL(new RegExp(`status=${key}`)); await settle(p);
    await p.waitForFunction((n) => new RegExp(`^${n} registrations? match`).test(document.querySelector('.org-intro [role="status"]').textContent), fresh[key]);
    const badges = await rows(p).locator('td[data-label="Status"] .badge').allInnerTexts(); assert(badges.every((b) => b.trim() === label), `${label}: only ${label} rows, got ${[...new Set(badges)]}`);
    eq(await p.locator(`.chip:text-is("${label}")`).getAttribute("aria-pressed"), "true");
  }
  await p.click('.chip:text-is("All")'); await p.waitForFunction(() => !location.search.includes("status="));
});
await check("combined filters deep-link: status + event + search restore from the URL after a reload", async () => {
  await p.goto(`${BASE}/organizer/registrations?status=PENDING&event=${ev.id}&q=${encodeURIComponent("Tester 1")}`); await p.waitForSelector("table.reg-table");
  const want = (await admin("GET", `/registrations?status=PENDING&event=${ev.id}&q=Tester%201`)).total;
  eq(await rows(p).count(), want); eq(await p.inputValue('input[type="search"]'), "Tester 1"); eq(await p.inputValue("select"), String(ev.id));
  eq(await p.locator('.chip:text-is("Pending")').getAttribute("aria-pressed"), "true");
});
await check("hand-edited URLs are safe: unknown status is ignored, a page past the end snaps to the last page", async () => {
  await p.goto(BASE + "/organizer/registrations?status=BOGUS&event=abc&page=999"); await p.waitForSelector("table.reg-table");
  const t = (await admin("GET", "/registrations?limit=1")).total, last = Math.ceil(t / 25);
  await p.waitForURL(new RegExp(`page=${last}\\b`)); await settle(p);
  await p.waitForFunction((n) => document.querySelectorAll("table.reg-table tbody tr").length === n, t - (last - 1) * 25);
});
await check("CSV export appears only with an event filter and downloads the server's file unchanged", async () => {
  await p.goto(BASE + "/organizer/registrations"); await p.waitForSelector("table.reg-table"); eq(await p.locator("text=Export this event").count(), 0);
  await p.goto(`${BASE}/organizer/registrations?event=${ev.id}`); await p.waitForSelector("table.reg-table");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("text=Export this event (CSV)")]);
  const got = fs.readFileSync(await dl.path(), "utf8");
  const want = await (await fetch(`${BASE}/api/admin/events/${ev.id}/export.csv`, { headers: { "x-organizer-key": KEY } })).text();
  eq(got, want, "csv body"); eq(dl.suggestedFilename(), `event-${ev.id}-participants.csv`);
  assert(got.split("\n")[0].includes("Team name") && got.includes(P[0].email), "dynamic answer columns + participant present");
});

// =====================================================================================================================
console.log("\n[4] Registration detail");
await check("opening a row shows participant, registration, event and status exactly as the API returns them", async () => {
  await p.goto(`${BASE}/organizer/registrations?event=${ev.id}`); await p.waitForSelector("table.reg-table");
  await p.click(`a.row-title:text-is("${P[2].name}")`); await p.waitForSelector(".reg-head"); await p.waitForSelector('section[aria-labelledby="e-h"] dl');
  const row = await one(P[2]), e = await admin("GET", `/events/${ev.id}`);
  eq(await text(p.locator("#reg-name")), row.name); eq((await text(p.locator(".reg-eyebrow"))).toUpperCase(), `REGISTRATION #${row.id}`);
  eq((await statusOnPage(p)).trim(), "Pending");
  const part = await text(p.locator('section[aria-labelledby="p-h"]')); assert(part.includes(row.name) && part.includes(row.email), "participant card");
  eq(await p.locator(`a[href="mailto:${row.email}"]`).count(), 1);
  const regCard = await text(p.locator('section[aria-labelledby="r-h"]'));
  assert(regCard.includes(`#${row.id}`) && regCard.includes("Pending") && regCard.includes("No pass issued") && regCard.includes("Not checked in"), "registration card: " + regCard);
  const evCard = await text(p.locator('section[aria-labelledby="e-h"]'));
  assert(evCard.includes(e.title) && evCard.includes(e.venue) && evCard.includes(e.club_name) && evCard.includes(e.fest_name), "event card");
  assert(evCard.includes(`${e.taken} of ${e.capacity} seats taken`) && evCard.includes("Registrations need approval"), "seats + approval mode: " + evCard);
  await shot(p, "3c-detail-desktop");
});
await check("submitted answers are dynamic: every field type, in the event's form order, with its real label; blanks omitted", async () => {
  const labels = await p.locator('section[aria-labelledby="a-h"] dt').allInnerTexts(), values = await p.locator('section[aria-labelledby="a-h"] dd').allInnerTexts();
  eq(JSON.stringify(labels.map((l) => l.toLowerCase())), JSON.stringify(["team name", "mobile number", "number of members", "track", "about the project"]));   // "Guardian email" was left blank
  const a = answersFor(2); eq(values[0], a.team); eq(values[1], a.mobile); eq(values[2], a.members); eq(values[3], a.track); eq(values[4], a.about, "multi-line answer keeps its line break");
});
await check("an event with no extra questions says so instead of showing an empty box", async () => {
  await openDetail(p, tinyB); await p.waitForSelector("text=no extra questions");
});
await check("Back to registrations keeps the filters; browser Back/Forward move between list and detail", async () => {
  await p.goto(`${BASE}/organizer/registrations?event=${ev.id}&status=PENDING`); await p.waitForSelector("table.reg-table");
  await p.click(`a.row-title:text-is("${P[2].name}")`); await p.waitForSelector(".reg-head");
  await p.waitForFunction(() => window.scrollY === 0);                         // the detail opens at the top (smooth scroll may take a moment)
  assert(await p.evaluate(() => document.activeElement.id === "main"), "focus moves to the content");
  await p.click("text=Back to registrations"); await p.waitForSelector("table.reg-table");
  assert(p.url().includes(`event=${ev.id}`) && p.url().includes("status=PENDING") && !p.url().includes("reg="), "filters kept: " + p.url());
  await p.goBack(); await p.waitForSelector(".reg-head"); await p.goBack(); await p.waitForSelector("table.reg-table"); await p.goForward(); await p.waitForSelector(".reg-head");
});
await check("a detail URL survives a reload; an unknown registration id explains itself without an error", async () => {
  await p.reload(); await p.waitForSelector(".reg-head"); eq(await text(p.locator("#reg-name")), P[2].name);
  await p.goto(BASE + "/organizer/registrations?reg=99999999"); await p.waitForSelector("text=Registration #99999999 isn't in these results");
  await p.click("text=Show all registrations"); await p.waitForSelector("table.reg-table"); eq(new URL(p.url()).search, "");
});

// =====================================================================================================================
console.log("\n[5] Actions (PATCH /admin/registrations/:id, POST /admin/registrations/:id/check-in)");
await check("actions offered match the status: PENDING -> Approve / Reject / Cancel registration", async () => {
  await openDetail(p, P[0]); eq((await buttons(p)).join("|"), "Approve|Reject|Cancel registration");
});
await check("approve from the list: one request, success toast, row turns Confirmed, backend issued the pass", async () => {
  await p.goto(`${BASE}/organizer/registrations?event=${ev.id}`); await p.waitForSelector("table.reg-table");
  let patches = 0; const on = (r) => { if (r.method() === "PATCH") patches++; }; p.on("request", on);
  const btn = p.locator(`button[aria-label="Approve ${P[1].name}"]`);
  await btn.dblclick();                                              // double click must not send two requests
  await toast(p, /Registration approved/);
  const row = rows(p).filter({ hasText: P[1].name });
  await p.waitForFunction((n) => [...document.querySelectorAll("table.reg-table tbody tr")].find((tr) => tr.textContent.includes(n))?.querySelector(".badge")?.textContent.trim() === "Confirmed", P[1].name);
  eq(await row.locator('button:has-text("Approve")').count(), 0, "Approve is gone for a confirmed row");
  p.off("request", on); eq(patches, 1, "PATCH requests sent");
  const api = await one(P[1]); eq(api.status, "CONFIRMED"); eq(api.pass_status, "ISSUED");
});
await check("approve from the detail of a PENDING-filtered list: detail shows the server's new state although the row left the list", async () => {
  await openDetail(p, P[0], "&status=PENDING");
  await p.click('.action-bar >> text="Approve"'); await toast(p, /Registration approved/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Confirmed");
  await p.waitForFunction(() => document.querySelector('section[aria-labelledby="r-h"]').textContent.includes("Issued, valid for entry"));
  eq((await buttons(p)).join("|"), "Check in|Reject|Cancel registration");
  eq((await one(P[0])).status, "CONFIRMED");
  await p.click("text=Back to registrations"); await p.waitForSelector("table.reg-table, .state"); await settle(p);
  eq(await p.locator(`a.row-title:text-is("${P[0].name}")`).count(), 0, "approved registration is no longer in the pending list");
});
await check("reject asks first: 'Keep as it is' and Esc change nothing; confirming rejects, revokes the pass and frees the seat", async () => {
  await openDetail(p, P[0]);
  const before = (await admin("GET", `/events/${ev.id}`)).taken;
  await p.click('.action-bar >> text="Reject"'); const dlg = p.locator("dialog[open]"); await dlg.waitFor();
  assert((await text(dlg)).includes(P[0].name) && (await text(dlg)).includes("Reject this registration?"), "dialog names the participant");
  await dlg.locator("text=Keep as it is").click(); await p.waitForSelector("dialog[open]", { state: "detached" }); eq((await one(P[0])).status, "CONFIRMED");
  await p.click('.action-bar >> text="Reject"'); await p.locator("dialog[open]").waitFor(); await p.keyboard.press("Escape"); await p.waitForSelector("dialog[open]", { state: "detached" }); eq((await one(P[0])).status, "CONFIRMED");
  assert(await p.evaluate(() => document.activeElement?.textContent.includes("Reject")), "focus returns to the Reject button");
  await p.click('.action-bar >> text="Reject"'); await p.locator("dialog[open]").waitFor(); await shot(p, "3c-confirm-dialog");
  await p.click('dialog[open] >> text="Yes, reject"'); await toast(p, /Registration rejected/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Rejected");
  await p.waitForFunction(() => document.querySelector('section[aria-labelledby="r-h"]').textContent.includes("Revoked"));
  const api = await one(P[0]); eq(api.status, "REJECTED"); eq(api.pass_status, "REVOKED");
  await p.waitForFunction((n) => document.querySelector('section[aria-labelledby="e-h"] .meter-text')?.textContent.startsWith(`${n} of`), before - 1);
  eq((await buttons(p)).join("|"), "Approve after all");
});
await check("approve after all (REJECTED -> CONFIRMED) reinstates the pass", async () => {
  await p.click('.action-bar >> text="Approve after all"'); await toast(p, /Registration approved/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Confirmed");
  const api = await one(P[0]); eq(api.status, "CONFIRMED"); eq(api.pass_status, "ISSUED");
});
await check("backend refusal is shown, not hidden: approving a rejected registration when the event is full", async () => {
  await openDetail(p, tinyA); eq((await statusOnPage(p)).trim(), "Rejected");
  quiet++; await p.click('.action-bar >> text="Approve after all"'); await toast(p, /This event is full/); quiet--;
  eq((await one(tinyA)).status, "REJECTED"); eq((await statusOnPage(p)).trim(), "Rejected");
});
await check("check in asks first, then marks CHECKED_IN with a time; a checked-in registration has no further actions", async () => {
  await openDetail(p, P[0]);
  await p.click('.action-bar >> text="Check in"'); await p.locator("dialog[open]").waitFor(); assert((await text(p.locator("dialog[open]"))).includes("can't be undone"), "warns it is final");
  await p.click('dialog[open] >> text="Yes, check in"'); await toast(p, /checked in/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Checked in");
  const api = await one(P[0]); eq(api.status, "CHECKED_IN"); eq(api.pass_status, "CHECKED_IN"); assert(api.checked_in_at, "checked_in_at set");
  const card = await text(p.locator('section[aria-labelledby="r-h"]')); assert(card.includes("Used at check-in") && !card.includes("Not checked in"), "pass + check-in time shown: " + card);
  eq(await p.locator(".action-bar button").count(), 0); assert((await text(p.locator(".action-bar"))).includes("No further actions"), "says it is final");
});
await check("cancel asks first, then cancels for good: seat freed, no actions left, same email can register again", async () => {
  await openDetail(p, P[4]);
  await p.click('.action-bar >> text="Cancel registration"'); await p.locator("dialog[open]").waitFor();
  await p.click('dialog[open] >> text="Yes, cancel it"'); await toast(p, /Registration cancelled/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Cancelled");
  eq((await one(P[4])).status, "CANCELLED"); eq(await p.locator(".action-bar button").count(), 0);
  const again = await pub(`/events/${ev.id}/register`, { name: P[4].name, email: P[4].email, answers: answersFor(4) }); eq(again.status, 201, "re-registration after cancel");
});
await check("stale screen, direct action: the registration changed elsewhere -> server message shown and the page re-reads", async () => {
  await openDetail(p, P[5]); eq((await statusOnPage(p)).trim(), "Pending");
  await admin("PATCH", `/registrations/${P[5].id}`, { status: "CANCELLED" });               // another organizer, another tab
  quiet++; await p.click('.action-bar >> text="Approve"'); await toast(p, /can't be changed to confirmed/); quiet--;
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Cancelled");
  eq(await p.locator(".action-bar button").count(), 0);
});
await check("stale screen, confirmed action: the dialog shows the refusal and the detail behind it is refreshed", async () => {
  await openDetail(p, P[6]);
  await admin("PATCH", `/registrations/${P[6].id}`, { status: "REJECTED" });
  await p.click('.action-bar >> text="Cancel registration"'); await p.locator("dialog[open]").waitFor();
  quiet++; await p.click('dialog[open] >> text="Yes, cancel it"'); await p.waitForSelector("dialog[open] .alert-bad"); quiet--;
  assert((await text(p.locator("dialog[open] .alert-bad"))).includes("can't be changed to cancelled"), "server message in the dialog");
  await p.click('dialog[open] >> text="Keep as it is"');
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Rejected");
  eq((await one(P[6])).status, "REJECTED");
});
await check("network failure during an action: friendly message, nothing changed, retry works", async () => {
  await openDetail(p, P[7]);
  quiet++; await p.route("**/api/admin/registrations/*", (r) => (r.request().method() === "PATCH" ? r.abort() : r.continue()));
  await p.click('.action-bar >> text="Approve"'); await toast(p, /Unable to connect to the server/);
  await p.unroute("**/api/admin/registrations/*"); quiet--;
  eq((await one(P[7])).status, "PENDING"); eq((await statusOnPage(p)).trim(), "Pending");
  await p.waitForFunction(() => !document.querySelector(".action-bar button").disabled);
  await p.click('.action-bar >> text="Approve"'); await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Confirmed");
});
await check("detail Refresh picks up a change made elsewhere", async () => {
  await openDetail(p, P[8]); await admin("PATCH", `/registrations/${P[8].id}`, { status: "CONFIRMED" });
  await p.click(".org-intro >> text=Refresh"); await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Confirmed");
});

// =====================================================================================================================
console.log("\n[6] Unauthorized, server errors, timeout, stale list");
await check("session expiry while reading: a rejected key sends the organizer to sign-in with an explanation", async () => {
  const q = await newPage(); await q.goto(BASE + "/organizer/registrations"); await q.waitForSelector("table.reg-table");
  await q.evaluate(() => { sessionStorage.setItem("ditc.test-signed-out", "1"); sessionStorage.setItem("ditc.organizerKey", "rotated-away"); });
  quiet++; await q.click(".org-intro >> text=Refresh"); await q.waitForURL(/\/organizer\/login\?expired=1/); await q.waitForSelector("text=session has expired"); await q.waitForTimeout(500); quiet--;
  eq(await q.evaluate(() => sessionStorage.getItem("ditc.organizerKey")), null, "bad key cleared");
  await q.context().close();
});
await check("session expiry during an action: redirected to sign-in, nothing changed, no stray error toast", async () => {
  const q = await newPage(); await openDetail(q, P[9]);
  await q.evaluate(() => { sessionStorage.setItem("ditc.test-signed-out", "1"); sessionStorage.setItem("ditc.organizerKey", "rotated-away"); });
  quiet++; await q.click('.action-bar >> text="Approve"'); await q.waitForURL(/\/organizer\/login\?expired=1/); await q.waitForTimeout(500); quiet--;   // sibling requests may still be answering 401
  eq(await q.locator(".toast-bad").count(), 0); eq((await one(P[9])).status, "PENDING");
  await q.context().close();
});
await check("session expiry on the dashboard too", async () => {
  const q = await newPage(); await q.goto(BASE + "/organizer"); await q.waitForSelector(".stat-grid");
  await q.evaluate(() => { sessionStorage.setItem("ditc.test-signed-out", "1"); sessionStorage.setItem("ditc.organizerKey", "rotated-away"); });
  quiet++; await q.click(".org-intro >> text=Refresh"); await q.waitForURL(/\/organizer\/login\?expired=1/); await q.waitForTimeout(500); quiet--;   // sibling requests may still be answering 401
  await q.context().close();
});
await check("list: network failure -> error state with Try again -> recovers", async () => {
  quiet++; await p.route("**/api/admin/registrations?*", (r) => r.abort());
  await p.goto(BASE + "/organizer/registrations?status=CONFIRMED"); await p.waitForSelector("text=Unable to connect to the server");
  await p.unroute("**/api/admin/registrations?*"); quiet--;
  await p.click('button:has-text("Try again")'); await p.waitForSelector("table.reg-table");
});
await check("list: a failed refresh keeps the rows on screen and says they may be out of date", async () => {
  const n = await rows(p).count();
  quiet++; await p.route("**/api/admin/registrations?*", (r) => r.abort());
  await p.click(".org-intro >> text=Refresh"); await p.waitForSelector("text=couldn't be refreshed"); eq(await rows(p).count(), n);
  await p.unroute("**/api/admin/registrations?*"); quiet--;
  await p.click(".alert button"); await p.waitForSelector("text=couldn't be refreshed", { state: "detached" });
});
await check("server error (500) and rate limit (429) show the API's person-safe message with a retry", async () => {
  quiet++;
  await p.route("**/api/admin/registrations?*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal_error", message: "Something went wrong on our side. Please try again." }) }));
  await p.goto(BASE + "/organizer/registrations"); await p.waitForSelector("text=Something went wrong on our side"); assert(await p.locator('button:has-text("Try again")').count() > 0, "retry offered");
  await p.unroute("**/api/admin/registrations?*");
  await p.route("**/api/admin/stats", (r) => r.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "30" }, body: JSON.stringify({ error: "rate_limited", message: "Too many requests. Try again in a minute." }) }));
  await p.goto(BASE + "/organizer"); await p.waitForSelector("text=Too many requests");
  await p.unroute("**/api/admin/stats"); quiet--;
  await p.click('button:has-text("Try again")'); await p.waitForSelector(".stat-grid");
});
await check("timeout uses the existing handling: a slow answer becomes 'took too long', then recovers", async () => {
  const q = await newPage(); await q.addInitScript(() => localStorage.setItem("ditc.apiTimeoutMs", "400"));
  quiet++; await q.route("**/api/admin/registrations?*", async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); r.continue().catch(() => {}); });
  await q.goto(BASE + "/organizer/registrations"); await q.waitForSelector("text=took too long to respond");
  await q.unroute("**/api/admin/registrations?*"); quiet--;
  await q.click('button:has-text("Try again")'); await q.waitForSelector("table.reg-table"); await q.context().close();
});
await check("race: a slow answer for an old filter never overwrites the newer one", async () => {
  const q = await newPage();
  await q.route("**/api/admin/registrations?*status=REJECTED*", async (r) => { await new Promise((ok) => setTimeout(ok, 1200)); r.continue().catch(() => {}); });
  await q.goto(BASE + "/organizer/registrations?status=REJECTED");
  await q.waitForSelector('.chip:text-is("Cancelled")'); await q.click('.chip:text-is("Cancelled")'); await q.waitForSelector("table.reg-table");
  await q.waitForTimeout(1600);
  const badges = await rows(q).locator('td[data-label="Status"] .badge').allInnerTexts(); assert(badges.length > 0 && badges.every((b) => b.trim() === "Cancelled"), "still the Cancelled list: " + [...new Set(badges)]);
  await q.context().close();
});

// =====================================================================================================================
console.log("\n[7] Organizer events overview (GET /admin/events)");
await check("lists every event the admin API returns with state and seats; links to that event's registrations", async () => {
  const fresh = await admin("GET", "/events?limit=500");
  await p.goto(BASE + "/organizer/events"); await p.waitForSelector("table.reg-table"); eq(await rows(p).count(), fresh.length);
  const row = rows(p).filter({ hasText: ev.title }); const e = fresh.find((x) => x.id === ev.id);
  assert((await text(row)).includes(`${e.taken} of ${e.capacity} seats taken`) && (await text(row)).includes("Needs approval"), "seats + approval mode: " + await text(row));
  await shot(p, "3c-events-desktop");
  await row.getByRole("link", { name: `Registrations for ${ev.title}` }).click(); await p.waitForURL(new RegExp(`registrations\\?event=${ev.id}`)); await p.waitForSelector("table.reg-table");   // since Phase 3E the title opens the event's management page
});
await check("search goes to the API; state chips use registration_state; archived events are labelled", async () => {
  const arch = await mkEvent("3C archived", { form_schema: [] }); await admin("POST", `/events/${arch.id}/archive`);
  await p.goto(BASE + "/organizer/events"); await p.waitForSelector("table.reg-table");
  await p.fill('input[type="search"]', `3C one seat ${stamp}`); await p.waitForFunction(() => document.querySelectorAll("table.reg-table tbody tr").length === 1);
  assert((await text(rows(p).first())).includes("Full"), "one-seat event is Full");
  await p.fill('input[type="search"]', ""); await p.waitForFunction(() => document.querySelectorAll("table.reg-table tbody tr").length > 5);
  await p.click('.chip:has-text("Archived")'); await p.waitForURL(/state=archived/);
  const t = await rows(p).allInnerTexts(); assert(t.length >= 1 && t.every((x) => x.includes("Archived")) && t.some((x) => x.includes(arch.title)), "archived rows");
  await admin("DELETE", `/events/${arch.id}`);
});

// =====================================================================================================================
console.log("\n[8] Responsive: 320 / 375 / 768 / 1024 / 1440");
const ORG_ROUTES = ["/organizer", "/organizer/registrations", `/organizer/registrations?event=${ev.id}&status=CONFIRMED`, `/organizer/registrations?event=${ev.id}&reg=${P[0].id}`, "/organizer/events", "/organizer/volunteers", "/organizer/check-in"];
for (const w of [320, 375, 768, 1024, 1440]) {
  const q = await newPage(w, 800);
  await check(`${w}px: no horizontal overflow on ${ORG_ROUTES.length} organizer routes; nothing wider than the screen; one h1 each`, async () => {
    const bad = [];
    for (const r of ORG_ROUTES) {
      await q.goto(BASE + r); await q.waitForSelector(".org-main"); await q.waitForLoadState("networkidle"); await q.waitForTimeout(200);
      const res = await q.evaluate(() => {
        const out = [], vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
        for (const el of document.querySelectorAll(".org-main *")) { const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1) && !el.closest(".sr-only") && !el.closest("thead")) { out.push(`${el.tagName}.${el.className} sticks out (${Math.round(b.left)}..${Math.round(b.right)})`); break; } }
        const h1 = document.querySelectorAll("h1").length; if (h1 !== 1) out.push(`${h1} h1 elements`);
        return out;
      });
      if (res.length) bad.push(`${r}: ${res.join("; ")}`);
    }
    assert(!bad.length, bad.join("\n      "));
    await q.goto(BASE + "/organizer"); await q.waitForSelector(".stat-grid"); await q.waitForLoadState("networkidle"); await shot(q, `3c-dashboard-${w}`);
    await q.goto(BASE + "/organizer/registrations"); await q.waitForSelector("table.reg-table"); await shot(q, `3c-registrations-${w}`);
    await openDetail(q, P[0]); await shot(q, `3c-detail-${w}`);
  });
  await check(`${w}px: ${w >= 1024 ? "sidebar navigation is visible" : "navigation is in the drawer (opens, lists every section, Esc closes)"}; the list is ${w >= 1240 ? "a table" : "stacked cards"}`, async () => {
    await q.goto(BASE + "/organizer/registrations"); await q.waitForSelector("table.reg-table");
    const side = await q.locator(".org-side").isVisible(); eq(side, w >= 1024, "sidebar visible");
    if (w < 1024) {
      await q.click('button[aria-label="Open organizer menu"]'); const d = q.locator("dialog[open]"); await d.waitFor();
      for (const l of ["Dashboard", "Events", "Registrations", "Volunteers", "Check-in", "Sign out"]) assert(await d.locator(`text=${l}`).count() > 0, `${l} in drawer`);
      eq(await d.locator('a[aria-current="page"]').innerText(), "Registrations");
      await q.keyboard.press("Escape"); await q.waitForSelector("dialog[open]", { state: "detached" });
    } else eq(await q.locator('.org-side a[aria-current="page"]').innerText(), "Registrations");
    const display = await q.locator("table.reg-table").evaluate((t) => getComputedStyle(t).display); eq(display, w >= 1240 ? "table" : "block");
    const firstRow = await rows(q).first().boundingBox(); assert(firstRow.width <= w, "row fits the screen");
  });
  if (w <= 375) await check(`${w}px: the confirmation dialog fits the screen and its buttons are reachable`, async () => {
    await openDetail(q, P[8]); await q.click('.action-bar >> text="Reject"'); const d = q.locator("dialog[open]"); await d.waitFor(); await q.waitForTimeout(300);
    const b = await d.boundingBox(); assert(b.x >= 0 && b.x + b.width <= w && b.y >= 0 && b.y + b.height <= 800, `dialog box ${JSON.stringify(b)}`);
    for (const t of ["Keep as it is", "Yes, reject"]) { const bb = await d.locator(`text="${t}"`).boundingBox(); assert(bb && bb.x >= 0 && bb.x + bb.width <= w && bb.height >= 44, `${t} button ${JSON.stringify(bb)}`); }
    await shot(q, `3c-confirm-${w}`); await d.locator("text=Keep as it is").click();
  });
  await q.context().close();
}

// =====================================================================================================================
console.log("\n[9] Accessibility spot checks");
await check("filters are labelled; chips expose pressed state; status is text + icon, not colour alone; row buttons name the participant", async () => {
  await p.goto(`${BASE}/organizer/registrations?event=${ev.id}`); await p.waitForSelector("table.reg-table");
  const unlabelled = await p.evaluate(() => [...document.querySelectorAll(".org-main input, .org-main select, .org-main textarea")].filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label")).length); eq(unlabelled, 0);
  assert(await p.locator(".chip[aria-pressed]").count() >= 6, "chips have aria-pressed");
  assert(await p.locator('td[data-label="Status"] .badge svg').count() > 0, "badge has an icon"); assert((await text(p.locator('td[data-label="Status"] .badge').first())).trim().length > 0, "badge has text");
  const names = await p.locator('td[data-label="Actions"] a, td[data-label="Actions"] button').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
  assert(names.every((n) => /Tester \d+/.test(n)), "action labels include the participant: " + names.slice(0, 3));
  eq(await p.locator("table.reg-table th[scope=col]").count(), 5);
});
await check("keyboard: a registration can be opened and rejected without a mouse; focus is trapped in the dialog", async () => {
  await p.goto(`${BASE}/organizer/registrations?event=${ev.id}&status=PENDING`); await p.waitForSelector("table.reg-table");
  await rows(p).first().locator(".row-title").focus(); await p.keyboard.press("Enter"); await p.waitForSelector(".reg-head");
  const id = Number(new URL(p.url()).searchParams.get("reg")), reg = (await admin("GET", `/registrations?event=${ev.id}&limit=200`)).items.find((r) => r.id === id);
  await p.locator('.action-bar >> text="Reject"').focus(); await p.keyboard.press("Enter"); await p.locator("dialog[open]").waitFor();
  for (let i = 0; i < 6; i++) { await p.keyboard.press("Tab"); // a native modal dialog cycles focus through the dialog and the browser's own UI (seen as <body>), never the page behind it
    assert(await p.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest("dialog[open]")), "focus reached the page behind the dialog"); }
  await p.locator('dialog[open] >> text="Yes, reject"').focus(); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Rejected"); eq((await one(reg)).status, "REJECTED");
});

// =====================================================================================================================
if (EMPTY) {
  console.log("\n[10] True empty states (second server, brand-new database)");
  const q = await newPage(1366, 900, { base: EMPTY });
  await check("empty backend: dashboard shows zeros and explains the empty panels", async () => {
    const s = await adminAt(EMPTY)("GET", "/stats"); eq(s.registrations.total, 0); eq(s.events, 0);
    await q.goto(EMPTY + "/organizer"); await q.waitForSelector(".stat-grid");
    const values = await q.locator(".stat-value").allInnerTexts(); eq(values.slice(0, 5).join(), "0,0,0,0,0");
    await q.waitForSelector("text=No registrations yet"); await q.waitForSelector("text=No upcoming events"); await q.waitForSelector("text=Nothing waiting");
    await shot(q, "3c-dashboard-empty");
  });
  await check("empty backend: registrations and events pages show their empty states, no table, no pager", async () => {
    await q.goto(EMPTY + "/organizer/registrations"); await q.waitForSelector("text=No registrations yet"); eq(await q.locator("table").count(), 0); eq(await q.locator(".pager").count(), 0);
    await q.goto(EMPTY + "/organizer/events"); await q.waitForSelector("text=No events yet");
  });
  await q.context().close();
}

console.log("\n[11] Console");
await check("no Content-Security-Policy violations, page errors or failed assets in any flow above", async () => { assert(consoleErrors.length === 0, consoleErrors.slice(0, 8).join("\n      ")); });

await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
