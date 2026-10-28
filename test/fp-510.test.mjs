// 5.1.0 — false alarms from the full runs on Praxis and Parallel (issue #3), each pinned by a fixture page: the false
// alarm stays gone AND the real defect it looks like still fires. Pages come from a local server (same-origin links).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";
import * as L from "../playwright/checks/layout.js";
import * as A from "../playwright/acceptance.js";
import * as F from "../playwright/checks/forms.js";
import * as run from "../playwright/checks/run.js";
import * as R from "../lib/content-rules.js";
import { summarize, isNavFlake } from "../lib/run-summary.js";

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const show = (x) => JSON.stringify(x, null, 1);
const sels = (list) => list.map((f) => `${f.selector || ""} ${f.where || ""}`);

let site = { "/": "" };
let drops = 0; // requests to /flaky that are cut off before the page is served (a navigation flake)
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/flaky" && drops > 0) { drops--; return req.socket.destroy(); }
  if (u.pathname === "/dead") return req.socket.destroy();
  const body = site[u.pathname] ?? "<!doctype html><title>other</title><h1>Other</h1>";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, { lang = "en", head = "" } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><style>body{margin:0;font:16px/1.5 Arial}${head}</style></head><body>${body}</body></html>`;
async function load(page, html, path = "/") {
  site = { ...site, [path]: html };
  await page.goto(ORIGIN + path, { waitUntil: "load" });
  await page.waitForTimeout(150);
}
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
  const page = await ctx.newPage();
  await checks.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").join("\n    ")}`); } finally { await ctx.close(); }
}
const ARROW = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3 5 8l5 5" stroke="currentColor" fill="none"/></svg>`;
const LOGO = `<svg class="logo" width="96" height="24" viewBox="0 0 96 24"><rect width="96" height="24" fill="#123"/></svg>`;

