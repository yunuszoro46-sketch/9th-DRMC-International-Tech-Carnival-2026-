// Browser verification for Phase 3G (UI/UX polish) against the REAL Node server.
// Needs: a server serving web/dist on a freshly seeded database (BASE, default http://localhost:3111) and Playwright.
//   NODE_PATH=<global node_modules> BASE=http://localhost:3111 EMPTY_BASE=http://localhost:3112 node tools/browser-3g.mjs
// EMPTY_BASE (optional): a second server on a brand-new, un-seeded database, for the empty states.
// What this measures: layout at 320/375/768/1024/1440, the brand hierarchy, accessible names, focus rings, touch targets,
// text contrast (computed from the rendered page, see CONTRAST below), reduced motion, and the loading/error/empty states.
// What it does not do: judge how the pages look. Screenshots land in SHOTS for a person to look at.
// Fonts: the stand-in build has no web fonts (system fallbacks), so widths are re-checked with widened display type.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3111", EMPTY = process.env.EMPTY_BASE || "", SHOTS = process.env.SHOTS || "/tmp/shots-3g", KEY = "demo-organizer-key";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), SRC = path.join(ROOT, "web", "src");
const WIDTHS = [320, 375, 768, 1024, 1440];
fs.mkdirSync(SHOTS, { recursive: true });

const results = []; let quiet = 0; const consoleErrors = [], foreign = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log("  ok  " + name); }
  catch (e) { results.push([false, name]); console.log("FAIL  " + name + "\n      " + String(e.message).split("\n").slice(0, 14).join("\n      ")); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m || "expected equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const api = async (p, base = BASE) => (await fetch(base + "/api" + p)).json();

const browser = await chromium.launch();
async function newPage(w = 1280, h = 800, { organizer = false, mine = null, base = BASE, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...opts });
  await ctx.addInitScript(([key, org, m]) => {
    try { if (org && !location.pathname.endsWith("/login")) sessionStorage.setItem("ditc.organizerKey", key); if (m) localStorage.setItem("ditc.mine", JSON.stringify(m)); } catch { /* storage off */ }
  }, [KEY, organizer, mine]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !quiet) consoleErrors.push(`${m.text()} @ ${page.url()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !quiet && !/\/api\//.test(r.url())) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message} @ ${page.url()}`));
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !(EMPTY && u.startsWith(EMPTY)) && !/^(data|blob|about):/.test(u)) foreign.push(u); });
  return page;
}
const settle = async (page) => { await page.waitForLoadState("networkidle"); await page.waitForSelector("h1", { state: "attached", timeout: 8000 }); await page.waitForTimeout(250); };
const go = async (page, url, base = BASE) => { await page.goto(base + url); await settle(page); };

