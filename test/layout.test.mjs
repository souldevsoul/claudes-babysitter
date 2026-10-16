// playwright/checks/layout.js — every check proves it fires on the bug (true positive) and stays quiet on the
// look-alike that is fine (false positive). Fixture pages are served from http://bs.test/ (routed, no server), so
// links resolve to same-origin paths the way they do on a real site.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";
import * as L from "../playwright/checks/layout.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, "fixtures", "layout", name), "utf8");
const sel = (list) => list.map((f) => f.selector || f.where);
const browser = await chromium.launch({ channel: "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

/** Opens `html` (a fixture name or markup) at http://bs.test<path>; `vars` replaces {KEY} placeholders. */
async function load(page, html, { path = "/", vars = {} } = {}) {
  let body = html.trim().startsWith("<") ? html : fixture(html);
  for (const [k, v] of Object.entries(vars)) body = body.split(`{${k}}`).join(v);
  await page.route("http://bs.test/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === (path.split("#")[0] || "/")) return r.fulfill({ contentType: "text/html", body });
    if (/favicon/.test(u.pathname)) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ contentType: "text/html", body: "<!doctype html><title>other</title><h1>Other</h1>" });
  });
  await page.goto("http://bs.test" + path);
  await page.waitForTimeout(100);
}

async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
  const page = await ctx.newPage();
  await checks.install(page);
  try {
    await fn(page);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${String(e.message).split("\n").join("\n    ")}`);
  } finally {
    await ctx.close();
  }
}
const mobile = { width: 390, height: 844 };

try {
  await test("3.7 nav parity: renamed footer link is hard, missing one is soft; logo, auth links and CTAs are left out", async (page) => {
    await load(page, "nav.html", { path: "/pricing" });
    const r = await L.navParity(page);
    assert.equal(r.hard.length, 1, JSON.stringify(r.hard));
    assert.match(r.hard[0].what, /"About us".*"Company"/);
    assert.equal(r.soft.length, 1, JSON.stringify(r.soft));
    assert.match(r.soft[0].what, /Blog/);
    assert.ok(!JSON.stringify(r).includes("Sign in\" (") && !/Get started/.test(JSON.stringify([...r.hard, ...r.soft])), "auth link and CTA are not section nav");
    assert.equal(r.h1, "Simple, transparent pricing");
  });
  await test("3.7 nav parity: same names (locale-root logo, anchor links) pass", async (page) => {
    await load(page, "nav-ok.html", { path: "/pricing" });
    const r = await L.navParity(page);
    assert.deepEqual([...r.hard, ...r.soft], []);
  });
  await test("3.7 nav names vs pages: legal title mismatch is hard, marketing h1 passes, an unrelated page name is soft", async () => {
    const links = [
      { dest: "/terms", label: "Terms", area: "footer" }, { dest: "/privacy", label: "Privacy Policy", area: "footer" },
      { dest: "/pricing", label: "Pricing", area: "header" }, { dest: "/faq", label: "FAQ", area: "header" },
      { dest: "/licence", label: "License Agreement", area: "footer" }, { dest: "/#faq", label: "Questions", area: "header" },
    ];
    const pages = [
      { path: "/", links, h1: "Acme", title: "Acme" },
      { path: "/terms", links: [], h1: "Terms of Service", title: "Terms of Service | Acme" },
      { path: "/privacy", links: [], h1: "Privacy Policy", title: "Privacy Policy — Acme" },
      { path: "/pricing", links: [], h1: "Simple, transparent pricing", title: "Acme" },
      { path: "/faq", links: [], h1: "Help center", title: "Help | Acme" },
      { path: "/licence", links: [], h1: "Licence Agreement", title: "Acme" },
    ];
    const r = L.navTitleMismatches(pages);
    assert.deepEqual(r.hard.map((f) => f.where.split("→ ")[1]).sort(), ["/licence", "/terms"], JSON.stringify(r.hard));
    assert.deepEqual(r.soft.map((f) => f.where.split("→ ")[1]), ["/faq"], JSON.stringify(r.soft));
  });
  await test("1.11 logo home: unlinked footer wordmark is hard; linked header mark, locale root, payment and client logos pass", async (page) => {
    await load(page, "nav.html");
    const r = await L.logoHome(page);
    assert.deepEqual(sel(r.hard), ["#foot-logo"], JSON.stringify(r.hard));
    await load(page, "nav-ok.html");
    const ok = await L.logoHome(page);
    assert.deepEqual([...ok.hard, ...ok.soft], [], JSON.stringify(ok));
  });
  await test("1.11 logo home: the logo inside the open mobile menu is checked too", async (page) => {
    await load(page, "menu.html", { vars: { ACTIVE: "font-weight:700;color:#000" } });
    const r = await L.logoHome(page);
    assert.deepEqual(sel(r.hard), ["#menu-logo"], JSON.stringify(r));
    await load(page, fixture("menu.html").replace('<img id="menu-logo"', '<a href="/"><img id="menu-logo"').replace('height="20" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'20\'/%3E">', 'height="20" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'20\'/%3E"></a>'), { vars: { ACTIVE: "font-weight:700" } });
    const ok = await L.logoHome(page);
    assert.deepEqual(ok.hard, [], JSON.stringify(ok));
  }, mobile);
  await test("3.5 active nav: an unstyled current item is hard; a second highlighted item is hard; colour, weight or a ::after bar pass", async (page) => {
    const run = async (css) => { await page.unrouteAll(); await load(page, "active.html", { path: "/pricing", vars: { CSS: css } }); return L.activeNavStyle(page); };
    let r = await run("");
    assert.deepEqual(sel(r.hard), ["#n-pricing"], JSON.stringify(r));
    r = await run("nav a[aria-current=page]{color:#000;font-weight:700}");
    assert.deepEqual([...r.hard, ...r.soft], [], JSON.stringify(r));
    r = await run("nav a[aria-current=page]::after{content:'';display:block;height:2px;background:#000}");
    assert.deepEqual([...r.hard, ...r.soft], [], JSON.stringify(r));
    r = await run("nav a[aria-current=page], #n-faq{color:#000}");
    assert.deepEqual(sel(r.hard), ["#n-faq"], JSON.stringify(r));
    await page.unrouteAll(); await load(page, fixture("active.html").replace(' aria-current="page"', ""), { path: "/", vars: { CSS: "#n-faq{color:#000}" } });
    r = await L.activeNavStyle(page);
    assert.deepEqual(sel(r.hard), ["#n-home"], "on / the Home item is current and plain");
  });
  await test("3.5 active nav: the burger menu's current item is judged too", async (page) => {
    await load(page, "menu.html", { vars: { ACTIVE: "" } });
    let r = await L.activeNavStyle(page);
    assert.equal(r.hard.length, 1, JSON.stringify(r));
    assert.match(r.hard[0].what, /mobile menu.*"Home"/);
    await page.unrouteAll(); await load(page, "menu.html", { vars: { ACTIVE: "font-weight:700;color:#000" } });
    r = await L.activeNavStyle(page);
    assert.deepEqual(r.hard, [], JSON.stringify(r));
  }, mobile);
} finally {
  await browser.close();
}
if (failed) { console.log(`layout: ${failed} failed`); process.exit(1); }
console.log("layout: ok");
