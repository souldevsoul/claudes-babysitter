// Business acceptance checks: what the business side (BQA, BQA) raised again and again on the
// factory's products, turned into browser checks. Each check has an id (F1, C1, A4 …) that babysitter.config.json
// → acceptance.skip can switch off — with a reason in acceptance.skipReasons. Sources: docs/acceptance.md.
// Plain JavaScript on purpose (see checks.js). Page-level checks need checks.install(page) first.

/** Defaults for babysitter.config.json → acceptance. Every one is an owner decision; override per product. */
export const DEFAULTS = {
  // two-factor sign-in: "required" (a signed-in settings page offers it), "if-claimed" (only when the site
  // says it has 2FA), "off"
  twoFactor: "required",
  accountDeletion: true,
  // owner decision: BQA wants "Manage cookies" right after Cookie Policy in the footer, BQA wants it on the
  // Cookie Policy page only. Both agree it must be reachable from the Cookie Policy page.
  footerManageCookies: true,
  // the currency switcher lives in the header; a second one in the footer is a duplicate
  footerCurrencySelector: false,
  paymentLogos: true,
  currencies: [],
  company: {},
  forbiddenPages: ["/gdpr", "/press", "/currency"],
  // what the site must never say (VAT / tax lines, ≈ approximations, build notes)
  noTax: true,
  analyticsHosts: ["googletagmanager.com", "google-analytics.com", "analytics.google.com", "plausible.io", "segment.io", "segment.com", "hotjar.com", "connect.facebook.net", "clarity.ms", "posthog.com", "mixpanel.com", "amplitude.com", "vercel-insights.com", "va.vercel-scripts.com"],
  auth: { signIn: null, signUp: null, settings: null, passwordless: false },
  policyPaths: [],
  skip: [],
};

export function acceptanceConfig(cfg = {}) {
  const a = cfg.acceptance || {};
  return { ...DEFAULTS, ...a, company: { ...DEFAULTS.company, ...(a.company || {}) }, auth: { ...DEFAULTS.auth, ...(a.auth || {}), signIn: a.auth?.signIn ?? cfg.login?.url ?? null } };
}

const POLICY_RE = /\/(terms|privacy|cookie|cookies|refund|refunds|aml|kyc|legal|policy|policies|gdpr|disclaimer|payments?-policy|cancellation|acceptable-use)(\/|-|$)/i;
export const isPolicyPath = (path, acc = DEFAULTS) => (acc.policyPaths || []).includes(path) || POLICY_RE.test(path);
export const isAuthPath = (path, acc = DEFAULTS) => [acc.auth.signIn, acc.auth.signUp].filter(Boolean).includes(path) || /^\/(login|log-in|signin|sign-in|register|signup|sign-up|auth)(\/|$)/i.test(path);

/* ─────────────── page text ─────────────── */

// Build notes and self-justification that ended up in production copy (BQA 5; ~35 cards on 14 projects).
const LEAK_RE = /(no mailbox is connected|this build\b|this deployment|in this preview|\.vercel\.app|MX record|lorem ipsum|\bTODO\b|\bFIXME\b|placeholder text|coming soon[^.]{0,40}(credits|pay|charge))/i;
const DEFENSIVE_RE = /(we would rather|we'd rather say|is not a promise|rather than pretend|nothing on our side|to be honest|we (do not|don't) pretend|plainly:)/i;

