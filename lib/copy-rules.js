// 5.5.0 — copy rules found by the miss loop on Parallel, Kindred and Compass (test/misses-550-content-b.test.mjs).
// Pure functions shared by the static run (`babysitter content`, lib/content-lint.js) and the rendered checks
// (playwright/checks/copy.js, playwright/content.spec.js, the states run's measure()).
//   CT12 a link or button labelled with its own path ("/pricing")                         Parallel 49kc72
//   CT24 a headline that is a near-copy of a sibling product's (~/.claudes-babysitter)     Kindred brypwi
//   CT25 a URL on the brand's name on a host that is not the site's                        Kindred 2b9nt9
//   CT26 a slug shown as a name ("image-synthesis")                                        Compass r7i2dc, ebev0t
//   CT28 one letter case per heading; acronyms keep their case ("Ai" for AI)               Compass 33jce3, 8t3qh1
//   CT29 an e-mail address shown as typed (not uppercased)                                 Compass wee3g3
//   CT30 a catalogue where every item shows 0                                              Compass 4bw126, 3eikk6
//   6.15 every page has its own <title>                                                    Compass bymtup, 853l4n
//   P4   a policy's section numbers and its contents agree                                 Compass 2hxrol
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const q = (s, n = 80) => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const lineAt = (text, idx) => text.slice(0, idx).split("\n").length;

