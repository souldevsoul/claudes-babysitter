// The consistency engine: does the site say the same thing the same way everywhere?
//
// 1. Claims. Every sentence of every page (all locales and roles, legal pages, FAQ, pricing, signed-in pages; the site
//    chrome once) that states something — a number, an amount, a duration, a rule, a promise, what exists, what is kept
//    or deleted, who does what — is a claim. Jev assigns each claim a topic (a `choice` over TOPICS; a claim can sit in
//    two topics when Jev is unsure between them).
// 2. Compare. Per topic, all the site's claims about it are put in front of Jev at once: for each claim, "does it
//    contradict another claim here?" and "does it name a thing differently than another claim does?" (noul), then
//    "which claim?" (choice). Two claims on one page are `consistency/one-page`; on two pages
//    `consistency/contradiction` (hard from 0.8) or `consistency/different-words`.
// 3. Promises. A claim on a document page (legal, FAQ, help) that promises a control ("delete it on the run page",
//    "Settings → Export") is checked against the controls, headings and links of the signed-in pages the run read:
//    `consistency/promise-without-feature`.
// 4. Terms. Names that share a head word ("API key" / "deployment key", "routing fee" / "orchestration fee",
//    "close account" / "delete account") are candidate pairs; Jev decides "the same thing here?" from a sentence of
//    each. Clusters → .babysitter/terms.json, the majority term, every deviation (`consistency/term`).
//    babysitter.config.json → content.terms: { "canonical": { "API key": ["deployment key"] }, "distinct": [["pitch
//    specialist", "reviewer"]] } pins the term and keeps names that are different things apart.
import { noul, choice, pYes } from "./client.js";
import { sentences, pageKey } from "./pages.js";

export const TOPICS = {
  price: "prices and rates of the product, plans and tiers",
  limits: "minimum and maximum amounts, top-up ranges, size, length or count limits",
  fees: "fees, multipliers, surcharges, minimum charges, what is free",
  currency: "currencies, exchange rates, the currency a balance is kept in",
  billing: "how and when usage is charged, metered or debited; when billing starts and stops",
  balance: "the balance needed to start, what happens at zero, auto-stop, credit expiry, which credit is spent first",
  refund: "refunds and credits returned, outages and failures",
  cancellation: "cancelling, subscriptions, recurring charges, renewals, ending a plan",
  closure: "closing or deleting the account and what is erased or kept",
  "data-collected": "which personal data is collected",
  "data-storage": "where files and data go, what is uploaded, stored or kept and for how long",
  "deletion-controls": "how a user deletes files, runs, items or data; which controls exist for it",
  availability: "which features, models, options or plans exist or are available, and how many of them",
  inputs: "accepted file formats, input requirements and how inputs are checked",
  eligibility: "who may use the service: countries, age, individuals or organisations",
  contact: "contact channels, support, response times",
  notifications: "emails, notifications and alerts the product sends",
  "payments-security": "card data handling, the payment path, security claims",
  "acceptable-use": "prohibited uses and enforcement",
  naming: "what something is called: a key, fee, plan, page, button, document or role",
  other: "none of these",
};

const CLAIMY = /\d|[€$£¥₽₸]|\b(no|not|never|always|only|every|each|all|any|free|minimum|maximum|limit|charge|charged|bill|billed|billing|refund|cancel|renew|subscription|recurring|delete|deleted|erase|close|store|stored|kept|keep|retain|upload|uploaded|leave|leaves|download|export|collect|share|email|contact|support|phone|country|countries|available|open|include|included|format|file|size|require|required|need|needs|must|can|cannot|will|within|per|until|after|before|when|credit|balance|fee|price|cost|rate|plan|tier|key|account|data|card|payment|pay)\b/i;

/** Claims: sentences of the pages that state something. */
export function claimsOf(pages, { chromePage = null, maxPerPage = 400 } = {}) {
  const out = [];
  const all = chromePage ? [chromePage, ...pages] : pages;
  for (const p of all) {
    let n = 0;
    for (const l of p.body || p.lines) {
      if (l.kind === "heading" && l.text.length < 60) continue;
      const parts = l.text.length > 40 ? sentences(l.text) : [l.text];
      for (const s of parts) {
        if (s.length < 18 || s.length > 600 || !CLAIMY.test(s)) continue;
        if (n++ >= maxPerPage) break;
        out.push({ id: `S${String(out.length).padStart(4, "0")}`, text: s, page: p, route: p.route, key: pageKey(p), section: l.section || "", region: l.region || "main", kind: l.kind });
      }
    }
  }
  return out;
}

