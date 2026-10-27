// Layout, navigation and money checks — the recurring card patterns the per-element checks in ../checks.js missed
// (cross-project card study, 2026-10: nav/footer naming, logos that don't go home, invisible active items, headings
// styled per page, words broken mid-word, near-miss alignment, empty space, headers that scroll away, endless lists,
// default favicons, unsorted dropdowns, dead hover, two mobile menus, dirty converted prices).
// Plain JavaScript (bin/micro-check imports checks directly). Every function needs checks.install(page) first: it uses
// window.__uiDescribe / __uiSelector / __uiHuman / __uiVisible. Findings: { what, where, selector, human }; the caller
// decides hard vs soft from the list each function returns. Nothing is capped silently: what was not examined is
// returned in `notTested`.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { openMobileMenu, closeMobileMenu, settle } from "../checks.js";

/** In-page helpers shared by the checks below (idempotent; re-run after every navigation). */
const HELPERS = () => {
  const W = window;
  if (W.__ly) return;
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  const at = (el, what, extra = {}) => ({ what, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el), ...extra });
  // same-origin destination as "/path" (trailing slash dropped) + "#hash" when it has one; other origins as the full URL
  const dest = (a) => {
    try {
      const u = new URL(a.getAttribute("href"), location.href);
      if (!/^https?:$/.test(u.protocol)) return null;
      if (u.origin !== location.origin) return u.href;
      return (u.pathname.replace(/\/+$/, "") || "/") + (u.hash && u.hash !== "#" ? u.hash : "");
    } catch { return null; }
  };
  const localeRoot = (p) => p === "/" || /^\/[a-z]{2,3}([-_][A-Za-z]{2,4})?$/.test(p);
  const isHome = (a) => { const d = dest(a); return !!d && d.startsWith("/") && localeRoot(d.replace(/#.*$/, "") || "/"); };
  // label as a reader sees it: visible text, else aria-label / title / an image's alt
  const label = (a) => clean(a.innerText || a.textContent) || clean(a.getAttribute("aria-label")) || clean(a.getAttribute("title")) || clean(a.querySelector("img[alt]")?.getAttribute("alt"));
  const norm = (t) => clean(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const header = () => {
    // a page's own <header> (a title block inside main or a section: praxis /dashboard/wallet) is not the site header
    // when the site has one outside (or a pinned one: fixed / sticky)
    const pinned = (h) => /fixed|sticky/.test(getComputedStyle(h).position);
    const all = Array.from(document.querySelectorAll("header, [role=banner]")).filter((h) => !h.closest("footer, [role=contentinfo], article, main section"));
    const site = all.filter((h) => !h.parentElement?.closest("main, section, [role=main]") || pinned(h) || h.matches("[role=banner]"));
    const hs = site.length ? site : all;
    if (hs.length) return hs;
    const nav = document.querySelector("nav, [role=navigation]");
    return nav && !nav.closest("footer, [role=contentinfo]") ? [nav] : [];
  };
  const footer = () => Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter((f) => !f.closest("article, [role=dialog], dialog") || f.parentElement === document.body);
  // words of a text node with their line boxes (Range rects, never element height: padding fakes a wrap)
  const lineTops = (el) => {
    const tops = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!clean(n.nodeValue)) continue;
      const pe = n.parentElement; if (!pe || !W.__uiVisible(pe)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const tol = parseFloat(getComputedStyle(pe).fontSize) * 0.5;
      for (const rc of r.getClientRects()) if (rc.width > 0.5 && !tops.some((t) => Math.abs(t - rc.top) < tol)) tops.push(rc.top);
    }
    return tops.sort((a, b) => a - b);
  };
  const brand = () => {
    const og = document.querySelector('meta[property="og:site_name"], meta[name="application-name"]')?.getAttribute("content");
    const segs = [og, ...document.title.split(/\s+[|·—–-]\s+|\s*\|\s*/)].map(clean).filter((s) => s && s.length <= 30);
    const chromeLinks = [...header(), ...footer()].flatMap((r) => Array.from(r.querySelectorAll("a[href]")));
    const homeNames = chromeLinks.filter(isHome).map((a) => norm([a.textContent, a.getAttribute("aria-label"), a.querySelector("img[alt]")?.getAttribute("alt")].join(" ")));
    const linkNames = new Set(chromeLinks.filter((a) => !isHome(a)).map((a) => norm(label(a))));
    const hay = " " + norm(header().map((h) => h.textContent).join(" ") + " " + footer().map((f) => f.textContent).join(" ")) + " ";
    const has = (h, s) => norm(s) && (" " + h + " ").includes(" " + norm(s) + " ");
    if (og) return clean(og);
    // the title segment the home link carries, else one written in the chrome that is not a nav label ("Pricing | Acme")
    return segs.find((s) => homeNames.some((h) => has(h, s))) || segs.find((s) => !linkNames.has(norm(s)) && has(hay, s)) || "";
  };
  W.__ly = { clean, at, dest, localeRoot, isHome, label, norm, header, footer, lineTops, brand };
};
const ensure = (page) => page.evaluate(HELPERS);

/* ───────────────────────── 1. header ↔ footer parity (3.7, nav-mismatch) ───────────────────────── */
const AUTHY = /(^|\/)(log-?in|sign-?in|sign-?up|signin|signup|register|auth|logout|sign-?out|account|dashboard|profile|settings|cart|checkout|admin)(\/|$|\?|#)/i;
/**
 * Every route the header navigates to is in the footer under the same name. Same destination, different label → hard
 * ("Pricing" in the header, "Plans" in the footer); a header route missing from the footer → soft (the footer is the
 * site map). Logo, sign-in/up, account and cart links are not section navigation and are left out; so are CTAs, and
 * so is every link into a signed-in area the config declares (`appRoutes`: the path itself or anything under it).
 * Also returns the page's nav links and its h1/title for the site-wide name-vs-page comparison (navTitleMismatches).
 * @param {{ appRoutes?: string[] }} [opts]
 */
export async function navParity(page, { appRoutes: app = [] } = {}) {
  await ensure(page);
  return page.evaluate(({ authy, app }) => {
    const W = window, L = W.__ly;
    const AUTHY_RE = new RegExp(authy, "i");
    const inApp = (d) => { const p = d.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/"; return app.some((r) => p === r || p.startsWith(r + "/")); };
    const hard = [], soft = [];
    const H = L.header(), F = L.footer();
    const nav = (roots) => roots.flatMap((r) => Array.from(r.querySelectorAll("a[href]")))
      .filter((a) => { const d = L.dest(a); return d && d.startsWith("/") && !L.isHome(a) && !AUTHY_RE.test(d) && !inApp(d) && L.label(a) && !/^(mailto|tel):/.test(a.getAttribute("href") || ""); });
    const hl = nav(H).filter((a) => !(W.__uiVisible(a) && W.__uiButtonLike(a)) && !a.closest("[role=menu], [data-radix-popper-content-wrapper]"));
    const fl = nav(F);
    const byDest = new Map();
    for (const a of fl) { const d = L.dest(a); if (!byDest.has(d)) byDest.set(d, []); byDest.get(d).push(a); }
    const seen = new Set();
    if (F.length) for (const a of hl) {
      const d = L.dest(a); if (seen.has(d)) continue; seen.add(d);
      const name = L.label(a);
      const inFoot = byDest.get(d) || byDest.get(d.replace(/^\/#/, "#")) || [];
      if (!inFoot.length) { soft.push(L.at(a, `header link "${name}" (${d}) is not in the footer — the footer should list every section the header does [3.7]`)); continue; }
      if (!inFoot.some((f) => L.norm(L.label(f)) === L.norm(name)))
        hard.push(L.at(a, `the same page has two names: header "${name}", footer "${L.label(inFoot[0])}" (${d}) — use one label for one destination everywhere [3.7]`));
    }
    const links = [...hl.map((a) => ({ a, where: "header" })), ...fl.map((a) => ({ a, where: "footer" }))]
      .map(({ a, where }) => ({ dest: L.dest(a), label: L.label(a), area: where, selector: W.__uiSelector(a) }));
    const h1 = Array.from(document.querySelectorAll("h1")).find((h) => W.__uiVisible(h));
    return { hard, soft, links, h1: h1 ? L.clean(h1.innerText) : "", title: document.title, path: location.pathname.replace(/\/+$/, "") || "/" };
  }, { authy: AUTHY.source, app: app.map((r) => String(r).replace(/\[.*$/, "").replace(/\/+$/, "")).filter((r) => r.startsWith("/") && r !== "") });
}

/**
 * The signed-in areas a project declares (babysitter.config.json → authRoutes and every roles[].authRoutes): app
 * navigation, not site sections. Dynamic segments ("/workspace/[id]") count from their static part; "/" is never one.
 */
export const appRoutes = (cfg = {}) => [...new Set([...(cfg.authRoutes || []), ...(cfg.roles || []).flatMap((r) => r.authRoutes || [])]
  .map((r) => String(r).replace(/\[.*$/, "").replace(/\/+$/, "")).filter((r) => r.startsWith("/")))];

/** Legal documents: their name in the nav must be the document's own title, word for word. */
export const LEGAL = /privacy|terms|cookie|refund|return|shipping|delivery|\baml\b|\bkyc\b|licen[cs]e|disclaimer|acceptable|gdpr|\bdpa\b|imprint|impressum|agreement|conditions|legal|policy|eula|sla\b|withdrawal|complaints?/i;
const normN = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const STOP = new Set(["the", "a", "an", "and", "of", "our", "your", "for", "to", "us", "with", "in", "on", "page"]);
const words = (t) => normN(t).split(" ").filter((w) => w && !STOP.has(w));
/** Title segments ("Privacy Policy | Brand" → ["Privacy Policy", "Brand"]). */
const titleSegs = (t) => String(t || "").split(/\s+[|·—–-]\s+|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
/**
 * Site-wide: a nav label vs the page it opens. `pages`: navParity() results of every visited page.
 * Legal documents (by path or label): the label must equal the page's h1 or a title segment → hard ("Terms" in the
 * footer, "Terms of Service" on the page; "License" vs "Licence"). Other pages: soft when the label shares no word with
 * the h1 or the title (marketing h1s like "Simple pricing" under "Pricing" pass on the shared word or on the title).
 * In-text references to documents are the content checks' job, not this one.
 */
export function navTitleMismatches(pages) {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const hard = [], soft = [], seen = new Set();
  for (const p of pages)
    for (const l of p.links || []) {
      const path = l.dest.replace(/#.*$/, "") || "/";
      if (l.dest.includes("#")) continue; // an anchor names a section, not a page
      const target = byPath.get(path);
      const key = `${path}|${normN(l.label)}`;
      if (!target || seen.has(key)) continue;
      seen.add(key);
      const names = [target.h1, ...titleSegs(target.title)].filter(Boolean);
      if (!names.length) continue;
      const legal = LEGAL.test(path) || LEGAL.test(l.label);
      const where = `${l.area} link on ${p.path} → ${path}`;
      if (legal) {
        if (!names.some((n) => normN(n) === normN(l.label)))
          hard.push({ what: `legal document named "${l.label}" in the ${l.area}, but the page calls itself "${target.h1 || titleSegs(target.title)[0]}" — a document has one name in the nav, its title and its h1 [3.7 legal naming]`, where, selector: l.selector });
      } else {
        const lw = words(l.label);
        if (lw.length && !names.some((n) => { const nw = new Set(words(n)); return lw.some((w) => nw.has(w) || [...nw].some((x) => x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x)))); }))
          soft.push({ what: `nav label "${l.label}" opens a page titled "${target.h1 || target.title}" — the link and the page it opens should use the same name [3.7]`, where, selector: l.selector });
      }
    }
  return { hard, soft };
}

/* ───────────────────────── 2. logos link home (1.11, logo-link) ───────────────────────── */
const logoScan = (scope) => {
  const W = window, L = W.__ly;
  const root = scope ? document.querySelector(scope) : document;
  if (!root) return [];
  const out = [];
  const NOT_LOGO = /payment|visa|master ?card|paypal|stripe|apple ?pay|google ?pay|partner|client|customer|trusted|press|featured|integration|social|avatar|flag|sponsor|badge|award|logos\b|marquee/i;
  const attrs = (e) => [e.getAttribute("class"), e.id, e.getAttribute("alt"), e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("src"), e.getAttribute("data-testid")].filter((x) => typeof x === "string").join(" ");
  // 5.7.1: the site chrome — the site header (L.header(): not a page's own title <header> inside main), the footer, a
  // nav outside the content, dialogs and menu panels. A brand word inside a page heading ("BRAND · TERMS") and a
  // breadcrumb's first step are not the logo (a live run reported both as "header logo is not a link")
  const siteHeaders = L.header();
  const inContent = (e) => !!e.closest("main, article, section, [role=main]");
  const chrome = (e) => siteHeaders.some((h) => h.contains(e)) || !!e.closest("footer, [role=contentinfo], [role=dialog], dialog, [data-bs-menu-panel]") || (!!e.closest("nav, [role=navigation], aside") && !inContent(e));
  const crumb = (e) => !!e.closest('[aria-label*=breadcrumb i], [class*=breadcrumb i], [data-breadcrumb]') || (!!e.closest("nav, [role=navigation]") && inContent(e) && !siteHeaders.some((h) => h.contains(e)));
  const hasChrome = !!document.querySelector("header, [role=banner], nav, footer");
  const brand = L.norm(L.brand());
  const cands = new Set();
  const consider = (e) => {
    if (!W.__uiVisible(e)) return;
    if (NOT_LOGO.test(attrs(e)) || [...(function* () { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) yield p; })()].slice(0, 4).some((p) => NOT_LOGO.test(attrs(p)))) return;
    // in the site chrome; outside it only the mark at the top of a bare page (auth screens without a header)
    if (!scope && !chrome(e) && (hasChrome || e.getBoundingClientRect().top + scrollY > 260)) return;
    if (!scope && (crumb(e) || (hasChrome && e.closest("h1, h2, h3, h4, h5, h6") && !siteHeaders.some((h) => h.contains(e))))) return;
    if (e.closest("button, [role=button], label, select")) return;
    // a photo is not the mark: taller than 160 px, or cropped to fill its box (proxy: a card's cover picture, 5.3.0)
    if (e.getBoundingClientRect().height > 160 || (e.tagName === "IMG" && getComputedStyle(e).objectFit === "cover")) return;
    cands.add(e);
  };
  // marked as a logo
  for (const e of root.querySelectorAll('[class*=logo i], [id*=logo i], [alt*=logo i], [aria-label*=logo i], [data-logo], [class*=brand i], [src*=logo i], img[alt], svg[aria-label]')) {
    const a = attrs(e);
    // "brand" in a file path (/brand/r4/assistants.webp) names an asset folder, not the logo
    const own = [e.getAttribute("class"), e.id, e.getAttribute("alt"), e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("data-testid")].filter((x) => typeof x === "string").join(" ");
    if (/logo|wordmark/i.test(a) || /brand/i.test(own) || (brand && L.norm(e.getAttribute("alt") || e.getAttribute("aria-label") || "") === brand)) consider(e);
  }
  // the brand name written out (wordmark) in the chrome
  if (brand) for (const e of root.querySelectorAll("span, div, p, strong, b, a, h1, h2, h3, h4, h5, h6")) {
    if (e.children.length > 2 || L.norm(e.textContent) !== brand) continue;
    const cs = getComputedStyle(e);
    if (parseFloat(cs.fontWeight) >= 600 || parseFloat(cs.fontSize) >= 18 || e.closest("a[href]")) consider(e);
  }
  // the first picture in the header bar is the mark
  if (!scope) for (const h of L.header()) {
    const first = Array.from(h.querySelectorAll("img, svg")).find((m) => W.__uiVisible(m) && !(m.tagName === "svg" && m.parentElement?.closest("svg")) && m.getBoundingClientRect().width >= 16);
    if (first && first.getBoundingClientRect().left < innerWidth * 0.4) consider(first);
  }
  // nested candidates: judge the outermost (the wordmark text inside a logo div)
  const list = [...cands].filter((e) => ![...cands].some((o) => o !== e && o.contains(e) && !o.matches("header, footer, nav")));
  const seen = new Set();
  for (const e of list) {
    const a = e.closest("a[href]");
    const home = a && L.isHome(a);
    const key = (a ? "a" + W.__uiSelector(a) : "e" + W.__uiSelector(e));
    if (seen.has(key)) continue; seen.add(key);
    const area = e.closest("footer, [role=contentinfo]") ? "footer" : e.closest("[data-bs-menu-panel], [role=dialog], dialog") ? "mobile menu" : e.closest("header, [role=banner], nav") ? "header" : "page";
    if (!a) out.push({ ...L.at(e, `${area} logo is not a link — wrap it in <a href="/"> (the Logo component) so it takes the reader home [1.11]`), level: "hard" });
    else if (!home) {
      const d = L.dest(a) || a.getAttribute("href");
      out.push({ ...L.at(a, `${area} logo links to ${d}, not the home page "/" [1.11]`), level: "soft" });
    }
  }
  return out;
};
/**
 * Header, footer, auth-page and mobile-menu logos sit inside a link to "/" (or the locale root "/en"). A logo that is
 * not a link → hard; one that links elsewhere (an app logo to /dashboard) → soft. Opens the mobile menu on narrow
 * screens to judge the logo inside it.
 */
export async function logoHome(page) {
  await ensure(page);
  const all = await page.evaluate(logoScan, null);
  const m = await openMobileMenu(page).catch(() => null);
  if (m) {
    try {
      await ensure(page);
      for (const f of await page.evaluate(logoScan, "[data-bs-menu-panel]")) if (!all.some((x) => x.selector === f.selector)) all.push(f);
    } finally { await closeMobileMenu(page, m); }
  }
  return { hard: all.filter((f) => f.level === "hard").map(strip), soft: all.filter((f) => f.level === "soft").map(strip) };
}
const strip = ({ level, ...f }) => f;

/* ───────────────────────── 3. the current nav item looks current (3.5, active-nav) ───────────────────────── */
const activeScan = (scope) => {
  const W = window, L = W.__ly;
  const roots = scope ? [document.querySelector(scope)].filter(Boolean) : L.header();
  const out = [];
  const here = location.pathname.replace(/\/+$/, "") || "/";
  const props = ["color", "fontWeight", "textDecorationLine", "backgroundColor", "borderBottomWidth", "borderBottomColor", "borderTopWidth", "borderLeftWidth", "boxShadow", "opacity", "fontStyle"];
  const look = (el) => {
    const parts = [];
    const one = (e, pseudo) => {
      const cs = getComputedStyle(e, pseudo);
      if (pseudo && (cs.content === "none" || cs.content === "normal" || cs.display === "none")) return "-";
      const v = props.map((p) => (/Width$/.test(p) && parseFloat(cs[p]) === 0 ? "0" : cs[p]));
      // an underline in a transparent colour is no underline (sprout.boutique: every item has "underline" with
      // decoration-color transparent; only the current one paints it)
      const deco = cs.textDecorationLine !== "none" && W.__uiRGBA(cs.textDecorationColor)[3] > 0.05 ? `${cs.textDecorationLine} ${cs.textDecorationColor} ${cs.textDecorationThickness}` : "none";
      v[props.indexOf("textDecorationLine")] = deco;
      if (pseudo) v.push(cs.width, cs.height, cs.transform);
      // a border of width 0 has no colour worth comparing
      if (parseFloat(cs.borderBottomWidth) === 0) v[props.indexOf("borderBottomColor")] = "";
      return v.join("|");
    };
    parts.push(one(el), one(el, "::before"), one(el, "::after"));
    // the label inside (a span that takes the "active" colour), and an <li> that only wraps this link
    const inner = Array.from(el.querySelectorAll("span, p, div")).find((e) => L.clean(e.textContent) === L.clean(el.textContent) && L.clean(e.textContent));
    if (inner) parts.push(one(inner));
    // an indicator bar or dot drawn by a child element (an empty <span> under the label)
    for (const k of Array.from(el.querySelectorAll("*")).filter((e) => !L.clean(e.textContent) && !e.closest("svg")).slice(0, 6)) {
      const cs = getComputedStyle(k), r = k.getBoundingClientRect();
      parts.push([k.tagName, Math.round(r.width), Math.round(r.height), cs.backgroundColor, cs.opacity, cs.transform, cs.visibility, cs.display].join("|"));
    }
    const li = el.parentElement;
    if (li && li.matches("li") && li.querySelectorAll("a[href]").length === 1) parts.push(one(li), one(li, "::before"), one(li, "::after"));
    return parts.join("‖");
  };
  // a call to action drawn as a link: its emphasis is the same on every page, so it is not a stale active state
  const ACTION_ITEM = /^(sign ?in|log ?in|sign ?up|register|join|get started|start( now| here)?|post an? (brief|task|job|request)|open an? (case|request|task)|new (task|request|brief|case)|book( now| a \w+)?|hire( now| an? \w+)?|request( an? \w+)?|create( an? \w+)?|apply( now)?|become an? \w+|daxil ol|qeydiyyat|кіру|тіркелу|войти|регистрация)$/i;
  const ACTION_DEST = /^\/(log-?in|sign-?in|sign-?up|register|join|get-started|onboarding|new|request|post|create|book|apply|hire)(\/|\?|$)|\/new(\/|\?|$)/i;
  for (const root of roots) {
    const links = Array.from(root.querySelectorAll("a[href]")).filter((a) => {
      if (!W.__uiVisible(a) || !L.label(a)) return false;
      const d = L.dest(a); if (!d || !d.startsWith("/")) return false;
      // the logo (a mark, or a text wordmark like "V VERTEX ELITE"); a plain "Home" item stays
      if (L.isHome(a) && !L.dest(a).includes("#") && !/^(home|main|start|главная|ana səhifə|басты бет|inicio|accueil|startseite)$/i.test(L.label(a))) return false;
      if (W.__uiButtonLike(a) && !a.closest("nav, [role=navigation], ul")) return false; // a CTA beside the nav
      return !a.closest("[role=menu], [data-radix-popper-content-wrapper], footer");
    });
    // one group per list of siblings: the nearest nav/ul around the links
    const groups = new Map();
    for (const a of links) { const g = a.closest("ul, ol, nav, [role=navigation], [role=tablist]") || root; if (!root.contains(g) && g !== root) continue; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
    for (const [, g] of groups) {
      // CTAs inside the list (a filled "Sign up" pill) are a different component, not a sibling item
      const items = g.filter((a) => !W.__uiButtonLike(a) || g.filter((b) => W.__uiButtonLike(b)).length > g.length / 2);
      if (items.length < 3) continue;
      const path = (a) => { const d = L.dest(a); return d.includes("#") ? null : d; };
      const exact = items.filter((a) => path(a) === here || a.getAttribute("aria-current") === "page");
      // 5.5.0 (Kindred /admin drawer, issue #4 item 17): of the prefix matches only the longest is the current section —
      // on /admin/users/… "Members" (/admin/users) is current, not "Overview" (/admin)
      const prefixAll = exact.length ? [] : items.filter((a) => { const p = path(a); return p && p !== "/" && here.startsWith(p + "/"); });
      const longest = Math.max(0, ...prefixAll.map((a) => path(a).length));
      const prefix = prefixAll.filter((a) => path(a).length === longest);
      const cur = exact.length ? exact : prefix;
      const looks = new Map(items.map((a) => [a, look(a)]));
      const others = items.filter((a) => !cur.includes(a));
      const count = new Map(); for (const a of others) count.set(looks.get(a), (count.get(looks.get(a)) || 0) + 1);
      const base = [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      if (!base) continue;
      const where = scope ? "mobile menu" : "header nav";
      for (const a of cur) {
        if (looks.get(a) === base) out.push({ ...L.at(a, `${where}: the current page's item "${L.label(a)}" looks exactly like the other items — give it an active style (colour, weight, underline or background) as well as aria-current="page" [3.5]`), level: exact.includes(a) ? "hard" : "soft" });
      }
      const curLook = cur.length ? looks.get(cur[0]) : null;
      for (const a of others) {
        const l = looks.get(a);
        if (l === base) continue;
        if (curLook && l === curLook && curLook !== base) out.push({ ...L.at(a, `${where}: "${L.label(a)}" is highlighted like the current item "${L.label(cur[0])}" although it is not this page — only the current item should look active [3.5]`), level: "hard" });
        // an emphasised action item (sign in / sign up / "Post a brief" / "Open a case") looks different on every page by
        // design: it is a call to action drawn as a link, not an active state left on (Threshold, Kindred 2026-10)
        else if (!cur.length && count.get(l) === 1 && !ACTION_ITEM.test(L.label(a)) && !ACTION_DEST.test(L.dest(a))) out.push({ ...L.at(a, `${where}: "${L.label(a)}" looks highlighted (different from the other items) on a page it does not open — an item looks active only on its own page [3.5]`), level: "soft" });
      }
    }
  }
  return out;
};
/**
 * 3.5 — the current item is visibly different from its siblings (computed colour / weight / underline / background /
 * border / pseudo-element bar), in the desktop nav and in the open burger menu; and only the current item is.
 * aria-current alone is checked elsewhere (babysitter.spec 3.5): this is what the eye sees.
 */
export async function activeNavStyle(page) {
  await ensure(page);
  await page.mouse.move(0, 0).catch(() => {});
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const all = await page.evaluate(activeScan, null);
  const m = await openMobileMenu(page).catch(() => null);
  if (m) {
    try {
      await page.mouse.move(0, 0).catch(() => {});
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await settle(page);
      await ensure(page);
      all.push(...(await page.evaluate(activeScan, "[data-bs-menu-panel]")));
    } finally { await closeMobileMenu(page, m); }
  }
  return { hard: all.filter((f) => f.level === "hard").map(strip), soft: all.filter((f) => f.level === "soft").map(strip) };
}

/* ───────────────────────── 4. one heading style per level across pages (6.5, heading-style) ───────────────────────── */
/**
 * Computed look of every visible h1 and h2 in the page body (not header/footer/menus): `face` = font family, weight,
 * letter-spacing (em), case as rendered; `look` = face + size. Site-wide, headingVariants(list, tag, "face"|"look")
 * groups them; more than `max` per level and breakpoint means pages style their titles by hand.
 */
export async function collectHeadings(page, route = "") {
  await ensure(page);
  return page.evaluate((route) => {
    const W = window, L = W.__ly;
    return Array.from(document.querySelectorAll("h1, h2"))
      .filter((h) => W.__uiVisible(h) && L.clean(h.innerText) && !h.closest("header, [role=banner], footer, [role=contentinfo], nav, [role=dialog], dialog, aside, [role=menu]"))
      .map((h) => {
        const cs = getComputedStyle(h);
        const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
        const size = parseFloat(cs.fontSize);
        // letter-spacing relative to the size (-0.02em at 96px and at 48px is one style); case as rendered (all-caps
        // source text and text-transform:uppercase look the same — sprout.boutique, Bebas Neue)
        // to the half-hundredth: tracking-tight (-0.025em) must not round to -0.02 at one size and -0.03 at another
        const ls = cs.letterSpacing === "normal" ? 0 : Math.round((parseFloat(cs.letterSpacing) / size) * 200) / 200;
        const txt = L.clean(h.innerText);
        const caps = /\p{L}/u.test(txt) && txt === txt.toUpperCase() ? "caps" : cs.textTransform === "capitalize" ? "capitalize" : "";
        const face = `${fam} ${cs.fontWeight}${ls ? ` ls ${ls}em` : ""}${caps ? ` ${caps}` : ""}${cs.fontStyle !== "normal" ? ` ${cs.fontStyle}` : ""}`;
        const look = `${face.replace(/^(\S+(?: \S+)*?) (\d{3})/, `$1 ${Math.round(size)}px/$2`)}`;
        return { tag: h.tagName.toLowerCase(), look, face, route, text: txt.slice(0, 50), selector: W.__uiSelector(h) };
      });
  }, route);
}
/** Site-wide: the looks of one heading level, most common first, with the pages that use each. */
export function headingVariants(list, tag, by = "look") {
  const m = new Map();
  for (const h of list.filter((x) => x.tag === tag)) {
    const k = h[by];
    const e = m.get(k) || { look: k, count: 0, pages: [], example: `${h.route} "${h.text}"` };
    e.count++;
    if (!e.pages.includes(h.route)) e.pages.push(h.route);
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/* ───────────────────────── 5. words broken mid-word, numbers split, orphans (2.5, text-overflow) ───────────────────────── */
/**
 * Headings, buttons, button-like links, nav items, badges, labels and table headers, as rendered at this width:
 *   hard — a word broken mid-word (hyphens:auto, overflow-wrap:anywhere/break-word, word-break:break-all) — the break
 *          is found with per-character Range rects, so a break after a real hyphen ("sign-|in") is not reported;
 *        — a number or an amount split across lines ("1 000 | 000", "€ | 12");
 *   soft — an orphan: a multi-line heading whose last line is one short word.
 */
export async function textBreaks(page) {
  await ensure(page);
  return page.evaluate(() => {
    const W = window, L = W.__ly;
    const hard = [], soft = [];
    const CAND = "h1, h2, h3, h4, h5, h6, button, [role=button], label, th, [role=columnheader], header a, nav a, [role=tab], [class*=badge i], [class*=chip i], [class*=pill i], [class*=tag i]:not(body):not(html)";
    const badgeLike = (e) => { const cs = getComputedStyle(e); return /inline/.test(cs.display) && parseFloat(cs.borderRadius) > 0 && (W.__uiRGBA(cs.backgroundColor)[3] > 0.05 || parseFloat(cs.borderTopWidth) > 0) && L.clean(e.textContent).length <= 30; };
    const owner = (n) => {
      const pe = n.parentElement; if (!pe) return null;
      const c = pe.closest(CAND);
      if (c && !c.matches("body, html, main, section, article")) return c;
      for (let e = pe; e && e !== document.body; e = e.parentElement) { if (W.__uiButtonLike(e, true) || badgeLike(e)) return e; if (e.children.length > 3) break; }
      // 5.2.0: any short label (≤ 40 characters of its own) — a pagination caption "Səhifə 1 / 2" squeezed between
      // Previous and Next, a "ТАПСЫРМА" row label beside its value (Praxis at 360 in az / kk) are plain <span>s, and
      // the candidates above never looked at them. Only whole words of letters count there (see `plainWord`), so a
      // long e-mail, URL or code in a narrow column may still break where it must.
      if (L.clean(pe.textContent).length <= 40 && !pe.closest("p, li, td, blockquote, figcaption, [role=log]")) { plain.add(pe); return pe; }
      return null;
    };
    const plain = new Set();
    const plainWord = (word) => /^[\p{L}\p{M}]{2,24}$/u.test(word.replace(/[«»"'“”‘’()]/g, ""));
    const tops = (rects, tol) => { const t = []; for (const r of rects) if (r.width > 0.5 && !t.some((x) => Math.abs(x - r.top) < tol)) t.push(r.top); return t.sort((a, b) => a - b); };
    const rng = document.createRange();
    const seen = new Set();
    const words = new Map(); // owner → [{ text, top, right }]
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && n.parentElement.closest("script, style, noscript, template, svg") ? 2 : 1 });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue; if (!t || !t.trim()) continue;
      const el = owner(n); if (!el || !W.__uiVisible(el) || L.clean(el.textContent).length > 200) continue;
      const tol = parseFloat(getComputedStyle(n.parentElement).fontSize) * 0.5;
      // words: split on ASCII spaces only — a no-break space joins "10 000" and "€ 12" into one token on purpose
      const re = /[^ \t\n\r\f​]+/g;
      let m;
      while ((m = re.exec(t))) {
        const s = m.index, e = s + m[0].length;
        rng.setStart(n, s); rng.setEnd(n, e);
        const rs = Array.from(rng.getClientRects()), lt = tops(rs, tol);
        const list = words.get(el) || []; words.set(el, list);
        if (rs.length) { const last = rs[rs.length - 1]; list.push({ text: m[0], top: lt[lt.length - 1], left: rs[0].left, right: last.right }); }
        if (lt.length < 2) continue;
        // where does it break? the first character on the next line
        let cut = -1;
        for (let i = s + 1; i < e; i++) { rng.setStart(n, i); rng.setEnd(n, i + 1); const r = rng.getClientRects()[0]; if (r && Math.abs(r.top - lt[0]) >= tol) { cut = i; break; } }
        const before = cut > 0 ? t[cut - 1] : "";
        if (/[-‐‑–—/_.,:;)\]]/.test(before) && !/\d/.test(t[cut] || "")) continue; // a real break opportunity
        if (plain.has(el) && !plainWord(m[0])) continue; // a plain label: only a word of letters broken by letters
        const key = W.__uiSelector(el) + "|" + m[0]; if (seen.has(key)) continue; seen.add(key);
        const num = /\d/.test(m[0]) && /^[^\p{L}]*\d[\d\s.,  ]*[^\p{L}]*$|^\p{Sc}|\p{Sc}$/u.test(m[0]);
        const shown = cut > 0 ? `${t.slice(s, cut)}|${t.slice(cut, e)}` : m[0];
        hard.push(L.at(el, num
          ? `number split across lines: "${shown}" at ${innerWidth}px — keep it on one line (white-space:nowrap on the amount, or a no-break space between its groups) [2.5]`
          : `word broken mid-word: "${shown}" at ${innerWidth}px — a ${el.tagName.toLowerCase()} label must wrap between words: remove hyphens:auto / break-all / overflow-wrap:anywhere here, shorten the label or let the element grow [2.5]`));
      }
      // amounts written with an ordinary space ("1 000", "€ 12", "12 USD") split at that space
      const amt = /(\p{Sc}\s+\d[\d.,]*|\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d[\d.,]*\s+(?:\p{Sc}|USD|EUR|GBP|RUB|KZT|AZN|TRY|SAR|AED|UAH|PLN|CHF)\b)/gu;
      while ((m = amt.exec(t))) {
        rng.setStart(n, m.index); rng.setEnd(n, m.index + m[0].length);
        if (tops(Array.from(rng.getClientRects()), tol).length < 2) continue;
        const key = W.__uiSelector(el) + "|" + m[0]; if (seen.has(key)) continue; seen.add(key);
        hard.push(L.at(el, `number split across lines: "${m[0].replace(/\s+/, "|")}" at ${innerWidth}px — join the amount and its unit/groups with a no-break space (\\u00a0) or white-space:nowrap [2.5]`));
      }
    }
    // orphans: a heading of several lines whose last line is a single short word
    for (const [el, list] of words) {
      if (!/^H[1-4]$/.test(el.tagName) || list.length < 3) continue;
      // one run of inline text only: a number or badge laid out on its own line (block/flex children) is design
      if (!/^(block|inline|inline-block|list-item)$/.test(getComputedStyle(el).display) || Array.from(el.querySelectorAll("*")).some((c) => !/^inline/.test(getComputedStyle(c).display) && c.tagName !== "BR")) continue;
      const lines = [...new Set(list.map((x) => Math.round(x.top)))];
      if (lines.length < 2) continue;
      const lastTop = Math.max(...list.map((x) => x.top));
      const last = list.filter((x) => Math.abs(x.top - lastTop) < 2);
      if (last.length !== 1 || /[\s\u00a0]/.test(last[0].text)) continue; // two words joined by a no-break space are the fix
      const widths = lines.map((lt) => { const ws = list.filter((x) => Math.abs(Math.round(x.top) - lt) < 2); return Math.max(...ws.map((x) => x.right)) - Math.min(...ws.map((x) => x.left)); });
      const lastW = last[0].right - last[0].left;
      if (lastW > 0.4 * Math.max(...widths) || getComputedStyle(el).textWrap?.includes("balance")) continue;
      soft.push(L.at(el, `orphan: the heading's last line is the single word "${last[0].text}" at ${innerWidth}px — use text-wrap: balance (or pretty) on headings, or a no-break space before the last word [2.5]`));
    }
    return { hard, soft };
  });
}

/* ───────────────────────── 6. near-miss alignment: stacks, rows, forms, tables (2.4 / 2.12, alignment table-layout) ───────────────────────── */
/**
 * Small offsets read as sloppy, large ones as intent. Only 2–12 px differences are reported:
 *   soft — siblings stacked in one column whose visible left edges (text, media, controls, painted boxes) differ;
 *          columns side by side whose first lines (same font size) start at different heights;
 *          form fields of one column whose left edges differ, and a label that does not line up with its field;
 *   hard — a table column whose header is aligned differently from its values (left header over centred or
 *          right-aligned values, or offset from them), at every width. HTML tables and role=table/grid.
 * Centred blocks, overlays (fixed/sticky), the header bar and things narrower than 40 px are left out.
 */
export async function alignment(page) {
  await ensure(page);
  return page.evaluate(() => {
    const W = window, L = W.__ly;
    const hard = [], soft = [];
    const MIN = 2, MAX = 12;
    const near = (d) => d >= MIN && d <= MAX;
    const flow = (e) => { const cs = getComputedStyle(e); return cs.position !== "absolute" && cs.position !== "fixed" && cs.float === "none" && cs.display !== "contents"; };
    const painted = (e) => { const cs = getComputedStyle(e); return W.__uiRGBA(cs.backgroundColor)[3] > 0.1 || ["Top", "Left"].every((s) => parseFloat(cs["border" + s + "Width"]) > 0 && W.__uiRGBA(cs["border" + s + "Color"])[3] > 0.1) || (cs.boxShadow && cs.boxShadow !== "none") || /url\(|gradient/.test(cs.backgroundImage); };
    // the visible extent of an element's content: text line boxes, media, controls and painted boxes inside it
    const ink = (el) => {
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity, firstTop = null, firstSize = null;
      const add = (rc) => { if (rc.width < 0.5 || rc.height < 0.5) return; l = Math.min(l, rc.left); r = Math.max(r, rc.right); t = Math.min(t, rc.top); b = Math.max(b, rc.bottom); };
      const rng = document.createRange();
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && n.parentElement.closest("script, style, noscript, template") ? 2 : 1 });
      let count = 0;
      for (let n = tw.nextNode(); n; n = tw.nextNode(), count++) {
        if (count > 400) return null; // too big to measure here; its parts are compared at their own level
        if (!n.nodeValue.trim() || !W.__uiPainted(n.parentElement) || !flowAll(n.parentElement, el)) continue;
        rng.selectNodeContents(n);
        const rs = Array.from(rng.getClientRects());
        for (const rc of rs) add(rc);
        if (firstTop === null && rs[0]) { firstTop = rs[0].top; firstSize = parseFloat(getComputedStyle(n.parentElement).fontSize); }
      }
      const kids = el.querySelectorAll("img, svg, video, canvas, input, select, textarea, button, [role=button], *");
      if (kids.length > 600) return null;
      // a ::before marker (a dot, a bar, an icon font) starts where its element's box starts (praxis /login: an orange
      // dot before "EMAIL" sits on the field's edge; the text is 12 px in by design)
      const marker = (e) => { const b = getComputedStyle(e, "::before"); return b.content !== "none" && b.content !== "normal" && b.display !== "none" && (b.content !== '""' || parseFloat(b.width) > 0 || W.__uiRGBA(b.backgroundColor)[3] > 0.1); };
      for (const e of [el, ...kids]) if (marker(e) && W.__uiPainted(e) && flowAll(e, el)) { const b = e.getBoundingClientRect(), cs = getComputedStyle(e); add({ left: b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), right: b.left + parseFloat(cs.paddingLeft) + 1, top: b.top, bottom: b.bottom, width: 1, height: b.height }); }
      for (const e of kids) {
        if (e.closest("svg") && e.tagName !== "svg") continue;
        const media = /^(IMG|SVG|VIDEO|CANVAS|INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(e.tagName) || e.matches("[role=button]");
        if ((media || painted(e)) && W.__uiPainted(e) && flowAll(e, el)) add(e.getBoundingClientRect());
      }
      if (painted(el)) add(el.getBoundingClientRect());
      return l === Infinity ? null : { l, r, t, b, firstTop, firstSize };
    };
    // nothing between `e` and `root` is taken out of the flow (a decorative absolute badge is not the column's edge)
    const flowAll = (e, root) => { for (let x = e; x && x !== root; x = x.parentElement) if (!flow(x)) return false; return true; };
    const skip = (e) => !!e.closest("header, [role=banner], nav, [role=dialog], dialog, [role=menu], [role=listbox], table, [role=table], [role=grid], svg") || W.__uiOverlay(e);
    const seen = new Set();
    const parents = Array.from(document.body.querySelectorAll("*")).filter((p) => p.children.length >= 2 && p.getBoundingClientRect().width >= 200 && W.__uiVisible(p) && !skip(p));
    for (const p of parents) {
      const pr = p.getBoundingClientRect(), pcs = getComputedStyle(p);
      const kids = Array.from(p.children).filter((c) => W.__uiVisible(c) && flow(c) && c.getBoundingClientRect().width >= 40 && c.getBoundingClientRect().height >= 12 && !/^(BR|HR|SCRIPT|STYLE)$/.test(c.tagName));
      if (kids.length < 2) continue;
      const rects = kids.map((c) => c.getBoundingClientRect());
      const stacked = rects.every((r, i) => i === 0 || r.top >= rects[i - 1].bottom - 1);
      const row = rects.every((r, i) => i === 0 || (r.left >= rects[i - 1].right - 1 && r.top < rects[i - 1].bottom && r.bottom > rects[i - 1].top));
      if (stacked) {
        const cl = pr.left + parseFloat(pcs.paddingLeft) + parseFloat(pcs.borderLeftWidth), cr = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
        const items = [];
        for (const c of kids) {
          if (/^(LABEL|INPUT|SELECT|TEXTAREA)$/.test(c.tagName)) continue; // fields and labels: the form check below
          if (/center|right|end/.test(getComputedStyle(c).textAlign) && !painted(c)) continue;
          // a table's edge is its box (cell padding is part of its design, not a stray offset)
          const k = c.tagName === "TABLE" ? (() => { const b = c.getBoundingClientRect(); return { l: b.left, r: b.right }; })() : ink(c); if (!k) continue;
          if (k.l < 0) continue; // bleeding off the screen (a tilted strip, a carousel): not an edge in this column
          const gl = k.l - cl, gr = cr - k.r;
          if (gl > 8 && Math.abs(gl - gr) <= 3) continue; // centred
          items.push({ c, x: k.l });
        }
        if (items.length < 2) continue;
        const counts = new Map(); for (const it of items) { const x = Math.round(it.x); counts.set(x, (counts.get(x) || 0) + 1); }
        const [mode, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
        if (n < 2) continue; // no shared edge to measure against
        for (const it of items) {
          const d = Math.abs(it.x - mode);
          if (!near(d)) continue;
          const key = W.__uiSelector(it.c); if (seen.has(key)) continue; seen.add(key);
          soft.push(L.at(it.c, `starts ${Math.round(it.x - mode) > 0 ? Math.round(it.x - mode) + " px right" : Math.round(mode - it.x) + " px left"} of the ${n} siblings above/below it (x=${Math.round(it.x)} vs ${mode}) — a near-miss edge; use the same container padding / no extra margin so the column has one left edge [2.7]`));
        }
      } else if (row && kids.length >= 2 && rects.every((r) => r.height >= 40)) {
        const ai = pcs.alignItems;
        if (/center|end|baseline/.test(ai) && !/stretch/.test(ai)) continue;
        if (/center|end/.test(pcs.alignContent) && pcs.display.includes("flex") && pcs.flexWrap === "nowrap" && /center|end/.test(ai)) continue;
        const ks = kids.map((c) => ({ c, k: ink(c) })).filter((x) => x.k && x.k.firstTop !== null && !/center|end/.test(getComputedStyle(x.c).alignSelf));
        const bySize = new Map();
        for (const x of ks) { const s = Math.round(x.k.firstSize); if (!bySize.has(s)) bySize.set(s, []); bySize.get(s).push(x); }
        for (const [, g] of bySize) {
          if (g.length < 2) continue;
          const tops = g.map((x) => x.k.firstTop);
          const min = Math.min(...tops);
          for (const x of g) {
            const d = x.k.firstTop - min;
            if (!near(d)) continue;
            const key = "row" + W.__uiSelector(x.c); if (seen.has(key)) continue; seen.add(key);
            soft.push(L.at(x.c, `first line starts ${Math.round(d)} px lower than in the column next to it — side-by-side columns should start on one line (same top padding/margins, align-items:start) [2.7]`));
          }
        }
      }
    }
    // forms: fields of one column share a left edge; a label lines up with its field
    for (const f of document.querySelectorAll("form")) {
      if (!W.__uiVisible(f) || W.__uiOverlay(f) && !f.closest("[role=dialog], dialog")) continue;
      const fields = Array.from(f.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea, [role=combobox]")).filter((e) => W.__uiVisible(e) && e.getBoundingClientRect().width >= 80);
      const rs = fields.map((e) => e.getBoundingClientRect());
      // one column: fields that do not share a row with another field
      const solo = fields.filter((e, i) => !rs.some((r, j) => j !== i && r.top < rs[i].bottom - 4 && r.bottom > rs[i].top + 4));
      if (solo.length >= 2) {
        const xs = solo.map((e) => e.getBoundingClientRect().left);
        const counts = new Map(); for (const x of xs) counts.set(Math.round(x), (counts.get(Math.round(x)) || 0) + 1);
        const [mode] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        solo.forEach((e, i) => { if (near(Math.abs(xs[i] - mode))) soft.push(L.at(e, `form field is ${Math.round(Math.abs(xs[i] - mode))} px off the left edge of the other fields in this form [2.7]`)); });
      }
      for (const e of fields) {
        const lab = (e.id && f.querySelector(`label[for="${CSS.escape(e.id)}"]`)) || e.closest("label");
        if (!lab || lab.contains(e) && lab.querySelector("input[type=checkbox], input[type=radio]") || !W.__uiVisible(lab) || getComputedStyle(lab).position === "absolute") continue;
        if (lab.contains(e)) continue;
        const lr = lab.getBoundingClientRect(), er = e.getBoundingClientRect();
        if (lr.bottom > er.top + 2 || er.top - lr.bottom > 40) continue; // only a label sitting above its field
        const k = ink(lab); if (!k) continue;
        if (/center/.test(getComputedStyle(lab).textAlign)) continue;
        const d = Math.abs(k.l - er.left);
        if (near(d)) soft.push(L.at(lab, `label starts ${Math.round(d)} px off its field's left edge — a label above a field lines up with it [2.7]`));
      }
    }
    // tables: each column's header aligned like its values
    const tables = [
      ...Array.from(document.querySelectorAll("table")).map((t) => ({ t, rows: Array.from(t.rows).map((r) => Array.from(r.cells)) })),
      ...Array.from(document.querySelectorAll("[role=table], [role=grid]")).filter((t) => t.tagName !== "TABLE").map((t) => ({ t, rows: Array.from(t.querySelectorAll("[role=row]")).map((r) => Array.from(r.querySelectorAll("[role=columnheader], [role=cell], [role=gridcell], [role=rowheader]")).filter((c) => c.closest("[role=row]") === r)) })),
    ];
    for (const { t, rows } of tables) {
      if (!W.__uiVisible(t)) continue;
      const hi = rows.findIndex((r) => r.length && r.every((c) => c.matches("th, [role=columnheader]")));
      if (hi < 0) continue;
      const head = rows[hi];
      // a header row hidden for the eye and kept for screen readers (the sr-only pattern of a table that turns into
      // labelled cards on phones) has no position to align: nothing to compare (Threshold / Compass at 390, 2026-10)
      const hidden = (c) => { for (let e = c; e && e !== t; e = e.parentElement) { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width <= 2 || r.height <= 2 || cs.visibility === "hidden" || /rect\(0|inset\(50%/.test(cs.clip + " " + cs.clipPath)) return true; } return false; };
      if (head.every(hidden)) continue;
      const body = rows.slice(hi + 1).filter((r) => r.length === head.length && r.every((c) => !(c.colSpan > 1)) && r.some((c) => c.matches("td, [role=cell], [role=gridcell], [role=rowheader], th")));
      if (body.length < 2 || head.some((c) => c.colSpan > 1)) continue;
      const box = (c) => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return { l: r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), r: r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) }; };
      head.forEach((h, j) => {
        if (!W.__uiVisible(h)) return;
        const hk = ink(h); if (!hk || !L.clean(h.textContent)) return;
        const cells = body.map((r) => r[j]).filter((c) => W.__uiVisible(c)).map((c) => ({ c, k: ink(c), b: box(c) })).filter((x) => x.k);
        if (cells.length < 2) return;
        const spread = (f) => { const v = cells.map(f); return Math.max(...v) - Math.min(...v); };
        const med = (f) => { const v = cells.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
        const modes = { left: (x) => x.k.l, right: (x) => x.k.r, centre: (x) => (x.k.l + x.k.r) / 2 };
        const hv = { left: hk.l, right: hk.r, centre: (hk.l + hk.r) / 2 };
        const consistent = Object.keys(modes).filter((m) => spread(modes[m]) <= 2);
        if (!consistent.length) return; // ragged values: no edge to align a header to
        if (consistent.some((m) => Math.abs(hv[m] - med(modes[m])) <= 3)) return;
        const hb = box(h);
        const hmode = Math.abs(hk.l - hb.l) <= 2 ? "left" : Math.abs(hk.r - hb.r) <= 2 ? "right" : "centred";
        const m = consistent.includes("right") && !consistent.includes("left") ? "right" : consistent.includes("centre") && !consistent.includes("left") ? "centre" : consistent[0];
        const off = Math.round(Math.abs(hv[m] - med(modes[m])));
        hard.push(L.at(h, `table column "${L.clean(h.textContent).slice(0, 30)}": the header is ${hmode} but its values line up on the ${m === "centre" ? "centre" : m + " edge"} (${off} px apart) — align header and cells the same way (text columns left, numbers/money right) [2.4]`));
      });
    }
    return { hard, soft };
  });
}

/* ───────────────────────── 7. excess empty space (2.7, empty-space) ───────────────────────── */
/**
 * Soft, with a crop for the eye. The page's sections (main's children, or the first level that has several) are
 * measured by their content (text, media, controls, painted boxes inside them — not the section's own fill):
 *   — the empty band between two consecutive sections' content is > `ratio` (2.5) × the page's median band and > 160 px;
 *   — a section taller than the viewport with an empty band inside it > 60% of the viewport (a hero that is mostly
 *     air). Sections carried by a picture (background image, image/video/canvas over half their area) are skipped.
 * Returns { soft, crops: [{ x, y, width, height }] } in page coordinates (for page.screenshot({ clip, fullPage })).
 */
export async function emptySpace(page, ratio = 2.5) {
  await ensure(page);
  return page.evaluate((ratio) => {
    const W = window, L = W.__ly;
    const soft = [], crops = [];
    const root = document.querySelector("main") || document.body;
    const visibleKids = (e) => Array.from(e.children).filter((c) => (W.__uiVisible(c) || (c.closest('[aria-hidden="true"]') && W.__uiPainted(c))) && !/^(SCRIPT|STYLE|HEADER|FOOTER|NAV)$/.test(c.tagName) && !c.matches("[role=banner], [role=contentinfo]") && !W.__uiOverlay(c) && c.getBoundingClientRect().height > 0);
    let box = root, secs = visibleKids(root);
    for (let d = 0; secs.length < 2 && d < 5 && secs.length; d++) { box = secs[0]; secs = visibleKids(box); }
    if (secs.length < 2) return { soft, crops };
    const pictured = (s) => {
      const r = s.getBoundingClientRect(); const area = r.width * r.height || 1;
      if (/url\(/.test(getComputedStyle(s).backgroundImage)) return true;
      let media = 0;
      for (const m of s.querySelectorAll("img, video, canvas, picture, iframe, svg, [style*=background-image]")) {
        if (m.tagName === "svg" && m.parentElement?.closest("svg")) continue;
        const b = m.getBoundingClientRect();
        const w = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)), h = Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
        media = Math.max(media, w * h);
      }
      return media / area > 0.5;
    };
    // painted counts, whatever the accessibility tree says: a decorative marquee band (aria-hidden outlined text between
    // sections, parallel /) is on screen and is not empty space
    const shown = (e) => W.__uiVisible(e) || (!!e.closest('[aria-hidden="true"]') && W.__uiPainted(e) && e.getBoundingClientRect().width > 1 && e.getBoundingClientRect().height > 1);
    // vertical intervals (page coordinates) holding content inside a section
    const bands = (s) => {
      if (pictured(s)) { const r = s.getBoundingClientRect(); return [[r.top + scrollY, r.bottom + scrollY]]; } // a picture fills it
      const iv = [];
      const add = (rc) => { if (rc.width >= 1 && rc.height >= 1) iv.push([rc.top + scrollY, rc.bottom + scrollY]); };
      const rng = document.createRange();
      const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.nodeValue.trim() || !n.parentElement || !shown(n.parentElement)) continue; rng.selectNodeContents(n); for (const rc of rng.getClientRects()) add(rc); }
      for (const e of s.querySelectorAll("*")) {
        if (e.closest("svg") && e.tagName !== "svg") continue;
        if (!shown(e)) continue;
        const cs = getComputedStyle(e);
        const media = /^(IMG|SVG|VIDEO|CANVAS|INPUT|SELECT|TEXTAREA|BUTTON|IFRAME|PICTURE)$/i.test(e.tagName);
        const paint = W.__uiRGBA(cs.backgroundColor)[3] > 0.1 || /url\(|gradient/.test(cs.backgroundImage) || ["Top", "Bottom"].some((x) => parseFloat(cs["border" + x + "Width"]) > 0 && W.__uiRGBA(cs["border" + x + "Color"])[3] > 0.1);
        // a painted box counts unless it is a full-section backdrop
        if (media || (paint && e.getBoundingClientRect().height < s.getBoundingClientRect().height * 0.8)) add(e.getBoundingClientRect());
      }
      iv.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const v of iv) { const last = merged[merged.length - 1]; if (last && v[0] <= last[1] + 1) last[1] = Math.max(last[1], v[1]); else merged.push([...v]); }
      return merged;
    };
    const info = secs.map((s) => { const r = s.getBoundingClientRect(); return { s, top: r.top + scrollY, bottom: r.bottom + scrollY, b: bands(s) }; }).filter((x) => x.b.length);
    // tall, mostly empty sections first: the air inside them is reported once, not again as a gap after them
    const airy = [];
    for (const x of info) {
      const h = x.bottom - x.top;
      if (h <= innerHeight || pictured(x.s)) continue;
      // 5.5.0 (Kindred legal pages, issue #4 item 15): a column whose content is a sticky contents list keeps the
      // height of the article beside it — the band is where the sticky nav travels, empty by design
      if (Array.from(x.s.querySelectorAll("*")).some((e) => getComputedStyle(e).position === "sticky" && e.getBoundingClientRect().height < h * 0.8)) continue;
      const edges = [x.top, ...x.b.flat(), x.bottom];
      let worst = 0, at = x.top;
      for (let i = 0; i < edges.length; i += 2) { const band = edges[i + 1] - edges[i]; if (band > worst) { worst = band; at = edges[i]; } }
      if (worst > innerHeight * 0.6) {
        airy.push([at, at + worst]);
        soft.push(L.at(x.s, `a ${Math.round(h)} px tall section is mostly empty: a ${Math.round(worst)} px band with nothing in it (the screen is ${innerHeight} px) — drop the min-h-screen / fixed height or fill the band [2.7]`));
        crops.push({ x: 0, y: Math.max(0, at - 40), width: innerWidth, height: Math.min(worst + 80, 2000) });
      }
    }
    const gaps = [];
    for (let i = 1; i < info.length; i++) gaps.push({ i, gap: info[i].b[0][0] - info[i - 1].b[info[i - 1].b.length - 1][1] });
    const pos = gaps.map((g) => g.gap).filter((g) => g > 0).sort((a, b) => a - b);
    const median = pos.length ? pos[Math.floor(pos.length / 2)] : 0;
    if (pos.length >= 2) for (const g of gaps) {
      if (g.gap > 160 && g.gap > ratio * median) {
        const a = info[g.i - 1], b = info[g.i];
        const y = a.b[a.b.length - 1][1];
        if (airy.some(([p, q]) => Math.min(q, y + g.gap) - Math.max(p, y) > g.gap / 2)) continue;
        soft.push(L.at(b.s, `${Math.round(g.gap)} px of empty space above this section (the page's usual gap between sections is ${Math.round(median)} px) — trim the section padding/min-height so the page keeps one rhythm [2.7]`));
        crops.push({ x: 0, y: Math.max(0, y - 40), width: innerWidth, height: Math.min(g.gap + 80, 2000) });
      }
    }
    return { soft, crops };
  }, ratio);
}

/* ───────────────────────── 8. the header stays on screen (3.6, sticky-header) ───────────────────────── */
/**
 * After scrolling 1000 px (or to the end of a shorter page that still scrolls ≥ 400 px), a header bar — the page's
 * own header, or any fixed/sticky bar at the very top holding links or a menu button — is on screen at the top.
 * Hide-on-scroll-down headers fail here by design of the rule. Returns { applicable, ok, what, where }.
 */
export async function stickyHeader(page, distance = 1000) {
  await ensure(page);
  const pre = await page.evaluate(() => {
    const W = window, L = W.__ly;
    // the header bar may sit under a promo/marquee strip (sprout.boutique: a 36 px ticker above the nav)
    const h = L.header().find((e) => W.__uiVisible(e) && e.getBoundingClientRect().top <= 120 && e.getBoundingClientRect().height <= 220);
    if (!h) return null;
    // an auth page's minimal header (FM8: the logo and "Back to home", no navigation) has nothing to keep in reach
    // (deskhand / proxy /signin, /signup, /forgot-password — 5.3.0)
    const home = (a) => { try { return new URL(a.href, location.href).pathname === "/"; } catch { return false; } };
    const nav = [...h.querySelectorAll("a[href], button, [role=button]")].filter((e) => W.__uiVisible(e) && !(e.tagName === "A" && (home(e) || W.__uiBackLink(e))));
    if (!nav.length) return { minimal: true };
    h.setAttribute("data-bs-head", "");
    return { where: W.__uiDescribe(h), selector: W.__uiSelector(h), human: W.__uiHuman(h), room: document.documentElement.scrollHeight - innerHeight };
  });
  if (!pre || pre.minimal) return { applicable: false, minimal: !!pre?.minimal };
  if (pre.room < 400) return { applicable: false };
  const y = Math.min(distance, pre.room);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.mouse.wheel(0, 1).catch(() => {}); // a wheel event for headers that listen for it
  await page.waitForTimeout(700);
  await settle(page, 1200);
  const r = await page.evaluate(() => {
    const W = window;
    const h = document.querySelector("[data-bs-head]");
    const atTop = (e) => { const b = e.getBoundingClientRect(); return W.__uiVisible(e) && b.top <= 2 && b.bottom >= 24 && b.height <= 240; };
    if (h && atTop(h)) return true;
    // another bar took its place (a compact sticky header): fixed/sticky at the top, with links or a menu button
    for (const x of [innerWidth * 0.1, innerWidth / 2, innerWidth * 0.9]) {
      for (let e = document.elementFromPoint(x, 6); e && e !== document.body; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if ((p === "fixed" || p === "sticky") && atTop(e) && e.querySelector("a[href], button")) return true;
      }
    }
    return false;
  });
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: "instant" }); document.querySelector("[data-bs-head]")?.removeAttribute("data-bs-head"); });
  return { applicable: true, ok: r, scrolled: y, what: r ? "" : `the header scrolls away: after scrolling ${y} px no header bar is on screen — make it sticky (sticky top-0 / fixed with a --header-h offset) so navigation stays reachable [3.6]`, where: pre.where, selector: pre.selector, human: pre.human };
}

/* ───────────────────────── 9. long lists come with pagination (4.3, pagination) ───────────────────────── */
/**
 * Soft. A list (ul/ol/tbody/role=list/role=rowgroup, or a grid/flex container of same-shaped children) with more than
 * `max` (20) visible items and no pagination, "load more"/"show more", next-page link or virtualization near it.
 * Left out: nav/header/footer/menus/selects, prose lists (bullets of plain text), marquees and carousels, logo walls, and
 * choice sets (checkbox/radio/switch/pressed chips, or any items of a fieldset or [role=group] holding one).
 */
export async function longLists(page, max = 20) {
  await ensure(page);
  return page.evaluate((max) => {
    const W = window, L = W.__ly;
    const soft = [];
    const shape = (e) => e.tagName + "." + (typeof e.className === "string" ? e.className.split(/\s+/).filter((c) => !/active|selected|current|open|hover|first|last|odd|even/.test(c)).sort().join(".") : "");
    const moving = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.animationName !== "none" && cs.animationIterationCount === "infinite") return true; if (/(auto|scroll|hidden)/.test(cs.overflowX) && x.scrollWidth > x.clientWidth * 1.3) return true; } return false; };
    const prose = (items) => items.every((li) => Array.from(li.querySelectorAll("*")).every((c) => /^(A|STRONG|EM|B|I|CODE|SPAN|BR|SUP|SUB|SMALL|MARK|U|ABBR)$/.test(c.tagName)));
    const virtual = (e) => { for (let x = e, d = 0; x && x !== document.body && d < 4; x = x.parentElement, d++) { const cs = getComputedStyle(x); if (/(auto|scroll)/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 4 && x.clientHeight < innerHeight * 1.2) return true; if (x.matches("[data-virtuoso-scroller], [data-test-id=virtuoso-scroller], .ReactVirtualized__Grid, [style*='will-change: transform']")) return true; } return !!e.querySelector(":scope > [data-index], :scope > [aria-rowindex]"); };
    const PAGER = /^(load|show|view|see) more\b|^more$|^next( page)?\b|^older\b|^previous\b|^[‹›«»←→]$|^page \d|показать (ещё|больше)|^далее$|^ещё$|^daha çox|^növbəti|^келесі|^тағы/i;
    const pager = (scope) => !!scope.querySelector("nav[aria-label*=pagina i], [class*=paginat i], [aria-label*=pagination i], [aria-label*='next page' i], [aria-label*='previous page' i], a[rel=next], [data-pagination]")
      || Array.from(scope.querySelectorAll("a, button")).some((b) => W.__uiVisible(b) && PAGER.test(L.clean(b.innerText || b.getAttribute("aria-label"))))
      || Array.from(scope.querySelectorAll("button, a")).filter((b) => /^\d{1,3}$/.test(L.clean(b.innerText))).length >= 3;
    // a set of choices (language chips, toggles) is part of a form, not a feed: each item is a choice control or a
    // chip that wraps exactly one (no link, heading, image or other control of its own); inside a fieldset or a
    // [role=group|radiogroup] every item holding a choice control is enough
    const CHOICE = "input[type=checkbox], input[type=radio], [role=checkbox], [role=radio], [role=switch], [aria-pressed]";
    const chip = (k) => k.matches(CHOICE) || (k.querySelectorAll(CHOICE).length === 1 && !k.querySelector("a[href], h1, h2, h3, h4, h5, h6, img, video, select, textarea, input:not([type=checkbox]):not([type=radio]), button:not([aria-pressed]):not([role=checkbox]):not([role=radio]):not([role=switch])"));
    const choiceSet = (c, items) => items.every(chip) || (!!c.closest("fieldset, [role=group], [role=radiogroup]") && items.every((k) => k.matches(CHOICE) || !!k.querySelector(CHOICE)));
    const cands = new Set([...document.querySelectorAll("ul, ol, tbody, [role=list], [role=rowgroup], [role=grid]")]);
    for (const e of document.querySelectorAll("main div, main section")) { const d = getComputedStyle(e).display; if (/grid|flex/.test(d) && e.children.length > max) cands.add(e); }
    const seen = new Set();
    for (const c of cands) {
      if (!W.__uiVisible(c) || c.closest("nav, header, footer, [role=navigation], [role=banner], [role=contentinfo], [role=menu], [role=listbox], select, [role=dialog], dialog, aside")) continue;
      const kids = Array.from(c.children).filter((k) => W.__uiVisible(k));
      if (kids.length <= max) continue;
      const counts = new Map(); for (const k of kids) counts.set(shape(k), (counts.get(shape(k)) || 0) + 1);
      const n = Math.max(...counts.values());
      if (n <= max) continue;
      const items = kids.filter((k) => counts.get(shape(k)) === n);
      if (/^(UL|OL)$/.test(c.tagName) && prose(items)) continue;
      if (moving(c) || items.every((k) => W.__uiMediaTile(k))) continue;
      if (choiceSet(c, items)) continue;
      if (virtual(c)) continue;
      if ([...seen].some((s) => s.contains(c) || c.contains(s))) continue;
      seen.add(c);
      const scope = c.closest("section, main, article") || document.body;
      if (pager(scope) || pager(c.parentElement || c)) continue;
      soft.push(L.at(c, `a list of ${n} items with no pagination, "Load more" or virtualization — show 10–20 and page the rest [4.3]`));
    }
    return { soft };
  }, max);
}