/* ───────── CT12 a label that is a path ───────── */
/** "/pricing", "/become-a-specialist", "Step 2 · /register" — or the label equals the link's own path. */
export function pathLabel(label, href = "") {
  const t = String(label || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const tail = t.split(/\s*[·:—|]\s*/).pop();
  if (/^\/[\w\-/[\]]*$/.test(tail) && tail.length > 1) return tail;
  // an email / phone link labelled with its own address or number is the right label (CT10 asks for mailto links)
  if (/^(mailto|tel):/i.test(String(href).trim())) return null;
  let path = "";
  try { path = new URL(href, "http://x").pathname; } catch {}
  if (path && path !== "/" && tail === path) return tail;
  return null;
}

/* ───────── CT25 a URL on the brand's name, on another host ───────── */
const SECOND = /^(co|com|org|net|gov|ac|edu)$/;
export const registrable = (host) => { const p = String(host || "").toLowerCase().replace(/\.$/, "").split("."); return p.length > 2 && SECOND.test(p[p.length - 2]) ? p.slice(-3).join(".") : p.slice(-2).join("."); };
/** Brand tokens: the product name and content.brandTerms, folded, 4+ letters ("kindred"). */
export function brandTokens(cfg = {}, extra = []) {
  const raw = [cfg.name, ...(cfg.content?.brandTerms || []), ...extra].filter(Boolean).map((x) => String(x).toLowerCase());
  return [...new Set(raw.flatMap((x) => x.split(/[^a-z0-9]+/)).filter((x) => x.length >= 4 && !/^(the|app|site|web|team|labs?|soultosoul)$/.test(x)))];
}
/** Hosts that are the site's own: baseURL, devServer, content.ownDomains (and their registrable domains). */
export function ownHosts(cfg = {}, extra = []) {
  const out = new Set();
  for (const u of [cfg.baseURL, cfg.devServer, ...extra].filter(Boolean)) { try { const h = new URL(u).hostname.toLowerCase(); out.add(h); out.add(registrable(h)); } catch {} }
  for (const d of cfg.content?.ownDomains || []) { out.add(String(d).toLowerCase()); out.add(registrable(String(d))); }
  return out;
}
const URL_RE = /\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+)?(?:\/[^\s"'`<>)\]]*)?/gi;
/** Every URL in `text` whose host carries a brand token as a whole label but is not one of the site's hosts. */
export function foreignBrandUrls(text, { brands = [], own = new Set() } = {}) {
  const out = [];
  if (!brands.length) return out;
  for (const m of String(text || "").matchAll(URL_RE)) {
    const host = m[1].toLowerCase();
    if (own.has(host) || own.has(registrable(host)) || /^(localhost|127\.)/.test(host)) continue;
    const labels = host.split(".");
    const hit = brands.find((b) => labels.slice(0, -1).includes(b));
    if (hit) out.push({ url: m[0].replace(/[.,;:]+$/, ""), host, brand: hit, index: m.index });
  }
  return out;
}
export const ct25Fix = (host) => `point it at this site (the docs' example host is the site's own) — or, if ${registrable(host)} is the product's real domain, list it in babysitter.config.json → content.ownDomains`;

/* ───────── CT26 a slug shown as a name ───────── */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const NOT_SLUG = /^(e-mail|e-mails|co-op|re-?\w+|state-of-the-art|day-to-day|one-to-one|follow-up|sign-in|sign-up|log-in|check-in|check-out|add-on|add-ons|built-in|set-up|opt-in|opt-out|well-known|up-to-date|real-time|long-term|short-term|full-time|part-time)$/;
export const isSlug = (t) => SLUG_RE.test(t) && !NOT_SLUG.test(t) && /[a-z]{3}/.test(t) && !/^\d+(-\d+)+$/.test(t);
export const humanize = (slug) => slug.split("-").map((w) => (w.length <= 2 && /^(ai|ml|ui|ux|qa|3d|2d|seo|api)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
/**
 * Site-wide: pieces of text that are slugs. Hard when the slug's words appear as a name elsewhere on the site
 * ("Image Synthesis" on /tasks) or a page shows 3+ different slugs (a list of them).
 * @param records [{ route, slugs: [{ text, where }], segs: [{ text }] }]
 */
export function slugFindings(records) {
  const out = [];
  const corpus = records.flatMap((r) => (r.segs || []).map((s) => String(s.text || "").toLowerCase()));
  const named = (slug) => { const words = slug.replace(/-/g, " "); return corpus.some((t) => t.includes(words) && !t.includes(slug)); };
  for (const r of records) {
    const slugs = [...new Map((r.slugs || []).filter((s) => isSlug(s.text)).map((s) => [s.text, s])).values()];
    const list = slugs.length >= 3;
    for (const s of slugs) {
      if (!list && !named(s.text)) continue;
      out.push({ id: "CT26", what: `"${s.text}" is a slug shown as a name${list ? ` (${slugs.length} slugs on this page)` : ""} — fix: show its name ("${humanize(s.text)}"), not the identifier [CT26]`, where: `${r.route} ${s.where || ""}`.trim() });
    }
  }
  return out;
}
/** Static: a JSX text child that prints a slug field — {x.slug}, {service.categorySlug}, {item.slug} — not passed through a lookup. */
export function slugJsx(text) {
  const out = [];
  const re = />[^<>{}]*\{\s*([\w$]+(?:\??\.[\w$]+)*\??\.(\w*[sS]lug\w*)|(\w*[sS]lug))\s*\}[^<>{}]*</g;
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, m.index - 200), m.index);
    // <Link href={`/x/${s.slug}`}> … the slug in an href / key is fine; this is a text child
    if (/(?:href|key|value|id|data-[\w-]+)=\{?[^>]*$/.test(before.split("<").pop() || "")) continue;
    out.push({ line: lineAt(text, m.index), expr: m[1] });
  }
  return out;
}

/* ───────── CT12 static: <Link href={x}>{x}</Link>, <a>/pricing</a> ───────── */
export function pathLabelJsx(text) {
  const out = [];
  // 5.6.3: {project.siteUrl} as its own label is the user's URL shown as itself, not a path where a name belongs
  for (const m of text.matchAll(/<(Link|a|NavLink|Button)\b[^>]*?\bhref=\{\s*([\w$.?]+)\s*\}[^>]*>\s*\{\s*\2\s*\}\s*<\/\1>/g)) if (!(/(?:url|uri|domain|website|homepage)$/i.test(m[2].split(/[.?]+/).pop()) && !/href|path|route|slug/i.test(m[2]))) out.push({ line: lineAt(text, m.index), label: `{${m[2]}}` });
  for (const m of text.matchAll(/<(Link|a|NavLink|button|Button)\b[^>]*>\s*(\/[\w\-/]+)\s*<\/\1>/g)) out.push({ line: lineAt(text, m.index), label: m[2] });
  return out;
}

/* ───────── CT28 one letter case per heading; acronyms keep their case ───────── */
const STOP = new Set("a an the and or but nor for so yet of in on at to by with from into onto over under about as than via per vs is are be was were it its your our my their his her this that these those who what when where why how not no".split(" "));
/**
 * A heading mixes Title Case and sentence case: a capitalised word (not the first, not after ":", not a brand or a
 * name) that the site writes in lowercase elsewhere, next to a lowercase content word ("Where Innovation Finds direction").
 * `lower`: the set of words the site writes in lowercase mid-sentence. English pages only.
 */
// "2.", "2)", "2.1", "II.", "A." before a heading: the first word after it is the sentence's first word
const NUMBERING = /^\s*(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)]|\p{Lu}[.)])\s+/u;
export function mixedCase(text, { lower = new Set(), brands = [] } = {}) {
  const words = String(text || "").replace(NUMBERING, "").replace(/[“”"«»()]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  const brand = new Set(brands.map((b) => String(b).toLowerCase()));
  let caps = [], lows = [], afterColon = true;
  for (const raw of words) {
    const w = raw.replace(/[.,;!?]+$/, "");
    const first = afterColon;
    // a new sentence starts after ":", a dash, or the end of a sentence (". ", "! ", "? "): its first word is capitalised
    afterColon = /[:—–.!?…]$/.test(raw) || raw === "—" || raw === "–";
    if (first || !/^\p{L}/u.test(w) || STOP.has(w.toLowerCase()) || w.length < 3) continue;
    if (/^\p{Lu}{2,}$/u.test(w) || /\p{Lu}/u.test(w.slice(1))) continue; // AI, iPhone, PayPal
    if (brand.has(w.toLowerCase())) continue;
    if (/^\p{Lu}/u.test(w)) { if (lower.has(w.toLowerCase())) caps.push(w); }
    else if (/^\p{Ll}/u.test(w)) lows.push(w);
  }
  return caps.length && lows.length ? { caps, lows } : null;
}
/** Words written in lowercase mid-sentence across these texts (the vocabulary mixedCase compares with). */
export function lowercaseVocabulary(texts) {
  const out = new Set();
  for (const t of texts) for (const m of String(t || "").matchAll(/(?<=[\p{L},;] )(\p{Ll}[\p{Ll}'’-]{2,})/gu)) out.add(m[1].toLowerCase());
  return out;
}
/** Acronyms the site writes in capitals (2–4 letters, 2+ times): AI, ML, API, UX … */
export function acronyms(texts) {
  const n = new Map();
  for (const t of texts) for (const m of String(t || "").matchAll(/(?<![\p{L}\d])(\p{Lu}{2,4})(?![\p{L}\d])/gu)) n.set(m[1], (n.get(m[1]) || 0) + 1);
  // a curated list: uppercase headings (text-transform) put every word in capitals, so frequency alone would call
  // "WORK" an acronym
  return new Set([...n].filter(([a, c]) => c >= 1 && /^(AI|ML|API|UX|UI|QA|SEO|SDK|CRM|LLM|NLP|KYC|AML|FAQ|PDF|CSV|SQL|AWS|GPU|ETA|ROI|KPI|SMS|URL|HTML|CSS|JSON|IBAN|SWIFT|VAT)$/.test(a)).map(([a]) => a));
}
/** "Motion Graphics Ai" where the site writes AI: the acronym in Title case. */
export function acronymDrift(text, known) {
  for (const m of String(text || "").matchAll(/(?<![\p{L}\d])(\p{Lu}\p{Ll}{1,3})(?![\p{L}\d])/gu)) {
    const up = m[1].toUpperCase();
    if (known.has(up) && !/^(It|Hr|Pr|Ar|Cv|Us|Am|Pm|Ok|Id|No|So|As|At|Be|By|Do|Go|He|If|In|Is|Me|My|Of|On|Or|To|Up|We)$/.test(m[1])) return { found: m[1], want: up, index: m.index };
  }
  return null;
}

/* ───────── CT30 a catalogue where every item shows 0 ───────── */
/**
 * `groups`: [{ where, items: [text, …] }] — 4+ like items of one list. A unit (currency sign or the word after a number)
 * that every item shows, and every item shows as 0 ("0 profiles", "0 cr / hr", "$0").
 */
export function allZero(groups, { stage = null } = {}) {
  const out = [];
  const units = (t) => {
    const m = new Map();
    const s = String(t || "").replace(/\s+/g, " ");
    for (const x of s.matchAll(/([$€£₼₸₽])\s?(\d[\d,. ]*)/g)) m.set(x[1], Number(x[2].replace(/[ ,]/g, "")) || 0);
    for (const x of s.matchAll(/(?<![\d$€£₼₸₽.,])(\d[\d,.]*)\s?([\p{L}]{2,}(?:\s?\/\s?\p{L}+)?)/gu)) if (!m.has(x[2].toLowerCase())) m.set(x[2].toLowerCase(), Number(x[1].replace(/,/g, "")) || 0);
    return m;
  };
  for (const g of groups) {
    if ((g.items || []).length < 4) continue;
    const maps = g.items.map(units);
    const common = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k)));
    const zero = common.filter((k) => maps.every((m) => m.get(k) === 0));
    if (!zero.length) continue;
    out.push({ id: "CT30", what: `every one of the ${g.items.length} items shows 0 (${zero.map((k) => (/^[$€£₼₸₽]$/.test(k) ? `${k}0` : `0 ${k}`)).join(", ")})${stage === "test" ? " — in testing, approve test entities so the catalogue has values" : ""} — fix: show an empty state ("No specialists yet") instead of a list of zeros, or fill it [CT30]`, where: g.where });
  }
  return out;
}

/* ───────── 6.15 every page has its own <title> ───────── */
/**
 * @param records [{ route, template?, title, brand?: string[] }] one locale. Two pages (not instances of one dynamic
 * route) with the same <title> are hard; a title that is only the brand on a page other than / too.
 */
export function titleFindings(records, { brands = [] } = {}) {
  const out = [];
  const brandSet = new Set([...brands, ...records.flatMap((r) => r.brand || [])].filter(Boolean).map((b) => String(b).trim().toLowerCase()));
  const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const byTitle = new Map();
  for (const r of records) {
    const t = norm(r.title);
    if (!t) { out.push({ id: "6.15", what: `${r.route} has no <title> — fix: give every page a title that names it ("Pricing · Brand") [6.15]`, where: r.route }); continue; }
    const key = t.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(r);
    const root = (r.route.replace(/\/$/, "") || "/") === "/";
    if (!root && brandSet.has(key)) out.push({ id: "6.15", what: `${r.route} is titled only "${t}" (the brand) — fix: name the page ("${pageName(r.route)} · ${t}") [6.15]`, where: r.route });
  }
  for (const [, list] of byTitle) {
    const kinds = [...new Map(list.map((r) => [r.template || r.route, r])).values()];
    if (kinds.length < 2) continue;
    out.push({ id: "6.15", what: `${kinds.length} pages share the title "${norm(list[0].title)}": ${kinds.slice(0, 6).map((r) => r.route).join(", ")}${kinds.length > 6 ? " …" : ""} — fix: give each page its own <title> (tabs, bookmarks and history can not tell them apart) [6.15]`, where: kinds[0].route });
  }
  return out;
}
const pageName = (route) => { const last = String(route).split("/").filter(Boolean).pop() || "Home"; return last.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()); };

/* ───────── P4 numbering and contents ───────── */
const numOf = (t) => { const m = String(t || "").trim().match(/^§?\s*(\d+)(?:\.(\d+))*[.)]?\s+\S/); return m ? Number(m[1]) : null; };
/**
 * @param headings [text] the section headings in page order; @param toc [text] the contents list's items (or []).
 * Top-level numbers run 1, 2, 3 … without a gap or a repeat; the contents list names the same numbers in order.
 */
export function numberingFindings(headings, toc = []) {
  const out = [];
  const top = headings.map((t) => ({ t, n: numOf(t) })).filter((x) => x.n !== null && !/^\s*\d+\.\d+/.test(x.t));
  if (top.length >= 3) {
    for (let i = 1; i < top.length; i++) {
      const a = top[i - 1].n, b = top[i].n;
      if (b === a) out.push({ id: "P4", what: `section number ${b} is used twice ("${q(top[i - 1].t, 40)}", "${q(top[i].t, 40)}") — fix: number the sections 1, 2, 3 … once each [P4]` });
      else if (b !== a + 1) out.push({ id: "P4", what: `the sections jump from ${a} to ${b} ("${q(top[i - 1].t, 40)}" → "${q(top[i].t, 40)}") — fix: renumber them without a gap [P4]` });
    }
  }
  const tocNums = toc.map(numOf).filter((n) => n !== null);
  if (tocNums.length >= 3 && top.length >= 3) {
    const want = top.map((x) => x.n);
    const missing = want.filter((n) => !tocNums.includes(n)), extra = tocNums.filter((n) => !want.includes(n));
    const order = tocNums.join(",") !== want.filter((n) => tocNums.includes(n)).join(",");
    if (missing.length || extra.length) {
      const gap = missing.length ? `the contents skip ${missing.map((n) => `${n}. ${q(top.find((x) => x.n === n).t.replace(/^\s*\d+[.)]?\s*/, ""), 30)}`).join(", ")}` : "";
      out.push({ id: "P4", what: `${gap}${gap && extra.length ? "; " : ""}${extra.length ? `the contents list ${extra.join(", ")}, which the document does not have` : ""} — fix: list every numbered section in the contents, with the same numbers [P4]` });
    } else if (order) out.push({ id: "P4", what: "the contents list the sections in another order than the document — fix: one order [P4]" });
  }
  return out;
}

