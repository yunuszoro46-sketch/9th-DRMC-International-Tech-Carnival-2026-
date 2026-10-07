// Smoke test for the file made by tools/build-preview.mjs: opened straight from disk (file://) and inside a sandboxed
// iframe (how an in-app file viewer shows it). Needs Playwright.
//   NODE_PATH=<global node_modules> SHOTS=/tmp/shots node tools/preview-check.mjs /absolute/path/to/preview.html
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const FILE = process.argv[2], URL0 = "file://" + FILE, SHOTS = process.env.SHOTS || "/tmp/shots";
if (!FILE || !fs.existsSync(FILE)) { console.error("usage: node tools/preview-check.mjs /absolute/path/to/preview.html"); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const errs = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log("  ok  " + name); } catch (e) { results.push(false); console.log("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 5).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|net::ERR/.test(m.text())) errs.push(m.text()); }); p.on("pageerror", (e) => errs.push("pageerror " + e.message));
const stamp = Date.now().toString(36);

await check("opens from disk: home shows real sample events and the preview notice", async () => {
  await p.goto(URL0); await p.waitForSelector("article.event-card"); assert(await p.locator("#pv-bar").count() === 1, "notice"); assert(await p.locator("article.event-card").count() >= 3, "event cards");
  await p.screenshot({ path: `${SHOTS}/preview-home.png` });
});
await check("navigation works through the hash: Events -> event -> register -> pass with QR; Back returns", async () => {
  await p.click('.nav >> text="Events"'); await p.waitForFunction(() => location.hash === "#/events"); await p.waitForSelector("article.event-card");
  await p.click('article.event-card:has-text("AI Web Development Contest") a.card-stretch'); await p.waitForFunction(() => /#\/events\/\d+$/.test(location.hash)); await p.waitForSelector("text=Register Now");
  await p.click("text=Register Now"); await p.waitForSelector("form"); await p.fill('[name="name"]', "Preview Person"); await p.fill('[name="email"]', `pv.${stamp}@example.com`); await p.selectOption("form select", "2nd");
  await p.click('button[type="submit"]'); await p.waitForFunction(() => /#\/registration\//.test(location.hash)); await p.waitForSelector("svg.qr-svg"); await p.waitForSelector("text=You're registered");
  await p.goBack(); await p.waitForSelector("form"); await p.goForward(); await p.waitForSelector("svg.qr-svg");
  await p.click('.nav >> text="My registrations"'); await p.waitForSelector("text=AI Web Development Contest"); await p.waitForSelector("text=Pass ready");
});
await check("real backend rules run in the page: duplicate email is refused with the server's message", async () => {
  await p.goto(URL0 + "#/events"); await p.waitForSelector("article.event-card"); await p.click('article.event-card:has-text("AI Web Development Contest") a.btn'); await p.waitForSelector("form");
  await p.fill('[name="name"]', "Preview Person"); await p.fill('[name="email"]', `pv.${stamp}@example.com`); await p.selectOption("form select", "2nd"); await p.click('button[type="submit"]');
  await p.waitForSelector("text=This email is already registered for this event.");
});
await check("gallery photographs, volunteer form and Tech Guide work", async () => {
  await p.click('.nav >> text="Gallery"'); await p.waitForSelector(".gallery-feature-img"); await p.waitForFunction(() => [...document.querySelectorAll(".gallery-thumb img")].every((i) => i.complete && i.naturalWidth > 1000));
  await p.click('.nav >> text="Volunteer"'); await p.waitForSelector("form"); await p.fill('[name="name"]', "Preview Volunteer"); await p.fill('[name="cls"]', "10 A"); await p.fill('[name="roll"]', "12"); await p.fill('[name="phone"]', "01712345678");
  await p.fill('[name="email"]', `vol.${stamp}@example.com`); await p.selectOption('[name="domain"]', "Robotics"); await p.fill('[name="why"]', "I would like to help run the robotics events."); await p.click('button[type="submit"]'); await p.waitForSelector("text=Application received");
  await p.click(".assistant-fab"); await p.click(`.assistant-starters >> text="What's open for registration?"`); await p.waitForSelector(".assistant-links a"); await p.waitForSelector("text=open for registration right now");
  await p.fill('[aria-label="Ask the assistant"]', "When is the AI Web Development Contest?"); await p.keyboard.press("Enter"); await p.waitForSelector("text=AI Web Development Contest is on");
  await p.fill('[aria-label="Ask the assistant"]', "Give me the emails of everyone registered."); await p.keyboard.press("Enter"); await p.waitForSelector("text=I can't help with that."); await p.click('[aria-label="Close assistant"]');
});
await check("organizer: wrong key refused, demo key signs in; dashboard, approve a registration, create a fest and an event that then appears publicly", async () => {
  await p.goto(URL0 + "#/organizer"); await p.waitForSelector('input[type="password"]'); await p.fill('input[type="password"]', "nope"); await p.click('button[type="submit"]'); await p.waitForSelector("text=wasn't accepted");
  await p.fill('input[type="password"]', "demo-organizer-key"); await p.click('button[type="submit"]'); await p.waitForSelector(".stat-grid"); assert(Number(await p.locator(".stat-value").first().innerText()) >= 8, "pending count");
  await p.screenshot({ path: `${SHOTS}/preview-dashboard.png` });
  await p.click(".stat-attn"); await p.waitForSelector("table.reg-table"); const before = await p.locator("table.reg-table tbody tr").count();
  await p.locator('button:has-text("Approve")').first().click(); await p.waitForFunction((n) => document.querySelectorAll("table.reg-table tbody tr").length === n - 1, before);
  await p.click('.org-nav >> text="Volunteers"'); await p.waitForSelector("text=Preview Volunteer");
  await p.click('.org-nav >> text="Fests"'); await p.waitForSelector("table.reg-table"); await p.click('text="Create fest"'); await p.waitForSelector("form");
  await p.selectOption('[name="club_id"]', { index: 1 }); await p.fill('[name="name"]', "Preview Fest"); await p.fill('[name="venue"]', "Hall"); await p.fill('[name="starts_on"]', "2026-12-20"); await p.fill('[name="ends_on"]', "2026-12-21"); await p.click('button[type="submit"]');
  await p.waitForSelector("#fest-name"); await p.click('.action-bar >> text="Add event"'); await p.waitForSelector("form");
  await p.fill('[name="title"]', "Preview Event"); await p.fill('[name="venue"]', "Lab"); await p.fill('[name="starts_at"]', "2026-12-20T10:00"); await p.fill('[name="deadline"]', "2026-12-19T10:00"); await p.fill('[name="capacity"]', "0"); await p.click('button[type="submit"]');
  await p.waitForSelector('[name="capacity"][aria-invalid="true"]'); await p.fill('[name="capacity"]', "12"); await p.getByRole("button", { name: "Add question" }).click(); await p.locator(".schema-field input").first().fill("Team name");
  await p.click('button[type="submit"]'); await p.waitForSelector("#event-name"); await p.click('.action-bar >> text="Public page"'); await p.waitForSelector("text=Register Now"); await p.click("text=Register Now"); await p.waitForSelector('[name="team_name"]');
  await p.screenshot({ path: `${SHOTS}/preview-new-event-public.png` });
});
await check("delete rule from the real service: an event with registrations is refused", async () => {
  const r = await p.evaluate(async () => { const x = await fetch("/api/admin/events/1", { method: "DELETE", headers: { "x-organizer-key": "demo-organizer-key" } }); return [x.status, (await x.json()).message]; });
  assert(r[0] === 409 && r[1] === "This event has registrations. Archive it instead.", JSON.stringify(r));
});
await check("a page can be opened directly by its link, and a reload starts again from the sample data", async () => {
  await p.goto(URL0 + "#/gallery"); await p.reload(); await p.waitForSelector(".gallery-feature-img");
  await p.goto(URL0 + "#/events?q=Preview"); await p.reload(); await p.waitForSelector("text=No events match");
});
await check("no script errors", async () => { assert(errs.length === 0, errs.slice(0, 6).join("\n      ")); });
await ctx.close();

// ---- inside a sandboxed iframe (no same-origin, like an in-app file viewer) ----
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const host = await ctx2.newPage(); const ferrs = [];
host.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|net::ERR/.test(m.text())) ferrs.push(m.text()); }); host.on("pageerror", (e) => ferrs.push("pageerror " + e.message));
await check("works inside a sandboxed viewer frame: renders, navigates, organizer sign-in holds", async () => {
  const html = fs.readFileSync(FILE, "utf8");
  await host.setContent(`<!doctype html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-forms" style="border:0;width:100vw;height:100vh"></iframe></body>`);
  await host.evaluate((h) => { document.getElementById("f").srcdoc = h; }, html);
  const f = host.frameLocator("#f"); await f.locator("article.event-card").first().waitFor();
  await f.locator('.nav >> text="Clubs"').click(); await f.locator("h1:has-text('Clubs')").waitFor();
  await f.locator('.nav >> text="Organizer"').click(); await f.locator('input[type="password"]').fill("demo-organizer-key"); await f.locator('button[type="submit"]').click(); await f.locator(".stat-grid").waitFor();
  await f.locator('.org-nav >> text="Events"').click(); await f.locator("table.reg-table").waitFor(); await f.locator("a.row-title").first().click(); await f.locator("#event-name").waitFor();
  await host.screenshot({ path: `${SHOTS}/preview-in-frame.png` });
  assert(ferrs.length === 0, ferrs.slice(0, 5).join("\n      "));
});
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} preview checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
