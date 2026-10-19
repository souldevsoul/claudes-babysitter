// RUN area: threshold / bug fixes in existing acceptance checks, each with a true positive and a false positive.
//   A1 passwordEye — every password field has its own eye (Praxis: the Password eye counted for Confirm password)
//   B4 moneyText  — thousands separator from 1,000, money/credits only (not years, ids, phones, postcodes)
//   F5 footer     — Visa/Mastercard logos need a "We accept" label next to them
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";
import * as a from "../playwright/acceptance.js";

const FX = join(dirname(fileURLToPath(import.meta.url)), "fixtures/run");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
async function t(name, fn) { try { await fn(); ok(name); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await checks.install(page);
const load = (html) => page.goto("data:text/html;charset=utf-8," + encodeURIComponent(html));
const fx = (f) => readFileSync(join(FX, f), "utf8");

try {
  await t("A1: Confirm password without its own eye is reported, the Password field with one is not (Praxis sign-up DOM)", async () => {
    await load(fx("eye-shared.html"));
    const out = await a.passwordEye(page);
    assert.equal(out.length, 1, JSON.stringify(out));
    assert.match(out[0].what, /Confirm password/);
    assert.equal(out[0].selector, "#b");
  });
  await t("A1: two fields, each with its own eye (and a change-password dialog with three) pass", async () => {
    await load(fx("eye-own.html"));
    assert.deepEqual(await a.passwordEye(page), []);
  });
  await t("A1: an eye in a label row above the field still counts as the field's own", async () => {
    await load(`<form><div class="f"><div class="row"><label for="p">Password</label><button type="button" tabindex="-1" aria-label="Show password">Show</button></div><input id="p" type="password"></div></form>`);
    assert.deepEqual(await a.passwordEye(page), []);
  });

  await t("B4: 4-digit amounts of money / credits without a separator are reported (1200 credits, $1500, 12100 credits split over spans)", async () => {
    await load(fx("money.html"));
    const out = (await a.moneyText(page)).map((o) => o.what);
    for (const want of ["1200 credits", "$1500", "12100", "€ 2500", "4500 kredit"]) assert.ok(out.some((w) => w.includes(want)), `missing ${want}: ${JSON.stringify(out)}`);
  });
  await t("B4: years, ids, phone numbers, postcodes, separated amounts and 3-digit prices are not reported", async () => {
    await load(fx("money-ok.html"));
    assert.deepEqual((await a.moneyText(page)).map((o) => o.what), []);
  });
  await t("B4: acceptance.thousandsFrom 10000 keeps the old threshold", async () => {
    await load(`<p>1200 credits</p><p>12100 credits</p>`);
    const out = await a.moneyText(page, { thousandsFrom: 10000 });
    assert.equal(out.length, 1);
    assert.match(out[0].what, /12100/);
  });

  const footer = (inner) => `<body style="font-family:Arial"><main><h1>x</h1></main><footer><a href="/terms">Terms of Service</a> <a href="/privacy">Privacy Policy</a> <a href="/cookies">Cookie Policy</a> <a href="#" >Manage cookies</a>
    <p>© 2026 Acme Ltd. All rights reserved.</p><p>Acme Ltd · 1 Road · No 123</p><a href="mailto:support@acme.test">support@acme.test</a>${inner}</footer></body>`;
  const LOGOS = `<svg aria-label="Visa" width="32" height="20" role="img"><rect width="32" height="20"/></svg><svg aria-label="Mastercard" width="32" height="20" role="img"><rect width="32" height="20"/></svg>`;
  const f5 = async () => (await a.footer(page, a.acceptanceConfig({}))).filter((o) => o.id === "F5");
  await t("F5: Visa / Mastercard logos with no \"We accept\" fail", async () => {
    await load(footer(`<div>${LOGOS}</div>`));
    const out = await f5();
    assert.ok(out.some((o) => /without a "We accept" label/.test(o.what)), JSON.stringify(out));
  });
  await t("F5: \"We accept\" + logos pass; so does the Azerbaijani / Kazakh / Russian label", async () => {
    for (const label of ["We accept", "Qəbul edirik", "Қабылдаймыз", "Мы принимаем"]) {
      await load(footer(`<p>${label} ${LOGOS}</p>`));
      assert.deepEqual(await f5(), [], label);
    }
  });
  await t("F5: a footer with neither logos nor label still fails as before", async () => {
    await load(footer(""));
    assert.ok((await f5()).some((o) => /has no "We accept"/.test(o.what)));
  });
  const f3 = async () => (await a.footer(page, a.acceptanceConfig({}))).filter((o) => o.id === "F3" && /company line/.test(o.what));
  await t("F3: the studio legal identity placeholder is the company line; a footer with neither it nor a legal form fails", async () => {
    const bare = (company) => `<body><main><h1>x</h1></main><footer><a href="/terms">Terms of Service</a> <a href="/privacy">Privacy Policy</a><p>© 2026 ${company}. All rights reserved.</p>${company === "New Company 1" ? "<p>New Company 1 · New Address 1 · Company number 000000000</p>" : ""}<p>We accept ${LOGOS}</p></footer></body>`;
    await load(bare("New Company 1"));
    assert.deepEqual(await f3(), []);
    await load(bare("Acme"));
    assert.equal((await f3()).length, 1);
  });
} finally {
  await browser.close();
}
if (failed) { console.error(`run-acceptance: ${failed} failed`); process.exit(1); }
console.log("run-acceptance: all passed");