const where = (c) => `${c.key}${c.section ? ` › ${c.section}` : ""}`;
const show = (c) => `${c.id}| (${where(c)}) ${c.text}`;

/** Topic of each claim (≤ 2 per claim). */
export async function assignTopics(J, claims, { group = 60 } = {}) {
  const groups = [];
  for (let i = 0; i < claims.length; i += group) groups.push(claims.slice(i, i + group));
  await J.pool(groups, async (g) => {
    const a = await J.ask({ STATEMENTS: g.map(show).join("\n") }, Object.fromEntries(g.map((c) => [c.id, choice(`What is statement ${c.id} in STATEMENTS mainly about?`, TOPICS)])));
    for (const c of g) {
      const pr = Object.entries(a[c.id]?.probabilities || {}).sort((x, y) => y[1] - x[1]);
      // every claim gets a topic (the best one that is not "other"), and a second one when Jev hesitates between two
      const named = pr.filter(([t]) => t !== "other");
      c.topics = named.filter(([, p], i) => i === 0 || p >= 0.25).slice(0, 2).map(([t]) => t);
      if (!a[c.id]) c.unread = true;
    }
  });
}

/**
 * Contradictions and different wording within each topic. @returns findings
 * { rule, p, quote, route, key, section, other: { quote, route, key, section }, topic }
 */
export async function compareTopics(J, claims, { chunk = 70 } = {}) {
  const byTopic = new Map();
  for (const c of claims) for (const t of c.topics || []) { if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(c); }
  const jobs = [];
  for (const [t, list] of byTopic) {
    if (list.length < 2) continue;
    // a topic with more claims than fit one question is read in overlapping windows, sorted by page
    const sorted = list.slice().sort((a, b) => a.key.localeCompare(b.key));
    if (sorted.length <= chunk) jobs.push([t, sorted]);
    else for (let i = 0; i < sorted.length; i += Math.floor(chunk / 2)) { jobs.push([t, sorted.slice(i, i + chunk)]); if (i + chunk >= sorted.length) break; }
  }
  const out = [];
  await J.pool(jobs, async ([topic, list]) => {
    const state = { TOPIC: TOPICS[topic], STATEMENTS: list.map(show).join("\n"), NOTE: "Each statement is quoted with the page and section it is on." };
    // each claim's partner: the other claim about the very same point (the verdict comes after, pair by pair)
    const ids = Object.fromEntries([...list.map((c) => [c.id, null]), ["none", "no other statement is about the same specific point"]]);
    const a = await J.ask(state, Object.fromEntries(list.map((c) => [c.id, choice(`Which other statement in STATEMENTS makes a claim about the same specific point as ${c.id} (the same fee, price, limit, rule, condition, process, data, control, count or name), so that the two could agree or disagree? Not ${c.id} itself; "none" if no other statement is about that point.`, ids)])));
    for (const c of list) {
      const pr = Object.entries(a[c.id]?.probabilities || {}).filter(([id]) => id !== c.id).sort((x, y) => y[1] - x[1]);
      (c.scores ||= {})[topic] = pr.slice(0, 2).map(([id, p]) => `${id}:${p.toFixed(2)}`).join(" ");
      for (const [id, p] of pr.slice(0, 2)) {
        if (id === "none" || p < 0.2) continue;
        const o = list.find((x) => x.id === id);
        if (o && o.text !== c.text) out.push({ rule: "consistency/candidate", p: 0, topic, claim: c, other: o, otherP: +p.toFixed(3) });
      }
    }
  });
  // one candidate per unordered pair
  const seen = new Map();
  for (const f of out.sort((x, y) => y.otherP - x.otherP)) { const k = [f.claim.id, f.other.id].sort().join("|"); if (!seen.has(k)) seen.set(k, f); }
  return [...seen.values()];
}

const DOC_PAGE = /terms|privacy|polic|cookie|refund|cancel|payment|legal|aml|kyc|acceptable|faq|help|docs?|security|about|how-it-works|features|pricing/i;
const PROMISE = /\b(you can|you may|lets you|allows you|use the|click|press|tap|go to|open|from your|in your|on the|button|control|settings|dashboard|page|tab|menu|link|download|export|delete|remove|cancel|close|turn off|switch|change|edit|manage)\b|→/i;

