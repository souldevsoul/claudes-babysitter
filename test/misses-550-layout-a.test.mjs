// 5.5.0 — the miss loop, layout part A: rhythm, alignment, line breaks and widths (playwright/checks/rhythm.js). Each card of
// misses/praxis-2026-10-20.md, misses/parallel-2026-10-20.md and the Compass / Kindred rounds is pinned with the defect as it
// shipped ("bad", must fail), the fix ("good") and look-alikes that must stay quiet. On 5.4.1 rhythm.js does not exist and
// every bad page passes (guarded import). RUN: node test/misses-550-layout-a.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";

const opt = async (path) => { try { return await import(path); } catch { return {}; } };
const Rh = await opt("../playwright/checks/rhythm.js");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let site = { "/": "" };
const server = createServer((req, res) => { const u = new URL(req.url, "http://x"); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(site[u.pathname] ?? "<!doctype html><h1>Other</h1>"); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial;background:#fff;color:#111}${head}</style></head><body>${body}</body></html>`;
async function load(page, html) { site = { "/": html }; await page.goto(ORIGIN + "/", { waitUntil: "load" }); await page.waitForTimeout(80); }
const PHONE = { width: 360, height: 780 }, P390 = { width: 390, height: 800 }, DESK = { width: 1280, height: 800 }, WIDE = { width: 1440, height: 900 };
async function test(name, fn, viewport = DESK) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } finally { await ctx.close(); }
}
const need = (fn) => { assert.ok(fn, "the check does not exist in this version"); return fn; };
const expectHits = async (page, check, html, n = 1, re = null) => { await load(page, html); const r = await check(page); const list = Array.isArray(r) ? r : r.hard; assert.ok(list.length >= n, `expected a finding, got none`); if (re) assert.match(list.map((x) => x.what).join("\n"), re); return list; };
const expectQuiet = async (page, check, html, label = "") => { await load(page, html); const r = await check(page); const list = Array.isArray(r) ? r : r.hard; assert.deepEqual(list.map((x) => x.what), [], label); };

