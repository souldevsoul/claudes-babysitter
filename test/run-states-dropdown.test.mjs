// 1.2 — a dropdown near the bottom of the screen opens upwards (or fits); an inner scroll that hides options while the
// list would fit above does not pass (Praxis card #231: category list at 360 px).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";

const FX = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/run/dropdown-flip.html"), "utf8");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
async function t(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
await checks.install(page);
const run = async (top, n, mode) => { await page.goto("data:text/html," + encodeURIComponent(FX.replace("__TOP__", top).replace("__N__", n).replace("__MODE__", mode))); return (await checks.interactiveStates(page)).filter((f) => /hides .* behind an inner scroll/.test(f.what)); };
try {
  await t("TP: 8 options opened downward 150 px above the bottom, scrolling inside, with 700 px free above → reported", async () => {
    const out = await run(710, 8, "down");
    assert.equal(out.length, 1, JSON.stringify(out));
    assert.match(out[0].what, /open listbox opens downward/);
  });
  await t("FP: the same list opened upwards → not reported", async () => { assert.deepEqual(await run(710, 8, "up"), []); });
  await t("FP: a trigger near the top whose list fits below → not reported", async () => { assert.deepEqual(await run(60, 8, "down"), []); });
  await t("FP: a 40-option list too long for either side may scroll → not reported", async () => { assert.deepEqual(await run(710, 40, "down"), []); });
} finally { await browser.close(); }
if (failed) { console.error(`run-states-dropdown: ${failed} failed`); process.exit(1); }
console.log("run-states-dropdown: all passed");
