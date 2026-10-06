// Business acceptance: what the business side (BQA, BQA) raised on product after product, as tests.
// Ids (F1, C1, A4 …) match docs/acceptance.md; babysitter.config.json → acceptance.skip turns one off
// (write the reason in acceptance.skipReasons). Owner decisions (2FA, footer "Manage cookies", company line,
// currencies) live in babysitter.config.json → acceptance.
//   npm run babysitter -- e2e            # prepare (login + crawl) + this suite + the UI checks + e2e/*.spec.ts
import { test, expect, type Page, type Browser } from "@playwright/test";
import * as c from "./checks.js";
import * as a from "./acceptance.js";
import { loadConfig, loadRoutes, STORAGE } from "./project.js";
import { existsSync } from "node:fs";

const cfg = loadConfig();
const acc = a.acceptanceConfig(cfg);
const ROUTES = loadRoutes(cfg);
const PUBLIC = ROUTES.filter((r) => !r.auth);
const AUTH = ROUTES.filter((r) => r.auth);
const SIGNED_IN = existsSync(STORAGE);
const STRICT = process.env.STRICT !== "0";
const on = (id: string) => !(acc.skip || []).includes(id);
const why = (id: string) => `${id} switched off in babysitter.config.json → acceptance.skip${acc.skipReasons?.[id] ? `: ${acc.skipReasons[id]}` : ""}`;

type O = { what: string; where: string };
const fmt = (list: O[]) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
const hard = (list: O[]) => expect(list, fmt(list)).toEqual([]);
function soft(list: O[], label: string) {
  if (!list.length) return;
  if (STRICT) expect(list, `${label}\n${fmt(list)}`).toEqual([]);
  else test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}

async function open(page: Page, route: string) {
  await c.install(page);
  await page.goto(route, { waitUntil: "networkidle" }).catch(() => page.goto(route, { waitUntil: "load" }));
  await page.waitForTimeout(700);
  if (await c.applyColorScheme(page)) await page.waitForTimeout(300);
  await c.revealLazy(page);
}
async function ctxFor(browser: Browser, auth: boolean) {
  const info = test.info();
  return browser.newContext({ ...info.project.use, storageState: auth ? STORAGE : undefined, baseURL: info.project.use.baseURL });
}
const twoWidths = () => test.skip(!/mobile-390|desktop-1440/.test(test.info().project.name), "runs at one mobile and one desktop width");
const desktopOnce = () => test.skip(!/desktop-1440/.test(test.info().project.name), "site-wide: runs once, at desktop width");

