// Finds the languages a running site offers and how to switch each one on (prepare.mjs → .babysitter/locales.json).
// Sources, strongest first: <link rel=alternate hreflang> (gives each locale's URL), the language switcher (clicked,
// and the URL / cookie / localStorage change it makes is recorded), and the repo (lib/locales.js: codes, app/[locale],
// the storage key or cookie the code uses). Every locale is then opened the recorded way and verified: <html lang>
// says so, or the page text changed. Unverified locales are kept with verified:false and reported, never dropped.
import { dismissConsent } from "./consent.mjs";
import { LANGUAGE_NAMES, isLocaleCode, localize, baseLang } from "../lib/locales.js";
import { applyLocale } from "./project.js";

const quiet = async (page, cap = 6000) => { await page.waitForLoadState("networkidle", { timeout: cap }).catch(() => { }); await page.waitForTimeout(400); };

/** Language switcher items on the page: [{ code, i, visible }], each element stamped data-bs-lang=i. */
const switcherItems = (page) => page.evaluate((names) => {
    const byName = new Map();
    for (const [code, list] of Object.entries(names)) for (const n of list) byName.set(n.toLowerCase(), code);
    const codeOf = (el) => {
        const hl = el.getAttribute("hreflang") || (el.tagName === "OPTION" ? el.value : "") || "";
        if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(hl) && hl.split("-")[0].toLowerCase() in names) return hl;
        const parts = [el.getAttribute("lang"), (el.textContent || "").trim(), el.getAttribute("title"), el.getAttribute("aria-label"), el.getAttribute("data-locale"), el.getAttribute("data-lang"), el.getAttribute("value")].filter(Boolean).map((s) => s.trim());
        for (const p of parts) {
            const low = p.toLowerCase().replace(/[^\p{L}' -]/gu, "").trim();
            if (/^[a-z]{2}$/.test(low) && low in names) return low;
            if (byName.has(low)) return byName.get(low);
        }
        try {
            const u = new URL(el.href || "", location.href);
            const seg = u.pathname.split("/")[1] || "";
            if (el.href && u.origin === location.origin && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(seg) && seg.split("-")[0] in names && (el.textContent || "").trim().length <= 24) return seg;
            const q = u.searchParams.get("lang") || u.searchParams.get("locale") || u.searchParams.get("hl");
            if (q && q.split("-")[0].toLowerCase() in names) return q;
        } catch { }
        return null;
    };
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    document.querySelectorAll("[data-bs-lang]").forEach((e) => e.removeAttribute("data-bs-lang"));
    const out = [];
    let i = 0;
    for (const el of Array.from(document.querySelectorAll("a[href], button, [role=option], [role=menuitem], [role=menuitemradio], [role=radio], option, [data-locale], [data-lang]"))) {
        if (el.closest("main article, [role=article]")) continue; // a word in the copy is not a switcher
        const code = codeOf(el);
        if (!code) continue;
        el.setAttribute("data-bs-lang", String(i));
        out.push({ code, i: i++, visible: vis(el), tag: el.tagName.toLowerCase(), select: el.tagName === "OPTION" });
    }
    return out;
}, LANGUAGE_NAMES).catch(() => []);

/** Opens a closed language menu (the trigger shows the current language or says "language"). true when one opened. */
async function openSwitcher(page, current) {
    const names = [current, ...(LANGUAGE_NAMES[baseLang(current)] || [])].map((s) => String(s).toLowerCase());
    const found = await page.evaluate((names) => {
        const cand = Array.from(document.querySelectorAll("button, [role=button], [role=combobox], summary, [aria-haspopup]")).filter((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            const t = [(el.textContent || ""), el.getAttribute("aria-label") || "", el.getAttribute("title") || ""].join(" ").toLowerCase().replace(/\s+/g, " ").trim();
            return /language|lang\b|язык|dil\b|тіл|sprache|langue|idioma|globe/.test(t) || names.some((n) => t === n || t.split(" ").includes(n));
        });
        const el = cand[0];
        if (!el) return false;
        el.setAttribute("data-bs-lang-open", "");
        return true;
    }, names).catch(() => false);
    if (!found) return false;
    await page.locator("[data-bs-lang-open]").first().click({ timeout: 3000 }).catch(() => { });
    await page.waitForTimeout(500);
    return true;
}

const snapshot = async (page) => ({
    url: page.url(),
    cookies: await page.context().cookies().catch(() => []),
    storage: await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))).catch(() => ({})),
    lang: await page.evaluate(() => document.documentElement.lang || "").catch(() => ""),
    text: await page.evaluate(() => (document.body.innerText || "").slice(0, 4000)).catch(() => ""),
});
const words = (t) => new Set((t.toLowerCase().match(/\p{L}{3,}/gu) || []));
const similar = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 1; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(A.size, B.size); };