// ---- fixtures: read from the real API; one registration made through the real endpoint ----
const events = await api("/events?limit=200"), fests = await api("/fests"), clubs = await api("/clubs");
const open = events.find((e) => e.registration_state === "open" && e.auto_confirm);
assert(open, "the seeded database has no open, instantly-confirmed event");
const fill = (f) => (f.type === "select" ? f.options[0] : f.type === "tel" ? "01712345678" : f.type === "email" ? "a@b.co" : f.type === "number" ? "3" : "Polish check");
const made = await fetch(`${BASE}/api/events/${open.id}/register`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Polish Check", email: `polish.${Date.now().toString(36)}@example.com`, answers: Object.fromEntries((open.form_schema || []).map((f) => [f.key, fill(f)])) }) });
const reg = await made.json(); assert(made.status === 201, "fixture registration failed: " + JSON.stringify(reg));
const MINE = [{ token: reg.manage_token, title: open.title }];
const anEvent = events.find((e) => e.registration_state === "open" && !e.auto_confirm) || open;
const PUBLIC = ["/", "/events", `/events/${anEvent.id}`, `/events/${anEvent.id}/register`, `/registration/${reg.manage_token}`, "/my-registrations", "/clubs", `/clubs/${clubs[0].id}`, `/fests/${fests[0].id}`, "/volunteer", "/gallery", "/nope"];
const ORGANIZER = ["/organizer", "/organizer/events", `/organizer/events/${anEvent.id}`, "/organizer/events/new", `/organizer/events/${anEvent.id}/edit`, "/organizer/fests", `/organizer/fests/${fests[0].id}`, "/organizer/fests/new", "/organizer/registrations", "/organizer/volunteers", "/organizer/check-in"];

// ---- in-page measurements ----
// Layout: nothing wider than the window, nothing hanging off an edge (unless an ancestor scrolls or clips it on purpose),
// no control or heading whose own text is cut off, exactly one h1.
const layout = () => {
  const out = [], W = innerWidth, doc = document.documentElement;
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) + ` "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`;
  if (doc.scrollWidth > W + 1) out.push(`page scrolls sideways (${doc.scrollWidth} > ${W})`);
  const h1 = document.querySelectorAll("h1").length; if (h1 !== 1) out.push(`${h1} h1 elements`);
  // the nearest ancestor that clips or scrolls sideways (or is fixed): content is then judged against that box, not the window
  const clipper = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX !== "visible" || s.position === "fixed") return p; } return null; };
  const READS = "h1, h2, h3, p, dt, dd, li, label, button, a, input, select, textarea, .btn, .chip, .badge, code, img";
  for (const el of document.body.querySelectorAll("*")) {
    const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || el.closest("[aria-hidden='true'], .sr-only, .skip-link, dialog:not([open])")) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const clip = clipper(el);
    if ((r.right > W + 1 || r.left < -1) && s.position !== "fixed" && !clip) out.push(`off the edge: ${label(el)} (${Math.round(r.left)}..${Math.round(r.right)})`);
    if (clip && el.matches(READS) && !/auto|scroll/.test(getComputedStyle(clip).overflowX)) { const c = clip.getBoundingClientRect(); if (r.right > c.right + 1 || r.left < c.left - 1) out.push(`cut off by its container: ${label(el)} (${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(c.left)}..${Math.round(c.right)})`); }
    if (s.position === "fixed" && (r.right > W + 1 || r.left < -1)) out.push(`fixed element off the edge: ${label(el)}`);
    if (el.matches("button, .btn, .chip, .badge, h1, h2, h3, label, th, .brand, .stat-value") && s.display !== "inline" && el.scrollWidth > el.clientWidth + 1 && s.overflowX !== "visible") out.push(`clipped text: ${label(el)}`);
  }
  return [...new Set(out)].slice(0, 12);
};
// Accessible names and alternatives.
const names = () => {
  const out = [], text = (el) => (el ? (el.innerText || el.textContent || "").trim() : "");
  const nameOf = (el) => el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => text(document.getElementById(id))).join(" ").trim()
    || (el.id && text(document.querySelector(`label[for="${CSS.escape(el.id)}"]`))) || text(el.closest("label")) || text(el) || el.getAttribute("title") || [...el.querySelectorAll("img[alt]")].map((i) => i.alt).join(" ").trim() || (el.type === "submit" && el.value) || "";
  const seen = (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0; };
  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex='-1'])")) if (seen(el) && !nameOf(el)) out.push("no accessible name: " + el.outerHTML.slice(0, 110));
  for (const img of document.querySelectorAll("img")) if (!img.hasAttribute("alt")) out.push("img without alt: " + img.src);
  for (const svg of document.querySelectorAll("svg")) if (!svg.closest("[aria-hidden='true']") && svg.getAttribute("aria-hidden") !== "true" && !svg.getAttribute("aria-label") && svg.getAttribute("role") !== "img" && !svg.querySelector("title")) out.push("svg neither hidden nor named: " + svg.outerHTML.slice(0, 80));
  if (document.querySelectorAll("main").length !== 1) out.push(`${document.querySelectorAll("main").length} <main> landmarks`);
  for (const nav of document.querySelectorAll("nav")) if (seen(nav) && !nav.getAttribute("aria-label") && !nav.getAttribute("aria-labelledby")) out.push("nav without a label");
  if (document.querySelectorAll("[style]").length) out.push("inline style attribute: " + document.querySelector("[style]").outerHTML.slice(0, 90));
  if (!document.documentElement.lang) out.push("html has no lang");
  return [...new Set(out)].slice(0, 12);
};
// CONTRAST. For every visible piece of text: the text colour (with its own and its ancestors' opacity) against every colour
// the background behind it can take, building the stack from the page up: each ancestor's background colour, and every
// colour stop of each ancestor's gradient (the worst stop counts). WCAG AA: 4.5:1, or 3:1 for large text (24px, or
// 18.66px bold). Text that sits on a photograph cannot be measured this way and is counted as skipped, not passed.
// Not covered: backdrops painted by something that is not an ancestor (a positioned sibling, content scrolling under the
// translucent header), blend modes, text drawn by CSS (attr() labels), typed field values, most hover / error / toast
// states, organizer routes at phone width, and non-text contrast (borders, icons, the focus ring). A colour the parser
// cannot read is reported as a failure, not ignored.
const contrast = () => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const stops = (img) => [...img.matchAll(/rgba?\([^)]+\)|transparent/g)].map((m) => (m[0] === "transparent" ? { r: 0, g: 0, b: 0, a: 0 } : parse(m[0])));
  const backs = (el) => {
    const chain = []; for (let p = el; p; p = p.parentElement) chain.unshift(p);
    let cands = [{ r: 255, g: 255, b: 255, a: 1 }], photo = false, opacity = 1;
    for (const p of chain) {
      const s = getComputedStyle(p), bg = parse(s.backgroundColor); opacity *= parseFloat(s.opacity);
      if (bg && bg.a > 0) { cands = cands.map((c) => over(bg, c)); if (bg.a === 1) photo = false; }
      if (p.tagName === "IMG" || p.tagName === "VIDEO") photo = true;
      if (s.backgroundImage.includes("url(")) photo = true;
      if (s.backgroundImage.includes("gradient")) { const st = stops(s.backgroundImage); if (st.length) { cands = cands.flatMap((c) => st.map((x) => over(x, c))); cands.sort((a, b) => lum(a) - lum(b)); if (cands.length > 6) cands = [cands[0], cands[1], cands[cands.length >> 1], cands[cands.length - 2], cands[cands.length - 1]]; if (st.every((x) => x.a === 1)) photo = false; } }
    }
    // text laid over a sibling photograph (captions, the hero art): look for a positioned ancestor that also holds an image
    for (let p = el; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.position === "absolute" && p.parentElement && p.parentElement.querySelector("img:not(.club-logo)")) photo = true; }
    return { cands, photo, opacity };
  };
  const fails = []; let checked = 0, skipped = 0; const seen = new Set();
  const test = (el, colour, what) => {
    const fg0 = parse(colour); if (!fg0) { fails.push(`unreadable colour ${colour} "${what.trim().slice(0, 30)}"`); return; } const { cands, photo, opacity } = backs(el);
    if (photo) { skipped++; return; }
    const s = getComputedStyle(el), size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700, need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const worst = Math.min(...cands.map((b) => ratio(over({ ...fg0, a: fg0.a * opacity }, b), b))); checked++;
    if (worst < need) { const key = `${what.slice(0, 40)}|${colour}`; if (!seen.has(key)) { seen.add(key); fails.push(`${worst.toFixed(2)}:1 (needs ${need}) ${colour} "${what.trim().slice(0, 40)}" <${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : ""}>`); } }
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim(), el = n.parentElement; if (!t || !el || el.closest("script, style, [aria-hidden='true'], .sr-only, .skip-link, :disabled, [aria-disabled='true'], dialog:not([open]), option")) continue;
    const s = getComputedStyle(el); if (s.visibility === "hidden" || s.display === "none" || !el.getClientRects().length) continue;
    test(el, s.color, t);
  }
  for (const el of document.querySelectorAll("input[placeholder], textarea[placeholder]")) if (!el.disabled && el.getClientRects().length) test(el, getComputedStyle(el, "::placeholder").color, "placeholder: " + el.placeholder);
  return { fails: fails.slice(0, 14), checked, skipped };
};
// Touch targets on a touch screen: buttons, chips, fields, tabs, menu / footer / brand / back links are at least 44px tall.
// Exempt, and not measured: links inside running text, breadcrumbs, and titles inside table rows. Height only.
const targets = () => {
  const out = [];
  for (const el of document.querySelectorAll("button, .btn, .chip, .icon-btn, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, .drawer-nav a, .org-nav a, .org-tabs a, .site-footer li a, .quick-actions a, a.brand, .assistant-links a, .back-link")) {
    const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || !el.getClientRects().length || el.closest(".sr-only, dialog:not([open])")) continue;
    const r = el.getBoundingClientRect(); if (r.height < 43.5) out.push(`${Math.round(r.height)}px tall: ${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${(el.innerText || el.getAttribute("aria-label") || el.name || "").trim().slice(0, 24)}"`);
  }
  return [...new Set(out)].slice(0, 12);
};
// Tab through the whole page: every stop shows a 2px outline (on itself, or on its ::after for stretched card links).
// Not measured: whether the ring is hidden behind another element.
async function focusWalk(page, max = 160) {
  const bad = []; let stops = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); const ring = (x) => x.outlineStyle !== "none" && parseFloat(x.outlineWidth) >= 2; return { id: el.outerHTML.slice(0, 80), ok: ring(s) || ring(getComputedStyle(el, "::after")), vis: el.getClientRects().length > 0 }; });   // a stretched card link draws its ring on ::after
    if (!r) { if (stops) break; continue; }                      // focus left the page: every stop has been visited
    stops++; if (!r.ok || !r.vis) bad.push(r.id);
  }
  return { bad: [...new Set(bad)], stops };
}
const sweep = async (page, routes, fn, arg) => { const bad = []; for (const r of routes) { await go(page, r); for (const m of await page.evaluate(fn, arg)) bad.push(`${r}: ${m}`); } return bad; };
const report = (bad) => assert(bad.length === 0, bad.slice(0, 14).join("\n") + (bad.length > 14 ? `\n… ${bad.length - 14} more` : ""));