try {
  /* ═════ 2.7 marker / badge level ═════ */
  const dot = (top) => `<span aria-hidden="true" style="position:absolute;left:0;top:${top}px;width:14px;height:14px;border-radius:50%;background:#ff6a1f"></span>`;
  const step = (n, label, top) => `<li style="position:relative;list-style:none;margin-bottom:16px">${dot(top)}<div style="padding-left:32px"><div style="padding:28px;border:1px solid #ddd"><span style="font-size:24px">${n}</span> ${label}</div></div></li>`;
  await test("1r8w0p /become-partner: the timeline circles sit 30px above the step numbers; centred dots and connector dots pass", async (page) => {
    const ck = need(Rh.markerBadgeLevel);
    await expectHits(page, ck, doc(`<ol style="padding:0;width:600px">${step("01", "Apply", 6)}${step("02", "Profile", 6)}${step("03", "Quiz", 6)}${step("04", "Approved", 6)}</ol>`), 1, /markers sit \d+px above/);
    const ok = (n, l) => `<li style="list-style:none;margin-bottom:16px"><div style="display:flex;align-items:center;gap:8px">${dot(0).replace("position:absolute;left:0;top:0px;", "")}<span style="font-size:24px">${n}</span> ${l}</div></li>`;
    await expectQuiet(page, ck, doc(`<ol style="padding:0">${ok("01", "Apply")}${ok("02", "Profile")}${ok("03", "Quiz")}</ol>`), "dots on the number line");
    await expectQuiet(page, ck, doc(`<ol style="padding:0;width:600px">${step("01", "Apply", -7)}${step("02", "Profile", -7)}${step("03", "Quiz", -7)}</ol>`), "a dot on the card's top edge is a connector");
  });
  await test("m0oxf9 cookie settings: 'ALWAYS ON' is not level with 'Strictly necessary' (items-start); items-center and a two-line description pass", async (page) => {
    const ck = need(Rh.markerBadgeLevel);
    const row = (al, label = '<p style="margin:0;font-size:16px;line-height:28px">Strictly necessary</p>') => `<div style="display:flex;align-items:${al};gap:12px;width:500px">${label}<span style="font-size:12px;line-height:16px;text-transform:uppercase">Always on</span></div>`;
    await expectHits(page, ck, doc(row("flex-start")), 1, /"Always on" sits \d+px above/i);
    await expectQuiet(page, ck, doc(row("center")));
    await expectQuiet(page, ck, doc(row("flex-start", '<p style="margin:0;font-size:16px;line-height:28px;width:200px">Strictly necessary cookies keep you signed in and remember this choice</p>')), "a two-line description is not a one-line label");
  });

  /* ═════ 2.7 side nav vs content top ═════ */
  const shell = (pad) => `<header style="height:64px;border-bottom:1px solid #ddd">Site</header><div style="display:grid;grid-template-columns:12rem 1fr;padding-top:40px;width:1100px"><nav><p style="margin:0;font-size:11px">ACCOUNT</p><ul style="margin:0;padding:0"><li><a href="/d">Dashboard</a></li><li><a href="/t">Tasks</a></li><li><a href="/w">Wallet</a></li></ul></nav><section style="padding-top:${pad}px"><span style="font-size:11px">STATEMENT</span><h1 style="margin:0">Wallet</h1></section></div>`;
  await test("dbrs0h account pages: the page header starts 40px below the side nav label; one line passes; site-wide the content top differs between pages", async (page) => {
    const ck = need(Rh.shellTops);
    await expectHits(page, ck, doc(shell(40)), 1, /content starts \d+px below the side nav/);
    await load(page, doc(shell(0)));
    const s = await ck(page);
    assert.deepEqual(s.hard, []);
    assert.ok(s.shell);
    const across = Rh.shellTopsAcross([{ route: "/dashboard", shell: { ...s.shell } }, { route: "/dashboard/tasks", shell: { ...s.shell } }, { route: "/dashboard/wallet", shell: { ...s.shell, contentTop: s.shell.contentTop + 40 } }]);
    assert.equal(across.length, 1); assert.match(across[0].what, /on \/dashboard\/wallet/);
    await expectQuiet(page, ck, doc(`<header style="height:64px">Site</header><h1>Page header above the shell</h1><div style="display:grid;grid-template-columns:12rem 1fr"><nav><p style="margin:0">ACCOUNT</p><a href="/a">A</a> <a href="/b">B</a> <a href="/c">C</a></nav><section><span>STATEMENT</span></section></div>`), "a page header outside the columns");
  });

  /* ═════ 2.6 / 2.12 one slot, one line count ═════ */
  const tile = (l, n) => `<div class="tile" style="flex:1;min-width:120px;padding:12px;border:1px solid #ddd"><span class="lab" style="letter-spacing:.2em;text-transform:uppercase;font-size:14px">${l}</span><b style="display:block;font-size:24px">${n}</b></div>`;
  await test("ysspcg dashboard stat boxes: 'IN PROGRESS' wraps to two lines, 'WAITING' and 'COMPLETED' fit one; smaller labels and long descriptions pass", async (page) => {
    const ck = need(Rh.slotWraps);
    await expectHits(page, ck, doc(`<div style="display:flex;gap:12px;width:420px">${tile("Waiting", 3)}${tile("In progress", 2)}${tile("Completed", 9)}</div>`), 1, /"In progress" wraps to 2 lines .*\[2\.6\]/i);
    await expectQuiet(page, ck, doc(`<div style="display:flex;gap:12px;width:420px">${tile("Waiting", 3).replace(/font-size:14px/, "font-size:9px")}${tile("In progress", 2).replace(/font-size:14px/, "font-size:9px")}${tile("Completed", 9).replace(/font-size:14px/, "font-size:9px")}</div>`));
    const card = (t) => `<div class="c" style="flex:1;border:1px solid #ddd;padding:8px"><p>${t}</p></div>`;
    await expectQuiet(page, ck, doc(`<div style="display:flex;gap:12px;width:600px">${card("Brief, then a shortlist of specialists who fit.")}${card("Short.")}${card("A long description of the work that wraps over lines.")}</div>`), "long text is not compared");
  });
  const prow = (name, price) => `<div class="row" style="display:flex;justify-content:space-between;width:330px;padding:6px 0;border-bottom:1px solid #eee"><span>${name}</span><span class="price" style="max-width:140px;text-align:right">${price}</span></div>`;
  await test("tjm4fx AZ 360: the price block '1,200 kreditlər €107.00' wraps while the other rows' prices fit one line [2.12]; even rows pass", async (page) => {
    const ck = need(Rh.slotWraps);
    await expectHits(page, ck, doc('<div class="list">' + prow("Erik O.", "800 kreditlər €71") + prow("Aysel M.", "900 kreditlər €80") + prow("Nadia K.", "1,200 kreditlər €107.00") + prow("Omar T.", "700 kreditlər €62") + "</div>"), 1, /\[2\.12\]/);
    await expectQuiet(page, ck, doc(prow("Erik O.", "800 kr €71") + prow("Aysel M.", "900 kr €80") + prow("Nadia K.", "1,200 kr €107") + prow("Omar T.", "700 kr €62")));
  }, PHONE);

  /* ═════ 2.5 heading breaks ═════ */
  await test("c7p1wg mobile headings: a forced <br> plus wrapping leaves 'SLOWER' alone on a line; the <br> hidden on phones with text-wrap: balance passes; a poster heading that fits passes", async (page) => {
    const ck = need(Rh.headingBalance);
    const h = (inner, extra = "") => doc(`<h2 style="width:330px;font:900 32px/0.95 Arial;text-transform:uppercase;${extra}">${inner}</h2>`, ".lg{display:none}");
    await expectHits(page, ck, h("Reading a list is slower<br>than describing the job"), 1, /forced line break and still wraps/);
    await expectQuiet(page, ck, h('Reading a list is slower <br class="lg">than describing the job', "text-wrap:balance"));
    await expectQuiet(page, ck, h("Fast<br>hires"), "both segments fit their line");
  }, P390);

  /* ═════ 2.6 stacked buttons / dividers ═════ */
  await test("2jsnme stacked mobile buttons: 'Post a task' 130px over 'Browse specialists' 180px; stretched buttons and a button over a text link pass", async (page) => {
    const ck = need(Rh.stackedWidths);
    const group = (al, b2 = '<a href="/s" style="padding:12px 16px;border:1px solid #111">Browse specialists</a>') => doc(`<div style="display:flex;flex-direction:column;align-items:${al};gap:12px;padding:16px"><a href="/p" style="padding:12px 16px;background:#111;color:#fff">Post a task</a>${b2}</div>`);
    await expectHits(page, ck, group("flex-start"), 1, /stacked buttons of different widths/);
    await expectQuiet(page, ck, group("stretch"));
    await expectQuiet(page, ck, group("flex-start", '<a href="/c">Cancel</a>'), "a text link is not a button");
  }, P390);
  await test("qgevme 360: vertical dividers left on a stacked strip; divide-y when stacked and a side nav with a rule on every item pass", async (page) => {
    const ck = need(Rh.stackedDividers);
    await expectHits(page, ck, doc(`<dl style="display:flex;flex-direction:column;margin:16px"><div>Created</div><div style="border-left:1px solid #ddd;padding-left:8px">Specialist</div><div style="border-left:1px solid #ddd;padding-left:8px">Category</div></dl>`), 1, /vertical dividers/);
    await expectQuiet(page, ck, doc(`<dl style="display:flex;flex-direction:column;margin:16px"><div>Created</div><div style="border-top:1px solid #ddd">Specialist</div><div style="border-top:1px solid #ddd">Category</div></dl>`));
    await expectQuiet(page, ck, doc(`<ul style="border-left:1px solid #ddd;list-style:none"><li style="border-left:2px solid #111">A</li><li style="border-left:2px solid #111">B</li><li style="border-left:2px solid #111">C</li></ul>`), "every item ruled");
    await expectQuiet(page, ck, doc(`<div style="display:flex;width:340px"><div>Created</div><div style="border-left:1px solid #ddd">Specialist</div><div style="border-left:1px solid #ddd">Category</div></div>`), "a strip still in a row");
  }, PHONE);

  /* ═════ 6.5 heading alignment ═════ */
  await test("k6c1vm home: 'From brief to hired' centred while the other section headings are left-aligned; a centred heading in the CTA band and in the hero pass", async (page) => {
    const ck = need(Rh.headingAlignment);
    const sec = (t, al = "left") => `<section style="padding:40px 0"><div style="max-width:1100px;margin:auto"><h2 class="pk" style="text-align:${al};font-size:28px">${t}</h2><p>Text</p></div></section>`;
    const hero = `<section><h1 style="text-align:center">Hero</h1><h2 style="text-align:center;font-size:28px">Hero sub</h2></section>`;
    await expectHits(page, ck, doc(`<main>${hero}${sec("Specialists")}${sec("Pricing")}${sec("How it works")}${sec("From brief to hired", "center")}</main>`), 1, /"From brief to hired" is centred/);
    await expectQuiet(page, ck, doc(`<main>${hero}${sec("Specialists")}${sec("Pricing")}${sec("How it works")}${sec("From brief to hired")}</main>`));
    await expectQuiet(page, ck, doc(`<main>${hero}${sec("Specialists")}${sec("Pricing")}${sec("How it works")}<section style="background:#ff6a1f"><h2 style="text-align:center;font-size:28px">Bring the task</h2></section></main>`), "a centred heading in a colour band");
    await expectQuiet(page, ck, doc(`<main>${hero}${sec("Specialists")}${sec("Pricing")}${sec("How it works")}<section id="closing"><h2 class="pk" style="text-align:center;font-size:28px">Start with a bearing</h2><a href="/b" style="background:#111;color:#fff;padding:12px">Post a brief</a></section></main>`), "the closing call to action (Compass home, live)");
  });

  /* ═════ 2.17 one content width ═════ */
  await test("1xtxc4 the closing CTA band (1400px, rounded) is wider than the 1248px content above; inside the same container, or a full-bleed unrounded band, passes", async (page) => {
    const ck = need(Rh.contentWidths);
    const s = (inner) => `<section style="padding:40px 0"><div style="max-width:78rem;margin:auto">${inner}</div></section>`;
    const head = s("<h2>Specialists</h2><p>Text</p>") + s("<h2>Pricing</h2><p>Text</p>") + s("<h2>How</h2><p>Text</p>");
    await expectHits(page, ck, doc(`<main>${head}<section><div style="max-width:100rem;margin:auto;padding:0 20px"><div style="border-radius:24px;background:#ff6a1f;padding:56px 48px">BRING THE TASK</div></div></section></main>`), 1, /band is 1400px wide; the content of the other sections is 1248px/);
    await expectQuiet(page, ck, doc(`<main>${head}<section><div style="max-width:78rem;margin:auto"><div style="border-radius:24px;background:#ff6a1f;padding:56px 48px">BRING THE TASK</div></div></section></main>`));
    await expectQuiet(page, ck, doc(`<main>${head}<section style="background:#ff6a1f;padding:56px 0"><div style="max-width:78rem;margin:auto">BRING THE TASK</div></section></main>`), "full-bleed, not rounded");
  }, WIDE);

  /* ═════ 2.5 money ranges ═════ */
  await test("34ebhu / rqgkrl / 9rkp6z / ct4lge / 69q0rj a price range breaks after its dash ('€44.54–' | '€98', '$60–' | '$95'); nowrap, a dl From / To and hours pass", async (page) => {
    const ck = need(Rh.rangeSplit);
    await expectHits(page, ck, doc(`<div style="width:150px;font:14px Arial"><p>500–1,100 · €44.54–€98</p></div>`), 1, /range split across lines: "€44\.54–€98"/);
    await expectHits(page, ck, doc(`<ul><li style="width:40px">Audio AI <b>$60–$95</b></li></ul>`), 1, /"\$60–\$95"/);
    await expectQuiet(page, ck, doc(`<div style="display:flex;flex-wrap:wrap;width:200px;gap:8px"><span style="white-space:nowrap">10 services · $60–$95</span><span>600–950</span></div>`), "two cells are not one range");
    await expectQuiet(page, ck, doc(`<div style="width:150px;font:14px Arial"><p>500–1,100 · <span style="white-space:nowrap">€44.54–€98</span></p></div>`));
    await expectQuiet(page, ck, doc(`<dl style="width:120px"><dt>From</dt><dd>$60</dd><dt>To</dt><dd>$95</dd></dl>`));
    await expectQuiet(page, ck, doc(`<p style="width:160px">Open Monday–Friday, 9:00–18:00 in a long sentence that wraps somewhere else entirely</p>`), "not an amount");
  }, PHONE);

  /* ═════ 2.12 key–value rows ═════ */
  const kv = (l, v) => `<div class="row" style="display:flex;align-items:baseline;gap:6px"><span>${l}</span><i class="dots" style="flex:1;border-bottom:1px dotted #999"></i><b>${v}</b></div>`;
  await test("69q0rj / x2okne / k25bx0 / 25x6e8 a key–value row ('Rate band') without the leader the others have and its value off the right edge; four identical rows and a closing note pass", async (page) => {
    const ck = need(Rh.keyValueRows);
    const alt = `<div class="row-alt" style="display:flex;gap:6px"><span>Rate band (cr / hr)</span><b>125–180 · €11.10–€16</b></div>`;
    await expectHits(page, ck, doc(`<div style="width:330px;margin:16px">${kv("Specialists", 15)}${kv("Disciplines", 6)}${kv("Median reply", "4 h")}${alt}</div>`), 1, /row "Rate band \(cr \/ hr\)" breaks the pattern/);
    await expectQuiet(page, ck, doc(`<div style="width:330px;margin:16px">${kv("Specialists", 15)}${kv("Disciplines", 6)}${kv("Median reply", "4 h")}${kv("Rate band", "125–180")}</div>`));
    await expectQuiet(page, ck, doc(`<div style="width:330px;margin:16px">${kv("Specialists", 15)}${kv("Disciplines", 6)}${kv("Median reply", "4 h")}<p class="note">Rates are set by each specialist.</p></div>`), "a closing note");
    const step = (n, t) => `<li class="s" style="display:flex;align-items:center;gap:12px"><span>${n}</span><span>${t}</span></li>`;
    await expectQuiet(page, ck, doc(`<ol style="width:330px;list-style:none;padding:0">${step("01", "Choose a task")}${step("02", "Get a shortlist of specialists")}${step("03", "Pay")}</ol>`), "left-aligned values of different lengths (Kindred home, live)");
  }, PHONE);

  /* ═════ 2.21 squeezed text, 2.11 overlap ═════ */
  await test("akf9f4 / 2qp6hw / 3ypscy / 25x6e8 'Cancelled work': the description squeezed to one word per line beside its nowrap title, and a caption drawn over the heading; a column card, a narrow word list and a faint watermark pass", async (page) => {
    const sq = need(Rh.squeezedText), ov = need(Rh.textOverlap);
    const text = "Cancel before the specialist writes on the thread and the credits return to your wallet in full.";
    await expectHits(page, sq, doc(`<div style="display:flex;width:328px;gap:8px;border:1px solid #ddd;padding:12px"><h3 style="white-space:nowrap;margin:0">Cancelled work</h3><p style="width:min-content;margin:0">${text}</p></div>`), 1, /text squeezed to \d\.\d words per line/);
    await expectQuiet(page, sq, doc(`<div style="display:flex;flex-direction:column;width:328px;border:1px solid #ddd;padding:12px"><h3 style="margin:0">Cancelled work</h3><p style="margin:0">${text}</p></div>`));
    await expectQuiet(page, sq, doc(`<ul style="width:80px">${["Audio", "Video", "Text", "Code"].map((x) => `<li>${x}</li>`).join("")}</ul>`), "single words");
    await expectHits(page, ov, doc(`<div style="position:relative;width:328px"><h3 style="margin:0">Cancelled work</h3><span style="position:absolute;top:0;left:60px;font-size:11px">BEFORE THE FIRST MESSAGE</span></div>`), 1, /drawn over each other/);
    await expectQuiet(page, ov, doc(`<div style="position:relative;width:328px"><h3 style="margin:0">Cancelled work</h3><span style="position:absolute;top:0;left:60px;opacity:.1;font-size:40px">WATERMARK</span></div>`), "a faint watermark");
  }, PHONE);

  /* ═════ 2.22 two-column blocks ═════ */
  const two = (pad, extra = "") => `<section style="display:grid;grid-template-columns:1fr 1fr;width:1200px;margin:40px 0${extra}"><div><p style="font-size:12px;margin:0">INDEX</p><h1 style="margin:24px 0 0">Every specialist</h1><p>Lead paragraph of the block.</p></div><div style="padding-top:${pad}px"><table><tr><td>Specialists</td><td>15</td></tr></table></div></section>`;
  await test("1wq9va / 76glyk / uiv7nb / 2ghvum / tp3fvq / khokf3 the right column starts between the eyebrow and the heading; on the eyebrow line passes; blocks with different rules across the site fail; a centred illustration passes", async (page) => {
    const ck = need(Rh.twoColumnRule);
    await expectHits(page, ck, doc(`<main>${two(20)}</main>`), 1, /lines up with nothing/);
    await load(page, doc(`<main>${two(0)}</main>`));
    const good = await ck(page);
    assert.deepEqual(good.hard, []); assert.equal(good.rules.length, 1); assert.equal(good.rules[0].rule, 0);
    const across = Rh.twoColumnRulesAcross([{ route: "/", rules: [good.rules[0], { ...good.rules[0], text: "Measured scale" }] }, { route: "/pricing", rules: [{ ...good.rules[0], rule: 1, name: "the heading", text: "What a credit does" }] }]);
    assert.equal(across.length, 1); assert.match(across[0].what, /different rules/);
    await expectQuiet(page, ck, doc(`<main><section style="display:grid;grid-template-columns:1fr 1fr;width:1200px"><div><p style="margin:0">INDEX</p><h1>Hero</h1><p>Lead</p></div><div style="align-self:center"><p>Illustration caption</p></div></section></main>`), "centred on purpose");
 
  });
  await test("2.22 box to box, ink to ink: two card columns with top-aligned boxes pass; a card 60px off a text column still fails", async (page) => {
    const ck = need(Rh.twoColumnRule);
    const card = (t, extra = "") => `<div style="background:#fff;border:1px solid #ddd;box-shadow:0 4px 12px rgba(0,0,0,.08);padding:32px${extra}"><p style="font-size:12px;margin:0">${t}</p><h3 style="margin:16px 0 0">Panel heading</h3><p style="margin:8px 0 0">A line of the panel.</p></div>`;
    const cards = `<section style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1200px;margin:40px 0"><div style="display:flex;flex-direction:column;gap:24px">${card("FIRST")}${card("SECOND")}</div><div>${card("RIGHT")}</div></section>`;
    await load(page, doc(`<main>${cards}</main>`));
    const ok = await ck(page);
    assert.deepEqual(ok.hard, [], "two card columns whose boxes start on one line");
    assert.equal(ok.rules.length, 1); assert.equal(ok.rules[0].rule, 0);
    await expectHits(page, ck, doc(`<main><section style="display:grid;grid-template-columns:1fr 1fr;width:1200px;margin:40px 0"><div><p style="font-size:12px;margin:0">INDEX</p><h1 style="margin:24px 0 0">Every specialist</h1><p style="margin:24px 0 0">Lead paragraph of the block.</p></div><div style="padding-top:150px">${card("RIGHT")}</div></section></main>`), 1, /lines up with nothing/);
 
    // the left column starts with a grid of stat cards (an unpainted wrapper of 3 painted cards), then a panel
    const stat = (n, label) => `<div style="background:#fff;border:1px solid #ddd;padding:32px"><p style="font-size:28px;margin:0">${n}</p><p style="font-size:12px;margin:8px 0 0">${label}</p></div>`;
    const statsBlock = (rightPad) => `<main><section style="display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1200px;margin:40px 0"><div class="space-y-2" style="display:flex;flex-direction:column;gap:8px"><div class="grid grid-cols-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${stat(30, "Languages")}${stat(12, "Voices")}${stat(4, "Formats")}</div>${card("PANEL")}</div><div style="padding-top:${rightPad}px">${card("RIGHT")}</div></section></main>`;
    await load(page, doc(statsBlock(0)));
    const grid = await ck(page);
    assert.deepEqual(grid.hard, [], "the right card starts on the first stat card's box");
    assert.equal(grid.rules.length, 1); assert.equal(grid.rules[0].rule, 0);
  });

  /* ═════ 2.23 rhythm ═════ */
  await test("xfm2up footer Legal column: an empty line before 'AML / KYC Policy'; even links, two lists and a separator pass", async (page) => {
    const ck = need(Rh.evenRhythm);
    const ul = (m = 0) => `<ul style="display:flex;flex-direction:column;gap:8px;list-style:none;padding:0"><li><a href="/t">Terms</a></li><li><a href="/r">Refund</a></li><li><a href="/c">Cancellation</a></li><li style="margin-top:${m}px"><a href="/a">AML / KYC</a></li><li><a href="/m">Manage cookies</a></li></ul>`;
    await expectHits(page, ck, doc(ul(24)), 1, /uneven gap in the list: 32px before "AML \/ KYC"/);
    await expectQuiet(page, ck, doc(ul(0)));
    await expectQuiet(page, ck, doc(`<div><ul style="margin:0 0 24px"><li>A</li><li>B</li></ul><ul style="margin:0"><li>C</li><li>D</li></ul></div>`), "two lists");
    await expectQuiet(page, ck, doc(`<p style="width:600px">The conditions in full are in the <a href="/r">Refund Policy</a>, the <a href="/t">Terms</a> and the <a href="/c">Cancellation Policy</a>.</p>`), "links in a sentence (Compass /pricing, live)");
  });
  await test("iiy7tk Add Credits: the packages of the row are spaced unevenly; one gap passes", async (page) => {
    const ck = need(Rh.evenRhythm);
    const pack = (m, t) => `<div class="pack" style="margin-left:${m}px;width:90px">${t}</div>`;
    await expectHits(page, ck, doc(`<div role="dialog" style="width:480px;padding:16px;border:1px solid #ddd"><div style="display:flex">${pack(27, "100 · $10")}${pack(12, "500 · $48.50")}${pack(30, "1,000 · $95")}${pack(14, "2,500 · $212.50")}</div></div>`), 1, /spaced unevenly/);
    await expectQuiet(page, ck, doc(`<div role="dialog" style="width:480px;padding:16px;border:1px solid #ddd"><div style="display:flex;gap:16px">${pack(0, "100")}${pack(0, "500")}${pack(0, "1,000")}${pack(0, "2,500")}</div></div>`));
  });

  /* ═════ 2.7 fields share a top; caption vs rule ═════ */
  await test("spixep /register: 'Phone Number' sits 45px lower than 'Country' because its hint is above the field; the hint below passes; stacked fields and a checkbox pass; zk611j: the caption on the list's rule is soft", async (page) => {
    const ck = need(Rh.fieldTops);
    const form = (hintFirst) => doc(`<form style="width:600px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><label>Country<select style="display:block;width:100%"><option>UK</option></select></label><label>Phone Number${hintFirst ? '<small style="display:block;width:200px">Up to 15 digits, with or without the country code.</small>' : ""}<input name="phone" style="display:block;width:100%">${hintFirst ? "" : '<small style="display:block">Up to 15 digits, with or without the country code.</small>'}</label></div></form>`);
    await expectHits(page, ck, form(true), 1, /sits \d+px lower than/);
    await expectQuiet(page, ck, form(false));
    await expectQuiet(page, ck, doc(`<form><div style="display:grid;gap:8px"><input name="a" style="width:300px"><input name="b" style="width:200px"></div><div style="display:flex;gap:8px;align-items:flex-end"><label><input type="checkbox"> Remember</label><input name="c"></div></form>`), "stacked fields, a checkbox");
    await load(page, doc(`<div style="padding:16px"><p style="margin:0">36 services listed</p><ul style="padding:0;margin:0;list-style:none"><li style="border-left:2px solid #111;padding-left:16px">Video Synthesis</li><li style="border-left:2px solid #111;padding-left:16px">Spatial AI</li></ul></div>`));
    const s = await ck(page);
    assert.deepEqual(s.hard, []); assert.equal(s.soft.length, 1); assert.match(s.soft[0].what, /lines up with the list's left rule/);
  });

  /* ═════ 2.5 brand on one line ═════ */
  await test("spdonv /admin at 1440: the KINDRED wordmark in the 264px rail breaks onto two lines; nowrap, a tagline in its own element and a footer © sentence pass", async (page) => {
    const ck = need(Rh.brandOneLine);
    const rail = (span) => doc(`<aside style="width:264px;display:flex;gap:8px"><a href="/" style="display:flex;min-width:0;gap:8px"><svg width="40" height="40"></svg>${span}</a><span>MARKETPLACE</span></aside>`);
    await expectHits(page, ck, rail('<span style="font-size:28px;min-width:0;width:58px;overflow-wrap:anywhere">Kindred</span>'), 1, /brand name "Kindred" wraps/);
    await expectQuiet(page, ck, rail('<span style="font-size:28px;white-space:nowrap;flex-shrink:0">Kindred</span>'));
    await expectQuiet(page, ck, doc(`<footer style="width:120px"><a href="/">Kindred</a><p>© 2026 Kindred Ltd, all rights reserved here</p></footer>`), "the © sentence");
  }, WIDE);

  /* ═════ rhythmChecks: a plain page is quiet ═════ */
  await test("rhythmChecks on an ordinary page (header, nav, hero, cards, footer) reports nothing, at 390 and 1280", async (page) => {
    const ck = need(Rh.rhythmChecks);
    const html = doc(`<header style="display:flex;justify-content:space-between;padding:16px"><a href="/" style="font-weight:700">Acme</a><nav><a href="/p">Pricing</a> <a href="/a">About</a></nav></header><main><section style="padding:40px 16px"><h1>Hire a specialist</h1><p>Describe the task, get a shortlist, pay in credits.</p><a href="/s" style="display:inline-block;padding:12px;background:#111;color:#fff">Start</a></section><section style="padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">${["Design", "Code", "Copy"].map((t) => `<div class="card" style="border:1px solid #ddd;padding:16px"><h3>${t}</h3><p>From €40 per hour, paid from credits.</p></div>`).join("")}</section></main><footer style="padding:16px"><ul style="list-style:none;padding:0"><li><a href="/t">Terms</a></li><li><a href="/pr">Privacy</a></li><li><a href="/c">Cookies</a></li></ul></footer>`);
    for (const vp of [P390, DESK]) { await page.setViewportSize(vp); await load(page, html); const r = await ck(page); assert.deepEqual(r.hard.map((x) => x.what), [], `at ${vp.width}`); }
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error(`misses-550-layout-a: ${failed} failed`); process.exit(1); }
console.log("misses-550-layout-a: all passed");