/** What switching to `code` with the switcher changed: { prefix?, query?, origin?, cookies?, storage? } or null. */
async function probeSwitcher(browser, base, code, current, ctxOpts) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    try {
        await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await quiet(page);
        await dismissConsent(page);
        const before = await snapshot(page);
        let items = await switcherItems(page);
        let item = items.find((x) => baseLang(x.code) === baseLang(code) && (x.visible || x.select));
        if (!item && (await openSwitcher(page, current))) {
            items = await switcherItems(page);
            item = items.find((x) => baseLang(x.code) === baseLang(code) && x.visible);
        }
        if (!item) return null;
        const loc = page.locator(`[data-bs-lang="${item.i}"]`).first();
        if (item.select) {
            const value = await loc.evaluate((o) => o.value).catch(() => null);
            await loc.evaluate((o) => o.parentElement.closest("select")?.setAttribute("data-bs-lang-sel", "")).catch(() => { });
            await page.locator("[data-bs-lang-sel]").first().selectOption(value, { timeout: 3000 }).catch(() => { });
        }
        else await loc.click({ timeout: 3000 }).catch(() => { });
        await page.waitForTimeout(800);
        await quiet(page);
        const after = await snapshot(page);
        const rec = {};
        const u0 = new URL(before.url), u1 = new URL(after.url);
        if (u1.origin !== u0.origin) rec.origin = u1.origin;
        const seg = u1.pathname.split("/")[1] || "";
        if (baseLang(seg) === baseLang(code) && isLocaleCode(seg)) rec.prefix = `/${seg}`;
        for (const k of ["lang", "locale", "hl", "lng", "language"]) if (u1.searchParams.get(k) && baseLang(u1.searchParams.get(k)) === baseLang(code)) rec.query = { [k]: u1.searchParams.get(k) };
        const cks = after.cookies.filter((c) => !before.cookies.some((b) => b.name === c.name && b.value === c.value) && (c.value.toLowerCase().includes(baseLang(code)) || /locale|lang/i.test(c.name)));
        if (cks.length) rec.cookies = cks.map((c) => ({ name: c.name, value: c.value }));
        const st = Object.entries(after.storage).filter(([k, v]) => before.storage[k] !== v && String(v).toLowerCase().includes(baseLang(code)));
        if (st.length) rec.storage = st.map(([key, value]) => ({ key, value }));
        rec.how = `language switcher: ${[rec.prefix && `URL ${rec.prefix}`, rec.query && `?${Object.keys(rec.query)[0]}=`, rec.origin && `domain ${rec.origin}`, rec.cookies && `cookie ${rec.cookies.map((c) => c.name).join(", ")}`, rec.storage && `localStorage ${rec.storage.map((s) => s.key).join(", ")}`].filter(Boolean).join(" + ") || "no visible change"}`;
        if (!rec.prefix && !rec.query && !rec.origin && !rec.cookies && !rec.storage) return { how: rec.how, inPage: true };
        return rec;
    }
    finally {
        await ctx.close();
    }
}

