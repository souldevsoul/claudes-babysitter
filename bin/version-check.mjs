#!/usr/bin/env node
// babysitter version-check [--repo <dir>] [--format text|github] [--quiet]
// Compares the product's copy of Claude's Babysitter (tools/claudes-babysitter, node_modules, or the package.json pin)
// with the latest release tag on GitHub: a minor behind warns, a major behind fails (exit 1). Offline or rate-limited:
// a note, exit 0. BABYSITTER_LATEST=vX.Y.Z pins the latest tag; the lookup is cached 12 h in ~/.claudes-babysitter.
import { resolve, join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRepo, annotate, exitCode } from "../lib/version-check.js";

const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = resolve(opt("--repo") || ".");
const format = opt("--format") || (process.env.GITHUB_ACTIONS ? "github" : "text");
const toolVersion = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")).version;
const r = checkRepo(repo, { toolVersion });
if (!(args.includes("--quiet") && r.level === "ok")) {
  const mark = r.level === "major" ? "✗" : r.level === "minor" ? "!" : r.level === "ok" ? "✓" : "·";
  console.log(format === "github" ? annotate(r) : `${mark} ${r.text}`);
}
process.exit(exitCode(r));
