// Business acceptance checks: what the business side (BQA, BQA) raised again and again on the
// factory's products, turned into browser checks. Each check has an id (F1, C1, A4 …) that babysitter.config.json
// → acceptance.skip can switch off — with a reason in acceptance.skipReasons. Sources: docs/acceptance.md.
// Plain JavaScript on purpose (see checks.js). Page-level checks need checks.install(page) first.

import { copyFindings } from "./checks/content.js";

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
  // 5.5.0 (Compass cnfovs): the studio's Visa / Mastercard files (sha256 of the canonical 600×384 PNGs every product
  // ships); a mark served from another file is not the standard one. false turns it off; a list adds files.
  paymentLogoSet: ["0cb89be9b267a61ccca341c20dec316a3c223372ba553a54396fef8c559e4597", "b1de274c303fadf36c796392b55f87441b907d6cb2e0d0021a78dd3e25657016"],
  // 5.5.0 (Compass 3v77n0): where Sign out lands ("/" — the home page, or its locale root)
  afterSignOut: "/",
  // 5.5.0 (Compass gcrh4v): a product that sells credits shows the balance in the signed-in header (null: when it sells credits)
  headerBalance: null,
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

// 5.5.0 (Parallel gjfjnc): /delivery-policy, /shipping-policy, /returns-policy, /specialist-agreement never got P1–P3
const POLICY_RE = /\/(terms|privacy|cookie|cookies|refund|refunds|aml|kyc|legal|policy|policies|gdpr|disclaimer|payments?-policy|cancellation|acceptable-use|[a-z]+(-[a-z]+)*-(policy|terms|agreement|notice))(\/|-|$)/i;
export const isPolicyPath = (path, acc = DEFAULTS) => (acc.policyPaths || []).includes(path) || POLICY_RE.test(path);
export const isAuthPath = (path, acc = DEFAULTS) => [acc.auth.signIn, acc.auth.signUp].filter(Boolean).includes(path) || /^\/(login|log-in|signin|sign-in|register|signup|sign-up|auth)(\/|$)/i.test(path);

/* ─────────────── page text ─────────────── */

/**
 * B1 — no build notes, unfinished or self-justifying copy in visible text (BQA 5; ~35 cards on 14 projects).
 * One source of truth: the CT1 rules of lib/content-rules.js (content.spec reports them on every page and language).
 * acceptance.spec runs B1 only when content.spec is not part of the run (`--only acceptance`), so a phrase is
 * reported once. @returns {Promise<object[]>} findings
 */
export async function copyLeaks(page, cfg = {}) {
    const { hard } = await copyFindings(page, cfg);
    return hard.filter((f) => f.id === "CT1").map((f) => ({ ...f, what: f.what.replace(/\[CT1\]$/, "[B1 = CT1, BQA 5]") }));
}

/**
 * B2 — no "≈" approximations, B3 — no VAT / tax lines, B4 — amounts of money or credits from 1,000 up carry a thousands
 * separator ("1,200 credits", "$12,100"). Only numbers next to a currency sign, code or the word credits count —
 * years, ids, phone numbers and postcodes have none (Praxis Confirm hire, 2026-10: "1200 credits" passed the old
 * 5-digit threshold). The currency may sit in a sibling element ("<b>1200</b> <span>credits</span>").
 * acceptance.thousandsFrom (default 1000) moves the threshold; every finding is returned, none dropped.
 */
