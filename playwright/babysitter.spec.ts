// Runtime checks for ui-architecture-guidelines.md. Each test names the guideline and the Nexus patterns it guards.
//   node playwright/prepare.mjs   # optional: login + crawl → .babysitter/routes.json
//   npx playwright test -c playwright/playwright.config.ts
//   STRICT=0 turns the heuristic checks into warnings.
import { test, expect, type Page } from "@playwright/test";
import * as c from "./checks.js";
import { loadConfig, loadRoutes, STORAGE } from "./project.js";

const cfg = loadConfig();
const ROUTES = loadRoutes(cfg);
const STRICT = process.env.STRICT !== "0";
const allow = cfg.allow || {};

const fmt = (list: c.Offender[]) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");

async function open(page: Page, route: string) {
  await c.install(page);
  await page.goto(route, { waitUntil: "networkidle" }).catch(() => page.goto(route, { waitUntil: "load" }));
  await page.waitForTimeout(800); // late fonts / hydration
  if (await c.applyColorScheme(page)) await page.waitForTimeout(300); // class-based dark theme
  await c.revealLazy(page); // reveal-on-scroll sections render as a reader sees them
}

const hard = (list: c.Offender[]) => expect(list, fmt(list)).toEqual([]);
function soft(list: c.Offender[], label: string) {
  if (!list.length) return;
  if (STRICT) expect(list, `${label}\n${fmt(list)}`).toEqual([]);
  else test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}

for (const route of ROUTES) {
  test.describe(`${route.auth ? "[signed-in] " : ""}${route.path}`, () => {
    if (route.auth) test.use({ storageState: STORAGE });
    const r = route.path;

    test("2.1 no horizontal scroll, nothing outside the viewport [P15 P16]", async ({ page }) => { await open(page, r); hard(await c.horizontalOverflow(page)); });
    test("1.1 no native select/date/file/checkbox/radio [P01 P03 P50]", async ({ page }) => { await open(page, r); hard(await c.nativeControls(page)); });
    test("6.4 text ≥12px, legible weight, contrast ≥4.5:1 (3:1 large) [P11 P34]", async ({ page }) => {
      await open(page, r);
      const { hard: list, eye } = await c.illegibleText(page, !!allow.lightWeights);
      if (eye.length) test.info().annotations.push({ type: "check by eye", description: fmt(eye) });
      hard(list);
    });
    test("1.12 no emoji used as icons [P40]", async ({ page }) => {
      test.skip(!!allow.emoji, "emoji allowed by babysitter.config.json");
      await open(page, r); hard(await c.emoji(page));
    });
    test("6.10 raster images delivered at ≥2× (≥1.5× tolerated) [P56]", async ({ page }) => {
      await open(page, r);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((res) => setTimeout(res, 120)); } scrollTo(0, 0); });
      await page.waitForTimeout(600);
      hard(await c.lowResImages(page));
    });
    test("2.13 CLS < 0.1 [P43]", async ({ page }) => { await open(page, r); const v = await c.cls(page); expect(v, `cumulative layout shift ${v.toFixed(3)}`).toBeLessThan(0.1); });
    test("3.3 exactly one h1 [P26]", async ({ page }) => { await open(page, r); expect(await c.h1Count(page)).toBe(1); });
    test("3.5 active nav item has aria-current=page [P10]", async ({ page }) => {
      await open(page, r);
      const a = await c.activeNav(page);
      test.skip(!a.applicable, "no nav link points to this route");
      expect(a.ok, `nav link(s) for ${r} lack aria-current="page": ${a.where}`).toBe(true);
    });
    test("3.5 every width has navigation: hidden nav links come with a menu button [P10]", async ({ page }) => { await open(page, r); hard(await c.navReachable(page)); });
    test("3.8 page loads scrolled to top [P52]", async ({ page }) => { await open(page, r); expect(await c.scrollY(page)).toBe(0); });
    test("4.6 cookie banner does not cover navigation [P57]", async ({ page }) => { await open(page, r); hard(await c.cookieCovers(page)); });
    test("4.6 cookie settings replace the banner, panel fits [P19 P18]", async ({ page }) => { await open(page, r); hard(await c.cookieFlow(page)); });
    test("1.11 logo link hugs the logo [P58]", async ({ page }) => { await open(page, r); hard(await c.logoLink(page)); });
    test("2.6 cards in a row: equal height, CTAs and prices aligned, no double seams [P27 P55]", async ({ page }) => { await open(page, r); hard(await c.rowAlignment(page)); });
    test("2.12 repeated rows keep column positions [P48]", async ({ page }) => { await open(page, r); soft(await c.repeatedRowColumns(page), "row columns shift"); });
    test("2.3 tables keep every column on mobile [P16]", async ({ page }) => { await open(page, r); hard(await c.tableClipping(page)); });
    test("5.1 scroll containers are not rounded [P21]", async ({ page }) => { await open(page, r); hard(await c.scrollbarRadius(page)); });
    test("1.9 inputs visible at rest [P09]", async ({ page }) => { await open(page, r); hard(await c.inputVisibility(page)); });
    test("1.4 button label stays readable on hover [P06]", async ({ page }) => {
      await open(page, r);
      const { hard: list, eye } = await c.hoverContrastDetailed(page);
      if (eye.length) test.info().annotations.push({ type: "check by eye", description: fmt(eye) });
      hard(list);
    });
    test("1.18 tick boxes, radios and switches look checked when checked", async ({ page }) => { await open(page, r); hard(await c.checkedState(page)); });
    test("1.2/5.2 dropdowns, menus and dialogs open on-screen without moving the header [P02 P18 P22]", async ({ page }) => { await open(page, r); hard(await c.interactiveStates(page)); });
    test("6.12 dropdowns, menus, popovers, dialogs and accordions open and close with motion [P59]", async ({ page }) => { await open(page, r); hard(await c.overlayMotion(page)); });
    test("6.12 overlays that appear by themselves (cookie banner, toast, promo bar, chat bubble) come and go with motion [P59]", async ({ page }) => {
      // its own fresh load: frames are sampled from the first paint, and nothing dismissed earlier is remembered
      test.setTimeout(90_000);
      await c.install(page);
      hard(await c.selfAppearingMotion(page, r));
    });
    test("6.12 animate-in / animate-out classes produce an animation [P59]", async ({ page }) => { await open(page, r); hard(await c.deadAnimationClasses(page)); });
    test("3.5 the open mobile menu: legible, tappable, uncovered, covers the page, matches the theme [P10]", async ({ page }) => {
      await open(page, r);
      const m = await c.mobileMenu(page, !!allow.lightWeights);
      test.skip(!m.applicable, "no menu toggle at this width (3.5 nav reachability covers that)");
      if (m.eye.length) test.info().annotations.push({ type: "check by eye", description: fmt(m.eye) });
      if (m.soft.length) {
        if (STRICT) expect.soft(m.soft, `open mobile menu\n${fmt(m.soft)}`).toEqual([]);
        else test.info().annotations.push({ type: "warning", description: `open mobile menu\n${fmt(m.soft)}` });
      }
      hard(m.hard);
    });
    test("2.5 header nav items do not wrap [P35]", async ({ page }) => { await open(page, r); soft(await c.wrappedNavItems(page), "nav items wrap"); });
    test("2.11 text is not covered by other elements [P49]", async ({ page }) => { await open(page, r); soft(await c.overlappingText(page), "overlapping text"); });
    test("6.9 underline only on links [P54]", async ({ page }) => { await open(page, r); soft(await c.fakeLinks(page), "fake link affordance"); });
    test("1.9 keyboard focus is visible [P09]", async ({ page }) => { await open(page, r); soft(await c.focusVisible(page), "missing focus ring"); });
  });
}

