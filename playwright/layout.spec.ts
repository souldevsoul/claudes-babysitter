// Layout / navigation / money runtime checks (playwright/checks/layout.js). Same projects and routes as
// babysitter.spec.ts; site-wide comparisons (names vs pages, heading styles, favicon) live in "site-wide layout".
//   STRICT=0 turns the soft (heuristic) checks into warnings.
import { test, expect, type Page } from "@playwright/test";
import * as c from "./checks.js";
import * as L from "./checks/layout.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, loadRoutes, ROOT, STORAGE, authTag, storageFor } from "./project.js";

const cfg = loadConfig();
const ROUTES = loadRoutes(cfg);
const STRICT = process.env.STRICT !== "0";
const lay = cfg.layout || {};
// the product's name in the favicon registry: config name, then package name, else the site's host
const PRODUCT = cfg.name || (() => { try { const p = resolve(ROOT, "package.json"); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).name : ""; } catch { return ""; } })() || "";
const notes = (label: string, list: string[]) => { if (list?.length) test.info().annotations.push({ type: "not tested", description: `${label}\n${list.join("\n")}` }); };

type F = { what: string; where: string };
const fmt = (list: F[]) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");

async function goto(page: Page, route: string, idleCap = 8_000) {
  const resp = await c.gotoStable(page, route);
  await page.waitForLoadState("networkidle", { timeout: idleCap }).catch(() => {});
  return resp;
}
/** Opens the route as a reader sees it; returns the HTTP status (0 when unknown). */
async function open(page: Page, route: string) {
  await c.install(page);
  const resp = await goto(page, route);
  await page.waitForTimeout(800);
  if (await c.applyColorScheme(page)) await page.waitForTimeout(300);
  await c.revealLazy(page);
  // a modal open on arrival hides the page from every check behind it (parallel: ~75 failures from one notice): close it, report it once
  await c.dismissArrivalModal(page);
  return resp ? resp.status() : 0;
}
const hard = (list: F[]) => expect(list, fmt(list)).toEqual([]);
function soft(list: F[], label: string) {
  if (!list.length) return;
  if (STRICT) expect.soft(list, `${label}\n${fmt(list)}`).toEqual([]);
  else test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}

