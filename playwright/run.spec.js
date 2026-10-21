// What the page-level checks cannot see on a page at rest (Praxis, 2026-10: 21 cards missed although a check existed —
// the check never ran there):
//   • every language the site speaks: overflow, escapes, contrast, money and clipped labels at every viewport
//     (untranslated text is CT11 in content.spec, once per language) (locales from prepare → .babysitter/locales.json);
//   • states: every dialog / sheet / dropdown opened, forms submitted empty, wizard steps walked with sample data,
//     top-up dialogs opened in "no-pay" mode, pagination — the same checks re-run in each (checks/run.js);
//   • 3.8: in-app navigation and #anchor links land at the top / below the sticky header.
// Nothing is sent, created or paid: every non-GET request is aborted while states are driven.
import { test, expect } from "@playwright/test";
import * as c from "./checks.js";
import * as a from "./acceptance.js";
import * as run from "./checks/run.js";
import * as L from "./checks/layout.js";
import * as fit from "./checks/fit.js";
import { loadConfig, loadRoutes, storageFor, loadLocales, applyLocale, localize, viewports } from "./project.js";
const cfg = loadConfig();
const ROUTES = loadRoutes(cfg);
const LOC = loadLocales(cfg);
const acc = a.acceptanceConfig(cfg);
const STRICT = process.env.STRICT !== "0";
const st = cfg.states || {};
const allowLight = !!cfg.allow?.lightWeights;
const opts = { allowLightWeights: allowLight, noTax: acc.noTax, thousandsFrom: acc.thousandsFrom, customAmount: acc.customAmount };
const DEFAULT = LOC.locales.find((l) => l.default) || null;
const OTHERS = LOC.locales.filter((l) => !l.default);
// states and scroll: the narrowest and the widest viewport of the run (360 + 1440 by default)
const VPS = viewports(cfg).slice().sort((x, y) => x.width - y.width);
const EDGE = new Set([VPS[0]?.name, VPS[VPS.length - 1]?.name]);
const atEdges = () => test.skip(![...EDGE].some((n) => test.info().project.name === n || test.info().project.name.startsWith(`${n}-`)), `runs at the narrowest and widest viewports (${[...EDGE].join(", ")})`);
const fmt = (list) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
const hard = (list) => expect(list, fmt(list)).toEqual([]);
function soft(list, label) {
    if (!list.length)
        return;
    if (STRICT)
        expect.soft(list, `${label}\n${fmt(list)}`).toEqual([]);
    else
        test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}