/* ───────────────────────── 10. favicon: present, served, not a default, not another product's (6.11) ───────────────────────── */
/** sha256 of starter-template favicons (create-next-app 12–15 and 16/canary, create-react-app, create-vite, Astro, Nuxt). */
export const DEFAULT_FAVICONS = {
  "2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932": "the create-next-app default (Next.js / Vercel triangle)",
  "c28fdd2a4f31e2dc64f653962286da5c82a4cdfc518b242d32812c624e9a19a4": "the create-next-app default (Next.js 16)",
  "3d10f7da6c603178340081668c4ac5b3ae9743ca9a262ab0fcd312fbb9f48bdd": "the create-react-app default (React logo)",
  "4a748afd443918bb16591c834c401dae33e87861ab5dbad0811c3a3b4a9214fb": "the Vite default (vite.svg)",
  "2d7a310283d6f9cc753210d83224cd6db6348cb82a5536348884e5831d46203f": "the Astro default",
  "1057b17aec08a7191d134000203947f195a8aa7c84c39f1164cee8d01279762a": "the Nuxt default",
};
const COMMON = new Set(["www", "app", "apps", "web", "site", "dev", "prod", "staging", "vercel", "netlify", "localhost", "local", "next", "frontend", "client"]);
const ids = (e) => {
  const host = (() => { try { return new URL(e.origin).hostname; } catch { return ""; } })();
  return new Set([...String(e.product || "").toLowerCase().split(/[^a-z0-9]+/), ...host.split(".")[0].toLowerCase().split(/[^a-z0-9]+/)].filter((t) => t.length >= 4 && !COMMON.has(t)));
};
/** One product seen under two names (package "vertex" locally, host "vertex.boutique" live) is still one product. */
export const sameProduct = (a, b) => a.product === b.product || a.origin === b.origin || [...ids(a)].some((t) => ids(b).has(t));
export const FAVICON_REGISTRY = process.env.BABYSITTER_FAVICON_REGISTRY || resolve(homedir(), ".babysitter", "favicons.json");
/**
 * Hard: no favicon at all (none declared and /favicon.ico missing), a declared icon that is not served (non-200 or
 * not an image), a framework starter icon, or the same icon file as a different product (the registry, one JSON file
 * per machine: sha256 → products). Soft: no apple-touch-icon (an iOS home-screen bookmark shows a screenshot).
 * `product` names this product in the registry (config name / package name / host); `register` records this one.
 */