export const moneyText = (page, { noTax = true, thousandsFrom = 1000 } = {}) => page.evaluate(({ noTax, digits }) => {
    const out = [];
    const CUR = "[$€£₸₼₽¥₹]";
    const WORD = "(?:credits?|cr\\b|кредит\\w*|kredit\\w*|EUR|USD|KZT|AZN|GBP|RUB|PLN|UAH|CHF|руб\\w*|тг|теңге|manat)";
    const NUM = `\\d{${digits},}`;
    const BIG = new RegExp(`(?:${CUR}\\s?(${NUM})(?![\\d,.\\u00a0\\u202f']?\\d)|(?<![\\d.,\\u00a0\\u202f'])(${NUM})(?:[.,]\\d{1,2})?\\s?(?:${CUR}|${WORD}(?![a-zа-яё])))`, "i");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const push = (el, what) => out.push({ what, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
    const done = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        const t = n.textContent || "";
        if (!el || !t.trim() || el.closest("script, style, noscript, code, pre, input, textarea") || !window.__uiVisible(el))
            continue;
        if (/≈|~\s?[$€£₸₼]/.test(t))
            push(el, `approximate price "${t.trim().slice(0, 40)}" — show the exact amount in the chosen currency, no ≈ [B2, BQA 9]`);
        if (noTax && /\b(VAT|incl\.? tax|excl\.? tax|plus tax|\+ tax|sales tax|НДС)\b/i.test(t))
            push(el, `VAT / tax wording "${t.trim().slice(0, 50)}" — the owner rule is no VAT/tax anywhere [B3, BQA 11]`);
        if (!new RegExp(`\\d{${digits}}`).test(t))
            continue;
        // the number's own text, or the short line it sits in when the currency is a sibling element
        let ctx = t, host = el;
        if (!BIG.test(t))
            for (let p = el, i = 0; p && i < 2; p = p.parentElement, i++) {
                const pt = (p.textContent || "").replace(/\s+/g, " ");
                if (pt.length > 120)
                    break;
                if (BIG.test(pt)) {
                    ctx = pt;
                    host = el;
                    break;
                }
            }
        const big = ctx.match(BIG);
        if (big && !done.has(host)) {
            done.add(host);
            push(host, `"${big[0].trim()}" needs a thousands separator ("${Number(big[1] || big[2]).toLocaleString("en-US")}") [B4, BQA 5]`);
        }
    }
    return out;
}, { noTax, digits: String(Math.max(1, Math.floor(thousandsFrom)).toString().length) });

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
        const links = Array.from(region.querySelectorAll("a[href]")).filter((a) => window.__uiVisible(a));
        // the logo + "← Back to home" pair on an auth page is what FM8 asks for: the back link is the way out, not a
        // second name for the home page (praxis /login). A text "Home" next to the logo still counts.
        const logoHome = links.some((a) => norm(a) === "" && !window.__uiBackLink(a) && a.querySelector("img, svg, [class*=logo i]"));
        for (const a of links) {
            const k = norm(a);
            if (k === null || k === "" && a.closest("[class*=logo i], [aria-label*=home i]"))
                continue;
            if (k === "" && logoHome && window.__uiBackLink(a))
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
    // the studio's shared legal identity placeholder (canon R-OWN-08: "New Company 1" / "New Address 1" / "000000000",
    // no legal form until the owner assigns an entity) is the company line; acceptance.legalIdentity overrides it
    const legalId = acc.legalIdentity || ["New Company 1", "New Address 1", "000000000"];
    const placeholder = legalId.length > 0 && legalId.every((x) => text.includes(x));
    if (placeholder) { /* the placeholder company line */ } else if (company ? !text.toLowerCase().includes(company.toLowerCase()) : !/\b(ltd|limited|llc|l\.l\.c|inc|gmbh|sp\.? z o\.?o\.?|oü|ou|s\.?r\.?o|bv|b\.v\.|sarl|s\.a\.|ag|plc|ug|kft|sia|uab|too|тоо)\b/i.test(text))
        push("F3", `footer has no company line (name · address · registration number · jurisdiction)${company ? ` — "${company}" not found` : ""} [F3, BQA 6]`);
    if (company && acc.company?.number && !text.includes(acc.company.number))
        push("F3", `company registration number ${acc.company.number} missing from the footer [F3]`);
    const root = location.hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
    const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).concat(Array.from(f.querySelectorAll("a[href^='mailto:']")).map((a) => a.getAttribute("href").slice(7).split("?")[0])))];
    const want = acc.company?.supportEmail;
    // on a preview host the product's own domain is unknown, so the same-domain rule waits — but an address ON a
    // preview host never receives mail and fails everywhere (30 projects; MX lookups: content.spec CT9)
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
    const preview = /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$/.test(location.hostname);
    const onPreview = emails.find((e) => /(^|\.)(vercel\.app|netlify\.app|pages\.dev|herokuapp\.com|onrender\.com|railway\.app|fly\.dev)$/i.test(e.split("@")[1] || ""));
    if (onPreview)
        push("F3", `support email ${onPreview} is on a preview host — it has no mailbox, mail to it bounces [F3, CT9]`);
    if (!emails.length)
        push("F3", "footer shows no support email [F3, BQA 6]");
    else if (want && !emails.map((e) => e.toLowerCase()).includes(want.toLowerCase()))
        push("F3", `footer support email is ${emails.join(", ")}, expected ${want} [F3]`);
    else if (!want && !local && !preview && !onPreview && !emails.some((e) => e.toLowerCase().endsWith("@" + root) || e.toLowerCase().endsWith("." + root)))
        push("F3", `support email ${emails[0]} is not on the site's domain (${root}) [F3, BQA 6]`);
    // F4 currency selector only in the header
    if (!acc.footerCurrencySelector) {
        const cur = Array.from(f.querySelectorAll('select, [role=combobox], button[aria-haspopup]')).find((x) => window.__uiVisible(x) && /\b(USD|EUR|GBP|KZT|AZN)\b|[$€£₸₼]/.test(x.textContent || "") && document.querySelector("header") && Array.from(document.querySelectorAll("header select, header [role=combobox], header button[aria-haspopup]")).some((h) => /\b(USD|EUR|GBP|KZT|AZN)\b|[$€£₸₼]/.test(h.textContent || "")));
        if (cur)
            push("F4", "currency switcher repeated in the footer — keep the one in the header [F4, BQA]", cur);
    }
    // F5 "We accept" + Visa/Mastercard, in the site's font. Logos without the label read as decoration or as a
    // badge of a partner: the label is required next to them (Praxis footer, 2026-10: logos with no "We accept")
    if (acc.paymentLogos) {
        const marks = Array.from(f.querySelectorAll("img, svg, [aria-label], [title]")).filter((x) => window.__uiVisible(x) && /visa|master ?card/i.test([x.getAttribute("alt"), x.getAttribute("aria-label"), x.getAttribute("title"), x.getAttribute("src"), x.getAttribute("class")].join(" ")));
        const ACCEPT = /we accept|accepted (payments|cards)|payment methods|we take|мы принимаем|принимаем( к оплате)?|способы оплаты|qəbul edirik|ödəniş üsulları|қабылдаймыз|төлем (әдістері|тәсілдері)|wir akzeptieren|zahlungsmethoden|nous acceptons|moyens de paiement|aceptamos|métodos de pago|accettiamo|akceptujemy|metody płatności|приймаємо/i;
        // the innermost element that says it (a row holding the label and the logos says it too)
        const acceptEl = Array.from(f.querySelectorAll("*")).filter((e) => window.__uiVisible(e) && ACCEPT.test(e.textContent || "") && (e.textContent || "").length < 80 && !Array.from(e.children).some((ch) => ACCEPT.test(ch.textContent || "")))
            .sort((x, y) => (x.textContent || "").length - (y.textContent || "").length)[0];
        if (marks.length < 2 && !/visa/i.test(text))
            push("F5", 'footer has no "We accept" Visa / Mastercard logos [F5, BQA 6]');
        else if (!acceptEl)
            push("F5", 'payment logos without a "We accept" label — put "We accept" (in the page language) right before the Visa / Mastercard logos [F5, BQA 6]', marks[0]);
        else if (marks.length) {
            // the label belongs to the logos: within ~160 px of them, not somewhere else in the footer
            const lr = acceptEl.getBoundingClientRect();
            const near = marks.some((m) => { const r = m.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - (lr.top + lr.bottom) / 2) < 160 && Math.min(Math.abs(r.left - lr.right), Math.abs(lr.left - r.right), Math.abs(r.left - lr.left)) < 400; });
            if (!near)
                push("F5", '"We accept" is far from the payment logos — keep the label next to the Visa / Mastercard logos [F5, BQA 6]', acceptEl);
            else {
                // 5.5.0 (Compass r98e7t): on the logos' line, before the first one — not above them
                const imgs = marks.filter((m) => m.getBoundingClientRect().width > 8).sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left);
                const first = imgs[0] && imgs[0].getBoundingClientRect();
                // a label element that holds the logos itself ("<p>We accept <svg/><svg/></p>") is on their line
                if (first && !imgs.some((m) => acceptEl.contains(m))) {
                    const mid = (lr.top + lr.bottom) / 2;
                    const onLine = mid >= first.top - first.height / 2 && mid <= first.bottom + first.height / 2;
                    const before = lr.right <= first.left + 4;
                    if (!onLine || !before) {
                        // a phone row too narrow for the label and the logos wraps on purpose: check by eye
                        let row = imgs[0].parentElement; while (row && !row.contains(acceptEl)) row = row.parentElement;
                        // the label's text, not its (block) box
                        const rg = document.createRange(); rg.selectNodeContents(acceptEl);
                        const need = rg.getBoundingClientRect().width + imgs.reduce((a, m) => a + m.getBoundingClientRect().width + 8, 0);
                        const narrow = row && row.getBoundingClientRect().width < need;
                        out.push({ id: "F5", soft: !!narrow, what: `"We accept" sits ${!onLine ? (mid < first.top ? "above" : "below") : "after"} the payment logos — put it on their line, right before the Visa logo [F5, BQA 6]`, where: window.__uiDescribe(acceptEl), selector: window.__uiSelector(acceptEl) });
                    }
                }
            }
        }
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
// the banner's accept: "Accept", and (5.5.0, Kindred / Compass, issues #4 #5) "OK" / "Got it" / "I understand" —
// the one button of a notice; whether that is enough depends on what the site stores (cookieConsent)
export const ACCEPT_BTN = /^\s*(accept( all)?( cookies)?|allow( all)?( cookies)?|(i )?agree|ok(ay)?|got it|understood|i understand|принять( все)?|понятно|хорошо|qəbul et|razıyam|başa düşdüm|қабылдау|келісемін|түсінікті)\s*[.!]?\s*$/i;
const OK_ONLY = /^\s*(ok(ay)?|got it|understood|i understand|понятно|хорошо|başa düşdüm|түсінікті)\s*[.!]?\s*$/i;
/** Stored items that are not strictly necessary (names against ESSENTIAL_STORAGE + acceptance.essentialStorage; any cookie of an analytics host). */
export function nonEssentialOf(list, acc = DEFAULTS) {
    const essential = [ESSENTIAL_STORAGE, ...(acc.essentialStorage || []).map((x) => new RegExp(x, "i"))];
    const hosts = acc.analyticsHosts || [];
    return list.filter((x) => (x.kind === "cookie" && hosts.some((h) => String(x.domain || "").replace(/^\./, "").endsWith(h))) || !essential.some((re) => re.test(x.name)));
}
export async function cookieConsent(page, { acc = DEFAULTS } = {}) {
    const out = [];
    const accept = page.locator("button, a, [role=button]").filter({ hasText: ACCEPT_BTN }).filter({ visible: true }).first();
    if (!(await accept.isVisible().catch(() => false)))
        return [{ id: "C1", what: "no cookie banner with an Accept button on a first visit [C1, BQA 7]", where: "page" }];
    // the banner's own buttons (a footer "Manage cookies" link is a different control)
    const inBanner = await accept.evaluate((b) => { const box = b.closest('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [role=dialog], [role=alertdialog], [role=region], [aria-label*=cookie i]'); (box || b.parentElement).setAttribute("data-bs-cookie-banner", ""); const COOKIE = /cookie|consent|kuki|куки|çerez|печенье/i; return !!box && (COOKIE.test(`${box.className} ${box.id} ${box.getAttribute("aria-label") || ""}`) || COOKIE.test(box.textContent || "")) || COOKIE.test(b.parentElement?.textContent || ""); }).catch(() => false);
    const label = ((await accept.textContent().catch(() => "")) || "").trim();
    // an "OK" that is not part of a cookie notice (a dialog's OK) is not a banner
    if (OK_ONLY.test(label) && !inBanner)
        return [{ id: "C1", what: "no cookie banner with an Accept button on a first visit [C1, BQA 7]", where: "page" }];
    const btn = (re) => page.locator("[data-bs-cookie-banner] :is(button, a, [role=button])").filter({ hasText: re }).filter({ visible: true }).first();
    const hasReject = await btn(/reject|decline|necessary only|only necessary|essential only|отклон/i).isVisible().catch(() => false);
    // 5.5.0 (Kindred, issue #4): a notice with one "OK" on a site that sets only strictly necessary cookies offers no
    // choice because there is none — compliant. It is measured: nothing non-essential stored before or after OK, no
    // analytics host asked. If the site does store more, the notice needs Reject like any banner.
    if (!hasReject && OK_ONLY.test(label)) {
        const hosts = acc.analyticsHosts || [];
        const tracked = [];
        const onReq = (req) => { try { const h = new URL(req.url()).hostname; if (hosts.some((x) => h === x || h.endsWith("." + x))) tracked.push(h); } catch { } };
        page.on("request", onReq);
        const before = nonEssentialOf(await storageNow(page), acc);
        await accept.click({ timeout: 3000 }).catch(() => { });
        await page.waitForTimeout(1200);
        const after = nonEssentialOf(await storageNow(page), acc);
        page.off("request", onReq);
        const extra = [...before, ...after].filter((x, i, l) => l.findIndex((y) => y.kind === x.kind && y.name === x.name) === i);
        if (!extra.length && !tracked.length) {
            // essential-only notice: nothing to choose — but when the site does have a cookie settings window (the
            // footer's "Manage cookies" opens one with per-category switches), the banner offers it too (Compass
            // y28qwn: "OK" on the banner, "Manage cookies" in the footer only). A footer link that reopens the same
            // notice (Kindred) is not a settings window.
            const settings = await openCookieSettingsFromFooter(page);
            if (settings) out.push({ id: "C1", what: `the cookie notice offers only "${label}", while "${settings}" in the footer opens cookie settings — put a "Manage" button on the banner that opens the same window [C1, BQA 7]`, where: "cookie banner" });
            return out;
        }
        out.push({ id: "C1", what: `the cookie notice offers only "${label}", but the site stores ${extra.slice(0, 5).map((x) => `${x.kind} "${x.name}"`).join(", ")}${tracked.length ? `${extra.length ? " and " : ""}asks ${[...new Set(tracked)].join(", ")}` : ""} — that is not strictly necessary, so the visitor needs a "Reject" / "Necessary only" choice (or name it in acceptance.essentialStorage with the reason) [C1, BQA]`, where: "cookie banner" });
        return out;
    }
    if (!hasReject)
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

// what a consent choice may leave behind without being "tracking": the choice itself, the session, security, the
// language / currency / theme the visitor picked, a form draft the policy names (acceptance.essentialStorage adds more)
export const ESSENTIAL_STORAGE = /(consent|cookie|choice|gdpr|ccpa|cmp|privacy|locale|lang|language|i18n|currency|theme|color-?scheme|session|csrf|xsrf|auth|next-auth|__host-|__secure-|token|sidebar|draft|unfinished|_state$)/i;
const REJECT_BTN = /^\s*(reject( all)?|decline( all)?|deny|refuse|only (necessary|essential)|necessary only|essential only|отклонить( все)?|только необходимые|rədd et|imtina|бас тарту)\s*$/i;
async function storageNow(page) {
    const cookies = (await page.context().cookies().catch(() => [])).map((c) => ({ kind: "cookie", name: c.name, domain: c.domain }));
    const web = await page.evaluate(() => {
        const out = [];
        try { for (let i = 0; i < localStorage.length; i++) out.push({ kind: "localStorage", name: localStorage.key(i) }); } catch { }
        try { for (let i = 0; i < sessionStorage.length; i++) out.push({ kind: "sessionStorage", name: sessionStorage.key(i) }); } catch { }
        return out;
    }).catch(() => []);
    return [...cookies, ...web];
}
/**
 * C6 — "Decline" really declines (5.2.0; Parallel: "the Decline button does nothing"). On a first visit, in a fresh
 * context: pressing Reject / Decline closes the banner; afterwards nothing that is not strictly necessary is stored
 * (cookies, localStorage, sessionStorage — names matched against ESSENTIAL_STORAGE + acceptance.essentialStorage;
 * a cookie of an analytics host always counts), no analytics host is requested, and the choice persists: after a
 * reload and on the next page the banner does not ask again. C1 only checked that the button exists.
 * @returns {Promise<object[]>} findings (id C6)
 */
export async function cookieDecline(page, { acc = DEFAULTS, next = null } = {}) {
    const out = [];
    const essential = [ESSENTIAL_STORAGE, ...(acc.essentialStorage || []).map((x) => new RegExp(x, "i"))];
    const hosts = acc.analyticsHosts || [];
    const tracked = [];
    page.on("request", (req) => { try { const h = new URL(req.url()).hostname; if (hosts.some((x) => h === x || h.endsWith("." + x))) tracked.push(h); } catch { } });
    const decline = page.locator("button, [role=button], a").filter({ hasText: REJECT_BTN }).filter({ visible: true }).first();
    if (!(await decline.isVisible().catch(() => false)))
        return out; // no Decline on the banner: C1 says so
    const label = ((await decline.textContent().catch(() => "")) || "").trim();
    const box = await decline.evaluate((b) => { const r = b.closest('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [role=dialog], [role=alertdialog], [role=region], [aria-label*=cookie i]') || b.parentElement; r.setAttribute("data-bs-decline-banner", ""); return window.__uiDescribe(r); }).catch(() => "cookie banner");
    await decline.click({ timeout: 3000 }).catch(() => { });
    await page.waitForTimeout(800);
    const stays = await page.evaluate((re) => { const b = document.querySelector("[data-bs-decline-banner]"); if (!b || !window.__uiVisible(b)) return false; return Array.from(b.querySelectorAll("button, [role=button], a")).some((x) => window.__uiVisible(x) && new RegExp(re, "i").test((x.textContent || "").trim())); }, REJECT_BTN.source).catch(() => false);
    if (stays)
        out.push({ id: "C6", what: `"${label}" does nothing: the cookie banner stays on screen after it is pressed — Decline must record the choice and close the banner, the same way Accept does [C6, BQA 7]`, where: box });
    const nonEssential = (list) => nonEssentialOf(list, acc);
    const after = nonEssential(await storageNow(page));
    if (after.length)
        out.push({ id: "C6", what: `after "${label}" the site still stores ${after.slice(0, 6).map((x) => `${x.kind} "${x.name}"`).join(", ")}${after.length > 6 ? ` and ${after.length - 6} more` : ""} — nothing beyond what is strictly necessary may be stored once the visitor declines (or name it in acceptance.essentialStorage with the reason) [C6, BQA 7]`, where: box });
    // the choice persists: a reload (and the next page) does not ask again
    await page.reload({ waitUntil: "load" }).catch(() => { });
    await page.waitForTimeout(900);
    const asks = async () => page.locator("button, [role=button], a").filter({ hasText: REJECT_BTN }).filter({ visible: true }).count().catch(() => 0);
    if (!stays && (await asks()))
        out.push({ id: "C6", what: `"${label}" is not remembered: after a reload the cookie banner asks again — store the choice (a necessary cookie or localStorage entry) and read it on load [C6, BQA 7]`, where: box });
    if (next) {
        await page.goto(next, { waitUntil: "load" }).catch(() => { });
        await page.waitForTimeout(700);
        if (!stays && !out.some((f) => /not remembered/.test(f.what)) && (await asks()))
            out.push({ id: "C6", what: `"${label}" is not remembered on the next page (${new URL(page.url()).pathname}): the banner asks again [C6, BQA 7]`, where: box });
        const later = nonEssential(await storageNow(page)).filter((x) => !after.some((y) => y.kind === x.kind && y.name === x.name));
        if (later.length)
            out.push({ id: "C6", what: `after "${label}", the next page stores ${later.slice(0, 6).map((x) => `${x.kind} "${x.name}"`).join(", ")} — not strictly necessary [C6, BQA 7]`, where: "page" });
    }
    if (tracked.length)
        out.push({ id: "C6", what: `after "${label}" the page still calls ${[...new Set(tracked)].join(", ")} — no analytics or advertising request once the visitor declines [C6, BQA 7]`, where: "network" });
    return out;
}

/**
 * C7 — a link inside the cookie settings (or any open dialog) opens its page and the dialog goes away (5.2.0; Praxis
 * on phones: the settings window lives in the root layout, so "Cookie Policy" navigated under a still-open dialog
 * that covers the screen — the link looked dead). Each same-origin link of the open panel is clicked once.
 * `open` opens the panel (returns false when there is none).
 */
export async function dialogLinks(page, open) {
    const out = [];
    const home = page.url();
    const links = await (async () => {
        if (!(await open())) return [];
        return page.evaluate(() => Array.from(document.querySelectorAll("[role=dialog] a[href], [role=alertdialog] a[href], dialog[open] a[href], [data-bs-cookie] a[href]")).filter((a) => window.__uiVisible(a) && a.target !== "_blank").map((a) => { try { const u = new URL(a.href); return u.origin === location.origin ? { href: u.pathname + u.search + u.hash, text: (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) } : null; } catch { return null; } }).filter(Boolean).slice(0, 3)).catch(() => []);
    })();
    for (const l of links) {
        if (page.url() !== home) { await page.goto(home, { waitUntil: "load" }).catch(() => { }); await page.waitForTimeout(400); }
        if (!(await open())) break;
        const loc = page.locator("[role=dialog] a[href], [role=alertdialog] a[href], dialog[open] a[href], [data-bs-cookie] a[href]").filter({ hasText: l.text }).filter({ visible: true }).first();
        await loc.click({ timeout: 2500 }).catch(() => { });
        await page.waitForTimeout(1200);
        const moved = new URL(page.url()).pathname !== new URL(home).pathname;
        const cover = await page.evaluate(() => {
            const d = Array.from(document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open], [data-bs-cookie]")).filter((x) => window.__uiVisible(x));
            const vw = innerWidth * innerHeight;
            const big = d.map((x) => { const r = x.getBoundingClientRect(); const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)), h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)); return { where: window.__uiDescribe(x), share: (w * h) / vw }; }).sort((a, b) => b.share - a.share)[0];
            return big || null;
        }).catch(() => null);
        if (moved && cover && cover.share >= 0.35)
            out.push({ id: "C7", what: `"${l.text}" in the open dialog opens ${l.href} underneath — the dialog stays open over ${Math.round(cover.share * 100)}% of the screen, so the link looks dead. Close the dialog when the link is followed (onClick → setOpen(false)) [C7, BQA 7]`, where: cover.where });
        else if (!moved && cover)
            out.push({ id: "C7", what: `"${l.text}" in the open dialog does nothing — it neither opens ${l.href} nor closes the dialog [C7, BQA 7]`, where: cover.where });
    }
    if (page.url() !== home) await page.goto(home, { waitUntil: "load" }).catch(() => { });
    return out;
}
/** Opens the cookie settings the way a visitor does: the banner's Manage / Settings, else the footer's "Cookie settings". */
export async function openCookieSettings(page) {
    const already = await page.locator("[role=dialog], [role=alertdialog], dialog[open]").filter({ hasText: /cookie/i }).filter({ visible: true }).count().catch(() => 0);
    if (already) return true;
    for (const sel of ["[class*=cookie i] :is(button, a), [id*=cookie i] :is(button, a), [class*=consent i] :is(button, a), [aria-label*=cookie i] :is(button, a)", "footer :is(button, a)"]) {
        const b = page.locator(sel).filter({ hasText: /^\s*(manage( cookies)?|cookie (settings|preferences|choices)|settings|preferences|customi[sz]e|настро\w*( cookie)?|cookie parametrl\w*|cookie баптау\w*)\s*$/i }).filter({ visible: true }).first();
        if (await b.isVisible().catch(() => false)) {
            await b.click({ timeout: 2500 }).catch(() => { });
            await page.waitForTimeout(600);
            if (await page.locator("[role=dialog], [role=alertdialog], dialog[open]").filter({ visible: true }).count().catch(() => 0)) return true;
        }
    }
    return false;
}

