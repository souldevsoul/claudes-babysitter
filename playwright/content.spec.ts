// Copy on rendered pages (CT1–CT18, docs/checks-content.md): unfinished / defensive copy, test data, raw errors,
// punctuation, dates, grammar, email deliverability + mailto, untranslated text, keys printed as text,
// <html lang>, legal document names, the © line, one term per concept, numbers that contradict each other.
// Copy is the same at every width, so it runs once, at desktop width. Locales: babysitter.config.json →
// content.locales (prefix / cookie / localStorage), or the page's <link rel=alternate hreflang> when none are set.
//   npm run babysitter -- e2e --only content
// content.skip: ["CT5", …] turns a rule off (content.skipReasons says why).
import { test, expect, type Page, type Browser } from "@playwright/test";
import * as c from "./checks.js";
import * as k from "./checks/content.js";
import { translationKeys } from "../lib/content-lint.js";
import { loadConfig, loadRoutes, loadLocales, applyLocale as applyDetected, localize, STORAGE, STATE_DIR, ROOT, authTag, storageFor } from "./project.js";
import { existsSync } from "node:fs";

const cfg = loadConfig();
const cc = k.contentConfig(cfg);
const ROUTES = loadRoutes(cfg);
const PUBLIC = ROUTES.filter((r) => !r.auth);
const STRICT = process.env.STRICT !== "0";
const on = (id: string) => !(cc.skip || []).includes(id);
const why = (id: string) => `${id} switched off in babysitter.config.json → content.skip${cc.skipReasons?.[id] ? `: ${cc.skipReasons[id]}` : ""}`;
const DNS = process.env.BABYSITTER_DNS !== "0";
// languages: content.locales when set, else the ones `babysitter prepare` found and verified (.babysitter/locales.json)
const DETECTED: any = (() => { try { return loadLocales(cfg); } catch { return { locales: [] }; } })();
const DEF = (DETECTED.locales || []).find((l: any) => l.default) || null;
const LOCALES: any[] = cc.locales?.length ? cc.locales : (DETECTED.locales || []).filter((l: any) => !l.default).map((l: any) => ({ ...l, detected: true }));
const DEFAULT_LOCALE = cc.defaultLocale || DETECTED.default || DEF?.code || null;
const CACHE = k.dnsCache(STATE_DIR);
let KEYS: Set<string> | null = null;
const keys = () => (KEYS ??= (() => { try { const s = translationKeys(ROOT); return s.size ? s : null; } catch { return null; } })());

type O = { what: string; where: string };
const fmt = (list: O[]) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
const hard = (list: O[]) => expect(list, fmt(list)).toEqual([]);
/** for a human to decide: listed in the report, never failing the run */
const note = (list: O[], label: string) => { if (list.length) test.info().annotations.push({ type: "check by eye", description: `${label}\n${fmt(list)}` }); };
const once = () => test.skip(!/desktop-1440/.test(test.info().project.name), "copy is the same at every width: runs once, at desktop width");

