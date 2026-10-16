// playwright/checks/layout.js — every check proves it fires on the bug (true positive) and stays quiet on the
// look-alike that is fine (false positive). Fixture pages are served by a local HTTP server, so
// links resolve to same-origin paths the way they do on a real site.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
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

// fixture pages come from a local server (not page.route: the page's own fetch() and page.request must reach it too)
let site = { path: "/", body: "", icons: {} };
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === site.path) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(site.body); }
  if (site.icons[u.pathname]) { res.writeHead(200, { "content-type": site.icons[u.pathname][0] }); return res.end(site.icons[u.pathname][1]); }
  if (/favicon|apple-touch|\.(png|ico|svg|jpe?g|webp)$/.test(u.pathname)) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>other</title><h1>Other</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/** Opens `html` (a fixture name or markup) at <local server><path>; `vars` replaces {KEY} placeholders. */
async function load(page, html, { path = "/", vars = {}, icons = {} } = {}) {
  let body = html.trim().startsWith("<") ? html : fixture(html);
  for (const [k, v] of Object.entries(vars)) body = body.split(`{${k}}`).join(v);
  site = { path: path.split("#")[0] || "/", body, icons };
  await page.goto(ORIGIN + path);
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
    // sprout.boutique: every item carries an underline in a transparent colour; only the current one paints it
    r = await run("nav a{text-decoration:underline;text-decoration-color:transparent} nav a[aria-current=page]{text-decoration-color:#000}");
    assert.deepEqual([...r.hard, ...r.soft], [], JSON.stringify(r));
    r = await run("nav a{text-decoration:underline;text-decoration-color:transparent}");
    assert.deepEqual(sel(r.hard), ["#n-pricing"], "a transparent underline is no active style");
    // vertex/truelogos: a text wordmark linking home ("V VERTEX ELITE") is the logo, not a highlighted nav item
    await page.unrouteAll();
    await load(page, fixture("active.html").replace('<a href="/"><svg width="24" height="24"><rect width="24" height="24"/></svg></a>', '<nav><a href="/" style="font-weight:800;color:#000">V VERTEX</a><a href="/x">X</a><a href="/y">Y</a></nav>'), { path: "/pricing", vars: { CSS: "nav a[aria-current=page]{color:#000}" } });
    r = await L.activeNavStyle(page);
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
  await test("6.5 headings: looks (with size) and faces (without) per level across pages; tracking in em, all-caps as rendered; sr-only and chrome headings left out", async (page) => {
    const all = [];
    const looks = ["font:700 40px Arial", "font:700 56px Arial", "font:600 36px Georgia;letter-spacing:-1px", "font:700 40px Arial;text-transform:uppercase", "font:700 40px Arial;letter-spacing:0.05px"];
    for (const [i, css] of looks.entries()) {
      await page.unrouteAll();
      await load(page, `<!doctype html><title>p${i}</title><header><h1 style="font:400 12px Arial">In header</h1></header><main><h1 style="${css}">Page ${i}</h1><h2 style="font:600 24px Arial">Section</h2><h2 class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Hidden</h2></main>`, { path: `/p${i}` });
      all.push(...(await L.collectHeadings(page, `/p${i}`)));
    }
    const h1 = L.headingVariants(all, "h1");
    // 40px Arial ×2 (p0, p4: 0.05px tracking rounds to 0em), 56px Arial, Georgia, caps
    assert.equal(h1.length, 4, JSON.stringify(h1));
    assert.deepEqual(h1[0].pages, ["/p0", "/p4"]);
    assert.match(h1.map((v) => v.look).join(" "), /Georgia 36px\/600 ls -0.03em/);
    assert.match(h1.map((v) => v.look).join(" "), /Arial 40px\/700 caps/);
    assert.equal(L.headingVariants(all, "h1", "face").length, 3, "faces ignore size only");
    // -0.025em at 88 px and at 48 px is one tracking (praxis)
    const tr = [];
    for (const [i, px] of [88, 48].entries()) { await load(page, `<!doctype html><title>t</title><main><h1 style="font:300 ${px}px Georgia;letter-spacing:-0.025em">T${i}</h1></main>`, { path: `/t${i}` }); tr.push(...(await L.collectHeadings(page, `/t${i}`))); }
    assert.equal(L.headingVariants(tr, "h1", "face").length, 1, JSON.stringify(tr.map((x) => x.face)));
    assert.equal(L.headingVariants(all, "h2").length, 1, "one h2 look; the sr-only one is not counted");
  });
  await test("2.5 orphans: a heading whose number sits on its own line by layout is no orphan", async (page) => {
    await load(page, `<!doctype html><title>t</title><main><h2 id="num" style="width:300px;font-size:24px"><span style="display:block">1</span> Introduction and acceptance</h2><h2 id="flex" style="display:flex;flex-direction:column;width:300px;font-size:24px">Our services <small>2</small></h2></main>`);
    const r = await L.textBreaks(page);
    assert.deepEqual(r.soft, [], JSON.stringify(r.soft));
  }, mobile);
  await test("2.5 text breaks at 390: a word broken mid-word and a split number are hard; real hyphen breaks, no-break spaces and paragraphs pass; an orphan is soft", async (page) => {
    await load(page, "breaks.html");
    const r = await L.textBreaks(page);
    const hs = sel(r.hard);
    for (const id of ["#h-break", "#h-hyph", "#b-break", "#h-num"]) assert.ok(hs.includes(id), `${id} reported: ${JSON.stringify(r.hard.map((f) => f.selector + " " + f.what))}`);
    for (const id of ["#h-ok", "#b-ok", "#h-num-ok"]) assert.ok(!hs.includes(id), `${id} is fine: ${JSON.stringify(r.hard.filter((f) => f.selector === id))}`);
    assert.ok(!r.hard.some((f) => /Longparagraph/.test(f.what)), "body copy is not a label");
    assert.deepEqual(sel(r.soft), ["#h-orphan"], JSON.stringify(r.soft.map((f) => f.selector + " " + f.what)));
  }, mobile);
  await test("2.7/2.4 alignment: a 6 px nudged paragraph, a lower column, a nudged field and label are soft; a table header misaligned with its values is hard; intent (indent, centring, align-items:center, matching headers) passes", async (page) => {
    await load(page, "align.html");
    const r = await L.alignment(page);
    const soft = sel(r.soft);
    for (const id of ["#off", "#lower", "#lab-off", "#c"]) assert.ok(soft.includes(id), `${id} reported: ${JSON.stringify(r.soft.map((f) => f.selector + " " + f.what))}`);
    assert.equal(r.soft.length, 4, `nothing else: ${JSON.stringify(r.soft.map((f) => f.selector + " " + f.what))}`);
    assert.deepEqual(sel(r.hard), ["#th-price"], JSON.stringify(r.hard.map((f) => f.selector + " " + f.what)));
    assert.match(r.hard[0].what, /header is left but its values line up on the right edge/);
  });
  await test("2.7 empty space: a 540 px gap among 80 px gaps and a 2000 px section that is mostly air are soft (with crops); even gaps and a pictured hero pass", async (page) => {
    await load(page, "space.html", { vars: { GAP: "540", HERO: "2000", HEROBG: "" } });
    let r = await L.emptySpace(page);
    assert.deepEqual(sel(r.soft).sort(), ["#gap", "#hero"], JSON.stringify(r.soft.map((f) => f.selector + " " + f.what)));
    assert.equal(r.crops.length, 2);
    assert.ok(r.crops.every((c) => c.width > 0 && c.height > 0));
    await page.unrouteAll();
    await load(page, "space.html", { vars: { GAP: "40", HERO: "0", HEROBG: "" } });
    r = await L.emptySpace(page);
    assert.deepEqual(r.soft, [], JSON.stringify(r.soft.map((f) => f.what)));
    await page.unrouteAll();
    await load(page, "space.html", { vars: { GAP: "40", HERO: "2000", HEROBG: "background-image:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)" } });
    r = await L.emptySpace(page);
    assert.deepEqual(r.soft, [], "a hero carried by a picture is not empty");
  });
  await test("3.6 sticky header: a static or hide-on-scroll header fails; sticky, fixed and a compact replacement bar pass; a short page is not applicable", async (page) => {
    const run = async (vars) => { await page.unrouteAll(); await load(page, "sticky.html", { vars: { H: "3000", HEAD: "", JS: "", ...vars } }); return L.stickyHeader(page); };
    let r = await run({});
    assert.ok(r.applicable && !r.ok, JSON.stringify(r));
    assert.match(r.what, /scrolls away: after scrolling 1000 px/);
    assert.equal(await page.evaluate(() => scrollY), 0, "scrolled back to the top");
    r = await run({ HEAD: "position:sticky;top:0" });
    assert.ok(r.ok, "sticky");
    r = await run({ HEAD: "position:fixed;top:0;left:0;right:0" });
    assert.ok(r.ok, "fixed");
    r = await run({ HEAD: "position:fixed;top:0;left:0;right:0;transition:transform .2s", JS: "addEventListener('scroll',()=>document.getElementById('h').classList.toggle('hide',scrollY>100))" });
    assert.ok(!r.ok, "hide-on-scroll header is gone at 1000 px");
    r = await run({ JS: "addEventListener('scroll',()=>document.getElementById('compact').style.display=scrollY>100?'flex':'none')" });
    assert.ok(r.ok, "a compact bar replaces the header");
    r = await run({ H: "300" });
    assert.equal(r.applicable, false);
    // sprout.boutique: a ticker strip above the header bar; the bar itself scrolls away
    await page.unrouteAll();
    await load(page, fixture("sticky.html").replace('<header id="h">', '<div style="height:36px;background:#000"></div><header id="h">'), { vars: { H: "3000", HEAD: "", JS: "" } });
    r = await L.stickyHeader(page);
    assert.ok(r.applicable && !r.ok, JSON.stringify(r));
  });
  await test("4.3 long lists: 30 cards and 25 table rows with no pager are soft; 'Load more', prose bullets, a marquee and 20 items pass", async (page) => {
    const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");
    const vars = (o = {}) => ({ CARDS: rep(30, (i) => `<li class="card"><h3>Name ${i}</h3><p>Role</p></li>`), MORE: "", PROSE: rep(30, (i) => `<li>Clause ${i} with <a href="/x">a link</a></li>`), LOGOS: rep(30, (i) => `<img alt="l${i}" width="80" height="30" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`), ROWS: rep(25, (i) => `<tr><td>2026-01-${i + 1}</td><td>$${i}.00</td></tr>`), ...o });
    await load(page, "lists.html", { vars: vars() });
    let r = await L.longLists(page);
    assert.deepEqual(sel(r.soft).sort(), ["#cards", "#rows"], JSON.stringify(r.soft.map((f) => f.selector + " " + f.what)));
    await page.unrouteAll();
    await load(page, "lists.html", { vars: vars({ MORE: '<button>Load more</button>', ROWS: rep(20, () => "<tr><td>a</td><td>b</td></tr>") }) });
    r = await L.longLists(page);
    assert.deepEqual(r.soft, [], JSON.stringify(r.soft.map((f) => f.selector)));
  });
  await test("6.11 favicon: missing, unserved, framework default and another product's icon are hard; the product's own icon passes", async (page) => {
    const reg = mkdtempSync(join(tmpdir(), "bs-fav-"));
    const registry = join(reg, "favicons.json");
    try {
      const own = readFileSync(join(here, "fixtures", "layout", "own.svg"));
      const def = readFileSync(join(here, "fixtures", "layout", "next-default.ico"));
      const page1 = (head) => `<!doctype html><html><head><title>x</title>${head}</head><body><h1>x</h1></body></html>`;
      await load(page, page1(""));
      let r = await L.favicon(page, { product: "a", registry });
      assert.match(r.hard.map((f) => f.what).join(" "), /no favicon/);
      await page.unrouteAll(); await load(page, page1('<link rel="icon" href="/missing.png">'));
      r = await L.favicon(page, { product: "a", registry });
      assert.match(r.hard.map((f) => f.what).join(" "), /answers 404/);
      await page.unrouteAll(); await load(page, page1('<link rel="icon" href="/favicon.ico">'), { icons: { "/favicon.ico": ["image/x-icon", def] } });
      r = await L.favicon(page, { product: "a", registry });
      assert.match(r.hard.map((f) => f.what).join(" "), /create-next-app default/);
      await page.unrouteAll(); await load(page, page1('<link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/icon.svg">'), { icons: { "/icon.svg": ["image/svg+xml", own] } });
      r = await L.favicon(page, { product: "a", registry });
      assert.deepEqual([...r.hard, ...r.soft], [], JSON.stringify(r));
      r = await L.favicon(page, { product: "a", registry });
      assert.deepEqual(r.hard, [], "the same product seen again is fine");
      // another product (another origin) registered the same file
      const db = JSON.parse(readFileSync(registry, "utf8"));
      for (const k of Object.keys(db)) db[k].push({ product: "other", origin: "https://other.example" });
      writeFileSync(registry, JSON.stringify(db));
      r = await L.favicon(page, { product: "a", registry });
      assert.match(r.hard.map((f) => f.what).join(" "), /same file as other \(https:\/\/other.example\)/, "another product with the same icon");
      assert.ok(L.sameProduct({ product: "vertex", origin: "http://localhost:3000" }, { product: "vertex.boutique", origin: "https://vertex.boutique" }), "one product under its package name and its host");
      assert.ok(!L.sameProduct({ product: "sprout", origin: "https://sprout.boutique" }, { product: "vertex", origin: "https://vertex.boutique" }));
      await page.unrouteAll(); await load(page, page1('<link rel="icon" href="/icon.svg">'), { icons: { "/icon.svg": ["image/svg+xml", own] } });
      r = await L.favicon(page, { product: "a", registry });
      assert.match(r.soft.map((f) => f.what).join(" "), /apple-touch-icon/);
    } finally { rmSync(reg, { recursive: true, force: true }); }
  });
  await test("1.2 dropdowns: order, selected marking, selected in view, tick side; a sort-by list and natural orders pass", async () => {
    assert.equal(L.orderOf(["Select country", "Azerbaijan", "France", "Germany"]), null);
    assert.equal(L.orderOf(["XS", "S", "M", "L", "XL"]), null);
    assert.equal(L.orderOf(["1 month", "3 months", "12 months"]), null);
    assert.equal(L.orderOf(["Jan", "Feb", "Mar", "Apr"]), null);
    assert.equal(L.orderOf(["Zebra", "Yak", "Ant"]), null, "descending is an order");
    assert.equal(L.orderOf(["Billing", "Account", "Technical", "Other"]) !== null, true);
    assert.equal(L.orderOf(["EUR", "USD", "AZN", "CAD", "GBP", "KZT"]), null, "favourites pinned on top, then A–Z");
    assert.notEqual(L.orderOf(["EUR", "USD", "SAR", "MAD", "CAD", "LKR"]), null, "truelogos currency list: no order after the pinned ones");
  });
  await test("1.2 dropdowns on a page: unsorted native/custom lists are soft; an unmarked or hidden selected option and ticks on both sides are hard", async (page) => {
    const opt = (labels, sel, tick) => labels.map((l) => `<div role="option" aria-selected="${l === sel}"><span>${l}</span>${l === sel && tick ? `<svg class="tick" viewBox="0 0 12 12"><path d="M1 6l3 3 7-7" stroke="#000" fill="none"/></svg>` : ""}</div>`).join("");
    const optL = (labels, sel) => labels.map((l) => `<div role="option" aria-selected="${l === sel}">${l === sel ? '<svg class="tick" viewBox="0 0 12 12"><path d="M1 6l3 3 7-7" stroke="#000" fill="none"/></svg>' : '<i class="tick"></i>'}<span>${l}</span></div>`).join("");
    await load(page, "dropdowns.html", { vars: { MAXH: "300px", SELSTYLE: "", OPTIONS1: opt(["Billing", "Account", "Technical"], "Account", false), OPTIONS2: opt(["EUR", "KZT", "USD"], "USD", true) } });
    let r = await L.dropdowns(page);
    assert.deepEqual(sel(r.soft).sort(), ["#country", "#dd1"], JSON.stringify(r.soft.map((f) => f.selector + " " + f.what)));
    assert.equal(r.hard.length, 1, JSON.stringify(r.hard));
    assert.match(r.hard[0].what, /"Account" looks like the others/);
    await page.unrouteAll();
    await load(page, "dropdowns.html", { vars: { MAXH: "300px", SELSTYLE: "background:#eef", OPTIONS1: optL(["Account", "Billing", "Technical"], "Account"), OPTIONS2: opt(["EUR", "KZT", "USD"], "USD", true) } });
    r = await L.dropdowns(page);
    assert.equal(r.hard.length, 1, JSON.stringify(r.hard));
    assert.match(r.hard[0].what, /left in some dropdowns and on the right in others/);
    await page.unrouteAll();
    const many = Array.from({ length: 12 }, (_, i) => `Option ${String(i + 1).padStart(2, "0")}`);
    await load(page, "dropdowns.html", { vars: { MAXH: "96px", SELSTYLE: "background:#eef", OPTIONS1: opt(many, "Option 12", true), OPTIONS2: opt(["EUR", "KZT", "USD"], "USD", true) } });
    r = await L.dropdowns(page);
    assert.deepEqual(r.hard.map((f) => /scrolled out of sight/.test(f.what)), [true], JSON.stringify(r.hard));
  });
  await test("1.6 hover: dead button and dead link-button are hard, dead card and accordion text button soft; fill, child colour, pseudo bar and shadow changes pass; disabled skipped", async (page) => {
    await load(page, "hover.html");
    const r = await L.hoverFeedback(page);
    assert.deepEqual(sel(r.hard).sort(), ["#a-dead", "#b-dead"], JSON.stringify(r.hard.map((f) => f.selector)));
    assert.deepEqual(sel(r.soft).sort(), ["#acc", "#c-dead"], JSON.stringify(r.soft.map((f) => f.selector)));
  });
  await test("2.10 one mobile menu: burger + avatar both showing the nav is hard; an avatar with account items only passes", async (page) => {
    await load(page, "menus.html", { vars: { AVATAR: '<a href="/pricing">Pricing</a><a href="/about">About</a><a href="/blog">Blog</a><a href="/profile">Profile</a>' } });
    let r = await L.oneMobileMenu(page);
    assert.ok(r.applicable);
    assert.equal(r.hard.length, 1, JSON.stringify(r));
    await page.unrouteAll();
    await load(page, "menus.html", { vars: { AVATAR: '<a href="/profile">Profile</a><a href="/settings">Settings</a><a href="/logout">Sign out</a>' } });
    r = await L.oneMobileMenu(page);
    assert.deepEqual(r.hard, [], JSON.stringify(r));
  }, mobile);
  await test("money: parser and rules (decimals, float garbage, minor units, two styles, two separators, grouping, unit prices)", async () => {
    const t = (raw, o = {}) => ({ raw, fontSize: 32, where: raw, selector: raw, ...o });
    const ok = L.moneyIssues([t("$9.99"), t("$19.99"), t("$1,299.00"), t("$0.01", { unit: true, fontSize: 14 })]);
    assert.deepEqual(ok.hard, [], JSON.stringify(ok.hard));
    const what = (r) => r.hard.map((f) => f.what).join("\n");
    assert.match(what(L.moneyIssues([t("€7.4899999")])), /7 decimals.*floating-point/);
    assert.match(what(L.moneyIssues([t("¥120.50")])), /JPY is shown without decimals/);
    assert.match(what(L.moneyIssues([t("US$30"), t("$40")])), /USD is written 2 ways/);
    assert.match(what(L.moneyIssues([t("€30"), t("40 €")])), /EUR is written 2 ways/);
    assert.match(what(L.moneyIssues([t("€1.50"), t("€2,50")])), /two decimal separators/);
    assert.match(what(L.moneyIssues([t("$1500")])), /no thousands separator/);
    assert.match(what(L.moneyIssues([t("$1,500"), t("$2 500")])), /two thousands separators/);
    assert.equal(L.moneyIssues([t("0,022 USD", { unit: true, fontSize: 14 })]).hard.length, 0, "a 3-decimal unit price is soft");
    assert.equal(L.moneyIssues([t("0,022 USD", { unit: true, fontSize: 14 })]).soft.length, 1);
    assert.equal(L.moneyIssues([t("BHD 1.250")]).hard.length, 0, "BHD has three decimals");
    assert.equal(L.moneyIssues([t("R$ 10,50"), t("€20,000", { fontSize: 14 })]).hard.filter((f) => /decimals/.test(f.what)).length, 0, "another currency's comma decimals don't make €20,000 a 3-decimal amount (truelogos BRL)");
    assert.match(L.moneyIssues([t("€1,50"), t("€7,489")]).hard.map((f) => f.what).join(" "), /"€7,489" has 3 decimals/, "the same currency's comma decimals do");
    assert.deepEqual([L.moneyIssues([t("$0.0085", { unit: true, fontSize: 14 })]).hard.length, L.moneyIssues([t("$0.0085", { unit: true, fontSize: 14 })]).soft.length], [0, 1], "a sub-cent per-credit rate is soft (sprout)");
    assert.equal(L.moneyIssues([t("$0.0089999", { unit: true, fontSize: 14 })]).hard.length, 1, "float garbage in a unit price is hard");
    assert.deepEqual([L.moneyIssues([t("€0.89165", { rate: true })]).hard.length, L.moneyIssues([t("€0.89165", { rate: true })]).soft.length], [0, 1], "an exchange rate is soft (praxis)");
    assert.equal(L.moneyIssues([t("€8.93"), t("€17.86")], { baseNice: 1 }).soft.length, 1, "dirty conversion");
    assert.equal(L.moneyIssues([t("€8.99"), t("€17.90")], { baseNice: 1 }).soft.length, 0);
  });
  await test("money after a currency switch: every currency is checked and the original put back; clean formatting passes", async (page) => {
    const good = "{usd:v=>'$'+v.toFixed(2), eur:v=>'€'+(Math.max(1,Math.round(v))-0.01).toFixed(2), kzt:v=>(Math.round(v/100)*100).toLocaleString('ru-RU')+' ₸'}";
    const bad = "{usd:v=>(v<1?'US$':'$')+v.toFixed(2), eur:v=>'€'+v, kzt:v=>Math.round(v)+' ₸'}";
    await load(page, "money.html", { vars: { RATES: "{usd:1,eur:0.92,kzt:500}", FORMATS: good } });
    let r = await L.moneyFormat(page);
    assert.deepEqual(r.tested, ["USD", "EUR", "KZT"], JSON.stringify(r.tested));
    assert.deepEqual([...r.hard, ...r.soft], [], JSON.stringify([...r.hard, ...r.soft].map((f) => f.what)));
    assert.equal(await page.locator("#cur").inputValue(), "usd", "switched back");
    await page.unrouteAll();
    await load(page, "money.html", { vars: { RATES: "{usd:1,eur:0.92,kzt:500}", FORMATS: bad } });
    r = await L.moneyFormat(page);
    const w = r.hard.map((f) => f.what).join("\n") + "\nnot tested: " + r.notTested.join("; ") + "\ntested: " + r.tested.join(",") + " soft: " + r.soft.map((f) => f.what).join("; ");
    assert.match(w, /USD is written 2 ways/);
    assert.match(w, /in EUR: .* decimals/);
    assert.match(w, /in KZT: .* no thousands separator/);
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`layout: ${failed} failed`); process.exit(1); }
console.log("layout: ok");