async function goto(page, url) {
    await c.gotoStable(page, url);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => { });
    await page.waitForTimeout(800);
    if (await c.applyColorScheme(page))
        await page.waitForTimeout(300);
    await c.revealLazy(page);
    // a modal open on arrival hides the page from every check behind it (parallel: ~75 failures from one notice): close it, report it once
    await c.dismissArrivalModal(page);
}
/** A page of `route` in locale `loc` (the default when null), signed in as the route's role when it needs one. */
async function openIn(browser, route, loc) {
    const info = test.info();
    const baseURL = info.project.use.baseURL;
    const ctx = await browser.newContext({ ...info.project.use, ...(loc && !loc.default ? { locale: loc.code } : {}), storageState: route.auth ? storageFor(route.role) : undefined, baseURL });
    await applyLocale(ctx, loc, baseURL);
    const page = await ctx.newPage();
    await c.install(page);
    const url = new URL(localize(route.path, loc, DEFAULT), loc?.origin || baseURL).href;
    await goto(page, url);
    return { ctx, page, url, reload: async () => { await goto(page, url); } };
}
const tag = (loc) => (loc && !loc.default ? ` [${loc.code}]` : "");
for (const route of ROUTES) {
    test.describe(`run ${route.auth ? `[signed-in${route.role ? `: ${route.role}` : ""}] ` : ""}${route.path}`, () => {
        /* languages: every check whose result depends on the words, at every viewport */
        for (const loc of OTHERS) {
            test(`i18n [${loc.code}] 2.1/2.10/2.14/6.4/B4/N6/2.5: the page in ${loc.code} fits and reads (untranslated text: CT11, content.spec) [P15 P16]`, async ({ browser }) => {
                test.setTimeout(150_000);
                const { ctx, page } = await openIn(browser, route, loc);
                const list = [];
                const add = (label, arr) => list.push(...arr.map((o) => ({ ...o, what: `[${loc.code}] ${o.what}${/\[(2\.|6\.|B4|N6|i18n)/.test(o.what) ? "" : ` [${label}]`}` })));
                add("2.1", await c.horizontalOverflow(page));
                add("2.10", await c.escapesBox(page));
                add("6.4", (await c.illegibleText(page, allowLight)).hard);
                add("B4", await a.moneyText(page, opts));
                add("N6", await a.clippedControls(page));
                add("2.14", (await fit.textCutOff(page)).hard); // 5.2.0: a longer language cuts text that fits in English
                // 2.5 words broken mid-word / numbers split / orphans: a longer language breaks what fits in English (Praxis KK
                // "ТАПСЫРМА" broken by letters at 360) — layout.spec checks the default language, this checks the others
                let breaks = { hard: [], soft: [] };
                if ((page.viewportSize()?.width ?? 1440) < 768) {
                    breaks = await L.textBreaks(page);
                    add("2.5", breaks.hard);
                }
                await ctx.close();
                // untranslated text is CT11 in content.spec (both heuristics: English left, or the default-language text
                // unchanged) — reported there once per language, not again at every viewport here
                const p2 = await openIn(browser, route, loc);
                soft([...(await run.headerNavWraps(p2.page)), ...(await c.overlappingText(p2.page)), ...breaks.soft].map((o) => ({ ...o, what: `[${loc.code}] ${o.what}` })), `nav wraps / text covered / orphan words in ${loc.code}`);
                await p2.ctx.close();
                hard(list);
            });
        }
        /* states: dialogs, menus, empty submits, wizards, pagination — in every language */
        for (const loc of [DEFAULT, ...OTHERS]) {
            test(`states${tag(loc)} 2.10/2.1/2.14/6.4/B4/N6/A1/4.4/3.8 inside dialogs, menus, after an empty submit, wizard steps, pagination [P16 P52]`, async ({ browser }) => {
                atEdges();
                test.skip(st.enabled === false, "babysitter.config.json → states.enabled: false");
                const pageBudget = Number(st.pageBudget ?? 240_000);
                test.setTimeout(pageBudget + 60_000);
                const { ctx, page, reload } = await openIn(browser, route, loc);
                const res = await run.stateChecks(page, { reload, opts, maxOpeners: Number(st.maxOpeners ?? 15), maxForms: Number(st.maxForms ?? 3), maxSteps: Number(st.maxSteps ?? 6), wallet: st.wallet !== false, deadline: Date.now() + pageBudget });
                await ctx.close();
                test.info().annotations.push({ type: "states", description: res.states.join("; ") || "no state reached" });
                if (res.notTested.length)
                    test.info().annotations.push({ type: "not tested", description: res.notTested.map((x) => `${route.path}${tag(loc)}: ${x}`).join("\n") });
                hard(res.findings.map((f) => ({ ...f, what: `${tag(loc).trim()} ${f.what}`.trim() })));
            });
        }
        /* 3.8 — in-app navigation and #anchors */
        test("3.8 in-app links open the next page at its top; #anchor links land below the sticky header [P52]", async ({ browser }) => {
            atEdges();
            test.setTimeout(120_000);
            const { ctx, page } = await openIn(browser, route, DEFAULT);
            const list = [...(await run.anchorTargets(page)), ...(await run.scrollAfterNavigation(page))];
            await ctx.close();
            hard(list);
        });
    });
}