/** C2 — the banner / policy may name Analytics or Marketing only when the site really loads such scripts. */
export const cookieCategories = (page) => page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [role=dialog]')).filter((e) => window.__uiVisible(e)).map((e) => e.innerText).join(" ");
    return { analytics: /\banalytics?\b|statistic/i.test(t), marketing: /\bmarketing\b|advertis|targeting/i.test(t) };
});

/* ─────────────── policies ─────────────── */

/** P1 — policy body spans its column; P2 — "On this page" is sticky and fits; P5 — no repeated company block per policy. */
export async function policyLayout(page, { tocMobile = "auto" } = {}) {
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
        const TOC = /^(on this page|contents|table of contents|in this (policy|document|page)|на этой странице|содержание|bu səhifədə|mündəricat|мазмұны)/i;
        const toc = Array.from(document.querySelectorAll("nav, aside, div")).filter((e) => window.__uiVisible(e) && TOC.test((e.innerText || "").trim()) && e.querySelectorAll("a[href^='#']").length >= 3)
            .sort((x, y) => x.querySelectorAll("*").length - y.querySelectorAll("*").length)[0];
        // a collapsed contents bar: a disclosure ("Contents · Fees" button with aria-expanded / aria-controls, or a
        // <details> summary) that opens the anchor list — the list exists only while it is open (parallel, praxis
        // policies on phones)
        document.querySelectorAll("[data-bs-toc-ctrl]").forEach((e) => e.removeAttribute("data-bs-toc-ctrl"));
        const ctrl = Array.from(document.querySelectorAll("summary, button, [role=button]")).filter((e) => window.__uiVisible(e) && (!toc || !toc.contains(e)) && (
            (TOC.test((e.innerText || e.textContent || "").trim()) && (e.matches("summary") || e.hasAttribute("aria-expanded") || e.hasAttribute("aria-controls")))
            || (e.matches("summary") && e.parentElement.querySelectorAll("a[href^='#']").length >= 3)))[0];
        if (ctrl)
            ctrl.setAttribute("data-bs-toc-ctrl", "");
        // 5.5.0 (Kindred, issue #4 item 16; owner decision 21.10): on phones the contents may be a collapsible list at the
        // top (an accordion / <details> before the first section) instead of a sticky bar
        const firstH2 = main.querySelector("h2");
        const before = (e) => !!e && !!firstH2 && !!(e.compareDocumentPosition(firstH2) & Node.DOCUMENT_POSITION_FOLLOWING);
        const collapsible = (e) => !!e && (e.matches("details") || !!e.querySelector("summary, [aria-expanded], [data-state]"));
        const collapsibleTop = (before(ctrl)) || (collapsible(toc) && before(toc));
        return { out, toc: toc ? window.__uiSelector(toc) : null, ctrl: ctrl ? "[data-bs-toc-ctrl]" : null, ctrlWhere: ctrl ? window.__uiDescribe(ctrl) : null, h2: main.querySelectorAll("h2").length, collapsibleTop, phone: innerWidth < 768 };
    });
    const list = out.out;
    if (out.toc || out.ctrl) {
        await page.evaluate(() => window.scrollTo(0, Math.min(1500, document.documentElement.scrollHeight / 2)));
        await page.waitForTimeout(300);
        const probe = (sel) => page.evaluate((sel) => {
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
        }, sel);
        const st = out.toc ? await probe(out.toc) : null;
        const sc = out.ctrl ? await probe(out.ctrl) : null;
        const stays = (x) => x && x.sticky && x.inView;
        // the open list or the collapsed bar stays on screen: either is the sticky "On this page"
        const collapsibleOk = out.phone && tocMobile !== "sticky" && (out.collapsibleTop || tocMobile === "collapsible");
        if ((st || sc) && !stays(st) && !stays(sc) && !collapsibleOk)
            list.push({ id: "P2", what: '"On this page" scrolls away — make it sticky [P2, BQA 8]', where: out.toc || out.ctrlWhere });
        if (stays(st) && st.tooTall)
            list.push({ id: "P2", what: '"On this page" is taller than the screen and does not scroll [P2, BQA]', where: out.toc });
        await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll("[data-bs-toc-ctrl]").forEach((e) => e.removeAttribute("data-bs-toc-ctrl")); });
    }
    else if (out.h2 >= 6)
        list.push({ id: "P2", what: `policy has ${out.h2} sections and no "On this page" navigation [P2, BQA 8]`, where: "main" });
    // 5.5.0: what the site-wide P2 parity compares (policyRailParity)
    Object.defineProperty(list, "meta", { value: { h2: out.h2, toc: !!(out.toc || out.ctrl) }, enumerable: false });
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
            // "Wallet: your credit balance, top-ups …" in a privacy policy's list of data names a category of data, not
            // the page (praxis /privacy); "top up from your Wallet" still names the page
            const label = (x) => /^(dashboard|account settings|wallet)$/i.test(x) && new RegExp(`^\\s*(your\\s+)?${x}\\s*(data\\s*)?[:—–-]`, "i").test(own);
            const hit = m.find((x) => !self.includes(x.toLowerCase()) && !label(x));
            if (hit)
                out.push({ id: "P3", what: `"${hit}" is mentioned but not linked [P3, BQA 8]`, where: window.__uiDescribe(p), selector: window.__uiSelector(p) });
        }
    }
    return out;
});

