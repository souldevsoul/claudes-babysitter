#!/usr/bin/env node
// babysitter install-hooks [repo] [--verbose]
// Installs the git pre-commit gate for a project that has claudes-babysitter as a dependency. Meant for the
// project's `prepare` script, so every clone gets the gate on `npm install` / `pnpm i`:
//   - silent; never fails the install (always exit 0) — a missing gate is reported, not fatal
//   - does nothing in CI or outside a git work tree (CI runs `babysitter audit --diff` instead)
//   - idempotent; the hook calls the project's own node_modules copy, so it follows upgrades
//   - never clobbers a foreign pre-commit: it is kept as pre-commit.local and runs first
//   - respects core.hooksPath (husky etc.): writes there only if no pre-commit exists, else says what to add
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, chmodSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const say = (m) => verbose && console.log(m);
const warn = (m) => console.warn(`babysitter install-hooks: ${m}`);
const MARK = "# claudes-babysitter pre-commit gate";

try {
  if (process.env.CI && !args.includes("--force")) { say("CI: skipped (the pipeline runs `babysitter audit --diff`)"); process.exit(0); }
  // npm/pnpm run "prepare" in the package root, so cwd is the project. (Not INIT_CWD: that is wherever npm was
  // invoked from — inside `npm run` of ANOTHER package it points there, and the hook would land in the wrong repo.)
  const start = resolve(args.find((a) => !a.startsWith("--")) || process.cwd());
  let top;
  try { top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: start, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { say("not a git work tree: skipped"); process.exit(0); }
  const gitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: top, encoding: "utf8" }).trim();
  const custom = (() => { try { return execFileSync("git", ["config", "core.hooksPath"], { cwd: top, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } })();
  const hooksDir = custom ? (isAbsolute(custom) ? custom : join(top, custom)) : join(isAbsolute(gitDir) ? gitDir : join(top, gitDir), "hooks");
  const hook = join(hooksDir, "pre-commit");

  // the gate runs the copy in the project's node_modules (follows `npm update`); if it is gone, it says so and lets the commit through — CI is the hard gate
  const body = `#!/bin/sh
${MARK} — installed by \`babysitter install-hooks\` (package.json "prepare"). Bypass deliberately: git commit --no-verify
[ -x "$(dirname "$0")/pre-commit.local" ] && { "$(dirname "$0")/pre-commit.local" "$@" || exit $?; }
GATE="$(git rev-parse --show-toplevel)/node_modules/claudes-babysitter/bin/hook-pre-commit.mjs"
if [ ! -f "$GATE" ]; then echo "Claude's Babysitter is not installed (run npm install) — commit not checked locally; CI will check it." >&2; exit 0; fi
exec node "$GATE" "$@"
`;
  if (existsSync(hook)) {
    const cur = readFileSync(hook, "utf8");
    if (cur === body) { say("already installed"); process.exit(0); }
    if (!cur.includes(MARK) && !/claudes-babysitter|hook-pre-commit\.mjs/.test(cur)) {
      if (custom) { warn(`${hook} belongs to another tool (core.hooksPath=${custom}). Add this line to it: node node_modules/claudes-babysitter/bin/hook-pre-commit.mjs`); process.exit(0); }
      renameSync(hook, join(hooksDir, "pre-commit.local")); // kept, and run first
      say("existing pre-commit kept as pre-commit.local");
    }
  }
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hook, body);
  chmodSync(hook, 0o755);
  say(`installed ${hook}`);
} catch (e) {
  warn(`not installed (${e.message.split("\n")[0]}); commits are still checked in CI`);
}
process.exit(0);
