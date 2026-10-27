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
import * as fit from "./fit.js";
import * as copy from "./copy.js";
import * as boxes from "./boxes.js";
import * as fm from "./forms.js";
import * as M from "./money.js";
import { untranslatedReason, untranslatedWhat } from "../../lib/content-rules.js";
import { noteNotTested } from "../skip.js";

/* ───────────────────────── shared ───────────────────────── */

// "Pay", "Place order", "Submit application", "Confirm hire" … the last press of a flow: never pressed by a check
export const FINAL_RE = /\b(pay|pay now|checkout|check out|purchase|place (the )?order|buy( now)?|subscribe|submit( (application|request|order|task))?|send( (message|request|application))?|apply( now)?|confirm( (hire|payment|order|purchase|booking))?|hire|book( now)?|finish|complete( (order|purchase|payment|application))?|publish|post( task)?|create( account)?|sign ?up|register|delete|remove|cancel (subscription|order|task)|withdraw|transfer|оплат\w*|купить|отправить|подтверд\w*|заказать|удалить|ödə\w*|göndər\w*|təsdiq\w*|sil\b|төле\w*|жіберу|жібер\w*|растау|жою)\b/i;
// opens a top-up / checkout dialog: clicked in "no-pay" mode (opened and checked, never paid)
// 5.5.0 (Compass kdn5xf): \b is an ASCII boundary — "Кредит қосу" (kk Add credits) never matched; letters of any script now
export const WALLET_RE = /(?<![\p{L}\p{N}])(add (credits|funds|money|balance)|top ?-?up|buy credits|get credits|deposit|recharge|refill|пополн\p{L}*|balansı artır\p{L}*|kredit (al|əlavə)\p{L}*|толтыр\p{L}*|кредит (сатып|қос)\p{L}*)(?![\p{L}\p{N}])/iu;
// a step forward in a multi-step form
export const NEXT_RE = /^(next|next step|continue|proceed|forward|далее|дальше|продолжить|вперёд|növbəti|davam( et)?|irəli|келесі|жалғастыру|әрі қарай|weiter|suivant|siguiente|avanti|dalej)\b/i;
// a step back in a multi-step form (never final, never sends anything)
export const BACK_RE = /^(←\s*)?(back|previous|prev|go back|назад|вернуться|geri|əvvəlki|артқа|алдыңғы|zurück|retour|atrás|indietro|wstecz)\b/i;
const MUTATING = (route) => (/^(GET|HEAD|OPTIONS)$/.test(route.request().method()) ? route.fallback() : route.abort());
/**
 * 5.5.0 (Compass s2l9w1, 1nel7r, r2jy12 …): babysitter.config.json → states.allowPost lists the paths of read-only POSTs
 * (a match / search / quote endpoint) that may reach the server in the states run, so the result screens behind them
 * are checked. Everything else is still aborted. Patterns: a path prefix ("/api/match-specialists") or a regex source
 * ("^/api/(match|quote)$"). Default: none.
 */
export function mutatingFor(allowPost = []) {
    const pats = [].concat(allowPost || []).filter(Boolean).map(String);
    if (!pats.length) return MUTATING;
    const ok = (u) => { let path = ""; try { path = new URL(u).pathname; } catch { return false; } return pats.some((p) => (/[\^$*+?()[\]|]/.test(p) ? new RegExp(p).test(path) : path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p.replace(/\/$/, ""))); };
    return (route) => { const r = route.request(); return /^(GET|HEAD|OPTIONS)$/.test(r.method()) || (r.method() === "POST" && ok(r.url())) ? route.fallback() : route.abort(); };
}

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
export async function measure(page, { allowLightWeights = false, noTax = true, thousandsFrom = 1000, cfg: cfgOpt = null, ...opts } = {}) {
    const list = [];
    const add = (check, arr) => { for (const f of arr || []) list.push({ ...f, check }); };
    add("2.1", await c.horizontalOverflow(page).catch(() => []));
    add("2.10", await c.escapesBox(page).catch(() => []));
    add("6.4", (await c.illegibleText(page, allowLightWeights).catch(() => ({ hard: [] }))).hard);
    add("B4", await a.moneyText(page, { noTax, thousandsFrom }).catch(() => []));
    add("N6", await a.clippedControls(page).catch(() => []));
    add("A1", await a.passwordEye(page).catch(() => []));
    // 5.2.0: text cut off / spilling / truncated (2.14) and an open popup past the screen — in every state, so the
    // open mobile menu, a drawer, a listbox and a dialog are measured as a reader sees them
    add("2.14", (await fit.textCutOff(page).catch(() => ({ hard: [] }))).hard);
    add("2.14", await fit.popupOffScreen(page).catch(() => []));
    // 5.5.0 (Compass q0qz7n, 4ec28x, wee3g3): the copy rules in every state — a wizard step, an open menu, a result
    for (const f of await copy.stateCopyFindings(page, cfgOpt ?? {}).catch(() => [])) list.push({ ...f, check: f.id });
    // 5.5.0 (Kindred 5k8emt, 1zetde, x099su, c25ux3): an opened card / drawer that scrolls on its rounded box or
    // sideways over nothing, a squeezed icon, the top-up dialog's custom amount drawn unlike its packages
    add("2.18", await boxes.roundedScroller(page).catch(() => []));
    add("2.20", await boxes.sidewaysScroll(page).catch(() => []));
    add("2.14", await boxes.iconClipped(page).catch(() => []));
    add("B5", (await boxes.customAmountTile(page, { customAmount: opts.customAmount !== false }).catch(() => [])).filter((f) => f.hard));
    // 5.5.0 (Parallel zu9088): an input whose edge disappears in its error state (red border on an orange band) —
    // 1.9 ran at rest only; in a state, only what the state adds is reported (newIn)
    add("1.9", await c.inputVisibility(page).catch(() => []));
    // 5.5.0 (Praxis 32q0gs): one alignment axis inside an open dialog / sheet
    add("2.7", await dialogAxis(page).catch(() => []));
    // 5.5.0 (Compass Add Credits 7bouc8 / 6lyos0): a placeholder cut by its field; amounts and credit counts grouped two ways
    add("2.14", await M.placeholderCut(page).catch(() => []));
    add("B4", await M.numberGrouping(page).catch(() => []));
    return list;
}

/**
 * 2.7 inside an open dialog (5.5.0, Praxis 32q0gs: the cookie settings window mixed centred and left-aligned blocks at
 * 360). The block children of the dialog's content box are classed "centre" (text centred, or a box centred with gaps
 * on both sides) or "start" (text at the left edge); full-width rows and rows of buttons that share the width are
 * neutral. Both classes present — and the centred ones are more than the dialog's title — is a finding.
 */
export const dialogAxis = (page) => page.evaluate(() => {
    const W = window;
    const out = [];
    const dialogs = Array.from(document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open]")).filter((d) => W.__uiVisible(d));
    for (const d of dialogs) {
        // the content box: the descendant that holds most of the text (a dialog is often a wrapper around a panel)
        let box = d;
        for (let i = 0; i < 4; i++) { const kids = Array.from(box.children).filter((k) => W.__uiVisible(k)); if (kids.length === 1 && (kids[0].innerText || "").trim().length >= (box.innerText || "").trim().length * 0.9) box = kids[0]; else break; }
        const br = box.getBoundingClientRect();
        const cs = getComputedStyle(box);
        const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
        const innerL = br.left + padL, innerR = br.right - padR, innerW = innerR - innerL;
        if (innerW < 120) continue;
        const cls = [];
        for (const k of Array.from(box.children)) {
            if (!W.__uiVisible(k) || /^(SCRIPT|STYLE)$/.test(k.tagName)) continue;
            const text = (k.innerText || "").trim();
            if (!text) continue;
            if (k.matches("button[aria-label*=close i], [data-dismiss], [aria-label*=close i]")) continue;
            // a control that fills the row (a full-width "Sign out" with its label centred) is neutral: its box is the axis
            if (k.matches("button, a, [role=button], input, select") && k.getBoundingClientRect().width >= innerW - 6) continue;
            // where the visible content of the block sits: its text lines (a Range over its text), else its box
            const rg = document.createRange(); rg.selectNodeContents(k);
            const rects = Array.from(rg.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
            if (!rects.length) continue;
            const L = Math.min(...rects.map((r) => r.left)), R = Math.max(...rects.map((r) => r.right));
            const gl = L - innerL, gr = innerR - R;
            const btns = Array.from(k.querySelectorAll("button, a, [role=button]")).filter((b) => W.__uiVisible(b));
            const rowOfButtons = btns.length >= 2 && btns.every((b) => Math.abs(b.getBoundingClientRect().top - btns[0].getBoundingClientRect().top) < 4);
            if (R - L >= innerW - 6 && !rowOfButtons) continue; // fills the row: neutral
            let kind = null;
            if (gl > 8 && gr > 8 && Math.abs(gl - gr) <= 6) kind = "centre";
            else if (gl <= 4) kind = rowOfButtons && gr > innerW * 0.3 ? "start-packed" : "start";
            if (rowOfButtons && R - L >= innerW * 0.7) continue; // buttons that share the width
            if (kind) cls.push({ kind, el: k, text: text.split("\n")[0].slice(0, 30), heading: /^H[1-6]$/.test(k.tagName) || !!k.querySelector("h1,h2,h3,h4") && text.length < 60 });
        }
        const centre = cls.filter((x) => x.kind === "centre"), start = cls.filter((x) => x.kind !== "centre");
        if (!centre.length || !start.length) continue;
        if (centre.every((x) => x.heading) && centre.length === 1 && cls.indexOf(centre[0]) === 0) continue; // only the title is centred
        out.push({ what: `the open dialog mixes centred and left-aligned blocks: centred ${centre.map((x) => `"${x.text}"`).join(", ")}; left ${start.map((x) => `"${x.text}"`).join(", ")} — one axis inside a dialog (all left, or all centred; buttons sharing the width) [2.7]`, where: W.__uiDescribe(d), selector: W.__uiSelector(centre[0].el) });
    }
    return out;
});
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


/* ───────────────────────── 3.8 / 4.4: an in-place step opens at its top (5.2.0) ───────────────────────── */
/**
 * Before a click that swaps content in place (Next / Back / Continue, a page number), stamp the region that will
 * change — the step pane, the form, the list — and remember where its top sits inside its scroll box (the window, or
 * a dialog / drawer that scrolls itself). After the click, the region is found again (the same element, or the same
 * place in the page when React replaced it) and its top must be in view: not above the visible part of its scroll box
 * and not under the sticky header. The reader is put where a reader is: at the button (scrolled to it), so a step
 * longer than the screen starts above them.
 * 5.1.0 judged only a NEW h1–h4 / legend, measured against the window, and gave up on a list React re-rendered:
 * a step titled by a <p> (Praxis brief), a step inside a dialog that scrolls itself, and a re-rendered page of
 * results were never measured (Praxis /request-service, /dashboard/tasks; Parallel /onboarding Back / Continue).
 */
export const markRegion = (page, btnSel, regionSel = null) => page.evaluate(({ btnSel, regionSel }) => {
    const W = window;
    document.querySelectorAll("[data-bs-region]").forEach((e) => e.removeAttribute("data-bs-region"));
    const btn = document.querySelector(btnSel);
    if (!btn) return null;
    let region = regionSel ? document.querySelector(regionSel) : null;
    if (!region) {
        const br = btn.getBoundingClientRect();
        for (let a = btn.parentElement; a && a !== document.body; a = a.parentElement) {
            const r = a.getBoundingClientRect();
            // the box that holds the step: its top is well above the button, and it holds text of its own above it
            if (r.height >= 160 && br.top - r.top >= 80 && (a.matches("form, fieldset, section, [role=dialog] > *, [role=tabpanel], main > *") || r.height >= 260)) { region = a; break; }
        }
    }
    if (!region) return null;
    region.setAttribute("data-bs-region", "");
    const scroller = (el) => { for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p; } return null; };
    const sc = scroller(region);
    const top = region.getBoundingClientRect().top + (sc ? sc.scrollTop - sc.getBoundingClientRect().top : scrollY);
    return { selector: W.__uiSelector(region), where: W.__uiDescribe(region), top, inBox: !!sc, boxSel: sc ? W.__uiSelector(sc) : null };
}, { btnSel, regionSel }).catch(() => null);
/** Puts the reader at the button: the button scrolled into view at the bottom of its scroll box. */
export const readerAt = (page, btnSel) => page.evaluate((btnSel) => { const b = document.querySelector(btnSel); if (b) b.scrollIntoView({ block: "end", behavior: "instant" }); }, btnSel).catch(() => { });
/**
 * After the click: where the region's top is. Returns a problem text, or null when the top is in view (or the
 * region could not be found again and nothing can be said).
 */
