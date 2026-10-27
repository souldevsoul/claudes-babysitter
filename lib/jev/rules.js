// Text rules asked of Jev on the rendered copy: the vendored rule catalog (rules/jev/catalog.json) and the babysitter's
// own copy rules as questions (rules/jev/copy-rules.json). Each page is classified (what kind of page it is), each rule
// that applies to its kind is asked over its numbered lines, a rule that fires is located (which lines) and each line is
// verified on its own (a choice's probabilities are relative; a line's own noul is absolute). Site rules read a summary
// of the whole site; pair rules two pages side by side.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { noul, choice, pYes } from "./client.js";
import { numbered, pageKey } from "./pages.js";
import { documentNamesIn } from "../content-consistency.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** The rules to ask: generic always; profile "house" with jev.profile: "house"; facts rules only with facts. */
export function loadRules({ profile = "generic", facts = false, pick = [], skip = [], ctSkip = [] } = {}) {
  const read = (f) => JSON.parse(readFileSync(join(TOOL, "rules/jev", f), "utf8")).rules;
  const all = [...read("copy-rules.json"), ...read("catalog.json")];
  const picked = (r) => !pick.length || pick.some((p) => (p.endsWith("*") ? r.id.startsWith(p.slice(0, -1)) : r.id === p));
  // a Jev question that mirrors a copy rule switched off in content.skip is still asked: the recall net reports a
  // confident disagreement ("switched off, Jev disagrees"); jev.skip switches a Jev question off for good
  return all.filter((r) => (!r.profile || r.profile === profile) && (!r.facts || facts) && picked(r) && !skip.includes(r.id)
    && r.id !== "f/pair-contradiction") // the consistency engine does this, per topic
    .map((r) => (r.ct && ctSkip.includes(r.ct) ? { ...r, ctSkipped: true } : r));
}

export const PAGE_TYPES = {
  home: "the homepage", pricing: "prices, credits, top-up", faq: "questions and answers", "legal-terms": "terms of service / terms and conditions",
  "legal-privacy": "privacy policy", "legal-cookies": "cookie policy", "legal-refund": "refund policy", "legal-payment": "payment policy",
  "legal-aml": "AML / KYC policy", "legal-other": "another legal document (cancellation, acceptable use, specialist or contractor terms, GDPR)",
  auth: "sign in, sign up, forgot or reset password", "contact-support": "contact or support page", about: "about the company", careers: "jobs and careers",
  "experts-or-specialists": "specialists, experts, freelancers: listing, profiles, applying to become one", "product-feature": "a product, feature, solution or how-it-works page, or a signed-in app screen",
  "blog-docs": "blog, docs, guides, changelog", any: "none of these",
};

export async function classify(J, pages) {
  for (let i = 0; i < pages.length; i += 40) {
    const g = pages.slice(i, i + 40);
    const state = { PAGES: g.map((p) => ({ url: p.route, title: p.title, h1: p.h1, start: (p.body || p.lines).slice(0, 6).map((l) => l.text).join(" | ").slice(0, 300) })) };
    const a = await J.ask(state, Object.fromEntries(g.map((p, k) => [`p${k}`, choice(`What kind of page is the page at URL "${p.route}" (title "${p.title}")?`, PAGE_TYPES)])));
    g.forEach((p, k) => { p.type = a[`p${k}`]?.choice || "any"; });
  }
}

const FLAG_Q = {
  ai_output: "Does the product in FACTS generate AI output (text, images, answers) for the customer?",
  specialists: "Does the product in FACTS let customers hire or work with human specialists, experts or freelancers?",
  payouts: "Does the product in FACTS pay money out to users or specialists?",
  advice_domain: "Does the product in FACTS give legal, tax, medical, financial or immigration output?",
  physical_product: "Does the product in FACTS sell something eaten, drunk or applied to the body?",
};
export async function productFlags(J, facts) {
  if (!facts) return {};
  const a = await J.ask({ FACTS: facts }, Object.fromEntries(Object.entries(FLAG_Q).map(([k, q]) => [k, noul(q)])));
  return Object.fromEntries(Object.keys(FLAG_Q).map((k) => [k, pYes(a[k]) >= 0.5]));
}

const applies = (r, p, flags) => (r.pageTypes.includes("any") || r.pageTypes.includes(p.type)) && !(r.notTypes || []).includes(p.type) && (!r.requires || flags[r.requires])
  && (!r.match || new RegExp(r.match, "i").test(`${p.route} ${p.title} ${p.h1}`)) && (r.needs !== "repeated" || p.repeated?.length);
const ABSENCE = /\b(lack|fail to|fails to|no way|missing|without a visible)\b/i;
const perLine = (q, id) => q.replace(/\bany (button, link or call-to-action )?line in LINES\b/i, `line ${id}`).replace(/\bany line\b/i, `line ${id}`).replace(/\bany section heading in LINES\b/i, `line ${id}`);

