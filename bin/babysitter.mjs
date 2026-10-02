#!/usr/bin/env node
// babysitter <command> [...args]
//   init [repo] [--link|--vendor] [--ci] [--url https://preview] [--dry-run] [--no-install] [--force]
//   check [...]      → bin/ui-check.mjs
//   audit [repo]     → full audit summary (AST, CSS, contrast, components); ticks BABYSITTER-ADOPTION.md
//   audit --diff [base=origin/main] → CI gate: fail only on problems added since the branch left <base>
//                      (GitHub annotations + step summary under GitHub Actions)
//   install-hooks    → the git pre-commit gate, for package.json "prepare" (silent, CI-safe, never fails)
//   studio [start|review] → Babysitter Studio (visual review)
//   audit-components → the reuse/theme audit alone (bin/ui-audit.mjs)
//   enable-hooks     → adoption → strict: hooks start blocking (refuses until the audit is green; --force)
//   fingerprint [repo…] [--register]  → theme fingerprint + look-alike products from the registry
//   restore [repo]   → put AFTER back if a Studio Time Travel review was killed mid-way
//   micro-check      → rendered contrast / row / overflow check on a running dev server
//   prepare          → playwright/prepare.mjs (login + crawl)
//   test-ui [...]    → playwright test with the bundled config
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const node = (file, args) => process.exit(spawnSync(process.execPath, [join(root, file), ...args], { stdio: "inherit" }).status ?? 1);
switch (cmd) {
  case "init": node("bin/ui-init.mjs", rest); break;
  case "check": node("bin/ui-check.mjs", rest); break;
  case "audit": {
    // audit --diff <base>: the CI gate — only problems this branch adds since it left <base> fail the run
    const i = rest.indexOf("--diff");
    if (i < 0) { node("bin/audit-summary.mjs", rest); break; }
    const base = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : "origin/main";
    const others = rest.filter((_, j) => j !== i && j !== i + 1);
    const git = (...a) => spawnSync("git", a, { encoding: "utf8" });
    if (git("rev-parse", "--verify", "--quiet", base).status !== 0) {
      console.error(`babysitter audit --diff: "${base}" is not known here. In CI check out with full history (actions/checkout fetch-depth: 0) or fetch the base branch.`);
      process.exit(2);
    }
    const mb = git("merge-base", "HEAD", base);
    const from = mb.status === 0 ? mb.stdout.trim() : base; // what the branch changed, not what the base gained since
    const format = others.includes("--format") ? [] : ["--format", process.env.GITHUB_ACTIONS ? "github" : "text"];
    node("bin/ui-check.mjs", ["--changed", from, ...format, ...others]);
    break;
  }
  case "install-hooks": node("bin/install-hooks.mjs", rest); break;
  case "studio": node("studio/bin/studio.mjs", rest); break;
  case "audit-components": node("bin/ui-audit.mjs", rest); break;
  case "enable-hooks": node("bin/enable-hooks.mjs", rest); break;
  case "fingerprint": node("bin/fingerprint.mjs", rest); break;
  case "restore": {
    const { recover } = await import("../lib/time-travel.js");
    const r = recover(rest.find((x) => !x.startsWith("-")) || process.cwd());
    console.log(!r ? "Nothing to restore." : r.busy ? `A Studio review (pid ${r.busy}) is still running — decide in the panel or stop it.` : `AFTER is back on disk${r.conflicts.length ? `; edits made during the review kept in ${r.conflicts.join(", ")}` : ""}.`);
    break;
  }
  case "micro-check": node("bin/micro-check.mjs", rest); break;
  case "prepare": node("playwright/prepare.mjs", rest); break;
  case "test-ui": process.exit(spawnSync("npx", ["playwright", "test", "-c", join(root, "playwright/playwright.config.ts"), ...rest], { stdio: "inherit", cwd: process.cwd() }).status ?? 1);
  default:
    console.log("usage: babysitter <init|check|audit|prepare|test-ui> [...]\n  init [repo] [--new|--existing] [--link|--vendor] [--ci] [--url URL] [--dev-url URL] [--dry-run] [--no-install] [--yes] [--force]");
    process.exit(cmd ? 2 : 0);
}
