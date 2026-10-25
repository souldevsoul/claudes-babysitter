// 5.6.0 — four false alarms found while checking the express run on a real product, each pinned with its fixture page:
// the false alarm stays gone AND the real defect next to it still fires.
//   • 2.14 an icon in a scrolling list of a rounded menu sheet is scrolled to, not cut;
//   • 1.3/1.16 a bare field inside its pill (a chat composer) is measured as the pill;
//   • 2.22 a card beside a column of cards lines up by the box tops (a hidden heading first in the column);
//   • 6.12 a word typed and erased on its own is never what a click showed or hid;
//   • FM4 a success message that fades in is measured once it is in, not through its opacity.
// RUN: node test/fp-560.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import * as B from "../playwright/checks/boxes.js";
import * as Rh from "../playwright/checks/rhythm.js";
import * as Fm from "../playwright/checks/forms.js";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const url = (name) => pathToFileURL(join(here, "fixtures", "runtime", name)).href;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let failed = 0;
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } finally { await ctx.close(); }
}

try {
  await test("2.14: the icon of a row below the fold of a menu's scrolling list is not cut; an icon cut by a plain clipping box still is", async (page) => {
    await page.goto(url("fp-560.html"));
    const out = await B.iconClipped(page);
    const sel = out.map((f) => `${f.selector} ${f.where}`).join("\n");
    assert.ok(!/scrolled-icon|signout/.test(sel), `the scrolled row is not a finding: ${sel}`);
    assert.ok(/cut-icon|clip/.test(sel), `the icon cut by the plain box still is: ${sel}`);
  });

  await test("1.3/1.16: a bare field inside its 48px pill is the pill — 48px tall, fully round — not a 40px square box", async (page) => {
    await page.goto(url("fp-560.html"));
    const sigs = (await c.collectSignatures(page, "/")).filter((s) => s.kind === "input");
    const bare = sigs.find((s) => /bare/.test(`${s.selector} ${s.where}`));
    assert.ok(bare, `the field is measured: ${JSON.stringify(sigs)}`);
    assert.equal(bare.height, 48, JSON.stringify(bare));
    assert.ok(bare.radius >= 999, JSON.stringify(bare));
  });

  await test("2.22: a card beside a column of cards (a hidden heading first) lines up by the box tops; the column 50px lower still fails", async (page) => {
    await page.goto(url("fp-560.html"));
    const { hard } = await Rh.twoColumnRule(page);
    const at = (id) => hard.filter((f) => new RegExp(id).test(`${f.where} ${f.selector}`));
    assert.equal(hard.length, 1, `one finding, the offset block: ${JSON.stringify(hard)}`);
    assert.equal(at("aligned").length, 0, JSON.stringify(hard));
  }, { width: 1280, height: 900 });

  await test("6.12: a word typed and erased on its own is not 'hidden in one frame' by a click; the panel the click shows with no motion still is", async (page) => {
    // four rounds: the word blinks every 90 ms, so in some round the click's watch starts and ends on different words
    const u = url("typewriter.html");
    for (let k = 0; k < 4; k++) {
      await page.goto(u);
      await page.waitForTimeout(600);
      const r = await c.interactionMotion(page, { reload: () => page.goto(u) });
      const all = [...r.hard, ...r.soft].map((f) => `${f.what} ${f.where}`).join("\n");
      assert.ok(!/#word|Bonjour|h1 > span/.test(all), `round ${k + 1}: the typed word is never the click's: ${all}`);
      assert.ok(r.hard.some((f) => /#panel|Details/.test(f.what)), `round ${k + 1}: the panel shown in one frame is: ${all}`);
    }
  });
  await test("FM4: a success message that fades in for 200 ms is read once it is in (dark on pale green passes); pale grey text still fails", async (page) => {
    const form = (color) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Profile</title><style>
      body{font:16px Arial;margin:40px;background:#fff;color:#0a0a0b} @keyframes enter{from{opacity:0;transform:translateY(6px)}}
      .ok{animation:enter .2s ease-out both;background:rgba(24,109,69,.1);padding:12px;border-radius:16px;color:${color}}
      label{display:block} input{height:48px;border:1px solid #888;border-radius:999px;padding:0 20px}</style></head><body><main>
      <h1>Settings</h1><form id="profile" aria-label="Profile"><label for="name">Full name</label><input id="name" name="name" autocomplete="name">
      <button type="submit">Save changes</button><div id="note"></div></form>
      <script>document.getElementById("profile").addEventListener("submit", async (e) => { e.preventDefault();
        const r = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: document.getElementById("name").value }) });
        document.getElementById("note").innerHTML = r.ok ? '<p role="status" class="ok"><span>Your changes are saved.</span></p>' : '<p role="alert" style="color:#b91c1c">The changes were not saved. Please try again.</p>'; });</script></main></body></html>`;
    let html = form("#0a0a0b");
    const server = createServer((req, res) => { if (req.url.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; } res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const at = `http://127.0.0.1:${server.address().port}/settings`;
      await page.goto(at);
      const good = (await Fm.submitOutcomes(page)).filter((f) => f.id === "FM4" && /success message/.test(f.what));
      assert.deepEqual(good, [], `dark text on pale green, faded in: ${JSON.stringify(good)}`);
      html = form("#a3a3a3");
      await page.goto(at);
      const bad = (await Fm.submitOutcomes(page)).filter((f) => f.id === "FM4" && /success message/.test(f.what));
      assert.equal(bad.length, 1, `pale grey on pale green still fails: ${JSON.stringify(bad)}`);
    } finally { server.close(); }
  });
} finally {
  await browser.close();
}
console.log(failed ? `fp-560: ${failed} failed` : "fp-560: all passed");
process.exit(failed ? 1 : 0);
