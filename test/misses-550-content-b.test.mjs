// 5.5.0 — copy rules from the miss loop (Parallel, Kindred, Compass): each card as it shipped ("bad" fails), the fix
// ("good" passes) and look-alikes that stay quiet. Rules: lib/copy-rules.js, lib/content-rules.js (CT3 score, CT8
// sentence capital + count placeholder), playwright/checks/copy.js (rendered), run.js measure() (every state).
// RUN: node test/misses-550-content-b.test.mjs (ONLY=regex) — launches chrome: run it under the browser lock.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import * as k from "../playwright/checks/content.js";
import * as cp from "../playwright/checks/copy.js";
import { measure, newIn } from "../playwright/checks/run.js";
import { lintContent } from "../lib/content-lint.js";
import { lintSegment } from "../lib/content-rules.js";
import { titleFindings, slugFindings, nearCopies, recordCopy, readCopyRegistry, numberingFindings, allZero, foreignBrandUrls, brandTokens, ownHosts } from "../lib/copy-rules.js";

let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const tmp = (p) => mkdtempSync(join(tmpdir(), `bs-550cb-${p}-`));
const put = (root, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); } };
const ids = (list, id) => list.filter((f) => f.id === id || new RegExp(`\\[${id.replace(".", "\\.")}\\]`).test(f.what || f.message || ""));

/* ───────── static (no browser) ───────── */
async function unit(name, fn) { if (only && !only.test(name)) return; try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } }
const staticRepo = async (files, cfg = {}) => { const r = tmp("st"); put(r, { "package.json": "{}", "babysitter.config.json": JSON.stringify(cfg), ...files }); spawnSync("git", ["init", "-q"], { cwd: r }); const res = await lintContent(r, { cfg }); rmSync(r, { recursive: true, force: true }); return res.problems; };