/** Promises of a control on document pages, against the signed-in pages' controls and headings. */
export async function promiseCheck(J, claims, pages, { min = 0.5, notReached = [] } = {}) {
  const app = pages.filter((p) => p.auth);
  if (!app.length) return [];
  const inventory = app.map((p) => `${p.route}: headings ${[...new Set(p.lines.filter((l) => l.kind === "heading").map((l) => l.text))].slice(0, 25).join(" | ")}; controls ${[...new Set([...(p.controls || []).map((c) => c.label), ...p.lines.filter((l) => l.kind === "button").map((l) => l.text)])].slice(0, 60).join(" | ")}`).join("\n");
  const cands = claims.filter((c) => !c.page.auth && DOC_PAGE.test(c.route) && PROMISE.test(c.text));
  if (!cands.length) return [];
  const out = [];
  const groups = [];
  for (let i = 0; i < cands.length; i += 50) groups.push(cands.slice(i, i + 50));
  await J.pool(groups, async (g) => {
    const state = { UI_INVENTORY: inventory, NOT_REACHED: notReached.length ? notReached.join(", ") : "(none)", STATEMENTS: g.map(show).join("\n"),
      NOTE: "UI_INVENTORY lists every signed-in page the check read, with its headings and its buttons and links. NOT_REACHED lists signed-in pages it could not open: a control promised on one of those is not judged." };
    const a = await J.ask(state, Object.fromEntries(g.map((c) => [c.id, noul(`Does statement ${c.id} promise the customer a specific button, control, page, setting or download in the product that UI_INVENTORY does not have (on the page it names, or anywhere)? Answer no when the statement promises no specific control, or when the page it names is in NOT_REACHED.`)])));
    for (const c of g) { const p = pYes(a[c.id]); if (p >= min) out.push({ rule: "consistency/promise-without-feature", p: +p.toFixed(3), topic: c.topics?.[0] || "", claim: c, other: null }); }
  });
  return out;
}

const VERDICTS = {
  conflict: "they conflict: a reader cannot tell which one is true (different numbers, lists, conditions, or one says something exists or happens and the other says it does not)",
  differ: "they describe the same thing with different details, items or wording, so a reader would be unsure whether they mean the same",
  same: "they say the same thing",
  unrelated: "they are about different things",
};
const CONCLUSION = {
  inconsistent: "the site is inconsistent here: the two give different facts, conditions or names for the same thing, or one list names an item the other leaves out, or one says something is allowed, exists or happens and the other says it is not",
  detail: "one adds detail to the other, or they say the same thing in other words; nothing to fix",
  different: "they are about different things",
};
/**
 * Every candidate pair asked again on its own, side by side: contradict / different words / agree. The verdict's
 * probability is the finding's p (the per-statement question only found the candidates).
 */
export async function verifyPairs(J, found, { group = 40 } = {}) {
  const pairs = found.filter((f) => f.other);
  const groups = [];
  for (let i = 0; i < pairs.length; i += group) groups.push(pairs.slice(i, i + group));
  await J.pool(groups, async (g) => {
    const state = { PAIRS: g.map((f, i) => `P${i}| A (${where(f.claim)}): "${f.claim.text}"\n    B (${where(f.other)}): "${f.other.text}"`).join("\n"),
      NOTE: "Each pair quotes two statements of one website with the page and section they are on. Judge what a careful customer reading both would conclude." };
    const a = await J.ask(state, Object.fromEntries(g.flatMap((f, i) => [[`P${i}`, choice(`For pair P${i} in PAIRS, read as a customer who reads both pages: how do A and B relate?`, VERDICTS)],
      [`Q${i}`, choice(`For pair P${i} in PAIRS: what would a careful customer who reads both conclude?`, CONCLUSION)]])));
    g.forEach((f, i) => {
      const pr = a[`P${i}`]?.probabilities;
      if (!pr) { f.verified = null; f.unread = true; return; }
      const q = a[`Q${i}`]?.probabilities || {};
      // "different words" is a finding only when the customer would be left with two versions (not when one adds detail)
      f.verified = { contradict: +(pr.conflict || 0).toFixed(3), words: +(q.inconsistent || 0).toFixed(3), inconsistent: +(q.inconsistent || 0).toFixed(3), same: +(pr.same || 0).toFixed(3), unrelated: +(pr.unrelated || 0).toFixed(3) };
      const same = f.claim.key === f.other.key;
      if (f.verified.contradict >= 0.5 || f.verified.contradict >= f.verified.words) { f.rule = same ? "consistency/one-page" : "consistency/contradiction"; f.p = Math.max(f.verified.contradict, f.verified.inconsistent); f.conflict = f.verified.contradict; }
      else { f.rule = "consistency/different-words"; f.p = f.verified.words; }
    });
  });
  return found;
}

