// 5.5.0 — the missed cards of Praxis, Parallel, Kindred and Compass about money, the top-up dialog, the footer, cookies,
// sign-out and signed-in areas: each card as it shipped ("bad" fails), the fix ("good" passes) and look-alikes that
// stay quiet. The checks: playwright/checks/money.js, layout.js moneyIssues / moneyFormat, acceptance.js (P2, F0, F5,
// A4, A10, M2, LS1, C1, C2), locales.mjs (LS1), run.js measure() (2.14 placeholder, B4 grouping).
// RUN: node test/misses-550-money.test.mjs   (ONLY=regex for one)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import * as L from "../playwright/checks/layout.js";
import * as A from "../playwright/acceptance.js";
import * as run from "../playwright/checks/run.js";

const opt = async (path) => { try { return await import(path); } catch { return {}; } };
const M = await opt("../playwright/checks/money.js");
const { detectLocales } = await import("../playwright/locales.mjs");
const HERE = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const show = (x) => JSON.stringify(x, null, 1);

let site = {};
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const h = site[u.pathname];
  if (typeof h === "function") return h(req, res, u);
  if (h && typeof h === "object" && h.type) { res.writeHead(200, { "content-type": h.type }); return res.end(h.body); }
  res.writeHead(h == null ? 404 : 200, { "content-type": "text/html; charset=utf-8" });
  res.end(h ?? "<!doctype html><title>404</title><h1>Not found</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, { lang = "en", head = "", script = "", title = "Page" } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial;color:#111;background:#fff}${head}</style></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;
async function load(page, html, path = "/", extra = {}) { site = { ...extra, [path]: html }; await page.goto(ORIGIN + path, { waitUntil: "load" }); await page.waitForTimeout(120); }
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page, ctx); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, process.env.LONG ? 80 : 6).join("\n    ")}`); } finally { await ctx.close(); }
}
const need = (fn) => { assert.ok(fn, "the check does not exist in this version"); return fn; };
const PHONE = { width: 360, height: 780 };

try {
  /* ═════ B4 one grouping separator (Compass 6lyos0, 5fgum8) ═════ */
  const dialog = (bal, packs, ph = "Any whole amount") => `<div role="dialog" style="padding:16px"><h2>Add Credits</h2><p>Current balance <b>${bal}</b></p><div style="display:flex;gap:8px">${packs.map((p) => `<button>${p}</button>`).join("")}</div><input style="width:200px;padding:6px 12px" placeholder="${ph}"></div>`;
  await test("6lyos0 Add Credits: balance '6 000 credits' next to packs '1,000 credits' / '2,500 credits' is two number formats; '6,000' passes", async (page) => {
    const check = need(M.numberGrouping);
    await load(page, doc(dialog("6 000 credits", ["1,000 credits", "2,500 credits"])));
    const bad = await check(page);
    assert.equal(bad.length, 1, show(bad));
    assert.match(bad[0].what, /"6 000" groups thousands with a space .* comma \("1,000"\)/);
    await load(page, doc(dialog("6,000 credits", ["1,000 credits", "2,500 credits"])));
    assert.deepEqual(await check(page), []);
  }, PHONE);
  await test("5fgum8 KK Add Credits: '10 000 кредит' next to '1,000 кредит' fails; a kk page with spaces everywhere and 'Order 10 000' (no money) stay quiet", async (page) => {
    const check = need(M.numberGrouping);
    await load(page, doc(dialog("10 000 кредит", ["1,000 кредит", "2,500 кредит"]), { lang: "kk" }));
    assert.equal((await check(page)).length, 1);
    await load(page, doc(dialog("10 000 кредит", ["1 000 кредит", "2 500 кредит"]), { lang: "kk" }));
    assert.deepEqual(await check(page), [], "one format (spaces) everywhere");
    await load(page, doc(`<p>Order 10 000 shipped</p><p>Total $1,200</p>`));
    assert.deepEqual(await check(page), [], "a number without money or credits is not an amount");
  }, PHONE);

  await test("B4: a sub-cent rate's decimal point ($0.000111 beside $20,000) is not a second grouping separator; a real second separator still fires", async (page) => {
    const check = need(M.numberGrouping);
    await load(page, doc(`<p>Top up from $1 to $20,000. GPU time is $0.000111 per second and the floor is $0.00000.</p>`));
    assert.deepEqual(await check(page), [], "a decimal point is where the cents start, not where the thousands are grouped");
    await load(page, doc(`<p>Top up from $1 to $20,000. The yearly cap is $1.000.000.</p>`));
    const bad = await check(page);
    assert.equal(bad.length, 1, show(bad));
    assert.match(bad[0].what, /"1\.000\.000" groups thousands with a dot/);
  }, PHONE);

  /* ═════ 2.14 placeholder cut (Compass 7bouc8, kdn5xf) ═════ */
  await test("7bouc8 Add Credits (360): placeholder 'Any whole amount, €1 to €17,800' cut in a 200px field; '€1–€17,800' fits; a search field and a filled field are left out", async (page) => {
    const check = need(M.placeholderCut);
    await load(page, doc(dialog("6,000 credits", ["1,000 credits"], "Any whole amount, €1 to €17,800")));
    const bad = await check(page);
    assert.equal(bad.length, 1, show(bad));
    assert.match(bad[0].what, /placeholder cut: "Any whole amount, €1 to €1[\d,]*…" of "Any whole amount, €1 to €17,800"/);
    await load(page, doc(dialog("6,000 credits", ["1,000 credits"], "€1–€17,800")));
    assert.deepEqual(await check(page), []);
    await load(page, doc(`<input type="search" style="width:120px" placeholder="Search specialists, services and tags"><input style="width:120px" value="x" placeholder="A very long placeholder that would be cut">`));
    assert.deepEqual(await check(page), []);
  }, PHONE);
  const kdnHtml = doc(`<main style="padding:16px"><h1>Әмиян</h1><button id="open">Кредит қосу</button></main>`, { lang: "kk", script: `document.getElementById("open").onclick = () => { document.body.insertAdjacentHTML("beforeend", ${JSON.stringify(dialog("6,000 кредит", ["1,000 кредит"], "Кез келген бүтін сома, €1 – €17,800"))}); };` });
  await test("kdn5xf KK: 'Кез келген бүтін сома, €1 – €17,800' cut — and the states walk measures it with states.wallet: false (opened, nothing pressed)", async (page) => {
    const check = need(M.placeholderCut);
    const html = kdnHtml;
    await load(page, html);
    await page.click("#open");
    assert.equal((await check(page)).length, 1);
  }, PHONE);
  await test("kdn5xf the states walk opens the top-up dialog with states.wallet: false (nothing pressed) and measures the cut placeholder there", async (page) => {
    await load(page, kdnHtml);
    const res = await run.stateChecks(page, { wallet: false, maxOpeners: 4, maxForms: 0 });
    assert.ok(res.findings.some((f) => /placeholder cut/.test(f.what)), show({ f: res.findings.map((x) => x.what), nt: res.notTested, st: res.states, html: await page.content() }));
    assert.ok(res.notTested.some((x) => /opened and measured, nothing pressed/.test(x)), show(res.notTested));
  }, PHONE);

  /* ═════ B4 the same credits, one price (Compass 5nel9b, 84u591, xivil1) ═════ */
  await test("5nel9b Service index '600–950 cr · €53.40–€84.60' vs Pricing '600–950 cr | €53.50–€84.50'; the same range everywhere passes; a bulk-discount table of other packs stays quiet", async (page) => {
    const pairs = need(M.moneyPairs);
    await load(page, doc(`<ul><li>Design AI · 600–950 cr · €53.40–€84.60</li><li>Copy AI · 300–500 cr · €26.70–€44.50</li></ul>`), "/tasks");
    const a = await pairs(page);
    await load(page, doc(`<table><tr><td>Design AI</td><td>600–950 cr</td><td>€53.50–€84.50</td></tr></table><table><tr><td>1,000 credits</td><td>€80.19</td><td>save 10%</td></tr></table>`), "/pricing");
    const b = await pairs(page);
    const bad = M.conversionConflicts([{ place: "/tasks", pairs: a.pairs }, { place: "/pricing", pairs: b.pairs }]);
    assert.equal(bad.length, 1, show({ a, b, bad }));
    assert.match(bad[0].what, /600-950 credits cost 2 different amounts in EUR: EUR 53\.4–84\.6 on \/tasks; EUR 53\.5–84\.5 on \/pricing|600-950 credits cost 2 different amounts in EUR/);
    await load(page, doc(`<table><tr><td>Design AI</td><td>600–950 cr</td><td>€53.40–€84.60</td></tr></table>`), "/pricing");
    const g = await pairs(page);
    assert.deepEqual(M.conversionConflicts([{ place: "/tasks", pairs: a.pairs }, { place: "/pricing", pairs: g.pairs }]), []);
  });
  await test("84u591 Pricing '100 credits €8.91' vs the Add Credits dialog '100 credits €9'; xivil1 '500 credits $48.50 (3% discount)' vs the calculator '500 credits … $46.00' on one page", async (page) => {
    await load(page, doc(`<div class="pack"><p>100 credits</p><p>€8.91</p></div><div class="pack"><p>500 credits</p><p>€43.21</p></div>`), "/pricing");
    const p = await M.moneyPairs(page);
    await load(page, doc(`<div role="dialog"><button><span>100 credits</span> <span>€9</span></button><button><span>500 credits</span> <span>€43</span></button></div>`), "/dashboard/wallet");
    const d = await M.moneyPairs(page, { scope: "[role=dialog]" });
    const bad = M.conversionConflicts([{ place: "/pricing (EUR)", pairs: p.pairs }, { place: "/dashboard/wallet top-up dialog (EUR)", pairs: d.pairs }]);
    assert.equal(bad.length, 2, show({ p, d, bad }));
    await load(page, doc(`<div class="pack"><h3>Standard</h3><p>$48.50 / 500 credits / 3% volume discount</p></div><div class="calc"><p>500 credits · volume discount (8%) −$4.00 · total price $46.00</p></div>`), "/pricing");
    const x = await M.moneyPairs(page);
    assert.equal(M.conversionConflicts([{ place: "/pricing", pairs: x.pairs }]).length, 1, show(x));
    // a struck-through old price next to the new one is not a second price
    await load(page, doc(`<div class="pack"><p>500 credits <s>$50.00</s></p></div><div><p>500 credits $48.50</p></div>`), "/pricing");
    assert.deepEqual(M.conversionConflicts([{ place: "/pricing", pairs: (await M.moneyPairs(page)).pairs }]), []);
  });

  /* ═════ B4 the stated rate reproduces the prices (Compass 3iey9d, Praxis 3v7u9n) ═════ */
  await test("3iey9d 'Base rate 100 credits €9' vs '10 cr = €0.89'; 3v7u9n '800 credits €71.33' at 10 credits = €0.89; €8.90 passes; a discounted pack and '€1 = $1.1215' stay quiet", async (page) => {
    await load(page, doc(`<p>Ten credits: 10 cr = €0.89</p><table><tr><td>100 credits</td><td>€9</td><td>Base rate</td></tr><tr><td>1,000 credits</td><td>€80.19</td><td>10% off</td></tr></table><p>Today €1 = $1.1215</p><ul><li>800 credits <span>€71.33</span></li></ul>`));
    const r = await M.moneyPairs(page);
    const bad = M.rateMismatches(r);
    assert.equal(bad.length, 2, show({ r, bad }));
    assert.ok(bad.some((f) => /100 credits at that rate are EUR 8\.90, not 9/.test(f.what)), show(bad));
    assert.ok(bad.some((f) => /800 credits at that rate are EUR 71\.20, not 71\.33/.test(f.what)), show(bad));
    await load(page, doc(`<p>10 cr = €0.89</p><table><tr><td>100 credits</td><td>€8.90</td><td>Base rate</td></tr></table><ul><li>800 credits <span>€71.20</span></li></ul>`));
    assert.deepEqual(M.rateMismatches(await M.moneyPairs(page)), []);
  });

  /* ═════ B4 a bracket that repeats the amounts (Praxis 894xch) ═════ */
  await test("894xch EUR: 'from €5 to €20,000 (€5 to €20,000, or the equivalent in US dollars)' fails; the USD text with euros in brackets, and the EUR text with dollars, pass", async (page) => {
    await load(page, doc(`<p>A top-up is any whole amount from €5 to €20,000 (€5 to €20,000, or the equivalent in US dollars).</p>`));
    const bad = M.bracketRepeats(await M.moneyPairs(page));
    assert.equal(bad.length, 1, show(bad));
    await load(page, doc(`<p>A top-up is any whole amount from $6 to $22,430 (€5 to €20,000, or the equivalent in US dollars).</p>`));
    assert.deepEqual(M.bracketRepeats(await M.moneyPairs(page)), []);
    await load(page, doc(`<p>A top-up is any whole amount from €5 to €20,000 ($6 to $22,430, or the equivalent in euros).</p>`));
    assert.deepEqual(M.bracketRepeats(await M.moneyPairs(page)), []);
  });

  /* ═════ B4 the calculator follows its label (Praxis 0a32tm) ═════ */
  const calc = (rate) => doc(`<section><h2>Work out a top-up</h2><label>Amount in euros <input id="amt" type="number" min="5" max="20000" value="100"></label><p>Credits at 10 per €0.89</p><output id="out">1,124</output></section>`, { script: `const i = document.getElementById("amt"), o = document.getElementById("out"); i.oninput = () => { o.textContent = Math.round(Number(i.value) / ${rate} * 10).toLocaleString("en-US"); };` });
  await test("0a32tm calculator 'Credits at 10 per €0.89' computes with the exact rate €0.8909 (1000 → 11,225, label says 11,235); with €0.89 it passes", async (page) => {
    await load(page, calc(0.8909));
    const r = await M.moneyPairs(page);
    assert.equal(r.calculators.length, 1, show(r));
    const bad = await M.calculatorCheck(page, r.calculators);
    assert.equal(bad.length, 1, show(bad));
    assert.match(bad[0].what, /gives 11,225 credits — by that label it is 11,235/);
    await load(page, calc(0.89));
    assert.deepEqual(await M.calculatorCheck(page, (await M.moneyPairs(page)).calculators), []);
  });

  /* ═════ B4 after a switch: unconverted amounts (Compass b2950h, 9n16n2), dirty conversions (64f15b, Kindred b2d1mi) ═════ */
  const switcher = (usd, eur) => doc(`<header><div role="group"><button id="USD" aria-pressed="true">USD</button><button id="EUR" aria-pressed="false">EUR</button></div></header><main id="m">${usd}</main>`, { script: `const V = { USD: ${JSON.stringify(usd)}, EUR: ${JSON.stringify(eur)} }; for (const k of ["USD", "EUR"]) document.getElementById(k).onclick = () => { document.getElementById("m").innerHTML = V[k]; for (const j of ["USD", "EUR"]) document.getElementById(j).setAttribute("aria-pressed", String(j === k)); };` });
  await test("b2950h / 9n16n2 Pricing in EUR: 'from €1 to €20,000' kept the dollar number while the packs were converted; €17,800 passes", async (page) => {
    const usd = `<p>Packs: <b>$10</b> <b>$48.50</b> <b>$92</b></p><p>A top-up is from $1 to $20,000.</p>`;
    await load(page, switcher(usd, `<p>Packs: <b>€8.90</b> <b>€43.20</b> <b>€82</b></p><p>A top-up is from €1 to €20,000.</p>`));
    const bad = await L.moneyFormat(page, 3);
    assert.ok(bad.hard.some((f) => /"€20,000" is the USD number "\$20,000" with another symbol/.test(f.what)), show(bad.hard));
    assert.ok(!bad.hard.some((f) => /€1"/.test(f.what)), "€1 = $1 by rounding is not reported");
    await load(page, switcher(usd, `<p>Packs: <b>€8.90</b> <b>€43.20</b> <b>€82</b></p><p>A top-up is from €1 to €17,800.</p>`));
    assert.deepEqual((await L.moneyFormat(page, 3)).hard.filter((f) => /another symbol/.test(f.what)), []);
  });
  await test("64f15b pack prices in a 14px table next to their credits ($10 / $48.50 / $92 / $212.50 → €8.91 / €43.21 / €81.96 / €189.31) are dirty conversions (soft); Kindred b2d1mi $9.70 counts as round", async () => {
    const tok = (raw, extra = {}) => ({ raw, fontSize: 14, creditsNear: true, where: "td", ...extra });
    const base = L.moneyIssues(["$10", "$48.50", "$92", "$212.50"].map((x) => tok(x)));
    assert.equal(base.niceShare, 1);
    const eur = L.moneyIssues(["€8.91", "€43.21", "€81.96", "€189.31"].map((x) => tok(x)), { baseNice: base.niceShare, label: "in EUR" });
    assert.equal(eur.soft.length, 1, show(eur));
    assert.match(eur.soft[0].what, /converted prices are not rounded/);
    // b2d1mi: $10.00 $9.70 $46.00 $85.00 (24px) → EUR €8.63 €8.37 €39.71 €73.38
    const k = L.moneyIssues(["$10.00", "$9.70", "$46.00", "$85.00"].map((x) => tok(x, { fontSize: 24, creditsNear: false })));
    assert.equal(k.niceShare, 1, "x.70 is a round tail");
    const ke = L.moneyIssues(["€8.63", "€8.37", "€39.71", "€73.38"].map((x) => tok(x, { fontSize: 24, creditsNear: false })), { baseNice: k.niceShare });
    assert.equal(ke.soft.length, 1, show(ke));
    const good = L.moneyIssues(["€9", "€8.90", "€39", "€75"].map((x) => tok(x, { fontSize: 24, creditsNear: false })), { baseNice: k.niceShare });
    assert.deepEqual(good.soft, []);
    const dirtyBase = L.moneyIssues(["$9.73", "$46.12"].map((x) => tok(x, { fontSize: 24, creditsNear: false })));
    assert.deepEqual(L.moneyIssues(["€8.63", "€8.37"].map((x) => tok(x, { fontSize: 24, creditsNear: false })), { baseNice: dirtyBase.niceShare }).soft, [], "a dirty base sets no expectation");
  });

  /* ═════ B4 one unit per rate (Compass zcg5fp) ═════ */
  await test("zcg5fp Zoe '160 CR / HR' on / and 'From $160 /task' on /specialists; the same unit on both passes", async (page) => {
    await load(page, doc(`<ul><li><h3>Zoe</h3><span>160 CR / HR</span></li><li><h3>Arman</h3><span>120 CR / HR</span></li></ul>`), "/");
    const a = await M.entityPrices(page);
    await load(page, doc(`<article><h3>Zoe</h3><p>From $160 /task</p></article>`), "/specialists");
    const b = await M.entityPrices(page);
    const bad = M.entityPriceConflicts([{ place: "/", prices: a }, { place: "/specialists", prices: b }]);
    assert.equal(bad.length, 1, show({ a, b }));
    await load(page, doc(`<article><h3>Zoe</h3><p>From 160 cr / hr</p></article>`), "/specialists");
    assert.deepEqual(M.entityPriceConflicts([{ place: "/", prices: a }, { place: "/specialists", prices: await M.entityPrices(page) }]), []);
  });

  /* ═════ P2 one policy layout (Parallel gjfjnc) ═════ */
  const policy = (n, rail) => doc(`<main style="display:flex;gap:24px">${rail ? `<nav style="position:sticky;top:0;align-self:flex-start"><p>On this page</p>${Array.from({ length: n }, (_, i) => `<a href="#s${i}">Section ${i}</a>`).join("<br>")}</nav>` : ""}<article>${Array.from({ length: n }, (_, i) => `<h2 id="s${i}">Section ${i}</h2><p>${"Policy text. ".repeat(30)}</p>`).join("")}</article></main>`);
  await test("gjfjnc /cookies, /cancellation-policy and /delivery-policy have no contents rail while /terms and /privacy do; /delivery-policy is a policy path now; a 2-section /imprint stays quiet", async (page) => {
    assert.ok(A.isPolicyPath("/delivery-policy") && A.isPolicyPath("/shipping-policy") && A.isPolicyPath("/specialist-agreement"));
    assert.ok(!A.isPolicyPath("/become-partner"));
    const seen = [];
    for (const [path, n, rail] of [["/terms", 9, true], ["/privacy", 9, true], ["/cookies", 6, false], ["/cancellation-policy", 4, false], ["/delivery-policy", 4, false], ["/imprint", 2, false]]) {
      await load(page, policy(n, rail), path);
      const res = await A.policyLayout(page);
      seen.push({ path, ...res.meta });
    }
    const bad = need(A.policyRailParity)(seen);
    assert.equal(bad.length, 1, show(seen));
    assert.match(bad[0].what, /\/cookies \(6 sections\), \/cancellation-policy \(4 sections\), \/delivery-policy \(4 sections\) have no "On this page"/);
    assert.ok(!/imprint/.test(bad[0].what));
    assert.deepEqual(A.policyRailParity(seen.map((s) => ({ ...s, toc: true }))), []);
    assert.deepEqual(A.policyRailParity(seen.map((s) => ({ ...s, toc: false }))), [], "no policy has a rail: nothing to be the same as");
  });

  /* ═════ F0 one footer signed in and out (Praxis xp7pmu) ═════ */
  await test("xp7pmu signed in, the footer's Company column loses Contact; the same links pass; Sign in vs Dashboard is ignored", async (page, ctx) => {
    const footer = (signed, contact = true) => doc(`<main><h1>Terms</h1></main><footer><nav><p>Company</p><a href="/about">About</a>${contact ? '<a href="/contact">Contact</a>' : ""}<a href="/become-partner">Become a partner</a>${signed ? '<a href="/dashboard">Dashboard</a>' : '<a href="/login">Sign in</a>'}</nav></footer>`);
    await load(page, footer(false), "/terms");
    const anon = await need(A.footerLinks)(page);
    await load(page, footer(true, false), "/terms");
    const bad = A.footerParity(anon, await A.footerLinks(page), "buyer");
    assert.equal(bad.filter((o) => !o.soft).length, 1, show(bad));
    assert.match(bad[0].what, /signed in as buyer, the footer loses "Contact" \(\/contact\)/);
    await load(page, footer(true, true), "/terms");
    assert.deepEqual(A.footerParity(anon, await A.footerLinks(page), "buyer"), []);
  });

  /* ═════ A10 a signed-in area does not render to a visitor (Kindred gm21xv) ═════ */
  await test("gm21xv /admin shows users, specialists and requests to a signed-out visitor; a sign-in form and 'Loading…' are not content", async (page) => {
    const rows = Array.from({ length: 6 }, (_, i) => `<tr><td>Request ${i + 1} from Acme Corporation about a brand identity</td><td>open</td></tr>`).join("");
    await load(page, doc(`<header><a href="/">Kindred</a></header><main><h1>Bureau</h1><div class="grid"><div>Users <b>42</b></div><div>Specialists <b>7</b></div><div>Requests <b>19</b></div></div><table>${rows}</table></main>`), "/admin");
    const bad = await need(A.areaContent)(page);
    assert.equal(bad.content, true, show(bad));
    await load(page, doc(`<main><h1>Sign in</h1><form><input type="email"><input type="password"><button>Sign in</button></form></main>`), "/admin");
    assert.equal((await A.areaContent(page)).content, false);
    await load(page, doc(`<main><p>Loading…</p></main>`), "/dashboard");
    assert.equal((await A.areaContent(page)).content, false);
  });

  /* ═════ F5 "We accept" on the logos' line; the studio's files (Compass r98e7t, cnfovs) ═════ */
  const studio = readFileSync(join(HERE, "fixtures/money/visa-studio.png")), legacy = readFileSync(join(HERE, "fixtures/money/visa-legacy.png"));
  const foot = (row, src = "/visa.png") => doc(`<main><h1>Home</h1></main><footer style="padding:16px"><a href="/terms">Terms of Service</a> <a href="/privacy">Privacy Policy</a> <a href="/cookies">Cookie Policy</a><p>© 2026 Compass Ltd. All rights reserved.</p>${row.replace(/SRC/g, src)}</footer>`);
  const stacked = `<div><p>We accept</p><div><img alt="Visa" src="SRC" width="48" height="30"><img alt="Mastercard" src="SRC" width="48" height="30"></div></div>`;
  const inline = `<div style="display:flex;align-items:center;gap:8px"><span>We accept</span><img alt="Visa" src="SRC" width="48" height="30"><img alt="Mastercard" src="SRC" width="48" height="30"></div>`;
  await test("r98e7t 'We accept' above the Visa / Mastercard logos fails (F5); on their line before Visa passes; a phone row too narrow for both is soft", async (page) => {
    const acc = { ...A.DEFAULTS, footerManageCookies: false };
    await load(page, foot(stacked), "/", { "/visa.png": { type: "image/png", body: studio } });
    const bad = (await A.footer(page, acc)).filter((o) => o.id === "F5");
    assert.equal(bad.filter((o) => !o.soft).length, 1, show(bad));
    assert.match(bad[0].what, /"We accept" sits above the payment logos/);
    await load(page, foot(inline), "/", { "/visa.png": { type: "image/png", body: studio } });
    assert.deepEqual((await A.footer(page, acc)).filter((o) => o.id === "F5"), []);
    await load(page, foot(`<div style="width:90px"><p style="margin:0">We accept</p><img alt="Visa" src="SRC" width="48" height="30"><img alt="Mastercard" src="SRC" width="48" height="30"></div>`), "/", { "/visa.png": { type: "image/png", body: studio } });
    const narrow = (await A.footer(page, acc)).filter((o) => o.id === "F5");
    assert.ok(narrow.length && narrow.every((o) => o.soft), show(narrow));
  });
  await test("cnfovs the Visa mark is the legacy file, not the studio's (F5); the studio file — also behind /_next/image — passes", async (page) => {
    await load(page, foot(inline), "/", { "/visa.png": { type: "image/png", body: legacy } });
    const bad = await need(A.paymentLogoFiles)(page, A.DEFAULTS);
    assert.ok(bad.length >= 1 && /not the studio's standard file/.test(bad[0].what), show(bad));
    await load(page, foot(inline, "/_next/image?url=%2Fvisa.png&w=96&q=75"), "/", { "/visa.png": { type: "image/png", body: studio }, "/_next/image": { type: "image/png", body: legacy } });
    assert.deepEqual(await A.paymentLogoFiles(page, A.DEFAULTS), []);
    assert.deepEqual(await A.paymentLogoFiles(page, { ...A.DEFAULTS, paymentLogoSet: false }), []);
  });

  /* ═════ A4 sign out lands on the home page (Compass 3v77n0) ═════ */
  const authSite = (to) => ({
    "/dashboard": (req, res) => { const on = /sess=1/.test(req.headers.cookie || ""); res.writeHead(200, { "content-type": "text/html" }); res.end(on ? doc(`<header><a href="/">Compass</a><a href="/logout">Sign out</a></header><main><h1>Dashboard</h1></main>`) : doc(`<main><h1>Sign in</h1><input type="email"><input type="password"></main>`)); },
    "/logout": (req, res) => { res.writeHead(302, { location: to, "set-cookie": "sess=; Max-Age=0; Path=/" }); res.end(); },
    "/login": doc(`<main><h1>Sign in</h1><input type="email"><input type="password"></main>`),
    "/": doc(`<main><h1>Compass</h1></main>`),
  });
  await test("3v77n0 Sign out lands on /login (A4); landing on / passes; acceptance.afterSignOut: '/login' is the owner's choice", async (page, ctx) => {
    for (const [to, want, n] of [["/login", "/", 1], ["/", "/", 0], ["/login", "/login", 0]]) {
      site = authSite(to);
      await ctx.addCookies([{ name: "sess", value: "1", url: ORIGIN }]);
      await page.goto(ORIGIN + "/dashboard");
      await c.install(page);
      const out = (await A.signOutOnce(page, { home: "/dashboard", afterSignOut: want })).filter((o) => /lands on/.test(o.what));
      assert.equal(out.length, n, `${to} / ${want}: ${show(out)}`);
    }
  });

  /* ═════ M2 the signed-in header shows the balance (Compass gcrh4v) ═════ */
  await test("gcrh4v signed-in header with the avatar only fails (M2); '6,000 credits' in the header passes", async (page) => {
    await load(page, doc(`<header style="display:flex;gap:12px"><a href="/">Compass</a><button aria-label="Account menu">AK</button></header><main><h1>Wallet</h1><p>Balance 6,000 credits</p></main>`), "/dashboard");
    assert.equal((await need(A.headerBalance)(page)).length, 1);
    await load(page, doc(`<header style="display:flex;gap:12px"><a href="/">Compass</a><span>6,000 credits</span><button aria-label="Account menu">AK</button></header><main><h1>Wallet</h1></main>`), "/dashboard");
    assert.deepEqual(await A.headerBalance(page), []);
  });

  /* ═════ LS1 the language switcher switches (Compass htmhfi) ═════ */
  await test("htmhfi choosing AZ in the switcher changes nothing → LS1; a switcher that switches (localStorage + text) passes; a repo-only language stays a note", async () => {
    const page0 = (works) => doc(`<header><nav><button data-l="en">EN</button><button data-l="az">AZ</button></nav></header><main><h1 id="h">Find a specialist for your task</h1><p id="p">Every brief is matched with a vetted specialist within one day, with clear prices in credits.</p></main>`, { script: works ? `const T = { az: ["Tapşırığınız üçün mütəxəssis tapın", "Hər brif bir gün ərzində yoxlanılmış mütəxəssislə uyğunlaşdırılır, kreditlərlə aydın qiymətlər."] }; const set = (l) => { if (T[l]) { document.getElementById("h").textContent = T[l][0]; document.getElementById("p").textContent = T[l][1]; document.documentElement.lang = l; } }; set(localStorage.getItem("site-lang")); for (const b of document.querySelectorAll("[data-l]")) b.onclick = () => { localStorage.setItem("site-lang", b.dataset.l); set(b.dataset.l); };` : `for (const b of document.querySelectorAll("[data-l]")) b.onclick = () => {};` });
    site = { "/": page0(false) };
    const bad = await detectLocales(browser, ORIGIN, {});
    const ls = need(A.switcherLocales)(bad);
    assert.equal(ls.length, 1, show(bad));
    assert.match(ls[0].what, /choosing "AZ" in the language switcher leaves the page in en/);
    site = { "/": page0(true) };
    const good = await detectLocales(browser, ORIGIN, {});
    assert.deepEqual(A.switcherLocales(good), [], show(good));
    assert.deepEqual(A.switcherLocales({ default: "en", locales: [{ code: "en", default: true }, { code: "kk", verified: false, why: "x" }] }), [], "not offered by the site");
  });

  /* ═════ C1 Manage on the banner when the site has a settings window (Compass y28qwn); C2 Allow all (faefuc) ═════ */
  const banner = (buttons, text = "We only use the cookies needed to sign you in and to remember your currency. There are no analytics or advertising cookies.") => `<div class="cookie-banner" role="region" aria-label="Cookies" style="position:fixed;bottom:0;left:0;right:0;padding:12px;background:#eee"><p>${text}</p>${buttons}</div>`;
  const settingsDialog = `<div id="cs" role="dialog" hidden><h2>Cookie settings</h2><label><input type="checkbox" checked disabled> Necessary</label><button>Save</button></div>`;
  const okScript = `document.querySelectorAll(".cookie-banner button").forEach((b) => b.onclick = () => { localStorage.setItem("consent", "ok"); document.querySelector(".cookie-banner").remove(); }); const m = document.getElementById("manage"); if (m) m.onclick = () => { const d = document.getElementById("cs"); if (d) d.hidden = false; else document.body.insertAdjacentHTML("beforeend", ${JSON.stringify(banner("<button>OK</button>"))}); };`;
  await test("y28qwn banner with only OK while the footer's 'Manage cookies' opens a settings window → C1; Kindred: the footer link reopens the same notice → quiet", async (page) => {
    await load(page, doc(`<main><h1>Compass</h1></main><footer><button id="manage">Manage cookies</button></footer>${settingsDialog}${banner("<button>OK</button>")}`, { script: okScript }));
    const bad = (await A.cookieConsent(page, { acc: A.DEFAULTS })).filter((o) => o.id === "C1");
    assert.equal(bad.length, 1, show(bad));
    assert.match(bad[0].what, /offers only "OK", while "Manage cookies" in the footer opens cookie settings/);
    await load(page, doc(`<main><h1>Kindred</h1></main><footer><button id="manage">Manage cookies</button></footer>${banner("<button>OK</button>")}`, { script: okScript }));
    assert.deepEqual(await A.cookieConsent(page, { acc: A.DEFAULTS }), []);
  });
  await test("faefuc 'We use no analytics, advertising or tracking cookies' + 'Essential only' / 'Allow all' → C2; a banner naming Analytics whose Allow all sets _ga stays quiet", async (page) => {
    const allow = (text, setCookie) => doc(`<main><h1>Compass</h1></main>${banner(`<button>Essential only</button><button id="all">Allow all</button>`, text)}`, { script: `document.getElementById("all").onclick = () => { ${setCookie ? 'document.cookie = "_ga=GA1.1.1; path=/";' : ""} localStorage.setItem("consent", "all"); document.querySelector(".cookie-banner").remove(); };` });
    await load(page, allow("Compass sets only strictly necessary cookies. We use no analytics, advertising or tracking cookies.", false));
    const bad = await need(A.allowAllNothingOptional)(page, { acc: A.DEFAULTS });
    assert.equal(bad.length, 1, show(bad));
    assert.match(bad[0].what, /"Allow all" allows nothing/);
    await load(page, allow("We use analytics cookies to understand how the site is used.", true));
    assert.deepEqual(await A.allowAllNothingOptional(page, { acc: A.DEFAULTS }), []);
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error(`misses-550-money: ${failed} failed`); process.exit(1); }
console.log("misses-550-money: all passed");