export async function regionTopAfter(page, mark, what) {
    if (!mark) return null;
    const header = await stickyTop(page);
    return page.evaluate(({ mark, header, what }) => {
        const W = window;
        let region = document.querySelector("[data-bs-region]");
        if (!region || !region.isConnected) region = mark.selector ? document.querySelector(mark.selector) : null;
        const box = mark.boxSel ? document.querySelector(mark.boxSel) : null;
        let top, visTop, name;
        if (region && W.__uiVisible(region)) {
            const r = region.getBoundingClientRect();
            const sc = (() => { for (let p = region.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p; } return null; })();
            top = r.top;
            visTop = sc ? Math.max(sc.getBoundingClientRect().top + parseFloat(getComputedStyle(sc).borderTopWidth), sc.closest("[role=dialog], [role=alertdialog], dialog") ? 0 : header) : header;
            name = sc ? `its scroll box ${W.__uiDescribe(sc).split(" \"")[0]}` : "the page";
        } else if (box) {
            // React replaced the region inside a box that scrolls itself: its top is where it was in that box
            top = box.getBoundingClientRect().top + mark.top - box.scrollTop;
            visTop = box.getBoundingClientRect().top;
            name = `its scroll box ${W.__uiDescribe(box).split(" \"")[0]}`;
        } else {
            top = mark.top - scrollY;
            visTop = header;
            name = "the page";
        }
        if (top >= visTop - 2) return null;
        return `${what} opens scrolled down: the top of what changed is ${Math.round(visTop - top)}px above the visible part of ${name}${header && name === "the page" ? ` (under the ${header}px sticky header)` : ""} — the reader sees the middle or the end of it. Scroll it to its top on change (window.scrollTo(0, 0), the dialog's box.scrollTo({ top: 0 }), or element.scrollIntoView({ block: "start" }) with scroll-margin-top: ${header + 8}px)`;
    }, { mark, header, what }).catch(() => null);
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
    // the scope's own text too: a step titled by a <p> with option buttons has no new heading or field (Praxis brief)
    // (an error message that appears is not a new step: alerts, live regions and error-coloured text are left out)
    const txt = Array.from(root.querySelectorAll("p, h5, h6, [aria-current=step], [data-step]")).filter((e) => window.__uiVisible(e) && !e.closest("[role=alert], [aria-live], [class*=error i], [class*=destructive i], [class*=invalid i], [data-error]")).map((e) => (e.textContent || "").trim()).join("|").replace(/\s+/g, " ").slice(0, 600);
    return `${location.pathname}#${hs.slice(0, 2000)}#${fields}#${txt}`;
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
 * A group of tick boxes / chips (fieldset, role=group) whose error asks for a choice: tick its first enabled option.
 * Returns true when one was ticked. Consent boxes are fillSample's; card fields are never touched.
 */
const tickAskedGroup = (page, scope) => page.evaluate((scope) => {
    const W = window;
    const root = (scope && document.querySelector(scope)) || document.body;
    const ASK = /choose|select|pick|at least one|required|tick|выбер|отмет|seç|таңда|белгіле/i;
    const groups = Array.from(root.querySelectorAll("fieldset, [role=group], [role=radiogroup]")).filter((g) => W.__uiVisible(g));
    for (const g of groups) {
        const near = [g, g.nextElementSibling, g.parentElement && g.parentElement.querySelector("[role=alert], [aria-live], [class*=error i], [class*=invalid i]")].filter(Boolean);
        const asks = near.some((e) => Array.from(e.querySelectorAll ? [e, ...e.querySelectorAll("p, span, small, div, [role=alert]")] : [e]).some((x) => W.__uiVisible(x) && x.children.length === 0 && ASK.test((x.textContent || "").trim()) && (x.textContent || "").trim().length < 120 && (x.matches("[role=alert], [aria-live] *, [class*=error i], [class*=invalid i], [class*=destructive i]") || /^(rgb\(2[0-5]\d, ?\d{1,2}, ?\d{1,2}\)|rgb\(1[89]\d, ?\d{1,2}, ?\d{1,2}\))/.test(getComputedStyle(x).color) || x.closest("[role=alert]"))));
        if (!asks) continue;
        const opt = Array.from(g.querySelectorAll("input[type=checkbox]:not(:checked):not(:disabled), [role=checkbox][aria-checked=false], button[aria-pressed=false], [role=radio][aria-checked=false], input[type=radio]:not(:checked)")).find((x) => W.__uiVisible(x) || W.__uiVisible(x.closest("label") || x.parentElement));
        if (!opt) continue;
        (opt.matches("input") && !W.__uiVisible(opt) ? (opt.closest("label") || opt) : opt).click();
        return true;
    }
    return false;
}, scope).catch(() => false);

/**
 * Walks a multi-step form forward with sample data: fill → Next → re-measure, until no Next is left, a step does not
 * advance (validation that sample data cannot satisfy), or the next press would be final (pay, submit, confirm,
 * hire …) or the step asks for card details — those are never pressed. Every request other than GET is already
 * aborted by the caller. Returns { steps, stopped, findings }.
 */
async function walkWizard(page, { scope = null, base, opts, maxSteps = 6, label = "" }) {
    const findings = [];
    let steps = 0, stopped = "";
    const seenTop = new Set();
    // 5.2.0: every press that swaps the step in place (Next, Continue, and Back once at the end) is judged by where
    // the step's top lands (markRegion / regionTopAfter); the 5.1.0 heading check (stampNewTop) stays alongside it
    const judge = async (btnSel, what) => {
        await readerAt(page, btnSel);
        await page.waitForTimeout(120);
        return markRegion(page, btnSel);
    };
    const pushTop = async (mark, what) => {
        const p = await regionTopAfter(page, mark, what);
        if (p && !seenTop.has(what)) { seenTop.add(what); findings.push({ check: "3.8", what: `${p} [3.8/4.4, P52]`, where: mark.where, selector: mark.selector }); return true; }
        return false;
    };
    for (; steps < maxSteps;) {
        const findStep = () => page.evaluate(({ scope, next, back, final }) => {
            const root = (scope && document.querySelector(scope)) || document.body;
            const N = new RegExp(next, "i"), B = new RegExp(back, "i"), F = new RegExp(final, "i");
            document.querySelectorAll("[data-bs-next]").forEach((e) => e.removeAttribute("data-bs-next"));
            const buttons = Array.from(root.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")).filter((b) => window.__uiVisible(b) && !b.closest("[aria-hidden=true], [inert], header, footer, nav"));
            const text = (b) => ((b.textContent || b.value || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " "));
            const card = Array.from(root.querySelectorAll("input, iframe")).some((el) => window.__uiVisible(el) && (/cc-|card|cvc|cvv|iban/i.test([el.getAttribute("autocomplete"), el.name, el.id, el.getAttribute("placeholder")].join(" ")) || /stripe|paypal|checkout|adyen|braintree|cloudpayments|payment/i.test(el.getAttribute("src") || "")));
            if (card)
                return { stop: "the step asks for card or bank details (never filled)" };
            const nextBtn = buttons.find((b) => N.test(text(b)) && !b.disabled && b.getAttribute("aria-disabled") !== "true");
            if (!nextBtn) {
                // a Next that waits for a choice (option buttons, no radios: the Praxis brief): pick the first option
                const waiting = buttons.find((b) => N.test(text(b)));
                if (waiting) {
                    const opt = buttons.find((b) => b !== waiting && !N.test(text(b)) && !B.test(text(b)) && !F.test(text(b)) && b.getAttribute("aria-pressed") !== "true" && b.getAttribute("aria-selected") !== "true" && (b.matches("[aria-pressed], [role=radio], [role=option], [aria-checked]") || (b.parentElement && Array.from(b.parentElement.children).filter((x) => x.tagName === b.tagName).length >= 2)));
                    if (opt) { opt.setAttribute("data-bs-next", ""); return { pick: text(opt).slice(0, 30) }; }
                }
                const fin = buttons.find((b) => F.test(text(b)));
                return { stop: fin ? `the next press would be final ("${text(fin).slice(0, 30)}") — never pressed` : "no Next / Continue button" };
            }
            if (F.test(text(nextBtn)))
                return { stop: `the next press would be final ("${text(nextBtn).slice(0, 30)}") — never pressed` };
            nextBtn.setAttribute("data-bs-next", "");
            return { label: text(nextBtn).slice(0, 30) };
        }, { scope, next: NEXT_RE.source, back: BACK_RE.source, final: FINAL_RE.source }).catch(() => ({ stop: "the page went away" }));
        let step = await findStep();
        if (step.pick) {
            // the option is a choice on this step, not a step: click it, then look for the Next it unlocked
            await page.locator("[data-bs-next]").first().click({ timeout: 2500 }).catch(() => { });
            await page.waitForTimeout(400);
            await c.settle(page, 800);
            step = await findStep();
            if (step.pick) { stopped = `Next stays disabled after choosing "${step.pick}" (a choice the check cannot make)`; break; }
        }
        if (step.stop) {
            stopped = step.stop;
            break;
        }
        await fillSample(page, scope || "body");
        const sigBefore = await stateSig(page, scope);
        const heads = await headTexts(page, scope);
        const url = page.url();
        const mark = await judge("[data-bs-next]");
        await page.locator("[data-bs-next]").first().click({ timeout: 2500 }).catch(() => { });
        await page.waitForTimeout(700);
        await c.settle(page, 1500);
        if (page.url().split("#")[0] !== url.split("#")[0])
            await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });
        let sigAfter = await stateSig(page, scope);
        // 5.5.0 (Parallel uzbnam): the step asks for a choice in a group of tick boxes / chips ("Choose at least one
        // discipline") that sample data leaves alone — tick the first option of the group the error names, press again
        if (sigAfter === sigBefore && await tickAskedGroup(page, scope)) {
            await page.locator("[data-bs-next]").first().click({ timeout: 2500 }).catch(() => { });
            await page.waitForTimeout(700);
            await c.settle(page, 1500);
            sigAfter = await stateSig(page, scope);
        }
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
        let headingSaid = false;
        if (await stampNewTop(page, heads, scope)) {
            const p = await topVisible(page, "[data-bs-top]", `${label}after "${step.label}" the next step`);
            if (p) {
                headingSaid = true;
                findings.push({ check: "4.4", what: `${p} [4.4, P52]`, where: await page.evaluate(() => { const e = document.querySelector("[data-bs-top]"); return e ? window.__uiDescribe(e) : "page"; }).catch(() => "page") });
            }
        }
        // 5.2.0: the step's own box, wherever it scrolls — when the heading check had nothing to say (no new h1–h4,
        // a dialog that scrolls itself, React replaced the pane)
        if (!headingSaid && page.url().split("#")[0] === url.split("#")[0])
            await pushTop(mark, `${label}after "${step.label}" the next step`);
    }
    if (steps >= maxSteps)
        stopped = `stopped after ${maxSteps} steps (states.maxSteps)`;
    // Back, once: it swaps the step in place too, and is never final
    if (steps >= 1) {
        const back = await page.evaluate(({ scope, back }) => {
            const root = (scope && document.querySelector(scope)) || document.body;
            const B = new RegExp(back, "i");
            document.querySelectorAll("[data-bs-back]").forEach((e) => e.removeAttribute("data-bs-back"));
            const b = Array.from(root.querySelectorAll("button, [role=button]")).find((x) => window.__uiVisible(x) && !x.disabled && !x.closest("header, footer, nav, [aria-hidden=true]") && B.test((x.textContent || x.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")));
            if (!b) return null;
            b.setAttribute("data-bs-back", "");
            return (b.textContent || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30);
        }, { scope, back: BACK_RE.source }).catch(() => null);
        if (back) {
            const url = page.url();
            const mark = await judge("[data-bs-back]");
            await page.locator("[data-bs-back]").first().click({ timeout: 2500 }).catch(() => { });
            await page.waitForTimeout(700);
            await c.settle(page, 1500);
            if (page.url().split("#")[0] === url.split("#")[0]) await pushTop(mark, `${label}after "${back}" the previous step`);
        }
    }
    return { steps, stopped, findings };
}

/* ───────────────────────── 3.9 a selection's result opens on screen (5.5.0) ───────────────────────── */

/** Before a click: the button in view (where the reader is), and every DOM change from here on recorded. */
const markResult = (page, btnSel) => page.evaluate((btnSel) => {
    const b = document.querySelector(btnSel);
    if (b) b.scrollIntoView({ block: "center", behavior: "instant" });
    // what changes is recorded from here on
    window.__bsMut = [];
    if (window.__bsObs) window.__bsObs.disconnect();
    window.__bsObs = new MutationObserver((ms) => { for (const m of ms) window.__bsMut.push(m.type === "characterData" ? m.target.parentElement : m.target); });
    window.__bsObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { btnSel };
}, btnSel).catch(() => null);

/**
 * After the click: the region that changed (the smallest element holding most of the changed nodes, outside the
 * clicked control's group) must start on screen and not under the sticky header. Returns a finding or null.
 */
async function resultOnScreen(page, mark, heads, what) {
    if (!mark) return null;
    const header = await stickyTop(page);
    return page.evaluate(({ btnSel, header, what }) => {
        const W = window;
        if (window.__bsObs) window.__bsObs.disconnect();
        const btn = document.querySelector(btnSel);
        const group = btn ? (btn.closest("[role=radiogroup], [role=tablist], [role=listbox], [role=toolbar], fieldset, ul, ol") || btn.parentElement) : null;
        const touched = [...new Set((window.__bsMut || []).filter((n) => n && n.nodeType === 1 && n.isConnected && document.body.contains(n)))]
            .filter((n) => !(group && (group.contains(n) || n.contains(group))) && !(btn && (btn.contains(n) || n.contains(btn))) && !n.closest("header, nav, footer, [role=dialog], [aria-live=polite][class*=sr-only i], [class*=toast i]") && W.__uiVisible(n));
        if (!touched.length) return null;
        // the smallest common box of ≥ 80 % of the changed nodes
        const anc = (n) => { const a = []; for (let p = n; p && p !== document.body; p = p.parentElement) a.push(p); return a; };
        const count = new Map();
        for (const n of touched) for (const a of anc(n)) count.set(a, (count.get(a) || 0) + 1);
        let region = null;
        for (const [a, k] of count) if (k >= Math.ceil(touched.length * 0.8) && (!region || region.contains(a))) region = a;
        if (!region || region === document.documentElement) return null;
        if (group && region.contains(group)) {
            // the changed nodes sit around the control: the first changed element after the group is the result
            const after = touched.filter((n) => group.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
            region = after[0] || null;
            if (!region) return null;
        }
        // the first visible text of the region (a heading of the result, its first card)
        const r = region.getBoundingClientRect();
        if (r.height < 4) return null;
        const name = ((region.querySelector("h1,h2,h3,h4") || region).innerText || "").trim().split("\n")[0].slice(0, 50);
        if (r.top > innerHeight - 24)
            return { check: "3.9", what: `${what} "${name}" appears ${Math.round(r.top - innerHeight)}px below the screen — the reader sees nothing happen. Scroll it into view after the choice (element.scrollIntoView({ block: "start" }) with scroll-margin-top: ${header + 8}px) [3.9]`, where: W.__uiDescribe(region), selector: W.__uiSelector(region) };
        if (header && r.top < header - 2 && r.bottom > header && r.top > -innerHeight)
            return { check: "3.9", what: `${what} "${name}" starts ${Math.round(header - r.top)}px under the ${header}px sticky header — give it scroll-margin-top: ${header + 8}px [3.9]`, where: W.__uiDescribe(region), selector: W.__uiSelector(region) };
        return null;
    }, { btnSel: mark.btnSel, header, what }).catch(() => null);
}

/**
 * 3.9 (5.5.0, Compass gn14vd, vu8j0h, 2t4uiv, 1fxg7h, r2jy12): a selection — a filter chip, a discipline in an index, a
 * selectable card (aria-pressed / aria-selected / aria-checked, role=radio|tab|option, or ≥ 3 like buttons in one
 * group) — shows its result where the reader is. One control per group is clicked (never a final press, never a link
 * that navigates; every POST is aborted by the caller); the region that changed must start on screen, below the
 * sticky header. The selected state is a state: measure() runs there too.
 */
export async function selectionChecks(page, { base = [], opts = {}, deadline = Infinity, back = null, max = 4 } = {}) {
    const findings = [], states = [], notTested = [];
    const picks = await page.evaluate(({ final }) => {
        const W = window, F = new RegExp(final, "i");
        document.querySelectorAll("[data-bs-sel]").forEach((e) => e.removeAttribute("data-bs-sel"));
        const text = (b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        const ok = (b) => W.__uiVisible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true" && !b.closest("header, nav, footer, form, [role=dialog], [role=menu], [role=listbox][aria-hidden=true]") && !F.test(text(b)) && text(b).length > 1 && text(b).length < 60 && !(b.tagName === "A" && b.getAttribute("href") && !/^#/.test(b.getAttribute("href")));
        const groups = new Map();
        const all = Array.from(document.querySelectorAll("main button, main [role=button], main [role=radio], main [role=tab], main [role=option], main [aria-pressed], body > div button[aria-pressed]")).filter(ok);
        for (const b of all) {
            const g = b.closest("[role=radiogroup], [role=tablist], [role=listbox], [role=toolbar]") || b.parentElement;
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(b);
        }
        const out = [];
        for (const [g, list] of groups) {
            const marked = list.filter((b) => b.matches("[aria-pressed], [aria-selected], [aria-checked], [role=radio], [role=tab], [role=option]"));
            const like = list.length >= 3 && new Set(list.map((b) => b.tagName + "|" + b.className)).size === 1;
            if (!marked.length && !like) continue;
            // a control that is not the selected one yet
            const b = (marked.length ? marked : list).find((x) => x.getAttribute("aria-pressed") !== "true" && x.getAttribute("aria-selected") !== "true" && x.getAttribute("aria-checked") !== "true" && x.getAttribute("data-state") !== "active" && x.getAttribute("data-state") !== "on") || null;
            if (!b) continue;
            b.setAttribute("data-bs-sel", String(out.length));
            out.push({ i: out.length, label: text(b).slice(0, 40) });
            if (out.length >= 8) break;
        }
        return out;
    }, { final: FINAL_RE.source }).catch(() => []);
    for (const [k, p] of picks.slice(0, max).entries()) {
        if (deadline - Date.now() < 12_000) { notTested.push(`choosing "${p.label}" and the rest: time budget`); break; }
        let sel = `[data-bs-sel="${p.i}"]`;
        if (k > 0 && back) {
            await back();
            // the page came back fresh: find the same control again by its label
            const found = await page.evaluate((label) => { const b = Array.from(document.querySelectorAll("main button, main [role=button], main [role=radio], main [role=tab], main [role=option], main [aria-pressed], body > div button[aria-pressed]")).find((x) => window.__uiVisible(x) && (x.innerText || x.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40) === label); if (!b) return false; b.setAttribute("data-bs-sel", "again"); return true; }, p.label).catch(() => false);
            if (!found) continue;
            sel = '[data-bs-sel="again"]';
        }
        const url = page.url();
        const mark = await markResult(page, sel);
        await page.locator(sel).first().click({ timeout: 2500 }).catch(() => { });
        await page.waitForTimeout(900);
        await c.settle(page, 1200);
        if (page.url().split("#")[0] !== url.split("#")[0]) continue; // navigated: another page
        states.push(`chose "${p.label}"`);
        const f = await resultOnScreen(page, mark, [], `after choosing "${p.label}" the result`);
        if (f) findings.push(f);
        for (const x of newIn(base, await measure(page, opts))) findings.push({ ...x, what: `after choosing "${p.label}": ${x.what}` });
    }
    return { findings, states, notTested };
}

/** A5 inside a state: a "Sign in / Log in / Sign up" call to action in the page body shown to a signed-in user. */
export const authCtaSignedIn = (page) => page.evaluate(() => {
    const W = window;
    return Array.from(document.querySelectorAll("main a, main button, main [role=button], [role=dialog] a, [role=dialog] button")).filter((b) => W.__uiVisible(b) && /^(sign ?in|log ?in|sign ?up|register|create (an )?account)\b/i.test((b.innerText || "").trim())).slice(0, 2)
        .map((b) => ({ check: "A5", what: `"${(b.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40)}" is offered to a signed-in user — show the next step for the account instead (A5) [A5]`, where: W.__uiDescribe(b), selector: W.__uiSelector(b) }));
}).catch(() => []);

/* ───────────────────────── 5.6.0 putting the page back without a reload ───────────────────────── */

/** the babysitter marks (data-bs-*) on the page at rest: a soft return removes every other one */
const markRest = () => {
    const keep = new WeakMap();
    for (const el of document.querySelectorAll("*")) {
        const names = el.getAttributeNames().filter((n) => n.startsWith("data-bs-"));
        if (names.length) keep.set(el, new Set(names));
    }
    window.__bsRestMarks = keep;
};
/** the page's layout as a reader sees it: every visible element's box, opacity, colours and own text, plus the URL and scroll */
const layoutPrint = () => {
    const out = [location.href, Math.round(scrollX), Math.round(scrollY), innerWidth, innerHeight, document.documentElement.scrollHeight, document.title];
    for (const el of document.body ? document.body.querySelectorAll("*") : []) {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        // an element that animates for ever (a blinking caret, a spinner, a waveform) is never at rest: only its tag counts
        if (el.getAnimations().some((x) => { try { return !Number.isFinite(x.effect.getComputedTiming().endTime); } catch { return false; } })) { out.push(`${el.tagName}|∞`); continue; }
        let own = "";
        for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
        out.push([el.tagName, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), cs.opacity, cs.transform, cs.backgroundColor, cs.color, cs.borderTopColor, cs.boxShadow, cs.outlineStyle, el.getAttribute("aria-expanded"), el.getAttribute("data-state"), el.getAttribute("aria-hidden"), own.trim().slice(0, 80)].join("|"));
        if (out.length > 20000) break;
    }
    for (const f of document.querySelectorAll("input, textarea, select")) out.push(`v:${f.type === "checkbox" || f.type === "radio" ? f.checked : f.value}`);
    return out.join("\n");
};
/**
 * Back to the page at rest without a reload: the pointer where it rested, focus dropped, scrolled to the top, our
 * marks cleared — then the layout must match the one at rest exactly (after Escape, when something is still open).
 * Returns false, and the caller reloads, on any difference.
 */
async function softBack(page, rest, home) {
    if (page.url() !== home) return false;
    const same = async () => {
        await page.mouse.move(0, 0).catch(() => { });
        await page.evaluate(([x, y]) => { document.activeElement?.blur?.(); window.scrollTo({ top: y, left: x, behavior: "instant" }); }, rest.scroll).catch(() => { });
        await quiet(page);
        // a closing window hands focus back to its trigger when it is gone: drop it again until nothing holds it
        for (let k = 0; k < 3 && (await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return false; e.blur?.(); return true; }).catch(() => false)); k++) await quiet(page);
        // scrolled again: a scroll lock released at the end of a closing window
        await page.evaluate(([x, y]) => window.scrollTo({ top: y, left: x, behavior: "instant" }), rest.scroll).catch(() => { });
        return matches(rest, await page.evaluate(layoutPrint).catch(() => null));
    };
    let ok = await same();
    if (!ok) {
        await page.keyboard.press("Escape").catch(() => { });
        ok = await same();
    }
    if (!ok) return false;
    await page.evaluate(() => {
        const keep = window.__bsRestMarks || new WeakMap();
        for (const el of document.querySelectorAll("*"))
            for (const n of el.getAttributeNames())
                if (n.startsWith("data-bs-") && !(keep.get(el) || new Set()).has(n)) el.removeAttribute(n);
    }).catch(() => { });
    // a second look once our marks are gone (a style keyed on one of them would show here)
    await quiet(page);
    return matches(rest, await page.evaluate(layoutPrint).catch(() => null));
}
/** until no finite animation or transition runs (≤ 2 s), then two frames */
const quiet = (page) => page.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    const busy = () => document.getAnimations().some((a) => { try { return (a.playState === "running" || a.playState === "pending") && Number.isFinite(a.effect.getComputedTiming().endTime); } catch { return false; } });
    const tick = () => (busy() && performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : requestAnimationFrame(() => requestAnimationFrame(() => res())));
    requestAnimationFrame(tick);
})).catch(() => { });
/**
 * The print of the page at rest, taken twice 600 ms apart: lines that change on their own (a word typed letter by
 * letter, a ticking counter) are left out of the comparison. A page whose element count itself changes at rest is
 * never put back softly.
 */