/**
 * 6.12 — every interactive element animates what it shows, hides or changes (tabs, accordions, show-more, toggled
 * sections, chips, toasts, popovers, carousels, filters), on open and on toggling back; the clicked control's own state
 * change should transition too (soft). Site-wide so the same component on many pages is one finding listing the pages.
 * Not clicked (links to other pages, submits, destructive actions, look-alikes, over the cap) is listed, never dropped.
 */
test.describe("site-wide interactions", () => {
  test("6.12 every interactive element animates what it shows, hides or changes [P59]", async ({ browser }, info) => {
    test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
    const max = Number(cfg.motion?.maxClicks ?? 30);
    test.setTimeout(120_000 + Math.ceil(ROUTES.length / 3) * (30_000 + max * 4_000));
    const hardG = new Map<string, { what: string; where: string; pages: string[] }>();
    const softG = new Map<string, { what: string; where: string; pages: string[] }>();
    const notTested: string[] = [];
    const add = (g: typeof hardG, f: { kind: string; sig: string; what: string; where: string }, route: string) => {
      const k = `${f.kind}|${f.sig}`;
      const e = g.get(k) || { what: f.what, where: f.where, pages: [] };
      if (!e.pages.includes(route)) e.pages.push(route);
      g.set(k, e);
    };
    const queue = [...ROUTES];
    const worker = async () => {
      for (let route = queue.shift(); route; route = queue.shift()) {
        const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? STORAGE : undefined, baseURL: info.project.use.baseURL });
        const page = await ctx.newPage();
        try {
          await open(page, route.path);
          const reload = async () => { await page.goto(route.path, { waitUntil: "networkidle" }).catch(() => page.goto(route.path, { waitUntil: "load" }).catch(() => {})); await page.waitForTimeout(500); if (await c.applyColorScheme(page)) await page.waitForTimeout(300); };
          const r = await c.interactionMotion(page, { reload, max });
          for (const f of r.hard) add(hardG, f, route.path);
          for (const f of r.soft) add(softG, f, route.path);
          for (const n of r.notTested) notTested.push(`${route.path}: ${n.count} not tested — ${n.reason}${n.examples.length ? ` (e.g. ${n.examples.join("; ")})` : ""}`);
        } catch (e) {
          notTested.push(`${route.path}: not tested — the check failed on this page: ${String((e as Error).message || e).split("\n")[0]}`);
        } finally { await ctx.close(); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const show = (g: typeof hardG) => [...g.values()].map((e) => `  • ${e.what} — ${e.where} — on ${e.pages.join(", ")}`).join("\n");
    if (notTested.length) test.info().annotations.push({ type: "not tested", description: notTested.join("\n") });
    if (softG.size) {
      if (STRICT) expect.soft([...softG.values()], `control state changes that snap\n${show(softG)}`).toEqual([]);
      else test.info().annotations.push({ type: "warning", description: `control state changes that snap\n${show(softG)}` });
    }
    expect([...hardG.values()], `${show(hardG)}${notTested.length ? `\n\nNot tested:\n${notTested.map((x) => `  ${x}`).join("\n")}` : ""}`).toEqual([]);
  });
});

/**
 * 1.3 / 1.16 — one look per role across the whole site. Collects every rendered button, input and card
 * on every route and fails when a role comes in more shapes than the kit's variants/sizes allow.
 */
test.describe("site-wide consistency", () => {
  test("1.3/1.16 buttons, inputs and cards share one look across pages [P04 P46 P47]", async ({ browser }, info) => {
    test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
    test.setTimeout(60_000 + ROUTES.length * 15_000);
    const sigs: c.Sig[] = [];
    for (const route of ROUTES) {
      const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? STORAGE : undefined, baseURL: info.project.use.baseURL });
      const page = await ctx.newPage();
      await open(page, route.path);
      sigs.push(...(await c.collectSignatures(page, route.path)));
      await ctx.close();
    }
    const lim = { buttonRadii: 2, buttonFonts: 1, buttonHeights: 3, cardRadii: 3, cardStyles: 4, inputHeights: 2, inputRadii: 2, ...(cfg.consistency || {}) };
    const problems: string[] = [];
    const check = (label: string, list: ReturnType<typeof c.variety>, max: number) => {
      if (list.length > max) problems.push(`${label}: ${list.length} variants (allowed ${max})\n${list.map((v) => `    ${v.value} ×${v.count} — e.g. ${v.example}`).join("\n")}`);
    };
    check("filled-button corner radius", c.variety(sigs, "button", "radius", (s) => !!s.filled), lim.buttonRadii);
    // fonts are compared within one button variant: a mono primary CTA next to a serif ghost button is a design choice
    for (const v of new Set(sigs.filter((s) => s.kind === "button").map((s) => s.variant!)))
      check(`button font family (variant ${v})`, c.variety(sigs, "button", "font", (s) => s.variant === v), lim.buttonFonts);
    check("button height", c.variety(sigs, "button", "height"), lim.buttonHeights);
    check("input height", c.variety(sigs, "input", "height", (s) => s.height > 0), lim.inputHeights);
    check("input corner radius", c.variety(sigs, "input", "radius"), lim.inputRadii);
    check("card corner radius", c.variety(sigs, "card", "radius"), lim.cardRadii);
    check("card style (radius + fill + border + shadow + padding)", c.variety(sigs, "card", "skin"), lim.cardStyles);
    // 3.5 — the open mobile menu speaks the site's language: its buttons vs the CTA set above, its corners vs the cards
    if (/mobile/.test(info.project.name)) {
      const home = ROUTES.find((x) => !x.auth && x.path === "/") || ROUTES.find((x) => !x.auth) || ROUTES[0];
      const ctx = await browser.newContext({ ...info.project.use, storageState: home.auth ? STORAGE : undefined, baseURL: info.project.use.baseURL });
      const page = await ctx.newPage();
      await open(page, home.path);
      const menu = await c.mobileMenuConsistency(page, sigs);
      await ctx.close();
      if (menu.list.length) {
        if (STRICT) expect.soft(menu.list, `open mobile menu does not match the site\n${fmt(menu.list)}`).toEqual([]);
        else test.info().annotations.push({ type: "warning", description: `open mobile menu does not match the site\n${fmt(menu.list)}` });
      }
    }
    expect(problems, problems.join("\n\n")).toEqual([]);
  });
});
