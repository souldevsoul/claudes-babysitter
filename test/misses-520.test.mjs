// 5.2.0 — the miss loop (babysitter misses, misses/*.md): every card a person filed on Praxis or Parallel that a
// check should have caught is pinned here by a fixture page. Each "bad" page reproduces the defect as it shipped
// (the product's own fix commit says what it was); each "good" page is the fix, or a look-alike that must stay quiet.
//
// The detectors are what a route really gets in a run — the union of every check that runs there — so this file
// also runs against an older checkout (`git worktree add ../bs-510 v5.1.0`, copy this file into its test/) and shows
// which bad pages the older version passed. A check added in 5.2.0 is loaded with a guarded import and is simply
// absent there. RUN: node test/misses-520.test.mjs   (ONLY=regex for one; SHOW=1 prints what each detector found)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import * as L from "../playwright/checks/layout.js";
import * as A from "../playwright/acceptance.js";
import * as F from "../playwright/checks/forms.js";
import * as run from "../playwright/checks/run.js";

const opt = async (path) => { try { return await import(path); } catch { return {}; } };
const fit = await opt("../playwright/checks/fit.js");
const looks = await opt("../playwright/checks/looks.js");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const results = [];
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const show = (x) => JSON.stringify(x, null, 1);

let site = { "/": "" };
const posts = [];
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method !== "GET") { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { posts.push({ path: u.pathname, body: b }); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); }); return; }
  const body = site[u.pathname] ?? "<!doctype html><title>other</title><h1>Other</h1>";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, { lang = "en", head = "", script = "" } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial}${head}</style></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;
async function load(page, html, path = "/") {
  site = { ...site, [path]: html };
  await page.goto(ORIGIN + path, { waitUntil: "load" });
  await page.waitForTimeout(150);
}
const PHONE = { width: 360, height: 800 };
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page, ctx); console.log(`  ✓ ${name}`); results.push([name, "pass"]); } catch (e) { failed++; results.push([name, "FAIL"]); console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } finally { await ctx.close(); }
}
const hits = (list, id) => list.filter((f) => `${f.selector || ""} ${f.where || ""}`.includes(id));

/* ───────── the detectors: everything a route gets, in this version ───────── */
// the page-level layout checks (babysitter.spec 2.1 / 2.10, acceptance N6, layout 2.5 at phone widths, 2.14 when present)
async function pageChecks(page) {
  const list = [...(await c.horizontalOverflow(page)), ...(await c.escapesBox(page)), ...(await A.clippedControls(page))];
  if ((page.viewportSize()?.width ?? 1280) < 768) list.push(...(await L.textBreaks(page)).hard);
  if (fit.textCutOff) list.push(...(await fit.textCutOff(page)).hard);
  if (process.env.SHOW) console.log(show(list));
  return list;
}
// what the states run measures in every state (run.measure), plus the 1.2 popup sweep on the page
async function stateMeasure(page) {
  const list = [...(await run.measure(page))];
  if (process.env.SHOW) console.log(show(list));
  return list;
}