export async function favicon(page, { product = "", registry = FAVICON_REGISTRY, register = true } = {}) {
  const hard = [], soft = [];
  const decl = await page.evaluate(() => Array.from(document.querySelectorAll("link[rel~=icon], link[rel='shortcut icon'], link[rel~=apple-touch-icon], link[rel=mask-icon]"))
    .map((l) => ({ rel: l.getAttribute("rel"), href: l.href, sizes: l.getAttribute("sizes") || "", type: l.getAttribute("type") || "" })));
  const origin = new URL(page.url()).origin;
  const name = product || new URL(page.url()).host;
  const icons = decl.filter((d) => /icon/.test(d.rel) && !/apple|mask/.test(d.rel));
  const list = icons.length ? icons : [{ rel: "icon", href: origin + "/favicon.ico", implicit: true }];
  const seen = [];
  for (const d of list) {
    if (/^data:/.test(d.href)) { seen.push({ ...d, sha: createHash("sha256").update(d.href).digest("hex") }); continue; }
    let res = null;
    try { const r = await page.request.get(d.href, { timeout: 15_000, failOnStatusCode: false }); res = { status: r.status(), type: r.headers()["content-type"] || "", body: await r.body() }; } catch { /* not reachable from here: ask the page */ }
    if (!res) res = await page.evaluate(async (u) => { try { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); let s = ""; for (const x of b) s += String.fromCharCode(x); return { status: r.status, type: r.headers.get("content-type") || "", b64: btoa(s) }; } catch { return null; } }, d.href).then((x) => x && { status: x.status, type: x.type, body: Buffer.from(x.b64, "base64") });
    const status = res ? res.status : 0;
    const type = res ? res.type : "";
    if (!res || status !== 200) {
      hard.push({ what: d.implicit ? `no favicon: the page declares none and ${d.href} answers ${status || "nothing"} — add app/icon.png (or favicon.ico) with the product's mark [6.11]` : `the declared favicon ${d.href} answers ${status || "nothing"} — the browser tab shows a blank icon [6.11]`, where: "<head> link rel=icon" });
      continue;
    }
    const body = res.body;
    if (!/image|icon|svg|octet-stream/.test(type) && !/^\s*<svg/.test(body.slice(0, 200).toString())) { hard.push({ what: `the favicon ${d.href} is served as "${type}", not an image [6.11]`, where: "<head> link rel=icon" }); continue; }
    seen.push({ ...d, sha: createHash("sha256").update(body).digest("hex") });
  }
  for (const s of seen) if (DEFAULT_FAVICONS[s.sha]) hard.push({ what: `the favicon ${s.href} is ${DEFAULT_FAVICONS[s.sha]} — replace it with the product's own mark [6.11]`, where: "<head> link rel=icon" });
  if (!decl.some((d) => /apple-touch-icon/.test(d.rel))) {
    let ok = false;
    try { ok = (await page.request.get(origin + "/apple-touch-icon.png", { timeout: 10_000, failOnStatusCode: false })).status() === 200; } catch { ok = await page.evaluate((u) => fetch(u).then((r) => r.ok, () => false), origin + "/apple-touch-icon.png"); }
    if (!ok) soft.push({ what: "no apple-touch-icon — a home-screen bookmark on iOS shows a page screenshot instead of the mark (add app/apple-icon.png, 180×180) [6.11]", where: "<head>" });
  }
  // the registry: one icon, one product
  if (registry && seen.length) {
    let db = {};
    try { if (existsSync(registry)) db = JSON.parse(readFileSync(registry, "utf8")); } catch { db = {}; }
    for (const s of seen) {
      if (DEFAULT_FAVICONS[s.sha]) continue;
      const others = (db[s.sha] || []).filter((e) => !sameProduct(e, { product: name, origin }));
      if (others.length) hard.push({ what: `the favicon ${s.href} is the same file as ${others.map((o) => `${o.product} (${o.origin})`).join(", ")} — each product needs its own mark [6.11]`, where: "<head> link rel=icon" });
      if (register && !(db[s.sha] || []).some((e) => e.product === name)) (db[s.sha] = db[s.sha] || []).push({ product: name, origin, seen: new Date().toISOString().slice(0, 10) });
    }
    if (register) { try { mkdirSync(dirname(registry), { recursive: true }); writeFileSync(registry, JSON.stringify(db, null, 1)); } catch { /* read-only home: the check still ran */ } }
  }
  return { hard, soft, info: seen.map((s) => `${s.href} ${s.sha.slice(0, 12)}`) };
}

