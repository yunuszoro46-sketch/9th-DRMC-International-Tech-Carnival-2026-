// Extra browser checks that complement tools/browser-3b.mjs (same setup: real server serving web/dist, Playwright).
//   NODE_PATH=<global node_modules> BASE=http://localhost:3111 SHOTS=/tmp/shots node tools/browser-3b-audit.mjs
// Covers: layout with Orbitron-width headings (the real font is ~30% wider than the fallback), exactly one h1 per route,
// keyboard-only volunteer application, prefers-reduced-motion, and the pass page of an archived event.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3111", SHOTS = process.env.SHOTS || "/tmp/shots", KEY = "demo-organizer-key";
import fs from "node:fs";
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log("  ok  " + name); } catch (e) { results.push(false); console.log("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 6).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const admin = async (method, path, body) => { const r = await fetch(BASE + "/api/admin" + path, { method, headers: { "content-type": "application/json", "x-organizer-key": KEY }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j; };
const post = async (path, body) => { const r = await fetch(BASE + "/api" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const stamp = Date.now().toString(36);
const future = (d) => new Date(Date.now() + d * 864e5).toISOString();
const browser = await chromium.launch();

const events = await (await fetch(BASE + "/api/events?limit=200")).json();
const open = events.find((e) => e.registration_state === "open" && e.auto_confirm);
const reg = (await post(`/events/${open.id}/register`, { name: "Audit Person", email: `audit.${stamp}@example.com`, answers: Object.fromEntries(open.form_schema.map((f) => [f.key, f.type === "select" ? f.options[0] : f.type === "tel" ? "01712345678" : f.type === "email" ? "a@b.co" : f.type === "number" ? "3" : "Audit text"])) }));
assert(reg.status === 201, "fixture registration failed " + JSON.stringify(reg.body));
const token = reg.body.manage_token;

// A. Orbitron is ~30% wider than the fallback used here. Emulate that width on every display-font element and re-check layout.
const WIDE = `h1,h2,.tech-pill,.tech-eyebrow,.brand{letter-spacing:.2em !important}`;
const ROUTES = ["/", "/events", `/events/${open.id}`, `/events/${open.id}/register`, "/clubs", "/clubs/1", "/fests/1", "/gallery", "/volunteer", "/my-registrations", `/registration/${token}`, "/organizer/login", "/nope"];
for (const w of [320, 375, 768, 1024, 1440]) {
  await check(`${w}px with Orbitron-width headings: no overflow, no clipped heading on ${ROUTES.length} routes`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, bypassCSP: true }), page = await ctx.newPage();
    await page.addInitScript((t) => { try { localStorage.setItem("ditc.mine", JSON.stringify([{ token: t, title: "x" }])); } catch {} }, token);
    const bad = [];
    for (const r of ROUTES) {
      await page.goto(BASE + r); await page.waitForSelector("h1", { state: "attached", timeout: 8000 }).catch(() => { throw new Error("no h1 on " + r); }); const h1s = await page.locator("h1").count(); if (h1s !== 1) bad.push(`${r}: ${h1s} h1 elements`); await page.addStyleTag({ content: WIDE }); await page.waitForTimeout(250);
      const res = await page.evaluate(() => {
        const out = [], vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
        for (const el of document.querySelectorAll("h1,h2,.tech-pill,.tech-eyebrow,.brand")) {
          if (el.closest("dialog:not([open])") || el.classList.contains("sr-only")) continue;
          const b = el.getBoundingClientRect(); if (!b.width) continue;
          if (b.right > vw + 1 || b.left < -1) out.push(`${el.tagName} "${el.textContent.slice(0, 30)}" leaves the viewport (${Math.round(b.left)}..${Math.round(b.right)})`);
          // text wider than its own box = clipped/overflowing word
          if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName} "${el.textContent.slice(0, 30)}" overflows its box (${el.scrollWidth} > ${el.clientWidth})`);
          const hero = el.closest(".tech-hero"); if (hero && b.right > hero.getBoundingClientRect().right - 8) out.push(`${el.tagName} "${el.textContent.slice(0, 30)}" touches the hero edge`);
        }
        return out;
      });
      if (res.length) bad.push(`${r}: ${res.join("; ")}`);
      if ((w === 375 || w === 1440) && ["/", "/volunteer", "/gallery", `/registration/${token}`].includes(r)) await page.screenshot({ path: `${SHOTS}/wide-${w}-${r.split("/")[1] || "home"}.png`, fullPage: false });
    }
    await ctx.close();
    assert(!bad.length, bad.join("\n      "));
  });
}

// B. keyboard-only volunteer application
await check("volunteer form can be completed and sent with the keyboard only", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
  await page.goto(BASE + "/volunteer"); await page.waitForSelector("form");
  await page.focus('input[name="name"]');
  const type = async (t) => { await page.keyboard.type(t); await page.keyboard.press("Tab"); };
  await type("Keyboard Tester"); await type("11 Science B"); await type("2042"); await type("01712-345678"); await type(`kb.${stamp}@example.com`);
  assert(await page.evaluate(() => document.activeElement.name === "domain"), "Tab order did not reach the area select");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Tab");
  await page.keyboard.type("I enjoy building things and want to help run the club's events.");
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement.type === "submit"), "Tab did not reach the submit button");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".success-panel");
  assert(await page.evaluate(() => document.activeElement.classList.contains("success-panel")), "focus did not move to the confirmation");
  const list = await admin("GET", "/volunteers"); assert(list.some((v) => v.email === `kb.${stamp}@example.com` && v.domain), "application not stored");
  await page.screenshot({ path: `${SHOTS}/volunteer-success.png` });
  await ctx.close();
});

// C. reduced motion
await check("prefers-reduced-motion: 'Apply now' jumps instead of animating", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 700 }, reducedMotion: "reduce" }), page = await ctx.newPage();
  await page.goto(BASE + "/volunteer"); await page.waitForSelector("form");
  await page.click("text=Apply now");
  const y = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(window.scrollY))));
  const final = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.scrollY), 700)));
  assert(final > 100, "did not scroll"); assert(Math.abs(final - y) < 2, `still animating (${y} -> ${final})`);
  assert(await page.evaluate(() => document.activeElement.name === "name"), "focus not on the first field");
  await ctx.close();
});

// D. pass page for an archived event
await check("pass for an archived event: details stay, no dead 'View event' link; link returns when restored", async () => {
  const ev = await admin("POST", "/events", { fest_id: open.fest_id, title: `Audit archive ${stamp}`, category: "Test", description: "d", rules: "", venue: "Lab", starts_at: future(6), deadline: future(5), capacity: 5, auto_confirm: true, form_schema: [{ key: "team", label: "Team name", type: "text", required: true }] });
  const r = await post(`/events/${ev.id}/register`, { name: "Arch Person", email: `arch.${stamp}@example.com`, answers: { team: "Blue" } });
  await admin("POST", `/events/${ev.id}/archive`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
  await page.goto(`${BASE}/registration/${r.body.manage_token}`); await page.waitForSelector(".pass-card"); await page.waitForSelector("text=Registration information");
  assert(await page.locator("text=Arch Person").count() > 0, "participant missing");
  assert(await page.locator("a:has-text('View event')").count() === 0, "dead View event link is shown");
  assert(await page.locator("text=Blue").count() > 0, "answer missing");
  await admin("POST", `/events/${ev.id}/restore`);
  await page.reload(); await page.waitForSelector("a:has-text('View event')");
  await page.waitForSelector("dt:has-text('Team name')");
  await ctx.close();
});

// E. hero art no longer competes with the copy
for (const [w, h] of [[1440, 900], [1024, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }), page = await ctx.newPage();
  for (const r of ["/", "/volunteer", "/gallery"]) { await page.goto(BASE + r); await page.waitForSelector(".tech-hero"); await page.waitForTimeout(400); await page.locator(".tech-hero").screenshot({ path: `${SHOTS}/hero-${w}-${r.slice(1) || "home"}.png` }); }
  await ctx.close();
}
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} audit checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