try {
  /* ───────── 1.11 / FM8 / N4: the "← Back to home" pill is not the logo (praxis /login, parallel /forgot-password) ───────── */
  await test("1.11 a '← Back to home' pill (arrow icon + words, 138×44) is not a logo; a logo link far wider than its mark still fires", async (page) => {
    await load(page, doc(`<header><a href="/" aria-label="Praxis home">${LOGO}</a><a id="back" href="/" style="display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 17px;border-radius:999px;border:1px solid #ccc">${ARROW}<span>Back to home</span></a></header><main><h1>Sign in</h1></main>`));
    assert.deepEqual(await checks.logoLink(page), []);
    await load(page, doc(`<header><a id="wide" href="/" style="display:block;width:400px;height:40px">${LOGO}</a></header><main><h1>Home</h1></main>`));
    assert.ok(sels(await checks.logoLink(page)).some((s) => /wide/.test(s)), "a 400 px link around a 96 px logo still fires");
  });
  await test("FM8 'Back to sign in' (first link, arrow icon) is not read as the logo; a logo that links to /login still fires", async (page) => {
    await load(page, doc(`<main><a href="/login">${ARROW} Back to sign in</a><a href="/" aria-label="Parallel home">${LOGO}</a><h1>Reset your password</h1><form><input type="email" aria-label="Email"><button>Send link</button></form></main><footer><a href="/terms">Terms</a> <a href="/privacy">Privacy</a></footer>`), "/forgot-password");
    const ok = await F.authShell(page);
    assert.ok(!ok.some((f) => /the logo links to/.test(f.what)), show(ok));
    await load(page, doc(`<main><a href="/login" aria-label="Parallel">${LOGO}</a><a href="/">${ARROW} Back to home</a><h1>Reset your password</h1></main>`), "/forgot-password");
    const bad = await F.authShell(page);
    assert.ok(bad.some((f) => /the logo links to \/login/.test(f.what)), show(bad));
  });
  await test("N4 the logo + '← Back to home' pair FM8 asks for is not two names for one page; logo + a 'Home' text link still is", async (page) => {
    await load(page, doc(`<header><a href="/">${LOGO}<span>praxis</span></a><a href="/">${ARROW} Back to home</a></header><main><h1>Sign in</h1></main>`), "/login");
    assert.deepEqual(await A.duplicateLinks(page), []);
    await load(page, doc(`<header><a href="/">${LOGO}<span>praxis</span></a><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header><main><h1>Pricing</h1></main>`), "/pricing");
    const bad = await A.duplicateLinks(page);
    assert.ok(bad.some((f) => /2 links to \/ with different names/.test(f.what)), show(bad));
  });

  /* ───────── 4.6: a footer the reader can scroll out from under the cookie banner (praxis /login 1280) ───────── */
  const banner = `<div id="cookie-banner" style="position:fixed;left:0;right:0;bottom:0;height:120px;background:#222;color:#fff">We use cookies <button>Accept</button></div>`;
  await test("4.6 a footer under the banner on arrival that scrolls clear of it (bottom padding) passes; one stuck under it at the page's end, or a fixed header under a top banner, fails", async (page) => {
    await load(page, doc(`<main style="min-height:620px"><h1>Sign in</h1></main><footer style="padding:8px"><nav><a id="tos" href="/terms">Terms of Service</a></nav></footer><div style="height:120px"></div>${banner}`));
    assert.equal(await page.evaluate(() => { const r = document.getElementById("tos").getBoundingClientRect(); return document.getElementById("cookie-banner").contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }), true, "fixture: on arrival the link is under the banner");
    assert.deepEqual(await checks.cookieCovers(page), [], "padding lets the footer scroll clear");
    assert.equal(await page.evaluate(() => scrollY), 0, "the page is put back where it was");
    await load(page, doc(`<main style="min-height:620px"><h1>Sign in</h1></main><footer style="padding:8px"><nav><a id="tos" href="/terms">Terms of Service</a></nav></footer>${banner}`));
    assert.ok(sels(await checks.cookieCovers(page)).some((s) => /tos|Terms/.test(s)), "no padding: the footer link stays under the banner");
    await load(page, doc(`<header style="position:fixed;top:0;left:0;right:0;height:56px;background:#fff"><nav><a id="pr" href="/pricing">Pricing</a></nav></header><main style="height:3000px"></main><div class="cookie-bar" style="position:fixed;left:0;right:0;top:0;height:80px;background:#222;color:#fff">Cookies</div>`));
    assert.ok(sels(await checks.cookieCovers(page)).some((s) => /pr|Pricing/.test(s)), "a fixed header under the banner never scrolls clear");
  }, { width: 1280, height: 720 });

  /* ───────── money: exchange-rate decimals (layout.rateDecimals), header money = the site header only ───────── */
  await test("money: a rate with 4 decimals ('10 credits = $1 = €0.8909') is within the 2–4 the message allows; 5 decimals, or more than layout.rateDecimals, still fire", async () => {
    const t = (raw, o = {}) => ({ raw, fontSize: 16, where: raw, selector: raw, ...o });
    const soft = (list, o) => L.moneyIssues(list, o).soft.filter((f) => /exchange rate/.test(f.what));
    assert.equal(soft([t("€0.8909", { rate: true })]).length, 0);
    assert.equal(soft([t("€0.89165", { rate: true })]).length, 1);
    assert.match(soft([t("€0.89165", { rate: true })])[0].what, /2–4 decimals/);
    assert.equal(soft([t("€0.8909", { rate: true })], { rateDecimals: 2 }).length, 1, "layout.rateDecimals: 2");
    assert.equal(L.moneyIssues([t("€0.8909", { rate: true })]).hard.length, 0);
  });
  await test("money: a page's own <header> with '10 credits = $1' (praxis /dashboard/wallet) is not the site header; a money balance in the site header still fires", async (page) => {
    await load(page, doc(`<header style="height:60px"><a href="/">Praxis</a> <span>Account</span></header><main><section><div class="mx-auto"><header class="mb-6"><h1>Wallet</h1><p>Prepaid credits. 10 credits = $1 = €0.89</p></header><p>Top up with any whole amount of credits.</p></div></section></main>`));
    let m = await L.moneyFormat(page);
    assert.ok(!m.soft.some((f) => /header shows money/.test(f.what)), show(m.soft));
    await load(page, doc(`<header style="height:60px"><a href="/">Praxis</a> <span>Account</span></header><div class="shell"><section><header class="mb-6"><h1>Wallet</h1><p>Your balance in money: $240.00</p></header><p>Buy credits for tasks.</p></section></div>`));
    m = await L.moneyFormat(page);
    assert.ok(!m.soft.some((f) => /header shows money/.test(f.what)), `a page header in a section outside main is not the site header either: ${show(m.soft)}`);
    // 5.7.1 asks for a credits amount ("500 credits"), not the word "credits" in a sentence: on a product
    // that bills in dollars, "sign-up credit" or "credit card" used to be enough to call it a credits product.
    await load(page, doc(`<header style="height:60px"><a href="/">Praxis</a> <span>Balance: $240.00</span></header><main><h1>Dashboard</h1><p>Buy credits for tasks. 500 credits left this month.</p></main>`));
    m = await L.moneyFormat(page);
    assert.ok(m.soft.some((f) => /header shows money \("\$240\.00"\)/.test(f.what)), show(m.soft));
    // and the word alone is not: the same header on a page that only mentions credits stays quiet
    await load(page, doc(`<header style="height:60px"><a href="/">Praxis</a> <span>Balance: $240.00</span></header><main><h1>Dashboard</h1><p>Buy credits for tasks.</p></main>`));
    m = await L.moneyFormat(page);
    assert.ok(!m.soft.some((f) => /header shows money/.test(f.what)), `the word "credits" alone is not a credits product: ${show(m.soft)}`);
  });

  /* ───────── P2 / P3: collapsed contents bar, data categories ───────── */
  const sections = Array.from({ length: 8 }, (_, i) => `<h2 id="s${i}">Section ${i + 1}</h2><p style="margin-bottom:300px">Clause text for section ${i + 1}.</p>`).join("");
  const anchors = Array.from({ length: 8 }, (_, i) => `<a href="#s${i}">Section ${i + 1}</a>`).join("");
  await test("P2 a sticky collapsed contents bar (button 'Contents · …' with aria-expanded, or a sticky <details>) is the 'On this page'; no contents at all, or an open list that scrolls away, still fire", async (page) => {
    await load(page, doc(`<main><h1>Terms</h1><div style="position:sticky;top:56px;background:#fff"><button aria-expanded="false" aria-controls="toc">Contents · Section 1</button><nav id="toc" hidden>${anchors}</nav></div>${sections}</main>`), "/terms");
    assert.deepEqual((await A.policyLayout(page)).filter((f) => f.id === "P2"), []);
    await load(page, doc(`<main><h1>Terms</h1><nav><div>On this page</div>${anchors}</nav><div style="position:sticky;top:56px;background:#fff"><button aria-expanded="false">Contents · Section 1</button></div>${sections}</main>`), "/terms");
    assert.deepEqual((await A.policyLayout(page)).filter((f) => f.id === "P2"), [], "an open list at the top plus the sticky bar: the bar is the sticky one");
    await load(page, doc(`<main><h1>Terms</h1><details style="position:sticky;top:0;background:#fff"><summary>On this page</summary>${anchors}</details>${sections}</main>`), "/terms");
    assert.deepEqual((await A.policyLayout(page)).filter((f) => f.id === "P2"), [], "a sticky <details>");
    await load(page, doc(`<main><h1>Terms</h1>${sections}</main>`), "/terms");
    assert.ok((await A.policyLayout(page)).some((f) => /no "On this page" navigation/.test(f.what)), "no contents at all");
    await load(page, doc(`<main><h1>Terms</h1><nav><div>On this page</div>${anchors}</nav>${sections}</main>`), "/terms");
    assert.ok((await A.policyLayout(page)).some((f) => /scrolls away/.test(f.what)), "an open list that is not sticky");
    await load(page, doc(`<main><h1>Terms</h1><div><button aria-expanded="false">Contents</button></div>${sections}</main>`), "/terms");
    assert.ok((await A.policyLayout(page)).some((f) => /scrolls away/.test(f.what)), "a collapsed bar that is not sticky scrolls away");
  }, { width: 390, height: 844 });
  await test("P3 'Wallet: your credit balance…' in a list of data categories is not a page reference; 'top up from your Wallet' still is", async (page) => {
    await load(page, doc(`<main><h1>Privacy Policy</h1><ul><li>Wallet: your credit balance, top-ups and history.</li><li>Account settings: your name and email.</li></ul></main>`), "/privacy");
    assert.deepEqual(await A.policyCrossLinks(page), []);
    await load(page, doc(`<main><h1>Privacy Policy</h1><p>You can top up from your Wallet at any time.</p></main>`), "/privacy");
    assert.ok((await A.policyCrossLinks(page)).some((f) => /"Wallet" is mentioned but not linked/.test(f.what)));
  });

  /* ───────── CT6: a month-group header ───────── */
  await test("CT6 'October 2026' alone in a table group row or a heading is a month, not a date; in a sentence, a standalone body line, or with a day, it still fires", async () => {
    const rules = (seg) => R.lintSegment(seg, R.CONTENT_DEFAULTS).map((x) => x.rule);
    assert.ok(!rules({ text: "October 2026", kind: "body", table: true }).includes("content/date-format"));
    assert.ok(!rules({ text: "October 2026", kind: "heading" }).includes("content/date-format"));
    assert.ok(rules({ text: "Statement for October 2026", kind: "body", table: true }).includes("content/date-format"));
    assert.ok(rules({ text: "Oct 2026", kind: "body" }).includes("content/date-format"));
    assert.ok(rules({ text: "14 October 2026", kind: "body", table: true }).includes("content/date-format"));
  });

  /* ───────── 1.6: the selected chip of a filter list, one chip per <li> (praxis /specialists) ───────── */
  await test("1.6 the selected chip in a <ul> of filter chips (one per <li>) keeps its look on hover; a look-alike chip with no hover still fires", async (page) => {
    const chip = "display:block;height:36px;padding:0 12px;border:1px solid #ccc;border-radius:6px;font:14px Arial;cursor:pointer";
    await load(page, doc(`<style>.c{${chip};background:#fff;color:#111}.c:hover{background:#eee}.sel{${chip};background:#111;color:#fff}</style><main><h1>Specialists</h1><nav><ul>
      <li><button class="sel" id="all">All areas 30</button></li><li><button class="c">Tax 12</button></li><li><button class="c">Law 9</button></li><li><button class="c">Audit 6</button></li><li><button class="c">HR 3</button></li></ul></nav></main>`));
    let r = await L.hoverFeedback(page);
    assert.deepEqual(r.hard, [], show(r.hard));
    await load(page, doc(`<style>.c{${chip};background:#fff;color:#111}.c:hover{background:#eee}.dead{${chip};background:#fff;color:#111}</style><main><h1>Specialists</h1><nav><ul>
      <li><button class="c">All areas 30</button></li><li><button class="dead" id="dead">Tax 12</button></li><li><button class="c">Law 9</button></li></ul></nav></main>`));
    r = await L.hoverFeedback(page);
    assert.ok(sels(r.hard).some((s) => /dead|Tax 12/.test(s)), show(r.hard));
  });

  /* ───────── 1.17: rows and cells of a rounded frame (praxis /dashboard/tasks, parallel /pricing) ───────── */
  await test("1.17 a group-header row spanning a rounded card and the touching cells of a ruled grid in a rounded frame are parts of the frame; a small square button in a rounded card still fires", async (page) => {
    const btn = "height:40px;padding:0 16px;border-radius:10px;background:#123;color:#fff;border:0";
    const roundedSite = Array.from({ length: 16 }, (_, i) => `<button style="${btn}">Action ${i}</button>`).join(" ");
    await load(page, doc(`<main><h1>Tasks</h1>${roundedSite}
      <div style="border:1px solid #ccc;border-radius:16px;overflow:hidden;margin:16px;width:700px"><div><button id="grp" style="display:block;width:100%;height:44px;border:0;border-bottom:1px solid #ccc;background:#f3f3f3;border-radius:0;text-align:left">Waiting ( 9 )</button></div><p style="padding:12px">Task 1</p></div>
      <div style="border:1px solid #ccc;border-radius:16px;overflow:hidden;margin:16px;width:900px"><ol style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#ccc;margin:0;padding:0;list-style:none">
        ${Array.from({ length: 6 }, (_, i) => `<li class="cell" style="background:#fff;padding:24px 20px;min-height:120px"><h3>Step ${i + 1}</h3><p>What happens at this step.</p></li>`).join("")}</ol></div></main>`));
    let shapes = await checks.collectShapes(page, "/");
    let out = checks.shapeOutliers(shapes, checks.siteShape(shapes));
    assert.deepEqual(out, [], show(out));
    await load(page, doc(`<main><h1>Tasks</h1>${roundedSite}<div style="border:1px solid #ccc;border-radius:16px;padding:16px;margin:16px;width:700px"><p>Task 1</p><button id="sq" style="height:40px;width:120px;border-radius:0;background:#123;color:#fff;border:0">Open</button></div></main>`));
    shapes = await checks.collectShapes(page, "/");
    out = checks.shapeOutliers(shapes, checks.siteShape(shapes));
    assert.ok(out.some((f) => /square-cornered button/.test(f.what) && /Open|sq/.test(`${f.where} ${f.selector}`)), show(out));
  });

  /* ───────── 2.11: text scrolled out of a scroll box (praxis /onboarding) ───────── */
  await test("2.11 text clipped by a scroll box is not 'covered'; text under an opaque box still is", async (page) => {
    const paras = Array.from({ length: 12 }, (_, i) => `<p>${i + 1}.1 Your documents are kept in private storage, clause ${i + 1}.</p>`).join("");
    await load(page, doc(`<main style="background:#fafafa"><h1>Agreement</h1><section><div style="height:200px;overflow-y:auto;border:1px solid #ccc">${paras}</div></section><div style="background:#eee;padding:16px;height:400px"><label><input type="checkbox"> I have read the agreement</label></div></main>`));
    assert.deepEqual(await checks.overlappingText(page), []);
    await load(page, doc(`<main><h1>Agreement</h1><p id="hidden">This sentence sits under a box that covers it.</p><div style="position:absolute;top:40px;left:0;right:0;height:80px;background:#ddd">Promo text over the page</div></main>`));
    assert.ok((await checks.overlappingText(page)).some((f) => /hidden|This sentence/.test(f.where)), "covered text still fires");
  });

  /* ───────── 4.4: the list a pagination pages, not the page's layout grid (praxis /dashboard/tasks) ───────── */
  const tasksPage = (scrollsTo) => doc(`<header style="position:sticky;top:0;height:64px;background:#fff;z-index:2">Praxis</header>
    <main><div class="mx-auto grid" style="display:grid;grid-template-columns:200px 1fr"><aside>Account Desk Task board Credits Profile</aside>
    <div><h1>Task board</h1><div style="height:900px">Filters and summary</div><div id="tasks" style="scroll-margin-top:72px"></div><nav aria-label="Pagination"><button onclick="go(1)">1</button><button onclick="go(2)">2</button></nav></div></div></main>
    <script>function go(n){ const l=document.getElementById("tasks"); l.innerHTML=""; for(let i=0;i<8;i++){ const d=document.createElement("div"); d.style.cssText="height:90px;border-bottom:1px solid #ccc"; d.textContent="Task "+(n*8+i); l.appendChild(d);} ${scrollsTo} } go(1);</script>`);
  await test("4.4 after '2' the task list (div cards) is measured, not the page's layout grid around the sidebar; a list left above the screen still fires", async (page) => {
    await load(page, tasksPage(`if(n>1) document.getElementById("tasks").scrollIntoView({block:"start"});`), "/tasks");
    let r = await run.stateChecks(page, { reload: () => load(page, tasksPage(`if(n>1) document.getElementById("tasks").scrollIntoView({block:"start"});`), "/tasks"), maxOpeners: 0, maxForms: 0 });
    assert.ok(!r.findings.some((f) => /pagination/.test(f.what)), show(r.findings));
    assert.ok(r.states.some((s) => /pagination "2"/.test(s)), show(r.states));
    await load(page, tasksPage(""), "/tasks");
    r = await run.stateChecks(page, { reload: () => load(page, tasksPage(""), "/tasks"), maxOpeners: 0, maxForms: 0 });
    assert.ok(r.findings.some((f) => /after the pagination "2" the new page of results/.test(f.what) && /tasks/.test(f.where)), show(r.findings));
  }, { width: 1280, height: 720 });

  /* ───────── 1.2 sort: in the page's language ───────── */
  await test("1.2 dropdown order is judged in the page's language: Azerbaijani 'C, Ç' order passes on an az page; a list out of order in az still fires", async (page) => {
    const az = ["Ağ", "Bağ", "Cəmi", "Çay", "Dəniz"];
    assert.equal(L.orderOf(az, "az"), null);
    assert.notEqual(L.orderOf(["Ağ", "Bağ", "Çay", "Cəmi", "Dəniz"], "az"), null);
    assert.equal(L.orderOf(["Ağ", "Bağ", "Cəmi", "Çay", "Dəniz"], "not a lang!"), L.orderOf(["Ağ", "Bağ", "Cəmi", "Çay", "Dəniz"]), "a bad lang tag falls back to the default");
    await load(page, doc(`<main><h1>Əlaqə</h1><label>Mövzu <select id="topic">${az.map((x) => `<option>${x}</option>`).join("")}</select></label></main>`, { lang: "az" }));
    const r = await L.dropdowns(page, 0);
    assert.deepEqual(r.soft, [], show(r.soft));
  });

  /* ───────── 2.7: a decorative marquee band is content (parallel /) ───────── */
  await test("2.7 an aria-hidden marquee band between sections is painted content, not empty space; a real 400 px hole still fires", async (page) => {
    const sec = (t) => `<section style="padding:24px 16px"><h2>${t}</h2><p>Some text for ${t}.</p></section>`;
    const marquee = `<div class="pk-marquee" style="padding:64px 0;overflow:hidden"><div class="pk-marquee-track" aria-hidden="true" style="white-space:nowrap;font:700 64px Arial;color:transparent;-webkit-text-stroke:1px #333">TAX · LAW · AUDIT · HR · TAX · LAW · AUDIT · HR</div></div>`;
    await load(page, doc(`<main>${sec("One")}${sec("Two")}${marquee}${sec("Three")}${sec("Four")}${sec("Five")}</main>`));
    let r = await L.emptySpace(page);
    assert.deepEqual(r.soft, [], show(r.soft));
    await load(page, doc(`<main>${sec("One")}${sec("Two")}<div style="height:400px"></div>${sec("Three")}${sec("Four")}${sec("Five")}</main>`));
    r = await L.emptySpace(page);
    assert.ok(r.soft.some((f) => /empty space above this section/.test(f.what)), show(r.soft));
  });

  /* ───────── A3: Radix's hidden bubble input (parallel /register) ───────── */
  await test("A3 a Radix Checkbox (button[role=checkbox] + hidden bubble input) is one consent checkbox; two real ones still fire", async (page) => {
    await load(page, doc(`<main><h1>Create account</h1><form><input type="email" aria-label="Email"><div><button type="button" role="checkbox" aria-checked="false" id="c" style="width:16px;height:16px"></button><input type="checkbox" aria-hidden="true" tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;margin:0;transform:translateX(-100%)"><label for="c">I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a></label></div><button>Create account</button></form></main>`), "/register");
    let out = await A.signupConsent(page);
    assert.ok(!out.some((f) => /consent checkboxes/.test(f.what)), show(out));
    await load(page, doc(`<main><h1>Create account</h1><form><input type="email" aria-label="Email"><label><input type="checkbox"> I agree to the <a href="/terms">Terms</a></label><label><input type="checkbox"> I accept the <a href="/privacy">Privacy Policy</a></label><button>Create account</button></form></main>`), "/register");
    out = await A.signupConsent(page);
    assert.ok(out.some((f) => /2 consent checkboxes/.test(f.what)), show(out));
  });

  /* ───────── 1.3 / 1.16: input radius of underline fields and a pill select chip (parallel /contact, /specialists) ───────── */
  await test("1.3 an underline-only field has no corner radius to count and a compact pill select trigger is a chip; a boxed field's radius still counts", async (page) => {
    await load(page, doc(`<main><h1>Contact</h1><form><input id="name" style="border:0;border-bottom:1px solid #333;border-radius:0;height:40px;background:transparent"><input id="box" style="border:1px solid #333;border-radius:8px;height:40px"><button type="button" role="combobox" id="rows-per-page" style="height:32px;padding:0 12px;border:1px solid #ccc;border-radius:9999px">20 rows</button></form></main>`));
    const sigs = (await checks.collectSignatures(page, "/")).filter((s) => s.kind === "input");
    const by = (re) => sigs.find((s) => re.test(s.where + " " + s.selector));
    assert.equal(by(/name/).radius, null, show(sigs));
    assert.equal(by(/box/).radius, 8);
    assert.ok(!by(/rows-per-page|20 rows/), "the pill select trigger is not counted as a field");
    assert.deepEqual(checks.variety(sigs, "input", "radius", (s) => s.radius !== null).map((v) => v.value), ["8"]);
  });

  /* ───────── a modal open on arrival (parallel dashboard): closed, reported once ───────── */
  await test("arrival modal: a modal open on load is closed (Esc / close button) and reported once; one that cannot be closed is hard; a cookie dialog is left to 4.6", async (page) => {
    const page1 = doc(`<header><nav><a href="/a">A</a></nav></header><main><h1>Dashboard</h1></main><footer>© 2026</footer>
      <div role="dialog" aria-modal="true" aria-labelledby="t" id="m" style="position:fixed;inset:0;background:rgba(0,0,0,.5)"><div style="background:#fff;margin:100px auto;width:400px;padding:20px"><h2 id="t">Your application is pending</h2><button aria-label="Close" onclick="document.getElementById('m').remove()">×</button></div></div>`);
    await load(page, page1, "/dashboard");
    const got = await checks.dismissArrivalModal(page);
    assert.equal(got && got.closed, true, show(got));
    assert.match(got.name, /application is pending/);
    assert.equal(await page.evaluate(() => !!document.getElementById("m")), false, "closed");
    const f = checks.arrivalModalFindings(page.__bsArrival);
    assert.deepEqual([f.hard.length, f.soft.length], [0, 1]);
    assert.equal(await checks.h1Count(page), 1, "the page checks see the page behind it");
    await load(page, doc(`<main><h1>Dashboard</h1></main><div role="dialog" aria-modal="true" style="position:fixed;inset:0;background:#fff"><h2>Choose your role</h2><p>Pick one to continue.</p></div>`), "/dashboard");
    const stuck = await checks.dismissArrivalModal(page);
    assert.equal(stuck.closed, false);
    assert.equal(checks.arrivalModalFindings(stuck).hard.length, 1);
    await load(page, doc(`<main><h1>Home</h1></main><div role="dialog" aria-modal="true" aria-label="Cookie consent" style="position:fixed;bottom:0;left:0;right:0;height:160px;background:#fff"><p>We use cookies.</p><button>Accept</button></div>`), "/");
    assert.equal(await checks.dismissArrivalModal(page), null);
    await load(page, doc(`<main><h1>Home</h1></main>`), "/");
    assert.equal(await checks.dismissArrivalModal(page), null);
  });

  /* ───────── navigation flakes (parallel /refund: chrome-error://, passed on rerun) ───────── */
  await test("gotoStable: a page whose first load is cut off opens on the retry; one that never opens throws 'navigation flake:'; the run summary lists it as a flake, not a finding", async (page) => {
    site = { ...site, "/flaky": doc("<main><h1>Refund policy</h1></main>") };
    drops = 1;
    await checks.gotoStable(page, ORIGIN + "/flaky");
    assert.equal(await page.evaluate(() => document.querySelector("h1")?.textContent), "Refund policy");
    let err = null;
    try { await checks.gotoStable(page, ORIGIN + "/dead", { timeout: 10_000, fallbackTimeout: 10_000 }); } catch (e) { err = e; }
    assert.ok(err && /^navigation flake:/.test(err.message), String(err && err.message));
    assert.ok(isNavFlake(err.message));
    assert.ok(isNavFlake('page.goto: Navigation to "https://x/refund" is interrupted by another navigation to "chrome-error://chromewebdata/"'));
    assert.ok(!isNavFlake("expect(received).toBe(expected) // 3.3 exactly one h1"));
    const root = mkdtempSync(join(tmpdir(), "bs-flake-"));
    try {
      mkdirSync(join(root, ".babysitter"));
      const spec = (title, status, message) => ({ title, file: "babysitter.spec.ts", tests: [{ projectName: "desktop-1440", status: status === "passed" ? "expected" : "unexpected", results: [{ status, errors: message ? [{ message }] : [], annotations: [] }] }] });
      writeFileSync(join(root, ".babysitter/report.json"), JSON.stringify({ suites: [{ title: "babysitter.spec.ts", suites: [{ title: "/refund", specs: [
        spec("D3 no duplicate images", "failed", err.message), spec("3.3 exactly one h1 [P26]", "failed", "Error: expected 1, got 0"), spec("2.1 no horizontal scroll", "passed"),
      ] }] }] }));
      const s = summarize({ root, configured: { viewports: ["desktop-1440"] }, rerun: "babysitter e2e --last-failed" });
      assert.equal(s.failed.length, 1, s.text);
      assert.equal(s.findings.length, 1);
      assert.match(s.text, /1 navigation flake/);
      assert.match(s.text, /Navigation flakes \(1\)/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`fp-510: ${failed} failed`); process.exit(1); }
console.log("fp-510: ok");
