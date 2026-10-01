#!/usr/bin/env node
// Claude Code Stop hook: the model cannot finish a turn while changed UI code breaks the guidelines.
// Exit 2 blocks the stop and feeds the fix-list back. After 3 blocked attempts in a row it lets the turn end
// (and says so) instead of looping forever — a human then decides.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
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
if (!failed) { writeFileSync(counter, "0"); process.exit(0); }

const n = (existsSync(counter) ? Number(readFileSync(counter, "utf8")) || 0 : 0) + 1;
writeFileSync(counter, String(n));
if (n > MAX) {
  writeFileSync(counter, "0");
  process.stdout.write(JSON.stringify({ systemMessage: `Claude's Babysitter still reports problems after ${MAX} attempts — tell the user which ones remain and why.` }));
  process.exit(0);
}
process.stderr.write(`Before finishing, fix the UI guideline problems in the code you changed (attempt ${n}/${MAX}):\n\n${report}`);
process.exit(2);
