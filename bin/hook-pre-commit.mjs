#!/usr/bin/env node
// git pre-commit: the same gate as the Claude Code Stop hook, for commits made by people or by any other
// generator (v0, Cursor, scripts). Static checks on changed lines, theme gates, then the rendered micro-check
// if a dev server is configured and running. Exit 1 blocks the commit; `git commit --no-verify` bypasses it.
import { spawnSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectMode, ADOPTION_NOTE } from "../lib/mode.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
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
  const cfgPath = join(repo, "babysitter.config.json");
  const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
  const studio = cfg.studio || {};
  if (studio.enabled) {
    const problems = [];
    const stat = run("ui-check.mjs", ["--repo", repo, "--changed", "HEAD", "--format", "json"]);
    try { for (const p of JSON.parse(stat.stdout).problems) problems.push({ message: `${p.rule}: ${p.message}`, file: p.file, line: p.line }); } catch {}
    const dom = run("micro-check.mjs", ["--repo", repo, "--format", "json"]);
    try { for (const p of JSON.parse(dom.stdout || "[]")) problems.push({ message: `${p.check}: ${p.what}`, route: p.route, selector: p.selector || undefined }); } catch {}
    const { requestReview } = await import("../studio/lib/review-client.js");
    const url = process.env.BABYSITTER_STUDIO || studio.url || "http://localhost:3001";
    const r = await requestReview({
      url, problems, title: `Commit review · ${problems.length} problem(s)`, timeoutMs: (studio.timeoutSec || 900) * 1000,
      onWaiting: () => process.stderr.write(`\n⏳ Claude's Babysitter found ${problems.length} problem(s). Waiting for a decision in Babysitter Studio — ${url}\n`),
      onComment: (t) => process.stderr.write(`💬 ${t}\n`),
    });
    if (r.decision === "approve") { process.stderr.write(`✅ Approved in Studio${r.text ? `: ${r.text}` : ""} — committing despite the findings.\n`); process.exit(0); }
    if (r.decision === "reject" || r.decision === "timeout") {
      process.stderr.write(`❌ ${r.decision === "timeout" ? "No decision in time" : "Rejected in Studio"}${r.text ? `: ${r.text}` : ""}. The commit is aborted.\n`);
      process.exit(1);
    }
    // "unavailable": fall through to the plain gate
  }
}
if (failed) {
  process.stderr.write(`\n✋ Claude's Babysitter blocked this commit.\n\n${out}\n(Fix the items above and commit again. To bypass deliberately: git commit --no-verify)\n`);
  process.exit(1);
}