async function restPrint(page) {
    const a = await page.evaluate(layoutPrint).catch(() => null);
    await page.waitForTimeout(600);
    const b = await page.evaluate(layoutPrint).catch(() => null);
    if (!a || !b) return null;
    const A = a.split("\n"), B = b.split("\n");
    if (A.length !== B.length || A[0] !== B[0] || A[1] !== B[1] || A[2] !== B[2]) return null;
    const live = new Set();
    A.forEach((l, k) => { if (l !== B[k]) live.add(k); });
    if (live.size > Math.max(40, A.length * 0.1)) return null;
    return { lines: B, live, scroll: [Number(B[1]), Number(B[2])] };
}
/**
 * The print after a reload. Lines that differ from the last rest print with the same elements differ between two loads
 * of the page (a rotating word, an animated chart): they join the lines left out. A page with other elements now is
 * printed afresh.
 */
async function reprint(page, rest) {
    const now = await page.evaluate(layoutPrint).catch(() => null);
    if (!now) return null;
    const N = now.split("\n");
    if (!rest || N.length !== rest.lines.length || N[0] !== rest.lines[0]) return restPrint(page);
    const live = new Set(rest.live);
    N.forEach((l, k) => { if (l !== rest.lines[k]) live.add(k); });
    if (live.size > Math.max(40, N.length * 0.1)) return null;
    return { lines: N, live, scroll: [Number(N[1]), Number(N[2])] };
}
const matches = (rest, now) => {
    if (!now) return false;
    const N = now.split("\n");
    if (N.length !== rest.lines.length) return false;
    for (let k = 0; k < N.length; k++) if (!rest.live.has(k) && N[k] !== rest.lines[k]) return false;
    return true;
};