for (const route of ROUTES) {
  test.describe(`${authTag(route)}${route.path} layout`, () => {
    if (route.auth) test.use({ storageState: storageFor(route.role) });
    const r = route.path;

    test("3.7 header links are in the footer under the same name [nav-mismatch]", async ({ page }) => {
      await open(page, r);
      const p = await L.navParity(page);
      soft(p.soft, "header links missing from the footer");
      hard(p.hard);
    });
    test("1.11 header, footer, auth and mobile-menu logos link home [logo-link]", async ({ page }) => {
      await open(page, r);
      const p = await L.logoHome(page);
      soft(p.soft, "logo links somewhere else than home");
      hard(p.hard);
    });
    test("2.5 no word broken mid-word, no number split across lines; no orphan word in headings — phone widths (360 and 390) [text-overflow]", async ({ page }, info) => {
      test.skip(!/mobile/.test(info.project.name), "narrow screens only");
      await open(page, r);
      const a = await L.textBreaks(page);
      // 360 is its own project in the full run; a quick run (390 + 1440) checks it from the 390 project
      let b = { hard: [] as F[], soft: [] as F[] };
      if (/mobile-390/.test(info.project.name) && !info.config.projects.some((p) => /mobile-360/.test(p.name))) {
        const vp = page.viewportSize()!;
        await page.setViewportSize({ width: 360, height: vp.height });
        await page.waitForTimeout(400);
        b = await L.textBreaks(page);
      }
      const merge = (x: F[], y: F[]) => [...x, ...y.filter((f) => !x.some((g) => g.where === f.where))];
      soft(merge(a.soft, b.soft), "orphan words in headings");
      hard(merge(a.hard, b.hard));
    });
    test("2.7/2.4 near-miss alignment (2–12 px): stacked siblings, side-by-side columns, form fields and labels; table headers over their values [alignment table-layout]", async ({ page }) => {
      await open(page, r);
      const a = await L.alignment(page);
      soft(a.soft, "near-miss alignment");
      hard(a.hard);
    });
    test("2.7 no excess empty space between or inside sections — crops attached [empty-space]", async ({ page }) => {
      await open(page, r);
      const e = await L.emptySpace(page, Number(lay.emptySpaceRatio ?? 2.5));
      for (const [i, clip] of e.crops.entries()) {
        const png = await page.screenshot({ clip, fullPage: true }).catch(() => null);
        if (png) await test.info().attach(`empty-space-${i + 1}.png`, { body: png, contentType: "image/png" });
      }
      soft(e.soft, "excess empty space (see the attached crops)");
    });
    test("3.6 the header stays on screen after scrolling 1000 px [sticky-header]", async ({ page }) => {
      await open(page, r);
      const s = await L.stickyHeader(page, Number(lay.stickyDistance ?? 1000));
      test.skip(!s.applicable, "no header bar at the top, or the page does not scroll 400 px");
      const list = s.ok ? [] : [{ what: s.what!, where: s.where! }];
      if (lay.stickyHeader === false) soft(list, "header scrolls away (layout.stickyHeader is false: reported, not failed)");
      else hard(list);
    });
    test("4.3 lists longer than 20 items come with pagination, load-more or virtualization [pagination]", async ({ page }) => {
      await open(page, r);
      soft((await L.longLists(page, Number(lay.maxListItems ?? 20))).soft, "long lists without pagination");
    });
    test("1.2 dropdowns: options sorted, the selected one marked and in view, ticks on one side [dropdown-ui]", async ({ page }) => {
      await open(page, r);
      const d = await L.dropdowns(page);
      notes("dropdowns", d.notTested);
      soft(d.soft, "dropdown options not sorted");
      hard(d.hard);
    });
    test("1.6 buttons, button-links and clickable cards react to hover [hover-state]", async ({ page }, info) => {
      test.skip(/mobile|tablet/.test(info.project.name), "pointer screens only");
      await open(page, r);
      const h = await L.hoverFeedback(page, Number(lay.maxHover ?? 40));
      notes("hover", h.notTested);
      soft(h.soft, "clickable cards without hover feedback");
      hard(h.hard);
    });
    test("2.10 one menu on a phone: the burger and the avatar do not both open the navigation [mobile-menu]", async ({ page }, info) => {
      test.skip(!/mobile/.test(info.project.name), "narrow screens only");
      await open(page, r);
      const m = await L.oneMobileMenu(page);
      test.skip(!m.applicable, "fewer than two menu toggles in the header");
      hard(m.hard);
    });
    test("money: amounts formatted the same way in every currency of the switcher [price-rounding currency-format number-format]", async ({ page }) => {
      test.setTimeout(180_000);
      await open(page, r);
      const m = await L.moneyFormat(page, Number(lay.maxCurrencies ?? 8), { rateDecimals: Number(lay.rateDecimals ?? 4) });
      test.info().annotations.push({ type: "currencies", description: `${m.switcher ? `switcher (${m.switcher}): ` : "no switcher: "}${m.tested.join(", ")}` });
      notes("money", m.notTested);
      soft(m.soft, "money formatting");
      hard(m.hard);
    });
    test("3.5 the current nav item looks different, and only it — desktop nav and burger [active-nav]", async ({ page }) => {
      await open(page, r);
      const p = await L.activeNavStyle(page);
      soft(p.soft, "nav highlight");
      hard(p.hard);
    });
  });
}