// ================= 1. design system =================
console.log("\n[1] Design system");
const css = (f) => fs.readFileSync(path.join(SRC, "styles", f), "utf8");
await check("every semantic token is defined once, in tokens.css, and resolves in the browser", async () => {
  const need = ["--ink", "--bg", "--surface", "--surface-2", "--glass", "--text-strong", "--text", "--muted", "--muted-2", "--on-primary", "--border", "--border-strong", "--primary", "--primary-2", "--cyan", "--lime", "--focus",
    "--ok", "--warn", "--bad", "--info", "--font-body", "--font-display", "--text-sm", "--space-1", "--space-4", "--space-8", "--radius-sm", "--radius", "--radius-lg", "--radius-pill", "--shadow", "--shadow-lg", "--glow", "--dur-1", "--dur-2", "--ease", "--tap", "--z-header", "--z-assistant"];
  const page = await newPage(); await go(page, "/");
  const got = await page.evaluate((n) => { const s = getComputedStyle(document.documentElement); return n.filter((k) => !s.getPropertyValue(k).trim()); }, need);
  eq(got, [], "tokens that resolve to nothing");
  const other = ["base.css", "components.css", "layout.css", "public.css", "organizer.css"].map(css).join("\n");
  const redefined = [...other.matchAll(/(^|[\s;{])(--(?:bg|surface|text|muted|primary|border|radius|shadow|font)[\w-]*)\s*:/g)].map((m) => m[2]);
  eq([...new Set(redefined)], [], "tokens re-declared outside tokens.css"); await page.context().close();
});
await check("no literal hex colours outside tokens.css (print styles aside), and every var() used is declared", async () => {
  const tokens = css("tokens.css"), declared = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])), bad = [];
  for (const f of ["base.css", "components.css", "layout.css", "public.css", "organizer.css"]) {
    const body = css(f), screen = body.replace(/@media print[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
    for (const m of screen.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) bad.push(`${f}: ${m[0]}`);
    const local = new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    for (const m of body.matchAll(/var\((--[\w-]+)/g)) if (!declared.has(m[1]) && !local.has(m[1])) bad.push(`${f}: var(${m[1]}) is never declared`);
  }
  report([...new Set(bad)]);
});
await check("the identity is unchanged: dark teal page, emerald action colour, Orbitron display and Inter body with system fallbacks", async () => {
  const page = await newPage(); await go(page, "/");
  const v = await page.evaluate(() => { const s = getComputedStyle(document.documentElement), g = (k) => s.getPropertyValue(k).trim(); return { bg: g("--bg"), primary: g("--primary"), cyan: g("--cyan"), lime: g("--lime"), body: getComputedStyle(document.body).fontFamily, h1: getComputedStyle(document.querySelector("h1")).fontFamily }; });
  eq([v.bg, v.primary, v.cyan, v.lime], ["#021b1a", "#00e5a3", "#22d3ee", "#c6f432"], "palette");
  assert(/^Inter,/.test(v.body) && /system-ui/.test(v.body), "body font stack: " + v.body); assert(/^Orbitron,/.test(v.h1) && /system-ui/.test(v.h1), "display font stack: " + v.h1);
  await page.context().close();
});
await check("no source file sets an inline style (the rendered pages are checked for style attributes in [4])", async () => {
  const bad = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.jsx?$/.test(f.name) && /\bstyle=\{/.test(fs.readFileSync(p, "utf8"))) bad.push(path.relative(SRC, p)); } };
  walk(SRC); report(bad);
});

