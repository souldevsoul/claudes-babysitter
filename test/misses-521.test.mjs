// 5.2.1 — the miss loop, second pass: once souldevsoul/nexus#1 was deployed, Nexus listed every card (not only those
// with a severity) and 56 more cards of the round became visible (misses/praxis-2026-10-20.md,
// misses/parallel-2026-10-20.md). The in-scope ones that a small check can catch are pinned here, each with the defect
// as it shipped ("bad"), the fix ("good") and look-alikes that must stay quiet.
// The checks live in playwright/checks/details.js, loaded with a guarded import: on 5.2.0 it does not exist, so every
// bad page passes there (run this file in a v5.2.0 worktree to see it). RUN: node test/misses-521.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";

const opt = async (path) => { try { return await import(path); } catch { return {}; } };
const D = await opt("../playwright/checks/details.js");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

let site = { "/": "" };
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(site[u.pathname] ?? "<!doctype html><title>other</title><h1>Other</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial;background:#fff;color:#111}${head}</style></head><body>${body}</body></html>`;
async function load(page, html) { site = { "/": html }; await page.goto(ORIGIN + "/", { waitUntil: "load" }); await page.waitForTimeout(100); }
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 5).join("\n    ")}`); } finally { await ctx.close(); }
}
const need = (fn) => { assert.ok(fn, "the check does not exist in this version"); return fn; };
const ids = (list, id) => list.filter((f) => `${f.selector || ""} ${f.where || ""}`.includes(id));

try {
  /* ═══════════ 2.15 a shadow cut off by a box that clips (Praxis 4tzjjnds, /dashboard) ═══════════ */
  const SH = "box-shadow:0 25px 50px -12px rgba(0,0,0,.25);border:1px solid #ddd;border-radius:12px;background:#fff;padding:16px;height:120px";
  const grid = (wrap, card = SH) => `<main style="padding:40px"><div style="${wrap}"><div style="display:grid;grid-template-columns:1fr 1fr;gap:24px"><div class="tile" id="t1" style="${card}">Credits spent</div><div class="tile" id="t2" style="${card}">Wallet balance</div><div class="tile" id="t3" style="${card}">All tasks</div><div class="tile" id="t4" style="${card}">Quick actions</div></div></div></main>`;
  await test("4tzjjnds dashboard tiles: the bottom row's shadow is cut by the overflow-hidden page column; with room below it passes", async (page) => {
    const check = need(D.shadowClipped);
    await load(page, doc(grid("max-width:900px;margin:auto;padding:0 16px;overflow:hidden")));
    const bad = (await check(page)).hard;
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(ids(bad, "t3").length && /bottom/.test(bad[0].what) && /1 more/.test(bad[0].what), "one finding for the bottom row, grouped");
    await load(page, doc(grid("max-width:900px;margin:auto;padding:0 16px 64px;overflow:hidden")));
    assert.deepEqual((await check(page)).hard, []);
    await load(page, doc(grid("max-width:900px;margin:auto;padding:0 16px")));
    assert.deepEqual((await check(page)).hard, [], "no clipping box, nothing to report");
  });
  await test("2.15 look-alikes: a card that fills its clipping frame (shadow hidden on every side), a real horizontal scroller, a small shadow", async (page) => {
    const check = need(D.shadowClipped);
    await load(page, doc(`<div style="width:300px;margin:40px;overflow:hidden;border-radius:12px"><div id="fill" style="${SH};margin:0">Card</div></div>`));
    assert.deepEqual((await check(page)).hard, [], "a shadow cut on every side is not visible at all");
    await load(page, doc(`<div id="track" style="width:500px;margin:40px;overflow-x:auto;display:flex;gap:16px;padding:4px 4px 48px">${Array.from({ length: 8 }, (_, i) => `<div style="${SH};flex:0 0 200px">Slide ${i}</div>`).join("")}</div>`));
    assert.deepEqual((await check(page)).hard, [], "a scroller that scrolls sideways, with room below for the shadow: its cards pass under the side edges on purpose");
    await load(page, doc(`<div style="width:500px;margin:40px;overflow-x:auto;display:flex;gap:16px;padding:4px">${Array.from({ length: 8 }, (_, i) => `<div style="${SH};flex:0 0 200px">Slide ${i}</div>`).join("")}</div>`));
    assert.equal((await check(page)).hard.length, 1, "the same scroller without room below: overflow-x auto makes overflow-y auto, which clips the shadow under every card (one finding, grouped)");
    await load(page, doc(grid("max-width:900px;margin:auto;padding:0 16px;overflow:hidden", "box-shadow:0 1px 3px rgba(0,0,0,.1);border:1px solid #ddd;padding:16px;height:120px")));
    const r = await check(page);
    assert.deepEqual(r.hard, [], "a 1–3px shadow cut is not hard");
  });

  /* ═══════════ 2.16 a pinned panel whose scroll box ends below the screen (Praxis bq9a2b, /specialists) ═══════════ */
  const areas = Array.from({ length: 15 }, (_, i) => `<li><button style="display:flex;width:100%;height:36px;margin:2px 0;justify-content:space-between">Area ${i + 1}<span>${i + 2}</span></button></li>`).join("");
  const aside = (headH) => `<div style="display:grid;grid-template-columns:260px 1fr;gap:48px;padding:0 40px"><aside id="side" style="position:sticky;top:96px;align-self:start"><div style="height:${headH}px"><p>SPECIALISTS</p><h1>Specialists</h1><p>15 profiles</p></div><nav id="areas" style="max-height:calc(100vh - 352px);overflow-y:auto"><ul style="list-style:none;margin:0;padding:0">${areas}</ul></nav></aside><div style="height:3000px">results</div></div>`;
  await test("bq9a2b specialists sidebar: the sticky aside's list ends below the screen while pinned; a shorter header fits", async (page) => {
    const check = need(D.stuckScrollPastScreen);
    await load(page, doc(aside(400)));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(ids(bad, "areas").length && /below the bottom of the screen/.test(bad[0].what));
    await load(page, doc(aside(200)));
    assert.deepEqual(await check(page), []);
  });
  await test("2.16 look-alikes: a sticky panel that never sticks (no taller container), a fixed drawer that fits, a list that does not overflow", async (page) => {
    const check = need(D.stuckScrollPastScreen);
    await load(page, doc(`<div><aside style="position:sticky;top:96px"><div style="height:400px">head</div><nav style="max-height:calc(100vh - 352px);overflow-y:auto"><ul>${areas}</ul></nav></aside></div>`));
    assert.deepEqual(await check(page), [], "its container is the panel: it never pins");
    await load(page, doc(`<div role="dialog" style="position:fixed;top:0;right:0;bottom:0;width:320px;background:#fff;display:flex;flex-direction:column"><h2>Task details</h2><div id="body" style="flex:1;min-height:0;overflow-y:auto">${"<p>Line of task detail text.</p>".repeat(60)}</div></div>`));
    assert.deepEqual(await check(page), [], "a fixed drawer whose scroll box ends at the screen bottom");
    await load(page, doc(`<div style="display:grid;grid-template-columns:260px 1fr"><aside style="position:sticky;top:96px;align-self:start"><div style="height:600px">head</div><nav style="max-height:400px;overflow-y:auto"><ul><li>One</li><li>Two</li></ul></nav></aside><div style="height:3000px"></div></div>`));
    assert.deepEqual(await check(page), [], "nothing hidden in the box: nothing unreachable");
  });

  /* ═══════════ 6.13 a link in a sentence marked by colour alone (Praxis 47lv7o, cookie banner) ═══════════ */
  const banner = (link) => `<div style="position:fixed;bottom:12px;left:12px;right:12px;padding:12px;border-radius:12px;background:#f3f4f6"><p id="bn" style="color:#6b7280;font-size:14px">We use necessary cookies to keep you signed in and to remember your language. Read the <a id="cp" href="/cookies" style="${link}">Cookie Policy</a> for the list.</p><button>Accept</button></div>`;
  await test("47lv7o cookie banner: 'Cookie Policy' told apart from the sentence by colour only (≈2:1); underlined it passes", async (page) => {
    const check = need(D.colourOnlyLinks);
    await load(page, doc(banner("color:#374151;text-decoration:none")));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(ids(bad, "cp").length && /only its colour/.test(bad[0].what));
    await load(page, doc(banner("color:#374151;text-decoration:underline;text-underline-offset:2px")));
    assert.deepEqual(await check(page), []);
  });
  await test("6.13 look-alikes: footer link columns, a nav, a button-like link, a link with 3:1+ against the text, a bold link, a footer brand name (inline-flex) beside its tagline", async (page) => {
    const check = need(D.colourOnlyLinks);
    await load(page, doc(`<footer><ul style="list-style:none"><li><a href="/terms" style="color:#374151;text-decoration:none">Terms of Service</a></li><li><a href="/privacy" style="color:#374151;text-decoration:none">Privacy Policy</a></li></ul><p style="color:#6b7280">© 2026 Example Ltd. All rights reserved worldwide. <a href="/legal" style="color:#6b7280;text-decoration:none">Legal</a></p></footer>
      <nav><p style="color:#6b7280">Browse by the area you need help with today: <a href="/a" style="color:#374151;text-decoration:none">Design</a></p></nav>
      <p style="color:#6b7280">Ready to start your first task with a specialist? <a href="/go" style="display:inline-block;padding:8px 16px;background:#111;color:#fff;text-decoration:none;border-radius:8px">Get started</a></p>
      <p style="color:#111">Read the full terms that apply to every task you post here: <a href="/t" style="color:#2563eb;text-decoration:none">Terms</a></p>
      <p style="color:#6b7280">Read the full terms that apply to every task you post here: <a href="/t2" style="color:#374151;text-decoration:none;font-weight:700">Terms</a></p>
      <div style="color:#6b7280"><a href="/" style="display:inline-flex;align-items:center;gap:8px;color:#374151;text-decoration:none;font-size:20px">Deskhand</a> The work desk for small teams who hire help by the task.</div>`));
    const r = await check(page);
    // the © line's "Legal" link is the same colour as its text (1:1): that one IS colour-less — it must be reported
    assert.equal(r.length, 1, JSON.stringify(r));
    assert.ok(/Legal/.test(r[0].what), "only the link that nothing marks");
  });
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