try {
  /* ═══════════ layout at 360 px: text shown in full (2.14), words broken by letters (2.5) ═══════════ */
  const BTN = "display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 16px;border:1px solid #333;border-radius:8px;text-transform:uppercase;letter-spacing:.12em;font-size:13px;color:#111;text-decoration:none";
  await test("qyu8pb hero button: a 3-line az label in a fixed 44px button spills out of it (Praxis /, 360 az/kk); the button that grows passes", async (page) => {
    const card = (h) => `<div style="margin:24px 48px;padding:16px;border:1px solid #ccc;border-radius:12px"><p>Gunel Z. · Brand designer</p><a id="hero-cta" href="/specialists" style="${BTN};width:100%;${h}"><span style="min-width:0;white-space:normal;text-align:center">Bütün mütəxəssislərə baxın və seçin</span><span>→</span></a></div>`;
    await load(page, doc(card("height:44px")));
    assert.ok(hits(await pageChecks(page), "hero-cta").length, "the spilling label is reported");
    await load(page, doc(card("min-height:44px;padding-top:6px;padding-bottom:6px")));
    assert.deepEqual(hits(await pageChecks(page), "hero-cta"), []);
  }, PHONE);
  await test("l11sjw close band: a nowrap shrink-0 az button runs off the screen; body overflow-x:hidden made 2.1 call it bleed (Praxis /become-partner 360)", async (page) => {
    const band = (b) => `<section style="background:#111;color:#fff;padding:32px 24px"><h2>Müraciətə hazırsınız?</h2><div style="display:flex;flex-wrap:wrap;gap:12px"><a id="apply" href="/apply" style="${BTN};background:#f60;border-color:#f60;height:44px;white-space:nowrap;flex-shrink:0;${b}">Mütəxəssis kimi müraciət edin indi →</a><a href="/terms" style="${BTN};color:#fff;border-color:#fff;height:44px">Şərtlər</a></div></section>`;
    await load(page, doc(band(""), { head: "html,body{overflow-x:hidden}" }));
    assert.ok(hits(await pageChecks(page), "apply").length, "cut by the screen edge");
    await load(page, doc(band("max-width:100%;white-space:normal;height:auto;min-height:44px"), { head: "html,body{overflow-x:hidden}" }));
    assert.deepEqual(hits(await pageChecks(page), "apply"), []);
  }, PHONE);
  await test("f4psv7 task header: badge + '1,200 kreditlər' + '€107.04' in one nowrap row, the euro figure cut by the page root's overflow-x:hidden (Praxis /dashboard/tasks/<id> 360)", async (page) => {
    const head = (row) => `<main style="padding:0 16px;min-height:100vh;overflow-x:hidden"><p style="text-transform:uppercase">Brand design</p><h1 style="font-size:22px">Logo for a bakery</h1><div style="display:flex;align-items:baseline;gap:12px;${row}"><span style="padding:2px 8px;border-radius:999px;background:#eef;white-space:nowrap">Mütəxəssis gözlənilir</span><span style="font-size:20px;font-weight:700;white-space:nowrap">1,200 kreditlər</span><span id="eur" style="white-space:nowrap">€107.04</span></div></main>`;
    await load(page, doc(head("flex-shrink:0;white-space:nowrap")));
    assert.ok(hits(await pageChecks(page), "eur").length, "the euro figure is cut");
    await load(page, doc(head("flex-wrap:wrap;max-width:100%")));
    assert.deepEqual(hits(await pageChecks(page), "eur"), []);
  }, PHONE);
  await test("mkaojk status timeline: four nowrap kk labels in one row spill past the card's right edge (Praxis task page 360)", async (page) => {
    const tl = (row) => `<div style="min-height:100vh;padding:32px 0;overflow-x:hidden"><div style="margin:16px;padding:16px;border:1px solid #ccc;border-radius:12px"><h3>Уақыт желісі</h3><div style="display:flex;${row}">${["Жасалды", "Басталды", "Тапсырылды", "Аяқталды"].map((s, i) => `<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;padding:0 6px"><span style="width:24px;height:24px;border-radius:50%;background:#333"></span><span ${i === 3 ? 'id="last-step"' : ""} style="font:12px monospace;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap">${s}</span></div>`).join("")}</div></div></div>`;
    // the page root of the task page was "min-h-screen py-8 overflow-x-hidden": 2.1 took it for an intended clip
    await load(page, doc(tl("align-items:center")));
    assert.ok(hits(await pageChecks(page), "last-step").length, "the 4th label spills out of the card");
    await load(page, doc(tl("flex-direction:column;align-items:flex-start;gap:8px")));
    assert.deepEqual(hits(await pageChecks(page), "last-step"), []);
  }, PHONE);
  await test("lnvj98 language list: 'Azərbaycanca' truncated to 'Azərbaycan…' in an open listbox pinned to the trigger's width (Praxis mobile menu 360)", async (page) => {
    const list = (span) => `<div style="padding:16px"><button aria-haspopup="listbox" aria-expanded="true" style="width:96px">EN</button><div role="listbox" style="position:absolute;top:60px;left:16px;width:96px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:4px">${["Azərbaycanca", "English", "Қазақша"].map((x, i) => `<div role="option" ${i ? "" : 'id="opt-az"'} style="display:flex;padding:6px 8px"><span style="min-width:0;${span}">${x}</span></div>`).join("")}</div></div>`;
    await load(page, doc(list("overflow:hidden;text-overflow:ellipsis;white-space:nowrap")));
    assert.ok(hits(await stateMeasure(page), "opt-az").length || hits(await pageChecks(page), "opt-az").length, "the truncated option is reported");
    await load(page, doc(list("overflow-wrap:break-word")).replace("width:96px;background", "min-width:96px;width:max-content;background"));
    assert.deepEqual([...hits(await stateMeasure(page), "opt-az"), ...hits(await pageChecks(page), "opt-az")], []);
  }, PHONE);
  await test("y6dul2 /contact topic list: the open listbox grows to 450px at 360 and its rows are cut; the page clips overflow-x, so 2.1 said bleed (Praxis, en/az/kk)", async (page) => {
    const lb = (w) => `<form style="padding:16px"><label>Topic</label><button type="button" role="combobox" aria-expanded="true" aria-controls="topics" style="width:100%">Pick a tag</button></form><div data-radix-popper-content-wrapper style="position:fixed;left:8px;top:120px"><div role="listbox" id="topics" style="${w};background:#fff;border:1px solid #ccc;border-radius:8px;overflow-x:hidden">${["Account · Signing in, your password or changing your email address", "Payments · A top-up, a refund or a receipt you need"].map((x) => `<div role="option" style="padding:6px 8px;white-space:nowrap">${x}</div>`).join("")}</div></div>`;
    await load(page, doc(lb("width:450px"), { head: "body{overflow-x:hidden}" }));
    assert.ok(hits(await stateMeasure(page), "topics").length, "the open list goes past the screen in the states run");
    await load(page, doc(lb("max-width:344px").replace(/white-space:nowrap/g, "white-space:normal"), { head: "body{overflow-x:hidden}" }));
    assert.deepEqual(hits(await stateMeasure(page), "topics"), []);
  }, PHONE);
  await test("lzdd4c pagination caption 'Səhifə 1 / 2' squeezed between Əvvəlki / Növbəti breaks letter by letter (Praxis /specialists 360 az)", async (page) => {
    const nav = (cap) => `<main style="padding:16px"><nav aria-label="pagination" style="display:flex;align-items:center;gap:8px"><button style="flex:1 0 auto;white-space:nowrap;height:40px;padding:0 30px">Əvvəlki səhifə</button><span id="pg" style="font:12px monospace;text-transform:uppercase;letter-spacing:.12em;${cap}">Səhifə 1 / 2</span><button style="flex:1 0 auto;white-space:nowrap;height:40px;padding:0 30px">Növbəti səhifə</button></nav></main>`;
    await load(page, doc(nav(""), { head: "body{overflow-wrap:anywhere}", lang: "az" }));
    assert.ok(hits(await pageChecks(page), "pg").length, "a word broken by letters in a plain caption");
    await load(page, doc(nav("white-space:nowrap;flex-basis:100%;order:-1;text-align:center").replace("display:flex;", "display:flex;flex-wrap:wrap;"), { head: "body{overflow-wrap:anywhere}", lang: "az" }));
    assert.deepEqual(hits(await pageChecks(page), "pg"), []);
  }, PHONE);
  await test("inryza 'ТАПСЫРМА' row label beside a long value breaks 'ТАПСЫРМ|А' (Praxis /request-service Confirm hire 360 kk)", async (page) => {
    const row = (lab) => `<div style="margin:16px;padding:16px;border:1px solid #ccc;border-radius:12px;width:260px"><div style="display:flex;justify-content:space-between;gap:16px"><span id="lab" style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;overflow-wrap:break-word;${lab}">Тапсырма</span><span style="font-weight:600">LLM копирайтинг жұмыс ағыны</span></div></div>`;
    await load(page, doc(row("min-width:0"), { lang: "kk" }));
    assert.ok(hits(await pageChecks(page), "lab").length, "the label is broken mid-word");
    await load(page, doc(row("flex-shrink:0;max-width:50%"), { lang: "kk" }));
    assert.deepEqual(hits(await pageChecks(page), "lab"), []);
  }, PHONE);
  await test("2.14 / 2.5 stay quiet on look-alikes: carousel track, marquee, line clamp, a bordered scroll box (Praxis /onboarding agreement), a clamped card button (Parallel task cards), long title ellipsis, closed accordion, scrolling table, off-canvas drawer, sr-only, faint watermark, a long URL in a paragraph", async (page) => {
    await load(page, doc(`<main style="padding:16px">
      <div id="carousel" style="overflow:hidden;width:300px"><div style="display:flex;width:900px">${[1, 2, 3].map((i) => `<div style="flex:0 0 300px;padding:8px;border:1px solid #ccc">Slide ${i} with a caption</div>`).join("")}</div></div>
      <div style="overflow:hidden;width:320px"><div id="marquee" style="display:flex;gap:40px;white-space:nowrap;animation:mq 8s linear infinite">${"<span>Brand · Logo · Deck · Site · </span>".repeat(4)}</div></div>
      <p id="clamp" style="width:300px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">A long description that is clamped to two lines on purpose because the card shows only a preview of it and the rest opens on the task page itself.</p>
      <div style="width:300px;border:1px solid #ccc;border-radius:8px;padding:8px"><h3 id="title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">A presentation and pitch deck design for a seed round investor meeting</h3></div>
      <div id="acc" style="height:0;overflow:hidden"><p>Hidden answer of a closed accordion item</p></div>
      <div style="overflow-x:auto;width:320px"><table><tr>${"<td style='white-space:nowrap;padding:4px 12px'>A wide table cell</td>".repeat(5)}</tr></table></div>
      <aside id="drawer" style="position:fixed;top:0;right:0;width:300px;height:100%;transform:translateX(100%);background:#fff;border:1px solid #ccc"><p>Drawer content waiting off-canvas</p></aside>
      <span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Screen reader text</span>
      <div style="position:relative;overflow:hidden;height:120px"><span id="wm" style="position:absolute;left:-40px;font-size:120px;color:rgba(0,0,0,.06);white-space:nowrap">PRAXIS STUDIO</span></div>
      <p style="width:200px;overflow-wrap:anywhere">Write to https://praxis-soultosoul.vercel.app/contact?topic=account-signing-in for help.</p>
      <label style="display:block;width:200px">Email address</label>
      <div style="height:200px;overflow-y:auto;border:1px solid #ccc;border-radius:8px;padding:8px">${"<p>1.3 You work as an independent contractor and keep your own tools and hours.</p>".repeat(8)}</div>
      <button style="display:block;width:300px;height:120px;border:1px solid #ccc;border-radius:12px;text-align:left;overflow:hidden"><p style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0">${"I am looking to automate a workflow between our CRM and the support inbox. ".repeat(6)}</p></button>
    </main>`, { head: "@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}" }));
    await page.waitForTimeout(300);
    const list = await pageChecks(page);
    const noisy = list.filter((f) => /2\.14|2\.5/.test(f.what));
    assert.deepEqual(noisy, [], "no false alarm on the look-alikes");
  }, PHONE);

  /* ═══════════ panels that do not scroll: the Task Details drawer, the signed-in phone menu ═══════════ */
  await test("xwhajo Task Details drawer: its scroll area grows past the panel (no min-h-0), the panel clips it, nothing scrolls (Parallel /dashboard/tasks)", async (page) => {
    const drawer = (area) => `<main><h1>Tasks</h1><button id="row">Logo for a bakery</button></main><div role="dialog" aria-label="Task Details" style="position:fixed;top:0;right:0;width:340px;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#fff;border-left:1px solid #ccc"><header style="padding:16px;border-bottom:1px solid #eee"><h2>Task Details</h2></header><div id="area" style="${area}"><div data-radix-scroll-area-viewport style="overflow-y:auto;${area ? "height:100%" : ""}"><div style="padding:16px">${Array.from({ length: 14 }, (_, i) => `<p style="margin:0 0 12px">Brief line ${i + 1}: what the specialist should deliver and by when, with the files attached.</p>`).join("")}<button id="cancel-brief" style="height:40px">Cancel brief</button></div></div></div></div>`;
    // the ScrollArea root clips (overflow hidden) while its viewport grows to its content: nothing scrolls
    await load(page, doc(drawer("").replace('<div id="area" style="">', '<div id="area" style="overflow:hidden">')));
    assert.ok(hits(await stateMeasure(page), "dialog").length || hits(await stateMeasure(page), "area").length, "the drawer's content is cut off without a scroll");
    await load(page, doc(drawer("flex:1;min-height:0;overflow:hidden")));
    assert.deepEqual([...hits(await stateMeasure(page), "dialog"), ...hits(await stateMeasure(page), "area")], []);
  }, { width: 1280, height: 600 });
  await test("qpivvx signed-in phone menu: account links and Sign out run below the screen, the sheet does not scroll (Parallel 360)", async (page) => {
    const menu = (sheet) => `<header style="position:sticky;top:0;height:56px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;background:#fff;border-bottom:1px solid #eee"><a href="/">Parallel</a><nav class="desk" style="display:none"><a href="/a">A</a></nav><button id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="sheet" style="width:44px;height:44px">≡</button></header><main><h1>Dashboard</h1><p style="height:1400px">Body</p></main><div id="sheet" role="dialog" aria-label="Menu" hidden style="position:fixed;inset:0;background:#fff;padding:16px;${sheet}"><nav>${["Dashboard", "Tasks", "Wallet", "Settings", "Specialists", "How it works", "Pricing", "About", "Contact", "Become a specialist", "Help", "Profile"].map((x) => `<a href="/${x.toLowerCase().replace(/ /g, "-")}" style="display:flex;align-items:center;min-height:52px;border-bottom:1px solid #eee">${x}</a>`).join("")}<button id="signout" style="display:block;width:100%;min-height:52px">Sign out</button></nav></div>`;
    const js = `document.getElementById("burger").onclick=()=>{const s=document.getElementById("sheet");s.hidden=!s.hidden;document.body.style.overflow=s.hidden?"":"hidden";document.getElementById("burger").setAttribute("aria-expanded",String(!s.hidden));};`;
    await load(page, doc(menu("overflow:hidden"), { script: js }));
    const m = await c.mobileMenu(page);
    if (process.env.SHOW) console.log("mobileMenu", show(m));
    await page.evaluate(() => { if (document.getElementById("sheet").hidden) document.getElementById("burger").click(); }); await page.waitForTimeout(150);
    const st = await stateMeasure(page);
    assert.ok([...m.hard, ...st].some((f) => /signout|Sign out|Profile|Help/.test(`${f.where} ${f.what}`)), "the unreachable items are reported");
    await load(page, doc(menu("overflow-y:auto"), { script: js }));
    const m2 = await c.mobileMenu(page);
    await page.evaluate(() => { if (document.getElementById("sheet").hidden) document.getElementById("burger").click(); }); await page.waitForTimeout(150);
    const st2 = await stateMeasure(page);
    assert.deepEqual([...m2.hard, ...st2].filter((f) => /signout|Sign out|Profile|Help|cannot be reached|2\.14/.test(`${f.where} ${f.what}`)), []);
  }, { width: 360, height: 640 });

  /* ═══════════ navigation and state: an in-place step / page opens at its top (3.8 / 4.4) ═══════════ */
  const states = async (page, url) => {
    const r = await run.stateChecks(page, { reload: async () => { await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(150); }, maxOpeners: 6, deadline: Date.now() + 90_000 });
    if (process.env.SHOW) console.log(show(r));
    return r;
  };
  const scrollFinding = (r) => r.findings.filter((f) => /opens scrolled down|above the screen|above the visible|under the sticky header|stays where they clicked/.test(f.what));
  const STEPS = (n) => Array.from({ length: n }, (_, i) => `<p style="margin:0 0 14px">Detail ${i + 1}: what the brief needs to say about the deliverable, its format and the deadline.</p>`).join("");
  await test("nxkw5x brief wizard in a dialog that scrolls itself: Next / Back swap the step but keep the dialog's scroll; steps are titled by a <p>, Next waits for an option (Praxis /request-service)", async (page) => {
    const html = (fix) => doc(`<main style="padding:16px"><h1>Request a service</h1><button id="open" aria-haspopup="dialog">Describe your task</button></main>
      <div id="dlg" role="dialog" aria-modal="true" aria-label="Brief" hidden style="position:fixed;left:16px;right:16px;top:5vh;max-height:90vh;overflow-y:auto;background:#fff;border:1px solid #ccc;border-radius:12px"><div style="padding:16px;border-bottom:1px solid #eee"><h2>Brief</h2></div><div id="pane" style="padding:16px"></div></div>`, { script: `
      let step = 0; const pane = document.getElementById("pane"), dlg = document.getElementById("dlg");
      const render = () => { pane.innerHTML = '<p class="step" style="font-weight:700;text-transform:uppercase">Step ' + (step + 1) + ' of 4 · ' + ['Goal','Audience','Format','Deadline'][step] + '</p>' + ${JSON.stringify(STEPS(16))} + '<div class="opts">' + ['Option A','Option B','Option C'].map((o) => '<button type="button" class="opt" style="margin:4px">' + o + '</button>').join('') + '</div><div style="display:flex;justify-content:space-between;margin-top:16px"><button type="button" id="back">Back</button><button type="button" id="next" disabled>Next</button></div>';
        pane.querySelectorAll('.opt').forEach((b) => b.onclick = () => { b.setAttribute('aria-pressed','true'); document.getElementById('next').disabled = false; });
        document.getElementById('next').onclick = () => { if (step < 3) { step++; render(); ${fix ? "dlg.scrollTo({ top: 0 });" : ""} } };
        document.getElementById('back').onclick = () => { if (step > 0) { step--; render(); ${fix ? "dlg.scrollTo({ top: 0 });" : ""} } }; };
      render(); document.getElementById("open").onclick = () => { dlg.hidden = false; };` });
    await load(page, html(false), "/request-service");
    assert.ok(scrollFinding(await states(page, ORIGIN + "/request-service")).length, "the next step opens at its buttons");
    await load(page, html(true), "/request-service");
    assert.deepEqual(scrollFinding(await states(page, ORIGIN + "/request-service")), []);
  }, { width: 390, height: 700 });
  await test("9wjzll / k8wxr2 onboarding form: the first button is Back, Continue swaps the step in place and the window stays scrolled down (Parallel /onboarding, Praxis profile → quiz)", async (page) => {
    const html = (fix) => doc(`<header style="position:sticky;top:0;height:56px;background:#fff;border-bottom:1px solid #eee">Parallel</header><main style="padding:16px"><h1>Become a specialist</h1><form id="ob" style="border:1px solid #ccc;border-radius:12px;padding:16px"></form></main>`, { script: `
      let step = 1; const f = document.getElementById("ob");
      const render = () => { f.innerHTML = '<h2>Step ' + step + ' of 4 · ' + ['Profile','Skills','Rate','Review'][step - 1] + '</h2><label>Display name <input name="displayName" required></label>' + ${JSON.stringify(STEPS(18))} + '<div style="display:flex;flex-direction:column-reverse;gap:12px"><button id="b">Back</button><button type="submit">Continue</button></div>';
        document.getElementById('b').onclick = (e) => { e.preventDefault(); if (step > 1) { step--; render(); ${fix ? "scrollTo(0, 0);" : ""} } }; };
      f.onsubmit = (e) => { e.preventDefault(); if (step < 4) { step++; render(); ${fix ? "scrollTo(0, 0);" : ""} } };
      render();` });
    await load(page, html(false), "/onboarding");
    assert.ok(scrollFinding(await states(page, ORIGIN + "/onboarding")).length, "Continue / Back leave the reader at the bottom");
    await load(page, html(true), "/onboarding");
    assert.deepEqual(scrollFinding(await states(page, ORIGIN + "/onboarding")), []);
  }, { width: 390, height: 700 });
  await test("ddp8rw task board pagination: page 2 replaces the list element and the reader stays at the pager (Praxis /dashboard/tasks; React re-render made 5.1.0 give up)", async (page) => {
    const html = (fix) => doc(`<main style="padding:16px"><h1>Task board</h1><div id="board"><div id="list" style="border:1px solid #ccc;border-radius:12px"></div><nav aria-label="pagination" style="display:flex;gap:8px;margin-top:12px"><button id="p1" aria-current="page">1</button><button id="p2">2</button><button id="p3">3</button><button id="nx">Next</button></nav></div></main>`, { script: `
      const render = (n) => { const old = document.getElementById('list'); const ul = document.createElement('ul'); ul.id = 'list'; ul.style.cssText = 'border:1px solid #ccc;border-radius:12px;padding:0;margin:0;list-style:none'; ul.innerHTML = Array.from({ length: 14 }, (_, i) => '<li style="padding:24px 16px;border-bottom:1px solid #eee">Task ' + (n * 10 + i + 1) + ' · Logo for a bakery · 800 credits</li>').join(''); old.replaceWith(ul); ${fix ? "ul.scrollIntoView({ block: 'start' });" : ""} };
      render(0); ['p1','p2','p3'].forEach((id, i) => document.getElementById(id).onclick = () => render(i)); document.getElementById('nx').onclick = () => render(1);` });
    await load(page, html(false), "/dashboard/tasks");
    assert.ok(scrollFinding(await states(page, ORIGIN + "/dashboard/tasks")).length, "the new page of results starts above the screen");
    await load(page, html(true), "/dashboard/tasks");
    assert.deepEqual(scrollFinding(await states(page, ORIGIN + "/dashboard/tasks")), []);
  }, { width: 390, height: 700 });

  /* ═══════════ cookies: Decline declines and is remembered (C6); a link in the settings opens its page (C7) ═══════════ */
  const cookieDetect = async (page, ctx) => {
    const list = [...(await A.cookieConsent(page)), ...(await c.cookieFlow(page))];
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(200);
    if (A.cookieDecline) list.push(...(await A.cookieDecline(page, { next: ORIGIN + "/about" })));
    if (process.env.SHOW) console.log(show(list));
    return list;
  };
  const banner = (decline, extra = "") => `<div id="cookie-banner" role="region" aria-label="Cookie consent" style="position:fixed;left:0;right:0;bottom:0;background:#222;color:#fff;padding:16px">We use only necessary storage. <button id="decline">Decline</button> <button id="accept">Accept</button> <button id="manage">Manage</button></div>${extra}`;
  const consentJs = (decline) => `const b = document.getElementById('cookie-banner'); if (localStorage.getItem('consent')) b.remove();
    document.getElementById('accept').onclick = () => { localStorage.setItem('consent', 'all'); b.remove(); };
    document.getElementById('decline').onclick = () => { ${decline} };`;
  await test("xpyv9u C6 Decline: it does nothing / still stores a tracking id / is forgotten on reload — and the Decline that declines passes (Parallel /)", async (page, ctx) => {
    const page2 = (decline, extraJs = "") => doc(`<main><h1>Parallel</h1><a href="/about">About</a></main>${banner()}`, { script: consentJs(decline) + extraJs });
    site["/about"] = doc(`<main><h1>About</h1></main>${banner()}`, { script: consentJs("localStorage.setItem('consent','necessary'); b.remove();") });
    // 1. does nothing
    await load(page, page2(""));
    assert.ok((await cookieDetect(page, ctx)).some((f) => /does nothing/.test(f.what)), "a Decline that does nothing is reported");
    // 2. closes, but a tracking id is stored anyway
    await ctx.clearCookies(); await page.evaluate(() => localStorage.clear());
    await load(page, page2("localStorage.setItem('consent','necessary'); localStorage.setItem('ph_visitor_id','abc123'); document.cookie = '_ga=GA1.1.1; path=/'; b.remove();"));
    assert.ok((await cookieDetect(page, ctx)).some((f) => /still stores .*(ph_visitor_id|_ga)/.test(f.what)), "storage after a decline is reported");
    // 3. closes but is not remembered
    await ctx.clearCookies(); await page.evaluate(() => localStorage.clear());
    await load(page, page2("b.remove();"));
    assert.ok((await cookieDetect(page, ctx)).some((f) => /not remembered/.test(f.what)), "a forgotten choice is reported");
    // good: closes, stores the choice only, remembered
    await ctx.clearCookies(); await page.evaluate(() => localStorage.clear());
    await load(page, page2("localStorage.setItem('consent','necessary'); b.remove();"));
    assert.deepEqual((await cookieDetect(page, ctx)).filter((f) => f.id === "C6"), []);
  }, { width: 1280, height: 800 });
  await test("wryhj7 C7 the Cookie Policy link in the settings window navigates under the still-open window on a phone (Praxis); closing it on click passes", async (page) => {
    const html = (close) => doc(`<main id="main"><h1>Home</h1></main><footer><button id="cs">Cookie settings</button></footer>
      <div id="panel" role="dialog" aria-label="Cookie settings" hidden style="position:fixed;inset:0;background:#fff;padding:24px"><h2>Cookie settings</h2><p>Necessary — always on</p><button>Decline</button> <button>Accept</button><p><a id="policy" href="/cookies">Cookie Policy</a></p></div>`, { script: `
      const panel = document.getElementById('panel'); document.getElementById('cs').onclick = () => { panel.hidden = false; };
      document.getElementById('policy').onclick = (e) => { e.preventDefault(); history.pushState({}, '', '/cookies'); document.getElementById('main').innerHTML = '<h1>Cookie Policy</h1>'; ${close ? "panel.hidden = true;" : ""} };` });
    await load(page, html(false));
    const open = () => A.openCookieSettings ? A.openCookieSettings(page) : Promise.resolve(false);
    const bad = [...(await c.cookieFlow(page)), ...(A.dialogLinks ? await A.dialogLinks(page, open) : [])];
    assert.ok(bad.some((f) => /looks dead|does nothing/.test(f.what)), show(bad));
    await load(page, html(true));
    const good = A.dialogLinks ? await A.dialogLinks(page, open) : [];
    assert.deepEqual(good, []);
  }, PHONE);

  /* ═══════════ forms and messages: autofill (FM11), one error said twice (FM12), success that looks like an error (FM13) ═══════════ */
  await test("vzl7dx FM11 sign-up 'Full name, Email, Password' with no autocomplete=username: the browser saved the name as the login (Praxis /register → /login)", async (page) => {
    const reg = (emailAc) => doc(`<main><h1>Create an account</h1><form aria-label="Create an account"><label>Full name <input name="name" autocomplete="name"></label><label>Email <input name="email" type="email" autocomplete="${emailAc}"></label><label>Password <input name="password" type="password" autocomplete="new-password"></label><button>Create account</button></form></main>`);
    const detect = async () => [...(F.authShell ? await F.authShell(page) : []), ...(F.authAutocomplete ? await F.authAutocomplete(page) : [])].filter((f) => /FM11|autocomplete|autofill/.test(f.what));
    await load(page, reg("email"), "/register");
    assert.ok((await detect()).some((f) => /none says autocomplete="username"/.test(f.what)), "the guessed login is reported");
    await load(page, reg("username"), "/register");
    assert.deepEqual((await detect()).filter((f) => !f.soft), []);
  });
  const signIn = (dup) => doc(`<main><h1>Sign in</h1><form id="si"><div id="msg" style="display:none;color:#b00;background:#fee;border:1px solid #b00;padding:8px"></div><label>Email <input name="email" type="email" autocomplete="username"></label><label>Password <input name="password" type="password" autocomplete="current-password"></label><button type="submit">Sign in</button></form></main><div id="toaster" style="position:fixed;right:16px;bottom:16px"></div>`, { script: `
    document.getElementById('si').onsubmit = async (e) => { e.preventDefault(); const r = await fetch('/api/auth/callback/credentials', { method: 'POST', body: 'x' }); if (!r.ok) { const m = document.getElementById('msg'); m.textContent = 'Invalid email or password'; m.style.display = 'block'; ${dup ? "const t = document.createElement('div'); t.setAttribute('data-sonner-toast',''); t.style.cssText='background:#300;color:#fff;padding:12px'; t.textContent = 'Sign-in failed: invalid credentials'; document.getElementById('toaster').append(t);" : ""} } };` });
  await test("ul9jll FM12 a failed sign-in shows a toast in the corner AND the message above the fields (Parallel /login); one message passes", async (page) => {
    await load(page, signIn(true), "/login");
    const bad = await F.submitOutcomes(page);
    assert.ok(bad.some((f) => f.id === "FM12" || /twice|toast/.test(f.what)), show(bad));
    await load(page, signIn(false), "/login");
    assert.deepEqual((await F.submitOutcomes(page)).filter((f) => f.id === "FM12"), []);
  });
  const contact = (same) => doc(`<main><h1>Contact</h1><form id="cf"><label>Name <input name="name" autocomplete="name"></label><label>Email <input name="email" type="email"></label><label>Message <textarea name="message" minlength="10"></textarea></label><button type="submit">Send message</button><div id="out" style="display:none;padding:8px"></div></form></main>`, { script: `
    document.getElementById('cf').onsubmit = async (e) => { e.preventDefault(); const o = document.getElementById('out'); const r = await fetch('/api/contact', { method: 'POST', body: 'x' }).catch(() => ({ ok: false }));
      o.style.display = 'block';
      if (r.ok) { o.textContent = 'Thanks, your message was sent.'; o.style.cssText = ${same ? "'display:block;padding:8px;color:#b00;background:#fee;border:1px solid #b00'" : "'display:block;padding:8px;color:#064;background:#efe;border:1px solid #064'"}; }
      else { o.textContent = 'Could not send your message, try again.'; o.style.cssText = 'display:block;padding:8px;color:#b00;background:#fee;border:1px solid #b00'; } };` });
  await test("FM13 the success message looks exactly like the error message (same red box) on a contact form; a success in its own tone passes (brief §1)", async (page) => {
    await load(page, contact(true), "/contact");
    const bad = await F.submitOutcomes(page);
    assert.ok(bad.some((f) => f.id === "FM13" || /looks exactly like/.test(f.what)), show(bad));
    await load(page, contact(false), "/contact");
    assert.deepEqual((await F.submitOutcomes(page)).filter((f) => f.id === "FM13"), []);
  });

  /* ═══════════ sign-out works the first time (A4) ═══════════ */
  await test("iyitox A4 Sign out → 'Sign out?' → Sign out leaves you signed in; it takes a second try (Parallel). One confirmed sign-out passes — and is not a false alarm", async (page) => {
    // the session is a cookie; /dashboard sends a signed-out visitor to /login
    const dash = (buggy) => doc(`<header><a href="/">Parallel</a><button id="acct" aria-haspopup="menu" aria-expanded="false">Account</button><div id="menu" role="menu" hidden><a href="/dashboard/tasks" role="menuitem">Tasks</a><button id="so" role="menuitem">Sign out</button></div></header><main><h1>Dashboard</h1></main><div id="confirm" role="alertdialog" aria-label="Sign out?" hidden style="position:fixed;inset:30% 10%;background:#fff;border:1px solid #ccc;padding:16px"><p>Sign out of Parallel?</p><button id="cancel">Cancel</button><button id="yes">Sign out</button></div>`, { script: `
      if (!document.cookie.includes('sid=1')) location.replace('/login');
      document.getElementById('acct').onclick = () => { const m = document.getElementById('menu'); m.hidden = !m.hidden; };
      document.getElementById('so').onclick = () => { document.getElementById('confirm').hidden = false; };
      document.getElementById('yes').onclick = () => { ${buggy ? "const n = Number(sessionStorage.getItem('tries') || 0) + 1; sessionStorage.setItem('tries', n); document.getElementById('confirm').hidden = true; if (n < 2) return;" : ""} document.cookie = 'sid=; Max-Age=0; path=/'; location.href = '/'; };` });
    site["/login"] = doc(`<main><h1>Sign in</h1><form><input type="email"><input type="password"><button>Sign in</button></form></main>`);
    const run = async (buggy) => {
      await page.context().addCookies([{ name: "sid", value: "1", url: ORIGIN }]);
      await load(page, dash(buggy), "/dashboard");
      if (A.signOutOnce) return A.signOutOnce(page, { home: "/dashboard" });
      // 5.1.0's A4, as it ran (when it ran at all: it needed LOGIN_EMAIL, which role-based projects do not set)
      const out = [];
      if (!(await A.clickControl(page, A.SIGN_OUT_RE))) return [{ what: "no Sign out" }];
      await page.waitForTimeout(1500);
      await page.goto(ORIGIN + "/dashboard", { waitUntil: "networkidle" }).catch(() => {});
      const still = new URL(page.url()).pathname === "/dashboard" && !(await page.locator("input[type=email], input[type=password]").first().isVisible().catch(() => false));
      if (still) out.push({ what: "after one click on Sign out, /dashboard still opens signed in [A4]" });
      return out;
    };
    const bad = await run(true);
    assert.ok(bad.some((f) => /still opens signed in/.test(f.what)), show(bad));
    await page.evaluate(() => sessionStorage.clear());
    const good = await run(false);
    assert.deepEqual(good, [], "a sign-out with a confirm step is one sign-out");
  });
  await test("A4 credentials: a role's env names count when LOGIN_EMAIL is not set (Praxis, Parallel: roles[].env → BUYER_EMAIL)", async () => {
    assert.ok(A.credentials, "credentials() exists");
    const cfg = { login: { url: "/login" }, roles: [{ name: "buyer", env: { LOGIN_EMAIL: "BUYER_EMAIL", LOGIN_PASSWORD: "BUYER_PASSWORD" } }] };
    assert.deepEqual(A.credentials(cfg, { BUYER_EMAIL: "qa@x.test", BUYER_PASSWORD: "pw" }), { email: "qa@x.test", password: "pw", role: "buyer" });
    assert.equal(A.credentials(cfg, {}), null);
    assert.equal(A.credentials(cfg, { LOGIN_EMAIL: "a@x", LOGIN_PASSWORD: "b" }).role, null);
  });

  /* ═══════════ consistency across pages: one look per role (1.20) ═══════════ */
  // what a site-wide run compares: 1.17 (shape outliers vs the site's median), 1.3/1.16 (variety limits), and 1.20 when present
  async function siteWide(pages) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await c.install(page);
    const shapes = [], sigs = [], items = [];
    for (const [path, html] of Object.entries(pages)) {
      await load(page, html, path);
      shapes.push(...(await c.collectShapes(page, path)));
      sigs.push(...(await c.collectSignatures(page, path)));
      if (looks.collectRoleLooks) items.push(...(await looks.collectRoleLooks(page, path)));
    }
    await ctx.close();
    const out = [...c.shapeOutliers(shapes, c.siteShape(shapes))];
    const lim = { buttonRadii: 2, buttonFonts: 1, buttonHeights: 3, cardRadii: 3, cardStyles: 4, inputHeights: 2, inputRadii: 2 };
    const chk = (label, list, max) => { if (list.length > max) out.push({ what: `${label}: ${list.length} variants`, where: list.map((v) => v.example).join(" | ") }); };
    chk("filled-button corner radius", c.variety(sigs, "button", "radius", (s) => !!s.filled), lim.buttonRadii);
    chk("card corner radius", c.variety(sigs, "card", "radius"), lim.cardRadii);
    chk("input corner radius", c.variety(sigs, "input", "radius", (s) => s.radius !== null), lim.inputRadii);
    if (looks.roleLookOutliers) out.push(...looks.roleLookOutliers(items).hard);
    if (process.env.SHOW) console.log(show(out));
    return out;
  }
  const PAGE = (body) => doc(`<header style="padding:12px;border-bottom:1px solid #eee"><a href="/">Parallel</a></header><main style="padding:24px">${body}</main>`);
  const pill = "display:inline-flex;align-items:center;height:44px;padding:0 20px;border-radius:999px;text-decoration:none";
  const filledBtn = `<a href="/request" style="${pill};background:#9f0;color:#000">Describe your task</a>`;
  const outlineBtn = (style = pill) => `<a href="/pricing" style="${style};border:1px solid #333;color:#111">See pricing</a>`;
  const tag = (style) => `<span style="display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;background:#eee;font-size:12px;${style}">Brand design</span>`;
  const status = (style) => `<span id="status" style="display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;background:#ffe9a8;font-size:12px;${style}"><span style="width:6px;height:6px;border-radius:50%;background:#a60"></span><span>Pending</span></span>`;
  const card = (inner) => `<div style="padding:16px;border:1px solid #ddd;border-radius:16px;width:420px;min-height:120px;margin:12px 0">${inner}</div>`;
  const sitePages = (how, task) => ({
    "/": PAGE(`<h1>Home</h1>${filledBtn} ${outlineBtn()} ${card(`<h3>Example profile</h3>${tag("border-radius:999px")}`)}`),
    "/pricing": PAGE(`<h1>Pricing</h1>${filledBtn} ${outlineBtn()} ${card(`<h3>Plan</h3>${tag("border-radius:999px")}`)}`),
    "/specialists": PAGE(`<h1>Specialists</h1>${outlineBtn()} ${card(`<h3>Gunel Z.</h3>${tag("border-radius:999px")} ${tag("border-radius:999px")}`)}`),
    "/how-it-works": PAGE(`<h1>How it works</h1>${filledBtn} ${outlineBtn(how)} ${outlineBtn(how).replace("See pricing", "Sign up")}`),
    "/dashboard/tasks/1": PAGE(`<h1>Logo for a bakery</h1>${card(`${status(task)} <p>Brief</p>`)}`),
  });
  await test("51rbik / qeobrx / 1kxkew 1.20: How It Works buttons are square UPPER CASE outlines while every other page uses pill outlines; the task page's Pending tag (a dot + a label) is square while tags are pills elsewhere (Parallel)", async () => {
    // (2d5e78a: the step links were "the square uppercase filter chip"; 1.17 alone could flag those, not the badge)
    const bad = await siteWide(sitePages(`display:inline-flex;align-items:center;height:44px;padding:0 20px;border-radius:0;text-decoration:none;text-transform:uppercase;letter-spacing:.08em;font-size:12px`, "border-radius:0"));
    assert.ok(bad.some((f) => /how-it-works/.test(`${f.where} ${f.what}`)), `the How It Works buttons are reported\n${show(bad)}`);
    assert.ok(bad.some((f) => /dashboard\/tasks\/1/.test(`${f.where} ${f.what}`) && /status|Pending|tag/i.test(`${f.where} ${f.what} ${f.role || ""}`)), `the square Pending tag is reported\n${show(bad)}`);
    const good = await siteWide(sitePages(pill, "border-radius:999px"));
    assert.deepEqual(good, []);
    // live false alarms (Parallel): a pill "rows per page" trigger is not a button look; filter chips you press and
    // status badges you read may differ in case
    const extra = sitePages(pill, "border-radius:999px");
    extra["/specialists"] = extra["/specialists"].replace("</main>", `<button aria-haspopup="listbox" style="${pill};background:#222;color:#fff;text-transform:uppercase">10</button><button aria-pressed="false" style="display:inline-flex;height:24px;padding:0 10px;border-radius:999px;border:1px solid #333;font-size:12px">Ship an MVP</button></main>`);
    extra["/dashboard/tasks/1"] = extra["/dashboard/tasks/1"].replace("Pending", "PENDING");
    assert.deepEqual(await siteWide(extra), []);
  });
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${results.filter((r) => r[1] === "pass").length} passed, ${failed} failed`);
if (failed) process.exit(1);
