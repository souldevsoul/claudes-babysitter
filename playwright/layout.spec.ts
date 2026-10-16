// Layout / navigation / money runtime checks (playwright/checks/layout.js). Same projects and routes as
// babysitter.spec.ts; site-wide comparisons (names vs pages, heading styles, favicon) live in "site-wide layout".
//   STRICT=0 turns the soft (heuristic) checks into warnings.
import { test, expect, type Page } from "@playwright/test";
import * as c from "./checks.js";
import * as L from "./checks/layout.js";
import { loadConfig, loadRoutes, STORAGE } from "./project.js";

const cfg = loadConfig();
const ROUTES = loadRoutes(cfg);
const STRICT = process.env.STRICT !== "0";
const lay = cfg.layout || {};

type F = { what: string; where: string };
const fmt = (list: F[]) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");

async function goto(page: Page, route: string, idleCap = 8_000) {
  await page.goto(route, { waitUntil: "load", timeout: 45_000 }).catch(() => page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 }));
  await page.waitForLoadState("networkidle", { timeout: idleCap }).catch(() => {});
}
async function open(page: Page, route: string) {
  await c.install(page);
  await goto(page, route);
  await page.waitForTimeout(800);
  if (await c.applyColorScheme(page)) await page.waitForTimeout(300);
  await c.revealLazy(page);
}
const hard = (list: F[]) => expect(list, fmt(list)).toEqual([]);
function soft(list: F[], label: string) {
  if (!list.length) return;
  if (STRICT) expect.soft(list, `${label}\n${fmt(list)}`).toEqual([]);
  else test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}

for (const route of ROUTES) {
  test.describe(`${route.auth ? "[signed-in] " : ""}${route.path} layout`, () => {
    if (route.auth) test.use({ storageState: STORAGE });
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
    test("3.5 the current nav item looks different, and only it — desktop nav and burger [active-nav]", async ({ page }) => {
      await open(page, r);
      const p = await L.activeNavStyle(page);
      soft(p.soft, "nav highlight");
      hard(p.hard);
    });
  });
}

test.describe("site-wide layout", () => {
  test("3.7 a nav label names the page it opens; legal documents keep one name [nav-mismatch legal-naming]", async ({ browser }, info) => {
    test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
    test.setTimeout(60_000 + ROUTES.length * 15_000);
    const pages = [];
    for (const route of ROUTES) {
      const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? STORAGE : undefined, baseURL: info.project.use.baseURL });
      const page = await ctx.newPage();
      try { await open(page, route.path); pages.push(await L.navParity(page)); } catch { /* the per-page tests report a page that does not open */ }
      await ctx.close();
    }
    const m = L.navTitleMismatches(pages);
    soft(m.soft, "nav label and page title differ");
    hard(m.hard);
  });
});
