// The text benchmark: a tester's real cards about copy (anonymised) against what a run reported.
//   node test/jev-bench/score.mjs <findings.json | text-pass.json>… [--bench test/jev-bench/site-a] [--misses]
// A card counts as caught when one finding is on one of its pages (or quotes a place on one) and quotes one of its
// key fragments (case-insensitive) — the place a fixer would look. Cards out of reach of a rendered read (a page that
// needs a finished job, a dialog, an upload) are counted separately.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const low = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'");
const routeOf = (s) => String(s || "").replace(/^\[[^\]]+\]\s*/, "").replace(/\s+\(.*\)$/, "").split(" › ")[0].trim();

/** Every finding as { routes, text, rule } (findings.json entries, text-pass.json findings and unsure entries). */
export function flatten(doc, { unsure = false } = {}) {
  const list = [...(doc.findings || []), ...(unsure ? doc.unsure || [] : [])];
  return list.map((f) => {
    const routes = new Set([f.route, f.key && routeOf(f.key), f.jev?.other?.route, f.other?.route, f.other?.key && routeOf(f.other.key), ...(f.items || []).map((i) => routeOf(i.where))].filter(Boolean));
    if (/header and footer/.test(f.key || "") || (f.items || []).some((i) => /header and footer/.test(i.where))) routes.add("(header and footer)");
    const text = low([f.what, f.error, f.quote, f.jev?.quote, f.jev?.other?.quote, f.other?.quote, ...(f.items || []).map((i) => `${i.what} ${i.where}`)].join(" | "));
    const rules = new Set([f.rule, ...[...text.matchAll(/\[((?:ct|p|b|f|d|n)\d+(?:\.\d+)?|[a-z]+\/[\w/-]+)\]/g)].map((m) => m[1].replace(/^ct/, "CT").replace(/^([pbfdn])(\d)/, (x, a, b) => a.toUpperCase() + b))].filter(Boolean));
    return { routes, text, rule: f.rule || f.test || "", rules: [...rules] };
  });
}

// which rules can stand for a card of each kind (a dash finding that happens to quote a contradicting sentence is not
// a caught contradiction)
export const KIND_RULES = {
  dash: ["CT5", "f/copy-ai-cadence"],
  "not-yet": ["CT1", "jev/not-yet", "jev/build-note", "f/copy-coming-soon", "f/copy-build-note", "f/claim-feature-missing", "f/claim-message-promise"],
  contradiction: ["consistency/", "CT18", "CT19", "CT20", "CT21", "CT22", "CT23", "CT27", "f/pair-", "f/claim-", "f/legal-unclear-sentence", "jev/control-says-otherwise", "jev/count", "jev/math", "f/forbid-topup-limits", "f/forbid-subscription", "f/money-"],
  "different-words": ["consistency/", "CT15", "CT17", "CT19", "CT21", "jev/same-thing-two-names", "f/site-one-name", "f/site-label-vs-title", "f/copy-invented-names"],
  negative: ["jev/negative-statement", "jev/self-defence", "f/copy-self-defence", "f/copy-over-explain", "f/forbid-support-channel"],
  jargon: ["jev/jargon", "jev/build-note", "f/copy-build-note", "CT26", "f/copy-term-undefined", "f/money-units-unexplained", "f/copy-unclear", "f/copy-runtime-junk"],
  internal: ["jev/jargon", "jev/build-note", "f/copy-build-note", "CT1", "CT9", "CT25", "jev/self-defence", "f/copy-self-defence", "f/copy-email-domain"],
  unclear: ["jev/unexplained-value", "jev/jargon", "f/copy-unclear", "f/legal-unclear-sentence", "f/copy-term-undefined", "f/money-units-unexplained", "f/money-format", "f/page-price-unclear", "consistency/"],
  promise: ["consistency/promise-without-feature", "f/legal-feature-promise", "f/claim-feature-missing", "f/claim-included-false", "jev/control-says-otherwise", "consistency/"],
  count: ["jev/count", "CT27", "consistency/", "f/claim-"],
  style: ["jev/set-style", "CT28", "CT8", "f/site-legal-structure", "jev/same-thing-two-names"],
  math: ["jev/math", "CT27", "consistency/"],
  legal: ["f/page-terms-", "f/legal-", "f/page-legal-", "f/forbid-sanctions-list", "f/page-privacy-"],
};
KIND_RULES["one-page"] = KIND_RULES.contradiction;
const fits = (kind, f) => kind === "other" || !KIND_RULES[kind] || f.rules.some((r) => KIND_RULES[kind].some((k) => r.startsWith(k)));

export function score(findings, cards) {
  const rows = cards.map((c) => {
    const hit = findings.find((f) => c.pages.some((p) => f.routes.has(p) || (p === "(site)" && f.routes.size === 0)) && fits(c.kind, f) && (c.keys.some((k) => k && f.text.includes(low(k))) || (c.rules || []).some((r) => f.rules.some((x) => x.startsWith(r)))));
    return { ...c, caught: !!hit, by: hit ? hit.rules.join(",") || hit.rule : null };
  });
  const reach = rows.filter((r) => !r.reach);
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
  const byKind = {};
  for (const r of rows) { const k = (byKind[r.kind] ||= { n: 0, caught: 0 }); k.n++; if (r.caught) k.caught++; }
  return { cards: rows.length, caught: rows.filter((r) => r.caught).length, recall: pct(rows.filter((r) => r.caught).length, rows.length),
    reachable: reach.length, reachCaught: reach.filter((r) => r.caught).length, reachRecall: pct(reach.filter((r) => r.caught).length, reach.length), byKind, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const bi = args.indexOf("--bench");
  const bench = bi >= 0 ? args[bi + 1] : join(HERE, "site-a");
  const files = args.filter((a, i) => !a.startsWith("--") && (bi < 0 || i !== bi + 1));
  const cards = JSON.parse(readFileSync(join(bench, "cards.json"), "utf8")).cards;
  const all = files.flatMap((f) => flatten(JSON.parse(readFileSync(f, "utf8")), { unsure: args.includes("--unsure") }));
  const s = score(all, cards);
  console.log(`${s.caught}/${s.cards} cards caught (${s.recall}%) · reachable by a rendered read: ${s.reachCaught}/${s.reachable} (${s.reachRecall}%)`);
  for (const [k, v] of Object.entries(s.byKind).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(16)} ${v.caught}/${v.n}`);
  if (args.includes("--misses")) for (const r of s.rows.filter((x) => !x.caught)) console.log(`  MISS ${r.id} [${r.kind}${r.reach ? `, ${r.reach}` : ""}] ${r.pages.join(" ")} — ${r.expect}`);
  if (args.includes("--hits")) for (const r of s.rows.filter((x) => x.caught)) console.log(`  HIT ${r.id} [${r.kind}] by ${r.by} — ${r.expect}`);
}