/* ───────── term map ───────── */
const STOP = new Set("a an the your our my their its this that these those of to for in on at by with and or from as is are be was were been you we it any each every all no not per while before after during can could will would should may must also just only then there here which what when where how why yet today still once until than so if into about up down out over under through more most less least other another same such own very".split(" "));
// a name ends in a word for a thing: the heads the term map compares (any language falls back to every head of a control)
const THING = /^(key|keys|fee|fees|credit|credits|balance|wallet|plan|plans|tier|tiers|account|policy|terms|notice|page|model|models|run|runs|report|cost|price|prices|rate|minimum|limit|charge|refund|dataset|file|weights|adapter|token|settings|export|button|role|specialist|expert|reviewer|support|centre|center|help|document|agreement|ledger|history|top-up|purchase|order|cart|payment|card|subscription|trial|recipe|recipes|job|task|project|workspace|dashboard|profile|team|member|deployment|endpoint|api|replica|machine|gpu|session|cookie|cookies|consent|data|record|records|invoice|receipt|email|form|message|request|ticket|step|steps|limit|limits|quota|usage|time|window|period)$/i;
const norm = (w) => w.toLowerCase().replace(/[’']s$/, "").replace(/[^\p{L}\p{N}-]/gu, "");
/** Candidate names: 1–3-word phrases (articles and possessives dropped) from controls, headings and text. */
export function termCandidates(pages, { minCount = 1 } = {}) {
  const counts = new Map();
  const add = (phrase, ctx, p, weight = 1) => {
    const k = phrase.toLowerCase();
    if (!counts.has(k)) counts.set(k, { term: phrase, n: 0, contexts: [], routes: new Set() });
    const e = counts.get(k);
    e.n += weight; e.routes.add(pageKey(p));
    if (e.contexts.length < 2 && !e.contexts.includes(ctx)) e.contexts.push(ctx.slice(0, 200));
  };
  for (const p of pages) {
    for (const l of p.body || p.lines) {
      const words = l.text.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
      const toks = words.map((w) => ({ w, n: norm(w) })).filter((t) => t.n && !STOP.has(t.n));
      const control = l.kind === "button" || l.kind === "nav" || (l.kind === "heading" && words.length <= 5);
      for (let i = 0; i < toks.length; i++) for (let len = 2; len <= 3 && i + len <= toks.length; len++) {
        const seq = toks.slice(i, i + len);
        if (seq.some((t) => /^\d/.test(t.n) || t.n.length < 2)) continue;
        if (!control && !THING.test(seq[seq.length - 1].n)) continue;
        add(seq.map((t) => t.w).join(" "), l.text, p, l.kind === "button" || l.kind === "heading" || l.kind === "nav" ? 2 : 1);
      }
    }
  }
  const byHead = new Map();
  for (const e of counts.values()) {
    if (e.n < minCount) continue;
    const head = norm(e.term.split(" ").pop());
    if (!head || head.length < 3) continue;
    if (!byHead.has(head)) byHead.set(head, []);
    byHead.get(head).push(e);
  }
  return byHead;
}

const stemOf = (t) => t.split(/\s+/).map((w) => w.replace(/(ings?|ed|es|s)$/, "").replace(/e$/, "")).join(" ");
/** Pairs of names Jev is asked about: same head word, both used 2+ times or on a control, different modifiers. */
export function termPairs(byHead, { maxPerHead = 6, maxPairs = 400, cfgTerms = {} } = {}) {
  const pairs = [];
  const distinct = (cfgTerms.distinct || []).map((g) => new Set(g.map((x) => x.toLowerCase())));
  for (const [head, list] of byHead) {
    const top = list.filter((e) => e.n >= 2).sort((a, b) => b.n - a.n).slice(0, maxPerHead);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i], b = top[j];
      const la = a.term.toLowerCase(), lb = b.term.toLowerCase();
      if (la.includes(lb) || lb.includes(la)) continue; // "API key" inside "API keys page"
      if (stemOf(la) === stemOf(lb)) continue; // "close account" / "closing account": one name, two forms
      if (distinct.some((s) => s.has(la) && s.has(lb))) continue;
      pairs.push({ head, a, b });
    }
  }
  return pairs.sort((x, y) => y.a.n + y.b.n - (x.a.n + x.b.n)).slice(0, maxPairs);
}

