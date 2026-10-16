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
    const hs = Array.from(document.querySelectorAll("header, [role=banner]")).filter((h) => !h.closest("footer, [role=contentinfo], article, main section"));
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
 * site map). Logo, sign-in/up, account and cart links are not section navigation and are left out; so are CTAs.
 * Also returns the page's nav links and its h1/title for the site-wide name-vs-page comparison (navTitleMismatches).
 */
export async function navParity(page) {
  await ensure(page);
  return page.evaluate((authy) => {
    const W = window, L = W.__ly;
    const AUTHY_RE = new RegExp(authy, "i");
    const hard = [], soft = [];
    const H = L.header(), F = L.footer();
    const nav = (roots) => roots.flatMap((r) => Array.from(r.querySelectorAll("a[href]")))
      .filter((a) => { const d = L.dest(a); return d && d.startsWith("/") && !L.isHome(a) && !AUTHY_RE.test(d) && L.label(a) && !/^(mailto|tel):/.test(a.getAttribute("href") || ""); });
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
  }, AUTHY.source);
}

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
  const chrome = (e) => !!e.closest("header, [role=banner], footer, [role=contentinfo], nav, [role=navigation], [role=dialog], dialog, aside, [data-bs-menu-panel]");
  const hasChrome = !!document.querySelector("header, [role=banner], nav, footer");
  const brand = L.norm(L.brand());
  const cands = new Set();
  const consider = (e) => {
    if (!W.__uiVisible(e)) return;
    if (NOT_LOGO.test(attrs(e)) || [...(function* () { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) yield p; })()].slice(0, 4).some((p) => NOT_LOGO.test(attrs(p)))) return;
    // in the site chrome; outside it only the mark at the top of a bare page (auth screens without a header)
    if (!scope && !chrome(e) && (hasChrome || e.getBoundingClientRect().top + scrollY > 260)) return;
    if (e.closest("button, [role=button], label, select")) return;
    cands.add(e);
  };
  // marked as a logo
  for (const e of root.querySelectorAll('[class*=logo i], [id*=logo i], [alt*=logo i], [aria-label*=logo i], [data-logo], [class*=brand i], [src*=logo i], img[alt], svg[aria-label]')) {
    const a = attrs(e);
    if (/logo|brand|wordmark/i.test(a) || (brand && L.norm(e.getAttribute("alt") || e.getAttribute("aria-label") || "") === brand)) consider(e);
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
      if (pseudo) v.push(cs.width, cs.height, cs.transform);
      // a border of width 0 has no colour worth comparing
      if (parseFloat(cs.borderBottomWidth) === 0) v[props.indexOf("borderBottomColor")] = "";
      return v.join("|");
    };
    parts.push(one(el), one(el, "::before"), one(el, "::after"));
    // the label inside (a span that takes the "active" colour), and an <li> that only wraps this link
    const inner = Array.from(el.querySelectorAll("span, p, div")).find((e) => L.clean(e.textContent) === L.clean(el.textContent) && L.clean(e.textContent));
    if (inner) parts.push(one(inner));
    const li = el.parentElement;
    if (li && li.matches("li") && li.querySelectorAll("a[href]").length === 1) parts.push(one(li), one(li, "::before"), one(li, "::after"));
    return parts.join("‖");
  };
  for (const root of roots) {
    const links = Array.from(root.querySelectorAll("a[href]")).filter((a) => {
      if (!W.__uiVisible(a) || !L.label(a)) return false;
      const d = L.dest(a); if (!d || !d.startsWith("/")) return false;
      if (L.isHome(a) && a.querySelector("img, svg") && !L.clean(a.textContent).match(/^home$/i)) return false; // the logo
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
      const prefix = exact.length ? [] : items.filter((a) => { const p = path(a); return p && p !== "/" && here.startsWith(p + "/"); });
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
        else if (!cur.length && count.get(l) === 1) out.push({ ...L.at(a, `${where}: "${L.label(a)}" looks highlighted (different from the other items) on a page it does not open — an item looks active only on its own page [3.5]`), level: "soft" });
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
