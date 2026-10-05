// The adoption checklist (BABYSITTER-ADOPTION.md) and the shared audit summary.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin");

/** Tick step n ("- [ ] **n." → "- [x] **n.") in BABYSITTER-ADOPTION.md, if the file exists. */
export function tick(repo, n) {
  const f = join(repo, "BABYSITTER-ADOPTION.md");
  if (!existsSync(f)) return false;
  const s = readFileSync(f, "utf8");
  const t = s.replace(new RegExp(`- \\[ \\] \\*\\*${n}\\.`), `- [x] **${n}.`);
  if (t !== s) writeFileSync(f, t);
  return t !== s;
}

/** Full-repo check grouped the way the checklist talks about it. */
export function auditRepo(repo) {
  const r = spawnSync(process.execPath, [join(BIN, "ui-check.mjs"), "--repo", repo, "--format", "json"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  let problems = [];
  // a check that crashed is not a clean check: never report "green" on an empty result from a failure
  let parsed = false;
  try { const j = JSON.parse(r.stdout || ""); problems = Array.isArray(j) ? j : j.problems; parsed = Array.isArray(problems); } catch {}
  if (!parsed || (r.status !== 0 && r.status !== 1)) {
    const why = String(r.stderr || r.error?.message || "").trim().split("\n").find((l) => /Error|error/.test(l)) || `exit ${r.status}`;
    throw new Error(`the check did not finish (${why}) — the audit cannot say anything about this repository`);
  }
  const groups = [
    ["AST: styles, classes, controls", (p) => /^ui\//.test(p.rule) && !/^ui\/(require-layer|token-values|apply-values|z-index-scale)$/.test(p.rule)],
    ["CSS (Stylelint)", (p) => /^(scale-unlimited|declaration|color-named|selector|ui\/(require-layer|token-values|apply-values|z-index-scale))/.test(p.rule)],
    ["Theme contrast", (p) => /^theme\/contrast/.test(p.rule)],
    ["Theme First (stock theme)", (p) => /^theme\/theme-first/.test(p.rule)],
    ["Components: dead, duplicated, copied markup", (p) => /^ui-audit\/components/.test(p.rule)],
    ["Theme audit", (p) => /^ui-audit\/theme/.test(p.rule)],
  ];
  const counted = groups.map(([label, test]) => [label, problems.filter(test)]);
  const byFile = {};
  for (const p of problems) byFile[p.file] = (byFile[p.file] || 0) + 1;
  const byRule = {};
  for (const p of problems) byRule[p.rule] = (byRule[p.rule] || 0) + 1;
  return { problems, counted, topFiles: Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8), topRules: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 8) };
}