/* ─────────────── auth & account ─────────────── */

/**
 * A1 — every password field has its own show/hide eye, kept out of the Tab order. The eye is looked for only inside
 * the field's own wrapper: the ancestors that hold this password field and no other one (Praxis sign-up, 2026-10:
 * the search climbed three levels into the grid that held both fields, and the Password eye counted for Confirm
 * password). Sign-up, sign-in, reset, change-password and settings forms alike — and dialogs, once opened.
 */
export const passwordEye = (page) => page.evaluate(() => {
    const out = [];
    const EYE = /show|hide|password|eye|reveal|toggle|visib|показ|скры|göstər|gizlə|көрсет|жасыр/i;
    const NOT = /submit|sign|log ?in|continue|forgot|reset|save|update|change|next/i;
    const fields = Array.from(document.querySelectorAll("input[type=password]")).filter((i) => window.__uiVisible(i));
    const all = Array.from(document.querySelectorAll("input[type=password]"));
    for (const inp of fields) {
        let eye = null;
        for (let wrap = inp.parentElement, i = 0; wrap && wrap !== document.body && i < 4 && !eye; wrap = wrap.parentElement, i++) {
            // the wrapper holds another password field: everything from here up is shared, not this field's own
            if (all.some((o) => o !== inp && wrap.contains(o)))
                break;
            eye = Array.from(wrap.querySelectorAll("button, [role=button]")).find((b) => b !== inp && EYE.test([b.getAttribute("aria-label"), b.getAttribute("title"), b.textContent, typeof b.className === "string" ? b.className : ""].join(" ")) && !NOT.test(b.textContent || "") && !b.matches("[type=submit]"));
        }
        const label = (window.__uiHuman(inp) || {}).name || inp.getAttribute("name") || inp.id || "password";
        if (!eye)
            out.push({ id: "A1", what: `password field "${label}" has no show/hide eye of its own — every password field (confirm, new, current) gets its own toggle inside the field [A1, BQA 10]`, where: window.__uiDescribe(inp), selector: window.__uiSelector(inp), human: window.__uiHuman(inp) });
        else if (eye.getAttribute("tabindex") !== "-1")
            out.push({ id: "A1", what: `the eye of "${label}" takes a Tab stop — Tab from the password should go to the next field (tabindex=-1) [A1, BQA]`, where: window.__uiDescribe(eye), selector: window.__uiSelector(eye), human: window.__uiHuman(eye) });
    }
    return out;
});

