// RUN area: checks that need the page driven into a state first, and the scroll checks of 3.8 / 4.4.
//   stateChecks        — the page-level layout, contrast, money and label checks re-run inside every dialog, sheet and
//                        dropdown a visitor can open, after an empty form submit, after each wizard step (sample data;
//                        payment and final submits are never pressed) and after a pagination click
//   scrollAfterNavigation — an in-app link (client-side route change) opens the new page at the top
//   anchorTargets      — a #anchor link brings its target into view below the sticky header
//   textRuns / untranslated — the text of a page in another locale that is still the default locale's text
// Findings follow playwright/checks.js: { what, where, selector?, human? } — what is wrong, where, how to fix it.
// Plain JavaScript (see checks.js). Page-level checks need checks.install(page) first.
import * as c from "../checks.js";
import * as a from "../acceptance.js";
import { untranslatedReason, untranslatedWhat } from "../../lib/content-rules.js";

/* ───────────────────────── shared ───────────────────────── */

// "Pay", "Place order", "Submit application", "Confirm hire" … the last press of a flow: never pressed by a check
export const FINAL_RE = /\b(pay|pay now|checkout|check out|purchase|place (the )?order|buy( now)?|subscribe|submit( (application|request|order|task))?|send( (message|request|application))?|apply( now)?|confirm( (hire|payment|order|purchase|booking))?|hire|book( now)?|finish|complete( (order|purchase|payment|application))?|publish|post( task)?|create( account)?|sign ?up|register|delete|remove|cancel (subscription|order|task)|withdraw|transfer|оплат\w*|купить|отправить|подтверд\w*|заказать|удалить|ödə\w*|göndər\w*|təsdiq\w*|sil\b|төле\w*|жіберу|жібер\w*|растау|жою)\b/i;
// opens a top-up / checkout dialog: clicked in "no-pay" mode (opened and checked, never paid)
export const WALLET_RE = /\b(add (credits|funds|money|balance)|top ?-?up|buy credits|get credits|deposit|recharge|refill|пополн\w*|balansı artır\w*|kredit (al|əlavə)\w*|толтыр\w*|кредит (сатып|қос)\w*)\b/i;
// a step forward in a multi-step form
export const NEXT_RE = /^(next|next step|continue|proceed|forward|далее|дальше|продолжить|вперёд|növbəti|davam( et)?|irəli|келесі|жалғастыру|әрі қарай|weiter|suivant|siguiente|avanti|dalej)\b/i;
const MUTATING = (route) => (/^(GET|HEAD|OPTIONS)$/.test(route.request().method()) ? route.fallback() : route.abort());

const within = (p, ms, fallback) => { let t; return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => { t = setTimeout(() => res(fallback), Math.max(0, ms)); })]).finally(() => clearTimeout(t)); };

/** Bottom edge of what is pinned to the top of the screen (sticky/fixed header, step bar), 0 when nothing is. */
const stickyTop = (page) => page.evaluate(() => {
    let bottom = 0;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "sticky")
            continue;
        if (!window.__uiVisible(el) || el.closest("[role=dialog], [role=alertdialog], [role=listbox], [role=menu], [data-radix-popper-content-wrapper]"))
            continue;
        const r = el.getBoundingClientRect();
        // a bar across the top: starts at the top edge, spans most of the width, not a full-screen layer
        if (r.top <= 2 && r.width >= innerWidth * 0.6 && r.height < innerHeight * 0.4)
            bottom = Math.max(bottom, r.bottom);
    }
    return Math.round(bottom);
});

/** The checks that depend on what is on screen: re-run in every state. */
export async function measure(page, { allowLightWeights = false, noTax = true, thousandsFrom = 1000 } = {}) {
    const list = [];
    const add = (check, arr) => { for (const f of arr || []) list.push({ ...f, check }); };
    add("2.1", await c.horizontalOverflow(page).catch(() => []));
    add("2.10", await c.escapesBox(page).catch(() => []));
    add("6.4", (await c.illegibleText(page, allowLightWeights).catch(() => ({ hard: [] }))).hard);
    add("B4", await a.moneyText(page, { noTax, thousandsFrom }).catch(() => []));
    add("N6", await a.clippedControls(page).catch(() => []));
    add("A1", await a.passwordEye(page).catch(() => []));
    return list;
}
const keyOf = (f) => `${f.check}|${f.selector || f.where}|${String(f.what).replace(/\d+(\.\d+)?/g, "#")}`;
/** What a state added: findings that were not there on the page at rest. */
export const newIn = (base, now) => { const seen = new Set(base.map(keyOf)); const out = []; const mine = new Set(); for (const f of now) { const k = keyOf(f); if (!seen.has(k) && !mine.has(k)) { mine.add(k); out.push(f); } } return out; };

/* ───────────────────────── sample data for a form step ───────────────────────── */

/**
 * Fills the visible, empty fields of `scope` (a CSS selector, default the page) with plausible sample values so a
 * wizard can move to its next step: emails, phones, numbers within min/max, dates, long-enough text, the first real
 * option of a select, required tick boxes, one radio per group, the first option of a kit combobox. Card and bank
 * fields are never filled. Returns how many fields were filled.
 */