/* ───────── CT24 a near-copy of a sibling product's headline ───────── */
export const COPY_REGISTRY = join(homedir(), ".claudes-babysitter", "copy.json");
const stem = (w) => w.replace(/(ments?|ings?|ed|es|s|ly)$/i, "").replace(/(.)\1$/, "$1");
const tokens = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).map(stem);
/** Word edit distance (Levenshtein over stemmed tokens). */
function wordDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const GENERIC = /^(pricing|prices|contact( us)?|about( us)?|terms( of (service|use))?|privacy( policy)?|cookie policy|refund policy|payment policy|cancellation policy|faq|help|sign (in|up)|log ?in|register|dashboard|settings|blog|careers|how it works|features|docs|documentation|security|changelog|status|support)$/i;
/**
 * A page hero usually prints the product's name above the page's own name, so the h1 reads
 * "Relaygpu Terms of Service". The brand is not the headline: without taking it off, the generic
 * page names stop being recognised and every sibling's legal page reads as a copy of every other
 * one's — which is what they are called, not a template anyone chose. (relaygpu, 2026-10: ten
 * CT24 findings, all of them "Terms of Service".)
 */
const unbrand = (text, brand) => {
  const t = String(text || "").trim();
  if (!brand) return t;
  const b = String(brand).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return t.replace(new RegExp(`^${b}[\\s:·.,\u2013\u2014-]+`, "i"), "").trim();
};
/**
 * `mine`: [{ route, text }] this product's <h1>s; `registry`: { product: { route: text } }. Hard when another product's
 * h1 (3+ words, not a generic page name) is within one stemmed word of this one's ("Investment in Excellence" vs
 * "Invest in Excellence").
 */
