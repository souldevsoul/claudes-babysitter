// 5.5.0 — rendered copy rules found by the miss loop (lib/copy-rules.js holds the rules; this file collects what they
// read from a page). Per page: CT12 a link labelled with its path, CT25 a URL on the brand's name on another host,
// CT29 an e-mail address shown in capitals, P4 numbering vs contents, CT30 a catalogue of zeros, CT28 a heading in
// mixed case / an acronym in Title case. Site-wide (content.spec): CT26 slugs shown as names, 6.15 one <title> per
// page, CT24 near-copies of a sibling product's headline, CT28 with the whole site's vocabulary.
// The states run (run.js measure()) calls stateCopyFindings in every state, so wizard steps, opened menus and
// result screens get the copy rules too (Compass q0qz7n, 4ec28x, wee3g3).
// Needs checks.install(page) first. Finding: { id, what, where, selector? }.
import { contentConfig, lintSegment } from "../../lib/content-rules.js";
import {
  pathLabel, foreignBrandUrls, brandTokens, ownHosts, ct25Fix, isSlug, mixedCase, lowercaseVocabulary, acronyms, acronymDrift,
  allZero, numberingFindings,
} from "../../lib/copy-rules.js";

/** What the copy rules read from the page that collectCopy does not keep. */
export const copyExtrasData = (page) => page.evaluate(() => {
  const W = window;
  const vis = (el) => W.__uiVisible ? W.__uiVisible(el) : !!(el.offsetWidth || el.offsetHeight);
  const where = (el) => (W.__uiDescribe ? W.__uiDescribe(el) : el.tagName.toLowerCase());
  const sel = (el) => (W.__uiSelector ? W.__uiSelector(el) : null);
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const SKIP = "script, style, noscript, template, code, kbd, samp, pre, textarea, input, select, [contenteditable=true], [data-babysitter-ignore]";
  // links and buttons with their label
  const controls = [];
  for (const el of Array.from(document.querySelectorAll("a[href], button, [role=link], [role=button]"))) {
    if (controls.length > 400 || !vis(el)) continue;
    const label = clean(el.innerText || el.getAttribute("aria-label") || "");
    if (!label || label.length > 80) continue;
    controls.push({ label, href: el.getAttribute("href") || "", where: where(el), selector: sel(el) });
  }
  // URLs a reader sees (text, code, pre) and links' hrefs
  const urls = [];
  const all = clean(document.body.innerText || "");
  for (const m of all.match(/\bhttps?:\/\/[^\s"'<>)\]]+/gi) || []) urls.push({ text: m, where: "page text" });
  for (const el of Array.from(document.querySelectorAll("code, pre"))) if (vis(el)) for (const m of (el.textContent || "").match(/\bhttps?:\/\/[^\s"'<>)\]]+/gi) || []) urls.push({ text: m, where: where(el) });
  for (const a of Array.from(document.querySelectorAll("a[href^=http]"))) if (vis(a)) urls.push({ text: a.getAttribute("href"), where: where(a) });
  // e-mail addresses and the case they are drawn in
  const emails = [];
  const ER = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && !n.parentElement.closest("script, style, noscript, template, input, textarea") && ER.test(n.nodeValue) ? 1 : 2) });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const p = n.parentElement;
    if (!vis(p)) continue;
    const cs = getComputedStyle(p);
    const tt = cs.textTransform, sc = /small-caps/.test(cs.fontVariant || "") || /small-caps|all-small-caps/.test(cs.fontVariantCaps || "");
    const email = n.nodeValue.match(ER)[0];
    if (/uppercase|capitalize/.test(tt) || sc) emails.push({ email, shown: tt === "uppercase" || sc ? email.toUpperCase() : email.replace(/\b\w/g, (c) => c.toUpperCase()), how: sc ? "small capitals" : tt, where: where(p), selector: sel(p) });
  }
  // slugs: a piece of text that is a whole kebab-case word (a chip, a cell, a label)
  const slugs = [];
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    if (slugs.length > 60 || el.children.length || el.closest(SKIP) || !vis(el)) continue;
    const t = clean(el.textContent);
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(t)) { if (el.closest("a[href]") && (el.closest("a[href]").getAttribute("href") || "").includes(t) && /^https?:|^\//.test(el.closest("a[href]").getAttribute("href") || "") && el.closest("a").textContent.trim() !== t) continue; slugs.push({ text: t, where: where(el), selector: sel(el) }); }
    else for (const part of t.split(/\s*[,·•|]\s*/)) if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(part) && t.split(/\s*[,·•|]\s*/).length >= 2) slugs.push({ text: part, where: where(el), selector: sel(el) });
  }
  // headings, form texts (an acronym typed into a brief), numbered sections and the contents list
  const headings = Array.from(document.querySelectorAll("h1, h2, h3")).filter(vis).map((h) => ({ tag: h.tagName.toLowerCase(), text: clean(h.textContent), where: where(h), selector: sel(h), caps: getComputedStyle(h).textTransform === "uppercase" }));
  const forms = Array.from(document.querySelectorAll("textarea, input:not([type=hidden]):not([type=password]):not([type=email])")).filter(vis).map((f) => ({ text: [f.value, f.getAttribute("placeholder")].filter(Boolean).join(" "), where: where(f), selector: sel(f) })).filter((x) => x.text);
  const sections = Array.from(document.querySelectorAll("main h2, main h3, article h2, article h3, h2, h3")).filter((h, i, l) => vis(h) && l.indexOf(h) === i && !h.closest("nav, aside, [role=navigation], footer, header")).map((h) => clean(h.textContent));
  let toc = [];
  for (const box of Array.from(document.querySelectorAll("nav, aside, [role=navigation], ol, ul"))) {
    if (!vis(box) || box.closest("header, footer")) continue;
    const items = Array.from(box.querySelectorAll('a[href^="#"]')).map((a) => clean(a.textContent)).filter((t) => /^§?\s*\d+/.test(t));
    if (items.length >= 3 && items.length > toc.length) toc = items;
  }
  // lists of like items: 4+ children with one tag + class signature
  const groups = [];
  for (const box of Array.from(document.querySelectorAll("main ul, main ol, main div, main section, ul, ol"))) {
    if (groups.length > 40 || !vis(box) || box.closest("header, footer, nav")) continue;
    const kids = Array.from(box.children).filter(vis);
    if (kids.length < 4) continue;
    const sig = (k) => `${k.tagName}.${String(k.className || "").split(/\s+/).sort().join(".")}`;
    const s0 = sig(kids[0]);
    if (!kids.every((k) => sig(k) === s0)) continue;
    const items = kids.map((k) => clean(k.innerText)).filter((t) => t.length && t.length < 400);
    if (items.length === kids.length) groups.push({ where: where(box), items });
  }
  return { controls, urls, emails, slugs, headings, forms, sections, toc, groups, host: location.hostname, origin: location.origin, lang: (document.documentElement.getAttribute("lang") || "").toLowerCase(), path: location.pathname };
});

/**
 * The per-page 5.5.0 copy rules. `vocab` / `known`: the site's lowercase words and acronyms (site-wide), else the
 * page's own. `siteWide: true` leaves CT28 to the site-wide test (it has the whole site's vocabulary).
 */
export async function copyExtrasFindings(page, cfg = {}, { data = null, vocab = null, known = null, stage = null, siteWide = false, segs = null } = {}) {
  const cc = contentConfig(cfg);
  const skip = new Set(cc.skip || []);
  const on = (id) => !skip.has(id);
  const d = data || (await copyExtrasData(page));
  const out = [];
  // CT12 a label that is a path
  if (on("CT12")) for (const x of d.controls) { const p = pathLabel(x.label, x.href); if (p) out.push({ id: "CT12", what: `a link / button labelled with its path: "${x.label}" — fix: label it with the page's name ("${p.split("/").filter(Boolean).pop()?.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) || "Home"}"), not its URL [CT12]`, where: x.where, selector: x.selector }); }
  // CT25 the brand's name on another host
  if (on("CT25")) {
    const brands = brandTokens(cfg), own = ownHosts(cfg, [d.origin]);
    const seen = new Set();
    for (const u of d.urls) for (const hit of foreignBrandUrls(u.text, { brands, own })) {
      if (seen.has(hit.host)) continue;
      seen.add(hit.host);
      out.push({ id: "CT25", what: `${hit.url} is on ${hit.host} — the brand's name on a host that is not this site (${d.host}) — fix: ${ct25Fix(hit.host)} [CT25]`, where: u.where });
    }
  }
  // CT29 an e-mail drawn in capitals
  if (on("CT29")) for (const e of d.emails) out.push({ id: "CT29", what: `"${e.email}" is shown as "${e.shown}" (${e.how}) — fix: keep e-mail addresses in their own case (text-transform: none / normal-case on that element) [CT29]`, where: e.where, selector: e.selector });
  // P4 numbering and contents
  if (on("P4")) for (const x of numberingFindings(d.sections, d.toc)) out.push({ ...x, where: d.path });
  // CT30 a catalogue of zeros
  if (on("CT30")) { const seen = new Set(); out.push(...allZero(d.groups.filter((g) => { const key = g.items.join("|"); if (seen.has(key)) return false; seen.add(key); return true; }), { stage })); }
  // CT28 mixed case in a heading (English), an acronym in Title case
  if (on("CT28") && !siteWide) {
    const texts = (segs || []).map((s) => s.text).concat(d.headings.map((h) => h.text));
    out.push(...caseFindings(d, { vocab: vocab || lowercaseVocabulary(texts), known: known || acronyms(texts), brands: brandTokens(cfg) }));
  }
  return out;
}

/** CT28 on one page's data with a vocabulary (the page's or the whole site's). */
export function caseFindings(d, { vocab, known, brands = [] }) {
  const out = [];
  if (/^en\b|^$/.test(d.lang || "")) for (const h of d.headings) {
    if (h.caps || h.text === h.text.toUpperCase()) continue;
    const m = mixedCase(h.text, { lower: vocab, brands });
    if (m) out.push({ id: "CT28", what: `the heading "${h.text}" mixes Title Case ("${m.caps.join('", "')}") and sentence case ("${m.lows.join('", "')}") — fix: one case for the whole heading (sentence case: "${sentence(h.text, brands)}") [CT28]`, where: h.where, selector: h.selector });
  }
  for (const x of [...d.headings, ...d.forms]) {
    const a = acronymDrift(x.text, known);
    if (a) out.push({ id: "CT28", what: `"${a.found}" in "${String(x.text).slice(0, 70)}" — the site writes ${a.want} — fix: keep the acronym's case (${a.want}) wherever the name appears, templates and prefilled text included [CT28]`, where: x.where, selector: x.selector });
  }
  return out;
}
const sentence = (t, brands) => String(t).split(" ").map((w, i) => (i === 0 || /^\p{Lu}{2,}$/u.test(w) || brands.includes(w.toLowerCase()) ? w : w.toLowerCase())).join(" ");

/**
 * Every state of the states run: the copy rules (CT1–CT4, CT8, CT11 English on another language's page, CT12) and the
 * 5.5.0 extras, so a wizard step, an open menu or a result screen is read like a page. measure() keeps only what a
 * state adds.
 */
export async function stateCopyFindings(page, cfg = {}) {
  const k = await import("./content.js");
  const copy = await k.collectCopy(page);
  const cf = await k.copyFindings(page, cfg, copy, null);
  const lang = (copy.lang || "").toLowerCase();
  const lf = lang && !/^en\b/.test(lang) ? (await k.languageFindings(page, { cfg, copy, locale: lang })).hard.filter((f) => f.id === "CT11") : [];
  const ex = await copyExtrasFindings(page, cfg, { segs: copy.segs });
  return [...cf.hard, ...lf, ...ex];
}

/**
 * Site-wide CT28 with the whole site's vocabulary: `records` are pageRecords with `extras` (copyExtrasData).
 */
export function siteCaseFindings(records, cfg = {}) {
  const texts = records.flatMap((r) => [...(r.segs || []).map((s) => s.text), ...((r.extras?.headings) || []).map((h) => h.text)]);
  const vocab = lowercaseVocabulary(texts), known = acronyms(texts), brands = brandTokens(cfg, records.flatMap((r) => r.brand || []));
  return records.flatMap((r) => (r.extras ? caseFindings(r.extras, { vocab, known, brands }).map((f) => ({ ...f, where: `${r.route} ${f.where}` })) : []));
}
void lintSegment;