/** B1 — no build notes or self-justifying copy in visible text. */
export const copyLeaks = (page) => page.evaluate(({ leak, defensive }) => {
    const L = new RegExp(leak, "i"), D = new RegExp(defensive, "i");
    const out = { leaks: [], defensive: [] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || seen.has(el) || el.closest("script, style, noscript, code, pre") || !window.__uiVisible(el))
            continue;
        const t = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (!t)
            continue;
        const m = t.match(L) || null, d = t.match(D) || null;
        if (m) {
            seen.add(el);
            out.leaks.push({ what: `build note / unfinished copy in production text: "${m[0]}" [B1, BQA 5]`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
        }
        else if (d) {
            seen.add(el);
            out.defensive.push({ what: `self-justifying copy: "${d[0]}" — state the fact, drop the apology [B1, BQA 5]`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
        }
    }
    return out;
}, { leak: LEAK_RE.source, defensive: DEFENSIVE_RE.source });

/** B2 — no "≈" approximations, B3 — no VAT / tax lines, B4 — big numbers carry a thousands separator. */
export const moneyText = (page, { noTax = true } = {}) => page.evaluate(({ noTax }) => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const push = (el, what) => out.push({ what, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
    for (let n = walker.nextNode(); n && out.length < 25; n = walker.nextNode()) {
        const el = n.parentElement;
        const t = n.textContent || "";
        if (!el || !t.trim() || el.closest("script, style, noscript, code, pre, input, textarea") || !window.__uiVisible(el))
            continue;
        if (/≈|~\s?[$€£₸₼]/.test(t))
            push(el, `approximate price "${t.trim().slice(0, 40)}" — show the exact amount in the chosen currency, no ≈ [B2, BQA 9]`);
        if (noTax && /\b(VAT|incl\.? tax|excl\.? tax|plus tax|\+ tax|sales tax|НДС)\b/i.test(t))
            push(el, `VAT / tax wording "${t.trim().slice(0, 50)}" — the owner rule is no VAT/tax anywhere [B3, BQA 11]`);
        const big = t.match(/(?:[$€£₸₼]\s?\d{5,}|\d{5,}\s?(?:[$€£₸₼]|credits?|EUR|USD|KZT|AZN|GBP)\b)/i);
        if (big)
            push(el, `"${big[0]}" needs a thousands separator [B4, BQA 5]`);
    }
    return out;
}, { noTax });

/* ─────────────── affordance ─────────────── */

/** H2 — everything clickable shows the hand cursor. */
export const pointerCursor = (page) => page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('a[href], button, [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], summary, input[type=submit], input[type=button]'))) {
        if (out.length >= 15)
            break;
        if (!window.__uiVisible(el) || el.matches(":disabled, [aria-disabled=true]") || el.closest("[aria-disabled=true], [inert]"))
            continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8)
            continue;
        const cur = getComputedStyle(el).cursor;
        if (cur !== "pointer")
            out.push({ what: `clickable ${el.tagName.toLowerCase()} shows cursor "${cur}", not the hand [H2, BQA 3]`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
    }
    return out;
});

/** H1 — cards and table rows that do nothing on click do not react to hover either. */
export async function staticHover(page, max = 10) {
    const handles = await page.evaluateHandle((max) => {
        const list = [];
        const interactive = (el) => el.closest("a[href], button, [role=button], [role=link], [onclick], label, summary") || getComputedStyle(el).cursor === "pointer"
            || el.querySelector(":scope > a[href][class*=inset], :scope > a[href][class*=stretched]");
        for (const el of Array.from(document.querySelectorAll("main *, body > div *"))) {
            if (list.length >= max)
                break;
            if (!window.__uiVisible(el) || interactive(el))
                continue;
            const r = el.getBoundingClientRect();
            if (r.width < 160 || r.height < 80 || r.width > innerWidth * 0.9 || r.bottom < 0 || r.top > innerHeight * 3)
                continue;
            const cs = getComputedStyle(el);
            const boxed = parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none" || window.__uiRGBA(cs.backgroundColor)[3] > 0.05;
            if (boxed && parseFloat(cs.paddingTop) >= 12 && !el.querySelector("a[href], button, input, select, textarea"))
                list.push(el);
        }
        return list;
    }, max);
    const els = await handles.getProperties();
    const out = [];
    const snap = (el) => el.evaluate((e) => { const c = getComputedStyle(e); return [c.transform, c.translate, c.scale, c.boxShadow, c.borderTopColor, c.backgroundColor, c.outlineColor].join("|"); });
    for (const h of els.values()) {
        const el = h.asElement();
        if (!el)
            continue;
        await el.scrollIntoViewIfNeeded().catch(() => { });
        const before = await snap(el).catch(() => null);
        await el.hover({ timeout: 1500, force: true }).catch(() => { });
        await page.waitForTimeout(350);
        const after = await snap(el).catch(() => null);
        if (before && after && before !== after)
            out.push(await el.evaluate((e) => ({ what: "card reacts to hover but is not clickable — drop the hover effect or make the whole card a link [H1, BQA 3]", where: window.__uiDescribe(e), selector: window.__uiSelector(e), human: window.__uiHuman(e) })));
        await page.mouse.move(0, 0);
    }
    await handles.dispose();
    return out;
}

/* ─────────────── header ─────────────── */

/** N1 — a sticky header stays flush with the top: no gap above it while scrolling. */
export async function headerFlush(page) {
    await page.evaluate(() => window.scrollTo(0, Math.min(700, document.documentElement.scrollHeight - innerHeight)));
    await page.waitForTimeout(400);
    const out = await page.evaluate(() => {
        const h = document.querySelector("header, [role=banner]");
        if (!h || !window.__uiVisible(h))
            return [];
        const pos = getComputedStyle(h).position;
        const r = h.getBoundingClientRect();
        if (!/sticky|fixed/.test(pos) || r.bottom <= 0)
            return [];
        const out = [];
        if (r.top > 0.5)
            out.push({ what: `sticky header sits ${Math.round(r.top)}px below the top while scrolling — page content shows above it [N1, BQA 6]`, where: window.__uiDescribe(h) });
        const top = document.elementFromPoint(innerWidth / 2, 1);
        if (top && !h.contains(top) && r.top <= 1 && getComputedStyle(h).backgroundColor !== "rgba(0, 0, 0, 0)")
            out.push({ what: "something paints above the sticky header at the top edge [N1]", where: window.__uiDescribe(top) });
        return out;
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    return out;
}

/** N4 — no link twice in the header or in the footer, and no two labels that lead to the same page. */
export const duplicateLinks = (page) => page.evaluate(() => {
    const out = [];
    const norm = (a) => { try {
        const raw = (a.getAttribute("href") || "").trim();
        // "#", "#section" and javascript: open something on this page (a panel, a menu), they are not page links
        if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw))
            return null;
        const u = new URL(a.href, location.href);
        return u.origin === location.origin ? u.pathname.replace(/\/$/, "") + u.search : null;
    }
    catch {
        return null;
    } };
    for (const region of Array.from(document.querySelectorAll("header, footer"))) {
        if (region.parentElement?.closest("header, footer"))
            continue;
        const byHref = new Map();
        for (const a of Array.from(region.querySelectorAll("a[href]"))) {
            if (!window.__uiVisible(a))
                continue;
            const k = norm(a);
            if (k === null || k === "" && a.closest("[class*=logo i], [aria-label*=home i]"))
                continue;
            const label = (a.textContent || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
            if (!label)
                continue;
            byHref.set(k, [...(byHref.get(k) || []), label]);
        }
        const tag = region.tagName.toLowerCase();
        for (const [href, labels] of byHref) {
            if (labels.length < 2)
                continue;
            const distinct = [...new Set(labels.map((l) => l.toLowerCase()))];
            out.push({ what: distinct.length > 1
                    ? `${tag} has ${labels.length} links to ${href || "/"} with different names (${distinct.join(" / ")}) — one page, one link [N4, BQA 1]`
                    : `${tag} links to ${href || "/"} twice ("${labels[0]}") [N4, BQA 6]`, where: tag });
        }
    }
    return out;
});

/** N6 — labels fit their buttons and dropdown triggers (no "ACCOUN…"). */
export const clippedControls = (page) => page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('button, [role=button], [role=combobox], select, a, [role=tab]'))) {
        if (!window.__uiVisible(el) || out.length >= 10)
            continue;
        const cs = getComputedStyle(el);
        const clips = cs.overflow !== "visible" || cs.textOverflow === "ellipsis" || cs.whiteSpace === "nowrap";
        const inner = Array.from(el.querySelectorAll("*")).find((c) => getComputedStyle(c).textOverflow === "ellipsis" && c.scrollWidth > c.clientWidth + 1);
        if (inner || clips && el.scrollWidth > el.clientWidth + 1 && (el.textContent || "").trim().length > 1)
            out.push({ what: `label does not fit its control ("${(el.textContent || "").trim().slice(0, 30)}") [N6, BQA 4]`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
    }
    return out;
});

