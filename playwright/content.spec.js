// Copy on rendered pages (CT1–CT22, docs/checks-content.md): unfinished / defensive copy, test data, raw errors,
// punctuation, dates, grammar, email deliverability + mailto, untranslated text, keys printed as text,
// <html lang>, legal document names, the © line, one term per concept, numbers that contradict each other;
// site-wide: one name per concept (CT19), one set of facts per policy (CT20), one label per destination (CT21), no page
// named that does not exist (CT22).
// Copy is the same at every width, so it runs once, at desktop width. Locales: babysitter.config.json →
// content.locales (prefix / cookie / localStorage), or the page's <link rel=alternate hreflang> when none are set.
//   npm run babysitter -- e2e --only content
// content.skip: ["CT5", …] turns a rule off (content.skipReasons says why).
import { test, expect, describeRoute, opener } from "./express.js";
import * as c from "./checks.js";
import * as k from "./checks/content.js";
import * as cp from "./checks/copy.js";
import { titleFindings, slugFindings, nearCopies, readCopyRegistry, recordCopy } from "../lib/copy-rules.js";
import { resolveStage } from "../lib/stage.js";
import { translationKeys } from "../lib/content-lint.js";
import { loadConfig, loadRoutes, loadLocales, applyLocale as applyDetected, localize, STORAGE, STATE_DIR, ROOT, authTag, storageFor } from "./project.js";
import { existsSync } from "node:fs";
const cfg = loadConfig();
const cc = k.contentConfig(cfg);
const ROUTES = loadRoutes(cfg);
const PUBLIC = ROUTES.filter((r) => !r.auth);
const STRICT = process.env.STRICT !== "0";
const on = (id) => !(cc.skip || []).includes(id);
const why = (id) => `${id} switched off in babysitter.config.json → content.skip${cc.skipReasons?.[id] ? `: ${cc.skipReasons[id]}` : ""}`;
const DNS = process.env.BABYSITTER_DNS !== "0";
// languages: content.locales when set, else the ones `babysitter prepare` found and verified (.babysitter/locales.json)
const DETECTED = (() => { try {
    return loadLocales(cfg);
}
catch {
    return { locales: [] };
} })();
const DEF = (DETECTED.locales || []).find((l) => l.default) || null;
const LOCALES = cc.locales?.length ? cc.locales : (DETECTED.locales || []).filter((l) => !l.default).map((l) => ({ ...l, detected: true }));
const DEFAULT_LOCALE = cc.defaultLocale || DETECTED.default || DEF?.code || null;
const CACHE = k.dnsCache(STATE_DIR);
const STAGE = (() => { try { return resolveStage(cfg, `${STATE_DIR}/stage.json`)?.stage || null; } catch { return null; } })();
let KEYS = null;
const keys = () => (KEYS ??= (() => { try {
    const s = translationKeys(ROOT);
    return s.size ? s : null;
}
catch {
    return null;
} })());
const fmt = (list) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
const hard = (list) => expect(list, fmt(list)).toEqual([]);
/** for a human to decide: listed in the report, never failing the run */
const note = (list, label) => { if (list.length)
    test.info().annotations.push({ type: "check by eye", description: `${label}\n${fmt(list)}` }); };
