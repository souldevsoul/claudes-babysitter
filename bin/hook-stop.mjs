#!/usr/bin/env node
// Claude Code Stop hook: the model cannot finish a turn while changed UI code breaks the guidelines.
// Exit 2 blocks the stop and feeds the fix-list back. After 3 blocked attempts in a row it lets the turn end
// (and says so) instead of looping forever — a human then decides.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { projectMode, ADOPTION_NOTE } from "../lib/mode.js";
import { recover } from "../lib/time-travel.js";
import { collectProblems, freezeForReview, pendingNotes, formatManual } from "../lib/studio-gate.js";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
try { recover(repo); } catch {} // a killed Studio review left HEAD versions on disk: put the work back first
const stateDir = join(repo, ".babysitter");
const counter = join(stateDir, "stop-attempts");
const MAX = Number(process.env.BABYSITTER_MAX_STOP_BLOCKS || 3);

const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "ui-check.mjs"), "--repo", repo, "--changed", "--format", "agent"], { encoding: "utf8" });
mkdirSync(stateDir, { recursive: true });
let report = r.stdout;
let failed = r.status === 1;
// static check clean → optional rendered micro-run against a running dev server (skipped if none)
if (!failed) {
  const m = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "micro-check.mjs"), "--repo", repo], { encoding: "utf8", timeout: 150000 });
  if (m.status === 1) { failed = true; report = m.stdout; }
}
if (!failed) {
  writeFileSync(counter, "0");
  // the checks are clean, but a human pinned notes in Babysitter Studio during this turn: they come first
  const manual = await pendingNotes(repo);
  if (manual.length) { process.stderr.write(`Before finishing, apply the notes the user pinned on the page in Babysitter Studio:\n\n${formatManual(manual)}`); process.exit(2); }
  process.exit(0);
}
if (projectMode(repo) === "adoption") {
  const n = (report.match(/(\d+) problem\(s\)/) || [])[1] || "some";
  process.stdout.write(JSON.stringify({ systemMessage: `Claude's Babysitter: ${n} UI problem(s) in the changed code (${ADOPTION_NOTE}).` }));
  process.exit(0);
}

// Studio on and running: freeze the turn until a human decides in the browser. A human verdict replaces the
// attempt counter. Claude Code reads a Stop hook's stderr only on exit 2, so "send back" means exit 2 here.
const problems = collectProblems(repo);
const verdict = await freezeForReview({ repo, problems, title: `Babysitter: ${problems.length} problem(s)` });
if (verdict?.decision === "approve") {
  writeFileSync(counter, "0");
  process.stdout.write(JSON.stringify({ systemMessage: `Claude's Babysitter: approved in Studio${verdict.text ? ` — ${verdict.text}` : ""}.` }));
  process.exit(0);
}
if (verdict?.decision === "comment") {
  process.stderr.write(`${verdict.text ? `Reviewer comment from Babysitter Studio — do this before finishing:\n${verdict.text}\n\n` : "The reviewer sent this back from Babysitter Studio.\n\n"}${formatManual(verdict.manual)}${verdict.manual?.length ? "\n" : ""}The flagged problems, for reference:\n${report}`);
  process.exit(2);
}
if (verdict) {
  process.stderr.write(`${verdict.decision === "timeout" ? "No decision in Babysitter Studio in time" : "Review rejected by user"}${verdict.text ? `: ${verdict.text}` : ""}. Fix these before finishing:\n\n${formatManual(verdict.manual)}${verdict.manual?.length ? "\n" : ""}${report}`);
  process.exit(2);
}

const n = (existsSync(counter) ? Number(readFileSync(counter, "utf8")) || 0 : 0) + 1;
writeFileSync(counter, String(n));
if (n > MAX) {
  writeFileSync(counter, "0");
  process.stdout.write(JSON.stringify({ systemMessage: `Claude's Babysitter still reports problems after ${MAX} attempts — tell the user which ones remain and why.` }));
  process.exit(0);
}
process.stderr.write(`Before finishing, fix the UI guideline problems in the code you changed (attempt ${n}/${MAX}):\n\n${report}`);
process.exit(2);