/* ───────────────────────── 6.12 windows open and close with motion (5.5.8) ───────────────────────── */

const WINDOW_SEL = "[role=dialog], [role=alertdialog], dialog[open], [aria-modal=true]";
/** the sampler: each animation frame, the window's opacity (with its ancestors'), transform, clip and height */
const winSampler = () => {
    if (window.__bsWin) return;
    const SEL = "[role=dialog], [role=alertdialog], dialog[open], [aria-modal=true]";
    const look = (el) => {
        let op = 1, tf = "";
        for (let e = el, k = 0; e && e !== document.documentElement && k < 6; e = e.parentElement, k++) {
            const c = getComputedStyle(e);
            op *= parseFloat(c.opacity);
            tf += `${c.transform}|${c.translate}|${c.scale}|${c.clipPath};`;
        }
        return { op: Math.round(op * 1000) / 1000, tf, h: Math.round(el.getBoundingClientRect().height) };
    };
    const shown = (el) => el.isConnected && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
    const same = (a, b) => a && b && Math.abs(a.op - b.op) < 0.01 && a.tf === b.tf && Math.abs(a.h - b.h) < 2;
    window.__bsWin = {
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        open: null, close: null,
        /** before the click: record the first window that appears and how it changes until it settles */
        armOpen() {
            const before = new Set(Array.from(document.querySelectorAll(SEL)).filter(shown));
            const run = { t0: performance.now(), el: null, samples: [] };
            this.open = run;
            const tick = () => {
                const now = performance.now();
                if (!run.el) run.el = Array.from(document.querySelectorAll(SEL)).filter((d) => shown(d) && !before.has(d)).pop() || null;
                if (run.el && shown(run.el)) run.samples.push({ t: now, ...look(run.el) });
                if (run.stop && !run.el) run.done = true;
                else if (now - run.t0 < 4000 && !(run.samples.length > 3 && now - run.samples[0].t > 1200)) requestAnimationFrame(tick);
                else run.done = true;
            };
            requestAnimationFrame(tick);
        },
        /** the opening: from the first frame the window is shown to the last frame it still changed */
        openResult() {
            const r = this.open;
            if (!r || !r.el || r.samples.length < 2) return null;
            const s = r.samples, last = s[s.length - 1];
            // settled: the first frame from which nothing changes any more
            let settle = s[0].t;
            for (let i = 1; i < s.length; i++) if (!same(s[i], s[i - 1])) settle = s[i].t;
            r.el.setAttribute("data-bs-win", "");
            return { ms: Math.round(settle - s[0].t), changed: s.some((x) => !same(x, last)) };
        },
        /** before the close: follow the window frame by frame until it is gone */
        armClose() {
            const el = document.querySelector("[data-bs-win]") || Array.from(document.querySelectorAll(SEL)).filter(shown).pop();
            if (!el) return false;
            const run = { el, t0: performance.now(), samples: [], rest: look(el) };
            this.close = run;
            const tick = () => {
                const now = performance.now(), on = shown(el);
                run.samples.push({ t: now, on, ...(on ? look(el) : {}) });
                if (on && now - run.t0 < 3000) requestAnimationFrame(tick);
                else run.done = true;
            };
            requestAnimationFrame(tick);
            return true;
        },
        closeResult() {
            const r = this.close;
            if (!r) return null;
            const gone = r.samples.findIndex((x) => !x.on);
            if (gone < 0) return { closed: false };
            const visible = r.samples.slice(0, gone);
            const ms = Math.round(r.samples[gone].t - r.t0);
            const moved = visible.some((x) => !same(x, r.rest));
            return { closed: true, ms, frames: visible.length, moved };
        },
    };
};

