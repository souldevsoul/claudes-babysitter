#!/usr/bin/env node
// git pre-commit: the same gate as the Claude Code Stop hook, for commits made by people or by any other
// generator (v0, Cursor, scripts). Static checks on changed lines, theme gates, then the rendered micro-check
// if a dev server is configured and running. Exit 1 blocks the commit; `git commit --no-verify` bypasses it.
import { spawnSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectMode, ADOPTION_NOTE } from "../lib/mode.js";
import { recover } from "../lib/time-travel.js";
import { collectProblems, freezeForReview } from "../lib/studio-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
try { recover(repo); } catch {} // never lint or commit around HEAD versions left by a killed Studio review
const run = (script, args) => spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const check = run("ui-check.mjs", ["--repo", repo, "--changed", "HEAD", "--format", "agent"]);
let failed = check.status === 1, out = check.stdout;
if (!failed) { const m = run("micro-check.mjs", ["--repo", repo]); if (m.status === 1) { failed = true; out = m.stdout; } }
if (failed && projectMode(repo) === "adoption") {
  process.stderr.write(`\n⚠️  Claude's Babysitter (${ADOPTION_NOTE}):\n\n${out}\n`);
  process.exit(0);
}
// Babysitter Studio (opt-in: "studio": { "enabled": true }): instead of failing outright, ask a human in the
// browser panel. Approve lets this commit through, reject (or no answer) aborts it. No studio running →
// the plain gate below decides.
if (failed) {
  const problems = collectProblems(repo, ["HEAD"]);
  const r = await freezeForReview({ repo, problems, title: `Commit review · ${problems.length} problem(s)` });
  if (r?.decision === "approve") { process.stderr.write(`✅ Approved in Studio${r.text ? `: ${r.text}` : ""} — committing despite the findings.\n`); process.exit(0); }
  if (r?.decision === "comment") { process.stdout.write(`Reviewer comment: ${r.text}\n`); process.stderr.write("💬 Sent back with a comment. The commit is aborted.\n"); process.exit(1); }
  if (r) { process.stderr.write(`❌ ${r.decision === "timeout" ? "No decision in time" : "Review rejected by user"}${r.text ? `: ${r.text}` : ""}. The commit is aborted.\n`); process.exit(1); }
  // null: Studio off or not running → the plain gate below
}
if (failed) {
  process.stderr.write(`\n✋ Claude's Babysitter blocked this commit.\n\n${out}\n(Fix the items above and commit again. To bypass deliberately: git commit --no-verify)\n`);
  process.exit(1);
}
