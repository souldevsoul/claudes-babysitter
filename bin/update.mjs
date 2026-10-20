#!/usr/bin/env node
// babysitter update [repo] [--to vX.Y.Z] [--source <git url | local repo>] [--dry-run] [--no-install] [--force] [--brief]
// Re-vendors the latest release (or --to) into the product: tools/claudes-babysitter is replaced by the tag's files,
// or the devDependency pin is moved. babysitter.config.json, .babysitter/ (findings, baseline, state) and the
// product's own files are left as they are. Prints what changed since the old version (--brief: headings only), and
// adds the version check to the CI workflows `init --ci` wrote before 5.3.0.
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { update, VENDOR_DIR } from "../lib/update.js";
import { fmt, REPO_URL } from "../lib/version-check.js";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
if (has("--help") || has("-h")) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 7).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
const valued = new Set(["--to", "--source"]);
const repo = resolve(args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1])) || ".");
const dry = has("--dry-run");
try {
  const r = update(repo, { to: opt("--to"), source: opt("--source") || REPO_URL, dry, install: !has("--no-install"), force: has("--force"), log: (m) => console.log(`  … ${m}`) });
  if (r.upToDate) { console.log(`Claude's Babysitter ${fmt(r.from)} in ${repo} is already at ${fmt(r.to)} or newer — nothing to do.`); process.exit(0); }
  console.log(`\nClaude's Babysitter ${fmt(r.from)} → ${fmt(r.to)}${dry ? " (dry run: nothing written)" : ""} — ${r.mode === "vendored" ? `${VENDOR_DIR} replaced (${r.files} files)` : "the devDependency pin moved; run npm install"}`);
  console.log("Kept as they are: babysitter.config.json, .babysitter/ (findings, baseline, state), the product's e2e, hooks and CLAUDE.md.");
  if (r.workflows.length) console.log(`CI: the version check added to ${r.workflows.join(", ")}`);
  console.log(`\nWhat changed since ${fmt(r.from)} (${r.notes.length} release${r.notes.length === 1 ? "" : "s"}):\n`);
  for (const n of r.notes) console.log(has("--brief") ? `  • ${n.title}` : `## ${n.title}${n.source === "README.md" ? "  (README)" : ""}\n\n${n.body}\n`);
  console.log(`\nNext: run the suite (babysitter check, babysitter e2e --quick), then commit ${r.mode === "vendored" ? VENDOR_DIR : "package.json and the lock file"}${r.workflows.length ? " and the workflows" : ""}.`);
} catch (e) {
  console.error(`babysitter update: ${e.message}`);
  process.exit(2);
}