// ================= 2. brand hierarchy =================
console.log("\n[2] Brand: club first, college second");
const brand = () => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), area: r.width * r.height, src: el.currentSrc || el.src, ok: el.complete && el.naturalWidth > 0, alt: el.alt }; };
  const all = [...document.querySelectorAll("img")].filter((i) => i.getClientRects().length);
  const crestEl = document.querySelector(".institution img"), crest = crestEl && box(crestEl);
  return { header: [...document.querySelectorAll(".site-header img, .org-side img, .org-bar img, .login-card img")].filter((i) => i.getClientRects().length).map(box), headerText: (document.querySelector(".site-header .brand, .org-side .brand, .login-card .brand") || {}).innerText || "",
    crest, crestCount: crest ? all.filter((i) => (i.currentSrc || i.src) === crest.src).length : 0, crestOutsideFooter: crest ? all.filter((i) => (i.currentSrc || i.src) === crest.src && !i.closest(".site-footer")).length : 0,
    footerLogo: document.querySelector(".site-footer .club-logo") ? box(document.querySelector(".site-footer .club-logo")) : null, logos: [...document.querySelectorAll(".club-logo")].filter((i) => i.getClientRects().length).map(box),
    order: (() => { const f = document.querySelector(".site-footer"); if (!f) return null; const a = f.querySelector(".club-logo"), b = f.querySelector(".institution img"); return a && b ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })() };
};
let crestSrc = "", logoSrc = "";
for (const w of WIDTHS) {
  await check(`${w}px: the header carries the club mark and name only; the crest appears once, in the footer, after the club mark and smaller than both club marks`, async () => {
    const page = await newPage(w, 900, { mine: MINE }); const bad = [];
    for (const r of PUBLIC) {
      await go(page, r); const b = await page.evaluate(brand);
      if (b.header.length !== 1) bad.push(`${r}: ${b.header.length} images in the header`);
      else { if (!b.header[0].ok) bad.push(`${r}: header logo did not load`); if (b.crest && b.header[0].src === b.crest.src) bad.push(`${r}: the header image is the college crest`); logoSrc = b.header[0].src; }
      if (w >= 420 && !/DRMC IT CLUB/i.test(b.headerText)) bad.push(`${r}: header does not say DRMC IT CLUB (${JSON.stringify(b.headerText)})`);
      if (!b.crest) { bad.push(`${r}: no affiliation block in the footer`); continue; }
      crestSrc = b.crest.src;
      if (b.crestCount !== 1 || b.crestOutsideFooter) bad.push(`${r}: crest shown ${b.crestCount} times, ${b.crestOutsideFooter} outside the footer`);
      if (!b.crest.ok || !/Dhaka Residential Model College/.test(b.crest.alt)) bad.push(`${r}: crest missing or unlabelled`);
      if (!b.footerLogo || !(b.footerLogo.area > b.crest.area * 2)) bad.push(`${r}: footer club mark ${b.footerLogo && b.footerLogo.w}x${b.footerLogo && b.footerLogo.h} is not clearly larger than the crest ${b.crest.w}x${b.crest.h}`);
      if (b.order !== true) bad.push(`${r}: the crest comes before the club mark in the footer`);
      if (b.header[0] && !(b.crest.area < b.header[0].area && b.crest.h <= b.header[0].h + 4)) bad.push(`${r}: the crest ${b.crest.w}x${b.crest.h} is not smaller than the header mark ${b.header[0].w}x${b.header[0].h}`);
      for (const l of b.logos) if (!l.ok) bad.push(`${r}: a club mark failed to load`);
    }
    report(bad); await page.context().close();
  });
}
await check("organizer: the club mark is on the sign-in card and in the sidebar (1024px and up); the crest is nowhere", async () => {
  const bad = []; assert(crestSrc, "the crest was not found on the public pages, so its absence here would prove nothing");
  for (const w of [375, 1280]) {
    const page = await newPage(w, 900, { organizer: true });
    for (const r of ["/organizer", "/organizer/events", "/organizer/registrations"]) { await go(page, r); const b = await page.evaluate((c) => ({ crest: [...document.querySelectorAll("img")].filter((i) => (i.currentSrc || i.src) === c).length, logos: [...document.querySelectorAll(".club-logo")].length }), crestSrc); if (b.crest) bad.push(`${w} ${r}: crest shown`); if (w >= 1024 && !b.logos) bad.push(`${w} ${r}: no club mark in the shell`); }
    await page.context().close();
    const login = await newPage(w, 900); await go(login, "/organizer/login"); const b = await login.evaluate(brand);
    if (b.logos.length !== 1 || !b.logos[0].ok) bad.push(`${w} login: ${b.logos.length} club marks`); if (b.crest) bad.push(`${w} login: crest shown`); await login.context().close();
  }
  report(bad);
});
await check("both logos are the repository's own files, served byte for byte; the tab icon exists and is not the crest", async () => {
  const bytes = async (u) => Buffer.from(await (await fetch(u)).arrayBuffer());
  const find = (name) => { const hit = []; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name === name) hit.push(p); } }; walk(SRC); return hit[0]; };
  const a = find("ditc.png"), c = find("crest.png"); assert(a && c, "logo sources not found under web/src");
  assert((await bytes(logoSrc)).equals(fs.readFileSync(a)), "the club mark served differs from " + path.relative(ROOT, a));
  assert((await bytes(crestSrc)).equals(fs.readFileSync(c)), "the crest served differs from " + path.relative(ROOT, c));
  const icon = await bytes(BASE + "/favicon.png"); assert(icon.length > 500 && !icon.equals(fs.readFileSync(c)), "favicon is the crest or missing");
});

// ================= 3. layout =================
console.log("\n[3] Layout at 320 / 375 / 768 / 1024 / 1440");
for (const w of WIDTHS) {
  await check(`${w}px public: ${PUBLIC.length} routes, no sideways scroll, nothing off an edge, no clipped control or heading, one h1`, async () => {
    const page = await newPage(w, w < 700 ? 760 : 900, { mine: MINE }); const bad = await sweep(page, PUBLIC, layout);
    await go(page, "/"); await page.screenshot({ path: `${SHOTS}/home-${w}.png`, fullPage: true }); await go(page, `/registration/${reg.manage_token}`); await page.screenshot({ path: `${SHOTS}/pass-${w}.png`, fullPage: true });
    report(bad); await page.context().close();
  });
  await check(`${w}px organizer: ${ORGANIZER.length} routes + sign-in, same checks`, async () => {
    const page = await newPage(w, w < 700 ? 760 : 900, { organizer: true }); const bad = await sweep(page, ORGANIZER, layout);
    await go(page, "/organizer"); await page.screenshot({ path: `${SHOTS}/dashboard-${w}.png`, fullPage: true });
    const login = await newPage(w, 760); bad.push(...await sweep(login, ["/organizer/login"], layout)); await login.screenshot({ path: `${SHOTS}/login-${w}.png` }); await login.context().close();
    report(bad); await page.context().close();
  });
}
// The real fonts are wider than the fallbacks this build renders with: repeat with display type stretched ~30%.
const WIDE = "h1,h2,h3,.brand,.footer-name,.tech-pill,.stat-value,.hero-facts dd{letter-spacing:.2em !important}.tech-eyebrow,.pass-brand,.site-footer h3{letter-spacing:.34em !important}";   // overflow and clipping only; it does not judge wrapping
for (const w of WIDTHS) {
  await check(`${w}px with Orbitron-width display type: still no sideways scroll or clipped heading (public + organizer)`, async () => {
    const bad = [];
    for (const [routes, organizer] of [[PUBLIC, false], [ORGANIZER, true]]) {
      const page = await newPage(w, 900, { organizer, mine: MINE, bypassCSP: true });
      for (const r of routes) { await go(page, r); await page.addStyleTag({ content: WIDE }); await page.waitForTimeout(120); for (const m of await page.evaluate(layout)) bad.push(`${r}: ${m}`); }
      await page.context().close();
    }
    report(bad);
  });
}