/**
 * Site-wide: every route is opened once per width (one mobile, one desktop) and compared with the others —
 *   3.7 a nav label names the page it opens; a legal document keeps one name (hard) [nav-mismatch legal-naming]
 *   6.5 h1 / h2 come in at most `layout.headingVariants` (2) looks per breakpoint — h1 hard, h2 soft [heading-style]
 */
test.describe("site-wide layout", () => {
  test("3.7 nav names match their pages; 6.5 one heading style per level; 1.2 ticks on one side", async ({ browser }, info) => {
    test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
    test.setTimeout(60_000 + ROUTES.length * 20_000);
    const pages = [];
    const heads = [];
    const marks: { side: string; where: string; page: string }[] = [];
    const notTested: string[] = [];
    for (const route of ROUTES) {
      const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
      const page = await ctx.newPage();
      try {
        const status = await open(page, route.path);
        if (status >= 400) { notTested.push(`${route.path}: HTTP ${status} (an error page is not compared)`); await ctx.close(); continue; }
        pages.push(await L.navParity(page));
        heads.push(...(await L.collectHeadings(page, route.path)));
        for (const mk of (await L.dropdowns(page, 6)).marks) marks.push({ ...mk, page: route.path });
      } catch (e) { notTested.push(`${route.path}: ${String((e as Error).message).split("\n")[0]}`); }
      await ctx.close();
    }
    if (notTested.length) test.info().annotations.push({ type: "not tested", description: notTested.join("\n") });
    const m = L.navTitleMismatches(pages);
    soft(m.soft, "nav label and page title differ");
    if (m.hard.length) expect.soft(m.hard, `nav names vs pages\n${fmt(m.hard)}`).toEqual([]);
    const max = Number(lay.headingVariants ?? 2);
    const show = (v: ReturnType<typeof L.headingVariants>) => v.map((x) => `    ${x.look} ×${x.count} on ${x.pages.slice(0, 6).join(", ")}${x.pages.length > 6 ? ", …" : ""} — e.g. ${x.example}`).join("\n");
    // hard: h1 in more than `max` faces (family / weight / tracking / case); soft: more than `max` sizes+faces, any h2 spread
    const sw: F[] = [];
    for (const tag of ["h1", "h2"]) {
      const looks = L.headingVariants(heads, tag), faces = L.headingVariants(heads, tag, "face");
      if (looks.length > max) sw.push({ what: `${tag} comes in ${looks.length} looks (size + face) at this width (allowed ${max}) — one text-style token per level [6.5]\n${show(looks)}`, where: `${tag} across pages` });
      if (tag === "h2" && faces.length > max) sw.push({ what: `h2 comes in ${faces.length} faces at this width (allowed ${max}) [6.5]\n${show(faces)}`, where: "h2 across pages" });
    }
    soft(sw, "heading styles");
    const sides = new Set(marks.map((m) => m.side));
    if (sides.size > 1) expect.soft(marks.map((m) => `${m.side}: ${m.where} on ${m.page}`), "the selected-option tick sits on different sides in different dropdowns — one side everywhere [1.2 / 1.18]").toEqual([]);
    const f1 = L.headingVariants(heads, "h1", "face");
    expect(f1.length, `h1 comes in ${f1.length} faces (family / weight / tracking / case) at this width (allowed ${max}) — page titles should use one text style token [6.5]\n${show(f1)}`).toBeLessThanOrEqual(max);
  });
  test("6.11 favicon: present, served, the product's own (not a framework default, not another product's) [favicon]", async ({ browser }, info) => {
    test.skip(!/desktop-1440/.test(info.project.name), "once per run");
    const home = ROUTES.find((x) => !x.auth && x.path === "/") || ROUTES[0];
    const ctx = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    await open(page, home.path);
    const f = await L.favicon(page, { product: PRODUCT, register: lay.registerFavicon !== false });
    await ctx.close();
    test.info().annotations.push({ type: "favicon", description: f.info.join("\n") || "none" });
    soft(f.soft, "favicon");
    hard(f.hard);
  });
});