/* ─────────────── footer ─────────────── */

/** F1–F5 — the footer the business signs off: legal order, © line, company line, support email, payment logos. */
export const footer = (page, acc = DEFAULTS) => page.evaluate((acc) => {
    const out = [];
    const f = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter((x) => window.__uiVisible(x)).pop();
    if (!f)
        return [{ id: "F0", what: "page has no footer [F0, BQA 6/10]", where: "body" }];
    const text = f.innerText.replace(/\s+/g, " ");
    const push = (id, what, el) => out.push({ id, what, where: el ? window.__uiDescribe(el) : "footer", selector: el ? window.__uiSelector(el) : undefined });
    // F1 legal order
    const links = Array.from(f.querySelectorAll("a, button")).filter((a) => window.__uiVisible(a)).map((a) => ({ el: a, t: (a.textContent || "").replace(/\s+/g, " ").trim(), href: a.getAttribute("href") || "" }));
    const kind = (l) => /manage cookies|cookie (settings|preferences)|cookie choices/i.test(l.t) ? "manage"
        : /cookie/i.test(l.t) || /cookie/i.test(l.href) ? "cookies"
            : /^terms|terms of (service|use)|conditions/i.test(l.t) || /\/terms/i.test(l.href) ? "terms"
                : /privacy/i.test(l.t) || /\/privacy/i.test(l.href) ? "privacy"
                    : /policy|refund|aml|kyc|gdpr|legal|disclaimer|cancellation|acceptable use|responsible/i.test(l.t) || /\/(legal|refund|aml|kyc|gdpr|cancellation)/i.test(l.href) ? "legal" : null;
    const legal = links.map((l) => ({ ...l, k: kind(l) })).filter((l) => l.k);
    if (legal.length) {
        const ks = legal.map((l) => l.k);
        const at = (k) => ks.indexOf(k);
        if (at("terms") !== 0 && at("terms") >= 0)
            push("F1", `legal links start with "${legal[0].t}" — Terms comes first, then Privacy [F1, BQA 6]`, legal[0].el);
        if (at("privacy") >= 0 && at("terms") >= 0 && at("privacy") !== at("terms") + 1)
            push("F1", "Privacy Policy does not follow Terms directly [F1, BQA 6]", legal[at("privacy")].el);
        const ci = at("cookies"), mi = at("manage");
        if (acc.footerManageCookies) {
            if (ci < 0)
                push("F1", "footer has no Cookie Policy link [F1, BQA 6]");
            if (mi < 0)
                push("F1", 'footer has no "Manage cookies" — it goes right after Cookie Policy [F1, BQA 6/7]');
            else if (ci >= 0 && mi !== ci + 1)
                push("F1", '"Manage cookies" does not follow Cookie Policy directly [F1, BQA 6]', legal[mi].el);
            if (ci >= 0 && mi >= 0 && Math.max(ci, mi) !== ks.length - 1)
                push("F1", "Cookie Policy + Manage cookies are not the last legal links [F1, BQA 6]", legal[ks.length - 1].el);
        }
        else if (ci >= 0 && ci !== ks.length - 1 && !(mi === ks.length - 1 && mi === ci + 1))
            push("F1", "Cookie Policy is not the last legal link [F1, BQA 6]", legal[ci].el);
    }
    // F2 © line has no logo
    const copy = Array.from(f.querySelectorAll("*")).filter((e) => e.children.length < 6 && /©|\(c\)\s*\d{4}|copyright/i.test(e.textContent || "") && window.__uiVisible(e)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!copy)
        push("F2", 'footer has no "© <year> <company>. All rights reserved." line [F2, BQA 6]');
    else {
        const row = copy.parentElement && copy.parentElement !== f ? copy.parentElement : copy;
        const logo = Array.from(row.querySelectorAll("img, svg, [class*=logo i]")).find((x) => window.__uiVisible(x) && !x.closest("a[href*=visa i], [class*=pay i], [class*=card i]") && x.getBoundingClientRect().width > 14);
        if (logo && logo.getBoundingClientRect().left <= copy.getBoundingClientRect().left + 2)
            push("F2", "logo/brand mark sits in front of the © line — drop it [F2, BQA 6]", logo);
    }
    // F3 company line + support email on the site's own domain
    const company = acc.company?.name;
    if (company ? !text.toLowerCase().includes(company.toLowerCase()) : !/\b(ltd|limited|llc|l\.l\.c|inc|gmbh|sp\.? z o\.?o\.?|oü|ou|s\.?r\.?o|bv|b\.v\.|sarl|s\.a\.|ag|plc|ug|kft|sia|uab|too|тоо)\b/i.test(text))
        push("F3", `footer has no company line (name · address · registration number · jurisdiction)${company ? ` — "${company}" not found` : ""} [F3, BQA 6]`);
    if (company && acc.company?.number && !text.includes(acc.company.number))
        push("F3", `company registration number ${acc.company.number} missing from the footer [F3]`);
    const root = location.hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
    const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).concat(Array.from(f.querySelectorAll("a[href^='mailto:']")).map((a) => a.getAttribute("href").slice(7).split("?")[0])))];
    const want = acc.company?.supportEmail;
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$/.test(location.hostname);
    if (!emails.length)
        push("F3", "footer shows no support email [F3, BQA 6]");
    else if (want && !emails.map((e) => e.toLowerCase()).includes(want.toLowerCase()))
        push("F3", `footer support email is ${emails.join(", ")}, expected ${want} [F3]`);
    else if (!want && !local && !emails.some((e) => e.toLowerCase().endsWith("@" + root) || e.toLowerCase().endsWith("." + root)))
        push("F3", `support email ${emails[0]} is not on the site's domain (${root}) [F3, BQA 6]`);
    // F4 currency selector only in the header
    if (!acc.footerCurrencySelector) {
        const cur = Array.from(f.querySelectorAll('select, [role=combobox], button[aria-haspopup]')).find((x) => window.__uiVisible(x) && /\b(USD|EUR|GBP|KZT|AZN)\b|[$€£₸₼]/.test(x.textContent || "") && document.querySelector("header") && Array.from(document.querySelectorAll("header select, header [role=combobox], header button[aria-haspopup]")).some((h) => /\b(USD|EUR|GBP|KZT|AZN)\b|[$€£₸₼]/.test(h.textContent || "")));
        if (cur)
            push("F4", "currency switcher repeated in the footer — keep the one in the header [F4, BQA]", cur);
    }
    // F5 We accept + Visa/Mastercard, in the site's font
    if (acc.paymentLogos) {
        const marks = Array.from(f.querySelectorAll("img, svg, [aria-label], [title]")).filter((x) => /visa|master ?card/i.test([x.getAttribute("alt"), x.getAttribute("aria-label"), x.getAttribute("title"), x.getAttribute("src"), x.getAttribute("class")].join(" ")));
        if (marks.length < 2 && !/visa/i.test(text))
            push("F5", 'footer has no "We accept" Visa / Mastercard logos [F5, BQA 6]');
        const acceptEl = Array.from(f.querySelectorAll("*")).find((e) => e.children.length === 0 && /we accept|accepted payments|payment methods/i.test(e.textContent || ""));
        if (acceptEl) {
            const bodyFont = getComputedStyle(document.body).fontFamily.split(",")[0].trim();
            const font = getComputedStyle(acceptEl).fontFamily.split(",")[0].trim();
            if (font !== bodyFont && !/mono/i.test(font))
                push("F5", `"We accept" is set in ${font}, the site uses ${bodyFont} [F5, BQA 6]`, acceptEl);
        }
    }
    return out;
}, acc);

