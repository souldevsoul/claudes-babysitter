// Layout / navigation / money runtime checks (playwright/checks/layout.js). Same projects and routes as
// babysitter.spec.ts; site-wide comparisons (names vs pages, heading styles, favicon) live in "site-wide layout".
//   STRICT=0 turns the soft (heuristic) checks into warnings.
import { test, expect } from "@playwright/test";
import * as c from "./checks.js";
import * as L from "./checks/layout.js";
import * as boxes from "./checks/boxes.js";
import * as Rh from "./checks/rhythm.js";
import * as M from "./checks/money.js";
import { WALLET_RE } from "./checks/run.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, loadRoutes, ROOT, authTag, storageFor } from "./project.js";
const cfg = loadConfig();
const ROUTES = loadRoutes(cfg);
const STRICT = process.env.STRICT !== "0";
const lay = cfg.layout || {};
// the product's name in the favicon registry: config name, then package name, else the site's host
const PRODUCT = cfg.name || (() => { try {
    const p = resolve(ROOT, "package.json");
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).name : "";
}
catch {
    return "";
} })() || "";
const notes = (label, list) => { if (list?.length)
    test.info().annotations.push({ type: "not tested", description: `${label}\n${list.join("\n")}` }); };
const fmt = (list) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
async function goto(page, route, idleCap = 8_000) {
    const resp = await c.gotoStable(page, route);
    await page.waitForLoadState("networkidle", { timeout: idleCap }).catch(() => { });
    return resp;
}
/** Opens the route as a reader sees it; returns the HTTP status (0 when unknown). */
async function open(page, route) {
    await c.install(page);
    const resp = await goto(page, route);
    await page.waitForTimeout(800);
    if (await c.applyColorScheme(page))
        await page.waitForTimeout(300);
    await c.revealLazy(page);
    // a modal open on arrival hides the page from every check behind it (parallel: ~75 failures from one notice): close it, report it once
    await c.dismissArrivalModal(page);
    return resp ? resp.status() : 0;
}
const hard = (list) => expect(list, fmt(list)).toEqual([]);
function soft(list, label) {
    if (!list.length)
        return;
    if (STRICT)
        expect.soft(list, `${label}\n${fmt(list)}`).toEqual([]);
    else
        test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}