/** A3 — sign-up has one consent checkbox that links Terms and Privacy. */
export const signupConsent = (page) => page.evaluate(() => {
    const form = Array.from(document.querySelectorAll("form")).find((f) => window.__uiVisible(f) && f.querySelector("input[type=email], input[name*=email i]")) || document.body;
    // Radix's Checkbox renders a hidden native "bubble" <input aria-hidden> next to its button[role=checkbox] for form
    // submission: one control, not two (parallel /register). A visually hidden native input behind a styled label is
    // still a checkbox of its own.
    const bubble = (b) => b.matches("input") && (b.getAttribute("aria-hidden") === "true" || !!b.closest("[aria-hidden=true]") || (b.tabIndex < 0 && !!b.parentElement?.querySelector("[role=checkbox]")));
    const boxes = Array.from(form.querySelectorAll('input[type=checkbox], [role=checkbox], button[role=checkbox]')).filter((b) => !bubble(b) && (window.__uiVisible(b) || window.__uiVisible(b.parentElement || b)));
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
/**
 * The e-mail and password to sign in with: LOGIN_EMAIL / LOGIN_PASSWORD, else the first role of babysitter.config.json
 * → roles whose env names resolve (5.2.0: Praxis and Parallel sign in per role — roles[].env { LOGIN_EMAIL:
 * "BUYER_EMAIL" } — so A4 "sign out works with one click" was skipped on both, every run). null when there are none.
 */
export function credentials(cfg = {}, env = process.env) {
    if (env.LOGIN_EMAIL && env.LOGIN_PASSWORD) return { email: env.LOGIN_EMAIL, password: env.LOGIN_PASSWORD, role: null };
    for (const r of cfg.roles || []) {
        const ref = (k) => r.env?.[k] ?? r[k];
        const val = (k) => { const x = ref(k); return x && /^[A-Z][A-Z0-9_]*$/.test(x) ? env[x] : undefined; };
        const email = val("LOGIN_EMAIL"), password = val("LOGIN_PASSWORD");
        if (email && password) return { email, password, role: r.name };
    }
    return null;
}

export async function login(page, cfg, base, creds = credentials(cfg)) {
    if (!cfg.login || !creds)
        return false;
    const url = new URL(cfg.login.url, base).href;
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => page.goto(url));
    await page.fill(cfg.login.emailSelector || 'input[type=email], input[name=email], input[name=username]', creds.email);
    await page.fill(cfg.login.passwordSelector || "input[type=password]", creds.password);
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
    // 5.5.0 (Compass, issue #5): the avatar menu (Radix DropdownMenu, aria-label="Account menu") came after the language
    // and currency switchers and past the first 4 triggers. Account-like triggers first (header, sidebar, nav), then
    // the rest, up to 8.
    const SCOPE = "header, nav, aside, [role=navigation], [role=banner]";
    const accountFirst = page.locator([":is(button, [role=button])[aria-label*=account i]", ":is(button, [role=button])[aria-label*=user i]", ":is(button, [role=button])[aria-label*=profile i]", ":is(button, [role=button])[aria-label*=avatar i]", "button:has(img[alt*=avatar i], [class*=avatar i])"].map((x) => `:is(${SCOPE}) ${x}`).join(", ")).filter({ visible: true });
    const rest = page.locator([`:is(${SCOPE}) button[aria-haspopup]`, `:is(${SCOPE}) [aria-expanded]`, "header button[aria-label*=menu i]"].join(", ")).filter({ visible: true });
    const triggers = [];
    for (const loc of [accountFirst, rest]) for (let i = 0; i < Math.min(await loc.count(), 8); i++) triggers.push(loc.nth(i));
    const tried = new Set();
    for (const t of triggers) {
        if (tried.size >= 8) break;
        const key = await t.evaluate((el) => { el.__bsTry ||= Math.random().toString(36).slice(2); return el.__bsTry; }, null, { timeout: 2000 }).catch(() => null);
        if (!key || tried.has(key)) continue;
        tried.add(key);
        await t.click({ timeout: 2000 }).catch(() => { });
        await page.waitForTimeout(400);
        if (await find().isVisible().catch(() => false)) {
            await find().click();
            return true;
        }
        await page.keyboard.press("Escape");
    }
    return false;
}

/**
 * A4 — Sign out works the first time (5.2.0; Parallel: "you stay signed in, only a second try signs you out" — the
 * sign-out sent the browser to the site's other address, where the old session was alive). From a signed-in page:
 * press Sign out (opening the account menu when needed), confirm once when the site asks ("Sign out?" dialog), then:
 * the browser stays on the same host, and `home` (the signed-in page) no longer opens signed in. A confirm dialog is
 * part of one sign-out; 5.1.0 never pressed it (and needed LOGIN_EMAIL, which role-based projects do not set).
 */
export async function signOutOnce(page, { home, afterSignOut = "/" }) {
    const out = [];
    const origin = new URL(page.url()).origin;
    if (!(await clickControl(page, SIGN_OUT_RE)))
        return [{ id: "A4", what: "no visible Sign out / Log out control (also looked inside header menus) [A4]", where: "header" }];
    await page.waitForTimeout(700);
    // the confirmation: a "Sign out?" dialog, or a sign-out page of its own (Parallel /logout: "Sign out? [Sign out]")
    const YES = /^\s*(sign ?out|log ?out|yes(,? sign ?out)?|confirm|выйти|да)\s*$/i;
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });
    let confirm = page.locator("[role=dialog], [role=alertdialog], dialog[open]").locator("button, a").filter({ hasText: YES }).filter({ visible: true }).first();
    if (!(await confirm.isVisible().catch(() => false)) && /\/(log-?out|sign-?out)\b/i.test(new URL(page.url()).pathname))
        confirm = page.locator("main button, main a, body > div button").filter({ hasText: YES }).filter({ visible: true }).first();
    let confirmed = false;
    if (await confirm.isVisible().catch(() => false)) { await confirm.click({ timeout: 3000 }).catch(() => { }); confirmed = true; }
    await page.waitForTimeout(2000);
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => { });
    const landed = new URL(page.url());
    // 5.5.0 (Compass 3v77n0): signing out lands on the home page (or its locale root), unless acceptance.afterSignOut says otherwise
    if (landed.origin === origin && afterSignOut) {
        const want = String(afterSignOut).replace(/\/+$/, "") || "/";
        const at = landed.pathname.replace(/\/+$/, "") || "/";
        const localeRoot = want === "/" && /^\/[a-z]{2}(-[A-Za-z]{2,4})?$/.test(at);
        if (at !== want && !localeRoot)
            out.push({ id: "A4", what: `Sign out lands on ${landed.pathname} — send people to ${want === "/" ? "the home page (/)" : want} (signOut({ callbackUrl: "${want}" }); acceptance.afterSignOut names another page when that is the owner's decision) [A4, BQA 11]`, where: landed.href });
    }
    if (landed.origin !== origin)
        out.push({ id: "A4", what: `Sign out sends the browser to another host (${landed.origin}) — stay on ${origin}: a session on the other address may still be alive (a redirect built from NEXTAUTH_URL / an absolute callbackUrl) [A4, BQA 11]`, where: landed.href });
    await page.goto(new URL(home, origin).href, { waitUntil: "load" }).catch(() => { });
    await page.waitForTimeout(900);
    const signedIn = new URL(page.url()).pathname === home && !(await page.locator("input[type=email], input[type=password]").first().isVisible().catch(() => false));
    if (signedIn)
        out.push({ id: "A4", what: `after one Sign out${confirmed ? " and its confirmation" : ""}, ${home} still opens signed in — it takes a second try. Sign out must end the session the first time (await signOut(), then navigate; one host) [A4, BQA 11]`, where: home });
    return out;
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


