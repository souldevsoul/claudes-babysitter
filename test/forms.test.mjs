// FORMS checks (playwright/checks/forms.js) on fixture pages in test/fixtures/forms: every check fires on the
// broken page (true positive) and stays quiet on the fixed one (false positive). Pages are served from
// http://bs.test/ by page.route; the checks' sandbox answers every POST, so nothing leaves the browser.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";
import * as forms from "../playwright/checks/forms.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "fixtures", "forms");
const BASE = "http://bs.test/";
const browser = await chromium.launch({ channel: "chrome" });
let failed = 0;
const real = []; // requests that would have left the browser without the sandbox

async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host !== "bs.test") return route.fulfill({ status: 404, body: "" });
    if (req.method() !== "GET") { real.push(`${req.method()} ${u.pathname}`); return route.fulfill({ status: 200, body: "{}" }); }
    const file = join(FIX, u.pathname.replace(/^\//, "") || "index.html");
    if (u.pathname !== "/" && existsSync(file)) return route.fulfill({ status: 200, contentType: "text/html", body: readFileSync(file) });
    return route.fulfill({ status: u.pathname.startsWith("/api/") ? 200 : 404, contentType: "application/json", body: "{}" });
  });
  const page = await ctx.newPage();
  await checks.install(page);
  try {
    await fn(page);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`);
  } finally {
    await ctx.close();
  }
}
const go = async (page, name) => { await page.goto(BASE + name); await page.waitForTimeout(150); };
const show = (l) => JSON.stringify(l.map((f) => `${f.id}${f.soft ? "~" : ""}${f.na ? "?" : ""} ${f.what.slice(0, 110)} @ ${f.where}`), null, 1);
const real_ = (l) => l.filter((f) => !f.na);

try {
  await test("FM1 a seats field sending -1 / 999999999 / 1.5 and a top-up amount taking -1 are reported", async (page) => {
    await go(page, "numeric-bad.html");
    const out = real_(await forms.numericBounds(page));
    const seats = out.find((f) => /Seats/.test(f.what));
    assert.ok(seats && !seats.soft && /"-1"/.test(seats.what) && /"999999999"/.test(seats.what) && /sends it/.test(seats.what), show(out));
    assert.ok(!/"abc"|"1\.5"/.test(seats.what), "type=number already refuses letters, and its default step blocks 1.5");
    const amt = out.find((f) => /Amount/.test(f.what));
    assert.ok(amt && /without a word/.test(amt.what) && /Buy credits/.test(amt.where), show(out));
  });
  await test("FM1 bounded, clamped and explained fields pass", async (page) => {
    await go(page, "numeric-good.html");
    const out = real_(await forms.numericBounds(page));
    assert.deepEqual(out, [], show(out));
  });
  await test("FM2 a contact form sending q / qq / asdf is reported; one with a check under each field is not", async (page) => {
    await go(page, "contact-bad.html");
    const bad = real_(await forms.gibberish(page));
    assert.ok(bad.length === 1 && /no check in the browser/.test(bad[0].what) && bad[0].soft, show(bad));
    await go(page, "contact-good.html");
    const good = real_(await forms.gibberish(page));
    assert.deepEqual(good, [], show(good));
  });
  await test("FM3/FM4 a form that empties itself and says 'sent' on a 500 is reported; a silent one too", async (page) => {
    await go(page, "submit-bad.html");
    const out = real_(await forms.submitOutcomes(page));
    assert.ok(out.some((f) => f.id === "FM3" && /emptied/.test(f.what)), show(out));
    assert.ok(out.some((f) => f.id === "FM4" && /although the request failed/.test(f.what)), show(out));
    await go(page, "submit-silent.html");
    const silent = real_(await forms.submitOutcomes(page));
    assert.ok(silent.some((f) => /page says nothing/.test(f.what)), show(silent));
    assert.ok(silent.some((f) => f.id === "FM4" && /nothing visible happens/.test(f.what)), show(silent));
  });
  await test("FM3/FM4 a form that keeps values, shows the error and confirms success passes", async (page) => {
    await go(page, "submit-good.html");
    const out = real_(await forms.submitOutcomes(page));
    assert.deepEqual(out, [], show(out));
  });
  await test("FM3 a failed sign-in that keeps the password is a soft finding", async (page) => {
    await go(page, "signin-bad.html");
    const out = real_(await forms.submitOutcomes(page));
    assert.ok(out.some((f) => f.soft && /password is still filled/.test(f.what)), show(out));
    assert.ok(!out.some((f) => /emptied|says nothing/.test(f.what)), show(out));
  });
  await test("FM5 a saved display name that never reaches the header is reported; updating or re-reading is not", async (page) => {
    await go(page, "profile-bad.html");
    const bad = await forms.staleAfterSave(page);
    assert.ok(bad.length === 1 && bad[0].id === "FM5" && !bad[0].na && /still shows "Jane Doe"/.test(bad[0].what), show(bad));
    await go(page, "profile-good.html");
    const good = await forms.staleAfterSave(page);
    assert.deepEqual(good, [], show(good));
    await go(page, "profile-refetch.html");
    const re = await forms.staleAfterSave(page);
    assert.ok(re.length === 1 && re[0].na, show(re));
  });
  await test("FM6 an affordable-looking 50-credit action on a 5-credit balance is reported; a disabled one with the reason is not", async (page) => {
    await go(page, "credits-bad.html");
    const bad = real_(await forms.creditsUpFront(page));
    assert.ok(bad.length === 1 && /Generate report/.test(bad[0].what) && /50 credits/.test(bad[0].what), show(bad));
    await go(page, "credits-good.html");
    const good = real_(await forms.creditsUpFront(page));
    assert.deepEqual(good, [], show(good));
  });
  await test("FM7a a real reset page with a neutral confirmation passes; a 'not available' pop-up fails", async (page) => {
    const good = await forms.forgotPassword(page, BASE + "signin.html");
    assert.deepEqual(good, [], show(good));
    const bad = await forms.forgotPassword(page, BASE + "signin-nolink.html");
    assert.ok(bad.some((f) => /not available/.test(f.what)) && bad.some((f) => /no email field/.test(f.what)), show(bad));
  });
  await test("FM7b change password: same-as-current sent and no confirm field are reported; a guarded form is not", async (page) => {
    await go(page, "settings-pw-bad.html");
    const bad = await forms.changePasswordSame(page);
    assert.ok(bad.some((f) => /equal to the current/.test(f.what)) && bad.some((f) => /Confirm new password/.test(f.what)), show(bad));
    await go(page, "settings-pw-good.html");
    const good = await forms.changePasswordSame(page);
    assert.deepEqual(good, [], show(good));
  });
  await test("FM7c Confirm password without its own eye is reported even when Password's eye sits nearby (praxis #171)", async (page) => {
    await go(page, "register.html");
    const out = await forms.passwordEyes(page);
    assert.equal(out.length, 1, show(out));
    assert.match(out[0].what, /Confirm password/);
    await go(page, "settings-pw-good.html");
    assert.deepEqual(await forms.passwordEyes(page), []);
    await go(page, "settings-pw-bad.html");
    assert.deepEqual(await forms.passwordEyes(page), [], "an eye right next to the field (sibling) counts");
  });
  await test("FM8 auth shell: logo to /pricing, full nav and full footer are reported; logo home + back link + legal footer pass", async (page) => {
    await go(page, "signin-nolink.html");
    const bad = await forms.authShell(page);
    assert.ok(bad.some((f) => /logo links to \/pricing/.test(f.what)), show(bad));
    assert.ok(bad.some((f) => /full site navigation/.test(f.what)), show(bad));
    assert.ok(bad.some((f) => /full site footer/.test(f.what)), show(bad));
    assert.ok(bad.some((f) => /Back to home/.test(f.what) && f.soft), show(bad));
    await go(page, "signin.html");
    const good = await forms.authShell(page);
    assert.deepEqual(good, [], show(good));
  });
  await test("FM9 a dashboard painted before the redirect to sign-in is reported; a 'Loading…' screen is not", async (page) => {
    const bad = await forms.redirectFlash(page, BASE + "dashboard-flash.html", { settleMs: 1500 });
    assert.ok(bad.redirected && bad.findings.length === 1 && /"Dashboard"/.test(bad.findings[0].what), JSON.stringify(bad.findings));
  });
  await test("FM9 (clean)", async (page) => {
    const good = await forms.redirectFlash(page, BASE + "dashboard-clean.html", { settleMs: 1500 });
    assert.ok(good.redirected, "it did redirect");
    assert.deepEqual(good.findings, []);
  });
  await test("FM10 an editable account email is reported; read-only, verified-change and empty invite fields are not", async (page) => {
    await go(page, "settings-email.html");
    const out = await forms.settingsEmail(page);
    assert.equal(out.length, 1, show(out));
    assert.equal(out[0].selector, "#e1");
    assert.ok(await page.evaluate((s) => new RegExp(s, "i").test(document.body.innerText), forms.DATA_EXPORT_RE.source), "export control is recognised");
  });
  await test("live FPs: a 'Credits not returned' placeholder is not a credits field; a radio subject is picked; 'Choose a subject.' is an error", async (page) => {
    await go(page, "contact-radios.html");
    assert.deepEqual(real_(await forms.numericBounds(page)), [], "Subject line is text (praxis /contact)");
    const g = real_(await forms.gibberish(page));
    assert.ok(g.length === 1 && /no check in the browser/.test(g[0].what), `the radio group is filled, so the gibberish goes out (sprout /contact): ${show(g)}`);
    const o = real_(await forms.submitOutcomes(page));
    assert.deepEqual(o, [], show(o));
  });
  await test("formless settings card: stale header name, password change behind a button, header wallet chip as balance (praxis /settings)", async (page) => {
    await go(page, "settings-card.html");
    const st = await forms.staleAfterSave(page);
    assert.ok(st.length === 1 && st[0].id === "FM5" && !st[0].na, show(st));
    await go(page, "settings-card.html");
    const cr = real_(await forms.creditsUpFront(page));
    assert.ok(cr.length === 1 && /Hire specialist/.test(cr[0].what) && /balance is 3900/.test(cr[0].what), show(cr));
    await go(page, "settings-card.html");
    assert.equal(await forms.openPasswordChange(page), true, "the Change password button opens the form");
    const pw = await forms.changePasswordSame(page);
    assert.ok(pw.some((f) => /equal to the current/.test(f.what)), show(pw));
    const eyes = await forms.passwordEyes(page);
    assert.equal(eyes.length, 2, `both dialog fields lack an eye: ${show(eyes)}`);
  });
  await test("FM6 balance split over label / figure elements ('AVAILABLE' · '3,900')", async (page) => {
    await go(page, "wallet.html");
    const cr = real_(await forms.creditsUpFront(page));
    assert.ok(cr.length === 1 && /Hire now/.test(cr[0].what), show(cr));
  });
  assert.deepEqual(real, [], `requests that reached the fixture server instead of the sandbox: ${real.join(", ")}`);
} catch (e) {
  failed++;
  console.log(`  ✗ ${e.message}`);
} finally {
  await browser.close();
}
if (failed) { console.log(`forms: ${failed} failed`); process.exit(1); }
console.log("forms: ok");