async function open(page: Page, route: string, loc: any = null) {
  await c.install(page);
  const baseURL = test.info().project.use.baseURL;
  let path = route;
  if (loc?.detected) { await applyDetected(page.context(), loc, baseURL); path = localize(route, loc, DEF); }
  else path = await k.applyLocale(page, loc, route, baseURL);
  await page.goto(path, { waitUntil: "load", timeout: 45_000 }).catch(() => page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 }));
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(700);
  await c.revealLazy(page);
}
/** a context signed in as the route's own role (storage-<role>.json), or signed out for a public route */
async function ctxFor(browser: Browser, route: { auth?: boolean; role?: string } | null) {
  const info = test.info();
  return browser.newContext({ ...info.project.use, storageState: route?.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
}

/* ───────── every page ───────── */
for (const route of ROUTES) {
  test.describe(`content ${authTag(route)}${route.path}`, () => {
    if (route.auth) test.use({ storageState: storageFor(route.role) });
    test.beforeEach(() => once());
    const r = route.path;

    test("CT1–CT8 copy: nothing unfinished, no test data or raw errors, no trailing periods or em dashes, one date format, plurals agree", async ({ page }) => {
      await open(page, r);
      hard((await k.copyFindings(page, cfg)).hard);
    });
    test("CT9/CT10 every email address receives mail and is a mailto link", async ({ page }) => {
      test.skip(!on("CT9") && !on("CT10"), why("CT9"));
      await open(page, r);
      const { hard: list, info } = await k.emailFindings(page, { cfg, dns: DNS, cache: CACHE });
      if (info.length) test.info().annotations.push({ type: "could not verify", description: info.join("\n") });
      hard(list);
    });
    test("CT12/CT13 no translation keys on screen; <html lang>/dir match the language", async ({ page }) => {
      await open(page, r);
      hard((await k.languageFindings(page, { cfg, keys: keys(), locale: DEFAULT_LOCALE })).hard);
    });
  });
}

/* ───────── each configured locale ───────── */
for (const loc of LOCALES) {
  for (const route of ROUTES) {
    test.describe(`content [${loc.code}] ${authTag(route)}${route.path}`, () => {
      if (route.auth) test.use({ storageState: storageFor(route.role) });
      test.beforeEach(() => once());
      test(`CT11–CT13 [${loc.code}] translated: no English left, nothing word for word the default language, no keys, lang/dir right; CT1–CT8 copy`, async ({ page, browser }) => {
        // the same page in the default language: text left unchanged in ${loc.code} is untranslated (CT11, 2nd heuristic)
        let defaults: any = null;
        if (on("CT11")) {
          const dctx = await ctxFor(browser, route);
          const dp = await dctx.newPage();
          await open(dp, route.path, DEF ? { ...DEF, detected: true } : null);
          defaults = await k.collectCopy(dp).catch(() => null);
          await dctx.close();
        }
        await open(page, route.path, loc);
        const copy = await k.collectCopy(page);
        const lang = (await k.languageFindings(page, { cfg, copy, locale: loc.code, keys: keys(), defaults, defaultLocale: DEFAULT_LOCALE })).hard;
        const untranslated = lang.filter((o: any) => o.id === "CT11");
        // babysitter.config.json → locales.untranslated: "warn" lists untranslated text without failing
        const warnOnly = !Array.isArray(cfg.locales) && cfg.locales?.untranslated === "warn";
        if (warnOnly) note(untranslated, `untranslated text in ${loc.code}`);
        hard([...(warnOnly ? lang.filter((o: any) => o.id !== "CT11") : lang), ...(await k.copyFindings(page, cfg, copy)).hard]);
      });
    });
  }
}

/* ───────── site-wide ───────── */
test.describe("content site-wide", () => {
  test.beforeEach(() => once());

  // every route once per language: the records feed CT7 / CT15–CT18
  async function crawl(browser: Browser, loc: any = null) {
    const recs: any[] = [];
    for (const route of ROUTES) {
      const ctx = await ctxFor(browser, route);
      const page = await ctx.newPage();
      await open(page, route.path, loc);
      recs.push(k.pageRecord(route.path, await k.collectCopy(page), loc?.code || null));
      await ctx.close();
    }
    // legal pages the footer links to but the crawl did not reach
    const seen = new Set(recs.map((x) => x.route.replace(/\/$/, "") || "/"));
    const missing = [...new Set(recs.flatMap((x) => x.legal.map((l: any) => l.path)))].filter((p) => !seen.has(p));
    for (const p of missing) {
      const ctx = await ctxFor(browser, null);
      const page = await ctx.newPage();
      await open(page, p, loc);
      recs.push(k.pageRecord(p, await k.collectCopy(page), loc?.code || null));
      await ctx.close();
    }
    return recs;
  }

  test("CT15/CT16 one name per legal document (footer = <h1> = <title> = mentions), one © line on every page", async ({ browser }) => {
    test.skip(!on("CT15") && !on("CT16"), why("CT15"));
    test.setTimeout(120_000 + ROUTES.length * 20_000 * (1 + LOCALES.length));
    const out: O[] = [];
    out.push(...k.namingFindings(await crawl(browser), cfg));
    for (const loc of LOCALES) out.push(...k.namingFindings(await crawl(browser, loc), cfg).map((o: O) => ({ ...o, what: `[${loc.code}] ${o.what}` })));
    hard(out);
  });

  test("CT17 one term per concept (content.glossary is enforced per page; mixed Sign in / Log in listed here) · CT18 numbers agree across pages · CT7 one date per document in every language", async ({ browser }) => {
    test.setTimeout(120_000 + ROUTES.length * 20_000 * (1 + LOCALES.length));
    const base = await crawl(browser);
    const byLocale = new Map([[DEFAULT_LOCALE || "default", base]]);
    for (const loc of LOCALES) byLocale.set(loc.code, await crawl(browser, loc));
    if (on("CT17")) note(k.variantFindings(base), "the same thing named two ways");
    if (on("CT18")) note(k.factFindings(base), "numbers that disagree between pages — check which one is true");
    hard(on("CT7") ? k.localeDateFindings(byLocale) : []);
  });

  test("CT11 other languages the site offers (hreflang) are translated", async ({ browser }) => {
    test.skip(LOCALES.length > 0, "the languages are known (content.locales or prepare): each has its own tests");
    test.skip(!on("CT11"), why("CT11"));
    test.setTimeout(120_000 + PUBLIC.length * 15_000 * 4);
    const ctx = await ctxFor(browser, null);
    const page = await ctx.newPage();
    await open(page, PUBLIC[0]?.path || "/");
    const first = await k.collectCopy(page);
    const own = (first.lang || "").toLowerCase().split("-")[0];
    const alts = first.alternates.filter((a: any) => a.code && a.code !== "x-default" && a.code.toLowerCase().split("-")[0] !== own);
    test.skip(!alts.length, "no <link rel=alternate hreflang> to other languages — list them in content.locales to check them");
    const out: O[] = [];
    const base = new URL(page.url()).origin;
    for (const a of alts) {
      const altBase = new URL(a.href);
      for (const r of PUBLIC.slice(0, 12)) {
        // the alternate of the home page tells where the language lives: a path prefix or another host
        const prefix = altBase.pathname.replace(/\/$/, "");
        const url = altBase.origin === base ? (prefix && r.path === "/" ? prefix : prefix + r.path) : altBase.origin + r.path;
        await page.goto(url, { waitUntil: "load" }).catch(() => {});
        await page.waitForTimeout(500);
        out.push(...(await k.languageFindings(page, { cfg, locale: a.code, keys: keys() })).hard.map((o: O) => ({ ...o, where: `${url} ${o.where}` })));
      }
    }
    await ctx.close();
    hard(out);
  });
});
void STRICT; void existsSync; void STORAGE;