/* ─────────────── 5.5.0: money, footer, cookies, sign-out, signed-in areas ─────────────── */

/** The footer's "Manage cookies" / "Cookie settings" control opens a window with per-category switches: its label, else null. */
export async function openCookieSettingsFromFooter(page) {
    const ctl = page.locator("footer, [role=contentinfo]").locator("a, button").filter({ hasText: /manage cookies|cookie (settings|preferences|choices)/i }).filter({ visible: true }).first();
    if (!(await ctl.isVisible().catch(() => false))) return null;
    const label = ((await ctl.textContent().catch(() => "")) || "").trim();
    const href = await ctl.getAttribute("href").catch(() => null);
    if (href && !href.startsWith("#") && !/^javascript:/i.test(href)) return null; // a link to the policy page
    await ctl.click({ timeout: 2500 }).catch(() => { });
    await page.waitForTimeout(700);
    const toggles = await page.evaluate(() => Array.from(document.querySelectorAll("[role=dialog], [class*=cookie i], [id*=cookie i], [class*=consent i]")).filter((b) => window.__uiVisible(b))
        .some((b) => b.querySelectorAll("[role=switch], input[type=checkbox], [role=checkbox], button[aria-pressed]").length >= 1)).catch(() => false);
    await page.keyboard.press("Escape").catch(() => { });
    return toggles ? label : null;
}

