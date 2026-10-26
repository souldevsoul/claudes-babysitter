// The Jev half of the text pass: page models in, findings out (babysitter findings.json entries), plus the term map.
// The deterministic half (CT rules on the same collected copy) is playwright/text-collect.js + bin/text-pass.mjs.
//
// Agreement: a deterministic hit stays the hard finding. A Jev question that mirrors a CT rule (`ct`) and fires on a
// line the deterministic rule already reported adds "Jev agrees" to it instead of a second finding. A Jev-only hit
// ≥ jev.min (default 0.7) is a finding marked "Jev"; 0.5 ≤ p < jev.min is listed as "unsure, check by hand" and never
// fails the run. A contradiction between two statements ≥ 0.8 is hard (it fails like a deterministic finding).
import { splitChrome, pageKey } from "./pages.js";
import { loadRules, classify, productFlags, checkPage, siteRules, pairRules } from "./rules.js";
import { consistency, describe } from "./consistency.js";

export const DEFAULTS = { min: 0.7, unsure: 0.5, hard: 0.8, budgetUsd: 2, concurrency: 4, deadlineMin: 30 };
export function jevConfig(cfg = {}) {
  const j = cfg.jev || {};
  return { ...DEFAULTS, enabled: j.enabled !== false, min: Number(j.min ?? DEFAULTS.min), budgetUsd: Number(j.budget ?? j.budgetUsd ?? DEFAULTS.budgetUsd),
    concurrency: Number(j.concurrency ?? DEFAULTS.concurrency), deadlineMin: Number(j.deadline ?? DEFAULTS.deadlineMin), facts: j.facts || null, context: j.context || null,
    profile: j.profile || "generic", skip: j.skip || [], triage: j.triage !== false, recall: j.recall !== false, hard: Number(j.hard ?? DEFAULTS.hard) };
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Does a deterministic finding on this page already report this line? */
function agrees(det, key, text) {
  const t = norm(text);
  if (!t) return null;
  return det.find((d) => d.key === key && (t.includes(norm(d.quote || "").slice(0, 40)) || norm(d.what).includes(t.slice(0, 40)))) || null;
}

/**
 * @param {object} J Jev client (lib/jev/client.js makeJev)
 * @param {object[]} pages page models (playwright/text-collect.js readPage → model)
 * @param {{ cfg?: object, facts?: string|null, context?: string|null, det?: object[], notReached?: string[], status?: object, log?: Function }} o
 */
export async function jevTextPass(J, pages, { cfg = {}, facts = null, context = null, det = [], notReached = [], status = {}, log = () => {} } = {}) {
  const jc = jevConfig(cfg);
  const t0 = Date.now();
  const { chromePage } = splitChrome(pages);
  for (const p of pages) {
    const c = new Map();
    for (const l of p.body) c.set(l.text, (c.get(l.text) || 0) + 1);
    p.repeated = [...c].filter(([l, n]) => n >= 3 && l.length >= 15).map(([l, n]) => `${l} (×${n})`);
  }
  const rules = loadRules({ profile: jc.profile, facts: !!facts, skip: [...jc.skip, ...((cfg.content?.skip) || [])] });
  await classify(J, pages);
  if (chromePage) chromePage.type = "any";
  const flags = await productFlags(J, facts);
  log(`Jev: ${pages.length} page(s) classified, ${rules.length} rules`);
  const toCheck = chromePage ? [chromePage, ...pages] : pages;
  const unread = [];
  const ruleFlags = (await J.pool(toCheck, async (p) => { const r = await checkPage(J, p, rules, { context, facts, flags, min: jc.unsure }); if (r.unread) unread.push(pageKey(p)); return r.flags; })).flat();
  const site = await siteRules(J, pages, rules, { context, facts, flags, min: jc.unsure, status });
  const pairs = await pairRules(J, pages, rules, { context, facts, flags, min: jc.unsure });
  log(`Jev: rules done (${ruleFlags.length + site.flags.length + pairs.length} candidate(s)); consistency engine…`);
  const eng = await consistency(J, pages, { chromePage, min: jc.unsure, cfg, notReached });
  const findings = [];
  const add = (f) => findings.push(f);
  // one finding per flagged line: every rule that points at the same line is merged into it (the strongest names it)
  const byLine = new Map();
  for (const f of ruleFlags) {
    const l = f.lines[0] || {};
    if (f.lines.length && String(l.text || "").replace(/[^\p{L}\p{N}]/gu, "").length < 10) continue; // "4", "auth · 00": a fragment, not a sentence
    const k = `${pageKey(f.page)}|${l.text || f.rule}`;
    const m = byLine.get(k);
    const pass = f.p >= (f.min ?? 0);
    const adj = pass ? f.p : Math.min(f.p, jc.min - 0.01); // below its own threshold: at most "unsure"
    if (!m || adj > m.adj) byLine.set(k, { ...f, adj, rules: [...new Set([f.rule, ...(m?.rules || [])])], ct: f.ct || m?.ct });
    else m.rules.push(f.rule);
  }
  for (const f of byLine.values()) {
    const l = f.lines[0] || {};
    const key = pageKey(f.page);
    const same = f.ct ? agrees(det, key, l.text) : null;
    const also = [...new Set(f.rules)].filter((r) => r !== f.rule);
    add({ rule: f.rule, also, ct: f.ct || null, p: +f.adj.toFixed(3), page: f.page, key, quote: l.text || "", section: l.section || "", agreesWith: same ? same.id : null, what: `${f.rule}${also.length ? ` (also ${also.join(", ")})` : ""}: ${l.text ? `"${l.text.slice(0, 220)}"` : "(this page as a whole)"}` });
  }
  for (const f of site.flags) add({ rule: f.rule, ct: f.ct || null, p: f.p, page: null, key: "(site)", quote: "", section: "", what: `${f.rule}: the site as a whole` });
  for (const f of pairs) add({ rule: f.rule, p: f.p, page: f.page, key: pageKey(f.page), quote: f.lines[0]?.text || "", section: f.lines[0]?.section || "", other: { key: pageKey(f.other.page), route: f.other.page.route, quote: f.other.text, section: f.other.section }, what: `${f.rule}: "${(f.lines[0]?.text || "").slice(0, 160)}" ⟷ "${(f.other.text || "").slice(0, 160)}" (${pageKey(f.other.page)})` });
  for (const f of eng.findings) {
    const d = describe(f);
    const page = f.claim?.page || null;
    add({ rule: f.rule, p: f.p, page, key: page ? pageKey(page) : "(site)", quote: d.quote || "", section: f.claim?.section || "", topic: f.topic || null, other: d.other ? { key: f.other.key, route: d.other.route, quote: d.other.quote, section: f.other.section } : null,
      canonical: d.canonical || null, pages: f.pages || null, conflict: f.conflict, what: d.what });
  }
  // one entry per rule × quoted line; the highest probability wins
  const uniq = new Map();
  for (const f of findings) { const k = `${f.rule}|${f.key}|${norm(f.quote).slice(0, 80)}|${norm(f.other?.quote).slice(0, 80)}`; if (!uniq.has(k) || uniq.get(k).p < f.p) uniq.set(k, f); }
  const list = [...uniq.values()].map((f) => ({ ...f, level: level(f, jc) }));
  const claims = eng.claims.map((c) => ({ id: c.id, key: c.key, route: c.route, section: c.section, text: c.text, topics: c.topics || [], scores: c.scores || {} }));
  return { findings: list, terms: eng.terms, claims, stats: { ...J.stats, claims: eng.stats.claims, termPairs: eng.stats.termPairs, rules: rules.length, pages: pages.length, unread, ms: Date.now() - t0 } };
}

/** hard (fails the run) | jev (a finding marked Jev) | unsure (check by hand) | agrees (folded into a deterministic hit) */
export function level(f, jc = DEFAULTS) {
  if (f.agreesWith) return "agrees";
  if ((f.rule === "consistency/contradiction" || f.rule === "consistency/one-page") && (f.conflict ?? f.p) >= jc.hard) return "hard";
  if (f.p >= jc.min) return "jev";
  if (f.p >= jc.unsure) return "unsure";
  return "below";
}

/** Jev findings → findings.json entries (suite "text"). */
export function toFindings(list) {
  return list.filter((f) => f.level === "hard" || f.level === "jev").map((f) => ({
    suite: "text", route: f.page?.route || null, role: f.page?.auth ? f.page.role || "user" : null, auth: !!f.page?.auth, locale: f.page?.locale || null,
    test: `${f.rule} (Jev ${f.p.toFixed(2)})`, project: "text", file: "text-pass", status: "failed", rule: f.rule, jev: { p: f.p, level: f.level, topic: f.topic || null, quote: f.quote, section: f.section, other: f.other || null, canonical: f.canonical || null },
    items: [{ what: `${f.what} [${f.rule}]`, where: `${f.key}${f.section ? ` › ${f.section}` : ""}` }], error: f.what,
  }));
}