/** 6.12 (5.5.8) — arm before the click that may open a window. */
export const armWindowMotion = (page) => page.evaluate(winSampler).then(() => page.evaluate(() => window.__bsWin.armOpen())).catch(() => { });

/**
 * 6.12 entrance (5.5.8): the window a click opened animates in for 180–600 ms (measured frame by frame, so CSS, the
 * Web Animations API and script all count). tailwindcss-animate's `animate-in` keeps 150 ms when a `duration-*`
 * class cannot override it. Skipped under prefers-reduced-motion.
 */
export async function windowEntrance(page, { label = "" } = {}) {
    // 5.6.0: called once the click has settled (the interaction probe saw 700 ms with no change): when no new window is
    // on screen by then, none opened — stop the sampler instead of letting it run out its 4 s
    await page.evaluate(() => { const r = window.__bsWin?.open; if (r && !r.done && !r.el) r.stop = true; }).catch(() => { });
    await page.waitForFunction(() => !window.__bsWin?.open || window.__bsWin.open.done, null, { timeout: 5000 }).catch(() => { });
    const r = await page.evaluate(() => (window.__bsWin && !window.__bsWin.reduced ? window.__bsWin.openResult() : null)).catch(() => null);
    if (!r) return [];
    const where = await page.evaluate(() => { const e = document.querySelector("[data-bs-win]"); return e ? { where: window.__uiDescribe(e), selector: window.__uiSelector(e) } : {}; }).catch(() => ({}));
    if (!r.changed || r.ms < 180)
        return [{ check: "6.12", ...where, what: `${label}the window opens abruptly: ${r.changed ? `its opening animation lasts ${r.ms}ms` : "it appears with no animation"} — give it 180–600ms (with tailwindcss-animate, set the duration on the animation itself: the animate-in default is 150ms) [6.12]` }];
    if (r.ms > 600)
        return [{ check: "6.12", ...where, what: `${label}the window opens slowly: its opening animation lasts ${r.ms}ms — keep it within 180–600ms [6.12]` }];
    return [];
}

/**
 * 6.12 exit (5.5.8): closed (Escape, then its close button, then a click on the scrim), the window must stay on screen
 * ≥ 100 ms and change (opacity, transform, clip or height) before it goes. Removed within the first frames, or gone
 * with no change, it was unmounted at once ({open && <Dialog/>}). Returns { findings, notTested }.
 */
export async function windowExit(page, { label = "" } = {}) {
    const reduced = await page.evaluate(() => !window.__bsWin || window.__bsWin.reduced).catch(() => true);
    if (reduced) return { findings: [], notTested: [] };
    const where = await page.evaluate(() => { const e = document.querySelector("[data-bs-win]"); return e ? { where: window.__uiDescribe(e), selector: window.__uiSelector(e) } : null; }).catch(() => null);
    if (!where) return { findings: [], notTested: [] };
    const tries = [
        () => page.keyboard.press("Escape"),
        () => page.locator("[data-bs-win] :is(button, [role=button])").filter({ hasText: /^(close|cancel|×|✕|x|fermer|annuler|закрыть|отмена|bağla|жабу)$/i }).first().click({ timeout: 1000 })
            .catch(() => page.locator("[data-bs-win] :is(button, [role=button])[aria-label*=close i], [data-bs-win] :is(button, [role=button])[aria-label*=fermer i]").first().click({ timeout: 1000 })),
        () => page.mouse.click(4, 4),
    ];
    for (const act of tries) {
        if (!(await page.evaluate(() => window.__bsWin.armClose()).catch(() => false))) break;
        await act().catch(() => { });
        await page.waitForFunction(() => window.__bsWin.close.done, null, { timeout: 4000 }).catch(() => { });
        const r = await page.evaluate(() => window.__bsWin.closeResult()).catch(() => null);
        if (!r || !r.closed) continue;
        if (r.ms < 100 || r.frames <= 2 || !r.moved)
            return { findings: [{ check: "6.12", ...where, what: `${label}the window closes with no animation: it is removed ${r.moved ? `after ${r.ms}ms` : "at once, with no change on screen"} — keep it mounted while it animates out (an exit animation of 150–300ms) [6.12]` }], notTested: [] };
        return { findings: [], notTested: [] };
    }
    return { findings: [], notTested: [`${label}closing the window (Escape, its close button, the scrim): it stayed open, exit motion not measured [6.12]`] };
}

/* ───────────────────────── 6.14 a button does something (5.5.0) ───────────────────────── */

/**
 * 6.14 (Compass tpag4h: "Talk to sales" did nothing). Each visible, enabled button / [role=button] / a[href="#"] in
 * the page body (never a final press, never in a form — the forms suite owns submits) is clicked once: within a second
 * something must happen — a DOM change outside the button, a URL or hash change, a request, a dialog, a focus move, a
 * clipboard write, or an aria-expanded / aria-pressed change. Nothing at all is a finding. The caller aborts POSTs.
 */
