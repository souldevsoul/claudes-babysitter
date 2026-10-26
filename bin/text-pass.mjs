#!/usr/bin/env node
// babysitter text [--facts FILE] [--no-jev] [--from-pages FILE] [--min 0.7] [--budget USD] [--out DIR] [--no-merge]
//
// The text pass: every route is loaded ONCE per locale × role, at desktop width, and its rendered copy is read:
//   1. the deterministic copy rules (CT1–CT31, P4, 6.15 — the same functions content.spec runs, on one collection per
//      page instead of one page load per check), site-wide over the records of every page;
//   2. Jev (when a token is available): the babysitter copy rules as questions, the text rule catalog, and the
//      consistency engine (contradictions between and inside pages, the same thing in different words, promises the
//      product does not keep, one term per concept → .babysitter/terms.json).
// Writes .babysitter/text-pass.json (everything, with cost and time), .babysitter/text-pages.json (the page models; a
// re-run with --from-pages reads them without a browser) and merges its findings into .babysitter/findings.json
// (suite "text"), so fix-plan, the Stop hook and the summary see them. `babysitter e2e` runs it first when Jev is on
// and content.spec then skips the checks it already made (see docs/jev.md).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const ROOT = resolve(process.env.BABYSITTER_ROOT || process.cwd());
process.env.BABYSITTER_ROOT = ROOT;
const P = await import("../playwright/project.js");
const cfg = P.loadConfig();
const { jevConfig, jevTextPass, toFindings } = await import("../lib/jev/text-pass.js");
const { jevProvider, makeJev } = await import("../lib/jev/client.js");
const jc = jevConfig(cfg);
if (opt("min")) jc.min = Number(opt("min"));
if (opt("budget")) jc.budgetUsd = Number(opt("budget"));
const OUT = resolve(opt("out", join(ROOT, ".babysitter")));
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.error(...a);
const t0 = Date.now();

const factsFile = opt("facts") || jc.facts;
const facts = factsFile && existsSync(resolve(ROOT, factsFile)) ? readFileSync(resolve(ROOT, factsFile), "utf8").trim() : null;
const contextFile = jc.context;
const context = contextFile && existsSync(resolve(ROOT, contextFile)) ? readFileSync(resolve(ROOT, contextFile), "utf8").trim() : null;

