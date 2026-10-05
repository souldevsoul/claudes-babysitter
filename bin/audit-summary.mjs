#!/usr/bin/env node
// babysitter audit [repo] [--json] [--ci]
// The whole picture in one screen: AST violations, CSS, contrast, dead and duplicated components.
// Ticks step 2 of BABYSITTER-ADOPTION.md (and step 3 when the audit is green). --ci exits 1 when not green.
import { resolve } from "node:path";
import { auditRepo, tick } from "../lib/adoption.js";
import { projectMode } from "../lib/mode.js";

const args = process.argv.slice(2);
const repo = resolve(args.find((a) => !a.startsWith("--")) || ".");
let audit;
try { audit = auditRepo(repo); }
catch (e) { console.error(`\n✗ Claude's Babysitter — audit of ${repo} FAILED: ${e.message}\n  This is a fault of the tool, not a clean repository. Report it.`); process.exit(2); }
const { problems, counted, topFiles, topRules } = audit;
if (args.includes("--json")) { console.log(JSON.stringify({ total: problems.length, groups: Object.fromEntries(counted.map(([l, list]) => [l, list.length])), topFiles, topRules }, null, 2)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nClaude's Babysitter — audit of ${repo}  (mode: ${projectMode(repo)})\n`);
for (const [label, list] of counted) console.log(`  ${list.length ? "✗" : "✓"} ${pad(label, 46)} ${list.length}`);
console.log(`  ${"─".repeat(52)}\n    ${pad("Total", 46)} ${problems.length}\n`);
if (problems.length) {
  console.log("  Most affected files:");
  for (const [f, n] of topFiles) console.log(`    ${pad(n, 5)} ${f}`);
  console.log("\n  Most frequent rules:");
  for (const [r, n] of topRules) console.log(`    ${pad(n, 5)} ${r}`);
  console.log("\n  Details: npm run babysitter -- check   (or: check --changed --format agent for what a generator sees)");
}
const t2 = tick(repo, 2);
const green = problems.length === 0;
if (green) {
  tick(repo, 3);
  console.log("\n✅ Аудит зелёный. Можно включать файрвол: npm run babysitter -- enable-hooks");
} else if (t2) console.log("\n  ✓ BABYSITTER-ADOPTION.md: шаг 2 отмечен. Дальше — шаг 3, ветка chore/tech-debt.");
process.exitCode = args.includes("--ci") && !green ? 1 : 0;