/* ───────── every page ───────── */
for (const route of ROUTES) {
  test.describe(`acceptance ${route.auth ? "[signed-in] " : ""}${route.path}`, () => {
    if (route.auth) test.use({ storageState: STORAGE });
    const r = route.path;
    test.beforeEach(() => twoWidths());

    test("B1 no build notes or self-justifying copy [BQA 5]", async ({ page }) => {
      test.skip(!on("B1"), why("B1"));
      await open(page, r);
      const { leaks, defensive } = await a.copyLeaks(page);
      hard(leaks);
      soft(defensive, "self-justifying copy");
    });
    test("B2–B4 exact prices, no VAT/tax, thousands separators [BQA 5/9/11]", async ({ page }) => {
      test.skip(!on("B2"), why("B2"));
      await open(page, r);
      hard(await a.moneyText(page, { noTax: acc.noTax }));
    });
    test("H2 everything clickable shows the hand cursor [BQA 3]", async ({ page }) => {
      test.skip(!on("H2") || /mobile/.test(test.info().project.name), on("H2") ? "no cursor on touch" : why("H2"));
      await open(page, r);
      hard(await a.pointerCursor(page));
    });
    test("H1 static cards do not react to hover [BQA 3]", async ({ page }) => {
      test.skip(!on("H1") || /mobile/.test(test.info().project.name), on("H1") ? "no hover on touch" : why("H1"));
      await open(page, r);
      soft(await a.staticHover(page), "hover effect on a card that is not clickable");
    });
    test("N1 sticky header stays flush with the top [BQA 6]", async ({ page }) => {
      test.skip(!on("N1"), why("N1"));
      await open(page, r);
      hard(await a.headerFlush(page));
    });
    test("N4 no duplicate links in header or footer [BQA 1/6]", async ({ page }) => {
      test.skip(!on("N4"), why("N4"));
      await open(page, r);
      hard(await a.duplicateLinks(page));
    });
    test("N6 labels fit their buttons and dropdowns [BQA 4]", async ({ page }) => {
      test.skip(!on("N6"), why("N6"));
      await open(page, r);
      hard(await a.clippedControls(page));
    });
    test("F0 every page — sign-in and dashboard included — has the site footer [BQA 6/10]", async ({ page }) => {
      test.skip(!on("F0"), why("F0"));
      await open(page, r);
      hard((await a.footer(page, acc)).filter((o) => o.id === "F0"));
    });
    test("D3 no image twice on a page [BQA 4]", async ({ page }) => {
      test.skip(!on("D3"), why("D3"));
      await open(page, r);
      hard(await a.duplicateImages(page));
    });
    test("L1 paged card grids end on a full row [BQA 4]", async ({ page }) => {
      test.skip(!on("L1"), why("L1"));
      await open(page, r);
      soft(await a.ragGrids(page), "last grid row is not full");
    });
    test("1.18 colours come from the theme palette", async ({ page }) => {
      test.skip(!on("S2") || !!cfg.allow?.palette, cfg.allow?.palette ? "allow.palette" : why("S2"));
      await open(page, r);
      const res = await c.offPalette(page);
      test.skip(!res.applicable, "the theme declares fewer than 4 colour tokens");
      hard(res.offenders);
    });
    test("1.19 native parts follow the theme (color-scheme, number spinners) [BQA 9]", async ({ page }) => {
      test.skip(!on("K1"), why("K1"));
      await open(page, r);
      hard(await c.nativeSkin(page));
    });
    if (a.isPolicyPath(r, acc)) {
      test("P1/P2 policy text spans its column, 'On this page' is sticky [BQA 8]", async ({ page }) => {
        test.skip(!on("P1"), why("P1"));
        await open(page, r);
        hard(await a.policyLayout(page));
      });
      test("P3 pages a policy names are links [BQA 8]", async ({ page }) => {
        test.skip(!on("P3"), why("P3"));
        await open(page, r);
        soft(await a.policyCrossLinks(page), "page named but not linked");
      });
    }
  });
}