export async function fillSample(page, scope = "body") {
    const marks = await page.evaluate((scope) => {
        const root = document.querySelector(scope) || document.body;
        const out = [];
        let i = 0;
        const card = (el) => /cc-|card|cvc|cvv|iban|account.?number|routing|expir/i.test([el.getAttribute("autocomplete"), el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label")].join(" "));
        for (const el of Array.from(root.querySelectorAll("input, textarea, select, [role=combobox], [role=radiogroup]"))) {
            if (!window.__uiVisible(el) || el.disabled || el.readOnly || el.closest("[aria-hidden=true], [inert]") || card(el))
                continue;
            const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "text").toLowerCase();
            if (tag === "input" && /^(hidden|submit|button|reset|image|file|range|color)$/.test(type))
                continue;
            if (tag === "input" && (type === "checkbox" || type === "radio")) {
                if (el.checked)
                    continue;
                if (type === "radio" && el.name && root.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`))
                    continue;
                if (type === "checkbox" && !el.required && !/agree|accept|terms|consent|соглас|razı|келіс/i.test((el.closest("label") || el.parentElement || el).textContent || ""))
                    continue;
                if (type === "radio" && out.some((o) => o.kind === "radio" && o.name === el.name))
                    continue;
            }
            else if (tag === "select") {
                if (el.selectedIndex > 0 && el.value)
                    continue;
            }
            else if (el.getAttribute("role") === "combobox" && tag !== "input") {
                if ((el.textContent || "").trim() && !/select|choose|выбер|seç|таңда/i.test(el.textContent || "") && !el.hasAttribute("data-placeholder") && !el.querySelector("[data-placeholder]"))
                    continue;
            }
            else if (el.getAttribute("role") === "radiogroup") {
                if (el.querySelector("[aria-checked=true], [data-state=checked], input:checked"))
                    continue;
            }
            else if ((el.value || "").trim())
                continue;
            el.setAttribute("data-bs-fill", String(i));
            out.push({ i: i++, kind: tag === "select" ? "select" : el.getAttribute("role") === "combobox" && tag !== "input" ? "combobox" : el.getAttribute("role") === "radiogroup" ? "radiogroup" : tag === "textarea" ? "textarea" : type, name: el.name || "", hint: [el.name, el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("autocomplete")].join(" ").toLowerCase(), min: el.getAttribute("min"), max: el.getAttribute("max"), minLength: Number(el.getAttribute("minlength") || 0), maxLength: Number(el.getAttribute("maxlength") || 0) });
        }
        return out;
    }, scope).catch(() => []);
    let filled = 0;
    const d = new Date(Date.now() + 7 * 864e5);
    const iso = d.toISOString().slice(0, 10);
    for (const m of marks) {
        const loc = page.locator(`[data-bs-fill="${m.i}"]`).first();
        const text = (base) => { let v = base; while (m.minLength && v.length < m.minLength) v += " " + base; return m.maxLength ? v.slice(0, m.maxLength) : v; };
        let ok = true;
        try {
            if (m.kind === "checkbox" || m.kind === "radio") await loc.check({ timeout: 1500, force: true });
            else if (m.kind === "select") {
                const vals = await loc.evaluate((s) => Array.from(s.options).filter((o) => !o.disabled && o.value).map((o) => o.value));
                if (vals.length) await loc.selectOption(vals[0], { timeout: 1500 }); else ok = false;
            }
            else if (m.kind === "combobox") {
                await loc.click({ timeout: 1500 });
                const opt = page.locator("[role=option]:not([aria-disabled=true])").filter({ visible: true }).first();
                if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) await opt.click({ timeout: 1500 }); else { ok = false; await page.keyboard.press("Escape").catch(() => { }); }
            }
            else if (m.kind === "radiogroup") await loc.locator("[role=radio], input[type=radio], button").first().click({ timeout: 1500 });
            else {
                const v = m.kind === "email" || /mail/.test(m.hint) ? "babysitter.check@example.com"
                    : m.kind === "tel" || /phone|tel\b|mobile/.test(m.hint) ? "+12025550123"
                        : m.kind === "number" ? String(m.min != null && m.min !== "" ? Math.max(Number(m.min), Math.min(Number(m.max ?? Infinity), Number(m.min) || 1)) : 1)
                            : m.kind === "url" || /website|url|link/.test(m.hint) ? "https://example.com"
                                : m.kind === "date" ? iso : m.kind === "datetime-local" ? `${iso}T10:00` : m.kind === "time" ? "10:00" : m.kind === "month" ? iso.slice(0, 7)
                                    : m.kind === "password" ? "Sample-Passw0rd!2026"
                                        : /name/.test(m.hint) ? text("Alex Sample")
                                            : /zip|postal|postcode/.test(m.hint) ? "10001"
                                                : /city/.test(m.hint) ? "Berlin"
                                                    : m.kind === "textarea" ? text("Sample text written by the layout check, long enough for a minimum length rule.") : text("Sample text");
                await loc.fill(v, { timeout: 1500 });
            }
        }
        catch {
            ok = false;
        }
        if (ok)
            filled++;
    }
    await page.evaluate(() => { for (const e of document.querySelectorAll("[data-bs-fill]")) e.removeAttribute("data-bs-fill"); }).catch(() => { });
    return filled;
}

/* ───────────────────────── 3.8 scroll on navigation, #anchors ───────────────────────── */

/**
 * 3.8 — after an in-app link (a client-side route change, the case browsers do not handle by themselves) the new page
 * opens at its top. The page is scrolled to the bottom first, as a reader who reached the footer, then up to `max`
 * same-origin links to other pages are followed (footer first, then main). Navigation that is not GET is impossible
 * here (links only). Returns findings; each names the link and how far down the new page opened.
 */
export async function scrollAfterNavigation(page, { max = 2 } = {}) {
    const out = [];
    const home = page.url();
    const links = await page.evaluate((max) => {
        const here = location.pathname;
        const bad = /log-?out|sign-?out|delete|unsubscribe|\/api\/|\.(pdf|zip|png|jpe?g|svg|csv)$/i;
        const pick = [];
        for (const zone of ["footer", "main", "body"]) {
            for (const el of Array.from(document.querySelectorAll(`${zone} a[href]`))) {
                if (pick.length >= max)
                    break;
                let u;
                try { u = new URL(el.href); } catch { continue; }
                if (u.origin !== location.origin || u.pathname === here || bad.test(u.pathname) || el.target === "_blank" || el.hasAttribute("download") || pick.some((p) => p.path === u.pathname))
                    continue;
                if (!window.__uiVisible(el) && zone !== "footer")
                    continue;
                el.setAttribute("data-bs-nav", String(pick.length));
                pick.push({ i: pick.length, path: u.pathname + u.search, hash: u.hash, label: ((el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40)) || u.pathname, where: window.__uiDescribe(el), selector: window.__uiSelector(el) });
            }
            if (pick.length >= max)
                break;
        }
        return pick;
    }, max).catch(() => []);
    for (const l of links) {
        if (page.url() !== home) {
            await page.goto(home, { waitUntil: "load", timeout: 30_000 }).catch(() => { });
            await page.waitForTimeout(500);
            // the same link again: same target (hash included) and label — the first "/contact" may be another link
            await page.evaluate((l) => { const same = Array.from(document.querySelectorAll("a[href]")).filter((a) => { try { const u = new URL(a.href); return u.pathname + u.search === l.path && u.hash === l.hash; } catch { return false; } }); const el = same.find((a) => ((a.textContent || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40) || "") === l.label) || same[0]; if (el) el.setAttribute("data-bs-nav", String(l.i)); }, l).catch(() => { });
        }
        const loc = page.locator(`[data-bs-nav="${l.i}"]`).first();
        if (!(await loc.count().catch(() => 0)))
            continue;
        await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
        // the reader is at the bottom: scroll the whole page down, then bring the link back into view at the bottom
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => { });
        await page.waitForTimeout(300);
        await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
        const before = await page.evaluate(() => window.scrollY).catch(() => 0);
        if (before < 200)
            continue; // a page too short to scroll says nothing about the reset
        await loc.click({ timeout: 3000, noWaitAfter: false }).catch(() => { });
        await page.waitForURL((u) => u.pathname + u.search === l.path, { timeout: 8000 }).catch(() => { });
        if (new URL(page.url()).pathname + new URL(page.url()).search !== l.path)
            continue; // the link did not go there (a modal link, an intercepted click): not a navigation
        await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });
        await page.waitForTimeout(900);
        await c.settle(page, 1500);
        await scrollRest(page, 4000); // a smooth scroll to a #hash target can take seconds (Praxis /contact#contact-form)
        const y = await page.evaluate(() => window.scrollY).catch(() => 0);
        if (l.hash) {
            // the router scrolls to the #target once the new page has rendered — up to seconds later (Praxis
            // /about → /contact#contact-form landed after ~2.5 s): judge it only when it has had 6 s to get there
            let r = await anchorPlacement(page, l.hash.slice(1));
            for (const t0 = Date.now(); r && r.problem && Date.now() - t0 < 6000;) {
                await page.waitForTimeout(300);
                await scrollRest(page, 1500);
                r = await anchorPlacement(page, l.hash.slice(1));
            }
            if (r && r.problem)
                out.push({ what: `after the link "${l.label}" to ${l.path}${l.hash} ${r.problem} [3.8, P52]`, where: l.where, selector: l.selector });
        }
        else if (y > 40) // a few px left over (a scroll-padding, a late banner) are not "opened in the middle" (Praxis: 3-4 px)
            out.push({ what: `after the in-app link "${l.label}" the new page ${l.path} opens scrolled ${Math.round(y)}px down instead of at its top — reset the scroll on route change (Next: do not pass scroll={false}; a custom scroll container must scrollTo(0,0) on pathname change) [3.8, P52]`, where: l.where, selector: l.selector });
    }
    if (page.url() !== home)
        await page.goto(home, { waitUntil: "load", timeout: 30_000 }).catch(() => { });
    return out;
}

/** Waits until the page stops scrolling (scrollY unchanged for ~500 ms, at most `cap` ms). */
const scrollRest = (page, cap = 3000) => page.evaluate((cap) => new Promise((res) => { let last = -1, same = 0; const t0 = performance.now(); const tick = () => { const y = scrollY; same = y === last ? same + 1 : 0; last = y; if (same >= 30 || performance.now() - t0 > cap) res(null); else requestAnimationFrame(tick); }; tick(); }), cap).catch(() => { });

/** Where an anchor's target landed: { problem } when it is under the sticky header or off-screen, null when no target. */
async function anchorPlacement(page, id) {
    const header = await stickyTop(page);
    return page.evaluate(({ id, header }) => {
        const el = document.getElementById(decodeURIComponent(id)) || document.getElementsByName(decodeURIComponent(id))[0];
        if (!el)
            return null;
        const r = el.getBoundingClientRect();
        if (r.top < header - 2)
            return { problem: `leaves its target #${id} ${Math.round(header - r.top)}px under the sticky header (target top ${Math.round(r.top)}px, header ends at ${header}px) — give the target scroll-margin-top: ${header + 8}px (or scroll-padding-top on html)` };
        if (r.top > innerHeight - 24 || r.bottom < 0)
            return { problem: `does not bring its target #${id} into view (target top ${Math.round(r.top)}px, screen ${innerHeight}px)` };
        return {};
    }, { id, header }).catch(() => null);
}

/**
 * 3.8 — every in-page #anchor link brings its target into view, its top below the sticky header (a heading hidden
 * under the header reads as "the link went to the wrong place"). Up to `max` distinct targets; smooth scrolling is
 * waited out.
 */
export async function anchorTargets(page, { max = 6 } = {}) {
    const out = [];
    const anchors = await page.evaluate((max) => {
        const seen = new Set();
        const list = [];
        for (const el of Array.from(document.querySelectorAll("a[href]"))) {
            const href = el.getAttribute("href") || "";
            let u;
            try { u = new URL(el.href); } catch { continue; }
            if (!u.hash || u.hash.length < 2 || u.origin + u.pathname !== location.origin + location.pathname || /^#(top|main|content|main-content)?$/i.test(u.hash) || /^#!|^#\//.test(href))
                continue;
            const id = decodeURIComponent(u.hash.slice(1));
            if (seen.has(id) || !document.getElementById(id) || !window.__uiVisible(el) || el.closest("[aria-hidden=true]") || /skip/i.test(el.textContent || ""))
                continue;
            seen.add(id);
            el.setAttribute("data-bs-anchor", String(list.length));
            list.push({ i: list.length, id, label: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40), where: window.__uiDescribe(el), selector: window.__uiSelector(el) });
            if (list.length >= max)
                break;
        }
        return list;
    }, max).catch(() => []);
    for (const x of anchors) {
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => { });
        await page.waitForTimeout(150);
        const loc = page.locator(`[data-bs-anchor="${x.i}"]`).first();
        const visible = await loc.isVisible().catch(() => false);
        if (!visible)
            continue; // inside a closed menu: the mobile-menu checks open it
        await loc.click({ timeout: 2500 }).catch(() => { });
        await scrollRest(page, 3000);
        const r = await anchorPlacement(page, x.id);
        if (r && r.problem)
            out.push({ what: `the #anchor link "${x.label}" ${r.problem} [3.8, P52]`, where: x.where, selector: x.selector });
    }
    return out;
}

/* ───────────────────────── states ───────────────────────── */

/**
 * Where a state's new content starts, and whether a reader sees it: after a wizard step, a pagination click or a
 * submit, the top of what changed (its first heading, an error, the list) must be on screen and not under the sticky
 * header. `marker` is a selector stamped on that element.
 */
async function topVisible(page, marker, what) {
    const header = await stickyTop(page);
    return page.evaluate(({ marker, header, what }) => {
        const el = document.querySelector(marker);
        if (!el)
            return null;
        const r = el.getBoundingClientRect();
        if (r.top < header - 2 && r.bottom > header)
            return `${what}: its top is ${Math.round(header - r.top)}px under the sticky header (top ${Math.round(r.top)}px, header ends at ${header}px) — scroll it into view below the header (scroll-margin-top: ${header + 8}px)`;
        if (r.bottom <= header || r.top < -2)
            return `${what}: it starts ${Math.round(header - r.top)}px above the screen — the reader stays where they clicked and sees the middle of it. Scroll its top into view (element.scrollIntoView({ block: "start" }) with scroll-margin-top: ${header + 8}px)`;
        if (r.top > innerHeight - 24)
            return `${what}: it starts below the screen (top ${Math.round(r.top)}px of ${innerHeight}px) — scroll it into view`;
        return null;
    }, { marker, header, what }).catch(() => null);
}

/** Text that identifies a state (headings and the active step), to tell whether a click moved a wizard on. */
const stateSig = (page, scope) => page.evaluate((scope) => {
    const root = (scope && document.querySelector(scope)) || document.body;
    const hs = Array.from(root.querySelectorAll("h1, h2, h3, h4, legend, [aria-current=step], [data-state=active], label")).filter((e) => window.__uiVisible(e)).map((e) => (e.textContent || "").trim()).join("|");
    const fields = Array.from(root.querySelectorAll("input, textarea, select, [role=combobox]")).filter((e) => window.__uiVisible(e)).map((e) => e.name || e.id || e.getAttribute("aria-label") || e.tagName).join(",");
    return `${location.pathname}#${hs.slice(0, 2000)}#${fields}`;
}, scope).catch(() => "");

/** The first heading (or alert) that is new since `before` (a stateSig-free snapshot of texts) — stamped data-bs-top. */
const stampNewTop = (page, beforeTexts, scope) => page.evaluate(({ beforeTexts, scope }) => {
    document.querySelectorAll("[data-bs-top]").forEach((e) => e.removeAttribute("data-bs-top"));
    const root = (scope && document.querySelector(scope)) || document.body;
    const old = new Set(beforeTexts);
    const el = Array.from(root.querySelectorAll("h1, h2, h3, h4, legend, [role=alert], [aria-live]")).find((e) => window.__uiVisible(e) && (e.textContent || "").trim() && !old.has((e.textContent || "").trim()));
    if (!el)
        return false;
    el.setAttribute("data-bs-top", "");
    return true;
}, { beforeTexts, scope }).catch(() => false);
const headTexts = (page, scope) => page.evaluate((scope) => Array.from(((scope && document.querySelector(scope)) || document.body).querySelectorAll("h1, h2, h3, h4, legend, [role=alert], [aria-live]")).filter((e) => window.__uiVisible(e)).map((e) => (e.textContent || "").trim()), scope).catch(() => []);

/**
 * Walks a multi-step form forward with sample data: fill → Next → re-measure, until no Next is left, a step does not
 * advance (validation that sample data cannot satisfy), or the next press would be final (pay, submit, confirm,
 * hire …) or the step asks for card details — those are never pressed. Every request other than GET is already
 * aborted by the caller. Returns { steps, stopped, findings }.
 */
async function walkWizard(page, { scope = null, base, opts, maxSteps = 6, label = "" }) {
    const findings = [];
    let steps = 0, stopped = "";
    for (; steps < maxSteps;) {
        const step = await page.evaluate(({ scope, next, final }) => {
            const root = (scope && document.querySelector(scope)) || document.body;
            const N = new RegExp(next, "i"), F = new RegExp(final, "i");
            document.querySelectorAll("[data-bs-next]").forEach((e) => e.removeAttribute("data-bs-next"));
            const buttons = Array.from(root.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")).filter((b) => window.__uiVisible(b) && !b.closest("[aria-hidden=true], [inert], header, footer, nav"));
            const text = (b) => ((b.textContent || b.value || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "));
            const card = Array.from(root.querySelectorAll("input, iframe")).some((el) => window.__uiVisible(el) && (/cc-|card|cvc|cvv|iban/i.test([el.getAttribute("autocomplete"), el.name, el.id, el.getAttribute("placeholder")].join(" ")) || /stripe|paypal|checkout|adyen|braintree|cloudpayments|payment/i.test(el.getAttribute("src") || "")));
            if (card)
                return { stop: "the step asks for card or bank details (never filled)" };
            const nextBtn = buttons.find((b) => N.test(text(b)) && !b.disabled);
            if (!nextBtn) {
                const fin = buttons.find((b) => F.test(text(b)));
                return { stop: fin ? `the next press would be final ("${text(fin).slice(0, 30)}") — never pressed` : "no Next / Continue button" };
            }
            if (F.test(text(nextBtn)))
                return { stop: `the next press would be final ("${text(nextBtn).slice(0, 30)}") — never pressed` };
            nextBtn.setAttribute("data-bs-next", "");
            return { label: text(nextBtn).slice(0, 30) };
        }, { scope, next: NEXT_RE.source, final: FINAL_RE.source }).catch(() => ({ stop: "the page went away" }));
        if (step.stop) {
            stopped = step.stop;
            break;
        }
        await fillSample(page, scope || "body");
        const sigBefore = await stateSig(page, scope);
        const heads = await headTexts(page, scope);
        const url = page.url();
        await page.locator("[data-bs-next]").first().click({ timeout: 2500 }).catch(() => { });
        await page.waitForTimeout(700);
        await c.settle(page, 1500);
        if (page.url().split("#")[0] !== url.split("#")[0])
            await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });
        const sigAfter = await stateSig(page, scope);
        if (sigAfter === sigBefore) {
            // the step did not advance: what the reader sees now is the validation state — measured once, then stop
            const now = newIn(base, await measure(page, opts));
            for (const f of now)
                findings.push({ ...f, what: `${label}after "${step.label}" with sample data (did not advance): ${f.what}` });
            stopped = `"${step.label}" did not advance with sample data (validation the check cannot satisfy)`;
            break;
        }
        steps++;
        const now = newIn(base, await measure(page, opts));
        for (const f of now)
            findings.push({ ...f, what: `${label}wizard step ${steps + 1} (after "${step.label}"): ${f.what}` });
        if (await stampNewTop(page, heads, scope)) {
            const p = await topVisible(page, "[data-bs-top]", `${label}after "${step.label}" the next step`);
            if (p)
                findings.push({ check: "4.4", what: `${p} [4.4, P52]`, where: await page.evaluate(() => { const e = document.querySelector("[data-bs-top]"); return e ? window.__uiDescribe(e) : "page"; }).catch(() => "page") });
        }
    }
    if (steps >= maxSteps)
        stopped = `stopped after ${maxSteps} steps (states.maxSteps)`;
    return { steps, stopped, findings };
}

/**
 * Re-runs the layout (2.1, 2.10), legibility (6.4), money (B4), label (N6) and password-eye (A1) checks in the states a
 * visitor reaches on this page — and reports only what each state adds over the page at rest:
 *   1. every dialog, sheet, dropdown and menu a click opens (the opener discovery of 6.12's interactionMotion; top-up /
 *      checkout openers — "Add credits", "Top up", "Buy credits" — first: wallet "no-pay" mode opens and checks them),
 *      and the steps inside an opened dialog (amount → Continue …);
 *   2. each form submitted empty (the validation state; the first error must be on screen);
 *   3. each multi-step form walked forward with sample data;
 *   4. a pagination click (the new page of results must start on screen).
 * Every request other than GET is aborted for the whole run, so nothing is sent, created or paid; payment / final
 * buttons are never pressed and card fields never filled. `reload()` brings the page back between states.
 * Returns { findings, notTested, states } — notTested lists, with reasons, what could not be reached; never dropped.
 */
export async function stateChecks(page, { reload, opts = {}, maxOpeners = 15, maxForms = 3, maxSteps = 6, wallet = true, deadline = Infinity } = {}) {
    const findings = [];
    const notTested = [];
    const states = [];
    const timeLeft = () => deadline - Date.now();
    await page.route("**/*", MUTATING);
    const closePopup = (p) => p.close().catch(() => { });
    page.on("popup", closePopup);
    const home = page.url();
    const back = async () => {
        if (reload)
            await within(reload(), 30_000, undefined);
        else
            await page.goto(home, { waitUntil: "load", timeout: 30_000 }).catch(() => { });
        await page.waitForTimeout(300);
    };
    try {
        const base = await measure(page, opts);
        /* 1. openers */
        await within(page.evaluate(c.ixProbe), 10_000);
        const cands = await within(page.evaluate(() => window.__bsIx.candidates(true)), 15_000, null);
        const picks = [...(cands?.picks || [])];
        const rank = (p) => (WALLET_RE.test(p.text) ? 0 : /haspopup|combobox|menu|dialog/i.test(p.sig + p.where) ? 1 : 2);
        picks.sort((x, y) => rank(x) - rank(y));
        if (!wallet)
            for (let i = picks.length - 1; i >= 0; i--) if (WALLET_RE.test(picks[i].text)) { notTested.push(`top-up / checkout opener "${picks[i].text}" (states.wallet is off)`); picks.splice(i, 1); }
        if (picks.length > maxOpeners)
            notTested.push(`${picks.length - maxOpeners} control(s) over the cap of ${maxOpeners} (babysitter.config.json → states.maxOpeners), e.g. ${picks.slice(maxOpeners, maxOpeners + 3).map((p) => `"${p.text}"`).join(", ")}`);
        let fresh = true;
        for (const pick of picks.slice(0, maxOpeners)) {
            if (timeLeft() < 15_000) {
                notTested.push(`opening "${pick.text}" and the rest: time budget (raise states.pageBudget)`);
                break;
            }
            if (!fresh) {
                await back();
                await within(page.evaluate(c.ixProbe), 5_000);
            }
            fresh = false;
            const found = await page.evaluate(({ sig, text, ord }) => window.__bsIx.find(sig, text, ord), pick).catch(() => false);
            const h = found ? await page.$("[data-bs-ix]").catch(() => null) : null;
            if (!h || !(await h.evaluate((el) => window.__uiVisible(el)).catch(() => false))) {
                fresh = true;
                continue;
            }
            await h.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
            await c.uncover(h);
            await h.evaluate((el) => window.__bsIx.arm(el)).catch(() => { });
            await h.click({ timeout: 2500 }).catch(() => { });
            await page.waitForFunction(() => window.__bsIx && window.__bsIx.run && window.__bsIx.run.done, null, { timeout: 6000 }).catch(() => { });
            if (page.url().split("#")[0] !== home.split("#")[0])
                continue; // navigated: another page, covered by its own route
            await c.settle(page, 1500);
            const r = await page.evaluate(() => window.__bsIx.result()).catch(() => null);
            if (!r || !r.appeared.length) {
                fresh = !r || (!r.disappeared.length && !r.state.length);
                continue;
            }
            const label = `after clicking "${pick.text.slice(0, 40)}": `;
            states.push(`clicked "${pick.text.slice(0, 40)}"`);
            for (const f of newIn(base, await measure(page, opts)))
                findings.push({ ...f, what: `${label}${f.what}`, where: f.where });
            // a dialog with steps of its own (Add credits: amount → Continue → card): walk it, never pay
            const dialog = await page.evaluate(() => { const d = Array.from(document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open]")).filter((x) => window.__uiVisible(x)).pop(); if (!d) return null; d.setAttribute("data-bs-dialog", ""); return true; }).catch(() => null);
            if (dialog && timeLeft() > 20_000) {
                const w = await walkWizard(page, { scope: "[data-bs-dialog]", base, opts, maxSteps, label });
                findings.push(...w.findings);
                if (w.steps)
                    states.push(`${w.steps} step(s) inside "${pick.text.slice(0, 40)}" (${w.stopped})`);
            }
        }
        if (cands?.skipped?.destructive?.length)
            notTested.push(`${cands.skipped.destructive.length} destructive or paying control(s) not pressed (e.g. ${cands.skipped.destructive.slice(0, 2).join("; ")})`);
        /* 2 + 3. forms: empty submit, then the wizard walk */
        await back();
        const forms = await page.evaluate((final) => {
            const F = new RegExp(final, "i");
            const out = [];
            for (const f of Array.from(document.querySelectorAll("form"))) {
                if (!window.__uiVisible(f) || f.closest("[role=dialog], [aria-hidden=true]"))
                    continue;
                const fields = Array.from(f.querySelectorAll("input:not([type=hidden]), textarea, select, [role=combobox]")).filter((e) => window.__uiVisible(e));
                if (!fields.length)
                    continue;
                const submit = Array.from(f.querySelectorAll("button[type=submit], button:not([type]), input[type=submit]")).find((b) => window.__uiVisible(b));
                const card = fields.some((el) => /cc-|card|cvc|cvv|iban/i.test([el.getAttribute("autocomplete"), el.name, el.id].join(" "))) || !!f.querySelector("iframe[src*=stripe], iframe[src*=checkout], iframe[src*=pay]");
                const i = out.length;
                f.setAttribute("data-bs-form", String(i));
                out.push({ i, card, submit: submit ? ((submit.textContent || submit.value || "").trim().replace(/\s+/g, " ").slice(0, 30)) : null, search: fields.length === 1 && /search|query|q\b/i.test([fields[0].getAttribute("type"), fields[0].name, fields[0].getAttribute("placeholder")].join(" ")), final: submit ? F.test((submit.textContent || submit.value || "").trim()) : false });
            }
            return out;
        }, FINAL_RE.source).catch(() => []);
        for (const f of forms.slice(0, maxForms)) {
            if (timeLeft() < 15_000) {
                notTested.push("empty-form submits: time budget");
                break;
            }
            if (f.card) {
                notTested.push(`form ${f.i + 1} ("${f.submit || "?"}"): card / bank fields — never submitted, not even empty`);
                continue;
            }
            if (!f.submit || f.search)
                continue;
            await back();
            await page.evaluate((i) => { document.querySelectorAll("form").forEach((x, j) => x.setAttribute("data-bs-form", String(j))); }, f.i).catch(() => { });
            // the empty submit: the request (if the form sends one) is aborted; what the reader sees is the validation
            const btn = page.locator(`form[data-bs-form="${f.i}"]`).locator("button[type=submit], button:not([type]), input[type=submit]").filter({ visible: true }).first();
            await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
            await btn.click({ timeout: 2500 }).catch(() => { });
            await page.waitForTimeout(700);
            await c.settle(page, 1200);
            if (page.url().split("#")[0] !== home.split("#")[0]) {
                notTested.push(`form "${f.submit}": an empty submit navigated away`);
                continue;
            }
            states.push(`submitted "${f.submit}" empty`);
            const label = `after submitting "${f.submit}" empty: `;
            for (const x of newIn(base, await measure(page, opts)))
                findings.push({ ...x, what: `${label}${x.what}` });
            // the first error (invalid field or alert) must be on screen, not under the header
            const marked = await page.evaluate(() => {
                document.querySelectorAll("[data-bs-top]").forEach((e) => e.removeAttribute("data-bs-top"));
                // what a reader can see as an error: a field marked invalid, an alert / live message, an error text (a bare
                // :invalid has no look of its own and is not counted)
                const bad = Array.from(document.querySelectorAll("[aria-invalid=true], [role=alert], [aria-live=assertive], [aria-live=polite], [class*=error i], [class*=invalid i], [data-error]")).filter((e) => window.__uiVisible(e) && !e.closest("[aria-hidden=true]") && (e.matches("[aria-invalid=true]") || (e.textContent || "").trim().length > 2));
                bad.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);
                if (!bad.length)
                    return false;
                // already on screen somewhere? then the reader sees there is an error — fine
                if (bad.some((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }))
                    return false;
                bad[0].setAttribute("data-bs-top", "");
                return true;
            }).catch(() => false);
            if (marked) {
                const p = await topVisible(page, "[data-bs-top]", `${label}the first error`);
                if (p)
                    findings.push({ check: "4.4", what: `${p} [4.4]`, where: await page.evaluate(() => { const e = document.querySelector("[data-bs-top]"); return e ? window.__uiDescribe(e) : "form"; }).catch(() => "form") });
            }
            // a multi-step form: walk it with sample data (Next / Continue), never the final press
            if (!f.final && NEXT_RE.test(f.submit)) {
                await back();
                await page.evaluate(() => { document.querySelectorAll("form").forEach((x, j) => x.setAttribute("data-bs-form", String(j))); }).catch(() => { });
                const w = await walkWizard(page, { scope: `form[data-bs-form="${f.i}"]`, base, opts, maxSteps, label: "" });
                findings.push(...w.findings);
                states.push(`wizard: ${w.steps} step(s) (${w.stopped})`);
            }
        }
        if (forms.length > maxForms)
            notTested.push(`${forms.length - maxForms} form(s) over the cap of ${maxForms} (states.maxForms)`);
        /* 3b. a wizard that is not a <form> (step buttons in a section) */
        if (!forms.length && timeLeft() > 20_000) {
            await back();
            const has = await page.evaluate((next) => Array.from(document.querySelectorAll("main button, main [role=button]")).some((b) => window.__uiVisible(b) && new RegExp(next, "i").test((b.textContent || "").trim())), NEXT_RE.source).catch(() => false);
            if (has) {
                const w = await walkWizard(page, { scope: "main", base, opts, maxSteps, label: "" });
                findings.push(...w.findings);
                states.push(`wizard: ${w.steps} step(s) (${w.stopped})`);
            }
        }
        /* 4. pagination */
        if (timeLeft() > 15_000) {
            await back();
            const pag = await page.evaluate(() => {
                const zone = Array.from(document.querySelectorAll("nav[aria-label*=pagination i], [class*=pagination i], [data-pagination], nav[aria-label*=pages i]")).find((z) => window.__uiVisible(z));
                const scope = zone || document.body;
                const next = Array.from(scope.querySelectorAll("a[href], button")).find((b) => window.__uiVisible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true" && (b.matches("[rel=next]") || /^(next( page)?|›|»|→|>|2|следующая|növbəti|келесі)$/i.test((b.textContent || b.getAttribute("aria-label") || "").trim()) || /next page|следующая/i.test(b.getAttribute("aria-label") || "")));
                if (!next || (!zone && !next.matches("[rel=next]") && !/next page/i.test(next.getAttribute("aria-label") || "")))
                    return null;
                // the list it pages: the nearest list/grid/table before the pagination — never a box that holds the
                // pagination itself (the page's layout grid, praxis /dashboard/tasks: "div.mx-auto.grid" with the sidebar)
                let list = null;
                const pz = zone || next;
                // a list drawn as plain <div>s counts too: the box just before the pagination that holds several items
                // (praxis /dashboard/tasks: a rounded card of task groups, then "Docket pages")
                const repeats = (l) => Array.from(l.children).filter((x) => window.__uiVisible(x)).length >= 2;
                for (let p = pz.parentElement, below = pz; p && !list; below = p, p = p.parentElement) {
                    const before = [];
                    for (let x = below.previousElementSibling; x; x = x.previousElementSibling) if (repeats(x)) before.unshift(x);
                    const cands = [...new Set([...Array.from(p.querySelectorAll("ul, ol, table, [role=list], [role=grid], [class*=grid]")), ...before])].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).filter((l) => window.__uiVisible(l) && !pz.contains(l) && !l.contains(pz) && !l.closest("nav, footer, header, aside, [role=navigation]") && l.children.length >= 2 && (l.compareDocumentPosition(pz) & Node.DOCUMENT_POSITION_FOLLOWING));
                    // the outermost list around the last one (a grid of cards whose cards hold <ul>s is the list, not the last card's <ul>)
                    let last = cands.pop() || null;
                    for (let o = last && cands.find((c) => c.contains(last)); o; o = cands.find((c) => c !== o && c.contains(o)))
                        last = o;
                    list = last;
                }
                if (!list)
                    return null;
                next.setAttribute("data-bs-page-next", "");
                list.setAttribute("data-bs-list", "");
                return { label: (next.textContent || next.getAttribute("aria-label") || "").trim().slice(0, 20) };
            }).catch(() => null);
            if (pag) {
                const btn = page.locator("[data-bs-page-next]").first();
                await btn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
                const url = page.url();
                await btn.click({ timeout: 2500 }).catch(() => { });
                await page.waitForTimeout(900);
                await c.settle(page, 1500);
                const full = page.url() !== url && (await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.name === location.href).catch(() => false));
                if (!full) {
                    // the list may have been re-rendered: stamp it again (same place in the page)
                    // a list React replaced is not stamped any more: nothing reliable to measure, say so
                    const still = await page.evaluate(() => !!document.querySelector("[data-bs-list]")).catch(() => false);
                    states.push(`pagination "${pag.label}"`);
                    const p = still ? await topVisible(page, "[data-bs-list]", `after the pagination "${pag.label}" the new page of results`) : null;
                    if (!still)
                        notTested.push(`pagination "${pag.label}": the list was re-rendered, its top could not be measured`);
                    // only the classic defect counts: the reader is left below the new results' top (or it is under the header);
                    // a list that starts below the screen is ahead of the reader, not lost (Praxis /specialists "Next")
                    if (p && !/starts below the screen/.test(p))
                        findings.push({ check: "4.4", what: `${p} [4.4, P52]`, where: await page.evaluate(() => { const e = document.querySelector("[data-bs-list]"); return e ? window.__uiDescribe(e) : "list"; }).catch(() => "list") });
                    for (const x of newIn(base, await measure(page, opts)))
                        findings.push({ ...x, what: `after the pagination "${pag.label}": ${x.what}` });
                }
            }
        }
    }
    finally {
        page.off("popup", closePopup);
        await within(page.unroute("**/*", MUTATING), 5_000);
    }
    return { findings, notTested, states };
}

/* ───────────────────────── locales ───────────────────────── */

/** 2.5 — HEADER navigation items that wrap (a longer language): footer columns and "On this page" lists may wrap. */
export async function headerNavWraps(page) {
    // c.wrappedNavItems keeps site navigation only (header / top-level nav) — one filter for every language
    return c.wrappedNavItems(page);
}


/** Visible text runs of the page (one per element with its own text), for the untranslated comparison. */
export const textRuns = (page) => page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement;
        if (!el || seen.has(el) || el.closest("script, style, noscript, code, pre, kbd, [translate=no], .notranslate, svg") || !window.__uiVisible(el))
            continue;
        const own = Array.from(el.childNodes).filter((x) => x.nodeType === 3).map((x) => x.nodeValue).join(" ").replace(/\s+/g, " ").trim();
        if (!own)
            continue;
        seen.add(el);
        // a language set on the element or a section (<span lang="en">), not the page's own
        const tagged = el.closest("[lang]");
        out.push({ text: own, where: window.__uiDescribe(el), selector: window.__uiSelector(el), ownLang: tagged && tagged !== document.documentElement ? tagged.getAttribute("lang") || "" : "" });
    }
    return out;
});

/**
 * Untranslated text (kept for callers of 4.x): the same check as content.spec's CT11 (lib/content-rules.js →
 * untranslatedReason — English left in the page OR word for word the default-language text). run.spec no longer runs
 * it: CT11 in content.spec is the one place a string is reported. One finding per element, none dropped.
 */
export function untranslated(runs, defaultRuns, code, keep = [], brand = []) {
    const defaults = new Set(defaultRuns.map((r) => r.text));
    const out = [];
    for (const r of runs) {
        const why = untranslatedReason(r.text, code, { brand, defaults, keep, ownLang: r.ownLang });
        if (why)
            out.push({ what: `${untranslatedWhat(why, r.text, code)} — translate it (the ${code} messages file, or the CMS / database field) [CT11, i18n]`, where: r.where, selector: r.selector });
    }
    return out;
}