export async function deadButtons(page, { max = 12, deadline = Infinity, notTested = null } = {}) {
    const out = [];
    const skipped = notTested || [];
    const mark = () => page.evaluate(({ final }) => {
        const W = window, F = new RegExp(final, "i");
        document.querySelectorAll("[data-bs-dead]").forEach((e) => e.removeAttribute("data-bs-dead"));
        const text = (b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        const els = Array.from(document.querySelectorAll("main button, main [role=button], main a[href='#'], main a[href=''], body > div > section button")).filter((b) => W.__uiVisible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true" && !b.closest("form, [role=dialog], header, nav, footer, [role=tablist], [role=radiogroup], [role=listbox], [role=menu]") && !F.test(text(b)) && text(b).length > 1 && !b.matches("[type=submit], [aria-haspopup], [aria-controls], [aria-expanded], [aria-pressed], [role=tab], [role=radio], [role=option], [data-state]"));
        return els.slice(0, 40).map((b, i) => { b.setAttribute("data-bs-dead", String(i)); return { i, label: text(b).slice(0, 40), where: W.__uiDescribe(b), selector: W.__uiSelector(b) }; });
    }, { final: FINAL_RE.source }).catch(() => []);
    const list = await mark();
    // what a click opened (a dialog, a modal, a disclosure) must be closed before the next button, or that button sits
    // under its overlay and its click never lands
    const openCount = () => page.evaluate(() => Array.from(document.querySelectorAll("[role=dialog], [aria-modal=true], dialog[open]")).filter((d) => window.__uiVisible(d)).length).catch(() => 0);
    const ctx = page.context();
    let requests = 0;
    const onReq = () => { requests++; };
    page.on("request", onReq);
    let dialogs = 0;
    const onDialog = (d) => { dialogs++; d.dismiss().catch(() => { }); };
    page.on("dialog", onDialog);
    let popups = 0;
    const onPopup = () => { popups++; };
    page.on("popup", onPopup);
    void ctx;
    try {
        for (const b of list.slice(0, max)) {
            if (deadline - Date.now() < 8_000) break;
            const loc = page.locator(`[data-bs-dead="${b.i}"]`).first();
            if (!(await loc.isVisible().catch(() => false))) continue;
            const url = page.url();
            await loc.evaluate((el) => {
                window.__bsDeadMut = 0;
                window.__bsDeadClip = false;
                const btn = el;
                if (window.__bsDeadObs) window.__bsDeadObs.disconnect();
                window.__bsDeadObs = new MutationObserver((ms) => { for (const m of ms) if (!btn.contains(m.target) && !(m.target === btn)) window.__bsDeadMut++; });
                window.__bsDeadObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
                window.__bsDeadFocus = document.activeElement;
                try { const w = navigator.clipboard && navigator.clipboard.writeText; if (w && !window.__bsClipWrapped) { window.__bsClipWrapped = true; navigator.clipboard.writeText = (...a) => { window.__bsDeadClip = true; return w.apply(navigator.clipboard, a).catch(() => { }); }; } } catch { }
                window.__bsDeadAria = [btn.getAttribute("aria-expanded"), btn.getAttribute("aria-pressed"), btn.textContent];
            }).catch(() => { });
            const r0 = requests, d0 = dialogs, p0 = popups;
            const open0 = await openCount();
            const clickErr = await loc.click({ timeout: 2000 }).then(() => null, (e) => e);
            if (clickErr) {
                // the click never landed (covered, not actionable, timed out): not a dead button, an untested one
                await loc.evaluate(() => { if (window.__bsDeadObs) window.__bsDeadObs.disconnect(); }).catch(() => { });
                skipped.push(`6.14 "${b.label}": the click did not land (${String(clickErr.message || clickErr).split("\n")[0].slice(0, 80)}) — not tested`);
                continue;
            }
            await page.waitForTimeout(1000);
            if (page.url() !== url) { await page.goBack({ waitUntil: "load", timeout: 15_000 }).catch(() => page.goto(url, { waitUntil: "load" }).catch(() => { })); await page.waitForTimeout(300); continue; }
            const did = await loc.evaluate((el) => {
                if (window.__bsDeadObs) window.__bsDeadObs.disconnect();
                const a = window.__bsDeadAria || [];
                const focusMoved = document.activeElement !== window.__bsDeadFocus && document.activeElement !== el && document.activeElement !== document.body;
                return window.__bsDeadMut > 0 || window.__bsDeadClip || focusMoved || a[0] !== el.getAttribute("aria-expanded") || a[1] !== el.getAttribute("aria-pressed") || a[2] !== el.textContent;
            }).catch(() => true);
            if (!did && requests === r0 && dialogs === d0 && popups === p0)
                out.push({ check: "6.14", what: `"${b.label}" does nothing when clicked — no page, no dialog, no change on screen. Link it where it promises (a page, a mailto:, a form) or remove it [6.14]`, where: b.where, selector: b.selector });
            // put the page back: Escape, then a reload (with the remaining buttons marked again) if it is still open
            const expanded = await loc.getAttribute("aria-expanded").catch(() => null);
            if ((await openCount()) > open0 || expanded === "true") {
                await page.keyboard.press("Escape").catch(() => { });
                for (let k = 0; k < 10 && (await openCount()) > open0; k++) await page.waitForTimeout(100);
                if ((await openCount()) > open0) {
                    await page.goto(url, { waitUntil: "load" }).catch(() => { });
                    await page.waitForTimeout(300);
                    await mark();
                }
            }
        }
    }
    finally {
        page.off("request", onReq);
        page.off("dialog", onDialog);
        page.off("popup", onPopup);
    }
    return out;
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
export async function stateChecks(page, { reload, opts = {}, maxOpeners = 15, maxForms = 3, maxSteps = 6, wallet = true, deadline = Infinity, allowPost = [], selections = true, deadButtons: dead = true, auth = false, motion = true } = {}) {
    const findings = [];
    const notTested = [];
    const states = [];
    const timeLeft = () => deadline - Date.now();
    const GUARD = mutatingFor(allowPost);
    await page.route("**/*", GUARD);
    const closePopup = (p) => p.close().catch(() => { });
    page.on("popup", closePopup);
    const home = page.url();
    // 5.6.0: the page at rest, as a fingerprint of its layout. Between states the page is put back without a reload when
    // it already looks exactly as it did at rest (a menu closed, nothing moved); a page that differs in any element is
    // reloaded as before. BABYSITTER_SOFT_BACK=0 always reloads.
    let rest = null;
    const reloadBack = async () => {
        if (reload)
            await within(reload(), 30_000, undefined);
        else
            await page.goto(home, { waitUntil: "load", timeout: 30_000 }).catch(() => { });
        await page.waitForTimeout(300);
    };
    const back = async () => {
        if (rest && (await softBack(page, rest, home))) return;
        await reloadBack();
        // the page after a reload is the page at rest again: remember its marks, so a later soft return clears ours, and
        // take its print as the new rest (a cookie choice made by an earlier state stays made)
        if (rest) {
            await page.evaluate(markRest).catch(() => { });
            rest = await reprint(page, rest);
        }
    };
    try {
        const base = await measure(page, opts);
        if (process.env.BABYSITTER_SOFT_BACK !== "0") {
            await page.evaluate(markRest).catch(() => { });
            rest = await restPrint(page);
        }
        /* 1. openers */
        await within(page.evaluate(c.ixProbe), 10_000);
        const cands = await within(page.evaluate(() => window.__bsIx.candidates(true)), 15_000, null);
        const picks = [...(cands?.picks || [])];
        const rank = (p) => (WALLET_RE.test(p.text) ? 0 : /haspopup|combobox|menu|dialog/i.test(p.sig + p.where) ? 1 : 2);
        picks.sort((x, y) => rank(x) - rank(y));
        // 5.5.0 (Compass Add Credits, issue #5): states.wallet: false kept the top-up dialog shut, and its cut amount
        // hint and mixed number formats were never seen. Opening it is safe (every non-GET request is aborted): with
        // the wallet off it is opened and measured, and nothing inside it is pressed.
        if (!wallet)
            for (const p of picks) if (WALLET_RE.test(p.text)) { p.openOnly = true; notTested.push(`steps inside the top-up / checkout "${p.text}" (states.wallet is off: opened and measured, nothing pressed)`); }
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
            if (motion) await armWindowMotion(page);
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
            // 6.12 (5.5.8): the window's opening length, measured from the click
            if (motion) findings.push(...(await windowEntrance(page, { label })));
            for (const f of newIn(base, await measure(page, opts)))
                findings.push({ ...f, what: `${label}${f.what}`, where: f.where });
            // a dialog with steps of its own (Add credits: amount → Continue → card): walk it, never pay
            const dialog = await page.evaluate(() => { const d = Array.from(document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open]")).filter((x) => window.__uiVisible(x)).pop(); if (!d) return null; d.setAttribute("data-bs-dialog", ""); return true; }).catch(() => null);
            if (dialog && !pick.openOnly && timeLeft() > 20_000) {
                const w = await walkWizard(page, { scope: "[data-bs-dialog]", base, opts, maxSteps, label });
                findings.push(...w.findings);
                if (w.steps)
                    states.push(`${w.steps} step(s) inside "${pick.text.slice(0, 40)}" (${w.stopped})`);
            }
            // 6.12 (5.5.8): closed, the window animates out before it goes
            if (motion && timeLeft() > 10_000) {
                const x = await windowExit(page, { label });
                findings.push(...x.findings);
                notTested.push(...x.notTested);
            }
        }
        if (cands?.skipped?.destructive?.length)
            notTested.push(`${cands.skipped.destructive.length} destructive or paying control(s) not pressed (e.g. ${cands.skipped.destructive.slice(0, 2).join("; ")})`);
        /* 2 + 3. forms: empty submit, then the wizard walk */
        await back();
        const forms = await page.evaluate(({ final, next }) => {
            const F = new RegExp(final, "i"), N = new RegExp(next, "i");
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
                // a Next / Continue anywhere in the form (5.2.0): its first submit may be "Back" (Parallel /onboarding)
                const hasNext = Array.from(f.querySelectorAll("button, [role=button], input[type=submit]")).some((b) => window.__uiVisible(b) && N.test((b.textContent || b.value || "").trim().replace(/\s+/g, " ")));
                out.push({ i, card, hasNext, submit: submit ? ((submit.textContent || submit.value || "").trim().replace(/\s+/g, " ").slice(0, 30)) : null, search: fields.length === 1 && /search|query|q\b/i.test([fields[0].getAttribute("type"), fields[0].name, fields[0].getAttribute("placeholder")].join(" ")), final: submit ? F.test((submit.textContent || submit.value || "").trim()) : false });
            }
            return out;
        }, { final: FINAL_RE.source, next: NEXT_RE.source }).catch(() => []);
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
            if ((!f.final && NEXT_RE.test(f.submit)) || f.hasNext) {
                await back();
                await page.evaluate(() => { document.querySelectorAll("form").forEach((x, j) => x.setAttribute("data-bs-form", String(j))); }).catch(() => { });
                const w = await walkWizard(page, { scope: `form[data-bs-form="${f.i}"]`, base, opts, maxSteps, label: "" });
                findings.push(...w.findings);
                states.push(`wizard: ${w.steps} step(s) (${w.stopped})`);
            }
            // 5.5.0 (Compass s2l9w1, 1nel7r, r2jy12): with states.allowPost the form is also submitted with sample data —
            // a read-only POST in the allow-list reaches the server and its result (the match list, "Confirm hire") is a
            // state like any other; without it the result screen is never seen, and that is said
            if (!f.final && !NEXT_RE.test(f.submit) && timeLeft() > 20_000) {
                if (![].concat(allowPost || []).length) notTested.push(`the result of "${f.submit}" with data (every POST is aborted: list read-only endpoints in states.allowPost to check the result screen)`);
                else {
                    await back();
                    await page.evaluate(() => { document.querySelectorAll("form").forEach((x, j) => x.setAttribute("data-bs-form", String(j))); }).catch(() => { });
                    await fillSample(page, `form[data-bs-form="${f.i}"]`);
                    const sel = `form[data-bs-form="${f.i}"] :is(button[type=submit], button:not([type]), input[type=submit])`;
                    await page.locator(sel).filter({ visible: true }).first().evaluate((b) => b.setAttribute("data-bs-submit-data", "")).catch(() => { });
                    const heads = await headTexts(page, null);
                    const mark = await markResult(page, "[data-bs-submit-data]");
                    await page.locator("[data-bs-submit-data]").first().click({ timeout: 2500 }).catch(() => { });
                    await page.waitForTimeout(900);
                    await c.settle(page, 2500);
                    if (page.url().split("#")[0] === home.split("#")[0]) {
                        states.push(`submitted "${f.submit}" with sample data (allowPost)`);
                        const lab = `after submitting "${f.submit}" with sample data: `;
                        for (const x of newIn(base, await measure(page, opts))) findings.push({ ...x, what: `${lab}${x.what}` });
                        const p3 = await resultOnScreen(page, mark, heads, `${lab}the result`);
                        if (p3) findings.push(p3);
                        // signed in: the result screen must not offer sign-in (A5, Compass s2l9w1) and must say up front
                        // when the balance cannot pay (FM6, Compass 1nel7r)
                        if (auth) {
                            for (const x of await authCtaSignedIn(page)) findings.push({ ...x, what: `${lab}${x.what}` });
                            for (const x of (await fm.creditsUpFront(page).catch(() => [])).filter((y) => !y.na)) findings.push({ ...x, check: "FM6", what: `${lab}${x.what}` });
                        }
                    }
                }
            }
        }
        if (forms.length > maxForms)
            notTested.push(`${forms.length - maxForms} form(s) over the cap of ${maxForms} (states.maxForms)`);
        /* 3b. a wizard that is not a <form> (step buttons in a section) */
        // 5.2.0: also when the page has forms elsewhere (a footer newsletter, a search box): the step buttons outside
        // every <form> are walked on their own
        if (timeLeft() > 20_000) {
            await back();
            const has = await page.evaluate((next) => Array.from(document.querySelectorAll("main button, main [role=button]")).some((b) => window.__uiVisible(b) && !b.closest("form") && new RegExp(next, "i").test((b.textContent || "").trim())), NEXT_RE.source).catch(() => false);
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
                // 5.2.0: the list's place in the page, kept even when React replaces the list on the new page
                const mark = await markRegion(page, "[data-bs-page-next]", "[data-bs-list]");
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
                    if (!still && !mark)
                        notTested.push(`pagination "${pag.label}": the list was re-rendered, its top could not be measured`);
                    // only the classic defect counts: the reader is left below the new results' top (or it is under the header);
                    // a list that starts below the screen is ahead of the reader, not lost (Praxis /specialists "Next")
                    if (p && !/starts below the screen/.test(p))
                        findings.push({ check: "4.4", what: `${p} [4.4, P52]`, where: await page.evaluate(() => { const e = document.querySelector("[data-bs-list]"); return e ? window.__uiDescribe(e) : "list"; }).catch(() => "list") });
                    else if (!p) {
                        const q = await regionTopAfter(page, mark, `after the pagination "${pag.label}" the new page of results`);
                        if (q) findings.push({ check: "4.4", what: `${q} [4.4, P52]`, where: mark?.where || "list", selector: mark?.selector });
                    }
                    for (const x of newIn(base, await measure(page, opts)))
                        findings.push({ ...x, what: `after the pagination "${pag.label}": ${x.what}` });
                }
            }
        }
        /* 5. selections: a filter chip, an index row, a selectable card (3.9, 5.5.0) */
        if (selections && timeLeft() > 20_000) {
            await back();
            const r = await selectionChecks(page, { base, opts, deadline, back });
            findings.push(...r.findings);
            states.push(...r.states);
            notTested.push(...r.notTested);
        }
        /* 6. a button does something (6.14, 5.5.0) */
        if (dead && timeLeft() > 15_000) {
            await back();
            findings.push(...(await deadButtons(page, { deadline, notTested })));
        }
    }
    finally {
        page.off("popup", closePopup);
        await within(page.unroute("**/*", GUARD), 5_000);
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

/* ───────────────────────── 4.5 a card's action carries its card (5.5.0) ───────────────────────── */

const ACTION_VERB = /^(open( a)? case|hire|request|book|contact|message|view|see|select|choose|start|get( a)? quote|work with|invite|order|apply|ask|enquire|inquire|details|more)\b/i;
/**
 * 4.5 (Kindred gn3zcj: "Open case" in every specialist card opened the same bare /request-service). In a list of 2+
 * same-shaped cards with different headings, each card's own action link must say which card it is for: two cards
 * whose action opens the identical URL (path, query, hash) is a finding. Plans on a pricing page ("Get started" →
 * /register), mailto: links and "View all" / "Back" are not card actions.
 */
export const cardActions = (page, path = "") => page.evaluate(({ verb, path }) => {
    const W = window;
    if (/pric|plan|tariff|subscri/i.test(path)) return [];
    const V = new RegExp(verb, "i");
    const groups = new Map();
    for (const h of Array.from(document.querySelectorAll("main h2, main h3, main h4"))) {
        if (!W.__uiVisible(h)) continue;
        // the card: the nearest ancestor that also holds an action link, but not a second heading of the same level
        let card = null;
        for (let a = h.parentElement, d = 0; a && a !== document.body && d < 5; a = a.parentElement, d++) {
            if (a.querySelectorAll(h.tagName).length > 1) break;
            if (a.querySelector("a[href]")) { card = a; break; }
        }
        if (!card) continue;
        const act = Array.from(card.querySelectorAll("a[href]")).find((x) => W.__uiVisible(x) && !x.contains(h) && V.test((x.innerText || x.getAttribute("aria-label") || "").trim()) && !/^(view|see) all|^back\b/i.test((x.innerText || "").trim()) && !/^(mailto|tel):/i.test(x.getAttribute("href") || ""));
        if (!act) continue;
        const key = `${card.tagName}|${card.className}|${card.parentElement ? W.__uiSelector(card.parentElement) : ""}`;
        if (!groups.has(key)) groups.set(key, []);
        // the card's other own link (its title or photo opens the entity's page): different per card in a real catalogue
        const own = Array.from(card.querySelectorAll("a[href]")).find((x) => x !== act && W.__uiVisible(x))?.href || null;
        groups.get(key).push({ head: (h.innerText || "").trim().slice(0, 40), href: act.href, own, label: (act.innerText || "").trim().replace(/\s+/g, " ").slice(0, 30), act });
    }
    const out = [];
    for (const list of groups.values()) {
        if (list.length < 2 || new Set(list.map((x) => x.head)).size < 2) continue;
        // entities, not feature or service blurbs: a catalogue route, or cards that each open a page of their own
        const catalogue = /\/(specialists|experts|catalog|catalogue|marketplace|freelancers|talent|tasks|providers|profiles|listings)(\/|$)/i.test(path) || (list.every((x) => x.own) && new Set(list.map((x) => x.own)).size === list.length);
        if (!catalogue) continue;
        const by = new Map();
        for (const x of list) { if (!by.has(x.href)) by.set(x.href, []); by.get(x.href).push(x); }
        for (const [href, same] of by) {
            if (same.length < 2 || new Set(same.map((x) => x.head)).size < 2) continue;
            const u = new URL(href);
            out.push({ check: "4.5", what: `"${same[0].label}" in ${same.length} cards (${same.slice(0, 3).map((x) => `"${x.head}"`).join(", ")}${same.length > 3 ? " …" : ""}) all open ${u.pathname}${u.search} — the next page cannot know which card was chosen. Pass it (${u.pathname}?id=<the card's id>) and show it there [4.5]`, where: W.__uiDescribe(same[0].act), selector: W.__uiSelector(same[0].act) });
        }
    }
    return out;
}, { verb: ACTION_VERB.source, path }).catch(() => []);

/* ───────────────────────── J1 a CTA carries its context (5.5.0) ───────────────────────── */

const ROLE_WORDS = { specialist: /\b(specialists?|experts?|freelancers?|partners?|pros?|providers?|talent|executors?)\b/i, client: /\b(clients?|buyers?|customers?|hirers?|employers?)\b/i };
const roleIn = (t) => { for (const [k, re] of Object.entries(ROLE_WORDS)) if (re.test(t || "")) return k; return null; };
/**
 * J1 (Compass tco25o: "Hire this specialist" opened an empty /request; 6pn1k8: "Start your application" on the
 * specialist page opened sign-up with Client selected). (a) On an entity page (`entity`: the route is an instance of a
 * dynamic route), a CTA that acts on the entity ("Hire this specialist", "Start a brief with this profile", "Book …")
 * must open a page that shows the entity's name (its h1) or its id / slug. (b) A CTA into sign-up whose label, link or
 * page names a role must open sign-up with that role selected, not another. GET only (the destination is opened).
 */
export async function ctaContext(page, { entity = false, signUp = null } = {}) {
    const out = [];
    const src = page.url();
    const info = await page.evaluate(({ signUp }) => {
        const W = window;
        const h1 = (document.querySelector("main h1, h1")?.innerText || "").trim().replace(/\s+/g, " ");
        const ACT = /\b(hire|book|brief|request|work with|message|contact|invite|order)\b/i, THIS = /\b(this|her|him|them|the) (specialist|profile|expert|freelancer|person|pro)\b|\bwith this\b/i;
        const SIGNUP = /\/(register|sign-?up|join|create-account|onboarding)(\/|\?|$)/i;
        const links = Array.from(document.querySelectorAll("main a[href]")).filter((a) => W.__uiVisible(a) && !a.closest("header, nav, footer"));
        const pick = (a) => ({ href: a.href, label: (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60), where: W.__uiDescribe(a), selector: W.__uiSelector(a) });
        const first = h1.split(/\s+/)[0] || "";
        const acts = links.filter((a) => { const t = (a.innerText || "").trim(); return ACT.test(t) && (THIS.test(t) || (first.length >= 3 && t.includes(first))); }).map(pick);
        const ups = links.filter((a) => { try { const u = new URL(a.href); return u.origin === location.origin && (SIGNUP.test(u.pathname) || (signUp && u.pathname === signUp)); } catch { return false; } }).map(pick);
        return { h1, acts: acts.slice(0, 2), ups: ups.slice(0, 2), path: location.pathname };
    }, { signUp }).catch(() => ({ h1: "", acts: [], ups: [], path: "" }));
    const slug = decodeURIComponent(info.path.split("/").filter(Boolean).pop() || "");
    const visit = async (href) => { const p = await page.context().newPage(); await c.install(p); await p.goto(href, { waitUntil: "load", timeout: 30_000 }).catch(() => { }); await p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => { }); await p.waitForTimeout(500); return p; };
    if (entity && info.h1 && info.acts.length) {
        for (const a of info.acts) {
            if (new URL(a.href).origin !== new URL(src).origin) continue;
            const p = await visit(a.href);
            const seen = await p.evaluate(({ name, slug }) => {
                const vals = Array.from(document.querySelectorAll("input, textarea, select")).map((x) => x.value || "").join(" ");
                const t = `${document.body.innerText} ${vals} ${location.href}`.toLowerCase();
                const parts = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
                return parts.some((w) => t.includes(w)) || (slug.length >= 3 && t.includes(slug.toLowerCase()));
            }, { name: info.h1, slug }).catch(() => true);
            await p.close();
            if (!seen) out.push({ check: "J1", what: `"${a.label}" on ${info.path} ("${info.h1}") opens ${new URL(a.href).pathname}${new URL(a.href).search}, which shows neither "${info.h1}" nor ${slug} — the choice is lost. Pass it (?specialist=${slug}) and show it on the next page [J1]`, where: a.where, selector: a.selector });
        }
    }
    for (const a of info.ups) {
        const want = roleIn(a.label) || roleIn(new URL(a.href).search) || roleIn(info.path);
        if (!want) continue;
        const p = await visit(a.href);
        const chosen = await p.evaluate(() => {
            const sel = Array.from(document.querySelectorAll("[aria-checked=true], [aria-pressed=true], [data-state=on], [data-state=checked], [aria-selected=true], input[type=radio]:checked")).filter((x) => window.__uiVisible(x) || window.__uiVisible(x.closest("label") || x.parentElement));
            return sel.map((x) => ((x.matches("input") ? (x.closest("label") || x.parentElement) : x).innerText || x.getAttribute("aria-label") || x.value || "").trim()).filter(Boolean).slice(0, 4);
        }).catch(() => []);
        await p.close();
        const got = chosen.map(roleIn).find(Boolean);
        if (got && got !== want) out.push({ check: "J1", what: `"${a.label}" (${info.path}) opens sign-up with "${chosen.find((t) => roleIn(t) === got)}" selected — the link is for a ${want}. Pass the role (?role=${want}) and preselect it [J1]`, where: a.where, selector: a.selector });
    }
    return out;
}

/* ───────────────────────── D4 a page loads without a data error (5.5.0) ───────────────────────── */

const ERROR_UI = /failed to (fetch|load)|could ?n[o']t (load|fetch|get)|something went wrong|error loading|unable to (load|fetch|get)|не удалось загрузить|yüklənmədi|жүктелмеді/i;
/**
 * D4 (Kindred x6wx1s: /dashboard/verification showed a client "Failed to fetch verification status" with Retry —
 * GET /api/kyc/status answered 404 for that role). Opens `path` and records same-origin /api/ GETs that answer 4xx/5xx
 * while it loads (401 on a public page is a sign-in check, not this); a finding when one did and the page shows an
 * error state (an error text, or a Retry / Try again button).
 */
export async function dataErrorOnLoad(page, path, { auth = false } = {}) {
    const failed = [];
    const onRes = (r) => {
        try {
            const u = new URL(r.url()), req = r.request();
            let here = ""; try { here = new URL(page.url()).origin; } catch { }
            if (req.method() !== "GET" || u.origin !== here || !/\/api\//.test(u.pathname) || !/^(fetch|xhr)$/.test(req.resourceType())) return;
            if (r.status() >= 400 && !(r.status() === 401 && !auth)) failed.push(`GET ${u.pathname} answered ${r.status()}`);
        } catch { }
    };
    page.on("response", onRes);
    await page.goto(path, { waitUntil: "load", timeout: 45_000 }).catch(() => { });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(1000);
    page.off("response", onRes);
    if (!failed.length) return [];
    const ui = await page.evaluate((re) => {
        const W = window, R = new RegExp(re, "i");
        const txt = Array.from(document.querySelectorAll("main *, body > div *")).filter((e) => e.children.length === 0 && W.__uiVisible(e) && R.test((e.textContent || "").trim()) && (e.textContent || "").length < 200).map((e) => ({ t: (e.textContent || "").trim().slice(0, 90), where: W.__uiDescribe(e), selector: W.__uiSelector(e) }))[0];
        const retry = Array.from(document.querySelectorAll("button, a, [role=button]")).find((b) => W.__uiVisible(b) && /^(retry|try again|reload|повторить|yenidən cəhd et|қайталау)$/i.test((b.textContent || "").trim()));
        return txt || retry ? { text: txt?.t || null, retry: !!retry, where: txt?.where || W.__uiDescribe(retry), selector: txt?.selector || W.__uiSelector(retry) } : null;
    }, ERROR_UI.source).catch(() => null);
    if (!ui) return [];
    return [{ check: "D4", what: `${[...new Set(failed)].slice(0, 2).join(", ")} while the page loads, and it shows ${ui.text ? `"${ui.text}"` : "an error"}${ui.retry ? " with Retry" : ""} — this page is reached from the navigation: give it a real state for this visitor (a plain explanation, an empty state) or hide the item; never a raw load error [D4]`, where: ui.where, selector: ui.selector }];
}

/* ───────────────────────── J2 a guest's choice survives sign-in (5.5.0) ───────────────────────── */

/**
 * J2 (Compass kls2ou, 2g46xt: a guest chose a specialist / a service, pressed "Sign in to start", signed in — and came
 * back to an empty brief). On a signed-out page with a choice made (a selected control, or the page's own entity) and a
 * "Sign in to …" call to action in the page body: record the choice, press the CTA, sign in with `creds` on the page it
 * opens (the one real POST, to the sign-in form), and the page the site lands on must still show the choice — or say
 * that it has to be made again. Returns findings; [] when the page has no such CTA or no choice.
 */
export async function guestChoice(page, { creds, login = {} } = {}) {
    if (!creds?.email || !creds?.password) return [];
    const info = await page.evaluate(() => {
        const W = window;
        const cta = Array.from(document.querySelectorAll("main a[href], main button, main [role=button]")).find((b) => W.__uiVisible(b) && !b.closest("header, nav, footer") && /^(sign ?in|log ?in)\b.{3,}/i.test((b.innerText || "").trim().replace(/\s+/g, " ")));
        if (!cta) return null;
        cta.setAttribute("data-bs-guest", "");
        const chosen = Array.from(document.querySelectorAll("main [aria-pressed=true], main [aria-selected=true], main [aria-checked=true], main [data-state=checked], main [data-state=on], main input[type=radio]:checked")).map((x) => ((x.matches("input") ? (x.closest("label") || x.parentElement) : x).innerText || "").trim().replace(/\s+/g, " ")).filter((t) => t.length >= 3 && t.length < 60);
        // the card the CTA sits in names what is being chosen ("Confirm hire · Erik Olsen")
        let box = cta.parentElement, name = "";
        for (let d = 0; d < 5 && box && box !== document.body && !name; d++, box = box.parentElement) {
            const h = Array.from(box.querySelectorAll("h2, h3, h4, strong, b, [class*=name i]")).find((e) => W.__uiVisible(e) && !e.contains(cta) && !/sign|log ?in|confirm|summary|total/i.test(e.innerText || "") && (e.innerText || "").trim().length >= 3 && (e.innerText || "").trim().length < 50);
            if (h) name = (h.innerText || "").trim();
        }
        return { label: (cta.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40), chosen: [...new Set([...chosen, ...(name ? [name] : [])])].slice(0, 3), where: W.__uiDescribe(cta), selector: W.__uiSelector(cta) };
    }).catch(() => null);
    if (!info || !info.chosen.length) return [];
    await page.locator("[data-bs-guest]").first().click({ timeout: 3000 }).catch(() => { });
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });
    await page.waitForTimeout(800);
    const pw = page.locator(login.passwordSelector || "input[type=password]").first();
    if (!(await pw.isVisible().catch(() => false))) { noteNotTested("J2", `"${info.label}" did not open a page with a password field: the sign-in was not walked`); return []; }
    await page.locator(login.emailSelector || "input[type=email], input[name=email], input[name=username]").first().fill(creds.email, { timeout: 3000 }).catch(() => { });
    await pw.fill(creds.password, { timeout: 3000 }).catch(() => { });
    const atLogin = page.url();
    await page.locator(login.submitSelector || "form:has(input[type=password]) button[type=submit], form:has(input[type=password]) button:not([type=button])").first().click({ timeout: 3000 }).catch(() => pw.press("Enter").catch(() => { }));
    await page.waitForURL((u) => u.href !== atLogin, { timeout: 20_000 }).catch(() => { });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(1200);
    if (page.url() === atLogin) { noteNotTested("J2", `signing in with the test account did not leave ${new URL(atLogin).pathname}: what the site keeps after sign-in was not checked`); return []; }
    const kept = await page.evaluate((names) => {
        const vals = Array.from(document.querySelectorAll("input, textarea, select")).map((x) => x.value || "").join(" ");
        const t = `${document.body.innerText} ${vals} ${decodeURIComponent(location.href)}`.toLowerCase();
        const again = /(choose|select|pick) (it |one |them )?again|(your )?(choice|selection) (was|has been|is) (lost|cleared|reset)|start over/i.test(document.body.innerText);
        return again || names.some((n) => n.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).some((w) => t.includes(w)));
    }, info.chosen).catch(() => true);
    if (kept) return [];
    return [{ check: "J2", what: `a guest who chose ${info.chosen.map((x) => `"${x}"`).join(", ")} and pressed "${info.label}" signs in and lands on ${new URL(page.url()).pathname} without it — the choice is lost. Carry it through sign-in (a return URL with the choice: ?next=/request?specialist=…) and show it again [J2]`, where: info.where, selector: info.selector }];
}