/* ───────────────────────── 11. dropdowns: sorted, selected marked and visible, tick on one side (1.2, dropdown-ui) ───────────────────────── */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SIZES = ["xxxs", "xxs", "xs", "s", "m", "l", "xl", "xxl", "2xl", "xxxl", "3xl", "4xl", "5xl"];
const PLACEHOLDER = /^(all|any|none|select|choose|pick|default|—|-|tous|toutes|tout|aucun|aucune|choisir|sélectionner|все|любой|любая|не выбран|выберите|hamısı|барлығы)(?![\p{L}\d])/iu;
const LAST = /^(other|others|другое|прочее|digər|басқа)\b/i;
/* relative periods ("Today", "Last 7 days", "This month", "12 derniers mois", "За 30 дней"): their length in hours */
const PERIOD_UNIT = [
  [/^(hours?|h|heures?|час|часа|часов)$/u, 1],
  [/^(days?|d|jours?|день|дня|дней|сутки|суток)$/u, 24],
  [/^(weeks?|semaines?|неделя|недели|недель|неделю)$/u, 24 * 7],
  [/^(months?|mois|месяц|месяца|месяцев)$/u, 24 * 30],
  [/^(quarters?|trimestres?|квартал|квартала|кварталов)$/u, 24 * 91],
  [/^(years?|ans?|années?|год|года|лет)$/u, 24 * 365],
];
const PERIOD_DAY = /^(today|yesterday|aujourd'hui|aujourd’hui|hier|сегодня|вчера)$/u;
const PERIOD_FILLER = /^(last|past|previous|this|the|current|in|within|ce|cet|cette|ces|le|la|les|l'|l’|dernier|dernière|derniers|dernières|passé|passée|passés|passées|en|cours|depuis|за|последний|последняя|последние|последних|прошлый|прошлая|прошлые|этот|эта|это|эти|текущий|текущая|-ci|ci)$/u;
const unitHours = (w) => { for (const [re, h] of PERIOD_UNIT) if (re.test(w)) return h; return null; };
/** A relative period's length in hours, or null when the label is not one. */
export function periodHours(label) {
  const t = String(label).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  if (PERIOD_DAY.test(t)) return 24;
  const words = t.replace(/-ci\b/g, " ci").split(/[\s,.:()]+/).filter(Boolean);
  let n = null, unit = null;
  for (const w of words) {
    if (/^\d+(?:[.,]\d+)?$/.test(w)) { if (n !== null) return null; n = parseFloat(w.replace(",", ".")); continue; }
    const m = w.match(/^(\d+)([a-zа-я]+)$/u);
    if (m && unitHours(m[2])) { if (n !== null || unit !== null) return null; n = Number(m[1]); unit = unitHours(m[2]); continue; }
    const u = unitHours(w);
    if (u !== null) { if (unit !== null) return null; unit = u; continue; }
    if (PERIOD_FILLER.test(w)) continue;
    return null;
  }
  return unit === null ? null : (n ?? 1) * unit;
}

/**
 * Is a list of option labels in an order a reader can follow? Alphabetical (either way, locale-aware, numbers inside
 * compared as numbers), numeric by the first number, sizes, months, weekdays or dates — up or down. A placeholder first
 * ("All", "Select…") and "Other" last are allowed. Returns null when sorted, else the kind of order it nearly has.
 */
export function orderOf(labels, lang = null) {
  let xs = labels.map((x) => String(x).replace(/\s+/g, " ").trim()).filter(Boolean);
  while (xs.length && PLACEHOLDER.test(xs[0])) xs = xs.slice(1);
  while (xs.length && LAST.test(xs[xs.length - 1])) xs = xs.slice(0, -1);
  if (xs.length < 3) return null;
  // a few favourites pinned on top ("EUR, USD", then the rest A–Z) is an order too
  for (let k = 1; k <= 3 && xs.length - k >= 4; k++) if (orderOf(xs.slice(k), lang) === null) return null;
  const mono = (v) => v.every((x, i) => i === 0 || x >= v[i - 1]) || v.every((x, i) => i === 0 || x <= v[i - 1]);
  const keyed = (f) => { const v = xs.map(f); return v.every((x) => x !== null && x !== undefined && !Number.isNaN(x)) ? mono(v) : false; };
  // in the page's language: Azerbaijani sorts "Ç" after "C" and "Ş" after "S", Kazakh its own Cyrillic letters
  let coll;
  try { coll = new Intl.Collator(lang || undefined, { sensitivity: "base", numeric: true }); } catch { coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true }); }
  const alpha = xs.every((x, i) => i === 0 || coll.compare(xs[i - 1], x) <= 0) || xs.every((x, i) => i === 0 || coll.compare(xs[i - 1], x) >= 0);
  if (alpha) return null;
  const num = (x) => { const m = x.replace(/(\d)[\s,](?=\d{3}\b)/g, "$1").match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; };
  if (keyed(num)) return null;
  const idx = (list) => (x) => { const w = x.toLowerCase().replace(/[^\p{L}\d]/gu, ""); const i = list.findIndex((m) => w.startsWith(m)); return i < 0 ? null : i; };
  if (keyed(idx(MONTHS)) || keyed(idx(MONTHS_RU)) || keyed(idx(DAYS))) return null;
  if (keyed((x) => { const i = SIZES.indexOf(x.toLowerCase().split(/[\s(/]/)[0]); return i < 0 ? null : i; })) return null;
  if (keyed((x) => { const t = Date.parse(x); return Number.isNaN(t) ? null : t; })) return null;
  if (keyed(periodHours)) return null;
  return "neither alphabetical nor a natural order (numbers, sizes, months, dates)";
}
const SORT_SELECT = /sort|order by|ordering|сортир|упорядоч|sırala|сұрыпта/i;
/**
 * Native selects (read) and custom listboxes (opened one at a time, at most `max`; the rest listed in notTested):
 *   soft — options not in an order a reader can follow (orderOf); "Sort by" lists are left out;
 *   hard — the selected option is not marked (looks like the others: no tick, colour, weight or background) or is
 *          scrolled out of sight when the list opens.
 * `marks`: the side (left/right) of the selected option's tick in every open listbox, for the site-wide comparison.
 */
export async function dropdowns(page, max = 8) {
  await ensure(page);
  const hard = [], soft = [], marks = [], notTested = [];
  const natives = await page.evaluate((src) => {
    const W = window, L = W.__ly, SORTRE = new RegExp(src, "i");
    return Array.from(document.querySelectorAll("select")).filter((s) => s.options.length >= 3).map((s) => {
      const lab = [s.getAttribute("aria-label"), s.name, s.id, s.labels && s.labels[0] && s.labels[0].textContent].join(" ");
      return { sort: SORTRE.test(lab), lang: (s.closest("[lang]") || document.documentElement).getAttribute("lang") || "", labels: Array.from(s.options).filter((o) => !o.disabled || o.index > 0).map((o) => o.text), ...L.at(s, "") };
    });
  }, SORT_SELECT.source);
  for (const n of natives) { if (n.sort) continue; const o = orderOf(n.labels, n.lang); if (o) soft.push({ what: `dropdown options are ${o}: ${n.labels.slice(0, 6).join(", ")}${n.labels.length > 6 ? ", …" : ""} — sort them (alphabetically, or by their natural order) [1.2]`, where: n.where, selector: n.selector, human: n.human }); }
  const triggers = await page.evaluate(() => {
    const W = window;
    for (const e of document.querySelectorAll("[data-bs-dd]")) e.removeAttribute("data-bs-dd");
    const t = Array.from(document.querySelectorAll("[role=combobox], [aria-haspopup=listbox], button[aria-haspopup=true][aria-controls]")).filter((e) => W.__uiVisible(e) && e.tagName !== "SELECT" && e.tagName !== "INPUT" && !e.closest("[aria-hidden=true]"));
    t.forEach((e, i) => e.setAttribute("data-bs-dd", String(i)));
    return t.map((e) => window.__uiDescribe(e));
  });
  for (let i = 0; i < triggers.length; i++) {
    if (i >= max) { notTested.push(`${triggers.length - max} more dropdown(s) not opened (cap ${max}): ${triggers.slice(max, max + 4).join("; ")}`); break; }
    const t = page.locator(`[data-bs-dd="${i}"]`).first();
    const url = page.url();
    try { await t.scrollIntoViewIfNeeded({ timeout: 2000 }); await t.click({ timeout: 2500 }); } catch { notTested.push(`${triggers[i]}: could not be opened`); continue; }
    await page.waitForTimeout(250); await settle(page, 1200);
    if (page.url() !== url) { await page.goBack().catch(() => {}); notTested.push(`${triggers[i]}: navigated away`); break; }
    await ensure(page);
    const r = await page.evaluate(({ i, src }) => {
      const W = window, L = W.__ly, SORTRE = new RegExp(src, "i");
      const trig = document.querySelector(`[data-bs-dd="${i}"]`);
      const ctl = trig && (trig.getAttribute("aria-controls") || "").split(/\s+/)[0];
      let box = (ctl && document.getElementById(ctl)) || null;
      if (!box || !W.__uiVisible(box)) box = Array.from(document.querySelectorAll("[role=listbox]")).find((b) => W.__uiVisible(b));
      if (!box) return null;
      const opts = Array.from(box.querySelectorAll("[role=option]")).filter((o) => o.getBoundingClientRect().height > 0);
      if (opts.length < 2) return null;
      const label = [trig.getAttribute("aria-label"), trig.textContent, trig.id, trig.getAttribute("name"), (trig.closest("label, [role=group]") || {}).textContent].join(" ");
      const sel = opts.filter((o) => o.getAttribute("aria-selected") === "true" || o.getAttribute("aria-checked") === "true" || o.getAttribute("data-state") === "checked" || o.hasAttribute("data-selected") && o.getAttribute("data-selected") !== "false");
      const look = (o) => { const cs = getComputedStyle(o); const inner = o.querySelector("span, div"); const ics = inner ? getComputedStyle(inner) : cs; return [cs.backgroundColor, cs.color, cs.fontWeight, ics.color, ics.fontWeight, cs.boxShadow, cs.borderLeftColor].join("|"); };
      const icons = (o) => Array.from(o.querySelectorAll("svg, img, [class*=check i], [data-state=checked]")).filter((x) => { const b = x.getBoundingClientRect(); const cs = getComputedStyle(x); return b.width > 2 && b.height > 2 && cs.visibility !== "hidden" && Number(cs.opacity) > 0.1; });
      const tick = (o) => { const txt = o.textContent || ""; return /[✓✔☑]/.test(txt); };
      const out = { labels: opts.map((o) => L.clean(o.innerText || o.textContent)), lang: (box.closest("[lang]") || document.documentElement).getAttribute("lang") || "", sort: SORTRE.test(label), where: L.at(trig, ""), selected: null };
      if (sel.length) {
        const s = sel[0];
        const others = opts.filter((o) => o !== s);
        const baseLooks = new Set(others.map(look));
        const iconMark = icons(s).filter((x) => !others.some((o) => icons(o).some((y) => y.getBoundingClientRect().left - o.getBoundingClientRect().left === x.getBoundingClientRect().left - s.getBoundingClientRect().left && y.outerHTML === x.outerHTML)));
        const marked = !baseLooks.has(look(s)) || iconMark.length > 0 || (tick(s) && !others.some(tick));
        const sr = s.getBoundingClientRect(), br = box.getBoundingClientRect();
        let side = null;
        const m = iconMark[0];
        if (m) { const mr = m.getBoundingClientRect(); side = mr.left + mr.width / 2 < sr.left + sr.width / 2 ? "left" : "right"; }
        out.selected = { text: L.clean(s.textContent), marked, inView: sr.top >= br.top - 2 && sr.bottom <= br.bottom + 2 && sr.top >= 0 && sr.bottom <= innerHeight, side, at: L.at(s, "") };
      }
      return out;
    }, { i, src: SORT_SELECT.source });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
    if (!r) { notTested.push(`${triggers[i]}: no listbox appeared`); continue; }
    if (!r.sort) { const o = orderOf(r.labels, r.lang); if (o) soft.push({ what: `dropdown options are ${o}: ${r.labels.slice(0, 6).join(", ")}${r.labels.length > 6 ? ", …" : ""} — sort them [1.2]`, where: r.where.where, selector: r.where.selector, human: r.where.human }); }
    if (r.selected) {
      if (!r.selected.marked) hard.push({ what: `the selected option "${r.selected.text}" looks like the others when the list is open — mark it (a tick on one side, or the kit's selected colour) [1.2 / 1.8]`, where: r.selected.at.where, selector: r.selected.at.selector, human: r.selected.at.human });
      if (!r.selected.inView) hard.push({ what: `the selected option "${r.selected.text}" is scrolled out of sight when the list opens — scroll it into view on open [1.2]`, where: r.selected.at.where, selector: r.selected.at.selector, human: r.selected.at.human });
      if (r.selected.side) marks.push({ side: r.selected.side, where: r.where.where });
    }
  }
  await page.evaluate(() => { for (const e of document.querySelectorAll("[data-bs-dd]")) e.removeAttribute("data-bs-dd"); }).catch(() => {});
  const sides = new Set(marks.map((m) => m.side));
  if (sides.size > 1) hard.push({ what: `the selected-option tick sits on the left in some dropdowns and on the right in others (${marks.map((m) => `${m.side}: ${m.where}`).join("; ")}) — one side everywhere [1.2 / 1.18]`, where: "dropdowns on this page" });
  return { hard, soft, marks, notTested };
}

/* ───────────────────────── 12. hover feedback (1.6, hover-state) ───────────────────────── */
/**
 * Pointer screens only. Filled/boxed buttons and links dressed as buttons (hard), text buttons such as accordion
 * questions (soft) and clickable cards (soft) change how they look under
 * the pointer — colour, fill, border, shadow, transform, opacity, filter, underline, or a pseudo-element / child
 * that does. A cursor change alone is not feedback. At most `max` per page; the rest are listed in notTested.
 * Elements covered by something else at their centre are not hovered (listed too).
 */
export async function hoverFeedback(page, max = 40) {
  await ensure(page);
  const hard = [], soft = [], notTested = [];
  // a touch screen has no hover (Tailwind v4 wraps hover: in @media (hover: hover)): nothing to judge here
  if (await page.evaluate(() => matchMedia("(hover: none)").matches)) return { hard, soft, notTested: ["touch screen: no hover"] };
  const list = await page.evaluate(() => {
    const W = window;
    for (const e of document.querySelectorAll("[data-bs-hv]")) e.removeAttribute("data-bs-hv");
    const out = [];
    const disabled = (e) => e.matches(":disabled, [aria-disabled=true]") || !!e.closest("[aria-disabled=true], fieldset:disabled");
    const seen = new Set();
    for (const e of document.querySelectorAll("button, [role=button], a[href], [onclick], [role=link], [tabindex='0']")) {
      if (!W.__uiVisible(e) || disabled(e) || seen.has(e)) continue;
      // a selected chip / pressed toggle / active tab keeps its selected look under the pointer by design
      if (e.matches("[aria-pressed=true], [aria-selected=true], [aria-checked=true], [data-state=active], [data-state=on], [data-state=checked], [data-active=true]")) continue;
      // the one filled pill in a row of look-alike toggles ("en | az | kk", praxis) is the selected one, even unmarked
      let sibs = e.parentElement ? Array.from(e.parentElement.children).filter((x) => x !== e && x.tagName === e.tagName && W.__uiVisible(x)) : [];
      let most = 6;
      // the same in a list of filters, one per <li> ("All areas 30" over "Tax 12", "Law 9" … in a sidebar, praxis
      // /specialists): the selected chip is the one look among look-alike items
      const li = e.parentElement && e.parentElement.tagName === "LI" && e.parentElement.parentElement;
      if (!sibs.length && li && /^(UL|OL)$/.test(li.tagName)) {
        sibs = Array.from(li.children).filter((x) => x !== e.parentElement).map((x) => Array.from(x.children).find((k) => k.tagName === e.tagName)).filter((x) => x && W.__uiVisible(x));
        most = 40;
      }
      if (sibs.length >= 2 && sibs.length <= most) { // three or more: a Cancel | Save pair is not a toggle row
        const bg = (x) => getComputedStyle(x).backgroundColor + getComputedStyle(x).color;
        if (sibs.every((x) => bg(x) !== bg(e)) && new Set(sibs.map(bg)).size === 1 && Math.abs(e.getBoundingClientRect().height - sibs[0].getBoundingClientRect().height) < 2) continue;
      }
      // the current page's nav item keeps its active look under the pointer by design
      if (e.getAttribute("aria-current") === "page" || (e.closest("nav, header") && e.matches("a[href]") && window.__ly.dest(e) === (location.pathname.replace(/\/+$/, "") || "/"))) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 16 || r.height < 16) continue;
      let kind = null;
      if (W.__uiButtonLike(e, true)) kind = "button";
      // an unfilled, unboxed button (an accordion question, a text toggle) still wants a hover cue, but softer
      else if (e.matches("button, [role=button]") && r.width >= 24) kind = "plain";
      else if (r.width >= 120 && r.height >= 80 && e.querySelector("h2, h3, h4, p, img") && getComputedStyle(e).cursor === "pointer") kind = "card";
      if (!kind || e.closest("[role=dialog] [aria-label*=close i]") || /close|dismiss|закрыть/i.test(e.getAttribute("aria-label") || "")) continue;
      seen.add(e);
      e.setAttribute("data-bs-hv", String(out.length));
      out.push({ kind, ...window.__ly.at(e, "") });
    }
    return out;
  });
  const snap = (i) => page.evaluate((i) => {
    const e = document.querySelector(`[data-bs-hv="${i}"]`); if (!e) return null;
    const P = ["color", "backgroundColor", "backgroundImage", "borderTopColor", "borderBottomColor", "borderLeftColor", "boxShadow", "transform", "translate", "scale", "opacity", "filter", "textDecorationLine", "textDecorationColor", "outlineStyle", "outlineColor", "fontWeight", "letterSpacing", "backdropFilter"];
    const one = (x, ps) => { const cs = getComputedStyle(x, ps); return ps && (cs.content === "none" || cs.content === "normal") ? "-" : P.map((p) => cs[p]).join("|"); };
    const parts = [one(e), one(e, "::before"), one(e, "::after")];
    for (const k of Array.from(e.querySelectorAll("*")).slice(0, 14)) parts.push(one(k));
    return parts.join("‖");
  }, i);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (i >= max) { notTested.push(`${list.length - max} more control(s) not hovered (cap ${max}), e.g. ${list.slice(max, max + 3).map((x) => x.where).join("; ")}`); break; }
    const loc = page.locator(`[data-bs-hv="${i}"]`).first();
    await page.mouse.move(1, 1).catch(() => {});
    try { await loc.scrollIntoViewIfNeeded({ timeout: 2000 }); } catch { notTested.push(`${f.where}: could not scroll to it`); continue; }
    await page.waitForTimeout(150); await settle(page, 800);
    const before = await snap(i);
    const pt = await page.evaluate((i) => { const e = document.querySelector(`[data-bs-hv="${i}"]`); if (!e) return null; const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20); const t = document.elementFromPoint(x, y); return t && (e.contains(t) || t.contains(e)) ? { x, y } : { covered: t ? window.__uiDescribe(t) : "nothing" }; }, i);
    if (!pt || pt.covered) { notTested.push(`${f.where}: covered by ${pt ? pt.covered : "?"} at its centre`); continue; }
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(120); await settle(page, 900);
    const after = await snap(i);
    await page.mouse.move(1, 1).catch(() => {});
    if (before === null || after === null) continue;
    if (before === after) (f.kind === "button" ? hard : soft).push({ what: `${f.kind === "button" ? "button" : f.kind === "plain" ? "text button" : "clickable card"} does not change on hover — give it a hover state from the kit (fill/colour/shadow/underline), not only cursor:pointer [1.6]`, where: f.where, selector: f.selector, human: f.human });
  }
  await page.evaluate(() => { for (const e of document.querySelectorAll("[data-bs-hv]")) e.removeAttribute("data-bs-hv"); }).catch(() => {});
  return { hard, soft, notTested };
}

