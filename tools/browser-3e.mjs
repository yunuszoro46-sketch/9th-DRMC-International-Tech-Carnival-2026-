// Browser verification for Phase 3E (event & fest management) against the REAL Node server.
// Needs: a server serving web/dist on a freshly seeded database (BASE, default http://localhost:3111) and Playwright.
//   NODE_PATH=<global node_modules> BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3e.mjs
// EMPTY_BASE (optional): a second server on a brand-new, un-seeded database, for the true empty states.
// Raise ADMIN_RATE_LIMIT_PER_MIN / RATE_LIMIT_PER_MIN / AUTH_FAIL_LIMIT_PER_MIN on both. Everything created here is made
// through the UI or the real API, and every result is read back from the API.
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
const rawAdmin = async (method, path, body) => { const r = await fetch(BASE + "/api/admin" + path, { method, headers: { "content-type": "application/json", "x-organizer-key": KEY }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const admin = async (method, path, body) => { const r = await rawAdmin(method, path, body); if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
const pub = async (path, body) => { const r = await fetch(BASE + "/api" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); return { status: r.status, body: await r.json().catch(() => null) }; };
const future = (days) => new Date(Date.now() + days * 864e5).toISOString();

const browser = await chromium.launch();
const newPage = async (w = 1366, h = 900, { signedIn = true } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  if (signedIn) await ctx.addInitScript((k) => { if (!sessionStorage.getItem("ditc.test-signed-out")) sessionStorage.setItem("ditc.organizerKey", k); }, KEY);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !quiet) consoleErrors.push(`${m.text()} @ ${page.url()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !quiet && !/\/api\//.test(r.url())) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message} @ ${page.url()}`));
  return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const text = (loc) => loc.innerText();
const toast = (page, re) => page.waitForFunction((src) => [...document.querySelectorAll(".toast")].some((t) => new RegExp(src, "i").test(t.textContent)), re.source, { timeout: 8000 });
const rows = (page) => page.locator("table.reg-table tbody tr");
const rowCount = (page, n) => page.waitForFunction((want) => document.querySelectorAll("table.reg-table tbody tr").length === want, n);
const errorsShown = (page) => page.$$eval('[aria-invalid="true"]', (els) => els.map((e) => e.getAttribute("name") || e.closest(".field")?.querySelector("label")?.textContent.replace(/\s*\*.*$/, "").trim()));
const fieldError = (page, name) => page.locator(`.field:has([name="${name}"]) .field-error`).innerText();
const act = (page, label) => page.locator(".action-bar").getByText(label, { exact: true }).click();
const dialog = (page) => page.locator("dialog[open]");
const seededEvents = await admin("GET", "/events?limit=500"), seededFests = await admin("GET", "/fests"), clubs = (await pub("/clubs")).body;
const club = clubs[0];

// =====================================================================================================================
console.log("\n[1] Navigation and access");
let p = await newPage();
await check("sidebar lists Fests next to Events; the tabs switch between the two lists and mark the current one", async () => {
  await p.goto(BASE + "/organizer/events"); await p.waitForSelector("table.reg-table");
  eq((await p.locator(".org-side .org-nav a").allInnerTexts()).join("|"), "Dashboard|Events|Fests|Registrations|Volunteers|Check-in");
  eq(await p.locator('.org-tabs a[aria-current="page"]').innerText(), "All events");
  await p.click('.org-tabs >> text="Fests"'); await p.waitForURL(BASE + "/organizer/fests"); await p.waitForSelector("table.reg-table");
  eq(await p.locator('.org-tabs a[aria-current="page"]').innerText(), "Fests"); eq(await p.locator('.org-side a[aria-current="page"]').innerText(), "Fests"); eq(await text(p.locator(".org-bar h1")), "Fests");
  await p.click('text="Manage fests" >> visible=true').catch(() => {});
});
await check("every new route is behind organizer sign-in and asks nothing of the API before it; a non-numeric id is a plain 404", async () => {
  const q = await newPage(1366, 900, { signedIn: false }); const calls = []; q.on("request", (r) => { if (r.url().includes("/api/admin/")) calls.push(r.url()); });
  for (const r of ["/organizer/fests", "/organizer/fests/new", "/organizer/fests/1", "/organizer/fests/1/edit", "/organizer/events/new", "/organizer/events/1", "/organizer/events/1/edit"]) { await q.goto(BASE + r); await q.waitForURL(/\/organizer\/login\?next=/); }
  eq(calls.length, 0, "admin calls before sign-in"); await q.context().close();
  await p.goto(BASE + "/organizer/events/abc"); await p.waitForSelector("text=Page not found"); await p.goto(BASE + "/organizer/fests/1x/edit"); await p.waitForSelector("text=Page not found");
});

// =====================================================================================================================
console.log("\n[2] Fest list (GET /admin/fests)");
await check("lists every fest the API returns with club, dates, backend status, event count and seats", async () => {
  await p.goto(BASE + "/organizer/fests"); await p.waitForSelector("table.reg-table"); eq(await rows(p).count(), seededFests.length);
  const LABEL = { live: "Live now", upcoming: "Upcoming", past: "Past" };
  for (const f of seededFests.slice(0, 4)) {
    const t = await text(rows(p).filter({ has: p.locator(`a.row-title[href="/organizer/fests/${f.id}"]`) }));
    assert(t.includes(f.name) && t.includes(f.club_name) && t.includes(f.venue) && t.includes(LABEL[f.status]), `row for ${f.name}: ${t}`);
    assert(t.includes(`${f.event_count} event`) && (f.capacity === 0 || t.includes(`${f.taken} of ${f.capacity} seats taken`)), `counts for ${f.name}: ${t}`);
  }
  await shot(p, "3e-fests-desktop");
});
await check("search, club filter and status chips narrow the loaded list; chip counts equal the data; filters live in the URL", async () => {
  const live = seededFests.filter((f) => !f.archived && f.status === "live").length, mine = seededFests.filter((f) => f.club_id === club.id).length;
  eq((await text(p.locator('.chip:has-text("Live now")'))).replace(/\s+/g, " ").trim(), `Live now ${live}`);
  await p.click('.chip:has-text("Live now")'); await p.waitForURL(/view=live/); await rowCount(p, live);
  await p.click('.chip:text-is("All")'); await p.selectOption("select", String(club.id)); await p.waitForURL(new RegExp(`club=${club.id}`)); await rowCount(p, mine);
  await p.fill('input[type="search"]', seededFests[0].name.slice(0, 9)); await rowCount(p, seededFests.filter((f) => f.club_id === club.id && [f.name, f.club_name, f.venue, f.description].some((x) => String(x || "").toLowerCase().includes(seededFests[0].name.slice(0, 9).toLowerCase()))).length);
  await p.fill('input[type="search"]', "zzzz-no-fest"); await p.waitForSelector("text=No fests match"); await p.click('.state >> text="Clear filters"'); await rowCount(p, seededFests.length); eq(new URL(p.url()).search, "");
});

// =====================================================================================================================
console.log("\n[3] Create and edit a fest (POST / PATCH /admin/fests)");
const festName = `Robotics Week ${stamp}`; let fest;
await check("empty form: every required field is flagged, focus goes to the first, nothing is sent", async () => {
  let posts = 0; const on = (r) => { if (r.method() === "POST" && r.url().includes("/api/admin/fests")) posts++; }; p.on("request", on);
  await p.click('text="Create fest" >> visible=true'); await p.waitForURL(BASE + "/organizer/fests/new"); await p.waitForSelector("form");
  await p.click('button[type="submit"]'); await p.waitForSelector('[aria-invalid="true"]');
  eq((await errorsShown(p)).join(), "club_id,name,starts_on,ends_on,venue"); eq(await p.evaluate(() => document.activeElement.name), "club_id"); p.off("request", on); eq(posts, 0);
});
await check("date order is checked before sending; a valid fest is created, confirmed with a toast, and exists in the API exactly as entered", async () => {
  await p.selectOption('[name="club_id"]', String(club.id)); await p.fill('[name="name"]', festName); await p.fill('[name="venue"]', "Robotics Lab"); await p.fill('[name="description"]', "Line follower and sumo bots.");
  await p.fill('[name="starts_on"]', "2026-12-12"); await p.fill('[name="ends_on"]', "2026-12-10"); await p.click('button[type="submit"]');
  assert((await fieldError(p, "ends_on")).includes("can't be before"), "end before start flagged");
  await p.fill('[name="ends_on"]', "2026-12-13"); await p.click('button[type="submit"]'); await toast(p, /Fest created/); await p.waitForURL(/\/organizer\/fests\/\d+$/); await p.waitForSelector("#fest-name");
  fest = (await admin("GET", "/fests")).find((f) => f.name === festName); assert(fest, "fest exists");
  eq(JSON.stringify([fest.club_id, fest.venue, fest.description, fest.starts_on, fest.ends_on, fest.archived]), JSON.stringify([club.id, "Robotics Lab", "Line follower and sumo bots.", "2026-12-12", "2026-12-13", false]));
  eq(await text(p.locator("#fest-name")), festName); assert((await text(p.locator(".reg-head"))).includes("12 Dec – 13 December 2026"), "dates shown"); assert(p.url().endsWith(`/organizer/fests/${fest.id}`), "landed on the new fest");
  assert((await pub("/fests")).body.some((f) => f.id === fest.id), "visible on the public API");
});
await check("a server-side refusal lands on the right field; a network failure keeps what was typed and a retry works", async () => {
  await p.goto(BASE + "/organizer/fests/new"); await p.waitForSelector("form");
  await p.selectOption('[name="club_id"]', String(club.id)); await p.fill('[name="name"]', `Server check ${stamp}`); await p.fill('[name="venue"]', "Hall"); await p.fill('[name="starts_on"]', "2026-12-20"); await p.fill('[name="ends_on"]', "2026-12-21");
  // the request is altered on the way out, so the real server is the one that refuses it
  quiet++; await p.route("**/api/admin/fests", (r) => (r.request().method() === "POST" ? r.continue({ postData: JSON.stringify({ ...r.request().postDataJSON(), ends_on: "2026-12-01" }) }) : r.continue()));
  await p.click('button[type="submit"]'); await p.waitForSelector('[name="ends_on"][aria-invalid="true"]'); eq(await fieldError(p, "ends_on"), "End date must not be before the start date"); eq(await p.evaluate(() => document.activeElement.name), "ends_on");
  await p.unroute("**/api/admin/fests"); await p.route("**/api/admin/fests", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  await p.click('button[type="submit"]'); await p.waitForSelector(".alert-bad >> text=Unable to connect to the server"); eq(await p.inputValue('[name="name"]'), `Server check ${stamp}`);
  await p.unroute("**/api/admin/fests"); quiet--;
  await p.click('button[type="submit"]'); await toast(p, /Fest created/); await p.waitForURL(/\/organizer\/fests\/\d+$/);
});
await check("edit starts from a fresh read of the fest, saves through PATCH and says so", async () => {
  await admin("PATCH", `/fests/${fest.id}`, { venue: "Changed elsewhere" });                         // another organizer edited it meanwhile
  await p.goto(`${BASE}/organizer/fests/${fest.id}`); await p.waitForSelector("#fest-name"); await act(p, "Edit fest"); await p.waitForURL(new RegExp(`/fests/${fest.id}/edit$`)); await p.waitForSelector("form");
  eq(await p.inputValue('[name="venue"]'), "Changed elsewhere"); eq(await p.inputValue('[name="name"]'), festName); eq(await p.inputValue('[name="starts_on"]'), "2026-12-12"); eq(await p.inputValue('[name="club_id"]'), String(club.id));
  await p.fill('[name="name"]', festName + " II"); await p.fill('[name="ends_on"]', "2026-12-14"); await p.click('button[type="submit"]');
  await toast(p, /Fest updated successfully/); await p.waitForURL(new RegExp(`/fests/${fest.id}$`)); await p.waitForFunction((n) => document.querySelector("#fest-name")?.textContent === n, festName + " II");
  const f = await admin("GET", `/fests/${fest.id}`); eq(f.name, festName + " II"); eq(f.ends_on, "2026-12-14"); eq(f.venue, "Changed elsewhere"); fest = f;
});

// =====================================================================================================================
console.log("\n[4] Create an event with a registration form (POST /admin/events)");
const eventTitle = `Line Follower ${stamp}`; let ev;
const q = (page, i) => page.locator(".schema-field").nth(i);
const addQuestion = async (page, label, type, { required = false, options } = {}) => {
  await page.getByRole("button", { name: "Add question" }).click(); const f = page.locator(".schema-field").last();
  await f.getByRole("textbox", { name: /^Question/ }).fill(label); if (type !== "text") await f.getByLabel("Answer type").selectOption(type);
  if (options) await f.getByLabel("Choices").fill(options.join("\n")); if (required) await f.getByRole("checkbox").check();
};
await check("'Add event' on a fest opens the form with that fest chosen; archived fests are not offered", async () => {
  const arch = await admin("POST", "/fests", { club_id: club.id, name: `Archived fest ${stamp}`, description: "", starts_on: "2026-12-01", ends_on: "2026-12-01", venue: "Hall" }); await admin("POST", `/fests/${arch.id}/archive`);
  await p.goto(`${BASE}/organizer/fests/${fest.id}`); await p.waitForSelector("#fest-name"); await act(p, "Add event"); await p.waitForURL(new RegExp(`/events/new\\?fest=${fest.id}$`)); await p.waitForSelector("form");
  eq(await p.inputValue('[name="fest_id"]'), String(fest.id));
  const options = await p.$$eval('[name="fest_id"] option', (o) => o.map((x) => x.textContent)); assert(options.includes(fest.name) && !options.some((o) => o.includes(`Archived fest ${stamp}`)), "archived fest not offered");
  assert(await p.locator('[name="fest_id"] optgroup').count() >= 1, "fests grouped by club");
});
await check("empty and inconsistent input is caught before sending: required fields, deadline after start, capacity, form questions", async () => {
  let posts = 0; const on = (r) => { if (r.method() === "POST" && r.url().includes("/api/admin/events")) posts++; }; p.on("request", on);
  await p.click('button[type="submit"]'); await p.waitForSelector('[aria-invalid="true"]'); eq((await errorsShown(p)).join(), "title,venue,starts_at,deadline,capacity");
  await p.fill('[name="title"]', eventTitle); await p.fill('[name="venue"]', "Robotics Lab"); await p.fill('[name="starts_at"]', "2026-12-12T10:00"); await p.fill('[name="deadline"]', "2026-12-12T12:00"); await p.fill('[name="capacity"]', "2.5");
  await p.click('button[type="submit"]'); await p.waitForSelector('[name="deadline"][aria-invalid="true"]'); assert((await fieldError(p, "deadline")).includes("at or before the start"), "deadline rule"); assert((await fieldError(p, "capacity")).includes("whole number"), "capacity rule");
  await p.fill('[name="deadline"]', "2026-12-10T18:30"); await p.fill('[name="capacity"]', "3");
  await addQuestion(p, "", "select"); await p.click('button[type="submit"]'); await p.waitForSelector("#schema-error");
  const f = q(p, 0); assert((await text(f)).includes("Enter the question") && (await text(f)).includes("Add at least one option"), "question errors: " + await text(f));
  await f.getByRole("button", { name: /Remove question 1/ }).click(); eq(await p.locator(".schema-field").count(), 0); p.off("request", on); eq(posts, 0, "nothing was sent while invalid");
});
await check("form builder: add all six answer types, reorder, remove, required, choices; keys follow the question; the preview mirrors it", async () => {
  await addQuestion(p, "Contact email", "email");
  await addQuestion(p, "Team name", "text", { required: true });
  await addQuestion(p, "Mobile number", "tel", { required: true });
  await addQuestion(p, "Number of members", "number", { required: true });
  await addQuestion(p, "Track", "select", { required: true, options: ["Beginner", "Advanced"] });
  await addQuestion(p, "About your robot", "textarea");
  await addQuestion(p, "Scrap me", "text");
  eq(await q(p, 1).getByLabel("Field key").inputValue(), "team_name"); eq(await q(p, 3).getByLabel("Field key").inputValue(), "number_of_members");
  await q(p, 1).getByRole("button", { name: "Move question 2 up" }).click();                                 // Team name becomes first
  eq(await q(p, 0).getByRole("textbox", { name: /^Question/ }).inputValue(), "Team name"); eq(await q(p, 1).getByRole("textbox", { name: /^Question/ }).inputValue(), "Contact email");
  assert(await q(p, 0).getByRole("button", { name: "Move question 1 up" }).isDisabled(), "first can't move up"); assert(await p.locator(".schema-field").last().getByRole("button", { name: /Move question 7 down/ }).isDisabled(), "last can't move down");
  await p.locator(".schema-field").last().getByRole("button", { name: "Remove question 7: Scrap me" }).click(); eq(await p.locator(".schema-field").count(), 6);
  const labels = await p.$$eval(".schema-preview label", (l) => l.map((x) => x.textContent.replace(/\s*\*.*$/, "").trim()));
  eq(labels.join("|"), "Full name|Email|Team name|Contact email|Mobile number|Number of members|Track|About your robot");
  eq((await p.$$eval(".schema-preview select option", (o) => o.map((x) => x.textContent))).join("|"), "Choose an option…|Beginner|Advanced");
  assert(await p.$eval(".schema-preview fieldset", (f) => f.disabled), "preview can't be typed into"); eq(await p.locator(".schema-preview textarea").count(), 1);
  await shot(p, "3e-event-form-desktop");
});
await check("the event is created and the API holds exactly what was entered (schema order, keys, options, Dhaka times as instants, defaults)", async () => {
  await p.selectOption('[name="auto_confirm"]', "manual"); await p.fill('[name="description"]', "Build a robot that follows the line."); await p.fill('[name="rules"]', "Teams of up to 3.\nBring your own batteries.");
  await p.click('button[type="submit"]'); await toast(p, /Event created/); await p.waitForURL(/\/organizer\/events\/\d+$/); await p.waitForSelector("#event-name");
  ev = (await admin("GET", `/events?q=${encodeURIComponent(eventTitle)}`))[0]; assert(ev && p.url().endsWith(`/organizer/events/${ev.id}`), "landed on the new event");
  eq(ev.fest_id, fest.id); eq(ev.category, "General", "empty category is saved as General by the backend"); eq(ev.venue, "Robotics Lab"); eq(ev.capacity, 3); eq(ev.auto_confirm, false);
  eq(ev.starts_at, "2026-12-12T04:00:00.000Z", "10:00 Dhaka"); eq(ev.deadline, "2026-12-10T12:30:00.000Z", "18:30 Dhaka"); eq(ev.rules, "Teams of up to 3.\nBring your own batteries."); eq(ev.registration_state, "open");
  eq(JSON.stringify(ev.form_schema), JSON.stringify([
    { key: "team_name", label: "Team name", type: "text", required: true }, { key: "contact_email", label: "Contact email", type: "email", required: false },
    { key: "mobile_number", label: "Mobile number", type: "tel", required: true }, { key: "number_of_members", label: "Number of members", type: "number", required: true },
    { key: "track", label: "Track", type: "select", required: true, options: ["Beginner", "Advanced"] }, { key: "about_your_robot", label: "About your robot", type: "textarea", required: false }]));
});
await check("event management page shows the real event: state, schedule, seats, acceptance, and the form's questions in order", async () => {
  const head = await text(p.locator(".reg-head")); assert(head.includes(eventTitle) && head.includes(fest.name) && head.includes(club.name) && head.includes("Open") && head.includes("People can register now"), "header: " + head);
  const body = await text(p.locator(".detail-cards")); for (const s of ["12 December 2026", "10:00 AM", "Robotics Lab", "General", "0 of 3 seats taken", "3 of 3", "10 December 2026 · 6:30 PM", "Organizer approves each request", "Bring your own batteries."]) assert(body.includes(s), `detail shows "${s}"`);
  const fields = await p.$$eval(".form-fields li", (l) => l.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  eq(fields.length, 8); assert(fields[0].startsWith("Full name") && fields[2].startsWith("Team name") && fields[2].includes("Required") && fields[3].includes("Optional") && fields[6].includes("Beginner, Advanced") && fields[6].includes("Choice"), "question list: " + fields.join(" / "));
  await shot(p, "3e-event-detail-desktop");
});
let regToken;
await check("the public registration page renders that exact form, a participant registers, and the organizer sees the answers (3B + 3C)", async () => {
  const pp = await newPage(1280, 900, { signedIn: false });
  await pp.goto(`${BASE}/events/${ev.id}/register`); await pp.waitForSelector("form");
  const labels = await pp.$$eval("form label", (l) => l.map((x) => x.textContent.replace(/\s*\*.*$/, "").trim())); eq(labels.join("|"), "Full name|Email|Team name|Contact email|Mobile number|Number of members|Track|About your robot");
  await pp.fill('[name="name"]', `Sumaiya ${stamp}`); await pp.fill('[name="email"]', `sumaiya.${stamp}@example.com`); await pp.fill('[name="team_name"]', "Volt"); await pp.fill('[name="mobile_number"]', "01712-345678");
  await pp.fill('[name="number_of_members"]', "3"); await pp.selectOption('[name="track"]', "Advanced"); await pp.click('button[type="submit"]'); await pp.waitForURL(/\/registration\/[\w-]+\?new=1/); await pp.waitForSelector("text=Request received");
  regToken = new URL(pp.url()).pathname.split("/").pop(); await pp.context().close();
  await p.reload(); await p.waitForSelector("#event-name"); assert((await text(p.locator(".detail-cards"))).includes("1 of 3 seats taken"), "seat taken after the registration");
  await act(p, "View registrations"); await p.waitForURL(new RegExp(`/organizer/registrations\\?event=${ev.id}$`)); await p.waitForSelector("table.reg-table"); eq(await p.inputValue(".filter-bar select"), String(ev.id)); eq(await rows(p).count(), 1);
  await p.click("a.row-title"); await p.waitForSelector('section[aria-labelledby="a-h"] dl');
  eq((await p.locator('section[aria-labelledby="a-h"] dt').allInnerTexts()).map((s) => s.toLowerCase()).join("|"), "team name|mobile number|number of members|track");
});
await check("the server's own refusal is shown when it disagrees: the chosen fest was archived while the form was open", async () => {
  const f2 = await admin("POST", "/fests", { club_id: club.id, name: `Closing fest ${stamp}`, description: "", starts_on: "2026-12-05", ends_on: "2026-12-05", venue: "Hall" });
  await p.goto(`${BASE}/organizer/events/new?fest=${f2.id}`); await p.waitForSelector("form"); await p.fill('[name="title"]', `Late event ${stamp}`); await p.fill('[name="venue"]', "Hall"); await p.fill('[name="starts_at"]', "2026-12-05T10:00"); await p.fill('[name="deadline"]', "2026-12-04T10:00"); await p.fill('[name="capacity"]', "10");
  await admin("POST", `/fests/${f2.id}/archive`);
  quiet++; await p.click('button[type="submit"]'); await p.waitForSelector(".alert-bad"); quiet--;
  assert((await text(p.locator(".org-form > .alert-bad"))).includes("This fest is archived. Restore it before adding events."), "server message shown"); eq(await p.inputValue('[name="title"]'), `Late event ${stamp}`, "input kept");
  eq((await admin("GET", `/events?q=${encodeURIComponent("Late event " + stamp)}`)).length, 0, "nothing was created");
});

// =====================================================================================================================
console.log("\n[5] Edit an event (PATCH /admin/events/:id)");
await check("edit loads the current server values, including times shown in Dhaka time and the saved questions", async () => {
  await admin("PATCH", `/events/${ev.id}`, { venue: "Moved to Lab 2" });
  await p.goto(`${BASE}/organizer/events/${ev.id}`); await p.waitForSelector("#event-name"); await act(p, "Edit event"); await p.waitForURL(new RegExp(`/events/${ev.id}/edit$`)); await p.waitForSelector("form");
  eq(await p.inputValue('[name="venue"]'), "Moved to Lab 2"); eq(await p.inputValue('[name="starts_at"]'), "2026-12-12T10:00"); eq(await p.inputValue('[name="deadline"]'), "2026-12-10T18:30"); eq(await p.inputValue('[name="capacity"]'), "3");
  eq(await p.inputValue('[name="auto_confirm"]'), "manual"); eq(await p.inputValue('[name="category"]'), "General"); eq(await p.locator(".schema-field").count(), 6);
  assert(await q(p, 0).getByLabel("Field key").evaluate((e) => e.readOnly), "saved question keys can't be changed"); eq(await q(p, 4).getByLabel("Choices").inputValue(), "Beginner\nAdvanced");
  assert(await p.locator(".schema .alert-info").count(), "explains that the form can only grow once people registered");
});
await check("backend rules are not bypassed: capacity below the seats taken and removing a question are refused with the server's words", async () => {
  await pub(`/events/${ev.id}/register`, { name: "Second Person", email: `second.${stamp}@example.com`, answers: { team_name: "Ohm", mobile_number: "01712345678", number_of_members: "2", track: "Beginner" } });
  await p.fill('[name="capacity"]', "1"); quiet++; await p.click('button[type="submit"]'); await p.waitForSelector('[name="capacity"][aria-invalid="true"]');
  eq(await fieldError(p, "capacity"), "Capacity can't be lower than the 2 seats already taken."); eq((await admin("GET", `/events/${ev.id}`)).capacity, 3);
  await p.fill('[name="capacity"]', "5"); await q(p, 5).getByRole("button", { name: /Remove question 6/ }).click(); await p.click('button[type="submit"]'); await p.waitForSelector("#schema-error"); quiet--;
  assert((await text(p.locator("#schema-error"))).includes(`"About your robot" can't be removed because people have already registered.`), "form_locked message: " + await text(p.locator("#schema-error")));
  eq((await admin("GET", `/events/${ev.id}`)).form_schema.length, 6, "schema unchanged on the server");
});
await check("allowed changes save: title, category, capacity, deadline, acceptance mode and an added optional question", async () => {
  await p.reload(); await p.waitForSelector("form");
  await p.fill('[name="title"]', eventTitle + " Cup"); await p.fill('[name="category"]', "Robotics"); await p.fill('[name="capacity"]', "8"); await p.fill('[name="deadline"]', "2026-12-11T09:00"); await p.selectOption('[name="auto_confirm"]', "auto");
  await addQuestion(p, "T-shirt size", "select", { options: ["S", "M", "L"] });
  await p.click('button[type="submit"]'); await toast(p, /Event updated successfully/); await p.waitForURL(new RegExp(`/events/${ev.id}$`)); await p.waitForFunction((t) => document.querySelector("#event-name")?.textContent === t, eventTitle + " Cup");
  const e = await admin("GET", `/events/${ev.id}`); eq(e.title, eventTitle + " Cup"); eq(e.category, "Robotics"); eq(e.capacity, 8); eq(e.deadline, "2026-12-11T03:00:00.000Z"); eq(e.auto_confirm, true);
  eq(e.form_schema.length, 7); eq(JSON.stringify(e.form_schema[6]), JSON.stringify({ key: "t_shirt_size", label: "T-shirt size", type: "select", required: false, options: ["S", "M", "L"] })); eq(e.form_schema[0].key, "team_name", "existing keys untouched");
  assert((await text(p.locator(".detail-cards"))).includes("2 of 8 seats taken"), "detail re-read from the server"); ev = e;
});
await check("a network failure while saving keeps the form; an expired session during save goes to sign-in without saving", async () => {
  await p.goto(`${BASE}/organizer/events/${ev.id}/edit`); await p.waitForSelector("form"); await p.fill('[name="venue"]', "Unsaved venue");
  quiet++; await p.route(`**/api/admin/events/${ev.id}`, (r) => (r.request().method() === "PATCH" ? r.abort() : r.continue()));
  await p.click('button[type="submit"]'); await p.waitForSelector(".alert-bad >> text=Unable to connect to the server"); eq(await p.inputValue('[name="venue"]'), "Unsaved venue"); assert(!(await p.locator('button[type="submit"]').isDisabled()), "can retry");
  await p.unroute(`**/api/admin/events/${ev.id}`);
  await p.evaluate(() => { sessionStorage.setItem("ditc.test-signed-out", "1"); sessionStorage.setItem("ditc.organizerKey", "rotated-away"); });
  await p.click('button[type="submit"]'); await p.waitForURL(/\/organizer\/login\?expired=1/); quiet--;
  eq((await admin("GET", `/events/${ev.id}`)).venue, "Moved to Lab 2", "nothing saved"); await p.context().close(); p = await newPage();
});

// =====================================================================================================================
console.log("\n[6] Event lifecycle (archive / restore / delete)");
await check("archive asks first (Cancel and Esc change nothing), then hides the event publicly; restore brings it back", async () => {
  await p.goto(`${BASE}/organizer/events/${ev.id}`); await p.waitForSelector("#event-name");
  await act(p, "Archive"); await dialog(p).waitFor(); assert((await text(dialog(p))).includes("Archive this event?") && (await text(dialog(p))).includes(ev.title), "dialog names the event");
  await dialog(p).getByText("Cancel", { exact: true }).click(); await p.waitForSelector("dialog[open]", { state: "detached" }); await act(p, "Archive"); await dialog(p).waitFor(); await p.keyboard.press("Escape"); await p.waitForSelector("dialog[open]", { state: "detached" });
  eq((await admin("GET", `/events/${ev.id}`)).archived, false);
  await act(p, "Archive"); await dialog(p).getByText("Archive event", { exact: true }).click(); await toast(p, /Event archived/); await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Archived");
  eq((await admin("GET", `/events/${ev.id}`)).registration_state, "archived"); eq((await pub(`/events/${ev.id}`)).status, 404, "gone from the public API");
  eq(await p.locator(".action-bar").getByText("Public page").count(), 0); eq(await p.locator(".action-bar").getByText("Archive", { exact: true }).count(), 0);
  await act(p, "Restore"); await dialog(p).getByText("Restore event", { exact: true }).click(); await toast(p, /Event restored/); await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Open");
  eq((await pub(`/events/${ev.id}`)).status, 200);
});
await check("an event with registrations offers no Delete and says why; one without needs an explicit tick, then is really deleted", async () => {
  eq(await p.locator(".action-bar").getByText("Delete", { exact: true }).count(), 0); assert((await text(p.locator(".detail-cards"))).includes("An event with registrations can't be deleted"), "explains");
  const d = await admin("POST", "/events", { fest_id: fest.id, title: `Disposable ${stamp}`, category: "Test", description: "", rules: "", venue: "Lab", starts_at: future(20), deadline: future(19), capacity: 4, auto_confirm: true, form_schema: [] });
  await p.goto(`${BASE}/organizer/events/${d.id}`); await p.waitForSelector("#event-name"); await act(p, "Delete"); await dialog(p).waitFor();
  const yes = dialog(p).getByText("Delete permanently", { exact: true }); assert(await yes.isDisabled(), "needs the tick first"); await dialog(p).getByRole("checkbox").check(); assert(!(await yes.isDisabled()), "enabled after the tick");
  await shot(p, "3e-delete-dialog"); await yes.click(); await toast(p, /Event deleted/); await p.waitForURL(BASE + "/organizer/events"); await p.waitForSelector("table.reg-table");
  eq((await rawAdmin("GET", `/events/${d.id}`)).status, 404); eq(await p.locator(`a.row-title:text-is("Disposable ${stamp}")`).count(), 0);
});
await check("delete is the server's decision: someone registered after the page loaded -> its reason is shown and the event stays", async () => {
  const d = await admin("POST", "/events", { fest_id: fest.id, title: `Contested ${stamp}`, category: "Test", description: "", rules: "", venue: "Lab", starts_at: future(20), deadline: future(19), capacity: 4, auto_confirm: true, form_schema: [] });
  await p.goto(`${BASE}/organizer/events/${d.id}`); await p.waitForSelector("#event-name");
  eq((await pub(`/events/${d.id}/register`, { name: "Quick One", email: `quick.${stamp}@example.com`, answers: {} })).status, 201);
  await act(p, "Delete"); await dialog(p).getByRole("checkbox").check(); quiet++; await dialog(p).getByText("Delete permanently", { exact: true }).click(); await p.waitForSelector("dialog[open] .alert-bad"); quiet--;
  eq((await text(p.locator("dialog[open] .alert-bad"))).trim(), "This event has registrations. Archive it instead."); eq((await rawAdmin("GET", `/events/${d.id}`)).status, 200);
  await dialog(p).getByText("Cancel", { exact: true }).click();
});

// =====================================================================================================================
console.log("\n[7] Fest lifecycle and the fest -> events relationship");
await check("fest page lists its events (archived ones too) with state and seats, linking to each event", async () => {
  await admin("POST", `/events/${ev.id}/archive`);
  await p.goto(`${BASE}/organizer/fests/${fest.id}`); await p.waitForSelector("#fest-name"); const api = await admin("GET", `/fests/${fest.id}`);
  eq((await p.locator('section[aria-labelledby="fe-h"] .row-title').allInnerTexts()).join("|"), api.events.map((e) => e.title).join("|"));
  const li = p.locator('section[aria-labelledby="fe-h"] li').filter({ hasText: ev.title }); assert((await text(li)).includes("Archived") && (await text(li)).includes("2 of 8 seats taken"), "archived event row: " + await text(li));
  assert((await text(p.locator(".detail-cards"))).includes(`${api.events.length} events`) && (await text(p.locator(".detail-cards"))).includes(`(${api.event_count} not archived)`), "counts explain archived events");
  await admin("POST", `/events/${ev.id}/restore`); await li.locator(".row-title").click(); await p.waitForURL(new RegExp(`/organizer/events/${ev.id}$`));
});
await check("archiving a fest hides it and its events, blocks new events and is explained on the event; restoring reverses it", async () => {
  await p.goto(`${BASE}/organizer/fests/${fest.id}`); await p.waitForSelector("#fest-name"); await act(p, "Archive"); await dialog(p).getByText("Archive fest", { exact: true }).click(); await toast(p, /Fest archived/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() === "Archived"); eq(await p.getByText("Add event").count(), 0, "no Add event on an archived fest");
  eq((await pub(`/fests/${fest.id}`)).status, 404); eq((await pub(`/events/${ev.id}`)).status, 404);
  await p.goto(`${BASE}/organizer/events/${ev.id}`); await p.waitForSelector("#event-name"); assert((await text(p.locator(".alert-warn"))).includes("is archived, so this event is hidden too even though the event itself is not archived"), "event explains its fest is archived");
  await p.goto(`${BASE}/organizer/fests?view=archived`); await p.waitForSelector("table.reg-table"); assert((await rows(p).allInnerTexts()).some((t) => t.includes(fest.name) && t.includes("Archived")), "listed under Archived");
  await p.click(`a.row-title:text-is("${fest.name}")`); await p.waitForSelector("#fest-name"); await act(p, "Restore"); await dialog(p).getByText("Restore fest", { exact: true }).click(); await toast(p, /Fest restored/);
  await p.waitForFunction(() => document.querySelector(".reg-head-status .badge").textContent.trim() !== "Archived"); eq((await pub(`/events/${ev.id}`)).status, 200);
});
await check("a fest with events offers no Delete; an empty one is deleted after the tick; a late-added event makes the server refuse, in its words", async () => {
  eq(await p.locator(".action-bar").getByText("Delete", { exact: true }).count(), 0); assert((await text(p.locator(".detail-cards"))).includes("A fest with events can't be deleted"), "explains");
  const mk = (n) => admin("POST", "/fests", { club_id: club.id, name: `${n} ${stamp}`, description: "", starts_on: "2026-12-22", ends_on: "2026-12-22", venue: "Hall" });
  const a = await mk("Empty fest"), b = await mk("Racing fest");
  await p.goto(`${BASE}/organizer/fests/${a.id}`); await p.waitForSelector("#fest-name"); await p.waitForSelector("text=No events in this fest yet"); await act(p, "Delete"); await dialog(p).waitFor();
  assert(await dialog(p).getByText("Delete permanently", { exact: true }).isDisabled(), "tick required"); await dialog(p).getByRole("checkbox").check(); await dialog(p).getByText("Delete permanently", { exact: true }).click();
  await toast(p, /Fest deleted/); await p.waitForURL(BASE + "/organizer/fests"); eq((await rawAdmin("GET", `/fests/${a.id}`)).status, 404);
  await p.goto(`${BASE}/organizer/fests/${b.id}`); await p.waitForSelector("#fest-name");
  await admin("POST", "/events", { fest_id: b.id, title: `Late arrival ${stamp}`, category: "Test", description: "", rules: "", venue: "Lab", starts_at: future(30), deadline: future(29), capacity: 4, auto_confirm: true, form_schema: [] });
  await act(p, "Delete"); await dialog(p).getByRole("checkbox").check(); quiet++; await dialog(p).getByText("Delete permanently", { exact: true }).click(); await p.waitForSelector("dialog[open] .alert-bad"); quiet--;
  eq((await text(p.locator("dialog[open] .alert-bad"))).trim(), "This fest still has events. Archive it instead."); eq((await rawAdmin("GET", `/fests/${b.id}`)).status, 200); await dialog(p).getByText("Cancel", { exact: true }).click();
});

// =====================================================================================================================
console.log("\n[8] Events list: search, filters, sorting, links");
const all = await admin("GET", "/events?limit=500");
await check("lists every event from the API; search, club and fest go to the API; category, state and sort work on the result; all in the URL", async () => {
  await p.goto(BASE + "/organizer/events"); await p.waitForSelector("table.reg-table"); eq(await rows(p).count(), all.length);
  const sel = (label) => p.locator(`.filter-grid-events .field:has(label:text-is("${label}")) select`);
  await sel("Club").selectOption(String(club.id)); await p.waitForURL(new RegExp(`club=${club.id}`)); const byClub = await admin("GET", `/events?club=${club.id}&limit=500`); await rowCount(p, byClub.length);
  await sel("Fest").selectOption(String(fest.id)); await p.waitForURL(new RegExp(`fest=${fest.id}`)); const byFest = await admin("GET", `/events?club=${club.id}&fest=${fest.id}&limit=500`); await rowCount(p, byFest.length);
  eq((await p.locator("a.row-title").allInnerTexts()).join("|"), byFest.map((e) => e.title).join("|"), "API order (start date)");
  await sel("Sort by").selectOption("name"); await p.waitForURL(/sort=name/); eq((await p.locator("a.row-title").allInnerTexts()).join("|"), byFest.map((e) => e.title).sort((a, b) => a.localeCompare(b)).join("|"));
  await sel("Category").selectOption("Robotics"); await p.waitForURL(/category=Robotics/); await rowCount(p, byFest.filter((e) => e.category === "Robotics").length);
  await p.click('.org-intro >> text="Clear filters"'); await rowCount(p, all.length); eq(new URL(p.url()).search, "?sort=name", "sorting is kept, filters cleared");
  await p.fill('input[type="search"]', eventTitle); await p.waitForURL((u) => u.searchParams.get("q") === eventTitle); await rowCount(p, 1);
  await p.goto(`${BASE}/organizer/events?state=full&club=${club.id}`); await p.waitForSelector("table.reg-table, .state"); await rowCount(p, byClub.filter((e) => e.registration_state === "full").length);
  eq(await p.locator('.chip[aria-pressed="true"]').innerText().then((t) => t.replace(/\s+/g, " ").trim().split(" ")[0]), "Full");
});
await check("a row shows club, fest, category, start, venue, state, acceptance and seats, and links to management and to registrations", async () => {
  await p.goto(`${BASE}/organizer/events?q=${encodeURIComponent(eventTitle)}`); await p.waitForSelector("table.reg-table"); const e = await admin("GET", `/events/${ev.id}`), t = await text(rows(p).first());
  for (const s of [e.title, e.club_name, e.fest_name, e.category, "12 Dec · 10:00 AM", e.venue, "Open", "Instant confirmation", `${e.taken} of ${e.capacity} seats taken`]) assert(t.includes(s), `row shows "${s}": ${t}`);
  await rows(p).first().getByRole("link", { name: `Registrations for ${e.title}` }).click(); await p.waitForURL(new RegExp(`/organizer/registrations\\?event=${e.id}$`)); await p.goBack();
  await p.waitForSelector("table.reg-table"); await rows(p).first().getByRole("link", { name: `Manage ${e.title}` }).click(); await p.waitForURL(new RegExp(`/organizer/events/${e.id}$`)); await p.waitForSelector("#event-name");
  await shot(p, "3e-events-desktop-detail");
});
await check("event page links to the existing check-in route and the public page; dashboard and registrations (Phase 3C) still work", async () => {
  await act(p, "Check-in"); await p.waitForURL(BASE + "/organizer/check-in"); eq(await text(p.locator(".org-bar h1")), "Check-in"); await p.goBack(); await p.waitForSelector("#event-name");
  await act(p, "Public page"); await p.waitForURL(`${BASE}/events/${ev.id}`); await p.waitForSelector("h1"); await p.goBack(); await p.waitForSelector("#event-name");
  await p.goto(BASE + "/organizer"); await p.waitForSelector(".stat-grid"); const s = await admin("GET", "/stats"); eq(await p.locator(".stat-value").nth(4).innerText(), String(s.events), "dashboard counts the new events");
  await p.click('a.stat:has-text("Events")'); await p.waitForURL(BASE + "/organizer/events"); await p.waitForSelector("table.reg-table");
});
await check("list errors: a failed load shows retry; a failed refresh keeps the rows and says so", async () => {
  quiet++; await p.route("**/api/admin/events?*", (r) => r.abort()); await p.goto(BASE + "/organizer/events"); await p.waitForSelector("text=Unable to connect to the server");
  await p.unroute("**/api/admin/events?*"); await p.click('button:has-text("Try again")'); await p.waitForSelector("table.reg-table"); const n = await rows(p).count();
  await p.route("**/api/admin/events?*", (r) => r.abort()); await p.click('.org-intro >> text="Refresh"'); await p.waitForSelector("text=couldn't be refreshed"); eq(await rows(p).count(), n); await p.unroute("**/api/admin/events?*"); quiet--;
  quiet++; await p.route("**/api/admin/fests", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal_error", message: "Something went wrong on our side. Please try again." }) }));
  await p.goto(BASE + "/organizer/fests"); await p.waitForSelector("text=Something went wrong on our side"); await p.unroute("**/api/admin/fests"); quiet--; await p.click('button:has-text("Try again")'); await p.waitForSelector("table.reg-table");
  quiet++; await p.goto(BASE + "/organizer/events/99999999"); await p.waitForSelector("text=Event not found"); await p.goto(BASE + "/organizer/fests/99999999/edit"); await p.waitForSelector("text=Fest not found"); quiet--;
});

// =====================================================================================================================
console.log("\n[9] Responsive: 320 / 375 / 768 / 1024 / 1440");
const ROUTES = ["/organizer/events", `/organizer/events/${ev.id}`, `/organizer/events/${ev.id}/edit`, "/organizer/events/new", "/organizer/fests", `/organizer/fests/${fest.id}`, `/organizer/fests/${fest.id}/edit`, "/organizer/fests/new"];
for (const w of [320, 375, 768, 1024, 1440]) {
  const r = await newPage(w, 800);
  await check(`${w}px: no horizontal overflow on ${ROUTES.length} event/fest routes, nothing wider than the screen, one h1 each; lists are ${w >= 1240 ? "tables" : "cards"}`, async () => {
    const bad = [];
    for (const route of ROUTES) {
      await r.goto(BASE + route); await r.waitForSelector(".org-main"); await r.waitForLoadState("networkidle"); await r.waitForTimeout(150);
      const res = await r.evaluate(() => {
        const out = [], vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
        for (const el of document.querySelectorAll(".org-main *")) { const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1) && !el.closest(".sr-only") && !el.closest("thead")) { out.push(`${el.tagName}.${el.className} sticks out (${Math.round(b.left)}..${Math.round(b.right)})`); break; } }
        for (const b of document.querySelectorAll(".org-main .btn")) if (b.scrollWidth > b.clientWidth + 1) { out.push(`button "${b.textContent.trim()}" is clipped`); break; }
        const h1 = document.querySelectorAll("h1").length; if (h1 !== 1) out.push(`${h1} h1 elements`);
        return out;
      });
      if (res.length) bad.push(`${route}: ${res.join("; ")}`);
      if (route === "/organizer/events" || route === "/organizer/fests") { const d = await r.locator("table.reg-table").evaluate((t) => getComputedStyle(t).display); if (d !== (w >= 1240 ? "table" : "block")) bad.push(`${route}: list display ${d}`); }
    }
    assert(!bad.length, bad.join("\n      "));
    for (const [name, route, sel] of [["events", "/organizer/events", "table"], ["event", `/organizer/events/${ev.id}`, "#event-name"], ["event-edit", `/organizer/events/${ev.id}/edit`, "form"], ["fests", "/organizer/fests", "table"], ["fest", `/organizer/fests/${fest.id}`, "#fest-name"]]) { await r.goto(BASE + route); await r.waitForSelector(sel); await r.waitForLoadState("networkidle"); await shot(r, `3e-${name}-${w}`); }
  });
  if (w <= 375) await check(`${w}px: the delete confirmation fits the screen with its tick box and 44px buttons; form-builder controls are 36px or more`, async () => {
    const d = await admin("POST", "/events", { fest_id: fest.id, title: `Small ${w} ${stamp}`, category: "Test", description: "", rules: "", venue: "Lab", starts_at: future(20), deadline: future(19), capacity: 4, auto_confirm: true, form_schema: [] });
    await r.goto(`${BASE}/organizer/events/${d.id}`); await r.waitForSelector("#event-name"); await act(r, "Delete"); await dialog(r).waitFor(); await r.waitForTimeout(300);
    const b = await dialog(r).boundingBox(); assert(b.x >= 0 && b.x + b.width <= w && b.y >= 0 && b.y + b.height <= 800, `dialog ${JSON.stringify(b)}`);
    for (const t of ["Cancel", "Delete permanently"]) { const bb = await dialog(r).getByText(t, { exact: true }).boundingBox(); assert(bb.x >= 0 && bb.x + bb.width <= w && bb.height >= 44, `${t}: ${JSON.stringify(bb)}`); }
    await dialog(r).getByRole("checkbox").check(); await dialog(r).getByText("Delete permanently", { exact: true }).click(); await r.waitForURL(BASE + "/organizer/events");
    await r.goto(`${BASE}/organizer/events/${ev.id}/edit`); await r.waitForSelector(".schema-field");
    const sizes = await r.$$eval(".schema-tools button", (els) => els.map((e) => { const x = e.getBoundingClientRect(); return Math.min(x.width, x.height); })); assert(sizes.length && sizes.every((s) => s >= 36), "builder buttons: " + sizes.slice(0, 6));
  });
  await r.context().close();
}

// =====================================================================================================================
console.log("\n[10] Accessibility spot checks");
await check("every control on both forms has a label (builder and preview included); errors are tied to their fields", async () => {
  for (const route of [`/organizer/events/${ev.id}/edit`, "/organizer/fests/new"]) {
    await p.goto(BASE + route); await p.waitForSelector("form");
    eq(await p.evaluate(() => [...document.querySelectorAll(".org-main input, .org-main select, .org-main textarea")].filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label")).length), 0, `unlabelled controls on ${route}`);
  }
  await p.click('button[type="submit"]'); await p.waitForSelector('[aria-invalid="true"]');
  assert(await p.$$eval('[aria-invalid="true"]', (els) => els.every((e) => { const id = (e.getAttribute("aria-describedby") || "").split(" ").pop(); return id && document.getElementById(id)?.getAttribute("role") === "alert"; })), "each invalid field points at its error message");
});
await check("keyboard only: a fest can be created, then archived through the dialog, without a mouse", async () => {
  await p.goto(BASE + "/organizer/fests/new"); await p.waitForSelector("form"); await p.focus('[name="club_id"]'); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Tab");
  await p.keyboard.type(`Keyboard fest ${stamp}`); await p.keyboard.press("Tab"); // a native date field has two tab stops in Chromium (the date, then its calendar button)
  await p.keyboard.type("12202026"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.type("12212026"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
  eq(await p.evaluate(() => document.activeElement.name), "venue", "tab order reaches the venue"); await p.keyboard.type("Seminar Hall");
  await p.keyboard.press("Enter"); await p.waitForURL(/\/organizer\/fests\/\d+$/); await p.waitForSelector("#fest-name");
  const made = (await admin("GET", "/fests")).find((f) => f.name === `Keyboard fest ${stamp}`); assert(made && made.starts_on === "2026-12-20" && made.ends_on === "2026-12-21", "created with the typed dates: " + JSON.stringify(made && [made.starts_on, made.ends_on]));
  await p.locator(".action-bar").getByText("Archive", { exact: true }).focus(); await p.keyboard.press("Enter"); await dialog(p).waitFor();
  assert(await p.evaluate(() => !!document.activeElement.closest("dialog[open]")), "focus moved into the dialog");
  await dialog(p).getByText("Archive fest", { exact: true }).focus(); await p.keyboard.press("Enter"); await toast(p, /Fest archived/); eq((await admin("GET", `/fests/${made.id}`)).archived, true);
});

// =====================================================================================================================
if (EMPTY) {
  console.log("\n[11] True empty states (second server, brand-new database)");
  const e = await newPage(); const at = (path) => e.goto(EMPTY + path);
  await check("empty backend: 'No events yet' with 'Create your first event', 'No fests yet', and the event form asks for a fest first", async () => {
    await at("/organizer/events"); await e.waitForSelector("text=No events yet"); await e.waitForSelector('a:has-text("Create your first event")'); eq(await e.locator("table").count(), 0);
    await at("/organizer/fests"); await e.waitForSelector("text=No fests yet");
    await at("/organizer/events/new"); await e.waitForSelector("text=Create a fest first"); eq(await e.locator("form").count(), 0);
  });
  await e.context().close();
}

console.log("\n[12] Console");
await check("no Content-Security-Policy violations, page errors or failed assets in any flow above", async () => { assert(consoleErrors.length === 0, consoleErrors.slice(0, 8).join("\n      ")); });

await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
