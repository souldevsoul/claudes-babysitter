#!/usr/bin/env node
// babysitter after-merge [--repo DIR] [--base REF] [--wait]
// Installed by `babysitter init` as the git post-merge and post-rewrite hooks: after a pull, merge or rebase brings in
// other people's (or another session's) commits, what they changed is checked again — Praxis (2026-10) was audited on
// a 13 Oct snapshot, then 83 commits were merged on top and nothing ran again.
//   1. static: ui-check on the files the merge changed (fast, always);
//   2. runtime: the full e2e suites (--quick) on the routes those files reach, when the dev server (config.devServer)
//      or BABYSITTER_AFTER_MERGE_URL answers — in the background (git is not held up), log in .babysitter/after-merge.log.
// Never fails the git command (a post-merge hook cannot undo the merge); the findings land in .babysitter/findings.json,
// where the Claude Code Stop hook picks them up.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, changedRoutes } from "../lib/changed-routes.js";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = opt("repo") || process.env.BABYSITTER_ROOT || process.cwd();
const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const say = (m) => console.error(`claudes-babysitter after-merge: ${m}`);
try {
  if (process.env.CI || process.env.BABYSITTER_SKIP_AFTER_MERGE) process.exit(0);
  const cfg = (() => { try { return JSON.parse(readFileSync(join(repo, "babysitter.config.json"), "utf8")); } catch { return {}; } })();
  const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
  const base = opt("base") || (git("rev-parse", "--verify", "--quiet", "ORIG_HEAD").stdout.trim()) || (git("rev-parse", "--verify", "--quiet", "HEAD@{1}").stdout.trim());
  if (!base) { say("no ORIG_HEAD — nothing to compare"); process.exit(0); }
  const changed = changedFiles(repo, base);
  if (!changed.length) process.exit(0);
  const dir = join(repo, ".babysitter");
  mkdirSync(dir, { recursive: true });
  // 1. static check of what came in
  const st = spawnSync(process.execPath, [join(TOOL, "bin/ui-check.mjs"), "--repo", repo, "--changed", base, "--format", "agent"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const statics = (st.stdout || "").trim();
  if (st.status === 1) say(`the merge brought UI problems (static check):\n${statics}`);
  // 2. the routes it reached, checked in the running app
  const { routes, unreached, ui } = changedRoutes(repo, changed, cfg);
  const record = { at: new Date().toISOString(), base, changed: changed.length, static: st.status === 1 ? "problems" : st.status === 0 ? "clean" : "error", routes, unreached, runtime: "not run" };
  if (!ui || !routes.length) { record.runtime = ui ? "no route reached" : "no UI file changed"; writeFileSync(join(dir, "after-merge.json"), JSON.stringify(record, null, 2)); process.exit(0); }
  const url = process.env.BABYSITTER_AFTER_MERGE_URL || cfg.devServer;
  let up = false;
  if (url) { try { await fetch(url, { signal: AbortSignal.timeout(3000) }); up = true; } catch {} }
  const RUN = existsSync(join(repo, "node_modules/claudes-babysitter/bin/babysitter.mjs")) ? "npx --no babysitter" : `node ${join(TOOL, "bin/babysitter.mjs")}`;
  const cmd = `ROUTES=${routes.join(",")} BASE_URL=${url || "<dev server>"} ${RUN} e2e --skip-prepare --quick`;
  if (!up) {
    record.runtime = `pending: no app answered at ${url || "(config.devServer not set)"}`;
    record.command = cmd;
    say(`${routes.length} changed route(s) need the runtime checks: ${routes.join(", ")}${unreached.length ? ` (no URL for ${unreached.join(", ")})` : ""}\n  start the app and run: ${cmd}`);
  } else if (args.includes("--wait")) {
    const r = spawnSync(process.execPath, [join(TOOL, "bin/babysitter.mjs"), "e2e", "--skip-prepare", "--quick"], { cwd: repo, env: { ...process.env, BABYSITTER_ROOT: repo, ROUTES: routes.join(","), BASE_URL: url }, stdio: "inherit" });
    record.runtime = r.status === 0 ? "clean" : "findings → .babysitter/findings.json";
  } else {
    const log = openSync(join(dir, "after-merge.log"), "w");
    const child = spawn(process.execPath, [join(TOOL, "bin/babysitter.mjs"), "e2e", "--skip-prepare", "--quick"], { cwd: repo, env: { ...process.env, BABYSITTER_ROOT: repo, ROUTES: routes.join(","), BASE_URL: url }, detached: true, stdio: ["ignore", log, log] });
    child.unref();
    record.runtime = `running in the background (pid ${child.pid}) → .babysitter/after-merge.log, findings → .babysitter/findings.json`;
    say(`checking ${routes.length} changed route(s) on ${url} in the background: ${routes.join(", ")} — log: .babysitter/after-merge.log`);
  }
  writeFileSync(join(dir, "after-merge.json"), JSON.stringify(record, null, 2));
} catch (e) {
  say(`skipped (${String(e.message || e).split("\n")[0]})`);
}
process.exit(0);