/* ───────────────────────── 13. one mobile menu (2.10, mobile-menu) ───────────────────────── */
/**
 * Narrow screens. Every toggle in the header (burger, avatar, "account", "more") is opened in turn; the in-site links
 * each one reveals are compared. Two toggles that both reveal the site navigation (≥ 3 of the same destinations, or
 * half of the smaller set) are two menus for one job → hard. An account menu (profile, settings, sign out) next to the
 * burger is fine.
 */
export async function oneMobileMenu(page) {
  await ensure(page);
  const toggles = await page.evaluate(() => {
    const W = window, L = W.__ly;
    if (innerWidth >= 768) return [];
    for (const e of document.querySelectorAll("[data-bs-tg]")) e.removeAttribute("data-bs-tg");
    const skip = /search|cart|basket|theme|dark|light|language|\blang\b|currency|close|notification|cookie|share|play|filter|sort/i;
    const t = L.header().flatMap((h) => Array.from(h.querySelectorAll("button, [role=button], summary, [aria-haspopup], [aria-expanded]")))
      .filter((e, i, a) => a.indexOf(e) === i && W.__uiVisible(e) && !skip.test([e.getAttribute("aria-label"), e.textContent, typeof e.className === "string" ? e.className : ""].join(" ")) && e.getAttribute("aria-haspopup") !== "listbox");
    t.forEach((e, i) => e.setAttribute("data-bs-tg", String(i)));
    return t.map((e) => W.__uiDescribe(e));
  });
  if (toggles.length < 2) return { applicable: false, hard: [] };
  const visibleDests = () => page.evaluate(() => { const L = window.__ly; return [...new Set(Array.from(document.querySelectorAll("a[href]")).filter((a) => window.__uiVisible(a) && !a.closest("footer, [role=contentinfo]")).map((a) => L.dest(a)).filter((d) => d && d.startsWith("/") && !d.includes("#")))]; });
  const opened = [];
  for (let i = 0; i < toggles.length; i++) {
    const before = new Set(await visibleDests());
    const t = page.locator(`[data-bs-tg="${i}"]`).first();
    const url = page.url();
    try { await t.click({ timeout: 2000 }); } catch { continue; }
    await page.waitForTimeout(300); await settle(page, 1200);
    if (page.url() !== url) { await page.goBack().catch(() => {}); await page.waitForTimeout(500); await ensure(page); continue; }
    await ensure(page);
    const now = (await visibleDests()).filter((d) => !before.has(d));
    opened.push({ i, where: toggles[i], dests: now });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);
    const still = (await visibleDests()).filter((d) => now.includes(d)).length;
    if (still && now.length) { await t.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(300); }
  }
  const hard = [];
  for (let a = 0; a < opened.length; a++)
    for (let b = a + 1; b < opened.length; b++) {
      const x = opened[a], y = opened[b];
      const both = x.dests.filter((d) => y.dests.includes(d));
      const small = Math.min(x.dests.length, y.dests.length);
      if (both.length >= 3 || (small >= 2 && both.length >= small / 2 && both.length >= 2))
        hard.push({ what: `two menus open the same navigation on a phone: "${x.where}" and "${y.where}" both show ${both.slice(0, 5).join(", ")}${both.length > 5 ? ", …" : ""} — keep one menu (the burger); the avatar menu holds only account items [2.10]`, where: y.where });
    }
  return { applicable: true, hard, info: opened.map((o) => `${o.where}: ${o.dests.length} links`) };
}