// ================= 4. accessibility =================
console.log("\n[4] Accessibility");
await check(`every control has an accessible name, every image an alt, one <main>, labelled <nav>s, no inline styles (${PUBLIC.length + ORGANIZER.length + 1} routes, desktop and phone)`, async () => {
  const bad = [];
  for (const w of [375, 1280]) {
    const page = await newPage(w, 900, { mine: MINE }); bad.push(...(await sweep(page, PUBLIC, names)).map((m) => `${w} ${m}`)); await page.context().close();
    const org = await newPage(w, 900, { organizer: true }); bad.push(...(await sweep(org, ORGANIZER, names)).map((m) => `${w} ${m}`)); await org.context().close();
    const login = await newPage(w, 900); bad.push(...(await sweep(login, ["/organizer/login"], names)).map((m) => `${w} ${m}`)); await login.context().close();
  }
  report(bad);
});
let contrastTotals = { checked: 0, skipped: 0 };
await check("default-state text contrast meets WCAG AA (4.5:1, large 3:1) on every route at 1280px and three at 375px, placeholders included", async () => {
  const bad = [];
  const run = async (page, routes) => { for (const r of routes) { await go(page, r); const c = await page.evaluate(contrast); contrastTotals.checked += c.checked; contrastTotals.skipped += c.skipped; for (const m of c.fails) bad.push(`${r}: ${m}`); } };
  const page = await newPage(1280, 900, { mine: MINE }); await run(page, PUBLIC); await page.context().close();
  const org = await newPage(1280, 900, { organizer: true }); await run(org, ORGANIZER); await org.context().close();
  const login = await newPage(1280, 900); await run(login, ["/organizer/login"]); await login.context().close();
  const phone = await newPage(375, 760, { mine: MINE }); await run(phone, ["/", "/events", `/registration/${reg.manage_token}`]); await phone.context().close();
  console.log(`        (${contrastTotals.checked} text runs measured, ${contrastTotals.skipped} on photographs skipped)`);
  report(bad);
});
await check("contrast in six open states: mobile menu, cancel dialog, assistant answer, hovered chip, pressed chip, hovered table row", async () => {
  const bad = []; const add = async (page, where) => { const c = await page.evaluate(contrast); for (const m of c.fails) bad.push(`${where}: ${m}`); };
  const phone = await newPage(375, 760, { mine: MINE }); await go(phone, "/events"); await phone.getByRole("button", { name: "Open menu" }).click(); await phone.waitForSelector(".drawer-nav"); await phone.waitForTimeout(350); await add(phone, "menu"); await phone.keyboard.press("Escape");
  await go(phone, `/registration/${reg.manage_token}`); await phone.getByRole("button", { name: "Cancel registration" }).click(); await phone.waitForSelector("dialog[open]"); await phone.waitForTimeout(350); await add(phone, "cancel dialog"); await phone.keyboard.press("Escape"); await phone.context().close();
  const page = await newPage(1280, 800); await go(page, "/events"); await page.getByRole("button", { name: "Ask Tech Guide" }).click(); await page.waitForSelector(".assistant-starters button"); await page.locator(".assistant-starters button").first().click(); await page.waitForSelector(".assistant-links a, .assistant-msg:nth-child(2)"); await page.waitForTimeout(500); await add(page, "assistant");
  await page.getByRole("button", { name: "Close assistant" }).click(); const chip = page.locator(".chip").nth(1); await chip.hover(); await page.waitForTimeout(250); await add(page, "chip hover"); await chip.click(); await page.waitForTimeout(350); await add(page, "chip pressed"); await page.context().close();
  const org = await newPage(1280, 800, { organizer: true }); await go(org, "/organizer/registrations"); await org.locator("tbody tr").first().hover(); await org.waitForTimeout(250); await add(org, "table row hover"); await org.context().close();
  report(bad);
});
await check("keyboard: the skip link is the first stop and moves focus to the content; every stop on six pages shows a focus ring", async () => {
  const page = await newPage(1280, 800, { mine: MINE }); await go(page, "/events");
  await page.keyboard.press("Tab"); const first = await page.evaluate(() => ({ cls: document.activeElement.className, top: document.activeElement.getBoundingClientRect().top })); assert(first.cls === "skip-link" && first.top >= 0, "first Tab stop: " + JSON.stringify(first));
  await page.keyboard.press("Enter"); await page.waitForTimeout(150); eq(await page.evaluate(() => document.activeElement.id), "main", "focus after the skip link");
  const bad = []; let stops = 0;
  for (const r of ["/", "/events", `/events/${anEvent.id}/register`, `/registration/${reg.manage_token}`, "/volunteer", "/gallery"]) { await go(page, r); const f = await focusWalk(page); stops += f.stops; for (const b of f.bad) bad.push(`${r}: no visible focus on ${b}`); }
  await page.context().close();
  const org = await newPage(1280, 800, { organizer: true }); for (const r of ["/organizer", "/organizer/events", "/organizer/events/new"]) { await go(org, r); const f = await focusWalk(org); stops += f.stops; for (const b of f.bad) bad.push(`${r}: no visible focus on ${b}`); } await org.context().close();
  assert(stops > 150, "only " + stops + " focus stops visited"); report(bad);
});
await check("touch screens (375px, coarse pointer): buttons, chips, fields, tabs and menu / footer / brand / back links are at least 44px tall (text links and breadcrumbs exempt); nothing breaks at 320 or 375", async () => {
  const bad = [];
  const page = await newPage(375, 760, { mine: MINE, hasTouch: true, isMobile: true }); assert(await (await go(page, "/"), page.evaluate(() => matchMedia("(pointer: coarse)").matches)), "the emulated device is not a touch device");
  bad.push(...await sweep(page, PUBLIC, targets), ...await sweep(page, PUBLIC, layout)); await page.getByRole("button", { name: "Open menu" }).click(); await page.waitForSelector(".drawer-nav"); for (const m of await page.evaluate(targets)) bad.push("menu: " + m); await page.keyboard.press("Escape");
  await go(page, "/events"); await page.getByRole("button", { name: "Ask Tech Guide" }).click(); await page.waitForSelector(".assistant-starters button"); await page.waitForTimeout(350); for (const m of await page.evaluate(targets)) bad.push("assistant: " + m);
  await page.locator(".assistant-starters button").first().click(); await page.waitForSelector(".assistant-links a"); for (const m of await page.evaluate(targets)) bad.push("assistant answer: " + m);
  await go(page, "/gallery"); for (const m of await page.evaluate(() => [...document.querySelectorAll(".gallery-thumb, .gallery-nav, .gallery button")].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 43.5).map((b) => `${Math.round(b.getBoundingClientRect().height)}px tall: ${b.className} ${b.getAttribute("aria-label") || b.innerText}`))) bad.push("gallery: " + m); await page.context().close();
  const org = await newPage(375, 760, { organizer: true, hasTouch: true, isMobile: true }); bad.push(...await sweep(org, ORGANIZER, targets), ...await sweep(org, ORGANIZER, layout)); await org.context().close();
  const small = await newPage(320, 640, { mine: MINE, hasTouch: true, isMobile: true }); bad.push(...(await sweep(small, PUBLIC, layout)).map((m) => "320 " + m)); await small.context().close();
  const smallOrg = await newPage(320, 640, { organizer: true, hasTouch: true, isMobile: true }); bad.push(...(await sweep(smallOrg, ORGANIZER, layout)).map((m) => "320 " + m)); await smallOrg.context().close();
  const login = await newPage(375, 760, { hasTouch: true, isMobile: true }); bad.push(...await sweep(login, ["/organizer/login"], targets)); await login.context().close();
  report(bad);
});
await check("pointer feedback: every enabled button, link-button, chip and select shows the hand cursor; disabled ones do not", async () => {
  const bad = [];
  for (const [routes, organizer] of [[["/", "/events", `/events/${anEvent.id}/register`, "/gallery", `/registration/${reg.manage_token}`], false], [["/organizer", "/organizer/events", "/organizer/events/new", "/organizer/registrations"], true]]) {
    const page = await newPage(1280, 800, { organizer, mine: MINE });
    bad.push(...await sweep(page, routes, () => [...document.querySelectorAll("button, a.btn, .chip, select, summary, .card-stretch")].filter((el) => el.getClientRects().length).filter((el) => { const c = getComputedStyle(el).cursor, off = el.disabled || el.getAttribute("aria-disabled") === "true"; return off ? c === "pointer" : c !== "pointer"; }).map((el) => `cursor ${getComputedStyle(el).cursor} on ${el.outerHTML.slice(0, 70)}`).slice(0, 5)));
    await page.context().close();
  }
  report(bad);
});
await check("every status badge carries words, and a failed submit marks each field invalid, links its message and focuses the first", async () => {
  const page = await newPage(1280, 800, { organizer: true }); const bad = [];
  for (const r of ["/events", "/organizer/registrations", "/organizer/events"]) { await go(page, r); const n = await page.evaluate(() => [...document.querySelectorAll(".badge")].filter((b) => !b.innerText.trim()).length); if (n) bad.push(`${r}: ${n} badges without text`); }
  await page.context().close();
  const form = await newPage(1280, 800); await go(form, `/events/${anEvent.id}/register`); await form.locator("form button[type=submit]").click(); await form.waitForTimeout(300);
  const f = await form.evaluate(() => { const bad = [...document.querySelectorAll("[aria-invalid='true']")]; return { invalid: bad.length, described: bad.filter((el) => { const id = el.getAttribute("aria-describedby"); return id && id.split(/\s+/).some((i) => (document.getElementById(i) || {}).innerText); }).length, focused: document.activeElement.getAttribute("aria-invalid") }; });
  assert(f.invalid > 0 && f.described === f.invalid, "invalid fields without a linked message: " + JSON.stringify(f)); eq(f.focused, "true", "focus lands on the first invalid field"); await form.context().close();
  report(bad);
});