/** Jev: which candidate pairs name the same thing. → clusters + findings. */
export async function termMap(J, pages, { min = 0.7, cfgTerms = {}, maxPairs = 400 } = {}) {
  const byHead = termCandidates(pages);
  const pairs = termPairs(byHead, { cfgTerms, maxPairs });
  const same = [];
  const groups = [];
  for (let i = 0; i < pairs.length; i += 40) groups.push(pairs.slice(i, i + 40));
  await J.pool(groups, async (g) => {
    const state = { PAIRS: g.map((x, i) => `T${i}| "${x.a.term}" (${x.a.n}×, e.g. "${x.a.contexts[0]}") vs "${x.b.term}" (${x.b.n}×, e.g. "${x.b.contexts[0]}")`).join("\n"),
      NOTE: "Two names are the same thing when a customer would mean one object, fee, key, action, page, plan, role or document by both. Names of different things that only share a word (a sign-up credit and a purchased credit, a privacy policy and a refund policy, a run page and a billing page) are not the same thing." };
    const a = await J.ask(state, Object.fromEntries(g.map((x, i) => [`T${i}`, noul(`In PAIRS, do the two names of T${i} name the same thing on this site, so the site uses two names for one thing?`)])));
    g.forEach((x, i) => { const p = pYes(a[`T${i}`]); if (p >= min) same.push({ ...x, p }); });
  });
  // union-find clusters
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  const union = (a, b) => { for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k); parent.set(find(a), find(b)); };
  const byTerm = new Map();
  for (const s of same) { union(s.a.term.toLowerCase(), s.b.term.toLowerCase()); byTerm.set(s.a.term.toLowerCase(), s.a); byTerm.set(s.b.term.toLowerCase(), s.b); }
  const clusters = new Map();
  for (const k of parent.keys()) { const r = find(k); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(byTerm.get(k)); }
  const canonical = Object.entries(cfgTerms.canonical || {}).map(([c, vs]) => [c.toLowerCase(), new Set(vs.map((v) => v.toLowerCase()))]);
  const terms = [], findings = [];
  for (const list of clusters.values()) {
    const sorted = list.slice().sort((a, b) => b.n - a.n);
    const pinned = canonical.find(([c, vs]) => sorted.some((e) => e.term.toLowerCase() === c || vs.has(e.term.toLowerCase())));
    const main = pinned ? { term: pinned[0] } : sorted[0];
    const p = Math.max(...same.filter((s) => list.includes(s.a) || list.includes(s.b)).map((s) => s.p));
    terms.push({ term: main.term, variants: sorted.map((e) => ({ term: e.term, count: e.n, pages: [...e.routes].slice(0, 12), example: e.contexts[0] })), p: +p.toFixed(3), pinned: !!pinned });
    for (const e of sorted) if (e.term.toLowerCase() !== main.term.toLowerCase()) findings.push({ rule: "consistency/term", p: +p.toFixed(3), topic: "naming", term: main.term, variant: e.term, count: e.n, pages: [...e.routes], example: e.contexts[0] });
  }
  return { terms, findings, pairs: pairs.length, same: same.length };
}

/** The whole engine. @returns {{ findings, claims, terms, stats }} */
export async function consistency(J, pages, { chromePage = null, min = 0.5, cfg = {}, notReached = [] } = {}) {
  const claims = claimsOf(pages, { chromePage });
  await assignTopics(J, claims);
  const candidates = await compareTopics(J, claims);
  const compared = (await verifyPairs(J, candidates)).filter((f) => f.rule !== "consistency/candidate" && f.p >= min);
  const promised = await promiseCheck(J, claims, pages, { min, notReached });
  const tm = await termMap(J, chromePage ? [chromePage, ...pages] : pages, { min: Math.max(min, 0.8), cfgTerms: cfg.content?.terms || {} });
  return { findings: [...compared, ...promised, ...tm.findings], claims, terms: tm.terms, stats: { claims: claims.length, pairs: candidates.length, unread: claims.filter((c) => c.unread).length, termPairs: tm.pairs, sameTerms: tm.same } };
}

/** A finding of the engine as two quoted places (for findings.json / fix-plan). */
export function describe(f) {
  if (f.rule === "consistency/term") return { what: `one thing, two names: "${f.variant}" (${f.count}×) — the site mostly says "${f.term}"`, quote: f.example, where: f.pages.slice(0, 4).join(", "), canonical: f.term };
  const c = f.claim, o = f.other;
  const label = { "consistency/contradiction": "these two statements contradict each other", "consistency/one-page": "this page contradicts itself", "consistency/different-words": "the same thing in different words", "consistency/promise-without-feature": "a document promises a control the product does not show" }[f.rule];
  return { what: `${label}${f.topic ? ` (${f.topic})` : ""}: "${c.text}"${o ? ` ⟷ "${o.text}" (${where(o)})` : ""}`, quote: c.text, where: where(c), other: o ? { quote: o.text, where: where(o), route: o.route } : null };
}
