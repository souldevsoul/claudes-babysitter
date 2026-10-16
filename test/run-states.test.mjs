// RUN area: checks driven into states (dialogs, empty submit, wizard steps, pagination) and the 3.8 scroll checks
// (client-side navigation, #anchor links) — each with a true positive and a false positive, on a local server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";
import * as run from "../playwright/checks/run.js";

const FX = join(dirname(fileURLToPath(import.meta.url)), "fixtures/run");
const posts = [];
const srv = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method !== "GET") posts.push(`${req.method} ${u.pathname}`);
  let body;
  if (u.pathname.startsWith("/spa")) body = readFileSync(join(FX, "nav.html"), "utf8").replace("__RESET__", u.searchParams.get("reset") === "1" ? "true" : "false").replaceAll("__PM__", u.searchParams.get("pm") === "1" ? 'style="scroll-margin-top:80px"' : "");
  else if (/^\/[\w-]+\.html$/.test(u.pathname)) body = readFileSync(join(FX, u.pathname.slice(1)), "utf8");
  else { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
async function t(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
async function fresh(url, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  await checks.install(page);
  await page.goto(BASE + url, { waitUntil: "load" });
  await page.waitForTimeout(200);
  return { page, ctx, reload: async () => { await page.goto(BASE + url, { waitUntil: "load" }); await page.waitForTimeout(200); } };
}
const show = (r) => JSON.stringify(r.findings.map((f) => f.what), null, 1);
try {
  await t("states TP: dialog content escaping the dialog, a missing eye in the Change password dialog, an unseparated total in the top-up step, a wide button after an empty submit, the error above the screen, a page of results that starts above the screen", async () => {
    const { page, ctx, reload } = await fresh("/states-bad.html");
    const r = await run.stateChecks(page, { reload });
    const w = r.findings.map((f) => f.what);
    const has = (re, msg) => assert.ok(w.some((x) => re.test(x)), `${msg}\n${show(r)}`);
    has(/after opening "Change password": .*sticks out of its card|after opening "Change password": .*cut off/, "button wider than the dialog");
    has(/after opening "Change password": password field "Repeat password" has no show\/hide eye/, "A1 inside the dialog");
    has(/after opening "Add credits": wizard step 2 \(after "Continue"\): "12100 credits" needs a thousands separator/, "B4 in the top-up step");
    assert.ok(r.findings.some((f) => /after submitting "Send message" empty: sticks out of its card/.test(f.what) && /Write another message/.test(f.where)), `button escaping its card after the empty submit\n${show(r)}`);
    has(/the first error: it starts .* above the screen/, "error above the screen");
    has(/after the pagination "2" the new page of results: (it starts .* above the screen|its top is \d+px under the sticky header)/, "pagination keeps the reader at the bottom");
    const paid = await page.evaluate(() => window.__paid).catch(() => false);
    assert.equal(paid, false, "Pay now was pressed");
    assert.deepEqual(posts, [], "a non-GET request reached the server");
    assert.ok(r.states.some((s) => /opened "Add credits"/.test(s)), JSON.stringify(r.states));
    await ctx.close();
  });
  await t("states FP: a fitting dialog, an eye per field, a separated total, an error next to its field, pagination that scrolls the list into view → nothing", async () => {
    const { page, ctx, reload } = await fresh("/states-ok.html");
    const r = await run.stateChecks(page, { reload });
    assert.deepEqual(r.findings.map((f) => f.what), []);
    assert.equal(await page.evaluate(() => window.__paid).catch(() => false), false);
    assert.ok(r.states.length >= 3, JSON.stringify(r.states));
    await ctx.close();
  });
  await t("wizard TP: after Next the reader is left 1500 px down while step 2 starts above the screen; the final \"Submit application\" is never pressed", async () => {
    const { page, ctx, reload } = await fresh("/wizard.html#noscroll", 390);
    const r = await run.stateChecks(page, { reload });
    const w = r.findings.map((f) => f.what);
    assert.ok(w.some((x) => /after "Next" the next step: it starts .* above the screen/.test(x)), show(r));
    assert.ok(w.some((x) => /wizard step 2 \(after "Next"\): "1500 credits"/.test(x)), show(r));
    assert.ok(r.states.some((s) => /wizard: 2 step\(s\) \(the next press would be final \("Submit application"\)/.test(s)), JSON.stringify(r.states));
    assert.equal(await page.evaluate(() => window.__final), false);
    await ctx.close();
  });
  await t("wizard FP: a wizard that scrolls each step into view below the sticky header has no 4.4 finding", async () => {
    const { page, ctx, reload } = await fresh("/wizard.html", 390);
    const r = await run.stateChecks(page, { reload });
    assert.ok(!r.findings.some((f) => /4\.4/.test(f.what)), show(r));
    await ctx.close();
  });
  await t("3.8 TP: client-side navigation that keeps the scroll position is reported", async () => {
    const { page, ctx } = await fresh("/spa/home?reset=0");
    const out = await run.scrollAfterNavigation(page);
    assert.ok(out.some((f) => /opens scrolled \d+px down/.test(f.what)), JSON.stringify(out));
    await ctx.close();
  });
  await t("3.8 FP: client-side navigation that scrolls to the top passes", async () => {
    const { page, ctx } = await fresh("/spa/home?reset=1");
    assert.deepEqual(await run.scrollAfterNavigation(page), []);
    await ctx.close();
  });
  await t("3.8 TP: #anchor targets hidden under a 64 px sticky header are reported", async () => {
    const { page, ctx } = await fresh("/spa/home?reset=1");
    const out = await run.anchorTargets(page);
    assert.equal(out.length, 2, JSON.stringify(out));
    assert.match(out[0].what, /under the sticky header .* scroll-margin-top/);
    await ctx.close();
  });
  await t("3.8 FP: targets with scroll-margin-top pass", async () => {
    const { page, ctx } = await fresh("/spa/home?reset=1&pm=1");
    assert.deepEqual(await run.anchorTargets(page), []);
    await ctx.close();
  });
  await t("untranslated: identical multi-word strings are reported; brand words, codes, emails, numbers, lang-tagged and kept strings are not", async () => {
    const def = ["Find a specialist for your task", "Praxis", "USD EUR", "support@praxis.ai", "1,200 credits", "Hire the best people", "Sign in"].map((text) => ({ text }));
    const az = [
      { text: "Find a specialist for your task", where: "h1" },
      { text: "Praxis", where: "logo" },
      { text: "USD EUR", where: "x" },
      { text: "support@praxis.ai", where: "x" },
      { text: "1,200 credits", where: "x" },
      { text: "Hire the best people", where: "q", ownLang: "en" },
      { text: "Sign in", where: "b" },
      { text: "Mütəxəssis tapın", where: "p" },
    ];
    const out = run.untranslated(az, def, "az", []);
    assert.deepEqual(out.map((o) => o.where), ["h1"], JSON.stringify(out));
    assert.equal(run.untranslated(az, def, "az", ["Find a specialist for your task"]).length, 0);
  });
} finally {
  await browser.close();
  srv.close();
}
if (failed) { console.error(`run-states: ${failed} failed`); process.exit(1); }
console.log("run-states: all passed");