await unit("q0qz7n CT8 static: 'You have {minutes} minutes and {seconds} seconds' shows '1 minutes'; an ICU plural passes", async () => {
  const p = await staticRepo({ "messages/en.json": JSON.stringify({ quiz: { time: "You have {minutes} minutes and {seconds} seconds.", ok: "{minutes, plural, one {# minute} other {# minutes}} left", credits: "{count, plural, one {# credit} other {# credits}}" } }, null, 2) });
  const g = p.filter((x) => x.rule === "content/grammar");
  assert.equal(g.length, 1, JSON.stringify(g));
  assert.match(g[0].message, /quiz\.time.*"\{minutes\} minutes" shows "1 minutes"/);
  assert.deepEqual(lintSegment({ text: "Sie haben {minutes} Minuten", kind: "body", locale: "de" }, {}, { static: true }).filter((x) => x.id === "CT8"), [], "English only");
});
await unit("zrb0pz CT8: '…before you hire. browse the full chart.' — a sentence starts in lowercase; abbreviations, versions, domains pass", () => {
  const ct8 = (t) => lintSegment({ text: t, kind: "body", locale: "en" }, {}).filter((x) => x.id === "CT8" && /lowercase/.test(x.what));
  assert.equal(ct8("Nothing is charged before you hire. browse the full chart.").length, 1);
  for (const ok of ["Nothing is charged before you hire. Browse the full chart.", "Write to support@compass.ai or see e.g. the FAQ.", "Version 2.1 adds more.", "We use cookies. iPhone users see this.", "Step 1. pick a plan", "Prices vs. last year are lower."]) assert.deepEqual(ct8(ok), [], ok);
  assert.equal(ct8("Ничего не списывается. откройте таблицу.").length, 1, "Cyrillic too");
});
await unit("41j7mo CT3: 'proficiency 0.7029, Audio Synthesis (0.8963)' is a raw score; money, rates and table cells pass", () => {
  const ct3 = (t, extra = {}) => lintSegment({ text: t, kind: "body", locale: "en", ...extra }, {}).filter((x) => x.id === "CT3");
  assert.equal(ct3("Strong fit: proficiency 0.7029, Audio Synthesis (0.8963)").length, 1);
  for (const ok of ["Strong fit (90%)", "One credit is $0.112", "10 credits = $1 = €0.8909", "Accuracy 0.95"]) assert.deepEqual(ct3(ok), [], ok);
  assert.deepEqual(ct3("Accuracy 0.9512", { table: true }), [], "a table of measurements");
});
await unit("49kc72 CT12 static: <Link href={step.route}>{step.route}</Link> and <a>/pricing</a> are links labelled with their path", async () => {
  const p = await staticRepo({ "app/how-it-works/page.tsx": 'import Link from "next/link";\nexport default function P({ steps }) { return (<div>{steps.map((step) => <Link key={step.id} href={step.route}>{step.route}</Link>)}<a className="btn" href="/register">/register</a><Link href="/pricing">Pricing</Link></div>); }\n' });
  const x = p.filter((q) => q.id === "CT12");
  assert.equal(x.length, 2, JSON.stringify(p.map((q) => q.message)));
});
await unit("2b9nt9 CT25 static: the API docs call https://api.kindred.ai on a site that runs on kindred-soultosoul.vercel.app; github.com/kindred-labs, kindredcare.org, api.stripe.com pass; content.ownDomains accepts it", async () => {
  const files = { "app/docs/api/page.tsx": 'export default function P() { return (<pre><code>{"curl https://api.kindred.ai/v1/cases -H \\"Authorization: Bearer KEY\\""}</code></pre>); }\n', "messages/en.json": JSON.stringify({ sdk: "SDK: https://github.com/kindred-labs/sdk", quote: "We came from https://kindredcare.org", pay: "Stripe calls https://api.stripe.com/v1/charges" }) };
  const cfg = { name: "kindred", baseURL: "https://kindred-soultosoul.vercel.app" };
  let p = (await staticRepo(files, cfg)).filter((q) => q.id === "CT25");
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0].message, /api\.kindred\.ai/);
  p = (await staticRepo(files, { ...cfg, content: { ownDomains: ["kindred.ai"] } })).filter((q) => q.id === "CT25");
  assert.deepEqual(p, []);
  assert.deepEqual(foreignBrandUrls("https://kindred-soultosoul.vercel.app/api/v1/cases", { brands: brandTokens(cfg), own: ownHosts(cfg) }), []);
});
await unit("r7i2dc / ebev0t CT26 static: {match.serviceSlug} printed as text; an href / key with the slug passes", async () => {
  const p = (await staticRepo({ "app/request/page.tsx": 'export default function P({ match }) { return (<div><p className="meta">{match.serviceSlug}</p><a href={`/services/${match.serviceSlug}`} key={match.serviceSlug}>{serviceName(match.serviceSlug)}</a></div>); }\n' })).filter((q) => q.id === "CT26");
  assert.equal(p.length, 1, JSON.stringify(p));
});
await unit("bymtup / 853l4n 6.15: every page titled 'Compass'; /dashboard/tasks titled only the brand; template instances share a pattern", () => {
  const recs = [{ route: "/", title: "Compass" }, { route: "/pricing", title: "Compass" }, { route: "/about", title: "Compass" }, { route: "/dashboard/tasks", title: "Compass" }];
  const f = titleFindings(recs, { brands: ["Compass"] });
  assert.ok(f.some((x) => /4 pages share the title "Compass"/.test(x.what)), JSON.stringify(f));
  assert.ok(f.some((x) => /\/dashboard\/tasks is titled only "Compass"/.test(x.what)));
  assert.deepEqual(titleFindings([{ route: "/", title: "Compass" }, { route: "/pricing", title: "Pricing · Compass" }, { route: "/dashboard/tasks", title: "Tasks · Compass" }], { brands: ["Compass"] }), []);
  assert.deepEqual(titleFindings([{ route: "/specialists/a", template: "/specialists/[id]", title: "Specialist · Compass" }, { route: "/specialists/b", template: "/specialists/[id]", title: "Specialist · Compass" }], { brands: ["Compass"] }), [], "two instances of one dynamic route");
});
await unit("2hxrol P4: the Terms contents jump from 13 to 15 while the document has 14; a TOC of top-level sections over 3.1/3.2 passes", () => {
  const heads = ["12. Fees", "13. Specialists", "14. Language", "15. Contact"];
  const f = numberingFindings(heads, ["12. Fees", "13. Specialists", "15. Contact"]);
  assert.equal(f.length, 1); assert.match(f[0].what, /contents skip 14\. Language/);
  assert.deepEqual(numberingFindings(heads, heads), []);
  assert.deepEqual(numberingFindings(["1. Scope", "2. Fees", "2.1 Card", "2.2 Credits", "3. Contact"], ["1. Scope", "2. Fees", "3. Contact"]), []);
  assert.match(numberingFindings(["1. Scope", "2. Fees", "4. Contact"])[0].what, /jump from 2 to 4/);
});
await unit("4bw126 / 3eikk6 CT30: 36 services '0 profiles · 0 cr / hr · $0'; some non-zero passes", () => {
  const items = Array.from({ length: 6 }, (_, i) => `Service ${i} 0 profiles · 0 cr / hr · $0`);
  const f = allZero([{ where: "ul.services", items }], { stage: "test" });
  assert.equal(f.length, 1); assert.match(f[0].what, /every one of the 6 items shows 0 \(\$0, 0 profiles, 0 cr \/ hr\)/);
  assert.deepEqual(allZero([{ where: "ul", items: [...items.slice(0, 5), "Service 9 3 profiles · 40 cr / hr · $4"] }]), []);
});
await unit("brypwi CT24: /pricing 'Investment in Excellence' vs a sibling's 'Invest in Excellence' (registry); generic h1s and the product itself pass", () => {
  const file = join(tmp("reg"), "copy.json");
  recordCopy("threshold", [{ route: "/pricing", text: "Invest in Excellence" }, { route: "/contact", text: "Contact us" }], file);
  const reg = readCopyRegistry(file);
  const f = nearCopies([{ route: "/pricing", text: "Investment in Excellence" }, { route: "/contact", text: "Contact us" }], reg, "kindred");
  assert.equal(f.length, 1); assert.match(f[0].what, /near-copy of threshold's "Invest in Excellence"/);
  assert.deepEqual(nearCopies([{ route: "/pricing", text: "Connect with elite specialists" }], reg, "kindred"), []);
  assert.deepEqual(nearCopies([{ route: "/pricing", text: "Invest in Excellence" }], reg, "threshold"), [], "the same product");
});

await unit("CT24: a legal page's h1 carrying the brand ('Relaygpu Terms of Service') is still the generic page name, not a copy of a sibling's; a branded headline that is not generic still fires", () => {
  const file = join(tmp("reg"), "copy.json");
  recordCopy("kindred", [{ route: "/terms", text: "Kindred Terms of Service" }, { route: "/about", text: "Kindred Hire the best people" }], file);
  const reg = readCopyRegistry(file);
  assert.deepEqual(nearCopies([{ route: "/terms", text: "Relaygpu Terms of Service" }], reg, "relaygpu"), [],
    "both pages are called what the document is called");
  assert.deepEqual(nearCopies([{ route: "/terms", text: "RELAYGPU PRIVACY POLICY" }], reg, "relaygpu"), [],
    "the generic name is recognised under the brand whatever its case");
  recordCopy("deskhand", [{ route: "/how-it-works", text: "How it works" }], file);
  assert.deepEqual(nearCopies([{ route: "/how-it-works", text: "Relaygpu How it works" }], readCopyRegistry(file), "relaygpu"), [],
    "'How it works' is what the page is called, like Pricing or FAQ");
  const f = nearCopies([{ route: "/about", text: "Relaygpu Hire the best people" }], reg, "relaygpu");
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.match(f[0].what, /near-copy of kindred's/);
});

/* ───────── rendered ───────── */
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let site = { "/": "" };
const server = createServer((req, res) => { const u = new URL(req.url, "http://x"); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(site[u.pathname] ?? "<!doctype html><title>other</title><h1>Other</h1>"); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, { lang = "en", title = "Page" } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><style>body{margin:0;font:14px/1.4 Arial}</style></head><body><main>${body}</main></body></html>`;
async function load(page, html, path = "/") { site = { [path]: html }; await page.goto(ORIGIN + path, { waitUntil: "load" }); await page.waitForTimeout(50); }
async function test(name, fn) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } finally { await ctx.close(); }
}
const extras = (page, cfg = {}, o = {}) => cp.copyExtrasFindings(page, cfg, o);

try {
  await test("49kc72 CT12: How It Works buttons labelled '/pricing', '/register'; 'Pricing', github.com/acme and <code>/api/v1/tasks</code> pass", async (page) => {
    await load(page, doc('<a class="btn" href="/pricing">/pricing</a><a class="btn" href="/register">Step 2 · /register</a>'));
    assert.equal(ids(await extras(page), "CT12").length, 2);
    await load(page, doc('<a class="btn" href="/pricing">Pricing</a><a href="https://github.com/acme">github.com/acme</a><p>Call <code>/api/v1/tasks</code></p>'));
    assert.deepEqual(ids(await extras(page), "CT12"), []);
  });
  await test("2b9nt9 CT25: /docs/api shows curl https://api.kindred.ai/v1/cases on another host; the site's own host and third parties pass", async (page) => {
    const cfg = { name: "kindred" };
    await load(page, doc('<h1>API</h1><pre><code>curl https://api.kindred.ai/v1/cases -H "Authorization: Bearer KEY"</code></pre>'));
    const f = ids(await extras(page, cfg), "CT25");
    assert.equal(f.length, 1); assert.match(f[0].what, /api\.kindred\.ai/);
    await load(page, doc(`<pre><code>curl ${ORIGIN}/api/v1/cases</code></pre><a href="https://github.com/kindred-labs/sdk">SDK</a><p>From https://kindredcare.org and https://api.stripe.com/v1/charges</p>`));
    assert.deepEqual(ids(await extras(page, cfg), "CT25"), []);
  });
  await test("wee3g3 CT29: the account menu shows sara@gmail.com in capitals; normal-case beside an uppercase 'ACCOUNT' label passes", async (page) => {
    await load(page, doc('<div role="menu" style="text-transform:uppercase"><p>Sara</p><p id="m">sara@gmail.com</p></div>'));
    const f = ids(await extras(page), "CT29");
    assert.equal(f.length, 1); assert.match(f[0].what, /shown as "SARA@GMAIL\.COM"/);
    await load(page, doc('<div role="menu"><p style="text-transform:uppercase">Account</p><p style="text-transform:none">sara@gmail.com</p></div>'));
    assert.deepEqual(ids(await extras(page), "CT29"), []);
  });
  await test("2hxrol P4 rendered: Terms contents 12, 13, 15 over sections 12–15", async (page) => {
    const sec = (n, t) => `<h2 id="s${n}">${n}. ${t}</h2><p>Text.</p>`;
    await load(page, doc(`<nav><ol><li><a href="#s12">12. Fees</a></li><li><a href="#s13">13. Specialists</a></li><li><a href="#s15">15. Contact</a></li></ol></nav><article>${sec(12, "Fees")}${sec(13, "Specialists")}${sec(14, "Language")}${sec(15, "Contact")}</article>`));
    assert.equal(ids(await extras(page), "P4").length, 1);
    await load(page, doc(`<nav><ol><li><a href="#s12">12. Fees</a></li><li><a href="#s13">13. Specialists</a></li><li><a href="#s14">14. Language</a></li><li><a href="#s15">15. Contact</a></li></ol></nav><article>${sec(12, "Fees")}${sec(13, "Specialists")}${sec(14, "Language")}${sec(15, "Contact")}</article>`));
    assert.deepEqual(ids(await extras(page), "P4"), []);
  });
  await test("4bw126 / 3eikk6 CT30 rendered: a service index where every card shows '0 profiles · 0 cr / hr · $0'", async (page) => {
    const card = (n, p, r) => `<li class="card"><h3>Service ${n}</h3><p>${p} profiles · ${r} cr / hr · $${r}</p></li>`;
    await load(page, doc(`<ul>${[1, 2, 3, 4, 5].map((n) => card(n, 0, 0)).join("")}</ul>`));
    assert.equal(ids(await extras(page, {}, { stage: "test" }), "CT30").length, 1);
    await load(page, doc(`<ul>${[1, 2, 3, 4].map((n) => card(n, 0, 0)).join("")}${card(5, 3, 40)}</ul>`));
    assert.deepEqual(ids(await extras(page), "CT30"), []);
  });
  await test("33jce3 / 8t3qh1 CT28: 'Where Innovation Finds direction' mixes cases; 'Motion Graphics Ai' typed in a brief where the catalogue writes AI; brand and name headings pass", async (page) => {
    await load(page, doc('<h1>Where Innovation Finds direction</h1><p>We help teams turn innovation into work. Everyone finds a specialist fast.</p><ul><li>Motion Graphics AI</li><li>AI Video</li></ul><textarea id="b">I need help with Motion Graphics Ai: a 30 s loop.</textarea>'));
    const copy = await k.collectCopy(page);
    const f = ids(await extras(page, { name: "compass" }, { segs: copy.segs }), "CT28");
    assert.ok(f.some((x) => /mixes Title Case \("Innovation", "Finds"\) and sentence case \("direction"\)/.test(x.what)), JSON.stringify(f));
    assert.ok(f.some((x) => /"Ai" in "I need help with Motion Graphics Ai/.test(x.what)), JSON.stringify(f));
    await load(page, doc('<h1>Built for Compass teams</h1><h2>Pay with Visa or Mastercard</h2><h2>Hire a Python developer in Baku</h2><p>Teams pay with a card. We hire fast.</p><ul><li>Motion Graphics AI</li></ul><textarea>I need help with Motion Graphics AI</textarea>'));
    const copy2 = await k.collectCopy(page);
    assert.deepEqual(ids(await extras(page, { name: "compass" }, { segs: copy2.segs }), "CT28"), []);
  });
  await test("zrb0pz / 41j7mo rendered: '…hire. <a>browse the full chart.</a>' (CT8) and 'proficiency 0.7029' (CT3) on the page", async (page) => {
    await load(page, doc('<p id="a">Nothing is charged before you hire. <a href="/s">browse the full chart.</a></p><p id="b">Strong fit: proficiency 0.7029, Audio Synthesis (0.8963)</p><table><tr><th>Accuracy</th><td>0.9512</td></tr></table>'));
    const { hard } = await k.copyFindings(page, {});
    assert.ok(hard.some((x) => x.id === "CT8" && /"browse" starts a sentence in lowercase/.test(x.what)), JSON.stringify(hard));
    const ct3 = hard.filter((x) => x.id === "CT3");
    assert.equal(ct3.length, 1, JSON.stringify(ct3));
  });
  await test("r7i2dc / ebev0t CT26 site-wide: /request shows 'image-synthesis', 'generative-systems' while /tasks names them; 'state-of-the-art' and <code> pass", async (page) => {
    const recs = [];
    await load(page, doc('<h1>Request</h1><ul><li><span>language-generation</span></li><li><span>image-synthesis</span></li></ul><p>A state-of-the-art team. Run <code>npm run image-synthesis</code>.</p>'), "/request");
    recs.push({ ...k.pageRecord("/request", await k.collectCopy(page)), slugs: (await cp.copyExtrasData(page)).slugs });
    await load(page, doc('<h1>Tasks</h1><p>Image Synthesis · Language Generation</p>'), "/tasks");
    recs.push({ ...k.pageRecord("/tasks", await k.collectCopy(page)), slugs: (await cp.copyExtrasData(page)).slugs });
    const f = slugFindings(recs);
    assert.deepEqual(f.map((x) => x.what.match(/"([^"]+)"/)[1]).sort(), ["image-synthesis", "language-generation"], JSON.stringify(f));
    recs[1] = { ...recs[1], segs: [{ text: "Tasks" }] };
    assert.deepEqual(slugFindings(recs), [], "no named twin, fewer than 3 slugs: quiet");
  });
  await test("q0qz7n / 4ec28x / qt07nc every state: a quiz step 'You have 1 minutes' (CT8) and English skill tags on a kk step (CT11) are reported by measure() when the step appears", async (page) => {
    const html = (lang, step) => doc(`<h1>${lang === "kk" ? "Тіркелу" : "Onboarding"}</h1><p>${lang === "kk" ? "Дағдыларыңызды таңдаңыз, біз сізге сәйкес тапсырмаларды табамыз." : "Pick your skills and we find tasks for you."}</p>${step}`, { lang });
    await load(page, html("en", ""));
    let base = await measure(page, { cfg: {} });
    await page.evaluate(() => { document.querySelector("main").insertAdjacentHTML("beforeend", "<section><h2>Skills check</h2><p>You have 1 minutes and 30 seconds.</p></section>"); });
    let add = newIn(base, await measure(page, { cfg: {} }));
    assert.ok(add.some((x) => x.check === "CT8" && /1 minutes/.test(x.what)), JSON.stringify(add.map((x) => x.what)));
    await load(page, html("kk", ""));
    base = await measure(page, { cfg: {} });
    await page.evaluate(() => { document.querySelector("main").insertAdjacentHTML("beforeend", "<section><h2>2-қадам</h2><ul><li>Machine Learning and Deep Learning for production systems</li><li>Natural Language Processing with modern transformers</li></ul></section>"); });
    add = newIn(base, await measure(page, { cfg: {} }));
    assert.ok(add.some((x) => x.check === "CT11"), JSON.stringify(add.map((x) => x.what)));
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error(`misses-550-content-b: ${failed} failed`); process.exit(1); }
console.log("misses-550-content-b: all passed");