/* ───────────────────────── 14. money formatting, in every currency of the switcher (price-rounding currency-format number-format) ───────────────────────── */
const SYM = { "US$": "USD", "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₽": "RUB", "₸": "KZT", "₼": "AZN", "₺": "TRY", "₹": "INR", "₩": "KRW", "₴": "UAH", "₪": "ILS", "₫": "VND", "₦": "NGN", "₱": "PHP", "฿": "THB", "zł": "PLN", "Kč": "CZK", "C$": "CAD", "CA$": "CAD", "A$": "AUD", "AU$": "AUD", "NZ$": "NZD", "HK$": "HKD", "S$": "SGD", "R$": "BRL", "MX$": "MXN", "Fr.": "CHF", "ر.س": "SAR", "د.إ": "AED", "₾": "GEL", "֏": "AMD" };
const CODES = "USD|EUR|GBP|RUB|KZT|AZN|TRY|SAR|AED|INR|JPY|CNY|KRW|UAH|PLN|BHD|KWD|OMR|QAR|EGP|GEL|AMD|UZS|BYN|CAD|AUD|NZD|BRL|MXN|SEK|NOK|DKK|CZK|HUF|ILS|NGN|ZAR|SGD|HKD|THB|VND|IDR|PHP|MYR|CHF|KGS|TJS|MDL|RON|BGN";
const ZERO_DEC = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "ISK", "UGX", "PYG", "HUF", "UZS", "KZT_NO"]);
const THREE_DEC = new Set(["BHD", "KWD", "OMR", "JOD", "TND", "IQD", "LYD"]);
export const MONEY_SRC = (() => {
  const syms = Object.keys(SYM).sort((a, b) => b.length - a.length).map((s) => s.replace(/[$.]/g, "\\$&")).join("|");
  const cur = `(?:${syms}|(?<![A-Za-z])(?:${CODES})(?![A-Za-z]))`;
  const num = "(?:\\d{1,3}(?:[ \\u00a0\\u202f.,']\\d{3})+(?!\\d)|\\d+)(?:[.,]\\d+)?";
  return `(?<pre>${cur})[ \\u00a0\\u202f]?(?<n1>${num})|(?<n2>${num})[ \\u00a0\\u202f]?(?<post>${cur})`;
})();
/**
 * Parses one amount as written: the currency (code), how it is written (symbol/code, before/after), the integer and
 * decimal parts, the decimal and grouping separators. `dec` is the page's decimal separator when the token alone is
 * ambiguous ("7.489": three decimals or a thousands group?).
 */
