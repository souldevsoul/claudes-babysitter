#!/usr/bin/env node
// git pre-commit: the same gate as the Claude Code Stop hook, for commits made by people or by any other
// generator (v0, Cursor, scripts). Static checks on changed lines, theme gates, then the rendered micro-check
// if a dev server is configured and running. Exit 1 blocks the commit; `git commit --no-verify` bypasses it.
import { spawnSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const run = (script, args) => spawnSync(process.execPath, [join(here, script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const check = run("ui-check.mjs", ["--repo", repo, "--changed", "HEAD", "--format", "agent"]);
let failed = check.status === 1, out = check.stdout;
if (!failed) { const m = run("micro-check.mjs", ["--repo", repo]); if (m.status === 1) { failed = true; out = m.stdout; } }
if (failed) {
  process.stderr.write(`\n✋ Claude's Babysitter blocked this commit.\n\n${out}\n(Fix the items above and commit again. To bypass deliberately: git commit --no-verify)\n`);
  process.exit(1);
}