/**
 * C2 — "Allow all" allows something (Compass faefuc: "We use no analytics, advertising or tracking cookies" with
 * "Essential only" / "Allow all"). An Allow all / Accept all on a banner that names no optional category (or says
 * there is none), after which nothing non-essential is stored and no tracker host is asked, offers a choice that
 * does not exist.
 */
export async function allowAllNothingOptional(page, { acc = DEFAULTS } = {}) {
    const btn = page.locator("button, a, [role=button]").filter({ hasText: /^\s*(allow|accept) all( cookies)?\s*$/i }).filter({ visible: true }).first();
    if (!(await btn.isVisible().catch(() => false))) return [];
    const label = ((await btn.textContent().catch(() => "")) || "").trim();
    const text = await btn.evaluate((b) => { const box = b.closest('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [role=dialog], [role=alertdialog], [role=region], [aria-label*=cookie i]') || b.parentElement?.parentElement || b.parentElement; return (box?.innerText || "").replace(/\s+/g, " "); }).catch(() => "");
    const denies = /\b(no|not|never|without|don't|do not)\b[^.]{0,40}\b(analytics|advertis\w*|tracking|marketing|third[- ]party)\b|\bonly (the )?(strictly )?(necessary|essential|needed)\b|\bonly use the cookies (needed|necessary)\b/i.test(text);
    const names = /\b(analytics|statistic\w*|marketing|advertis\w*|targeting|personali[sz]ation|preferences? cookies)\b/i.test(text.replace(/\b(no|not|never|without)\b[^.]{0,40}/gi, ""));
    if (names && !denies) return [];
    const hosts = acc.analyticsHosts || [];
    const tracked = [];
    const onReq = (req) => { try { const h = new URL(req.url()).hostname; if (hosts.some((x) => h === x || h.endsWith("." + x))) tracked.push(h); } catch { } };
    page.on("request", onReq);
    await btn.click({ timeout: 3000 }).catch(() => { });
    await page.waitForTimeout(1200);
    const extra = nonEssentialOf(await storageNow(page), acc);
    page.off("request", onReq);
    if (extra.length || tracked.length) return [];
    return [{ id: "C2", what: `"${label}" allows nothing: the banner names no optional cookies${denies ? " (it says there are none)" : ""} and nothing beyond the necessary is stored after it — offer one "OK" (and Manage), or name the optional cookies it turns on [C2, BQA 7]`, where: "cookie banner" }];
}

/** F0 parity: the footer's links as label → path (auth calls to action and the account's own links left out). */
export const footerLinks = (page) => page.evaluate(() => {
    const f = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter((x) => window.__uiVisible(x)).pop();
    if (!f) return null;
    const AUTH = /^(sign ?(in|up|out)|log ?(in|out)|register|create (an )?account|get started|join|dashboard|my account|account|profile|settings|войти|выйти)$/i;
    const out = [];
    for (const a of Array.from(f.querySelectorAll("a[href]"))) {
        if (!window.__uiVisible(a)) continue;
        const t = (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        if (!t || AUTH.test(t)) continue;
        let path = a.getAttribute("href") || "";
        try { const u = new URL(a.href); path = u.origin === location.origin ? u.pathname : u.href; } catch { }
        if (/^mailto:|^tel:/i.test(path)) continue;
        out.push({ label: t, path });
    }
    return out;
});
/** F0 — the footer is the same signed in and signed out (Praxis xp7pmu: Contact gone from the Company column when signed in). */
export function footerParity(anon, signed, role) {
    if (!anon || !signed) return [];
    const k = (x) => `${x.label.toLowerCase()}|${x.path}`;
    const a = new Set(anon.map(k)), b = new Set(signed.map(k));
    const out = [];
    const gone = anon.filter((x) => !b.has(k(x))), added = signed.filter((x) => !a.has(k(x)));
    if (gone.length) out.push({ id: "F0", what: `signed in${role ? ` as ${role}` : ""}, the footer loses ${gone.map((x) => `"${x.label}" (${x.path})`).join(", ")} — one footer for everyone [F0, BQA 6]`, where: "footer" });
    if (added.length) out.push({ id: "F0", what: `signed in${role ? ` as ${role}` : ""}, the footer gains ${added.map((x) => `"${x.label}" (${x.path})`).join(", ")} that a visitor does not see — one footer for everyone (account links belong in the header) [F0, BQA 6]`, where: "footer", soft: true });
    return out;
}

/** Visa / Mastercard marks of the footer: { src, alt } for each image (inline SVGs: { inline: true }). */
export const paymentMarks = (page) => page.evaluate(() => {
    const f = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter((x) => window.__uiVisible(x)).pop();
    if (!f) return [];
    return Array.from(f.querySelectorAll("img, svg")).filter((x) => window.__uiVisible(x) && /visa|master ?card/i.test([x.getAttribute("alt"), x.getAttribute("aria-label"), x.getAttribute("src"), x.querySelector?.("title")?.textContent].join(" ")))
        .map((x) => ({ src: x.tagName === "IMG" ? x.currentSrc || x.src : null, inline: x.tagName !== "IMG", name: /master/i.test([x.getAttribute("alt"), x.getAttribute("src"), x.getAttribute("aria-label")].join(" ")) ? "Mastercard" : "Visa", where: window.__uiDescribe(x), selector: window.__uiSelector(x) }));
});
/**
 * F5 — the studio's payment marks (Compass cnfovs: "the Visa and Mastercard logos are not the standard ones"). Each mark's
 * file (a Next.js /_next/image URL: its source) is hashed and compared with acceptance.paymentLogoSet.
 */
export async function paymentLogoFiles(page, acc = DEFAULTS) {
    const set = acc.paymentLogoSet;
    if (set === false || !Array.isArray(set) || !set.length) return [];
    const { createHash } = await import("node:crypto");
    const out = [];
    for (const m of await paymentMarks(page)) {
        if (m.inline) continue; // an inline SVG has no file to compare
        let src = m.src;
        try { const u = new URL(src); if (/\/_next\/image/.test(u.pathname) && u.searchParams.get("url")) src = new URL(u.searchParams.get("url"), u.origin).href; } catch { continue; }
        const res = await page.request.get(src).catch(() => null);
        if (!res || !res.ok()) continue;
        const hash = createHash("sha256").update(await res.body()).digest("hex");
        if (!set.includes(hash)) out.push({ id: "F5", what: `the ${m.name} mark (${new URL(src).pathname}) is not the studio's standard file — use the canonical ${m.name} image the other products ship [F5, BQA 6]`, where: m.where, selector: m.selector });
    }
    return out;
}

/** M2 — the signed-in header shows the credit balance (Compass gcrh4v): a number next to credits / cr in the site header. */
export const headerBalance = (page) => page.evaluate(() => {
    const hs = Array.from(document.querySelectorAll("header, [role=banner]")).filter((h) => window.__uiVisible(h) && !h.closest("main article, main section") && h.getBoundingClientRect().top < 200);
    if (!hs.length) return [];
    const RE = /\d[\d,.\u00a0\u202f ]*\s*(credits?|cr\b|кредит\p{L}*|kredit\p{L}*)|(credits?|balance|баланс|balans)\s*:?\s*\d/iu;
    const shows = hs.some((h) => RE.test(h.innerText || "") || Array.from(h.querySelectorAll("[aria-label], [title]")).some((x) => RE.test(x.getAttribute("aria-label") || x.getAttribute("title") || "")));
    return shows ? [] : [{ id: "M2", what: "the signed-in header does not show the credit balance — show it (e.g. \"6,000 credits\") on every signed-in page [M2, owner rule]", where: window.__uiDescribe(hs[0]), selector: window.__uiSelector(hs[0]) }];
});

/**
 * A10 — a signed-in area does not render to a visitor who may not see it (Kindred gm21xv: /admin showed users,
 * specialists and requests to anyone). The page as opened signed out (or as a role that is not admin): 200, not the
 * sign-in page, no password field, and real content (a heading and a table / 2+ stat tiles, 300+ characters outside
 * header and footer) is a finding.
 */
export const areaContent = (page) => page.evaluate(() => {
    const vis = (e) => window.__uiVisible(e);
    if (Array.from(document.querySelectorAll("input[type=password]")).some(vis)) return { content: false, why: "sign-in form" };
    const main = document.querySelector("main, [role=main]") || document.body;
    const text = Array.from(main.childNodes).map((n) => (n.nodeType === 1 && !n.matches("header, footer, nav, [role=banner], [role=contentinfo]") ? n.innerText || "" : n.nodeType === 3 ? n.nodeValue : "")).join(" ").replace(/\s+/g, " ").trim();
    const heading = Array.from(main.querySelectorAll("h1, h2")).some(vis);
    const table = Array.from(main.querySelectorAll("table, [role=table], [role=grid]")).some(vis);
    const stats = Array.from(main.querySelectorAll("div, li, dd, section")).filter((e) => vis(e) && e.children.length <= 4 && /^\D{0,30}\d[\d,.]*\D{0,30}$/.test((e.innerText || "").replace(/\s+/g, " ").trim()) && (e.innerText || "").length < 60).length;
    const loading = /^(loading|redirecting|please wait)/i.test(text) || text.length < 40;
    return { content: !loading && heading && (table || stats >= 2) && text.length > 300, chars: text.length, heading, table, stats };
});

/**
 * LS1 — the language switcher switches (Compass htmhfi: "choosing another language leaves the site in English").
 * From .babysitter/locales.json: a language the switcher offers, that did not switch when it was chosen there and
 * that does not open in its own language the recorded way either. Languages found only in hreflang / the repo stay notes.
 */
export function switcherLocales(loc) {
    const out = [];
    for (const l of loc?.locales || []) {
        if (l.default || !l.offered) continue;
        // what a person does: chooses it in the switcher. Nothing changed on the page → broken, whatever another way of
        // opening it (a /az URL that may be a 404) says. Without a click record: the recorded way did not switch.
        if (l.clicked ? l.clicked.switched : l.verified !== false) continue;
        out.push({ id: "LS1", what: `choosing "${l.code.toUpperCase()}" in the language switcher leaves the page in ${loc.default || "the default language"}${l.clicked ? ` (<html lang="${l.clicked.lang || ""}">, ${l.clicked.shared}% of the words unchanged)` : ""} — the switcher must change the language${l.clicked ? "" : ` (${l.why || "not verified"})`} [LS1, BQA 9]`, where: "language switcher" });
    }
    return out;
}

/** P2 parity: [{ path, h2, toc }] of every policy page → the pages with 3+ sections and no rail, when 2+ others have one. */
export function policyRailParity(pages) {
    const withRail = pages.filter((p) => p.toc);
    if (withRail.length < 2) return [];
    const missing = pages.filter((p) => !p.toc && p.h2 >= 3);
    if (!missing.length) return [];
    return [{ id: "P2", what: `${missing.map((p) => `${p.path} (${p.h2} sections)`).join(", ")} ${missing.length > 1 ? "have" : "has"} no "On this page" contents, while ${withRail.length} other policies do (${withRail.slice(0, 4).map((p) => p.path).join(", ")}) — one policy layout: give every policy with sections the same contents rail [P2, BQA 8]`, where: missing[0].path }];
}