const once = () => test.skip(!/desktop-1440/.test(test.info().project.name), "copy is the same at every width: runs once, at desktop width");
const open = opener("content", async function open(page, route, loc = null) {
    await c.install(page);
    const baseURL = test.info().project.use.baseURL;
    let path = route;
    if (loc?.detected) {
        await applyDetected(page.context(), loc, baseURL);
        path = localize(route, loc, DEF);
    }
    else
        path = await k.applyLocale(page, loc, route, baseURL);
    await c.gotoStable(page, path);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => { });
    await page.waitForTimeout(700);
    await c.revealLazy(page);
    // a modal open on arrival hides the page from every check behind it (parallel: ~75 failures from one notice): close it, report it once
    await c.dismissArrivalModal(page);
});
/** a context signed in as the route's own role (storage-<role>.json), or signed out for a public route */
async function ctxFor(browser, route) {
    const info = test.info();
    return browser.newContext({ ...info.project.use, storageState: route?.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
}
/* ───────── every page ───────── */
for (const route of ROUTES) {
    describeRoute(route, `content ${authTag(route)}${route.path}`, () => {
        if (route.auth)
            test.use({ storageState: storageFor(route.role) });
        test.beforeEach(() => once());
        const r = route.path;
        test("CT1–CT8 copy: nothing unfinished, no test data or raw errors, no trailing periods or em dashes, one date format, plurals agree", async ({ page }) => {
            await open(page, r);
            const cf = await k.copyFindings(page, cfg, null, null, { own: route.auth ? k.ownEmails(cfg) : [] });
            note(cf.soft, "copy to look at (French spacing)");
            hard(cf.hard);
        });
        test("CT9/CT10 every email address receives mail and is a mailto link", async ({ page }) => {
            test.skip(!on("CT9") && !on("CT10"), why("CT9"));
            await open(page, r);
            const { hard: list, info } = await k.emailFindings(page, { cfg, dns: DNS, cache: CACHE });
            if (info.length)
                test.info().annotations.push({ type: "could not verify", description: info.join("\n") });
            hard(list);
        });
        // 5.5.0 (Parallel 49kc72, Kindred 2b9nt9, Compass wee3g3 / 2hxrol / 4bw126 / 3eikk6)
        test("CT12/CT25/CT29/CT30/P4 no link labelled with its path, no brand URL on another host, e-mails as typed, no catalogue of zeros, section numbers match the contents", async ({ page }) => {
            await open(page, r);
            hard(await cp.copyExtrasFindings(page, cfg, { siteWide: true, stage: STAGE }));
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
        describeRoute(route, `content [${loc.code}] ${authTag(route)}${route.path}`, () => {
            if (route.auth)
                test.use({ storageState: storageFor(route.role) });
            test.beforeEach(() => once());
            test(`CT11–CT13 [${loc.code}] translated: no English left, nothing word for word the default language, no keys, lang/dir right; CT1–CT8 copy`, async ({ page, browser }) => {
                // the same page in the default language: text left unchanged in ${loc.code} is untranslated (CT11, 2nd heuristic)
                let defaults = null;
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
                const untranslated = lang.filter((o) => o.id === "CT11");
                // babysitter.config.json → locales.untranslated: "warn" lists untranslated text without failing
                const warnOnly = !Array.isArray(cfg.locales) && cfg.locales?.untranslated === "warn";
                if (warnOnly)
                    note(untranslated, `untranslated text in ${loc.code}`);
                const cf = await k.copyFindings(page, cfg, copy, loc.code, { own: route.auth ? k.ownEmails(cfg) : [] });
                note(cf.soft, `copy to look at in ${loc.code} (French spacing)`);
                hard([...(warnOnly ? lang.filter((o) => o.id !== "CT11") : lang), ...cf.hard]);
            });
        });
    }
}
/* ───────── site-wide ───────── */
test.describe("content site-wide", () => {
    test.beforeEach(() => once());
    // every route once per language: the records feed CT7 / CT15–CT18
    // one crawl per language for every site-wide test of this worker (5.5.0: a third site-wide test joined)
    const CRAWLS = new Map();
    function crawl(browser, loc = null) {
        const key = loc?.code || "";
        if (!CRAWLS.has(key)) CRAWLS.set(key, crawlOnce(browser, loc).catch((e) => { CRAWLS.delete(key); throw e; }));
        return CRAWLS.get(key);
    }
    const record = async (page, path, loc, template) => { const rec = k.pageRecord(path, await k.collectCopy(page), loc?.code || null); rec.extras = await cp.copyExtrasData(page).catch(() => null); rec.slugs = rec.extras?.slugs || []; rec.template = template || null; return rec; };
    async function crawlOnce(browser, loc = null) {
        const recs = [];
        for (const route of ROUTES) {
            const ctx = await ctxFor(browser, route);
            const page = await ctx.newPage();
            await open(page, route.path, loc);
            recs.push(await record(page, route.path, loc, route.template));
            await ctx.close();
        }
        // legal pages the footer links to but the crawl did not reach
        const seen = new Set(recs.map((x) => x.route.replace(/\/$/, "") || "/"));
        const missing = [...new Set(recs.flatMap((x) => x.legal.map((l) => l.path)))].filter((p) => !seen.has(p));
        for (const p of missing) {
            const ctx = await ctxFor(browser, null);
            const page = await ctx.newPage();
            await open(page, p, loc);
            recs.push(await record(page, p, loc, null));
            await ctx.close();
        }
        return recs;
    }
    test("CT15/CT16 one name per legal document (footer = <h1> = <title> = mentions), one © line on every page", async ({ browser }) => {
        test.skip(!on("CT15") && !on("CT16"), why("CT15"));
        test.setTimeout(120_000 + ROUTES.length * 20_000 * (1 + LOCALES.length));
        const out = [];
        out.push(...k.namingFindings(await crawl(browser), cfg));
        for (const loc of LOCALES)
            out.push(...k.namingFindings(await crawl(browser, loc), cfg).map((o) => ({ ...o, what: `[${loc.code}] ${o.what}` })));
        hard(out);
    });
    test("CT17 one term per concept (content.glossary is enforced per page; mixed Sign in / Log in listed here) · CT18 numbers agree across pages · CT19–CT22 one name per concept, one set of facts per policy, one label per destination, no page named that does not exist · CT7 one date per document in every language", async ({ browser, request }) => {
        test.setTimeout(120_000 + ROUTES.length * 20_000 * (1 + LOCALES.length));
        const base = await crawl(browser);
        const byLocale = new Map([[DEFAULT_LOCALE || "default", base]]);
        for (const loc of LOCALES)
            byLocale.set(loc.code, await crawl(browser, loc));
        if (on("CT17"))
            note(k.variantFindings(base), "the same thing named two ways");
        // CT20 owns refund windows and retention periods when it runs (one report per conflict)
        if (on("CT18"))
            note(k.factFindings(base, { exclude: on("CT20") ? ["refund", "storage"] : [] }), "numbers that disagree between pages — check which one is true");
        // CT22 (a) dead links: D1 (acceptance.spec) reports them in a full run; with --only content this run does
        const dead = [];
        if (on("CT22") && process.env.BABYSITTER_ONLY === "content") {
            const crawled = new Set([...byLocale.values()].flat().map((r) => r.route.replace(/\/$/, "") || "/"));
            const targets = new Map();
            for (const r of base)
                for (const l of r.links || [])
                    if (!crawled.has(l.path) && !targets.has(l.path) && !/log-?out|sign-?out|\/api\//i.test(l.path))
                        targets.set(l.path, { path: l.path, label: l.label, where: `${r.route} ${l.region}` });
            for (const t of [...targets.values()].slice(0, 80)) {
                const res = await request.get(t.path, { maxRedirects: 5, failOnStatusCode: false }).catch(() => null);
                if (!res || res.status() >= 400)
                    dead.push({ ...t, status: res ? res.status() : "no response" });
            }
        }
        // where each linked path lands: a 3xx answer is a redirect (CT21 counts the link at its destination, CT22 names it)
        const redirects = new Map();
        if (on("CT21") || on("CT22")) {
            const paths = [...new Set(base.flatMap((r) => (r.links || []).map((l) => l.path)))].filter((p) => !/log-?out|sign-?out|\/api\//i.test(p)).slice(0, 150);
            for (const p of paths) {
                const res = await request.get(p, { maxRedirects: 0, failOnStatusCode: false }).catch(() => null);
                const loc = res && res.status() >= 300 && res.status() < 400 ? res.headers()["location"] : null;
                if (!loc)
                    continue;
                try {
                    const u = new URL(loc, "http://x" + p);
                    const to = u.pathname.replace(/\/$/, "") || "/";
                    if (to !== p && !/^\/(en|fr|de|es|az|kk|ru)(\/|$)/.test(to.replace(p, "")) && !/(sign-?in|log-?in|signin|login|auth)(\/|$)/i.test(to))
                        redirects.set(p, to); // a locale prefix or the sign-in gate is not a moved page
                }
                catch { }
            }
        }
        // 5.5.0: CT19 / CT20 / CT7 ran only inside the redirect block above (a comment swallowed its closing brace):
        // with CT21 and CT22 switched off, their findings were never reported
        {
            const consistency = ["CT19", "CT20", "CT21", "CT22"].some(on) ? k.consistencyRendered(byLocale, cfg, { defaultLocale: DEFAULT_LOCALE, deadLinks: dead, redirects }) : [];
            note(consistency.filter((x) => x.soft), "one list in two orders (CT31) — check which order is meant");
            hard([...(on("CT7") ? k.localeDateFindings(byLocale) : []), ...consistency.filter((x) => !x.soft)]);
        }
    });
    // 5.5.0 (Compass r7i2dc / ebev0t / bymtup / 853l4n / 33jce3 / 8t3qh1, Kindred brypwi)
    test("CT24/CT26/CT28/6.15 no headline copied from a sibling product, no slug shown as a name, one letter case per heading, every page its own <title>", async ({ browser }) => {
        test.setTimeout(120_000 + ROUTES.length * 20_000 * (1 + LOCALES.length));
        const base = await crawl(browser);
        const out = [];
        if (on("CT26")) out.push(...slugFindings(base));
        if (on("CT28")) out.push(...cp.siteCaseFindings(base, cfg));
        if (on("6.15")) {
            out.push(...titleFindings(base, { brands: [cfg.name].filter(Boolean) }));
            for (const loc of LOCALES) out.push(...titleFindings(await crawl(browser, loc), { brands: [cfg.name].filter(Boolean) }).map((o) => ({ ...o, what: `[${loc.code}] ${o.what}` })));
        }
        // CT24: the public h1s of every product this machine has checked (~/.claudes-babysitter/copy.json)
        const self = cfg.name || new URL(test.info().project.use.baseURL || "http://x").hostname;
        const mine = base.filter((r) => !ROUTES.find((x) => x.path === r.route)?.auth).flatMap((r) => (r.h1 || []).slice(0, 1).map((text) => ({ route: r.route, text })));
        if (on("CT24")) out.push(...nearCopies(mine, readCopyRegistry(), self));
        recordCopy(self, mine);
        hard(out);
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
        const alts = first.alternates.filter((a) => a.code && a.code !== "x-default" && a.code.toLowerCase().split("-")[0] !== own);
        test.skip(!alts.length, "no <link rel=alternate hreflang> to other languages — list them in content.locales to check them");
        const out = [];
        const base = new URL(page.url()).origin;
        for (const a of alts) {
            const altBase = new URL(a.href);
            for (const r of PUBLIC.slice(0, 12)) {
                // the alternate of the home page tells where the language lives: a path prefix or another host
                const prefix = altBase.pathname.replace(/\/$/, "");
                const url = altBase.origin === base ? (prefix && r.path === "/" ? prefix : prefix + r.path) : altBase.origin + r.path;
                await page.goto(url, { waitUntil: "load" }).catch(() => { });
                await page.waitForTimeout(500);
                out.push(...(await k.languageFindings(page, { cfg, locale: a.code, keys: keys() })).hard.map((o) => ({ ...o, where: `${url} ${o.where}` })));
            }
        }
        await ctx.close();
        hard(out);
    });
});
void STRICT;
void existsSync;
void STORAGE;