// ================= 5. motion =================
console.log("\n[5] Motion");
await check("prefers-reduced-motion: no animation or transition longer than an instant on any element of four routes, the open assistant and an open dialog", async () => {
  const page = await newPage(1280, 800, { reducedMotion: "reduce", mine: MINE }); const bad = [];
  const scan = () => { const out = []; const secs = (v) => Math.max(...v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x)) || 0)); for (const el of document.querySelectorAll("*")) for (const pseudo of [null, "::before", "::after"]) { const s = getComputedStyle(el, pseudo); if ((s.animationName !== "none" && secs(s.animationDuration) > 0.01) || secs(s.transitionDuration) > 0.01) out.push(el.tagName.toLowerCase() + "." + (typeof el.className === "string" ? el.className.split(/\s+/)[0] : "") + (pseudo || "")); } return [...new Set(out)].slice(0, 6); };
  for (const r of ["/", "/events", "/gallery", `/registration/${reg.manage_token}`]) { await go(page, r); for (const m of await page.evaluate(scan)) bad.push(`${r}: ${m}`); }
  await page.getByRole("button", { name: "Ask Tech Guide" }).click(); await page.waitForSelector(".assistant-panel"); for (const m of await page.evaluate(scan)) bad.push("assistant: " + m);
  await page.getByRole("button", { name: "Close assistant" }).click(); await page.getByRole("button", { name: "Cancel registration" }).click(); await page.waitForSelector("dialog[open]"); for (const m of await page.evaluate(scan)) bad.push("dialog: " + m); await page.keyboard.press("Escape");
  report(bad); await page.context().close();
});
await check("with motion allowed (four sample routes): no transition longer than 400ms, and nothing loops except loading indicators and decorative art", async () => {
  const page = await newPage(1280, 800); const bad = [];
  const scan = () => { const out = []; const secs = (v) => Math.max(...v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x)) || 0)); for (const el of document.querySelectorAll("*")) { const s = getComputedStyle(el), c = typeof el.className === "string" ? el.className : ""; if (secs(s.transitionDuration) > 0.4) out.push(`${el.tagName.toLowerCase()}.${c.split(/\s+/)[0]} transitions for ${s.transitionDuration}`); if (s.animationName !== "none" && s.animationIterationCount === "infinite" && !/spinner|skeleton|assistant-dots|dots|pulse|art|gallery|tech/.test(c + " " + (el.parentElement ? el.parentElement.className : "")) && !el.closest("svg, [aria-hidden='true']")) out.push(`${el.tagName.toLowerCase()}.${c.split(/\s+/)[0]} loops (${s.animationName})`); } return [...new Set(out)].slice(0, 6); };
  for (const r of ["/", "/events", `/events/${anEvent.id}`, "/volunteer"]) { await go(page, r); for (const m of await page.evaluate(scan)) bad.push(`${r}: ${m}`); }
  report(bad); await page.context().close();
});

