// Jev triage of a run's findings: likely real / unsure / likely noise, with the noise mechanism as the reason.
// Ordering and labelling only: nothing is dropped, a hard finding stays hard and keeps failing the run.
// Two questions per finding (the approach of a gate triage that was scored on labelled runs): which known noise
// mechanism, if any, explains it (choice), and "measured correctly, is it a defect?" (noul).
// p(real) = p(defect) × (1 − p(some noise mechanism)).
import { noul, choice, pYes } from "./client.js";

export const TOOL = "Claude's Babysitter: Playwright checks of a running web product at several widths (layout, overflow, contrast, focus, forms, dialogs, states), business acceptance checks (money, footer, policies, cookies, sign-in), copy rules over the rendered text (unfinished copy, test data, raw errors, punctuation, dates, one name per concept, conflicting policy facts, link label drift, named pages that do not exist), and Jev's reading of the copy (contradictions, different words for one thing, promises). Rule ids: 1.x–6.x UI checks, B/H/N/F/P/D/C/M/A acceptance, CT copy, f/ and jev/ Jev text rules, consistency/ the consistency engine.";

// General ways checks like these go wrong — mechanisms, never a product's answers.
export const NOISE = [
  "Contrast maths: a checker that blends semi-transparent or alpha colours (white at 70% on black, lab()/oklch() colours) against the wrong backdrop reports ratios near 1:1 for text that reads clearly; the same ratio on many pages is more likely a measuring error than invisible text.",
  "Visually hidden text (screen-reader-only labels, 1px clipped spans) is present on purpose; a check that sees it as stray, duplicated or unlabeled content is wrong.",
  "Reveal-on-scroll and entrance animations: content starts at opacity 0 or offset and moves in; a measurement taken mid-animation or on a cold first load is often not reproducible.",
  "One-off timings: a single late element, a single layout-shift reading or a single frame on one page in one run, with nothing similar elsewhere, often comes from a slow response.",
  "Guessed URLs: a tool may probe common paths (/dashboard, /account, /settings) that nothing links to; a 404 there is not a dead link.",
  "Deliberately different chrome: sign-in and sign-up screens and the signed-in app shell may use their own header, as long as a way back exists.",
  "Layouts by design: a split screen whose brand panel runs full height, a sticky side summary beside a longer form, boxes whose edges line up while inner padding differs.",
  "Lists styled with painted dots, number badges or icons are marked even when list-style is none.",
  "Forms: a tool that submits a prefilled form or aborts the save request produces errors or focus findings users never see.",
  "Required copy: a legal placeholder identity or a label a house rule requires on every card can look repetitive or like placeholder text.",
  "Naming: a page headline may differ from the link that opens it when the page's <title> matches the link; a word that only shares its head with another ('sign-up credit' and 'unused credit') names a different thing.",
  "Reading copy: a sentence quoted out of its section, a user's own data (their e-mail, their file name) or code shown in documentation read as site copy; two statements that only differ in detail read as a contradiction.",
];
const NOISE_TEXT = NOISE.map((t, i) => `N${i + 1}. ${t}`).join("\n");
const CRITERIA = { ...Object.fromEntries(NOISE.map((t, i) => [`N${i + 1}`, t.split(":")[0].split(".")[0].slice(0, 90)])), none: "none of these mechanisms explains it" };

const ruleOf = (f) => f.rule || (String(f.items?.[0]?.what || "").match(/\[([A-Za-z]+\d+(?:\.\d+)?[a-z]?|[\w-]+\/[\w/-]+)\]/) || [])[1] || (f.test || "").split(" ")[0];
const show = (c) => `${c.id}| [${c.rule}] ${c.what}${c.where ? ` — at ${c.where}` : ""} · page ${c.route || "site-wide"}${c.project ? ` @ ${c.project}` : ""}${c.pages > 1 ? ` · on ${c.pages} pages` : ""}`;

/** One candidate per finding item (the same message on several pages counted once, with its page count). */
export function candidates(findings) {
  const by = new Map();
  for (const [fi, f] of findings.entries()) {
    const items = f.items?.length ? f.items : [{ what: String(f.error || f.test || "").split("\n")[0], where: "" }];
    for (const [ii, it] of items.entries()) {
      const rule = ruleOf({ ...f, items: [it] });
      const sig = `${rule}|${String(it.what).replace(/\d+(\.\d+)?/g, "#").slice(0, 160)}`;
      if (!by.has(sig)) by.set(sig, { id: `C${String(by.size).padStart(3, "0")}`, rule, what: String(it.what).replace(/\s+/g, " ").slice(0, 400), where: String(it.where || "").slice(0, 160), route: f.route, project: f.project, refs: [], pages: 0, routes: new Set() });
      const c = by.get(sig);
      c.refs.push([fi, ii]);
      c.routes.add(f.route || "site-wide");
      c.pages = c.routes.size;
    }
  }
  return [...by.values()];
}

/**
 * @returns {Promise<{ candidates: any[], stats: any }>} each candidate { verdict: "likely real"|"unsure"|"likely noise"|"not evaluated", p, defect, noise, mechanism, reason }
 */
export async function triage(J, findings, { real = 0.3, noise = 0.15, group = 40, facts = null } = {}) {
  const cands = candidates(findings);
  const groups = [];
  for (let i = 0; i < cands.length; i += group) groups.push(cands.slice(i, i + group));
  await J.pool(groups, async (g) => {
    const state = { TOOL, TOOL_NOISE: NOISE_TEXT, FACTS: facts || undefined, CANDIDATES: g.map(show).join("\n") };
    const qs = {};
    for (const c of g) {
      qs[`${c.id}n`] = choice(`Which mechanism in TOOL_NOISE, if any, explains candidate ${c.id} in CANDIDATES as measurement noise or an allowed design? Choose "none" unless the mechanism clearly fits ${c.id}.`, CRITERIA);
      qs[`${c.id}d`] = noul(`Assume candidate ${c.id} in CANDIDATES is measured correctly. Would a careful product reviewer raise it as a defect a visitor would notice (sloppy, inconsistent, broken, false or confusing)? Judge ${c.id} only.`);
    }
    const a = await J.ask(state, qs);
    for (const c of g) {
      const n = a[`${c.id}n`], d = a[`${c.id}d`];
      if (!n || !d) { c.p = null; continue; }
      c.noise = +(1 - (n.probabilities?.none ?? (n.choice === "none" ? 1 : 0))).toFixed(2);
      c.mechanism = n.choice !== "none" ? n.choice : null;
      c.defect = +pYes(d).toFixed(2);
      c.p = +(c.defect * (1 - c.noise)).toFixed(3);
    }
  });
  for (const c of cands) {
    c.verdict = c.p == null ? "not evaluated" : c.p >= real ? "likely real" : c.p <= noise ? "likely noise" : "unsure";
    c.reason = c.mechanism ? NOISE[Number(c.mechanism.slice(1)) - 1] : c.verdict === "likely noise" ? "measured correctly, Jev does not think a visitor would notice it" : null;
  }
  return { candidates: cands, stats: { ...J.stats } };
}

/** Write the triage onto the findings (every item of every finding gets its candidate's verdict). */
export function annotate(findings, cands) {
  for (const c of cands) for (const [fi, ii] of c.refs) {
    const f = findings[fi];
    (f.triage ||= [])[ii] = { verdict: c.verdict, p: c.p, mechanism: c.mechanism || null, reason: c.reason || null };
  }
  return findings;
}