/* ─────────────── cookies ─────────────── */

/** C1 — first visit: Accept, Reject / Necessary only and Manage; Manage shows real per-category toggles. C4 — closing the panel closes everything. */
export async function cookieConsent(page) {
    const out = [];
    const accept = page.locator("button, a, [role=button]").filter({ hasText: /^\s*(accept( all)?|allow all|agree|принять( все)?)\s*$/i }).filter({ visible: true }).first();
    if (!(await accept.isVisible().catch(() => false)))
        return [{ id: "C1", what: "no cookie banner with an Accept button on a first visit [C1, BQA 7]", where: "page" }];
    // the banner's own buttons (a footer "Manage cookies" link is a different control)
    await accept.evaluate((b) => (b.closest('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [role=dialog], [role=alertdialog], [role=region]') || b.parentElement).setAttribute("data-bs-cookie-banner", ""));
    const btn = (re) => page.locator("[data-bs-cookie-banner] :is(button, a, [role=button])").filter({ hasText: re }).filter({ visible: true }).first();
    if (!(await btn(/reject|decline|necessary only|only necessary|essential only|отклон/i).isVisible().catch(() => false)))
        out.push({ id: "C1", what: 'cookie banner offers no "Reject" / "Necessary only" choice [C1, BQA]', where: "cookie banner" });
    const manage = btn(/manage|settings|preferences|customi[sz]e|options|настро/i);
    if (!(await manage.isVisible().catch(() => false))) {
        out.push({ id: "C1", what: 'cookie banner has no "Manage" / "Preferences" button [C1, BQA 7]', where: "cookie banner" });
        return out;
    }
    await manage.click().catch(() => { });
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
        const ts = Array.from(document.querySelectorAll('[role=switch], [role=checkbox], input[type=checkbox], button[aria-pressed]')).filter((t) => window.__uiVisible(t));
        return { total: ts.length, enabled: ts.filter((t) => !t.matches(":disabled, [aria-disabled=true], [data-disabled]")).length };
    });
    if (info.total === 0)
        out.push({ id: "C1", what: "cookie preferences show no per-category toggles [C1, BQA]", where: "cookie preferences" });
    else if (info.enabled === 0)
        out.push({ id: "C5", what: "every cookie category is locked on — only strictly necessary may be locked [C5, BQA]", where: "cookie preferences" });
    // C4: the banner and the preferences are one surface — never two cookie boxes on screen at once
    const boxes = () => page.evaluate(() => {
        const roots = new Set();
        for (const b of Array.from(document.querySelectorAll("button, a")).filter((b) => window.__uiVisible(b) && /^(accept( all)?|allow all|agree|save( preferences| choices| settings)?|confirm( choices)?)$/i.test((b.textContent || "").trim())))
            roots.add(b.closest('[role=dialog], [role=alertdialog], [class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i]') || b.parentElement);
        // nested containers of one surface count once
        return Array.from(roots).filter((r) => r && !Array.from(roots).some((o) => o !== r && o && o.contains(r))).length;
    });
    if ((await boxes()) > 1)
        out.push({ id: "C4", what: "cookie banner and cookie preferences are on screen at the same time [C4, BQA]", where: "cookie banner" });
    // a close button must close it; a panel without one asks for a choice, which is fine
    const close = page.locator('[role=dialog] button[aria-label*=close i], [class*=cookie i] button[aria-label*=close i], [class*=consent i] button[aria-label*=close i]').filter({ visible: true }).first();
    if (await close.isVisible().catch(() => false)) {
        await close.click().catch(() => { });
        await page.waitForTimeout(500);
        if ((await boxes()) > 0)
            out.push({ id: "C4", what: "closing cookie preferences with ✕ leaves a cookie box on screen [C4, BQA 7]", where: "cookie preferences" });
    }
    return out;
}