// ================= 6. states and flows that the polish touched =================
console.log("\n[6] States and flows");
await check("home: the three figures in the hero are the real counts from the API, not decoration", async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const page = await newPage(); await go(page, "/"); await page.waitForSelector(".hero-facts dd");
  const shown = await page.evaluate(() => [...document.querySelectorAll(".hero-facts > div")].map((d) => [d.querySelector("dd").innerText.trim(), d.querySelector("dt").innerText.trim().toLowerCase()]));
  eq(shown.length, 3, "figures shown");
  const want = { open: events.filter((e) => e.registration_state === "open").length, fests: fests.filter((f) => f.status === "live" || f.status === "upcoming").length || fests.filter((f) => (f.ends_on || f.starts_on) >= today).length, clubs: clubs.length };
  const by = (re) => Number((shown.find(([, l]) => re.test(l)) || [NaN])[0]);
  eq([by(/open|registration/), by(/fest/), by(/club/)], [want.open, want.fests, want.clubs], `figures ${JSON.stringify(shown)}`); await page.context().close();
});
await check("home: the hero keeps its height when the figures arrive (320, 375, 1440), and shows no figures at all if one of the lists fails", async () => {
  const bad = []; quiet++;
  for (const w of [320, 375, 1440]) {
    const page = await newPage(w, 800); let release; const gate = new Promise((r) => { release = r; });
    await page.route("**/api/clubs*", async (route) => { await gate; await route.continue(); });
    await page.goto(BASE + "/"); await page.waitForSelector(".event-card"); const h0 = await page.evaluate(() => document.querySelector(".tech-hero").getBoundingClientRect().height);
    release(); await page.waitForSelector(".hero-facts dd"); await page.waitForTimeout(150); const h1 = await page.evaluate(() => document.querySelector(".tech-hero").getBoundingClientRect().height);
    if (Math.abs(h1 - h0) > 1) bad.push(`${w}px: the hero went from ${h0} to ${h1}px when the figures arrived`); await page.context().close();
  }
  const page = await newPage(1280, 800); await page.route("**/api/clubs*", (route) => route.abort()); await page.goto(BASE + "/"); await page.waitForSelector(".event-card"); await page.waitForTimeout(600);
  if (await page.locator(".hero-facts").count()) bad.push("a figures block is still shown after the clubs list failed"); await page.context().close(); quiet--;
  report(bad);
});
await check("the floating assistant launcher does not sit on a primary button when a page opens (12 public routes, nine screen sizes)", async () => {
  const bad = [];
  for (const [w, h] of [[320, 568], [360, 640], [375, 667], [375, 760], [390, 844], [768, 1024], [1024, 768], [1366, 768], [1440, 900]]) {
    const page = await newPage(w, h, { mine: MINE });
    for (const r of PUBLIC) { await go(page, r); for (const m of await page.evaluate(() => { const f = document.querySelector(".assistant-fab"); if (!f) return ["no launcher"]; const a = f.getBoundingClientRect(); return [...document.querySelectorAll(".btn-primary, button[type=submit], .detail-aside .btn")].filter((b) => b.getClientRects().length).filter((b) => { const r = b.getBoundingClientRect(); return r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top; }).map((b) => `"${b.innerText.trim()}" is under the launcher`); })) bad.push(`${w}x${h} ${r}: ${m}`); }
    await page.context().close();
  }
  report(bad);
});
await check("registration pass on desktop: the ticket stays pinned beside the details (sticky, level with the top of its column)", async () => {
  const page = await newPage(1440, 900, { mine: MINE }); await go(page, `/registration/${reg.manage_token}`);
  const p = await page.evaluate(() => { const c = document.querySelector(".pass-card"), g = c.parentElement; return { pos: getComputedStyle(c).position, top: Math.round(c.getBoundingClientRect().top - g.getBoundingClientRect().top), over: Math.round(c.getBoundingClientRect().bottom - g.getBoundingClientRect().bottom) }; });
  eq(p.pos, "sticky", "position"); assert(Math.abs(p.top) <= 1 && p.over <= 1, "the pass is offset inside its column: " + JSON.stringify(p)); await page.context().close();
});
await check("events: filters still live in the URL, survive a reload and the back button", async () => {
  const page = await newPage(); await go(page, "/events");
  const total = await page.locator(".event-card").count(); const chip = page.locator(".chip-row .chip", { hasText: "Closed" }); await chip.click(); await page.waitForTimeout(400);
  const url = new URL(page.url()); assert(url.search.length > 1, "no query string after filtering: " + page.url()); const filtered = await page.locator(".event-card").count();
  eq(filtered, events.filter((e) => e.registration_state === "closed").length, "closed events shown"); assert(filtered < total, "the filter changed nothing");
  await page.reload(); await settle(page); eq(await chip.getAttribute("aria-pressed"), "true", "chip after reload"); eq(await page.locator(".event-card").count(), filtered, "cards after reload");
  await page.getByLabel("Search").fill("zzzz-no-such-event"); await page.waitForTimeout(700); assert(/zzzz/.test(page.url()), "search is not in the URL"); assert(await page.locator(".state h2").count() === 1, "no empty state for a search with no results");
  await page.context().close();
});
await check("loading and error states: a status while waiting, an alert with Try again on failure, and the retry recovers", async () => {
  const page = await newPage(); quiet++;
  let release; const gate = new Promise((r) => { release = r; });
  await page.route("**/api/events*", async (route) => { await gate; await route.continue(); });
  await page.goto(BASE + "/events"); await page.waitForSelector("[role=status]"); assert(await page.locator("h1").count() === 1, "no heading while loading"); release(); await page.waitForSelector(".event-card"); await page.unroute("**/api/events*");
  await page.route("**/api/events*", (route) => route.abort()); await page.goto(BASE + "/events"); await page.waitForSelector("[role=alert]");
  const btn = page.getByRole("button", { name: "Try again" }); assert(await btn.isVisible(), "no Try again button"); assert(!/TypeError|fetch|stack|undefined/i.test(await page.locator("[role=alert]").innerText()), "the error shows internals");
  await page.unroute("**/api/events*"); await btn.click(); await page.waitForSelector(".event-card"); quiet--; await page.context().close();
});
await check("registration pass: club mark and name on the ticket, a scannable-size code, status in words; fits a 320px phone", async () => {
  const page = await newPage(320, 700, { mine: MINE }); await go(page, `/registration/${reg.manage_token}`);
  const p = await page.evaluate(() => { const c = document.querySelector(".pass-card").getBoundingClientRect(), q = document.querySelector(".qr-svg").getBoundingClientRect(); return { left: c.left, right: c.right, w: innerWidth, qr: Math.round(q.width), brand: (document.querySelector(".pass-brand") || {}).innerText, logo: !!document.querySelector(".pass-brand .club-logo"), status: document.querySelector(".pass-top").innerText }; });
  assert(p.left >= 0 && p.right <= p.w, "the pass is wider than the screen"); assert(p.qr >= 160, "QR is only " + p.qr + "px"); assert(/DRMC IT CLUB/.test(p.brand) && p.logo, "no club brand on the pass"); assert(/Confirmed/.test(p.status), "status text: " + p.status);
  await page.screenshot({ path: `${SHOTS}/pass-320-top.png` }); await page.context().close();
});
await check("dialogs and the menu at 320px: inside the screen, closable with Escape, focus returns to the button that opened them", async () => {
  const page = await newPage(320, 640, { mine: MINE }); await go(page, `/registration/${reg.manage_token}`);
  const inside = () => page.evaluate(() => { const r = document.querySelector("dialog[open]").getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && [...document.querySelectorAll("dialog[open] button")].every((b) => { const x = b.getBoundingClientRect(); return x.right <= innerWidth + 1 && x.left >= -1; }); });
  const cancel = page.getByRole("button", { name: "Cancel registration" }); await cancel.click(); await page.waitForSelector("dialog[open]"); await page.waitForTimeout(300); assert(await inside(), "the cancel dialog leaves the screen");
  await page.keyboard.press("Escape"); await page.waitForTimeout(250); eq(await page.locator("dialog[open]").count(), 0, "dialog still open"); assert(await cancel.evaluate((el) => el === document.activeElement), "focus did not return to Cancel registration");
  eq(String((await api(`/registrations/${reg.manage_token}`)).status).toLowerCase(), String(reg.status).toLowerCase(), "the registration was changed by opening and closing the dialog");
  const menu = page.getByRole("button", { name: "Open menu" }); await menu.click(); await page.waitForSelector("dialog[open] .drawer-nav"); await page.waitForTimeout(300); assert(await inside(), "the menu leaves the screen");
  eq(await page.locator(".drawer-nav a[aria-current='page']").count(), 0, "a menu link is marked current on a page that is not in the menu");
  await page.keyboard.press("Escape"); await page.waitForTimeout(250); assert(await menu.evaluate((el) => el === document.activeElement), "focus did not return to the menu button");
  await go(page, "/events"); await menu.click(); await page.waitForSelector(".drawer-nav"); eq(await page.locator(".drawer-nav a[aria-current='page']").innerText(), "Events", "current page in the menu"); await page.context().close();
  const wide = await newPage(1280, 800); await go(wide, "/gallery"); eq(await wide.locator(".nav a[aria-current='page']").innerText(), "Gallery", "current page in the header"); assert(!(await wide.getByRole("button", { name: "Open menu" }).isVisible()), "menu button shown on desktop"); await wide.context().close();
});
await check("organizer dashboard: quick actions lead to the real screens, and Review pending opens the pending list", async () => {
  const page = await newPage(1280, 800, { organizer: true }); await go(page, "/organizer");
  const links = await page.evaluate(() => [...document.querySelectorAll(".quick-actions a")].map((a) => [a.innerText.trim(), a.getAttribute("href")]));
  eq(links, [["New event", "/organizer/events/new"], ["New fest", "/organizer/fests/new"], ["Review pending", "/organizer/registrations?status=PENDING"], ["Volunteers", "/organizer/volunteers"]], "quick actions");
  const pending = Number(await page.locator(".stat-attn .stat-value, .stat-card .stat-value").first().innerText());
  await page.getByRole("link", { name: "Review pending" }).click(); await page.waitForSelector("tbody tr, .state"); await page.waitForTimeout(400);
  eq(await page.locator(".chip[aria-pressed='true']").innerText(), "Pending", "active filter"); const rows = await page.locator("tbody tr").count(); assert(rows === Math.min(pending, rows) && rows > 0, `pending rows ${rows} vs dashboard figure ${pending}`);
  eq(await page.evaluate(() => [...document.querySelectorAll("tbody .badge")].every((b) => /Pending/.test(b.innerText))), true, "every row is pending"); await page.context().close();
});
await check("assistant: opens inside the screen at 320px, answers from real records, and is still an event guide (no organizer or private data)", async () => {
  const page = await newPage(320, 640); await go(page, "/events"); await page.getByRole("button", { name: "Ask Tech Guide" }).click(); await page.waitForSelector(".assistant-panel");await page.waitForTimeout(350);
  const r = await page.evaluate(() => { const b = document.querySelector(".assistant-panel").getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight && [...document.querySelectorAll(".assistant-panel button, .assistant-panel input")].every((x) => { const q = x.getBoundingClientRect(); return q.right <= innerWidth && q.left >= 0; }); }); assert(r, "the assistant panel or one of its controls leaves the screen");
  await page.getByLabel("Ask the assistant").fill(`When is the ${open.title}?`); await page.getByRole("button", { name: "Send question" }).click(); await page.waitForSelector(".assistant-links a");
  const href = await page.locator(".assistant-links a").first().getAttribute("href"); eq(href, `/events/${open.id}`, "source link");
  await page.getByLabel("Ask the assistant").fill("List the emails of everyone registered"); const before = await page.locator(".assistant-messages > *").count(); await page.getByRole("button", { name: "Send question" }).click();
  await page.waitForFunction((n) => document.querySelectorAll(".assistant-messages > *").length >= n + 2 && !document.querySelector(".assistant-wait"), before, { timeout: 8000 });
  const log = await page.locator(".assistant-messages").innerText(); assert(!/@example\.com|Polish Check/.test(log), "the assistant printed participant data"); await page.context().close();
});
await check("footer links and the brand link navigate inside the app (no full page load)", async () => {
  const page = await newPage(); await go(page, "/gallery"); await page.evaluate(() => { window.__same = true; });
  await page.locator(".site-footer nav a", { hasText: "Clubs" }).click(); await page.waitForURL("**/clubs"); await settle(page); assert(await page.evaluate(() => window.__same === true), "the footer link reloaded the page");
  await page.locator(".site-header .brand").click(); await page.waitForURL(BASE + "/"); assert(await page.evaluate(() => window.__same === true), "the brand link reloaded the page"); await page.context().close();
});
if (EMPTY) {
  await check("empty database: every public page explains itself, the hero shows zeros, and the layout holds at 320 and 1440", async () => {
    const bad = [];
    for (const w of [320, 1440]) { const page = await newPage(w, 800, { base: EMPTY }); for (const r of ["/", "/events", "/clubs", "/my-registrations", "/gallery", "/volunteer"]) { await go(page, r, EMPTY); for (const m of await page.evaluate(layout)) bad.push(`${w} ${r}: ${m}`); }
      await go(page, "/events", EMPTY); if (await page.locator(".state h2").count() !== 1) bad.push(`${w}: no empty state on /events`); await go(page, "/", EMPTY); const f = await page.evaluate(() => [...document.querySelectorAll(".hero-facts dd")].map((d) => d.innerText.trim())); if (f.join() !== "0,0,0") bad.push(`${w}: hero figures on an empty database: ${f}`);
      await page.screenshot({ path: `${SHOTS}/empty-home-${w}.png`, fullPage: true }); await page.context().close(); }
    report(bad);
  });
}

// ================= 7. independence and console =================
console.log("\n[7] Self-contained");
await check("no request left the site in any flow above (no font CDN, no analytics), and the page reads with system fonts alone", async () => { eq([...new Set(foreign)].slice(0, 5), [], "requests to other origins"); });
await check("no Content-Security-Policy violations, page errors or failed assets in any flow above", async () => { assert(consoleErrors.length === 0, [...new Set(consoleErrors)].slice(0, 8).join("\n      ")); });

await browser.close();
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