export function nearCopies(mine, registry, self) {
  const out = [];
  for (const m of mine) {
    const bare = unbrand(m.text, self);
    const a = tokens(bare);
    if (a.length < 3 || GENERIC.test(bare)) continue;
    for (const [product, pages] of Object.entries(registry || {})) {
      if (!product || product === self) continue;
      for (const [route, text] of Object.entries(pages || {})) {
        const bareB = unbrand(text, product);
        if (GENERIC.test(bareB)) continue;
        const b = tokens(bareB);
        if (b.length < 3 || Math.abs(a.length - b.length) > 1) continue;
        if (wordDistance(a, b) <= 1) {
          out.push({ id: "CT24", what: `the h1 "${q(m.text, 60)}" is a near-copy of ${product}'s "${q(text, 60)}" (${route}) — fix: write this product's own headline; sibling products must not read as one template [CT24]`, where: m.route });
          break;
        }
      }
    }
  }
  return out;
}
export function readCopyRegistry(file = process.env.BABYSITTER_COPY_REGISTRY || COPY_REGISTRY) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}; } catch { return {}; }
}
/** Records this product's public h1s (by route) in the registry, under `self`. */
export function recordCopy(self, mine, file = process.env.BABYSITTER_COPY_REGISTRY || COPY_REGISTRY) {
  if (!self) return;
  const reg = readCopyRegistry(file);
  reg[self] = Object.fromEntries(mine.filter((m) => m.text).map((m) => [m.route, m.text]));
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(reg, null, 2) + "\n"); } catch {}
}