/** C2 — the banner / policy may name Analytics or Marketing only when the site really loads such scripts. */
export const cookieCategories = (page) => page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [role=dialog]')).filter((e) => window.__uiVisible(e)).map((e) => e.innerText).join(" ");
    return { analytics: /\banalytics?\b|statistic/i.test(t), marketing: /\bmarketing\b|advertis|targeting/i.test(t) };
});

/* ─────────────── policies ─────────────── */

/** P1 — policy body spans its column; P2 — "On this page" is sticky and fits; P5 — no repeated company block per policy. */
export async function policyLayout(page) {
    const out = await page.evaluate(() => {
        const out = [];
        const main = document.querySelector("main, article, [role=main]") || document.body;
        const paras = Array.from(main.querySelectorAll("p")).filter((p) => window.__uiVisible(p) && (p.textContent || "").trim().length > 160);
        for (const p of paras.slice(0, 40)) {
            const box = p.parentElement;
            const bs = getComputedStyle(box);
            const inner = box.getBoundingClientRect().width - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
            const w = p.getBoundingClientRect().width;
            if (inner > 400 && w < inner * 0.9) {
                out.push({ id: "P1", what: `policy text uses ${Math.round(w)}px of a ${Math.round(inner)}px column — let it span the box [P1, BQA 8]`, where: window.__uiDescribe(p), selector: window.__uiSelector(p) });
                break;
            }
        }
        // the innermost box that starts with the TOC heading and holds the anchor links (not the page column around it)
        const toc = Array.from(document.querySelectorAll("nav, aside, div")).filter((e) => window.__uiVisible(e) && /^(on this page|contents|table of contents|на этой странице|содержание)/i.test((e.innerText || "").trim()) && e.querySelectorAll("a[href^='#']").length >= 3)
            .sort((x, y) => x.querySelectorAll("*").length - y.querySelectorAll("*").length)[0];
        return { out, toc: toc ? window.__uiSelector(toc) : null, h2: main.querySelectorAll("h2").length };
    });
    const list = out.out;
    if (out.toc) {
        await page.evaluate(() => window.scrollTo(0, Math.min(1500, document.documentElement.scrollHeight / 2)));
        await page.waitForTimeout(300);
        const st = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el)
                return null;
            let sticky = null;
            for (let e = el; e && e !== document.body; e = e.parentElement)
                if (/sticky|fixed/.test(getComputedStyle(e).position)) {
                    sticky = e;
                    break;
                }
            const r = (sticky || el).getBoundingClientRect();
            const scrolls = sticky ? /auto|scroll/.test(getComputedStyle(sticky).overflowY) || Array.from(sticky.querySelectorAll("*")).some((c) => /auto|scroll/.test(getComputedStyle(c).overflowY)) : false;
            return { sticky: !!sticky, inView: r.bottom > 0 && r.top < innerHeight, tooTall: r.height > innerHeight && !scrolls };
        }, out.toc);
        if (st && (!st.sticky || !st.inView))
            list.push({ id: "P2", what: '"On this page" scrolls away — make it sticky [P2, BQA 8]', where: out.toc });
        if (st && st.tooTall)
            list.push({ id: "P2", what: '"On this page" is taller than the screen and does not scroll [P2, BQA]', where: out.toc });
        await page.evaluate(() => window.scrollTo(0, 0));
    }
    else if (out.h2 >= 6)
        list.push({ id: "P2", what: `policy has ${out.h2} sections and no "On this page" navigation [P2, BQA 8]`, where: "main" });
    return list;
}