export function parseMoney(raw, dec = null) {
  const m = new RegExp(MONEY_SRC, "u").exec(raw);
  if (!m) return null;
  const g = m.groups;
  const mark = (g.pre || g.post).trim();
  const numStr = g.n1 || g.n2;
  const code = SYM[mark] || mark.toUpperCase();
  const seps = [...numStr.matchAll(/[   .,']/g)].map((x) => ({ c: x[0], i: x.index }));
  let decimal = null, decimals = "", group = null, ambiguous = false;
  if (seps.length) {
    const last = seps[seps.length - 1];
    const tail = numStr.slice(last.i + 1);
    const kinds = new Set(seps.map((s) => s.c));
    if (/[.,]/.test(last.c) && (tail.length !== 3 || /^0[.,]/.test(numStr) || (kinds.size > 1 && seps.filter((s) => s.c === last.c).length === 1))) { decimal = last.c; decimals = tail; }
    else if (/[.,]/.test(last.c) && seps.length === 1 && dec === last.c) { decimal = last.c; decimals = tail; ambiguous = true; }
    else group = last.c;
    if (decimal) { const before = seps.slice(0, -1); if (before.length) group = before[0].c; }
  }
  const intPart = (decimal ? numStr.slice(0, numStr.lastIndexOf(decimal)) : numStr).replace(/[^\d]/g, "");
  const value = parseFloat(intPart + (decimals ? "." + decimals : ""));
  const gap = g.pre ? m[0].charAt(m[0].indexOf(mark) + mark.length) : m[0].charAt(m[0].indexOf(numStr) + numStr.length);
  const style = `${g.pre ? "before" : "after"}:${mark}${/[ \u00a0\u202f]/.test(gap) ? " spaced" : ""}`;
  return { raw: m[0], code, mark, style, intPart, decimals, decimal, group, value, ambiguous };
}
// 5.5.0 (Kindred b2d1mi): $9.70 is a round price too — packs of $10.00 / $9.70 / $46.00 / $85.00 gave a 75 % "nice"
// share, so the dirty-conversion rule never armed and €8.63 / €8.37 / €39.71 / €73.38 passed. One significant decimal
// (x.10–x.90) counts as round.
const nice = (p) => !p.decimals || /^(0+|5|50|9|90|95|99|49|[1-9]0)$/.test(p.decimals) || (p.value >= 100 && /^0+$/.test(p.decimals));
/**
 * Format problems in the amounts of one page state (one currency). `tokens`: [{ raw, fontSize, where, selector,
 * unit }] from the page. Hard: float garbage or too many decimals, decimals on a zero-decimal currency, one currency
 * written two ways (US$ and $, € before and after), two decimal separators, amounts ≥ 1000 without grouping or with
 * two grouping styles. `soft` adds dirty converted prices (base currency prices round, these not).
 */
export function moneyIssues(tokens, { baseNice = null, label = "", rateDecimals = 4 } = {}) {
  const hard = [], soft = [];
  // "7.489": three decimals or a thousands group? Decided by how the same currency writes its unambiguous decimals on
  // this page (truelogos in BRL: "R$ 10,50" next to a static "€20,000" — the euro amount is not 20 with 3 decimals)
  const first = tokens.map((t) => ({ t, p: parseMoney(t.raw) })).filter((x) => x.p);
  const decOf = new Map();
  for (const x of first) if (x.p.decimal && x.p.decimals.length <= 2) { if (!decOf.has(x.p.code)) decOf.set(x.p.code, new Set()); decOf.get(x.p.code).add(x.p.decimal); }
  const all = tokens.map((t) => { const p0 = parseMoney(t.raw); const d = p0 && decOf.get(p0.code); return { t, p: parseMoney(t.raw, d && d.size === 1 ? [...d][0] : null) }; }).filter((x) => x.p);
  const units = [];
  const at = (x) => ({ where: x.t.where, selector: x.t.selector, human: x.t.human });
  const pre = label ? `${label}: ` : "";
  for (const x of all) {
    const p = x.p, n = p.decimals.length;
    const allowed = ZERO_DEC.has(p.code) ? 0 : THREE_DEC.has(p.code) ? 3 : 2;
    if (n > allowed) {
      // a per-unit rate below 1 ("$0.0085 /credit", sprout.boutique) may need sub-cent digits: soft, unless it is float
      // garbage (6+ decimals, 0.0089999…)
      // an exchange rate ("$1 = €0.89165") is quoted with more digits on purpose: up to `rateDecimals` (layout.rateDecimals,
      // default 4: "€0.8909") is fine, more is soft
      if (x.t.rate && n < 6) { if (n > rateDecimals) soft.push({ what: `${pre}exchange rate "${p.raw}" is shown with ${n} decimals — round it for people (2–${rateDecimals} decimals; layout.rateDecimals) [money]`, ...at(x) }); }
      else if (n >= 6 || allowed === 0 && !x.t.unit || !(x.t.unit && p.value < 1)) hard.push({ what: `${pre}"${p.raw}" has ${n} decimals — ${allowed === 0 ? `${p.code} is shown without decimals` : `round to ${allowed} (Intl.NumberFormat with the currency's minor unit)`}${n >= 4 ? "; this looks like a raw floating-point conversion" : ""} [money]`, ...at(x) });
      else units.push(x);
    }
    if (p.value >= 1000 && !p.group && p.intPart.length >= 4) hard.push({ what: `${pre}"${p.raw}" has no thousands separator — group digits from 4 (1,000 / 1 000) [money]`, ...at(x) });
  }
  if (units.length) { const ex = [...new Set(units.map((x) => x.p.raw))]; soft.push({ what: `${pre}${units.length} unit price(s) with ${Math.min(...units.map((x) => x.p.decimals.length))}+ decimals (${ex.slice(0, 5).join(", ")}${ex.length > 5 ? ", …" : ""}) — round them, or price the unit in a larger quantity ("per 100 credits") [money]`, ...at(units[0]) }); }
  const byCode = new Map();
  for (const x of all) { if (!byCode.has(x.p.code)) byCode.set(x.p.code, new Map()); const m = byCode.get(x.p.code); if (!m.has(x.p.style)) m.set(x.p.style, x); }
  for (const [code, styles] of byCode) if (styles.size > 1) {
    const ex = [...styles.values()];
    hard.push({ what: `${pre}${code} is written ${styles.size} ways on one page: ${ex.map((x) => `"${x.p.raw}"`).join(", ")} — one symbol, one position, one spacing per currency (format every amount with one helper) [money]`, ...at(ex[1]) });
  }
  const decSeen = new Map(); for (const x of all) if (x.p.decimal && !decSeen.has(x.p.decimal)) decSeen.set(x.p.decimal, x);
  if (decSeen.size > 1) { const ex = [...decSeen.values()]; hard.push({ what: `${pre}two decimal separators on one page: ${ex.map((x) => `"${x.p.raw}"`).join(" and ")} — one locale, one separator [money]`, ...at(ex[1]) }); }
  const grpSeen = new Map(); for (const x of all) if (x.p.group && !grpSeen.has(x.p.group)) grpSeen.set(x.p.group, x);
  if (grpSeen.size > 1) { const ex = [...grpSeen.values()]; hard.push({ what: `${pre}two thousands separators on one page: ${ex.map((x) => `"${x.p.raw}"`).join(" and ")} [money]`, ...at(ex[1]) }); }
  // dirty conversions: prices shown large (packs, plans) were round in the base currency and are not here
  // 5.5.0 (Compass 64f15b): a pack price in a 14px pricing table row next to its credits counts as a pack too
  const big = all.filter((x) => (x.t.fontSize >= 18 || x.t.creditsNear) && !x.t.unit && !x.t.rate);
  if (baseNice !== null && baseNice >= 0.8 && big.length >= 2) {
    const dirty = big.filter((x) => !nice(x.p));
    if (dirty.length / big.length > 0.5) soft.push({ what: `${pre}converted prices are not rounded (${dirty.slice(0, 4).map((x) => x.p.raw).join(", ")}${dirty.length > 4 ? ", …" : ""}) while the base currency's were — round packs to the currency's minor unit or a nice step (x.99 / x.90 / whole) [money]`, ...at(dirty[0]) });
  }
  return { hard, soft, niceShare: big.length ? big.filter((x) => nice(x.p)).length / big.length : null };
}
/** In-page: every visible amount (text nodes in reading order), with its size and whether it is a per-unit price. */
const moneyTokens = (src) => {
  const W = window, L = W.__ly, re = new RegExp(src, "gu");
  const out = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && n.parentElement.closest("script, style, noscript, template, select, option, [aria-hidden=true]") ? 2 : 1 });
  // amounts are often split over elements ("$" <span>12</span>): read each block's text, attribute to its element
  const blocks = new Set();
  // the site's header (L.header: not a page's own <header> inside a section, praxis /dashboard/wallet)
  const siteHeader = L.header();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.trim() && W.__uiVisible(n.parentElement)) { let b = n.parentElement; while (b.parentElement && getComputedStyle(b).display.startsWith("inline") && b.parentElement !== document.body) b = b.parentElement; blocks.add(b); }
  for (const b of blocks) {
    if (Array.from(b.children).some((c) => blocks.has(c))) { // text of its own only, children are their own blocks
      const own = Array.from(b.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join(" ");
      for (const m of own.matchAll(re)) out.push(tok(b, m, own));
      continue;
    }
    const txt = b.innerText || b.textContent || "";
    for (const m of txt.matchAll(re)) out.push(tok(b, m, txt));
  }
  function tok(b, m, txt) {
    const after = txt.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const before = txt.slice(Math.max(0, m.index - 3), m.index);
    return { raw: m[0], fontSize: parseFloat(getComputedStyle(b).fontSize), rate: /=\s*$/.test(before), unit: /^\s*(\/|per\b|за\b|each|\/\s*(hr|h|mo|month|yr|credit|token|gb|unit))/i.test(after) || /per (credit|token|unit)/i.test(txt), inHeader: siteHeader.some((h) => h.contains(b)), creditsNear: /\bcredits?\b|кредит|kredit/i.test(txt), ...L.at(b, "") };
  }
  const credits = /\bcredits?\b|кредит|kredit/i.test(document.body.innerText);
  // an amount given in credits on this page ("6,000 credits") — lib/money-model.js CREDIT_AMOUNT_SRC, passed in
  const creditAmounts = !!(window.__bsCreditSrc && new RegExp(window.__bsCreditSrc, "iu").test(document.body.innerText));
  const headerCredits = L.header().some((h) => /\bcredits?\b|кредит|kredit/i.test(h.innerText));
  return { tokens: out, credits, creditAmounts, headerCredits };
};
/** In-page: the currency switcher (native select, or a button/combobox showing a currency) and its options. */
const findSwitcher = (codes) => {
  const W = window;
  const CUR = new RegExp(`(?<![A-Za-z])(${codes})(?![A-Za-z])`);
  for (const e of document.querySelectorAll("[data-bs-cur]")) e.removeAttribute("data-bs-cur");
  const sel = Array.from(document.querySelectorAll("select")).find((s) => Array.from(s.options).filter((o) => CUR.test(o.text) || CUR.test(o.value)).length >= 2);
  if (sel) { sel.setAttribute("data-bs-cur", ""); const so = sel.options[sel.selectedIndex]; const cm = so && (so.text.match(CUR) || so.value.match(CUR)); return { kind: "native", current: cm ? cm[1] : null, options: Array.from(sel.options).filter((o) => CUR.test(o.text) || CUR.test(o.value)).map((o) => ({ value: o.value, code: (o.text.match(CUR) || o.value.match(CUR))[1] })) }; }
  // a segmented row of currency buttons (5.5.0: before the dropdown trigger — "USD" "EUR" side by side are not a
  // trigger showing the current currency; read as one, no other currency was ever found)
  const segs = Array.from(document.querySelectorAll("button, [role=radio], [role=tab]")).filter((b) => W.__uiVisible(b) && /^\W*([A-Z]{3})\W*$/.test((b.textContent || "").trim()) && CUR.test(b.textContent));
  if (segs.length >= 2 && segs.every((s) => s.parentElement === segs[0].parentElement)) { segs.forEach((s) => s.setAttribute("data-bs-cur-opt", s.textContent.match(CUR)[1])); return { kind: "segmented", options: segs.map((s) => ({ code: s.textContent.match(CUR)[1] })), current: (segs.find((s) => s.getAttribute("aria-pressed") === "true" || s.getAttribute("aria-checked") === "true" || s.getAttribute("data-state") === "on" || s.getAttribute("aria-selected") === "true") || segs[0]).textContent.match(CUR)[1] }; }
  const btn = Array.from(document.querySelectorAll("button, [role=combobox], [aria-haspopup]")).find((b) => W.__uiVisible(b) && CUR.test(b.innerText || "") && (b.innerText || "").trim().length <= 16);
  if (btn) { btn.setAttribute("data-bs-cur", ""); return { kind: "custom", current: btn.innerText.match(CUR)[1] }; }
  return null;
};
/**
 * Money on this page, as written, in the current currency and in every other currency of the switcher (selected one
 * by one, then the original is put back). Hard/soft per moneyIssues; soft: a header balance in money while the
 * product sells credits. Without a switcher only the current currency is checked. At most `max` currencies.
 */
export async function moneyFormat(page, max = 8, { rateDecimals = 4, each = null, onEach = null } = {}) {
  await ensure(page);
  const hard = [], soft = [], notTested = [], tested = [], records = [];
  const { CREDIT_AMOUNT_SRC } = await import("../../lib/money-model.js");
  const read = async () => { await ensure(page); await page.evaluate((src) => { window.__bsCreditSrc = src; }, CREDIT_AMOUNT_SRC); return page.evaluate(moneyTokens, MONEY_SRC); };
  // 5.5.0: the arithmetic of what is on screen (money.js): the stated rate reproduces the prices, a bracket does not
  // repeat the amounts it explains, the calculator follows its label — in every currency
  const M = await import("./money.js");
  const arithmetic = async (label) => {
    const r = await M.moneyPairs(page).catch(() => null);
    if (!r) return;
    records.push({ currency: label || "(current)", ...r });
    const pre = (list) => list.map((f) => ({ ...f, what: label ? `in ${label}: ${f.what}` : f.what }));
    hard.push(...pre(M.rateMismatches(r)), ...pre(M.bracketRepeats(r)), ...pre(await M.calculatorCheck(page, r.calculators).catch(() => [])));
    // the site-wide comparison reads more in the same currency (a top-up dialog) before the next switch
    if (onEach) await onEach(label || sw0?.current || "", records[records.length - 1]).catch(() => {});
  };
  const base = await read();
  const b = moneyIssues(base.tokens, { label: "", rateDecimals });
  hard.push(...b.hard); soft.push(...b.soft);
  hard.push(...(await M.numberGrouping(page).catch(() => [])));
  const sw0 = onEach ? await page.evaluate(findSwitcher, CODES).catch(() => null) : null;
  await arithmetic("");
  // an amount on the same line as credits ("10 credits = $1") is the hint next to the credits, not a money balance.
  // 5.7.1: "sells credits" is the run's money model (lib/money-model.js), the same answer M2 uses — not the word
  // "credit" somewhere on this page ("credit card", "sign-up credit" on a product that bills in dollars)
  const { siteMoneyModel } = await import("../../lib/money-model.js");
  const { loadConfig } = await import("../project.js");  // eslint-disable-line
  const mm = siteMoneyModel(loadConfig());
  const sellsCredits = mm.model === "credits" || (mm.model === "unknown" && base.creditAmounts);
  if (sellsCredits && !base.headerCredits && base.tokens.some((t) => t.inHeader && !t.creditsNear)) {
    const t = base.tokens.find((x) => x.inHeader && !x.creditsNear);
    soft.push({ what: `the header shows money ("${t.raw}") but the product sells credits — show the balance in credits (money only as a hint next to it) [money]`, where: t.where, selector: t.selector, human: t.human });
  }
  const sw = await page.evaluate(findSwitcher, CODES);
  if (!sw) return { hard, soft, notTested, tested: ["(current)"], switcher: null, records };
  tested.push(`${sw.current || "(current)"}`);
  let options = sw.options;
  const openCustom = async () => {
    await page.locator("[data-bs-cur]").first().click({ timeout: 2500 });
    await page.waitForTimeout(250); await settle(page, 1000);
    return page.evaluate((codes) => {
      const CUR = new RegExp(`(?<![A-Za-z])(${codes})(?![A-Za-z])`);
      const opts = Array.from(document.querySelectorAll("[role=option], [role=menuitem], [role=menuitemradio], [role=listbox] li, [data-radix-popper-content-wrapper] button, [role=dialog] button"))
        .filter((o) => window.__uiVisible(o) && CUR.test(o.innerText || "") && !o.hasAttribute("data-bs-cur"));
      for (const o of opts) o.setAttribute("data-bs-cur-opt", o.innerText.match(CUR)[1]);
      return opts.map((o) => ({ code: o.innerText.match(CUR)[1] }));
    }, CODES);
  };
  const choose = async (code) => {
    if (sw.kind === "native") { const v = options.find((o) => o.code === code).value; await page.locator("[data-bs-cur]").first().selectOption(v, { timeout: 2500 }); }
    else if (sw.kind === "custom") { await openCustom(); await page.locator(`[data-bs-cur-opt="${code}"]`).first().click({ timeout: 2500 }); }
    else await page.locator(`[data-bs-cur-opt="${code}"]`).first().click({ timeout: 2500 });
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await settle(page, 1200);
  };
  try {
    if (sw.kind === "custom") { options = await openCustom(); await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(200); }
    const codes = [...new Set((options || []).map((o) => o.code))].filter((c) => c !== sw.current);
    if (!codes.length) notTested.push(`a currency switcher (${sw.kind}, showing ${sw.current}) was found but no other currency could be found in it`);
    for (const [i, code] of codes.entries()) {
      if (i >= max) { notTested.push(`${codes.length - max} more currencies not switched to (cap ${max})`); break; }
      try { await choose(code); } catch (e) { notTested.push(`${code}: could not switch (${String(e.message).split("\n")[0]})`); continue; }
      await page.evaluate(findSwitcher, CODES); // re-mark after a re-render
      const st = await read();
      const r = moneyIssues(st.tokens, { label: `in ${code}`, baseNice: b.niceShare, rateDecimals });
      hard.push(...r.hard); soft.push(...r.soft);
      // 5.5.0 (Compass b2950h / 9n16n2): an amount that kept the base currency's number while the rest was converted
      hard.push(...M.unconverted(base.tokens, st.tokens, parseMoney, `in ${code}`));
      hard.push(...(await M.numberGrouping(page).catch(() => [])).map((f) => ({ ...f, what: `in ${code}: ${f.what}` })));
      await arithmetic(code);
      tested.push(code);
      // 5.5.0: the caller measures the page in this currency too (layout.spec: 2.5 ranges split at their dash)
      if (each) await each(code).catch(() => {});
    }
  } finally {
    if (sw.current && tested.length > 1) { try { await page.evaluate(findSwitcher, CODES); if (sw.kind === "custom") await page.locator("[data-bs-cur]").first().isVisible() && (await choose(sw.current)); else await choose(sw.current); } catch { notTested.push(`could not switch back to ${sw.current}`); } }
  }
  return { hard, soft, notTested, tested, switcher: sw.kind, records };
}
