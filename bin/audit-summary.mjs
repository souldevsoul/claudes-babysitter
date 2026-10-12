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
// Native selects and pickers first, by file:line. On TrueLogos the native <select> in the "Cancel this
// project?" dialog was one of 137 no-native-controls hits inside 4,700 findings and nobody looked (2026-10);
// a visual audit cannot see it either, because the dialog only exists after a click on a signed-in page.
const pickers = problems.filter((p) => p.rule === "ui/no-native-controls" && /Native <select>|type="(date|datetime-local|month|week|time|range|color)"|native (date|time|datetime-local|month|week|range|color) picker/.test(p.message || ""));
if (pickers.length) {
  console.log(`  ✗ Native selects / pickers — fix these first (${pickers.length}). The OS draws their open list; inside a dialog no screenshot shows them:`);
  for (const p of pickers.slice(0, 40)) console.log(`    ${p.file}:${p.line}  ${(p.message || "").split(":")[0].split(" is forbidden")[0]}`);
  if (pickers.length > 40) console.log(`    … and ${pickers.length - 40} more`);
  console.log("");
}
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