/** Opens `/` in locale `loc` and tells whether it is really that language: { verified, lang, why }. */
async function verify(browser, base, loc, def, defText, ctxOpts) {
    const ctx = await browser.newContext({ ...ctxOpts, locale: loc.code });
    const page = await ctx.newPage();
    try {
        await applyLocale(ctx, loc, base);
        const origin = loc.origin || base;
        await page.goto(new URL(localize("/", loc, def), origin).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await quiet(page);
        await page.waitForTimeout(600);
        const s = await snapshot(page);
        const sim = similar(s.text, defText);
        if (baseLang(s.lang) === baseLang(loc.code)) return { verified: true, lang: s.lang, why: `<html lang="${s.lang}">` };
        if (sim < 0.6) return { verified: true, lang: s.lang, why: `page text changed (${Math.round(sim * 100)}% words shared with the default)` };
        return { verified: false, lang: s.lang, why: `opened the recorded way, the page stayed in the default language (<html lang="${s.lang}">, ${Math.round(sim * 100)}% words shared)` };
    }
    catch (e) {
        return { verified: false, why: `could not open: ${String(e.message || e).split("\n")[0]}` };
    }
    finally {
        await ctx.close();
    }
}

/**
 * @param {import("@playwright/test").Browser} browser
 * @param {string} base
 * @param {{ repo?: ReturnType<typeof import("../lib/locales.js").repoLocales>, cfg?: any, log?: (m: string) => void, ctxOpts?: any }} o
 */
export async function detectLocales(browser, base, { repo = null, cfg = null, log = () => { }, ctxOpts = {} } = {}) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    let home;
    try {
        await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await quiet(page);
        await dismissConsent(page);
        home = await snapshot(page);
        home.hreflang = await page.$$eval("link[rel=alternate][hreflang]", (ls) => ls.map((l) => ({ code: l.getAttribute("hreflang"), href: l.href }))).catch(() => []);
        home.switcher = await switcherItems(page);
    }
    finally {
        await ctx.close();
    }
    const codes = new Set();
    const from = [];
    for (const h of home.hreflang) if (isLocaleCode(h.code)) codes.add(h.code);
    if (home.hreflang.length) from.push("hreflang");
    for (const s of home.switcher) codes.add(s.code);
    if (home.switcher.length) from.push("language switcher");
    for (const c0 of repo?.codes || []) codes.add(c0);
    if (repo?.codes?.length) from.push(...repo.from);
    for (const c0 of cfg?.list || []) codes.add(c0);
    // one entry per language: "en" and "en-US" from different sources are the same locale
    const uniq = [];
    for (const c0 of codes) if (!uniq.some((u) => baseLang(u) === baseLang(c0))) uniq.push(c0);
    const htmlLang = baseLang(home.lang);
    const def = cfg?.default || repo?.default || uniq.find((c0) => baseLang(c0) === htmlLang) || (uniq.includes("en") ? "en" : uniq[0]) || htmlLang || null;
    if (uniq.length < 2) return { default: def, locales: def ? [{ code: def, default: true }] : [], from, note: uniq.length ? "one language only" : "no languages found" };
    const defRec = { code: def, default: true };
    // the default locale's own URL prefix (always-prefixed sites: /en)
    const hrefDef = home.hreflang.find((h) => baseLang(h.code) === baseLang(def));
    if (hrefDef) { const seg = new URL(hrefDef.href).pathname.split("/")[1] || ""; if (baseLang(seg) === baseLang(def)) defRec.prefix = `/${seg}`; }
    const locales = [defRec];
    for (const code of uniq.filter((c0) => baseLang(c0) !== baseLang(def))) {
        let rec = null;
        const h = home.hreflang.find((x) => baseLang(x.code) === baseLang(code));
        if (h) {
            const u = new URL(h.href);
            rec = { how: `hreflang ${h.href}` };
            if (u.origin !== new URL(base).origin) rec.origin = u.origin;
            const seg = u.pathname.split("/")[1] || "";
            if (baseLang(seg) === baseLang(code)) rec.prefix = `/${seg}`;
            for (const k of ["lang", "locale", "hl", "lng"]) if (u.searchParams.get(k)) rec.query = { [k]: u.searchParams.get(k) };
        }
        if (!rec || (!rec.prefix && !rec.query && !rec.origin)) {
            const sw = await probeSwitcher(browser, base, code, def, ctxOpts).catch(() => null);
            if (sw && !sw.inPage) rec = { ...(rec || {}), ...sw };
            else if (sw?.inPage) rec = { ...(rec || {}), how: `${sw.how} — the language lives only in page state` };
        }
        if (!rec || (!rec.prefix && !rec.query && !rec.origin && !rec.cookies && !rec.storage)) {
            // the repo says how: app/[locale] → URL prefix; a storage key or a cookie the code reads
            const r = { how: `repo (${(repo?.from || []).join(", ") || "config"})` };
            if (repo?.prefix || cfg?.prefix) r.prefix = `/${code}`;
            if (repo?.storageKey || cfg?.storageKey) r.storage = [{ key: cfg?.storageKey || repo.storageKey, value: code }];
            if (repo?.cookie || cfg?.cookie) r.cookies = [{ name: cfg?.cookie || repo.cookie, value: code }];
            if (!r.prefix && !r.storage && !r.cookies) r.prefix = `/${code}`; // the usual next-intl layout; verified below
            rec = { ...r, how: rec?.how ? `${rec.how}; ${r.how}` : r.how };
        }
        const full = { code, ...rec };
        const v = await verify(browser, base, full, defRec, home.text, ctxOpts);
        locales.push({ ...full, ...v });
        log(`  locale ${code}: ${v.verified ? "✓" : "✗"} ${full.how} — ${v.why}`);
    }
    return { default: def, locales, from };
}
