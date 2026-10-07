// Browser verification for Phase 3B against the REAL Node server + a freshly seeded database (headless Chromium).
// Needs: a running server (BASE, default http://localhost:3111) serving web/dist, and Playwright (global install is fine).
//   NODE_PATH=<global node_modules> node tools/browser-3b.mjs
// Screenshots go to SHOTS (default /tmp/shots). Exit code 1 if any check fails.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3111", SHOTS = process.env.SHOTS || "/tmp/shots", KEY = "demo-organizer-key";
fs.mkdirSync(SHOTS, { recursive: true });

const results = []; let quiet = 0; const consoleErrors = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log("  ok  " + name); }
  catch (e) { results.push([false, name]); console.log("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 4).join("\n      ")); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => assert(a === b, `${m || "expected equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const stamp = Date.now().toString(36);
const admin = async (method, path, body) => {
  const r = await fetch(BASE + "/api/admin" + path, { method, headers: { "content-type": "application/json", "x-organizer-key": KEY }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`); return j;
};
const api = async (path, opts) => { const r = await fetch(BASE + "/api" + path, opts); return { status: r.status, body: await r.json().catch(() => null) }; };
const future = (days, hh = 10) => new Date(Date.now() + days * 864e5 + hh * 36e5).toISOString();

const browser = await chromium.launch();
const newPage = async (w = 1280, h = 900, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...opts }), page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !quiet) consoleErrors.push(`${m.text()} @ ${page.url()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !quiet && !/\/api\//.test(r.url())) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message} @ ${page.url()}`));
  return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

// ---- fixtures made through the real organizer API (no mocks) -------------------------------------------------------
const seed = (await api("/events/4")).body;
const ALL_TYPES = [
  { key: "full_name_alt", label: "Nickname", type: "text", required: false },
  { key: "contact_email", label: "Parent email", type: "email", required: true },
  { key: "mobile", label: "Mobile number", type: "tel", required: true },
  { key: "age", label: "Your age", type: "number", required: true },
  { key: "track", label: "Track", type: "select", required: true, options: ["Beginner", "Advanced"] },
  { key: "about", label: "About your project", type: "textarea", required: false },
];
const typesEv = await admin("POST", "/events", { fest_id: seed.fest_id, title: `All field types ${stamp}`, category: "Test", description: "d", rules: "", venue: "Lab", starts_at: future(5), deadline: future(4), capacity: 20, auto_confirm: true, form_schema: ALL_TYPES });
const tinyEv = await admin("POST", "/events", { fest_id: seed.fest_id, title: `One seat ${stamp}`, category: "Test", description: "d", rules: "", venue: "Lab", starts_at: future(5), deadline: future(4), capacity: 1, auto_confirm: true, form_schema: [] });
const archEv = await admin("POST", "/events", { fest_id: seed.fest_id, title: `Archived ${stamp}`, category: "Test", description: "d", rules: "", venue: "Lab", starts_at: future(5), deadline: future(4), capacity: 5, auto_confirm: true, form_schema: [] });
await admin("POST", `/events/${archEv.id}/archive`);
const events = (await api("/events?limit=200")).body;
const byState = (s) => events.filter((e) => e.registration_state === s);
const OPEN = byState("open").length, FULL = byState("full")[0], CLOSED = byState("closed")[0], ENDED = byState("ended")[0];

// ===================================================================================================================
console.log("\n[1] Events discovery");
let p = await newPage();
await check("events page lists real events; Register shows only on open cards", async () => {
  await p.goto(BASE + "/events"); await p.waitForSelector("article.event-card");
  const cards = await p.$$eval("article.event-card", (els) => els.map((e) => ({ badge: e.querySelector(".badge")?.textContent.trim(), reg: !!e.querySelector('a[href$="/register"]'), title: e.querySelector("h3").textContent })));
  eq(cards.length, events.length, "card count equals API count");
  assert(cards.every((c) => (c.badge === "Open") === c.reg), "Register link iff badge is Open");
  eq(cards.filter((c) => c.reg).length, OPEN, "open count");
  for (const label of ["Open", "Full", "Closed", "Ended"]) assert(cards.some((c) => c.badge === label), `has a ${label} card`);
  assert(cards.findIndex((c) => c.badge === "Ended") > cards.findLastIndex((c) => c.badge === "Open"), "open events sort before ended ones");
});
await check("search filters via the API and is reflected in the URL", async () => {
  await p.getByLabel("Search").fill("robotics"); await p.waitForFunction(() => document.querySelectorAll("article.event-card").length === 1);
  assert((await p.url()).includes("q=robotics"), "url has q");
  eq(await p.locator("article.event-card h3").innerText(), "Robotics Challenge", "result");
  eq((await p.locator(".results-line").innerText()).trim(), "1 event match your filters", "results line");
});
await check("no-result state offers Clear filters, which restores the list", async () => {
  await p.getByLabel("Search").fill("zzzzzz-nothing"); await p.getByText("No events match").waitFor();
  await p.getByRole("button", { name: "Clear filters" }).click(); await p.waitForFunction((n) => document.querySelectorAll("article.event-card").length === n, events.length);
  eq(await p.getByLabel("Search").inputValue(), "", "search box cleared");
});
await check("status chips filter by backend registration_state (Full / Closed / Ended)", async () => {
  for (const [chip, label] of [["Full", "Full"], ["Closed", "Closed"], ["Ended", "Ended"]]) {
    await p.getByRole("button", { name: new RegExp("^" + chip) }).click();
    await p.waitForFunction((l) => [...document.querySelectorAll("article.event-card .badge")].every((b) => b.textContent.trim() === l) && document.querySelectorAll("article.event-card").length > 0, label);
    assert((await p.$$("article.event-card a[href$='/register']")).length === 0, `${chip}: no Register link`);
  }
  await p.getByRole("button", { name: /^All$/ }).click();
});
await check("club and category filters", async () => {
  await p.getByLabel("Club").selectOption({ label: "DRMC IT Club" });
  await p.waitForFunction(() => [...document.querySelectorAll("article.event-card")].every((c) => c.textContent.includes("DRMC IT Club")) && document.querySelectorAll("article.event-card").length > 3);
  await p.getByLabel("Category").selectOption("Robotics");
  await p.waitForFunction(() => document.querySelectorAll("article.event-card").length === 1);
});
await check("deep link with filters in the URL restores them", async () => {
  await p.goto(BASE + "/events?category=Quiz&state=open"); await p.waitForSelector("article.event-card");
  eq(await p.getByLabel("Category").inputValue(), "Quiz", "category select");
  const want = events.filter((e) => e.category === "Quiz" && e.registration_state === "open").length; assert(want > 0, "fixture has open quizzes");
  eq(await p.locator("article.event-card").count(), want, "open quizzes only");
});
await shot(p, "events-desktop");

// ===================================================================================================================
console.log("\n[2] Student journey: Events -> Event -> Register -> Confirmation -> QR -> My registrations -> Cancel");
const email1 = `student.${stamp}@example.com`; let token1;
await check("events -> event -> register (auto-confirm event)", async () => {
  await p.goto(BASE + "/events"); await p.getByLabel("Search").fill("AI Web"); await p.waitForFunction(() => document.querySelectorAll("article.event-card").length === 1);
  await p.locator("article.event-card h3 a").click(); await p.waitForURL("**/events/4");
  await p.getByRole("link", { name: /Register Now/ }).click(); await p.waitForURL("**/events/4/register");
  await p.getByLabel("Full name").fill("Test Student"); await p.getByLabel("Email").fill(email1); await p.getByLabel("Year of study").selectOption("2nd");
  await p.getByRole("button", { name: "Register" }).click(); await p.waitForURL(/\/registration\/[\w-]+\?new=1/);
  token1 = p.url().match(/registration\/([\w-]+)/)[1];
});
await check("confirmation page: details, status, banner, answers with real labels", async () => {
  await p.getByText("You're registered.").waitFor(); await p.getByText("Year of study").waitFor();
  const t = await p.locator("main").innerText();
  for (const s of ["Test Student", email1, "AI Web Development Contest", "Computer Lab 1", "Confirmed", "Year of study", "2nd", "Registered"]) assert(t.toLowerCase().includes(s.toLowerCase()), `page shows "${s}"`);
});
await check("QR pass renders from lib/qr.js and decodes to the real pass token", async () => {
  const svg = p.locator("svg.qr-svg"); await svg.waitFor();
  eq(await svg.getAttribute("role"), "img", "role"); assert((await svg.getAttribute("aria-label")).includes("Test Student"), "aria-label");
  const code = (await p.locator(".qr-code").innerText()).trim(); eq(code.split(".").length, 3, "token has 3 parts");
  const png = `/tmp/qr-3b.png`; await svg.screenshot({ path: png });
  const out = execFileSync("python3", ["-c", `import cv2;im=cv2.imread('${png}');im=cv2.resize(im,None,fx=2,fy=2,interpolation=cv2.INTER_NEAREST);print(cv2.QRCodeDetector().detectAndDecode(im)[0])`]).toString().trim();
  eq(out, code, "decoded QR text");
  const api2 = (await api(`/registrations/${token1}`)).body; eq(api2.pass_token, code, "matches API pass_token");
});
await shot(p, "registration-desktop");
await check("registration is saved on this device and listed under My registrations", async () => {
  await p.goto(BASE + "/my-registrations"); await p.getByText("AI Web Development Contest").waitFor();
  const card = p.locator(".reg-item", { hasText: "AI Web Development Contest" }); assert(await card.getByText("Confirmed").count(), "Confirmed badge"); assert(await card.getByText("Pass ready").count(), "Pass ready");
  assert(await card.getByRole("link", { name: /View pass/ }).count(), "View pass link"); assert(await card.getByRole("button", { name: "Cancel", exact: true }).count(), "Cancel offered");
});
await shot(p, "my-registrations-desktop");
await check("cancel: dialog first; Esc/Keep does nothing", async () => {
  const card = p.locator(".reg-item", { hasText: "AI Web Development Contest" });
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  const dlg = p.getByRole("dialog"); await dlg.waitFor(); assert((await dlg.innerText()).includes("can't be undone"), "warns about irreversibility");
  await p.keyboard.press("Escape"); await dlg.waitFor({ state: "hidden" });
  eq((await api(`/registrations/${token1}`)).body.status, "CONFIRMED", "still confirmed after Esc");
  await card.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByRole("button", { name: "Keep registration" }).click(); await dlg.waitFor({ state: "hidden" });
  eq((await api(`/registrations/${token1}`)).body.status, "CONFIRMED", "still confirmed after Keep");
});
await check("cancel: confirm cancels, list updates, pass revoked", async () => {
  const card = p.locator(".reg-item", { hasText: "AI Web Development Contest" });
  await card.getByRole("button", { name: "Cancel", exact: true }).click(); await p.getByRole("button", { name: "Yes, cancel registration" }).click();
  await p.getByText("Registration cancelled.").waitFor(); await card.getByText("Cancelled").first().waitFor();
  eq(await card.getByRole("button", { name: "Cancel", exact: true }).count(), 0, "no Cancel button after");
  const r = (await api(`/registrations/${token1}`)).body; eq(r.status, "CANCELLED", "API"); eq(r.pass_token, null, "pass hidden");
  await p.goto(BASE + `/registration/${token1}`); await p.getByText("This registration was cancelled, so the pass is no longer valid.").waitFor();
  eq(await p.locator("svg.qr-svg").count(), 0, "no QR"); eq(await p.getByRole("button", { name: "Cancel registration" }).count(), 0, "no cancel button");
});
await check("a cancelled seat can be re-registered with the same email", async () => {
  await p.goto(BASE + "/events/4/register"); await p.getByLabel("Full name").fill("Test Student"); await p.getByLabel("Email").fill(email1); await p.getByLabel("Year of study").selectOption("3rd");
  await p.getByRole("button", { name: "Register" }).click(); await p.waitForURL(/\?new=1/); await p.locator("svg.qr-svg").waitFor();
});

// ===================================================================================================================
console.log("\n[3] Approval flow (PENDING), validation and error handling");
const email2 = `pending.${stamp}@example.com`; let token2;
await check("approval-required event: validation errors, focus on first invalid field", async () => {
  await p.goto(BASE + "/events/5/register"); await p.getByRole("button", { name: "Request a seat" }).click();
  const invalid = await p.$$eval('[aria-invalid="true"]', (els) => els.map((e) => e.name)); assert(invalid.length >= 5, "name, email, team, size, phone flagged: " + invalid);
  eq(await p.evaluate(() => document.activeElement.name), "name", "focus on first invalid field");
  assert((await p.getByRole("alert").allInnerTexts()).some((t) => t.includes("Team name")), "field message names the field");
  await p.getByLabel("Contact number").fill("abc"); await p.getByLabel("Email").fill("nope"); await p.getByRole("button", { name: "Request a seat" }).click();
  await p.getByText("Enter a valid phone number").waitFor(); await p.getByText("Enter a valid email address.").first().waitFor();
});
await check("submit a request: Request received, Pending, no QR, can cancel", async () => {
  await p.getByLabel("Full name").fill("Pending Person"); await p.getByLabel("Email").fill(email2); await p.getByLabel("Team name").fill("Byte Me"); await p.getByLabel("Team size").selectOption("2");
  await p.getByLabel("Contact number").fill("01712-345678"); await p.getByLabel("Anything we should know?").fill("Needs a power socket.");
  await p.getByRole("button", { name: "Request a seat" }).click(); await p.waitForURL(/\?new=1/); token2 = p.url().match(/registration\/([\w-]+)/)[1];
  await p.getByText("Request received.").waitFor(); assert((await p.locator(".pass-card").innerText()).includes("waiting for organizer approval"), "pending copy");
  eq(await p.locator("svg.qr-svg").count(), 0, "no QR while pending"); await p.getByText("Needs a power socket.").waitFor();
  assert(await p.getByRole("button", { name: "Cancel registration" }).count(), "cancel offered");
});
await check("organizer approval makes the QR appear (Check again)", async () => {
  const reg = (await admin("GET", "/registrations?q=" + encodeURIComponent(email2))).items[0]; await admin("PATCH", `/registrations/${reg.id}`, { status: "CONFIRMED" });
  await p.getByRole("button", { name: "Check again" }).click(); await p.locator("svg.qr-svg").waitFor();
});
await shot(p, "registration-pending-then-confirmed");
await check("REJECTED and CHECKED_IN states render correctly", async () => {
  const reg = (await admin("GET", "/registrations?q=" + encodeURIComponent(email2))).items[0];
  await admin("PATCH", `/registrations/${reg.id}`, { status: "REJECTED" }); await p.reload(); await p.getByText("not approved").first().waitFor();
  assert((await p.locator(".pass-top").innerText()).includes("Rejected"), "Rejected badge"); eq(await p.locator("svg.qr-svg").count(), 0, "no QR");
  await admin("PATCH", `/registrations/${reg.id}`, { status: "CONFIRMED" }); await admin("POST", `/registrations/${reg.id}/check-in`);
  await p.reload(); await p.getByText("The pass has been used.").waitFor(); assert((await p.locator(".pass-top").innerText()).includes("Checked in"), "Checked in badge");
  eq(await p.getByRole("button", { name: "Cancel registration" }).count(), 0, "cannot cancel after check-in");
});
await check("duplicate registration is explained on the email field", async () => {
  await p.goto(BASE + "/events/5/register"); await p.getByLabel("Full name").fill("Dup"); await p.getByLabel("Email").fill(email2); await p.getByLabel("Team name").fill("T"); await p.getByLabel("Team size").selectOption("1"); await p.getByLabel("Contact number").fill("01712345678");
  quiet++; await p.getByRole("button", { name: "Request a seat" }).click(); await p.getByText("This email is already registered for this event.").first().waitFor(); quiet--;
  eq(await p.evaluate(() => document.activeElement.name), "email", "focus moves to email");
});
await check("server-side field error is shown on that field", async () => {
  await p.route("**/api/events/5/register", (r) => r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "validation_failed", message: '"Team name" is too long', field: "team" }) }));
  await p.getByLabel("Email").fill("someone." + stamp + "@example.com"); quiet++; await p.getByRole("button", { name: "Request a seat" }).click();
  await p.getByText('"Team name" is too long').waitFor(); quiet--; eq(await p.getByLabel("Team name").getAttribute("aria-invalid"), "true", "team flagged");
  await p.unroute("**/api/events/5/register");
});
await check("network failure: friendly message, form data kept, retry succeeds", async () => {
  await p.route("**/api/events/5/register", (r) => r.abort("failed")); quiet++;
  const e3 = `net.${stamp}@example.com`; await p.getByLabel("Email").fill(e3); await p.getByRole("button", { name: "Request a seat" }).click();
  await p.getByText("Unable to connect to the server.").waitFor(); quiet--;
  assert(!(await p.locator("main").innerText()).includes("Failed to fetch"), "no raw fetch error"); eq(await p.getByLabel("Team name").inputValue(), "T", "data kept");
  await p.unroute("**/api/events/5/register"); await p.getByRole("button", { name: "Request a seat" }).click(); await p.waitForURL(/\?new=1/);
});
await check("timeout: friendly message", async () => {
  await p.goto(BASE + "/events/5/register"); await p.evaluate(() => localStorage.setItem("ditc.apiTimeoutMs", "700"));
  await p.route("**/api/events/5/register", async (r) => { await new Promise((s) => setTimeout(s, 2500)); r.abort("timedout").catch(() => {}); });
  await p.getByLabel("Full name").fill("Slow"); await p.getByLabel("Email").fill(`slow.${stamp}@example.com`); await p.getByLabel("Team name").fill("T"); await p.getByLabel("Team size").selectOption("1"); await p.getByLabel("Contact number").fill("01712345678");
  await p.getByRole("button", { name: "Request a seat" }).click(); await p.getByText("The server took too long to respond.").waitFor();
  await p.unroute("**/api/events/5/register"); await p.evaluate(() => localStorage.removeItem("ditc.apiTimeoutMs"));
});
await check("full / closed / ended events show the reason and no form", async () => {
  for (const [ev, text] of [[FULL, "All seats have been taken."], [CLOSED, "Registration closed on"], [ENDED, "This event has already started."]]) {
    await p.goto(BASE + `/events/${ev.id}/register`); await p.getByText(text).waitFor();
    eq(await p.locator("form").count(), 0, `no form for ${ev.registration_state}`);
    await p.goto(BASE + `/events/${ev.id}`); eq(await p.getByRole("link", { name: /Register|Request a Seat/ }).count(), 0, `no register link on ${ev.registration_state} event page`);
  }
});
await check("archived event: register URL is not found, no form", async () => {
  quiet++; await p.goto(BASE + `/events/${archEv.id}/register`); await p.getByRole("heading", { name: "Not found" }).waitFor(); quiet--; eq(await p.locator("form").count(), 0, "no form");
});
await check("event fills while the form is open: submit explains and swaps to Registration Full", async () => {
  await p.goto(BASE + `/events/${tinyEv.id}/register`); await p.getByLabel("Full name").fill("Late Comer"); await p.getByLabel("Email").fill(`late.${stamp}@example.com`);
  const r = await api(`/events/${tinyEv.id}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "First", email: `first.${stamp}@example.com`, answers: {} }) }); eq(r.status, 201, "other person took the seat");
  quiet++; await p.getByRole("button", { name: "Register" }).click(); await p.getByText("This event is full.").first().waitFor(); quiet--;
  await p.getByText("Registration Full.").waitFor(); eq(await p.locator("form").count(), 0, "form replaced");
});
await check("bad tokens: malformed -> not found without API; unknown -> not found state", async () => {
  let hit = 0; p.on("request", (r) => { if (r.url().includes("/api/registrations/")) hit++; });
  await p.goto(BASE + "/registration/bad!token"); await p.getByText(/Page not found/i).first().waitFor(); eq(hit, 0, "no API call for malformed token");
  quiet++; await p.goto(BASE + "/registration/abcdefghijklmnop"); await p.getByText("Registration not found").waitFor(); quiet--;
});

// ===================================================================================================================
console.log("\n[4] Every backend field type, order, labels");
const email3 = `types.${stamp}@example.com`;
await check("form is built from the event's form_schema in order with the right controls", async () => {
  await p.goto(BASE + `/events/${typesEv.id}/register`); await p.getByLabel("Full name").waitFor();
  const labels = await p.$$eval(".field > label", (ls) => ls.map((l) => l.firstChild.textContent.trim())); eq(labels.join("|"), ["Full name", "Email", ...ALL_TYPES.map((f) => f.label)].join("|"), "label order");
  eq(await p.getByLabel("Parent email").getAttribute("type"), "email", "email type"); eq(await p.getByLabel("Mobile number").getAttribute("type"), "tel", "tel type");
  eq(await p.getByLabel("Your age").getAttribute("inputmode"), "decimal", "number input mode"); eq(await p.getByLabel("About your project").evaluate((e) => e.tagName), "TEXTAREA", "textarea");
  eq(await p.getByLabel("Track").evaluate((e) => e.tagName), "SELECT", "select"); eq((await p.getByLabel("Track").locator("option").allInnerTexts()).join("|"), "Choose an option…|Beginner|Advanced", "options");
  const req = await p.$$eval(".field > label", (ls) => ls.map((l) => !!l.querySelector(".req"))); eq(req.join(), [true, true, false, true, true, true, true, false].join(), "required markers follow the schema");
});
await check("number/tel/email validation, then success; registration page shows each answer with its label", async () => {
  await p.getByLabel("Full name").fill("Types Tester"); await p.locator('input[name="email"]').fill(email3); await p.getByLabel("Parent email").fill("parent@example.com");
  await p.getByLabel("Mobile number").fill("01712-345678"); await p.getByLabel("Your age").fill("12a"); await p.getByLabel("Track").selectOption("Advanced");
  await p.getByRole("button", { name: "Register" }).click(); await p.getByText("Enter a number.").waitFor();
  await p.getByLabel("Your age").fill("12"); await p.getByLabel("About your project").fill("A robot\nthat waters plants"); await p.getByLabel("Nickname").fill("Tester");
  await p.getByRole("button", { name: "Register" }).click(); await p.waitForURL(/\?new=1/);
  await p.getByText("Parent email").waitFor();
  const t = await p.locator("main").innerText(); for (const s of ["Nickname", "Tester", "Parent email", "parent@example.com", "Mobile number", "Your age", "12", "Track", "Advanced", "About your project", "A robot"]) assert(t.toLowerCase().includes(s.toLowerCase()), `shows ${s}`);
});

// ===================================================================================================================
console.log("\n[5] Volunteer: Volunteer -> Form -> Submit -> Confirmation");
const vEmail = `vol.${stamp}@example.com`;
await check("Volunteer is in the public navigation and opens the page", async () => {
  await p.goto(BASE + "/"); await p.locator("nav[aria-label=Main]").getByRole("link", { name: "Volunteer" }).click(); await p.waitForURL("**/volunteer");
  assert(await p.getByRole("heading", { level: 1 }).count() === 1, "single h1");
});
await check("page shows backend domains and no hard-coded poster date", async () => {
  const t = await p.locator("main").innerText(); for (const d of ["Programming", "Graphics Design", "AI Development", "Video Editing", "Robotics"]) assert(t.includes(d), d);
  assert(!/20 August|August, 2026|10:00 AM/i.test(t), "no poster date/time");
});
await shot(p, "volunteer-desktop");
await check("empty submit flags every required field; focus on first", async () => {
  await p.getByRole("button", { name: "Send application" }).click(); eq((await p.$$('[aria-invalid="true"]')).length, 7, "7 invalid fields"); eq(await p.evaluate(() => document.activeElement.name), "name", "focus");
});
await check("per-field validation mirrors the backend (roll digits, phone, statement length)", async () => {
  await p.getByLabel("Full name").fill("Aisha Rahman"); await p.getByLabel("Class / section").fill("10 Science A"); await p.getByLabel("Roll number").fill("12ab"); await p.getByLabel("Contact number").fill("123");
  await p.getByLabel("Email").fill(vEmail); await p.getByLabel("Area of interest").selectOption("Robotics"); await p.getByLabel("Why do you want").fill("too short");
  await p.getByRole("button", { name: "Send application" }).click(); await p.getByText("Use digits only, up to 8.").waitFor(); await p.getByText("Enter a valid number").waitFor(); await p.getByText("Tell us a little more").waitFor();
});
await check("server error is shown without losing the form", async () => {
  await p.getByLabel("Roll number").fill("2042"); await p.getByLabel("Contact number").fill("01712-345678"); await p.getByLabel("Why do you want").fill("I enjoy building robots and want to help run the robotics events.");
  await p.route("**/api/volunteers", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal_error", message: "Something went wrong on our side. Please try again." }) })); quiet++;
  await p.getByRole("button", { name: "Send application" }).click(); await p.getByText("Something went wrong on our side.").waitFor(); quiet--; eq(await p.getByLabel("Full name").inputValue(), "Aisha Rahman", "form kept");
  await p.unroute("**/api/volunteers");
});
await check("network error is friendly", async () => {
  await p.route("**/api/volunteers", (r) => r.abort("failed")); quiet++; await p.getByRole("button", { name: "Send application" }).click(); await p.getByText("Unable to connect to the server.").waitFor(); quiet--; await p.unroute("**/api/volunteers");
});
await check("successful submit shows the confirmation state and the data reaches the backend", async () => {
  await p.getByRole("button", { name: "Send application" }).click(); await p.getByRole("heading", { name: "Application received" }).waitFor();
  const t = await p.locator("main").innerText(); assert(t.includes("Robotics") && t.includes(vEmail), "summary");
  const v = (await admin("GET", "/volunteers")).find((x) => x.email === vEmail); assert(v && v.roll === "2042" && v.cls === "10 Science A" && v.domain === "Robotics", "stored with real fields");
  eq(await p.evaluate(() => document.activeElement.getAttribute("role")), "status", "focus moved to confirmation");
});
await shot(p, "volunteer-success-desktop");
await check("duplicate application is explained on the email field", async () => {
  await p.goto(BASE + "/volunteer"); await p.getByLabel("Full name").fill("Aisha Again"); await p.getByLabel("Class / section").fill("10"); await p.getByLabel("Roll number").fill("1"); await p.getByLabel("Contact number").fill("01712345678");
  await p.getByLabel("Email").fill(vEmail); await p.getByLabel("Area of interest").selectOption("Programming"); await p.getByLabel("Why do you want").fill("Trying to apply a second time with the same email address.");
  quiet++; await p.getByRole("button", { name: "Send application" }).click(); await p.getByText("This email has already applied.").waitFor(); quiet--;
});
await check("organizer: Volunteers page lists the applicant (guarded, search, filter)", async () => {
  await p.goto(BASE + "/organizer/volunteers"); await p.waitForURL(/organizer\/login/);
  await p.getByLabel(/key/i).fill(KEY); await p.getByRole("button", { name: /sign in|continue|log in/i }).click(); await p.waitForURL("**/organizer/volunteers");
  await p.getByText("Aisha Rahman").waitFor(); const row = p.locator("tbody tr", { hasText: "Aisha Rahman" });
  assert((await row.innerText()).includes("Robotics") && (await row.innerText()).includes("Roll 2042"), "row content"); assert(await row.locator(`a[href="mailto:${vEmail}"]`).count(), "mailto link");
  await p.getByLabel("Search applicants").fill("zzz"); await p.getByText("No applicants match").waitFor(); await p.getByLabel("Search applicants").fill("aisha"); await p.getByText("Aisha Rahman").waitFor();
  await p.getByLabel("Area of interest").selectOption("Programming"); await p.getByText("No applicants match").waitFor();
  await p.getByLabel("Area of interest").selectOption(""); await p.locator("summary", { hasText: "Read statement" }).first().click(); await p.getByText("I enjoy building robots").waitFor();
});
await shot(p, "organizer-volunteers-desktop");

// ===================================================================================================================
console.log("\n[6] Gallery: Gallery -> view photos (slideshow) -> Mobile");
const counter = (pg) => pg.locator(".gallery-count").innerText();
await check("gallery shows real photographs: loaded, true intrinsic sizes, descriptive alt text, a caption each; no placeholders", async () => {
  const types = []; p.on("response", (r) => { if (/\.jpg$/.test(new URL(r.url()).pathname)) types.push([r.status(), r.headers()["content-type"]]); });
  await p.goto(BASE + "/gallery"); await p.waitForSelector(".gallery-feature-img"); await p.getByRole("button", { name: "Pause slideshow" }).click(); await p.mouse.move(0, 0);
  const n = await p.locator(".gallery-thumb").count(); assert(n >= 3, `photos: ${n}`); eq(await counter(p), `Photo 1 of ${n}`);
  await p.waitForFunction(() => [...document.querySelectorAll(".gallery-thumb img, .gallery-feature-img")].every((i) => i.complete && i.naturalWidth > 0));
  const sizes = await p.$$eval(".gallery-thumb img", (imgs) => imgs.map((i) => [Number(i.getAttribute("width")), Number(i.getAttribute("height")), i.naturalWidth, i.naturalHeight]));
  assert(sizes.every(([w, h, nw, nh]) => w === nw && h === nh), "width/height attributes equal the real image size: " + JSON.stringify(sizes));
  const labels = await p.$$eval(".gallery-thumb", (els) => els.map((e) => e.getAttribute("aria-label"))); assert(labels.every((l, i) => l.startsWith(`Show photo ${i + 1} of ${n}: `) && l.length > 40), "thumbnails are labelled with the photo's description");
  for (let i = 0; i < n; i++) {
    await p.locator(".gallery-thumb").nth(i).click(); eq(await counter(p), `Photo ${i + 1} of ${n}`);
    const alt = await p.locator(".gallery-feature-img").getAttribute("alt"), cap = await p.locator(".gallery-caption p").innerText(), album = await p.locator(".gallery-caption .tech-pill").innerText();
    assert(alt.length > 30 && cap.length > 10 && album.length > 3, `photo ${i + 1}: alt/caption/album present`); assert(labels[i].endsWith(alt), "thumbnail and photo share one description");
    eq(await p.locator(".gallery-thumb").nth(i).getAttribute("aria-current"), "true");
  }
  eq(await p.getByText(/placeholder|sample layout/i).count(), 0, "no placeholder wording left");
  assert(types.length >= n && types.every(([st, ct]) => st === 200 && ct === "image/jpeg"), "photos are served as image/jpeg: " + JSON.stringify(types));
});
await check("slideshow: next / previous by button and arrow keys, wraps both ways; the photo is never covered by its caption or controls", async () => {
  const n = await p.locator(".gallery-thumb").count(); await p.locator(".gallery-thumb").first().click();
  await p.getByRole("button", { name: "Next photo" }).click(); eq(await counter(p), `Photo 2 of ${n}`); await p.keyboard.press("ArrowRight"); eq(await counter(p), `Photo 3 of ${n}`);
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); eq(await counter(p), `Photo 1 of ${n}`);
  await p.getByRole("button", { name: "Previous photo" }).click(); eq(await counter(p), `Photo ${n} of ${n}`); await p.getByRole("button", { name: "Next photo" }).click(); eq(await counter(p), `Photo 1 of ${n}`);
  const frame = await p.locator(".gallery-feature").boundingBox(), bar = await p.locator(".gallery-bar").boundingBox(); assert(bar.y >= frame.y + frame.height - 1, `caption bar sits below the photo frame (${bar.y} vs ${frame.y + frame.height})`);
  await shot(p, "gallery-desktop");
});
await check("autoplay advances by itself and Pause stops it; with reduced motion it starts paused; typing in Tech Guide is not a shortcut", async () => {
  const n = await p.locator(".gallery-thumb").count();
  await p.reload(); await p.waitForSelector(".gallery-feature-img"); await p.mouse.move(0, 0); eq(await counter(p), `Photo 1 of ${n}`);
  await p.waitForFunction((want) => document.querySelector(".gallery-count").textContent === want, `Photo 2 of ${n}`, { timeout: 9000 });
  await p.getByRole("button", { name: "Pause slideshow" }).click(); await p.mouse.move(0, 0); await p.waitForTimeout(7000); eq(await counter(p), `Photo 2 of ${n}`, "stays put while paused");
  await p.keyboard.press("Space"); await p.getByRole("button", { name: "Pause slideshow" }).waitFor(); await p.keyboard.press("Space"); await p.getByRole("button", { name: "Play slideshow" }).waitFor();
  await p.getByRole("button", { name: /Ask Tech Guide/ }).click(); const box = p.getByLabel("Ask the assistant"); await box.click(); await p.keyboard.type("fun fests for me");
  eq(await box.inputValue(), "fun fests for me", "spaces and the letter f are typed, not swallowed"); eq(await p.locator(".gallery-full").count(), 0, "typing f did not open fullscreen"); await p.getByRole("button", { name: "Play slideshow" }).waitFor();
  await p.getByRole("button", { name: "Close assistant" }).click();
  const rp = await newPage(1280, 900, { reducedMotion: "reduce" }); await rp.goto(BASE + "/gallery"); await rp.waitForSelector(".gallery-feature-img"); await rp.getByRole("button", { name: "Play slideshow" }).waitFor();
  eq(await rp.locator(".gallery-feature-img").evaluate((e) => getComputedStyle(e).animationName), "none", "no fade animation"); await rp.context().close();
});
await check("fullscreen: covers the whole screen above the header, shows the photo uncropped, page behind can't scroll; Esc exits and focus returns", async () => {
  await p.getByRole("button", { name: "Fullscreen", exact: true }).click(); const full = p.locator(".gallery-full"); await full.waitFor(); await p.waitForTimeout(500);
  const b = await full.boundingBox(); assert(b.x === 0 && b.y === 0 && b.width === 1280 && b.height === 900, `covers the viewport: ${JSON.stringify(b)}`);
  const top = await p.evaluate(() => { const el = document.elementFromPoint(640, 20); return !!el.closest(".gallery-full"); }); assert(top, "nothing (header, assistant button) sits on top of it");
  eq(await p.locator(".gallery-feature-img").evaluate((e) => getComputedStyle(e).objectFit), "contain", "whole photo visible"); assert(await p.evaluate(() => document.documentElement.classList.contains("scroll-lock")), "page scroll locked");
  assert(await p.evaluate(() => document.activeElement.textContent.includes("Exit fullscreen")), "focus is on Exit fullscreen");
  await p.keyboard.press("ArrowRight"); await shot(p, "gallery-fullscreen-desktop");
  await p.keyboard.press("Escape"); await full.waitFor({ state: "detached" }); assert(!(await p.evaluate(() => document.documentElement.classList.contains("scroll-lock"))), "scroll unlocked");
  assert(await p.evaluate(() => document.activeElement.textContent.trim() === "Fullscreen"), "focus back on the Fullscreen button");
  await p.keyboard.press("f"); await full.waitFor(); await p.keyboard.press("f"); await full.waitFor({ state: "detached" });
});
await p.context().close();

// ===================================================================================================================
console.log("\n[7] Mobile + responsive: 375 / 768 / 1024 / 1440");
const ROUTES = ["/", "/events", "/events/4", "/events/5/register", `/events/${typesEv.id}/register`, "/clubs", "/my-registrations", "/volunteer", "/gallery", "/registration/PASS"];
for (const w of [375, 768, 1024, 1440]) {
  const pg = await newPage(w, w === 375 ? 740 : 900, w === 375 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
  // give this browser context a saved registration + a live pass token so /my-registrations and the pass page have real content
  const rr = await api("/events/4/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Resp Tester", email: `resp${w}.${stamp}@example.com`, answers: { year: "2nd" } }) });
  const tok = rr.body.manage_token; await pg.goto(BASE + "/"); await pg.evaluate(([t]) => localStorage.setItem("ditc.mine", JSON.stringify([{ token: t, title: "AI Web Development Contest" }])), [tok]);
  await check(`${w}px: no horizontal overflow on ${ROUTES.length} public routes`, async () => {
    const bad = [];
    for (const r of ROUTES) {
      await pg.goto(BASE + r.replace("PASS", tok)); await pg.waitForLoadState("networkidle");
      const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, bw: document.body.scrollWidth }));
      if (m.sw > m.iw || m.bw > m.iw) bad.push(`${r}: scrollWidth ${m.sw} > ${m.iw}`);
    }
    assert(!bad.length, bad.join("; "));
  });
  await check(`${w}px: header navigation fits (menu button below 1060px, inline nav above)`, async () => {
    await pg.goto(BASE + "/"); const inline = await pg.locator("nav[aria-label=Main]").isVisible(), btn = await pg.getByRole("button", { name: "Open menu" }).isVisible();
    eq(inline, w >= 1060, "inline nav"); eq(btn, w < 1060, "menu button");
    const hdr = await pg.evaluate(() => { const h = document.querySelector(".site-header .container"); return h.scrollWidth <= h.clientWidth + 1; }); assert(hdr, "header content fits");
  });
  if (w < 1060) await check(`${w}px: drawer lists Events, Gallery, Volunteer and focus stays inside`, async () => {
    await pg.goto(BASE + "/"); await pg.getByRole("button", { name: "Open menu" }).click(); const d = pg.getByRole("dialog");
    for (const n of ["Events", "Clubs", "Gallery", "Volunteer", "My registrations"]) assert(await d.getByRole("link", { name: n }).count(), n);
    await d.getByRole("link", { name: "Volunteer" }).click(); await pg.waitForURL("**/volunteer"); await pg.getByRole("dialog").waitFor({ state: "hidden" });
  });
  if (w === 375 || w === 768 || w === 1440) {
    for (const [name, r] of [["home", "/"], ["events", "/events"], ["register", "/events/5/register"], ["pass", `/registration/${tok}`], ["mine", "/my-registrations"], ["volunteer", "/volunteer"], ["gallery", "/gallery"]]) { await pg.goto(BASE + r); await pg.waitForLoadState("networkidle"); await shot(pg, `${name}-${w}`); }
  }
  if (w === 375) {
    await check("375px: QR pass is large enough to scan (>= 200px) and fits the card", async () => {
      await pg.goto(BASE + `/registration/${tok}`); const b = await pg.locator("svg.qr-svg").boundingBox(); assert(b.width >= 200 && b.width <= 340, "qr width " + b.width);
    });
    await check("375px: slideshow fits the phone screen, 44px arrows, swipe changes the photo, fullscreen fits", async () => {
      const tp = await newPage(375, 740, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });   // fresh, touch-only, like a phone
      await tp.goto(BASE + "/gallery"); await tp.waitForSelector(".gallery-feature-img"); await tp.getByRole("button", { name: "Pause slideshow" }).tap();
      for (const sel of [".gallery-figure", ".gallery-feature", ".gallery-bar", ".gallery-thumbs"]) { const b = await tp.locator(sel).boundingBox(); assert(b.x >= 0 && b.x + b.width <= 375.5, `${sel} is inside the screen: ${Math.round(b.x)}..${Math.round(b.x + b.width)}`); }
      for (const name of ["Previous photo", "Next photo"]) { const b = await tp.getByRole("button", { name }).boundingBox(); assert(b.width >= 44 && b.height >= 44, `${name} is ${b.width}x${b.height}`); }
      const n = await tp.locator(".gallery-thumb").count();
      const swipe = (from, to) => tp.locator(".gallery-feature").evaluate((el, [x1, x2]) => { const r = el.getBoundingClientRect(), y = r.top + r.height / 2;
        const t = (x) => new Touch({ identifier: 1, target: el, clientX: r.left + x, clientY: y });
        el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, changedTouches: [t(x1)], touches: [t(x1)] })); el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [t(x2)], touches: [] })); }, [from, to]);
      await swipe(260, 80); await tp.waitForFunction((w) => document.querySelector(".gallery-count").textContent === w, `Photo 2 of ${n}`);
      await swipe(80, 260); await tp.waitForFunction((w) => document.querySelector(".gallery-count").textContent === w, `Photo 1 of ${n}`);
      await swipe(150, 170); await tp.waitForTimeout(200); eq(await tp.locator(".gallery-count").innerText(), `Photo 1 of ${n}`, "a tap or tiny drag is not a swipe");
      await shot(tp, "gallery-375-phone");
      await tp.getByRole("button", { name: "Fullscreen", exact: true }).tap(); const f = tp.locator(".gallery-full"); await f.waitFor(); await tp.waitForTimeout(400);
      const b = await f.boundingBox(); assert(b.width === 375 && b.height === 740, `fullscreen ${b.width}x${b.height}`);
      const ex = await tp.getByRole("button", { name: "Exit fullscreen" }).boundingBox(); assert(ex && ex.x >= 0 && ex.x + ex.width <= 375 && ex.y + ex.height <= 740, "Exit fullscreen is on screen");
      await shot(tp, "gallery-375-fullscreen"); await tp.getByRole("button", { name: "Exit fullscreen" }).tap(); await f.waitFor({ state: "detached" }); await tp.context().close();
    });
    await check("375px: volunteer form fields are full width, 44px+ touch targets", async () => {
      await pg.goto(BASE + "/volunteer"); const hs = await pg.$$eval("input, select, textarea, button.btn", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect().height)); assert(hs.every((h) => h >= 43.5), "min height " + Math.min(...hs));
    });
  }
  await pg.context().close();
}
await check("organizer volunteers page has no overflow at 375 and 1024 (stacked table on mobile)", async () => {
  for (const w of [375, 1024]) { const pg = await newPage(w, 800); await pg.goto(BASE + "/organizer/login"); await pg.evaluate((k) => sessionStorage.setItem("ditc.organizerKey", k), KEY);
    await pg.goto(BASE + "/organizer/volunteers"); await pg.getByText("Aisha Rahman").waitFor(); const m = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert(m[0] <= m[1], `${w}: ${m}`); if (w === 375) await shot(pg, "organizer-volunteers-375"); await pg.context().close(); }
});

// ===================================================================================================================
console.log("\n[8] Accessibility spot checks + console");
const ap = await newPage();
await check("every form control on register/volunteer pages has an associated label; one h1 per page", async () => {
  for (const r of ["/events/5/register", "/volunteer", "/my-registrations", "/events", `/events/${typesEv.id}/register`]) {
    await ap.goto(BASE + r); await ap.waitForLoadState("networkidle");
    const bad = await ap.$$eval("input:not([type=hidden]), select, textarea", (els) => els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute("aria-label")).map((e) => e.name || e.type));
    assert(!bad.length, `${r}: unlabelled ${bad}`); eq(await ap.locator("h1").count(), 1, `${r}: h1 count`);
  }
});
await check("no Content-Security-Policy violations or console errors in any flow above", async () => { assert(!consoleErrors.length, consoleErrors.slice(0, 5).join("\n")); });
await browser.close();
const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`); process.exit(failed ? 1 : 0);
