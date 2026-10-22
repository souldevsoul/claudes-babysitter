// Runtime checks for ui-architecture-guidelines.md. Each test names the guideline and the Nexus patterns it guards.
//   node playwright/prepare.mjs   # optional: login + crawl → .babysitter/routes.json
//   npx playwright test -c playwright/playwright.config.js
//   STRICT=0 turns the heuristic checks into warnings.
import { test, expect } from "@playwright/test";
import * as c from "./checks.js";
import * as fit from "./checks/fit.js";
import * as looks from "./checks/looks.js";
import * as details from "./checks/details.js";
import * as boxes from "./checks/boxes.js";
import * as money from "./checks/money.js";
import { loadConfig, loadRoutes, storageFor } from "./project.js";
const cfg = loadConfig();
const ROUTES = loadRoutes(cfg);
const STRICT = process.env.STRICT !== "0";
const allow = cfg.allow || {};
const fmt = (list) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
/**
 * Load, then wait for the network to go quiet for at most `idleCap` ms: a site with long-polling, analytics beacons or
 * a chat widget never reaches networkidle, and an unbounded networkidle wait held a page until the test timed out.
 */
async function goto(page, route, idleCap = 8_000) {
    await c.gotoStable(page, route);
    await page.waitForLoadState("networkidle", { timeout: idleCap }).catch(() => { });
}
async function open(page, route) {
    await c.install(page);
    await goto(page, route);
    await page.waitForTimeout(800); // late fonts / hydration
    if (await c.applyColorScheme(page))
        await page.waitForTimeout(300); // class-based dark theme
    await c.revealLazy(page); // reveal-on-scroll sections render as a reader sees them
    // a modal open on arrival hides the page from every check behind it (parallel: ~75 failures from one notice): close it, report it once
    await c.dismissArrivalModal(page);
}
const hard = (list) => expect(list, fmt(list)).toEqual([]);
function soft(list, label) {
    if (!list.length)
        return;
    if (STRICT)
        expect(list, `${label}\n${fmt(list)}`).toEqual([]);
    else
        test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(list)}` });
}
for (const route of ROUTES) {
    test.describe(`${route.auth ? `[signed-in${route.role ? `: ${route.role}` : ""}] ` : ""}${route.path}`, () => {
        if (route.auth)
            test.use({ storageState: storageFor(route.role) });
        const r = route.path;
        test("2.1 no horizontal scroll, nothing outside the viewport [P15 P16]", async ({ page }) => { await open(page, r); hard(await c.horizontalOverflow(page)); });
        test("2.10 controls stay inside their card, and no container cuts them off [P16]", async ({ page }) => { await open(page, r); hard(await c.escapesBox(page)); });
        test("2.14 text is shown in full: not cut by the screen edge or a box that clips, not spilling out of its button / badge / card, no truncated option [P16]", async ({ page }) => {
            await open(page, r);
            const { hard: list, eye } = await fit.textCutOff(page);
            if (eye.length)
                test.info().annotations.push({ type: "check by eye", description: fmt(eye) });
            // 5.5.0 (Compass 7bouc8): a placeholder is text too
            hard([...list, ...(await money.placeholderCut(page))]);
        });
        test("2.15 a shadow is not cut off by a box that clips [P16]", async ({ page }) => {
            await open(page, r);
            const { hard: list, eye } = await details.shadowClipped(page);
            if (eye.length)
                test.info().annotations.push({ type: "check by eye", description: fmt(eye) });
            hard(list);
        });
        test("2.16 a pinned panel's scroll box ends on the screen [P16]", async ({ page }) => { await open(page, r); hard(await details.stuckScrollPastScreen(page)); });
        test("6.13 a link in a sentence is not marked by colour alone (WCAG 1.4.1) [P34]", async ({ page }) => { await open(page, r); hard(await details.colourOnlyLinks(page)); });
        // 5.5.0 — boxes, icons, the header (playwright/checks/boxes.js; Praxis, Kindred, Compass cards)
        test("2.14 table cells and icons: text does not run into the next cell, icons are not cut or squeezed [P16]", async ({ page }) => { await open(page, r); hard([...(await boxes.cellSpill(page)), ...(await boxes.iconClipped(page))]); });
        test("2.18 a rounded box does not scroll itself · 2.19 an empty box does not scroll · 2.20 a panel does not scroll sideways over nothing [P21 P16]", async ({ page }) => { await open(page, r); hard([...(await boxes.roundedScroller(page)), ...(await boxes.emptyScroller(page)), ...(await boxes.sidewaysScroll(page))]); });
        test("2.24 an icon and its label have a gap [P16]", async ({ page }) => { await open(page, r); const g = await boxes.iconGap(page); soft(g.soft, "icon close to its label"); hard(g.hard); });
        test("1.20 the header's word controls share one typeface · 3.5 a desktop header shows its navigation · 3.10 a burger beside the nav adds something [P04 P10]", async ({ page }, info) => {
            test.skip((info.project.use.viewport?.width ?? 1440) < 1024, "desktop widths (the header's full row)");
            await open(page, r);
            const out = [...(await boxes.headerFaces(page))];
            if ((cfg.layout || {}).desktopNav !== "menu")
                out.push(...(await boxes.desktopHeaderNav(page)));
            out.push(...(await boxes.burgerRepeatsNav(page)));
            hard(out);
        });
        test("6.9 a focused field shows one ring (the frame's, not the inner input's) [P09]", async ({ page }) => { await open(page, r); hard(await boxes.innerFocusRing(page)); });
        test("1.22 sibling cards have the same parts [P27]", async ({ page }) => { await open(page, r); soft(await boxes.siblingParts(page), "a card lacks a part its row has"); });
        test("1.1 no native select/date/file/checkbox/radio [P01 P03 P50]", async ({ page }) => { await open(page, r); hard(await c.nativeControls(page)); });
        test("6.4 text ≥12px, legible weight, contrast ≥4.5:1 (3:1 large) [P11 P34]", async ({ page }) => {
            await open(page, r);
            const { hard: list, eye } = await c.illegibleText(page, !!allow.lightWeights);
            if (eye.length)
                test.info().annotations.push({ type: "check by eye", description: fmt(eye) });
            hard(list);
        });
        test("1.12 no emoji used as icons [P40]", async ({ page }) => {
            test.skip(!!allow.emoji, "emoji allowed by babysitter.config.json");
            await open(page, r);
            hard(await c.emoji(page));
        });
        test("6.10 raster images delivered at ≥2× (≥1.5× tolerated) [P56]", async ({ page }) => {
            await open(page, r);
            await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
                scrollTo(0, y);
                await new Promise((res) => setTimeout(res, 120));
            } scrollTo(0, 0); });
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
        test("modal open on arrival: reported once, the other checks run behind it [arrival-modal]", async ({ page }) => {
            await open(page, r);
            const m = c.arrivalModalFindings(page.__bsArrival);
            soft(m.soft, "a modal dialog is open on arrival");
            hard(m.hard);
        });
        test("3.8 page loads scrolled to top [P52]", async ({ page }) => { await open(page, r); expect(await c.scrollY(page)).toBe(0); });
        test("4.6 cookie banner does not cover navigation [P57]", async ({ page }) => { await open(page, r); hard(await c.cookieCovers(page)); });
        test("4.6 cookie settings replace the banner, panel fits, its switches are drawn right [P19 P18]", async ({ page }) => { await open(page, r); hard(await c.cookieFlow(page)); });
        test("4.8 a page translated by the browser survives its controls [P60]", async ({ page }) => { await open(page, r); hard(await c.translationSurvives(page)); });
        test("1.11 logo link hugs the logo [P58]", async ({ page }) => { await open(page, r); hard(await c.logoLink(page)); });
        test("2.6 cards in a row: equal height, CTAs and prices aligned, no double seams [P27 P55]", async ({ page }) => { await open(page, r); hard(await c.rowAlignment(page)); });
        test("2.12 repeated rows keep column positions [P48]", async ({ page }) => { await open(page, r); soft(await c.repeatedRowColumns(page), "row columns shift"); });
        test("2.3 tables keep every column on mobile [P16]", async ({ page }) => { await open(page, r); hard(await c.tableClipping(page)); });
        test("5.1 scroll containers are not rounded [P21]", async ({ page }) => { await open(page, r); hard(await c.scrollbarRadius(page)); });
        test("1.9 inputs visible at rest [P09]", async ({ page }) => { await open(page, r); hard(await c.inputVisibility(page)); });
        test("1.4 button label stays readable on hover [P06]", async ({ page }) => {
            await open(page, r);
            const { hard: list, eye } = await c.hoverContrastDetailed(page);
            if (eye.length)
                test.info().annotations.push({ type: "check by eye", description: fmt(eye) });
            hard(list);
        });
        test("1.18 tick boxes, radios and switches look checked when checked; switch thumbs sit in the track", async ({ page }) => { await open(page, r); hard(await c.checkedState(page)); });
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
            if (m.eye.length)
                test.info().annotations.push({ type: "check by eye", description: fmt(m.eye) });
            if (m.soft.length) {
                if (STRICT)
                    expect.soft(m.soft, `open mobile menu\n${fmt(m.soft)}`).toEqual([]);
                else
                    test.info().annotations.push({ type: "warning", description: `open mobile menu\n${fmt(m.soft)}` });
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
        const mo = cfg.motion || {};
        const max = Number(mo.maxClicks ?? 30);
        const clickBudget = Number(mo.clickBudget ?? 20_000); // one click, judged and toggled back
        const pageBudget = Number(mo.pageBudget ?? 180_000); // all clicks on one page, reloads included
        const lanes = Math.max(1, Number(mo.concurrency ?? 4)); // pages checked at once
        const openBudget = 60_000;
        const timeout = 60_000 + Math.ceil(ROUTES.length / lanes) * (openBudget + pageBudget);
        test.setTimeout(timeout);
        // findings are reported before the test's own timeout can throw them away: everything stops at `deadline`
        const deadline = Date.now() + timeout - 40_000;
        const within = (p, ms, fallback) => { let t; return Promise.race([p.catch(() => fallback), new Promise((res) => { t = setTimeout(() => res(fallback), Math.max(0, ms)); })]).finally(() => clearTimeout(t)); };
        const hardG = new Map();
        const softG = new Map();
        const notTested = [];
        const budgetHits = [];
        const add = (g, f, route) => {
            const k = `${f.kind}|${f.sig}`;
            const e = g.get(k) || { what: f.what, where: f.where, pages: [] };
            if (!e.pages.includes(route))
                e.pages.push(route);
            g.set(k, e);
        };
        const queue = [...ROUTES];
        const timings = [];
        const worker = async () => {
            for (let route = queue.shift(); route; route = queue.shift()) {
                if (deadline - Date.now() < 10_000) {
                    queue.unshift(route);
                    return;
                }
                const t0 = Date.now();
                const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
                const page = await ctx.newPage();
                try {
                    const opened = await within(open(page, route.path).then(() => true), Math.min(openBudget, deadline - Date.now()), false);
                    if (!opened) {
                        const line = `${route.path}: not tested (time budget) — the page did not open within ${Math.round(openBudget / 1000)} s`;
                        notTested.push(line);
                        budgetHits.push(line);
                        continue;
                    }
                    const reload = async () => { await goto(page, route.path, 3_000); await page.waitForTimeout(500); if (await c.applyColorScheme(page))
                        await page.waitForTimeout(300); };
                    const r = await c.interactionMotion(page, { reload, max, clickBudget, deadline: Math.min(deadline, Date.now() + pageBudget) });
                    for (const f of r.hard)
                        add(hardG, f, route.path);
                    for (const f of r.soft)
                        add(softG, f, route.path);
                    for (const n of r.notTested) {
                        const line = `${route.path}: ${n.count} not tested — ${n.reason}${n.examples.length ? ` (e.g. ${n.examples.join("; ")})` : ""}`;
                        notTested.push(line);
                        if (/time budget|did not reload/.test(n.reason))
                            budgetHits.push(line);
                    }
                }
                catch (e) {
                    notTested.push(`${route.path}: not tested — the check failed on this page: ${String(e.message || e).split("\n")[0]}`);
                }
                finally {
                    await within(ctx.close(), 10_000, undefined);
                    timings.push(`${route.path} ${Math.round((Date.now() - t0) / 1000)}s`);
                }
            }
        };
        await within(Promise.all(Array.from({ length: lanes }, worker)).then(() => undefined), deadline - Date.now() + 20_000, undefined);
        if (queue.length) {
            const line = `${queue.length} page(s) not tested (time budget — the run's ${Math.round(timeout / 60_000)} min ran out): ${queue.map((r) => r.path).join(", ")}`;
            notTested.push(line);
            budgetHits.push(line);
        }
        test.info().annotations.push({ type: "timing", description: timings.join(", ") });
        if (budgetHits.length)
            console.log(`6.12 [${info.project.name}] time budget hit — not every control was clicked:\n${budgetHits.map((x) => `  ${x}`).join("\n")}`);
        const show = (g) => [...g.values()].map((e) => `  • ${e.what} — ${e.where} — on ${e.pages.join(", ")}`).join("\n");
        if (notTested.length)
            test.info().annotations.push({ type: "not tested", description: notTested.join("\n") });
        if (softG.size) {
            if (STRICT)
                expect.soft([...softG.values()], `control state changes that snap\n${show(softG)}`).toEqual([]);
            else
                test.info().annotations.push({ type: "warning", description: `control state changes that snap\n${show(softG)}` });
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
        const sigs = [];
        for (const route of ROUTES) {
            const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
            const page = await ctx.newPage();
            await open(page, route.path);
            sigs.push(...(await c.collectSignatures(page, route.path)));
            await ctx.close();
        }
        const lim = { buttonRadii: 2, buttonFonts: 1, buttonHeights: 3, cardRadii: 3, cardStyles: 4, inputHeights: 2, inputRadii: 2, ...(cfg.consistency || {}) };
        const problems = [];
        const check = (label, list, max) => {
            if (list.length > max)
                problems.push(`${label}: ${list.length} variants (allowed ${max})\n${list.map((v) => `    ${v.value} ×${v.count} — e.g. ${v.example}`).join("\n")}`);
        };
        check("filled-button corner radius", c.variety(sigs, "button", "radius", (s) => !!s.filled), lim.buttonRadii);
        // fonts are compared within one button variant: a mono primary CTA next to a serif ghost button is a design choice
        for (const v of new Set(sigs.filter((s) => s.kind === "button").map((s) => s.variant)))
            check(`button font family (variant ${v})`, c.variety(sigs, "button", "font", (s) => s.variant === v), lim.buttonFonts);
        check("button height", c.variety(sigs, "button", "height"), lim.buttonHeights);
        check("input height", c.variety(sigs, "input", "height", (s) => s.height > 0), lim.inputHeights);
        check("input corner radius", c.variety(sigs, "input", "radius", (s) => s.radius !== null), lim.inputRadii); // underline-only fields have no corners
        check("card corner radius", c.variety(sigs, "card", "radius"), lim.cardRadii);
        check("card style (radius + fill + border + shadow + padding)", c.variety(sigs, "card", "skin"), lim.cardStyles);
        // 3.5 — the open mobile menu speaks the site's language: its buttons vs the CTA set above, its corners vs the cards
        if (/mobile/.test(info.project.name)) {
            const home = ROUTES.find((x) => !x.auth && x.path === "/") || ROUTES.find((x) => !x.auth) || ROUTES[0];
            const ctx = await browser.newContext({ ...info.project.use, storageState: home.auth ? storageFor(home.role) : undefined, baseURL: info.project.use.baseURL });
            const page = await ctx.newPage();
            await open(page, home.path);
            const menu = await c.mobileMenuConsistency(page, sigs);
            await ctx.close();
            if (menu.list.length) {
                if (STRICT)
                    expect.soft(menu.list, `open mobile menu does not match the site\n${fmt(menu.list)}`).toEqual([]);
                else
                    test.info().annotations.push({ type: "warning", description: `open mobile menu does not match the site\n${fmt(menu.list)}` });
            }
        }
        expect(problems, problems.join("\n\n")).toEqual([]);
    });
    test("1.20 one look per role across pages: buttons (filled / outlined), tags, cards and inputs share their corners and case [P04 P46 P47]", async ({ browser }, info) => {
        test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
        test.setTimeout(60_000 + ROUTES.length * 15_000);
        const items = [];
        const notTested = [];
        for (const route of ROUTES) {
            const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
            const page = await ctx.newPage();
            try {
                await open(page, route.path);
                items.push(...(await looks.collectRoleLooks(page, route.path)));
            }
            catch (e) {
                notTested.push(`${route.path}: ${String(e.message).split("\n")[0]}`);
            }
            await ctx.close();
        }
        if (notTested.length)
            test.info().annotations.push({ type: "not tested", description: notTested.join("\n") });
        const r = looks.roleLookOutliers(items, { radiusTolerance: Number(cfg.consistency?.radiusTolerance ?? 4) });
        soft(r.soft, "corner radius differs between pages (same corner family)");
        hard(r.hard);
    });
    // 5.5.0: one placement of the "Most popular" badge (Kindred fqsn52), one accent hue (Compass u5brwv / 9ln1xx), page
    // titles in one case (Kindred 9ha0j4), one accent style in headings (Compass 5dudz9, soft)
    test("1.20 one placement of the popular badge · 1.21 one accent per site · 6.5 page titles in one case, one accent style in headings [P04 P46]", async ({ browser }, info) => {
        test.skip(!/mobile-390|desktop-1440/.test(info.project.name), "run at one mobile and one desktop width");
        test.setTimeout(60_000 + ROUTES.length * 15_000);
        const list = [];
        const notTested = [];
        for (const route of ROUTES) {
            const ctx = await browser.newContext({ ...info.project.use, storageState: route.auth ? storageFor(route.role) : undefined, baseURL: info.project.use.baseURL });
            const page = await ctx.newPage();
            try {
                await open(page, route.path);
                list.push(await boxes.siteSignals(page, route.path));
            }
            catch (e) {
                notTested.push(`${route.path}: ${String(e.message).split("\n")[0]}`);
            }
            await ctx.close();
        }
        if (notTested.length)
            test.info().annotations.push({ type: "not tested", description: notTested.join("\n") });
        const r = boxes.siteSignalFindings(list);
        soft(r.soft, "heading accent styles differ between pages");
        hard(r.hard);
    });
});