/* ───────── site-wide ───────── */
test.describe("acceptance site-wide", () => {
  test.beforeEach(() => desktopOnce());

  test("1.17 one shape language: every button, field, card and badge shares the site's corners [BQA]", async ({ browser }) => {
    test.skip(!on("S1"), why("S1"));
    test.setTimeout(60_000 + ROUTES.length * 15_000);
    const shapes: any[] = [];
    for (const route of ROUTES) {
      const ctx = await ctxFor(browser, route.auth);
      const page = await ctx.newPage();
      await open(page, route.path);
      shapes.push(...(await c.collectShapes(page, route.path)));
      await ctx.close();
    }
    const shape = c.siteShape(shapes, cfg.design?.shape);
    test.skip(!shape, "too few UI pieces to tell the site's shape");
    hard(c.shapeOutliers(shapes, shape));
  });

  test("F1–F5 footer: legal order, © line, company line, support email, payment logos [BQA 6]", async ({ page }) => {
    await open(page, PUBLIC[0]?.path || "/");
    const list = (await a.footer(page, acc)).filter((o) => o.id !== "F0" && on(o.id));
    hard(list);
  });

  test("C1/C4/C5 cookie choice: accept, reject, manage per category; closing closes [BQA 7]", async ({ browser }) => {
    test.skip(!on("C1"), why("C1"));
    const ctx = await ctxFor(browser, false);
    const page = await ctx.newPage();
    await open(page, PUBLIC[0]?.path || "/");
    hard((await a.cookieConsent(page)).filter((o) => on(o.id)));
    await ctx.close();
  });

  test("C2 Analytics / Marketing cookies are offered only when such scripts load [BQA 7]", async ({ browser }) => {
    test.skip(!on("C2"), why("C2"));
    test.setTimeout(60_000 + PUBLIC.length * 10_000);
    const ctx = await ctxFor(browser, false);
    const page = await ctx.newPage();
    const hosts = new Set<string>();
    page.on("request", (req) => { try { const h = new URL(req.url()).hostname; if (acc.analyticsHosts.some((x: string) => h === x || h.endsWith("." + x))) hosts.add(h); } catch {} });
    await open(page, PUBLIC[0]?.path || "/");
    const cats = await a.cookieCategories(page);
    // accept everything, then browse: whatever loads now is what the site really uses
    await page.locator("button, a").filter({ hasText: /^\s*(accept( all)?|allow all|agree)\s*$/i }).first().click().catch(() => {});
    for (const r of PUBLIC.slice(0, 8)) await page.goto(r.path, { waitUntil: "networkidle" }).catch(() => {});
    const loaded = [...hosts];
    const out: O[] = [];
    if ((cats.analytics || cats.marketing) && !loaded.length)
      out.push({ what: `cookie choices offer ${[cats.analytics && "Analytics", cats.marketing && "Marketing"].filter(Boolean).join(" + ")}, but no analytics/marketing script loads even after "Accept all" — remove the category from the banner and the policy [C2, BQA 7]`, where: "cookie banner" });
    hard(out);
    await ctx.close();
  });

  test("D1 no dead internal links [BQA 2]", async ({ browser, request }) => {
    test.skip(!on("D1"), why("D1"));
    test.setTimeout(120_000 + ROUTES.length * 10_000);
    const links = new Map<string, string>();
    for (const route of ROUTES) {
      const ctx = await ctxFor(browser, route.auth);
      const page = await ctx.newPage();
      await page.goto(route.path, { waitUntil: "domcontentloaded" }).catch(() => {});
      const base = new URL(page.url()).origin;
      for (const h of await page.$$eval("a[href]", (as) => as.map((x) => (x as HTMLAnchorElement).href)).catch(() => [] as string[])) {
        try { const u = new URL(h); if (u.origin === base && !/log-?out|sign-?out|\/api\//i.test(u.pathname) && !links.has(u.pathname)) links.set(u.pathname, route.path); } catch {}
      }
      await ctx.close();
    }
    const dead: O[] = [];
    for (const [path, from] of links) {
      const res = await request.get(path, { maxRedirects: 5, failOnStatusCode: false }).catch(() => null);
      if (!res || res.status() >= 400) dead.push({ what: `${path} answers ${res ? res.status() : "no response"} [D1, BQA 2]`, where: `linked from ${from}` });
    }
    hard(dead);
  });

  test("D2 no pages the product does not need (/gdpr, /press, /currency …) [BQA 1]", async ({ request }) => {
    test.skip(!on("D2"), why("D2"));
    const out: O[] = [];
    for (const p of acc.forbiddenPages) {
      const res = await request.get(p, { maxRedirects: 0, failOnStatusCode: false }).catch(() => null);
      if (res && res.status() === 200) out.push({ what: `${p} exists — the business asked to fold it into the policies [D2, BQA 1]`, where: p });
    }
    hard(out);
  });

  test("M1 the chosen currency applies on every page [BQA 9, BQA]", async ({ browser }) => {
    test.skip(!on("M1") || acc.currencies.length < 2, acc.currencies.length < 2 ? "acceptance.currencies lists fewer than 2 currencies" : why("M1"));
    test.setTimeout(300_000);
    const out: O[] = [];
    for (const code of acc.currencies.slice(0, 2)) {
      for (const auth of [false, ...(SIGNED_IN ? [true] : [])]) {
        const ctx = await ctxFor(browser, auth);
        const page = await ctx.newPage();
        await open(page, (auth ? AUTH : PUBLIC)[0]?.path || "/");
        if (!(await a.chooseCurrency(page, code))) { out.push({ what: `could not pick ${code} in the currency switcher [M1]`, where: "header" }); await ctx.close(); continue; }
        for (const r of (auth ? AUTH : PUBLIC).slice(0, 6)) {
          await page.goto(r.path, { waitUntil: "networkidle" }).catch(() => page.goto(r.path));
          await page.waitForTimeout(800);
          for (const m of await a.currencyMentions(page)) if (m.code !== code && acc.currencies.includes(m.code)) out.push({ what: `${code} chosen, page shows "${m.text}" [M1, BQA 9]`, where: `${r.path} ${m.where}` });
        }
        await ctx.close();
      }
    }
    hard(out.slice(0, 25));
  });

  test("A1/A3/A6 sign-in and sign-up: password eye, one consent checkbox, normal footer [BQA 10, BQA]", async ({ browser }) => {
    test.skip(!on("A1"), why("A1"));
    const out: O[] = [];
    for (const [path, isSignUp] of [[acc.auth.signIn, false], [acc.auth.signUp, true]] as const) {
      if (!path) continue;
      const ctx = await ctxFor(browser, false);
      const page = await ctx.newPage();
      await open(page, path);
      if (!acc.auth.passwordless) out.push(...(await a.passwordEye(page)).filter((o: any) => on(o.id)));
      if (isSignUp && on("A3")) out.push(...(await a.signupConsent(page)));
      if (on("A6")) out.push(...(await a.footer(page, acc)).filter((o) => o.id === "F0").map((o) => ({ ...o, what: `${path}: ${o.what} [A6]` })));
      await ctx.close();
    }
    test.skip(!acc.auth.signIn && !acc.auth.signUp, "acceptance.auth.signIn / signUp not set");
    hard(out);
  });

  test.describe("signed in", () => {
    test.skip(!SIGNED_IN, "no signed-in storage — run `babysitter prepare` with LOGIN_EMAIL / LOGIN_PASSWORD");
    test.use({ storageState: STORAGE });

    test("A5 sign-in / sign-up are not offered to a signed-in user [BQA 6/10, BQA]", async ({ page }) => {
      test.skip(!on("A5"), why("A5"));
      const out: O[] = [];
      for (const p of [acc.auth.signIn, acc.auth.signUp].filter(Boolean) as string[]) {
        await page.goto(p, { waitUntil: "networkidle" }).catch(() => {});
        if (new URL(page.url()).pathname === p) out.push({ what: `${p} still opens for a signed-in user — redirect to the dashboard [A5, BQA]`, where: p });
      }
      for (const r of [...AUTH, ...PUBLIC].slice(0, 6)) {
        await open(page, r.path);
        const cta = await page.locator("header a, header button").filter({ hasText: a.SIGN_IN_CTA_RE }).filter({ visible: true }).count();
        if (cta) out.push({ what: "header offers Sign in / Sign up to a signed-in user [A5]", where: r.path });
      }
      hard(out);
    });

    test("A7 tours and pop-ups show once and close [BQA 10]", async ({ page }) => {
      test.skip(!on("A7"), why("A7"));
      const out: O[] = [];
      const pages = AUTH.slice(0, 3);
      for (let round = 0; round < 2; round++) {
        for (const r of pages) {
          await open(page, r.path);
          const dialog = page.locator('[role=dialog], [role=alertdialog]').filter({ visible: true }).filter({ hasNotText: /cookie/i }).first();
          if (!(await dialog.isVisible().catch(() => false))) continue;
          if (round === 1) out.push({ what: "a tour / pop-up opens again on a page already visited [A7, BQA 10]", where: r.path });
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
          if (await dialog.isVisible().catch(() => false)) {
            const x = dialog.locator('button[aria-label*=close i], button:has-text("Skip"), button:has-text("Got it"), button:has-text("×")').first();
            if (await x.isVisible().catch(() => false)) await x.click(); else out.push({ what: "tour / pop-up does not close with Escape and has no close button [A7]", where: r.path });
          }
        }
      }
      hard(out);
    });

    test("2FA two-factor sign-in is offered in the account settings [owner rule]", async ({ page }) => {
      test.skip(!on("2FA") || acc.twoFactor === "off", acc.twoFactor === "off" ? "acceptance.twoFactor: off" : why("2FA"));
      let claimed = false;
      if (acc.twoFactor === "if-claimed") {
        for (const r of PUBLIC.slice(0, 15)) { await page.goto(r.path).catch(() => {}); if (a.TWO_FA_RE.test(await a.pageText(page))) { claimed = true; break; } }
        test.skip(!claimed, "the site does not claim 2FA (acceptance.twoFactor: if-claimed)");
      }
      const settings = [acc.auth.settings, ...AUTH.map((r) => r.path).filter((p) => /setting|security|account|profile/i.test(p))].filter(Boolean) as string[];
      let found = false;
      for (const p of [...new Set(settings)]) { await open(page, p); if (await a.hasControl(page, a.TWO_FA_RE.source)) { found = true; break; } }
      expect(found, claimed
        ? "the site says it has two-factor sign-in, but no settings page offers it [2FA, honesty rule]"
        : `no settings page offers two-factor sign-in (looked at ${settings.join(", ") || "no settings routes — set acceptance.auth.settings"}) [2FA]`).toBe(true);
    });

    test("A9 a signed-in user can delete their account [BQA 10, GDPR]", async ({ page }) => {
      test.skip(!on("A9") || !acc.accountDeletion, acc.accountDeletion ? why("A9") : "acceptance.accountDeletion: false");
      const settings = [acc.auth.settings, ...AUTH.map((r) => r.path).filter((p) => /setting|account|profile|privacy/i.test(p))].filter(Boolean) as string[];
      let found = false;
      for (const p of [...new Set(settings)]) { await open(page, p); if (await a.hasControl(page, a.DELETE_ACCOUNT_RE.source)) { found = true; break; } }
      expect(found, `no settings page offers "Delete account" (looked at ${settings.join(", ") || "none — set acceptance.auth.settings"}) [A9]`).toBe(true);
    });
  });

  // last, and in its own fresh session: signing out must not end the shared session the other tests use
  test("A4 sign out works with one click and stays signed out [BQA 11]", async ({ browser }) => {
    test.skip(!on("A4"), why("A4"));
    test.skip(!process.env.LOGIN_EMAIL || !cfg.login, "needs LOGIN_EMAIL / LOGIN_PASSWORD and config.login");
    const ctx = await ctxFor(browser, false);
    const page = await ctx.newPage();
    await c.install(page);
    expect(await a.login(page, cfg, test.info().project.use.baseURL), "could not sign in with LOGIN_EMAIL / LOGIN_PASSWORD").toBe(true);
    const home = new URL(page.url()).pathname;
    expect(await a.clickControl(page, a.SIGN_OUT_RE), "no visible Sign out / Log out control (also looked inside header menus) [A4]").toBe(true);
    await page.waitForTimeout(1500);
    await page.goto(home, { waitUntil: "networkidle" }).catch(() => {});
    const still = new URL(page.url()).pathname === home && !(await page.locator("input[type=email], input[type=password]").first().isVisible().catch(() => false));
    expect(still, `after one click on Sign out, ${home} still opens signed in [A4, BQA]`).toBe(false);
    await ctx.close();
  });
});