for (const route of ROUTES) {
    test.describe(`${authTag(route)}${route.path} layout`, () => {
        if (route.auth)
            test.use({ storageState: storageFor(route.role) });
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
            let b = { hard: [], soft: [] };
            if (/mobile-390/.test(info.project.name) && !info.config.projects.some((p) => /mobile-360/.test(p.name))) {
                const vp = page.viewportSize();
                await page.setViewportSize({ width: 360, height: vp.height });
                await page.waitForTimeout(400);
                b = await L.textBreaks(page);
            }
            const merge = (x, y) => [...x, ...y.filter((f) => !x.some((g) => g.where === f.where))];
            soft(merge(a.soft, b.soft), "orphan words in headings");
            hard(merge(a.hard, b.hard));
        });
        test("2.7/2.4 near-miss alignment (2–12 px): stacked siblings, side-by-side columns, form fields and labels; table headers over their values [alignment table-layout]", async ({ page }) => {
            await open(page, r);
            const a = await L.alignment(page);
            soft(a.soft, "near-miss alignment");
            hard(a.hard);
        });
        // 5.5.0 (Praxis, Parallel, Compass, Kindred cards): rhythm and alignment measured from the glyphs — ranges split at
        // their dash, headings broken by a forced break, the wordmark on two lines (2.5); one slot wrapping in a row of
        // equals, stacked buttons of two widths, dividers on a stacked strip (2.6); markers / badges off their label, side
        // nav vs content, fields of one row (2.7); text over text (2.11); key–value rows (2.12); one content width (2.17);
        // squeezed text (2.21); two-column blocks (2.22); uneven list / row gaps (2.23); section headings of one look (6.5)
        test("2.5/2.6/2.7/2.11/2.12/2.17/2.21/2.22/2.23/6.5 rhythm: ranges on one line, equal slots, levels, one content width, column rules, even gaps [rhythm]", async ({ page }) => {
            await open(page, r);
            const x = await Rh.rhythmChecks(page);
            soft(x.soft, "aligned with a decorative rule");
            hard(x.hard);
        });
        test("2.7 no excess empty space between or inside sections — crops attached [empty-space]", async ({ page }) => {
            await open(page, r);
            const e = await L.emptySpace(page, Number(lay.emptySpaceRatio ?? 2.5));
            for (const [i, clip] of e.crops.entries()) {
                const png = await page.screenshot({ clip, fullPage: true }).catch(() => null);
                if (png)
                    await test.info().attach(`empty-space-${i + 1}.png`, { body: png, contentType: "image/png" });
            }
            soft(e.soft, "excess empty space (see the attached crops)");
        });
        test("3.6 the header stays on screen after scrolling 1000 px [sticky-header]", async ({ page }) => {
            await open(page, r);
            const s = await L.stickyHeader(page, Number(lay.stickyDistance ?? 1000));
            test.skip(!s.applicable, s.minimal ? "a minimal header (the logo and Back to home): no navigation to keep in reach" : "no header bar at the top, or the page does not scroll 400 px");
            const list = s.ok ? [] : [{ what: s.what, where: s.where }];
            if (lay.stickyHeader === false)
                soft(list, "header scrolls away (layout.stickyHeader is false: reported, not failed)");
            else
                hard(list);
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
        // 5.5.0 (Kindred 1rto89): the hover that is there draws an even edge and does not move the card
        test("1.6 hover draws an even edge on every side and does not move the card [hover-state]", async ({ page }, info) => {
            test.skip(/mobile|tablet/.test(info.project.name), "pointer screens only");
            await open(page, r);
            const h = await boxes.hoverEdge(page, { max: Number(lay.maxHoverEdge ?? 10) });
            soft(h.soft, "hover moves the card");
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
            // 5.5.0 (Compass 34ebhu, rqgkrl, 9rkp6z): a range that fits in one currency breaks in another — 2.5 after each switch
            const ranges = [];
            const m = await L.moneyFormat(page, Number(lay.maxCurrencies ?? 8), { rateDecimals: Number(lay.rateDecimals ?? 4), each: async (code) => { for (const f of await Rh.rangeSplit(page))
                    if (!ranges.some((g) => g.where === f.where)) ranges.push({ ...f, what: `in ${code}: ${f.what}` }); } });
            m.hard.push(...ranges);
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
    test("3.7 nav names match their pages; 6.5 one heading style per level; 1.2 ticks on one side; 2.7 one content top per shell; 2.22 one two-column rule", async ({ browser }, info) => {
        test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
        test.setTimeout(60_000 + ROUTES.length * 20_000);
        const pages = [];
        const heads = [];
        const marks = [];
        const shells = [], cols = [];
        const notTested = [];
        for (const route of ROUTES) {
            const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
            const page = await ctx.newPage();
            try {
                const status = await open(page, route.path);
                if (status >= 400) {
                    notTested.push(`${route.path}: HTTP ${status} (an error page is not compared)`);
                    await ctx.close();
                    continue;
                }
                pages.push(await L.navParity(page));
                // 5.5.0 (Praxis dbrs0h, Compass 1wq9va): one content top per app shell, one rule per two-column block
                shells.push({ route: route.path, shell: (await Rh.shellTops(page).catch(() => ({ shell: null }))).shell });
                cols.push({ route: route.path, rules: (await Rh.twoColumnRule(page).catch(() => ({ rules: [] }))).rules });
                heads.push(...(await L.collectHeadings(page, route.path)));
                for (const mk of (await L.dropdowns(page, 6)).marks)
                    marks.push({ ...mk, page: route.path });
            }
            catch (e) {
                notTested.push(`${route.path}: ${String(e.message).split("\n")[0]}`);
            }
            await ctx.close();
        }
        if (notTested.length)
            test.info().annotations.push({ type: "not tested", description: notTested.join("\n") });
        const rhythmAcross = [...Rh.shellTopsAcross(shells), ...Rh.twoColumnRulesAcross(cols)];
        if (rhythmAcross.length)
            expect.soft(rhythmAcross, `one shell, one content top; one rule per two-column block [2.7 2.22]\n${fmt(rhythmAcross)}`).toEqual([]);
        const m = L.navTitleMismatches(pages);
        soft(m.soft, "nav label and page title differ");
        if (m.hard.length)
            expect.soft(m.hard, `nav names vs pages\n${fmt(m.hard)}`).toEqual([]);
        const max = Number(lay.headingVariants ?? 2);
        const show = (v) => v.map((x) => `    ${x.look} ×${x.count} on ${x.pages.slice(0, 6).join(", ")}${x.pages.length > 6 ? ", …" : ""} — e.g. ${x.example}`).join("\n");
        // hard: h1 in more than `max` faces (family / weight / tracking / case); soft: more than `max` sizes+faces, any h2 spread
        const sw = [];
        for (const tag of ["h1", "h2"]) {
            const looks = L.headingVariants(heads, tag), faces = L.headingVariants(heads, tag, "face");
            if (looks.length > max)
                sw.push({ what: `${tag} comes in ${looks.length} looks (size + face) at this width (allowed ${max}) — one text-style token per level [6.5]\n${show(looks)}`, where: `${tag} across pages` });
            if (tag === "h2" && faces.length > max)
                sw.push({ what: `h2 comes in ${faces.length} faces at this width (allowed ${max}) [6.5]\n${show(faces)}`, where: "h2 across pages" });
        }
        soft(sw, "heading styles");
        const sides = new Set(marks.map((m) => m.side));
        if (sides.size > 1)
            expect.soft(marks.map((m) => `${m.side}: ${m.where} on ${m.page}`), "the selected-option tick sits on different sides in different dropdowns — one side everywhere [1.2 / 1.18]").toEqual([]);
        const f1 = L.headingVariants(heads, "h1", "face");
        expect(f1.length, `h1 comes in ${f1.length} faces (family / weight / tracking / case) at this width (allowed ${max}) — page titles should use one text style token [6.5]\n${show(f1)}`).toBeLessThanOrEqual(max);
    });
    // 5.5.0 (Compass 5nel9b, 84u591, xivil1, zcg5fp): one credits count, one price per currency on every page and in the
    // top-up dialog; one unit and basis for one entity's rate
    test("B4 one conversion everywhere: the same credits cost the same in each currency on every page and in the top-up dialog; one unit per rate", async ({ browser }, info) => {
        test.skip(!/desktop-1440/.test(info.project.name), "once per run");
        const list = ROUTES.slice(0, Number(lay.moneyRoutes ?? 20));
        test.setTimeout(60_000 + list.length * 45_000);
        const records = [], prices = [], notTested = [], dialogFindings = [];
        for (const route of list) {
            const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
            const page = await ctx.newPage();
            try {
                if ((await open(page, route.path)) >= 400) { await ctx.close(); continue; }
                prices.push({ place: route.path, prices: await M.entityPrices(page) });
                // a signed-in page with a top-up opener: the dialog's packs, in the same currency, never submitted
                const wallet = route.auth ? page.locator("main button, header button, [role=button]").filter({ hasText: WALLET_RE }).filter({ visible: true }).first() : null;
                const onEach = async (code, rec) => {
                    records.push({ place: `${route.path}${code ? ` (${code})` : ""}`, pairs: rec?.pairs || [] });
                    if (!wallet || !(await wallet.isVisible().catch(() => false))) return;
                    await wallet.click({ timeout: 2500 });
                    await page.waitForTimeout(800);
                    const d = await M.moneyPairs(page, { scope: "[role=dialog], dialog[open]" });
                    records.push({ place: `${route.path} top-up dialog${code ? ` (${code})` : ""}`, pairs: d.pairs });
                    // the dialog as a reader sees it in this currency (Compass 7bouc8 / kdn5xf / 6lyos0: EUR placeholder cut,
                    // "6 000 credits" next to "1,000")
                    const lbl = `top-up dialog${code ? ` in ${code}` : ""}`;
                    for (const f of [...(await M.placeholderCut(page)), ...(await M.numberGrouping(page))]) if (!dialogFindings.some((x) => x.what.endsWith(f.what))) dialogFindings.push({ ...f, what: `${route.path} ${lbl}: ${f.what}` });
                    await page.keyboard.press("Escape").catch(() => { });
                    await page.waitForTimeout(400);
                };
                await page.route("**/*", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
                await L.moneyFormat(page, 3, { onEach });
            }
            catch (e) {
                notTested.push(`${route.path}: ${String(e.message).split("\n")[0]}`);
            }
            await ctx.close();
        }
        notes("money site-wide", notTested);
        hard([...M.conversionConflicts(records), ...M.entityPriceConflicts(prices), ...dialogFindings]);
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
    // 5.5.0 (Kindred kytm39, bmlrc4): one brand mark — the footer logo is the header's, the tab icon is the mark, the
    // web manifest names the brand
    test("1.11 one brand mark: footer logo = header logo, favicon = the mark, manifest = the brand [logo-link favicon]", async ({ browser }, info) => {
        test.skip(!/desktop-1440/.test(info.project.name), "once per run");
        const home = ROUTES.find((x) => !x.auth && x.path === "/") || ROUTES[0];
        const ctx = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
        const page = await ctx.newPage();
        await open(page, home.path);
        const m = await boxes.brandMark(page, { brandTerms: (cfg.content?.brandTerms || []).concat(cfg.name ? [cfg.name] : []) });
        await ctx.close();
        if (m.eye.length)
            test.info().annotations.push({ type: "check by eye", description: fmt(m.eye) });
        soft(m.soft, "brand mark");
        hard(m.hard);
    });
});