export const READING = "LINES are the visible text of one web page, one numbered line per block: '## ' marks a heading, '[button] ' a button, '[link] ' a navigation link, '• ' a list item; {x} stands for code shown on the page (not judged). Lines of a collapsed section (an FAQ answer) or a dialog are included. Judge only what the lines say.";
/** Line and page rules on one page. @returns [{ rule, p, page, lines: [{ id, text, section }] }] */
export async function checkPage(J, page, rules, { context, facts, flags = {}, min = 0.5, chunk = 30000 } = {}) {
  const use = rules.filter((r) => (r.scope === "line" || r.scope === "page") && applies(r, page, flags));
  if (!use.length) return { flags: [], unread: false };
  const lines = numbered(page.body || page.lines);
  const chunks = [];
  let cur = [], n = 0;
  for (const l of lines) { if (cur.length && (n + l.text.length > chunk || cur.length >= 250)) { chunks.push(cur); cur = []; n = 0; } cur.push(l); n += l.text.length + 8; }
  if (cur.length) chunks.push(cur);
  const out = [];
  let unread = false;
  for (const [ci, ch] of chunks.entries()) {
    const rs = use.filter((r) => r.scope === "line" || ci === 0);
    const state = { STANDARD: context || undefined, FACTS: facts || undefined, HOW_TO_READ: READING,
      PAGE: { url: page.route, type: page.type, title: page.title, signedIn: !!page.auth, locale: page.locale || undefined, part: chunks.length > 1 ? `${ci + 1} of ${chunks.length}` : undefined },
      REPEATED_LINES: page.repeated?.length ? page.repeated : undefined, LINES: ch.map((l) => l.line).join("\n") };
    const a = await J.ask(state, Object.fromEntries(rs.map((r) => [r.id, noul(r.question)])));
    if (rs.some((r) => !a[r.id])) unread = true;
    const hits = rs.filter((r) => pYes(a[r.id]) >= Math.min(min, 0.35));
    const locatable = hits.filter((r) => r.scope === "line" || !ABSENCE.test(r.question));
    const where = {};
    if (locatable.length && ch.length) {
      const ids = Object.fromEntries(ch.map((l) => [l.id, null]));
      const b = await J.ask(state, Object.fromEntries(locatable.map((r) => [r.id, choice(`Which line in LINES is the clearest instance of the problem in this question: "${r.question}"`, ids)])));
      for (const r of locatable) {
        const pr = Object.entries(b[r.id]?.probabilities || {}).sort((x, y) => y[1] - x[1]);
        where[r.id] = pr.filter(([, v], i) => i === 0 || v >= 0.02).slice(0, 5).map(([id, v]) => { const l = ch.find((x) => x.id === id); return { id, text: l?.text || "", section: l?.ref.section || "", choiceP: +v.toFixed(2) }; });
      }
    }
    // a line rule's candidate lines are each verified on their own
    const qs = {};
    for (const r of hits.filter((x) => x.scope === "line")) for (const l of where[r.id] || []) qs[`${r.id}@${l.id}`] = noul(`${perLine(r.question, l.id)} Judge line ${l.id} only.`);
    const v = Object.keys(qs).length ? await J.ask(state, qs) : {};
    for (const r of hits) {
      if (r.scope === "line") for (const l of where[r.id] || []) { const p = pYes(v[`${r.id}@${l.id}`]); if (p >= min) out.push({ rule: r.id, ct: r.ct, ctSkipped: !!r.ctSkipped, min: r.min, p: +p.toFixed(3), pageP: +pYes(a[r.id]).toFixed(3), page, lines: [l] }); }
      else if (pYes(a[r.id]) >= min) out.push({ rule: r.id, ct: r.ct, ctSkipped: !!r.ctSkipped, min: r.min, p: +pYes(a[r.id]).toFixed(3), page, lines: (where[r.id] || []).slice(0, 2) });
    }
  }
  return { flags: out, unread };
}

