// False positives and misses found by hand on live sites (truelogos.pro, sprout.boutique, Vertex — 2026-10), each
// pinned by a fixture page in test/fixtures/runtime: the false positive stays gone AND the true positive still fires.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const checks = await import(process.env.BS_CHECKS ? pathToFileURL(process.env.BS_CHECKS).href : "../playwright/checks.js");
const here = dirname(fileURLToPath(import.meta.url));
const url = (name, q = "") => pathToFileURL(join(here, "fixtures", "runtime", name)).href + q;
const ids = (list) => list.map((f) => f.selector || f.where);
const has = (list, re) => list.some((f) => re.test(`${f.selector} ${f.where}`));

const browser = await chromium.launch({ channel: "chrome" });
let failed = 0;
async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

try {
  await test("1.4 hover: gradient button, translucent pill over a sibling hero and disabled controls pass; white-on-white and a pale gradient fail", async (page) => {
    await page.goto(url("hover.html"));
    const { hard, eye } = await checks.hoverContrastDetailed(page, 50);
    for (const id of ["#grad", "#pill", "#dis", "#dis2"]) assert.ok(!ids(hard).includes(id), `${id} is not a failure: ${JSON.stringify(hard)}`);
    assert.ok(ids(hard).includes("#bad"), `white label on a white button fails: ${JSON.stringify(hard)}`);
    assert.ok(ids(hard).includes("#badgrad"), `white label on a pale gradient fails: ${JSON.stringify(hard)}`);
    assert.ok(!ids(eye).includes("#grad"), "the gradient is measured from pixels, not sent to 'check by eye'");
    assert.ok(!ids(hard).includes("#under") && !ids(eye).includes("#under"), `a fixed cookie banner over the button is not what gets measured: ${JSON.stringify([...hard, ...eye].filter((f) => f.selector === "#under"))}`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("banner")).visibility), "visible", "the banner is shown again");
  });

  await test("6.4 opacity: readable translucent text passes, unreadable fails on contrast, a dense page reports every line", async (page) => {
    await page.goto(url("text-opacity.html"));
    const { hard } = await checks.illegibleText(page);
    assert.ok(!ids(hard).includes("#ok") && !ids(hard).includes("#ok2"), `opacity alone is not a finding: ${JSON.stringify(hard.filter((f) => /#ok/.test(f.selector)))}`);
    const faint = hard.find((f) => f.selector === "#faint");
    assert.ok(faint && /contrast/.test(faint.what), "opacity .35 fails on its effective contrast");
    const lines = hard.filter((f) => /Faint line/.test(f.where));
    assert.equal(lines.length, 60, `all 60 faint lines are reported (got ${lines.length})`);
  });

  await test("4.8 translation: a translated page that crashes on submit is caught; the same page with the guard survives; nothing is sent", async (page) => {
    const posts = [];
    page.on("request", (r) => r.method() !== "GET" && posts.push(r.url()));
    page.on("requestfailed", () => {});
    await page.goto(url("translate.html"));
    const bad = await checks.translationSurvives(page);
    assert.equal(bad.length, 1, `the unguarded page crashes: ${JSON.stringify(bad)}`);
    assert.match(bad[0].what, /Get my price/, "the finding names the control");
    assert.match(bad[0].what, /insertBefore|NotFound|not a child/i, "and the DOM error");
    await page.goto(url("translate.html", "?guard=1"));
    const ok = await checks.translationSurvives(page);
    assert.deepEqual(ok, [], `the guarded page survives: ${JSON.stringify(ok)}`);
    const sent = await page.evaluate(() => document.documentElement.classList.contains("translated-ltr"));
    assert.ok(sent, "the page was translated before pressing");
    assert.ok(posts.length >= 1, "the submit did try to POST");
  });

  await test("1.9 focus: an element that re-renders on focus is skipped, not a crash; the plain one is still reported", async (page) => {
    await page.goto(url("focus-rerender.html"));
    const out = await checks.focusVisible(page, 6);
    assert.ok(out.some((f) => /No focus style/.test(f.where)), `the unstyled button is reported: ${JSON.stringify(out)}`);
    assert.ok(!out.some((f) => /Has a focus ring/.test(f.where)), "the ringed button passes");
  });

  await test("1.1 cookie panel: an OS checkbox in a panel that expands in place is reported; a kit box is not", async (page) => {
    await page.goto(url("cookie-native.html"));
    const out = await checks.cookieFlow(page);
    assert.ok(has(out, /#native-a/), `the native analytics box is reported: ${JSON.stringify(out)}`);
    assert.ok(!has(out, /#kit-m/), "the appearance:none kit box passes");
  });

  await test("1.9 inputs: a py-3 + border-2 field box (28px taller than its input) is the field's edge", async (page) => {
    await page.goto(url("input-wrapper-tall.html"));
    const out = await checks.inputVisibility(page);
    assert.ok(!ids(out).includes("#rate"), `the boxed field is visible: ${JSON.stringify(out)}`);
    assert.ok(ids(out).includes("#bare"), "a faint bare field still fails");
  });

  await test("6.4 pulse: a blinking caret is decoration, pulsing text goes to the eye list, a faint static caret fails", async (page) => {
    await page.goto(url("caret.html"));
    await page.waitForTimeout(1000); // mid-pulse
    const { hard, eye } = await checks.illegibleText(page);
    assert.ok(!ids(hard).includes("#caret"), `the caret is not a failure: ${JSON.stringify(hard)}`);
    assert.ok(!ids(hard).includes("#loading") && ids(eye).includes("#loading"), `pulsing text is for the eye: ${JSON.stringify({ hard, eye })}`);
    assert.ok(ids(hard).includes("#static"), "a faint static caret still fails");
  });

  await test("prepare: a cookie banner over the sign-in button is answered (privacy choice first)", async (page) => {
    const { dismissConsent } = await import("../playwright/consent.mjs");
    await page.goto(url("login-banner.html"));
    const covered = await page.locator("#signin").click({ trial: true, timeout: 800 }).then(() => false, () => true);
    assert.ok(covered, "the fixture really covers the button");
    const label = await dismissConsent(page);
    assert.equal(label, "Reject All");
    assert.equal(await page.evaluate(() => document.body.dataset.choice), "reject");
    await page.locator('form:has(input[type=password]) button[type=submit]').first().click({ timeout: 1500 });
    assert.equal(await page.evaluate(() => document.body.dataset.sent), "1", "the form's own submit was pressed");
  });

  await test("1.9 inputs: a wrapper drawing the edge counts; a bare faint field and one loose in a bordered section fail", async (page) => {
    await page.goto(url("input-wrapper.html"));
    const out = await checks.inputVisibility(page);
    assert.ok(!ids(out).includes("#in1") && !ids(out).includes("#in2"), `wrapped fields are visible: ${JSON.stringify(out)}`);
    assert.ok(ids(out).includes("#bare"), "a bare faint field still fails");
    assert.ok(ids(out).includes("#in3"), "a bordered section far around the field is not its edge");
  });

  await test("2.6 rows: split screens, form + sticky summary, half-hidden rows, CTA links, logo walls and tints are not card rows; real ones still fail", async (page) => {
    await page.goto(url("rows.html"));
    const out = await checks.rowAlignment(page);
    for (const id of ["split", "calc", "halfhidden", "ctas", "logos", "tints"]) assert.ok(!has(out, new RegExp(`#${id}\\b`)), `#${id} is not a row of cards: ${JSON.stringify(out.filter((f) => f.where.includes(id)))}`);
    assert.ok(out.some((f) => /#pricing/.test(f.where) && /different heights/.test(f.what)), `pricing cards of different heights fail: ${JSON.stringify(out)}`);
    assert.ok(out.some((f) => /#mixed/.test(f.where) && /styled differently/.test(f.what)), "a row of three different looks fails");
  });

  await test("site-wide: nav links, chips, footer controls, link-cards, a cookie banner, logo tiles and tints are not button/card variants", async (page) => {
    await page.goto(url("signatures.html"));
    const sigs = await checks.collectSignatures(page, "/");
    const buttons = sigs.filter((s) => s.kind === "button");
    for (const id of ["Home", "Pricing", "All", "Red", "Manage cookies", "Terms", "Guide"]) assert.ok(!buttons.some((b) => b.where.includes(`"${id}`)), `"${id}" is not a button: ${buttons.map((b) => b.where).join(" | ")}`);
    assert.ok(buttons.some((b) => b.selector === "#cta") && buttons.some((b) => b.selector === "#submit"), "the CTA link and the form button are counted");
    const heights = checks.variety(sigs, "button", "height");
    assert.ok(heights.length >= 2, `real buttons of two heights are still two heights: ${JSON.stringify(heights)}`);
    const cards = sigs.filter((s) => s.kind === "card");
    assert.ok(!cards.some((c) => /cookie|wrapped/.test(c.where)), `the cookie banner and a wrapped CTA are not cards: ${cards.map((c) => c.where).join(" | ")}`);
    const skins = checks.variety(sigs, "card", "skin");
    assert.equal(skins.length, 1, `tinted cards share one style: ${JSON.stringify(skins)}`);
    // a real difference still counts
    await page.evaluate(() => { document.querySelector(".card").style.borderRadius = "2px"; });
    const again = checks.variety(await checks.collectSignatures(page, "/"), "card", "skin");
    assert.equal(again.length, 2, "a card with another radius is a second style");
  });

  await test("3.5 nav: hidden header links with no menu button fail on a phone; a burger, or a desktop width, pass; aria-current is checked in the closed menu", async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url("nav.html"));
    const out = await checks.navReachable(page);
    assert.equal(out.length, 1, `no navigation on this width: ${JSON.stringify(out)}`);
    assert.match(out[0].what, /Pricing/);
    const active = await checks.activeNav(page);
    assert.ok(active.applicable && active.ok, `hidden nav is still checked for aria-current: ${JSON.stringify(active)}`);
    await page.goto(url("nav.html", "?toggle"));
    assert.deepEqual(await checks.navReachable(page), [], "a menu button opens the nav");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url("nav.html"));
    assert.deepEqual(await checks.navReachable(page), [], "desktop shows the links");
  });

  await test("1.12 emoji: aria-hidden chips inside a faded-out reveal and ::before emoji are found; display:none / [hidden] are not", async (page) => {
    await page.goto(url("emoji.html"));
    const out = await checks.emoji(page);
    assert.ok(ids(out).includes("#rocket"), `aria-hidden emoji in a faded reveal: ${JSON.stringify(out)}`);
    assert.ok(out.some((f) => f.selector === "#hot" && /::before/.test(f.what)), "CSS ::before emoji");
    assert.ok(!ids(out).includes("#gone") && !ids(out).includes("#gone2"), "hidden ones are not on the page");
    assert.ok(!ids(out).includes("#plain"), "© and ™ are not emoji");
  });

  await test("1.18 checked state: border-only and no-change boxes fail; fill, system box, peer box, radio dot and switch pass; state restored", async (page) => {
    await page.goto(url("checked.html"));
    const out = await checks.checkedState(page);
    const by = (id) => out.find((f) => f.selector === id);
    assert.ok(by("#broken") && /border colour/.test(by("#broken").what), `border-only checked style fails: ${JSON.stringify(out)}`);
    assert.ok(by("#nothing") && /nothing visible/.test(by("#nothing").what), "a box that never changes fails");
    assert.ok(by("#p2") && /border colour/.test(by("#p2").what), "a peer box that only recolours its border fails");
    for (const id of ["#good", "#native", "#p1", "#r2", "#sw", "#off", "#r1", "#covered"]) assert.ok(!by(id), `${id} passes: ${JSON.stringify(by(id))}`);
    const state = await page.evaluate(() => ({
      boxes: ["broken", "nothing", "good", "native", "p1", "p2"].map((i) => document.getElementById(i).checked),
      r1: document.getElementById("r1").checked, sw: document.getElementById("sw").getAttribute("aria-checked"),
    }));
    assert.deepEqual(state, { boxes: [false, false, false, false, false, false], r1: true, sw: "false" }, "every control is put back");
  });
  // 6.12 — overlays that appear by themselves (truelogos.pro cookie banner, 2026-10): popped in after 1 s, gone in one frame
  const self = async (page, q) => checks.selfAppearingMotion(page, url("self-appear.html", q), { windowMs: 2000 });
  await test("6.12 self-appearing: a banner that pops in and is removed at once fails both ways, naming its dead animate-in classes", async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const out = await self(page, "?bad");
    assert.ok(out.some((f) => /appears by itself/.test(f.what) && /animate-in/.test(f.what) && f.selector === "#banner"), `enter without motion: ${JSON.stringify(out)}`);
    assert.ok(out.some((f) => /"Reject all" removes it in one frame/.test(f.what)), `exit without motion (Reject is clicked before Accept): ${JSON.stringify(out)}`);
  });
  await test("6.12 self-appearing: a banner with enter keyframes and an exit transition passes", async (page) => {
    const out = await self(page, "?good");
    assert.deepEqual(out, [], JSON.stringify(out));
  });
  await test("6.12 self-appearing: animated in but removed at once fails on the exit only", async (page) => {
    const out = await self(page, "?enteronly");
    assert.equal(out.length, 1, JSON.stringify(out));
    assert.match(out[0].what, /removes it in one frame/);
  });
  await test("6.12 self-appearing: a banner in the HTML from the first frame is the page load, not an overlay that appears", async (page) => {
    const out = await self(page, "?ssr");
    assert.ok(!out.some((f) => /appears by itself/.test(f.what)), JSON.stringify(out));
  });
  await test("6.12 self-appearing: an endless spinner is not an entrance; a fade-out close is an exit", async (page) => {
    const out = await self(page, "?spinner");
    assert.ok(out.some((f) => /appears by itself/.test(f.what) && f.selector === "#toast"), `the toast pops in: ${JSON.stringify(out)}`);
    assert.ok(!out.some((f) => /removes it/.test(f.what)), `its close fades: ${JSON.stringify(out)}`);
  });

  await test("6.12 dead classes at runtime: animate-in with no animation fails; with the plugin's CSS, a closed data-state, or no animate-in it passes", async (page) => {
    await page.goto(url("dead-anim.html"));
    const out = await checks.deadAnimationClasses(page);
    assert.ok(ids(out).includes("#dead") && ids(out).includes("#open"), `animate-in without CSS: ${JSON.stringify(out)}`);
    assert.match(out.find((f) => f.selector === "#dead").what, /tailwindcss-animate \/ tw-animate-css is missing/);
    assert.ok(!ids(out).includes("#closed") && !ids(out).includes("#plain"), "an inactive variant and fade-in alone promise nothing");
    await page.goto(url("dead-anim.html", "?plugin"));
    assert.deepEqual(await checks.deadAnimationClasses(page), [], "with the plugin's CSS it animates");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url("dead-anim.html"));
    assert.deepEqual(await checks.deadAnimationClasses(page), [], "not judged under reduced motion");
  });

  // 3.5 — the open mobile menu (truelogos.pro, 2026-10: white square inset panel on a navy site, 32 px buttons, page below)
  const menu = async (page, q) => { await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url("mobile-menu.html", q)); return checks.mobileMenu(page); };
  await test("3.5 open menu (truelogos before): small targets, undimmed page around it and a light panel on a dark site are reported; menu closed after", async (page) => {
    const m = await menu(page, "?bad");
    assert.ok(m.applicable, "the burger is found and opened");
    assert.deepEqual(m.hard, [], `nothing hard: ${JSON.stringify(m.hard)}`);
    assert.ok(m.soft.some((f) => /"Sign in" is a \d+×32px tap target/.test(f.what)) && m.soft.some((f) => /"€ EUR" is a/.test(f.what)), `32 px buttons and chips: ${JSON.stringify(m.soft)}`);
    assert.ok(!m.soft.some((f) => /"Designers" is a/.test(f.what)), "48 px links are fine");
    assert.ok(m.soft.some((f) => /showing the page undimmed \(below it, at its sides/.test(f.what)), `page below and at the sides: ${JSON.stringify(m.soft)}`);
    assert.ok(m.soft.some((f) => /surface doesn't match the theme: a light panel/.test(f.what) && /dark header/.test(f.what)), `white panel under a navy header on a navy site: ${JSON.stringify(m.soft)}`);
    assert.equal(await page.evaluate(() => document.getElementById("burger").getAttribute("aria-expanded")), "false", "the menu is closed again");
    assert.equal(await page.evaluate(() => document.querySelectorAll("[data-bs-menu-panel], [data-bs-menu-link], [data-bs-hide]").length), 0, "no marks left behind");
    const sigs = await checks.collectSignatures(page, "/");
    const c = await checks.mobileMenuConsistency(page, sigs);
    assert.ok(c.list.some((f) => /button "Sign in" doesn't match/.test(f.what) && /height 32px/.test(f.what) && /rounded corners, 6px \(site buttons are pill\)/.test(f.what) && /font "georgia"/.test(f.what)), `menu buttons vs the 52 px pill CTAs: ${JSON.stringify(c.list)}`);
    assert.ok(!c.list.some((f) => /€ EUR/.test(f.what)), "currency chips are a chip group, not CTAs");
    assert.ok(c.list.some((f) => /panel has square corners \(0px\) while the site's cards are rounded \(16px\)/.test(f.what)), `square inset panel vs rounded cards: ${JSON.stringify(c.list)}`);
  });
  await test("3.5 open menu: a full-height navy panel with the site's pill buttons passes everything", async (page) => {
    const m = await menu(page, "?good");
    assert.ok(m.applicable);
    assert.deepEqual([...m.hard, ...m.soft], [], JSON.stringify([...m.hard, ...m.soft]));
    const c = await checks.mobileMenuConsistency(page, await checks.collectSignatures(page, "/"));
    assert.deepEqual(c.list, [], JSON.stringify(c.list));
  });
  await test("3.5 open menu: a side sheet over a dimming backdrop (portal links) covers the page; a light site's white panel matches it", async (page) => {
    const s = await menu(page, "?sheet");
    assert.ok(s.applicable, "links rendered in a separate sheet are found");
    assert.deepEqual([...s.hard, ...s.soft], [], JSON.stringify([...s.hard, ...s.soft]));
    const l = await menu(page, "?light");
    assert.ok(l.applicable);
    assert.ok(!l.soft.some((f) => /surface/.test(f.what)), `a white panel on a light site under a navy header is the site's surface: ${JSON.stringify(l.soft)}`);
  });
  await test("3.5 open menu: a cookie banner over its buttons is a hard finding; no burger on a wide screen is not applicable", async (page) => {
    const m = await menu(page, "?covered");
    assert.ok(m.hard.some((f) => /"Get started" is covered by div#cookie/.test(f.what)), `covered item: ${JSON.stringify(m.hard)}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url("mobile-menu.html", "?bad"));
    assert.equal((await checks.mobileMenu(page)).applicable, false);
  });
  // 6.12 generalised — every interaction animates what it changes (tabs, show-more, toasts, chips), both ways
  await test("6.12 interactions: tabs, show-more and a toast without motion fail; faded tabs, a grid-rows show-more and a transitioning chip pass; links and submits are listed as not tested", async (page) => {
    const u = url("interactions.html");
    await page.goto(u);
    const r = await checks.interactionMotion(page, { reload: () => page.goto(u) });
    const at = (re, kind) => r.hard.some((f) => re.test(f.where) && (!kind || f.kind === kind));
    assert.ok(r.hard.some((f) => /#tabs-bad/.test(f.where) && /shows div#b2/.test(f.what)), `tabs without motion: ${JSON.stringify(r.hard.map((f) => f.what))}`);
    assert.ok(!at(/#tabs-good/), "tabs that fade the new panel in pass");
    assert.ok(at(/#more-bad/, "open") && r.hard.some((f) => /#more-bad/.test(f.where) && /toggling it back hides/.test(f.what)), "show-more without motion fails open and close");
    assert.ok(!at(/#more-good-btn/), "a grid-rows transition passes both ways");
    assert.ok(r.hard.some((f) => /#toast-btn/.test(f.where) && /shows div#toast/.test(f.what)), "a toast that pops in fails");
    assert.ok(r.soft.some((f) => /#chip-bad/.test(f.where)) && !r.soft.some((f) => /#chip-good/.test(f.where)), `pressed fill that snaps is soft; with transition-colors it passes: ${JSON.stringify(r.soft)}`);
    assert.ok(!r.hard.some((f) => /#nav|#submit/.test(f.where)), "the link and the submit were not clicked");
    assert.ok(r.notTested.some((n) => /another page/.test(n.reason) && n.examples.some((e) => /#nav/.test(e))), `the link is listed as not tested: ${JSON.stringify(r.notTested)}`);
    assert.ok(r.notTested.some((n) => /submits a form/.test(n.reason)), "the submit is listed");
    const capped = await (async () => { await page.goto(u); return checks.interactionMotion(page, { reload: () => page.goto(u), max: 2 }); })();
    assert.ok(capped.notTested.some((n) => /over the per-page cap of 2/.test(n.reason) && n.count > 0), `the cap says how many were not clicked: ${JSON.stringify(capped.notTested)}`);
    assert.equal(await page.evaluate(() => location.protocol), "file:", "never navigated away");
  });
  await test("6.12 interactions: a click that runs over its time budget is abandoned and listed; the controls around it are still judged; a page deadline lists what was left", async (page) => {
    const u = url("budget.html");
    await page.goto(u);
    const t0 = Date.now();
    const r = await checks.interactionMotion(page, { reload: () => page.goto(u), clickBudget: 2500 });
    assert.ok(Date.now() - t0 < 30_000, `bounded: ${Date.now() - t0} ms`);
    assert.ok(has(r.hard, /#first-bad/) && has(r.hard, /#last-bad/), `findings before and after the stuck click are kept: ${JSON.stringify(r.hard.map((f) => f.where))}`);
    const over = r.notTested.find((n) => /time budget: the click took longer/.test(n.reason));
    assert.ok(over && over.count === 1 && over.examples.some((e) => /#busy/.test(e)), `the stuck click is listed as not tested (time budget): ${JSON.stringify(r.notTested)}`);
    assert.ok(!has(r.hard, /#busy/), "nothing is judged from an abandoned click");
    await page.goto(u);
    const t1 = Date.now();
    const d = await checks.interactionMotion(page, { reload: () => page.goto(u), deadline: Date.now() + 1000 });
    assert.ok(Date.now() - t1 < 10_000, `the page deadline stops the run: ${Date.now() - t1} ms`);
    const left = d.notTested.find((n) => /time budget: the page's time ran out/.test(n.reason));
    assert.ok(left && left.count === 3 && left.examples.length, `what was left is counted, with examples: ${JSON.stringify(d.notTested)}`);
  });
  await test("6.12 interactions: a control the click removes (cookie banner \"Got it\") is not a state snap; one that stays and snaps still is", async (page) => {
    const u = url("state-removed.html");
    await page.goto(u);
    const r = await checks.interactionMotion(page, { reload: () => page.goto(u) });
    assert.ok(!has(r.soft, /got-it|Got it/), `a detached control reads "" for every style — not a snap: ${JSON.stringify(r.soft.map((f) => f.where))}`);
    assert.ok(has(r.soft, /#snap|Filter/), `a pressed fill that snaps on a control that stays is still soft: ${JSON.stringify(r.soft)}`);
  });
  await test("2.10 escapesBox: a button run out of its card, one clipped by an overflow:hidden section and a dropdown that widens its form fail; a corner close button, carousel slides, a full-bleed band and a fitting button pass", async (page) => {
    await page.goto(url("escape.html"));
    const out = await checks.escapesBox(page);
    const by = (id) => out.find((f) => f.selector === id);
    assert.ok(by("#see-all") && /sticks out of its card/.test(by("#see-all").what), `Praxis: the button past its card (still on screen) fails: ${JSON.stringify(out)}`);
    assert.ok(by("#see-all-clipped"), `inside an overflow:hidden section the card still catches it: ${JSON.stringify(out)}`);
    assert.ok(by("#bare-clipped") && /cut off by its container/.test(by("#bare-clipped").what), `a link the section clips is not "decorative bleed": ${JSON.stringify(out)}`);
    assert.ok(by("#topic") && /sticks out of its card/.test(by("#topic").what), `Relaygpu: the dropdown that widens its grid column fails: ${JSON.stringify(out)}`);
    for (const id of ["#topic-ok", "#close", "#fits", "#slide1", "#slide2", "#slide3", "#band"]) assert.ok(!by(id), `${id} passes: ${JSON.stringify(by(id))}`);
  });

  await test("1.18 toggleGeometry: a thumb past its track and an off thumb on the on side fail, disabled included; a left-anchored thumb and an rtl one pass", async (page) => {
    await page.goto(url("switch.html"));
    const out = await checks.toggleGeometry(page);
    const by = (id) => out.filter((f) => f.selector === id);
    assert.ok(by("#bad-on").some((f) => /outside the track/.test(f.what)), `Mise "Necessary": thumb past the edge, disabled: ${JSON.stringify(out)}`);
    assert.ok(by("#bad-off").some((f) => /sits on the on side/.test(f.what)), `Mise "Analytics": off reads as on: ${JSON.stringify(out)}`);
    for (const id of ["#good-on", "#good-off", "#rtl-off"]) assert.equal(by(id).length, 0, `${id} passes: ${JSON.stringify(by(id))}`);
    const viaChecked = await checks.checkedState(page);
    assert.ok(viaChecked.some((f) => f.selector === "#bad-on"), "checkedState reports the geometry too");
  });

  await test("4.6 cookieFlow: a banner named only by aria-label is found, its settings opened, and the panel's broken switches reported", async (page) => {
    await page.goto(url("cookie-region.html"));
    const out = await checks.cookieFlow(page);
    assert.ok(out.some((f) => f.selector === "#nec" && /outside the track/.test(f.what) && /cookie settings panel/.test(f.what)), `the disabled "Necessary" switch: ${JSON.stringify(out)}`);
    assert.ok(out.some((f) => f.selector === "#ana" && /on side/.test(f.what)), `the off "Analytics" switch that reads as on: ${JSON.stringify(out)}`);
  });
} finally {
  await browser.close();
}
if (failed) {
  console.log(`checks-fp: ${failed} failed`);
  process.exit(1);
}
console.log("checks-fp: ok");
