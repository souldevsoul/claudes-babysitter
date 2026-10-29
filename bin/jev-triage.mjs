#!/usr/bin/env node
// babysitter triage [--repo DIR] [--quiet]
// Jev sorts the last run's findings (.babysitter/findings.json) into likely real / unsure / likely noise, with the
// noise mechanism as the reason, and writes the verdicts onto the findings (`triage`). fix-plan orders by it and lists
// the likely noise apart ("Jev thinks this is a false alarm because …"). Nothing is dropped: a hard finding stays one.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const repo = resolve(opt("repo") || process.env.BABYSITTER_ROOT || process.cwd());
process.env.BABYSITTER_ROOT = repo;
const quiet = args.includes("--quiet");
const src = join(repo, ".babysitter/findings.json");
if (!existsSync(src)) { console.error("babysitter triage: no .babysitter/findings.json — run `babysitter e2e` or `babysitter text` first"); process.exit(2); }
const { loadConfig } = await import("../playwright/project.js");
const cfg = loadConfig();
const { jevProvider, makeJev } = await import("../lib/jev/client.js");
const { jevConfig } = await import("../lib/jev/text-pass.js");
const { triage, annotate } = await import("../lib/jev/triage.js");
const jc = jevConfig(cfg);
if (!jc.enabled || !jc.triage || !jevProvider(process.env, cfg).ok) { if (!quiet) console.log(`Jev triage off${!jc.enabled || !jc.triage ? " (jev.enabled / jev.triage: false)" : ": no token"} — findings are not ordered by Jev.`); process.exit(0); }
const doc = JSON.parse(readFileSync(src, "utf8"));
const list = doc.findings || [];
if (!list.length) { if (!quiet) console.log("Jev triage: no findings."); process.exit(0); }
const t0 = Date.now();
const facts = jc.facts && existsSync(resolve(repo, jc.facts)) ? readFileSync(resolve(repo, jc.facts), "utf8").trim() : null;
const J = makeJev({ cache: join(repo, ".babysitter/jev-cache"), concurrency: jc.concurrency, deadlineMin: jc.deadlineMin, budgetUsd: jc.budgetUsd, cfg });
/* Triage is ordering only, so a provider that will not answer leaves every finding standing.
   A refused token used to come out as an uncaught "Jev 401" and a Node stack with exit 1 —
   after findings.json was written and the summary printed — which reads as a crashed run and
   buries the one thing worth saying. (relaygpu, 2026-10.) */
let triaged;
try { triaged = await triage(J, list, { facts }); }
catch (e) {
  if (!e?.auth) throw e;
  console.error(`Jev triage did not run: ${e.message}. The ${list.length} finding(s) of this run stand unordered — fix-plan lists them in the order they were measured. Refresh the token and run \`babysitter triage\` to sort them.`);
  process.exit(0);
}
const { candidates, stats } = triaged;
annotate(list, candidates);
const count = (v) => candidates.filter((c) => c.verdict === v).length;
doc.triage = { at: new Date().toISOString(), candidates: candidates.length, real: count("likely real"), unsure: count("unsure"), noise: count("likely noise"), notEvaluated: count("not evaluated"), costUsd: +stats.cost.toFixed(4), calls: stats.calls, cached: stats.cached, ms: Date.now() - t0 };
writeFileSync(src, JSON.stringify(doc, null, 2));
writeFileSync(join(repo, ".babysitter/triage.json"), JSON.stringify({ ...doc.triage, list: candidates.map(({ refs: _r, routes: _rs, ...c }) => c) }, null, 1));
console.log(`Jev triage: ${candidates.length} distinct finding(s) — ${doc.triage.real} likely real, ${doc.triage.unsure} unsure, ${doc.triage.noise} likely noise${doc.triage.notEvaluated ? `, ${doc.triage.notEvaluated} not evaluated` : ""} · $${doc.triage.costUsd} · ${Math.round(doc.triage.ms / 1000)} s. Ordering only: every finding stays; fix-plan lists the likely noise apart.`);