/** The site seen as a whole, for site rules. */
export function siteSummary(pages, status = {}) {
  const pub = pages.filter((p) => !p.auth && !p.chrome);
  const home = pub.find((p) => p.route === "/") || pub[0] || { links: [], lines: [] };
  const titleOf = Object.fromEntries(pages.map((p) => [p.route, p.h1 || p.title]));
  const names = {};
  for (const p of pub) for (const l of p.links || []) if (l.label && l.label.length < 60) (names[l.path] ||= new Set()).add(l.label);
  const legal = pub.filter((p) => String(p.type || "").startsWith("legal"));
  const dateRe = /(last updated|last-updated|effective|updated)[:\s]*([^|]{0,40}?\d{4})/i;
  const mentions = new Map();
  for (const p of pages) for (const l of p.lines) for (const m of documentNamesIn(l.text, p.locale || "en")) if (!mentions.has(m)) mentions.set(m, p.route);
  return {
    PAGES: pages.filter((p) => !p.chrome).map((p) => `${p.route} — ${p.h1 || p.title} (${p.type || "?"}${p.auth ? ", signed in" : ""})`),
    NAV_LINKS: (home.links || []).filter((l) => l.region === "nav" && l.label).map((l) => `${l.label} → ${l.path}`),
    FOOTER_LINES: home.lines.filter((l) => l.region === "footer").map((l) => l.text),
    FOOTER_LINKS: (home.links || []).filter((l) => l.region === "footer" && l.label).map((l) => `${l.label} → ${l.path}`),
    LINK_NAMES: Object.entries(names).filter(([, s]) => s.size > 1).map(([h, s]) => `${h} (${titleOf[h] || "?"}): ${[...s].map((x) => `'${x}'`).join(" | ")}`),
    LEGAL_DATES: legal.map((p) => `${p.route}: ${p.lines.map((l) => l.text.match(dateRe)?.[2]).find(Boolean) || "no date found"}`),
    LEGAL_STRUCTURE: legal.map((p) => { const hs = p.lines.filter((l) => l.kind === "heading").map((l) => l.text); return `${p.route}: title '${p.h1}', ${hs.length} headings, first '${hs[1] || ""}', last '${hs.at(-1) || ""}'`; }),
    COOKIE_POLICY_LINES: (pub.find((p) => p.type === "legal-cookies")?.lines || []).map((l) => l.text).filter((l) => /manage|settings|preferences|withdraw|change/i.test(l)).slice(0, 12),
    BLOG_POSTS: pub.filter((p) => /^\/(blog|journal|academy|articles)\/./.test(p.route)).length,
    CONTROL_LABELS: (() => { const m = new Map(); for (const p of pages) for (const c of [...(p.controls || []).map((x) => x.label), ...p.lines.filter((l) => l.kind === "button" || l.kind === "nav").map((l) => l.text)]) { if (!c || c.length > 40) continue; if (!m.has(c)) m.set(c, new Set()); m.get(c).add(p.route); } return [...m].slice(0, 200).map(([l, r]) => `'${l}' (${[...r].slice(0, 3).join(", ")}${r.size > 3 ? ` +${r.size - 3}` : ""})`); })(),
    DOCUMENT_MENTIONS: [...mentions].slice(0, 80).map(([m, r]) => `'${m}' (on ${r})`),
    DEAD_LINKS: Object.entries(status).filter(([, s]) => s >= 400 || s === 0).map(([p, s]) => `${p}: ${s}`),
  };
}

export async function siteRules(J, pages, rules, { context, facts, flags = {}, min = 0.5, status = {} } = {}) {
  const S = siteSummary(pages, status);
  const rs = rules.filter((r) => r.scope === "site" && (!r.requires || flags[r.requires]) && !r.withPages);
  if (!rs.length) return { flags: [], summary: S };
  const a = await J.ask({ STANDARD: context || undefined, FACTS: facts || undefined, ...S }, Object.fromEntries(rs.map((r) => [r.id, noul(r.question)])));
  return { flags: rs.filter((r) => pYes(a[r.id]) >= min).map((r) => ({ rule: r.id, ct: r.ct, p: +pYes(a[r.id]).toFixed(3), page: { route: "(site)", key: "(site)" }, lines: [] })), summary: S };
}

/** Pair rules between page types (pricing vs payment policy, FAQ vs policy …). */
export async function pairRules(J, pages, rules, { context, facts, flags = {}, min = 0.5 } = {}) {
  const jobs = [];
  for (const r of rules.filter((x) => x.scope === "pair" && (!x.requires || flags[x.requires]))) {
    if (r.pair === "overlap") continue; // duplicate pages: left to the consistency engine's topics
    for (const A of pages.filter((p) => r.pair[0].includes(p.type))) for (const B of pages.filter((p) => r.pair[1].includes(p.type) && p !== A)) jobs.push([r, A, B]);
  }
  const res = await J.pool(jobs.slice(0, 40), async ([r, A, B]) => {
    const L = (p, pre) => numbered(p.body || p.lines, pre).slice(0, 220);
    const la = L(A, "A"), lb = L(B, "B");
    const state = { STANDARD: context || undefined, FACTS: facts || undefined, PAGE_A: { url: A.route, lines: la.map((l) => l.line).join("\n") }, PAGE_B: { url: B.route, lines: lb.map((l) => l.line).join("\n") } };
    const a = await J.ask(state, { q: noul(r.question) });
    const p = pYes(a.q);
    if (p < min) return null;
    const loc = await J.ask(state, { a: choice(`Which line of PAGE_A is most involved in this problem: "${r.question}"`, Object.fromEntries(la.map((l) => [l.id, null]))), b: choice(`Which line of PAGE_B is most involved in this problem: "${r.question}"`, Object.fromEntries(lb.map((l) => [l.id, null]))) });
    const t = (arr, x) => arr.find((l) => l.id === x?.choice);
    const la1 = t(la, loc.a), lb1 = t(lb, loc.b);
    return { rule: r.id, p: +p.toFixed(3), page: A, lines: la1 ? [{ id: la1.id, text: la1.text, section: la1.ref.section }] : [], other: lb1 ? { page: B, text: lb1.text, section: lb1.ref.section } : { page: B, text: "" } };
  });
  return res.filter(Boolean);
}

export { pageKey };