/** P3 — when a policy names another page ("see our Cookie Policy"), the name is a link. */
export const policyCrossLinks = (page) => page.evaluate(() => {
    const out = [];
    // policy names in any case; product areas only as proper names ("your Dashboard", not "your wallet")
    const names = /([Cc]ookie [Pp]olicy|[Pp]rivacy [Pp]olicy|[Tt]erms of ([Ss]ervice|[Uu]se)|[Tt]erms and [Cc]onditions|[Rr]efund [Pp]olicy|AML [Pp]olicy|[Pp]ayments? [Pp]olicy|[Cc]ancellation [Pp]olicy|\bDashboard\b|\bAccount [Ss]ettings\b|\bWallet\b)/g;
    const main = document.querySelector("main, article") || document.body;
    for (const p of Array.from(main.querySelectorAll("p, li")).filter((e) => window.__uiVisible(e))) {
        const own = Array.from(p.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ");
        const m = own.match(names);
        if (m && !/^\s*$/.test(own) && out.length < 6) {
            const self = document.title.toLowerCase();
            const hit = m.find((x) => !self.includes(x.toLowerCase()));
            if (hit)
                out.push({ id: "P3", what: `"${hit}" is mentioned but not linked [P3, BQA 8]`, where: window.__uiDescribe(p), selector: window.__uiSelector(p) });
        }
    }
    return out;
});

/* ─────────────── auth & account ─────────────── */

/** A1 — every password field has a show/hide eye, kept out of the Tab order. */
export const passwordEye = (page) => page.evaluate(() => {
    const out = [];
    for (const inp of Array.from(document.querySelectorAll("input[type=password]")).filter((i) => window.__uiVisible(i))) {
        let wrap = inp.parentElement, eye = null;
        for (let i = 0; i < 3 && wrap && !eye; i++, wrap = wrap.parentElement)
            eye = Array.from(wrap.querySelectorAll("button, [role=button]")).find((b) => b !== inp && /show|hide|password|eye|reveal|показ|скры/i.test([b.getAttribute("aria-label"), b.getAttribute("title"), b.textContent, b.className].join(" ")) && !/submit|sign|log ?in|continue|forgot/i.test(b.textContent || ""));
        if (!eye)
            out.push({ id: "A1", what: "password field has no show/hide eye [A1, BQA 10]", where: window.__uiDescribe(inp), selector: window.__uiSelector(inp) });
        else if (eye.getAttribute("tabindex") !== "-1")
            out.push({ id: "A1", what: "the password eye takes a Tab stop — Tab from the password should go to the next field (tabindex=-1) [A1, BQA]", where: window.__uiDescribe(eye), selector: window.__uiSelector(eye) });
    }
    return out;
});

/** A3 — sign-up has one consent checkbox that links Terms and Privacy. */
export const signupConsent = (page) => page.evaluate(() => {
    const form = Array.from(document.querySelectorAll("form")).find((f) => window.__uiVisible(f) && f.querySelector("input[type=email], input[name*=email i]")) || document.body;
    const boxes = Array.from(form.querySelectorAll('input[type=checkbox], [role=checkbox], button[role=checkbox]')).filter((b) => window.__uiVisible(b) || window.__uiVisible(b.parentElement || b));
    const zone = (b) => (b.closest("label") || b.parentElement?.parentElement || b.parentElement);
    const consent = boxes.filter((b) => /terms|privacy|agree|accept|соглас/i.test((zone(b)?.textContent || "")));
    if (!consent.length)
        return [{ id: "A3", what: "sign-up has no consent checkbox linking Terms and Privacy [A3, BQA 10]", where: "sign-up form" }];
    const out = [];
    const z = zone(consent[0]);
    const hrefs = Array.from(z.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    if (!hrefs.some((h) => /terms/i.test(h)) || !hrefs.some((h) => /privacy/i.test(h)))
        out.push({ id: "A3", what: "consent text does not link both Terms and Privacy [A3, BQA 10]", where: window.__uiDescribe(z) });
    if (consent.length > 1)
        out.push({ id: "A3", what: `${consent.length} consent checkboxes — one for Terms + Privacy is enough [A3, BQA]`, where: window.__uiDescribe(z) });
    return out;
});

/** Does the visible page offer a control whose text / label matches re? (2FA, delete account, sign out …) */
export const hasControl = (page, source) => page.evaluate((source) => {
    const re = new RegExp(source, "i");
    return Array.from(document.querySelectorAll("button, a, [role=button], [role=switch], [role=tab], label, h2, h3, h4")).some((e) => window.__uiVisible(e) && re.test([e.textContent, e.getAttribute("aria-label")].join(" ")));
}, source);
export const TWO_FA_RE = /two[- ]factor|2fa|two[- ]step|authenticator app|multi[- ]factor|\bmfa\b|двухфактор/i;
export const DELETE_ACCOUNT_RE = /delete (my |your )?account|close (my |your )?account|delete profile|удалить (аккаунт|профиль)/i;
export const SIGN_OUT_RE = /^(sign ?out|log ?out|выйти|выход)$/i;
export const SIGN_IN_CTA_RE = /^(sign ?in|log ?in|create (an )?account|sign ?up|get started free|войти|регистрац)/i;

/** Text the whole page says (for "the site claims X" checks). */
export const pageText = (page) => page.evaluate(() => document.body.innerText || "");

/** Log in through the configured form (same env as prepare.mjs). Returns false without credentials. */
export async function login(page, cfg, base) {
    if (!cfg.login || !process.env.LOGIN_EMAIL || !process.env.LOGIN_PASSWORD)
        return false;
    const url = new URL(cfg.login.url, base).href;
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => page.goto(url));
    await page.fill(cfg.login.emailSelector || 'input[type=email], input[name=email], input[name=username]', process.env.LOGIN_EMAIL);
    await page.fill(cfg.login.passwordSelector || "input[type=password]", process.env.LOGIN_PASSWORD);
    await page.click(cfg.login.submitSelector || 'button[type=submit], form button:not([type=button])');
    await page.waitForURL((u) => u.href !== url && !/login|sign-?in/i.test(u.pathname), { timeout: 20000 }).catch(() => { });
    return !/login|sign-?in/i.test(new URL(page.url()).pathname);
}

/** Click the first visible control matching re; opens a user/account menu first when needed. */
export async function clickControl(page, re) {
    const find = () => page.locator("button, a, [role=menuitem], [role=button]").filter({ hasText: re }).filter({ visible: true }).first();
    if (await find().isVisible().catch(() => false)) {
        await find().click();
        return true;
    }
    const menus = page.locator('header button[aria-haspopup], header [aria-expanded], header button[aria-label*=account i], header button[aria-label*=menu i], header button[aria-label*=user i]').filter({ visible: true });
    for (let i = 0; i < Math.min(await menus.count(), 4); i++) {
        await menus.nth(i).click().catch(() => { });
        await page.waitForTimeout(400);
        if (await find().isVisible().catch(() => false)) {
            await find().click();
            return true;
        }
        await page.keyboard.press("Escape");
    }
    return false;
}

/* ─────────────── content ─────────────── */

/** D3 — the same picture twice on one page (covers, hero, cards). */
export const duplicateImages = (page) => page.evaluate(() => {
    const seen = new Map();
    const out = [];
    for (const img of Array.from(document.querySelectorAll("img"))) {
        if (!window.__uiVisible(img) || img.closest("header, footer, [class*=logo i], [class*=avatar i]"))
            continue;
        const r = img.getBoundingClientRect();
        if (r.width < 120 || r.height < 80)
            continue;
        const src = (img.currentSrc || img.src).replace(/[?&](w|q|width|quality)=\d+/g, "");
        if (seen.has(src))
            out.push({ id: "D3", what: "the same image appears twice on the page [D3, BQA 4]", where: window.__uiDescribe(img), selector: window.__uiSelector(img) });
        else
            seen.set(src, img);
    }
    return out;
});

/** L1 — card grids end on a full row (page sizes are multiples of the column count). */
export const ragGrids = (page) => page.evaluate(() => {
    const out = [];
    for (const g of Array.from(document.querySelectorAll("main *"))) {
        const cs = getComputedStyle(g);
        if (cs.display !== "grid" || !window.__uiVisible(g))
            continue;
        const cols = cs.gridTemplateColumns.split(" ").filter((x) => /px$/.test(x)).length;
        const kids = Array.from(g.children).filter((k) => window.__uiVisible(k));
        if (cols < 2 || kids.length <= cols || kids.length < 4)
            continue;
        const same = kids.every((k) => k.tagName === kids[0].tagName && Math.abs(k.getBoundingClientRect().width - kids[0].getBoundingClientRect().width) < 4);
        if (!same)
            continue;
        const paged = !!document.querySelector('nav[aria-label*=pagination i], [class*=pagination i], button[aria-label*=next i]');
        if (paged && kids.length % cols !== 0)
            out.push({ id: "L1", what: `${kids.length} cards in a ${cols}-column grid leave the last row with ${kids.length % cols} — use a page size that is a multiple of ${cols} [L1, BQA 4]`, where: window.__uiDescribe(g), selector: window.__uiSelector(g) });
    }
    return out;
});

/** Money-looking texts on the page and which currency they are in (M1). */
export const currencyMentions = (page) => page.evaluate(() => {
    const SYM = { "$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₸": "KZT", "₼": "AZN", "zł": "PLN" };
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && found.length < 60; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || el.closest("script, style, noscript, code, [role=listbox], [role=option], option, select, [data-currency-option]") || !window.__uiVisible(el))
            continue;
        const t = n.textContent || "";
        const re = /(US\$|[$€£₸₼]|zł)\s?\d[\d,.\s]*|\d[\d,.\s]*\s?(US\$|[$€£₸₼]|zł|USD|EUR|GBP|KZT|AZN|PLN)\b|\b(USD|EUR|GBP|KZT|AZN|PLN)\s?\d[\d,.]*/g;
        for (const m of t.matchAll(re)) {
            const code = (m[0].match(/USD|EUR|GBP|KZT|AZN|PLN/) || [])[0] || SYM[(m[0].match(/US\$|[$€£₸₼]|zł/) || [])[0]];
            if (code)
                found.push({ code, text: m[0].trim(), where: window.__uiDescribe(el) });
        }
    }
    return found;
});