let pages, det = [], soft = [], siteDet = [], loads = 0, notReached = [], status = {};
if (flag("from-source")) {
  // no browser: the copy of the source (project map); the static copy lint is the rules half
  const { buildProjectMap, pagesFromSource } = await import("../lib/project-map.js");
  const { lintContent } = await import("../lib/content-lint.js");
  const { map } = buildProjectMap(ROOT);
  pages = pagesFromSource(map);
  for (const p of pages) if (p.auth) p.role = "user";
  const lint = await lintContent(ROOT, { cfg, dns: false });
  const byFile = new Map();
  for (const p of pages) for (const l of p.lines) if (!byFile.has(l.file)) byFile.set(l.file, p);
  det = lint.problems.map((x) => { const p = byFile.get(x.file); return { id: x.id, route: p?.route || null, auth: !!p?.auth, role: p?.auth ? "user" : null, key: p ? `${p.auth ? "[user] " : ""}${p.route}` : "(source)", test: "babysitter content (static)", what: x.message, where: `${x.file}:${x.line}`, quote: (x.message.match(/"([^"]{3,200})"/) || [, ""])[1] }; });
  notReached = [];
  log(`text pass: ${pages.length} route(s) from the source (no browser), ${det.length} static copy finding(s)`);
} else if (opt("from-pages")) {
  const saved = JSON.parse(readFileSync(resolve(opt("from-pages")), "utf8"));
  pages = saved.pages; det = saved.det || []; soft = saved.soft || []; siteDet = saved.site || []; notReached = saved.notReached || []; loads = 0;
  log(`text pass: ${pages.length} page(s) from ${opt("from-pages")} (no browser)`);
} else {
  const r = await (await import("../playwright/text-run.js")).readSite({ cfg, log });
  ({ pages, det, soft, siteDet, loads, notReached, status } = r);
  writeFileSync(join(OUT, "text-pages.json"), JSON.stringify({ at: new Date().toISOString(), pages, det, soft, site: siteDet, notReached }, null, 1));
}
const tRead = Date.now() - t0;

// ───────── Jev ─────────
const prov = jevProvider(process.env, cfg);
const jevOn = !flag("no-jev") && jc.enabled && prov.ok;
let jev = null, jevNote = "";
if (!jevOn) jevNote = flag("no-jev") || !jc.enabled ? "Jev off (--no-jev / jev.enabled: false) — copy checked by rules only" : "Jev off: no token — copy checked by rules only";
else {
  const J = makeJev({ cache: join(ROOT, ".babysitter/jev-cache"), concurrency: jc.concurrency, deadlineMin: jc.deadlineMin, budgetUsd: jc.budgetUsd, cfg, log });
  try {
    jev = await jevTextPass(J, pages, { cfg, facts, context, det: det.map((d) => ({ ...d, key: d.key })), notReached, status, log });
  } catch (e) { jevNote = `Jev stopped: ${e.message}`; log(jevNote); }
}
const levels = { hard: 0, jev: 0, disagrees: 0, unsure: 0, agrees: 0 };
for (const f of jev?.findings || []) if (f.level in levels) levels[f.level]++;
if (jev?.claims) writeFileSync(join(OUT, "text-claims.json"), JSON.stringify({ at: new Date().toISOString(), claims: jev.claims }, null, 1));
if (jev?.terms) writeFileSync(join(OUT, "terms.json"), JSON.stringify({ at: new Date().toISOString(), note: "Names Jev found for one thing on this site: adopt the first term as the glossary (babysitter.config.json → content.terms.canonical), or declare different things in content.terms.distinct.", terms: jev.terms }, null, 1));

// ───────── findings ─────────
const detEntries = [...det, ...siteDet].map((d) => ({ suite: "text", route: d.route || null, role: d.role || null, auth: !!d.auth, locale: d.locale || null, test: d.test, project: "text", file: "text-pass", status: "failed", rule: d.id || null,
  items: [{ what: d.what, where: d.where }], error: d.what, ...(d.jevAgrees ? { jev: { agrees: d.jevAgrees } } : {}) }));
// a deterministic finding Jev agrees with carries Jev's probability
for (const f of jev?.findings || []) if (f.level === "agrees") { const d = detEntries.find((x) => x.rule === f.agreesWith && x.route === f.page?.route); if (d) d.jev = { agrees: f.p }; }
const jevEntries = jev ? toFindings(jev.findings, { blocking: jc.blocking }) : [];
const ms = Date.now() - t0;
const result = {
  at: new Date().toISOString(), ms, readMs: tRead, loads, pages: pages.length, notReached,
  jev: jev ? { on: true, provider: prov.provider, calls: jev.stats.calls, cached: jev.stats.cached, failed: jev.stats.failed, costUsd: +jev.stats.cost.toFixed(4), budgetUsd: jc.budgetUsd, budgetHit: jev.stats.budgetHit, deadlineHit: jev.stats.deadlineHit, questions: jev.stats.questions, claims: jev.stats.claims, rules: jev.stats.rules, unread: jev.stats.unread, ms: jev.stats.ms, levels, min: jc.min } : { on: false, note: jevNote },
  findings: [...detEntries, ...jevEntries],
  unsure: (jev?.findings || []).filter((f) => f.level === "unsure").map((f) => ({ rule: f.rule, p: f.p, route: f.page?.route || null, key: f.key, quote: f.quote, section: f.section, other: f.other || null, what: f.what })),
  soft: soft.map((d) => ({ route: d.route, what: d.what, where: d.where })),
};
writeFileSync(join(OUT, "text-pass.json"), JSON.stringify(result, null, 1));
if (!flag("no-merge")) {
  const ff = join(ROOT, ".babysitter/findings.json");
  let prev = { findings: [] };
  try { prev = JSON.parse(readFileSync(ff, "utf8")); } catch { }
  const keep = (prev.findings || []).filter((f) => f.suite !== "text");
  writeFileSync(ff, JSON.stringify({ ...prev, at: prev.at || result.at, textPass: { at: result.at, jev: result.jev.on }, findings: [...keep, ...result.findings] }, null, 2));
}
const { textSummary } = await import("../lib/jev/summary.js");
console.log(textSummary(result));
process.exit(result.findings.some((f) => !f.advisory) ? 1 : 0);