/** Pick a currency in the site's switcher (header first). Never hangs: every click is bounded. */
export async function chooseCurrency(page, code) {
    // a first-visit cookie banner can sit over the switcher's list
    await page.locator("button").filter({ hasText: /^\s*(accept( all)?|allow all|agree)\s*$/i }).filter({ visible: true }).first().click({ timeout: 3000 }).catch(() => { });
    const trig = page.locator('header select, header [role=combobox], header button[aria-haspopup], header button[data-testid*=currency i], select[name*=currency i], [data-testid*=currency i]').filter({ hasText: /USD|EUR|GBP|KZT|AZN|PLN|[$€£₸₼]/ }).filter({ visible: true }).first();
    if (!(await trig.isVisible().catch(() => false)))
        return false;
    if (await trig.evaluate((e) => e.tagName === "SELECT")) {
        await trig.selectOption({ label: new RegExp(code) }, { timeout: 5000 }).catch(() => trig.selectOption(code, { timeout: 5000 })).catch(() => { });
        return true;
    }
    const click = (l) => l.click({ timeout: 5000 }).catch(() => l.click({ force: true, timeout: 5000 })).then(() => true, () => false);
    if (!(await click(trig)))
        return false;
    await page.waitForTimeout(300);
    const byRole = page.locator("[role=option], [role=menuitem], [role=menuitemradio]").filter({ hasText: new RegExp(`\\b${code}\\b`) }).filter({ visible: true }).first();
    const opt = (await byRole.isVisible().catch(() => false)) ? byRole : page.locator("li, button").filter({ hasText: new RegExp(`^\\W*${code}\\W*$|\\b${code}\\b`) }).filter({ visible: true }).first();
    if (!(await opt.isVisible().catch(() => false)) || !(await click(opt))) {
        await page.keyboard.press("Escape");
        return false;
    }
    await page.waitForTimeout(800);
    return true;
}
