// Team rollout: `install-hooks` from package.json "prepare", and `audit --diff` as the CI gate.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(TOOL, "bin/babysitter.mjs");
let n = 0; const ok = (m) => { n++; console.log("  ✓", m); };
const dirs = [];
const git = (d, ...a) => execFileSync("git", a, { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (d, msg, extra = []) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", msg, ...extra], { cwd: d, encoding: "utf8" });
const bs = (d, args, env = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd: d, encoding: "utf8", env: { ...process.env, CI: "", GITHUB_ACTIONS: "", GITHUB_STEP_SUMMARY: "", ...env } });
function project(files = {}) {
  const d = mkdtempSync(join(tmpdir(), "bs-team-")); dirs.push(d);
  const all = { "package.json": '{"name":"p","dependencies":{"next":"16","tailwindcss":"4"}}', "src/app/page.tsx": 'export default function P() {\n  return <main className="p-4">ok</main>;\n}\n', ...files };
  for (const [p, c] of Object.entries(all)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); }
  git(d, "init", "-q", "-b", "main"); git(d, "add", "-A"); commit(d, "init");
  return d;
}
const hookOf = (d) => join(d, ".git/hooks/pre-commit");

try {
  // ── install-hooks ──
  let d = project();
  let r = bs(d, ["install-hooks"]);
  assert.equal(r.status, 0); assert.equal(r.stdout + r.stderr, "", "silent");
  assert.match(readFileSync(hookOf(d), "utf8"), /claudes-babysitter pre-commit gate/);
  const first = readFileSync(hookOf(d), "utf8");
  assert.equal(bs(d, ["install-hooks"]).status, 0); assert.equal(readFileSync(hookOf(d), "utf8"), first, "idempotent");
  ok("installs the pre-commit gate silently and idempotently");

  // regression: INIT_CWD (set by `npm run` in another package) must not redirect the hook to that repo
  const other = project();
  d = project();
  assert.equal(bs(d, ["install-hooks"], { INIT_CWD: other }).status, 0);
  assert.ok(existsSync(hookOf(d)) && !existsSync(hookOf(other)), "installed in the project it runs in, not in INIT_CWD");
  ok("ignores INIT_CWD: the hook lands in the project that runs prepare");

  const ci = project();
  assert.equal(bs(ci, ["install-hooks"], { CI: "true" }).status, 0);
  assert.ok(!existsSync(hookOf(ci)), "nothing in CI");
  const plain = mkdtempSync(join(tmpdir(), "bs-nogit-")); dirs.push(plain);
  r = bs(plain, ["install-hooks"]); assert.equal(r.status, 0); assert.equal(r.stdout + r.stderr, "");
  ok("does nothing in CI or outside a git work tree, never fails the install");

  // a foreign hook is kept and still runs first
  d = project();
  writeFileSync(hookOf(d), "#!/bin/sh\necho foreign-ran >&2\nexit 1\n"); chmodSync(hookOf(d), 0o755);
  assert.equal(bs(d, ["install-hooks"]).status, 0);
  assert.match(readFileSync(join(d, ".git/hooks/pre-commit.local"), "utf8"), /foreign-ran/);
  writeFileSync(join(d, "a.txt"), "x"); git(d, "add", "-A");
  r = commit(d, "blocked by the foreign hook");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /foreign-ran/);
  ok("a foreign pre-commit is kept as pre-commit.local and runs first (its failure still blocks)");

  // core.hooksPath owned by another tool (husky): untouched, with a hint
  d = project();
  mkdirSync(join(d, ".husky"), { recursive: true }); writeFileSync(join(d, ".husky/pre-commit"), "npx lint-staged\n");
  git(d, "config", "core.hooksPath", ".husky");
  r = bs(d, ["install-hooks"]);
  assert.equal(r.status, 0); assert.equal(readFileSync(join(d, ".husky/pre-commit"), "utf8"), "npx lint-staged\n");
  assert.match(r.stderr, /Add this line to it: node node_modules\/claudes-babysitter\/bin\/hook-pre-commit\.mjs/);
  ok("respects core.hooksPath (husky): never rewrites another tool's hook, says what to add");

  // the hook runs the project's node_modules copy; without it, the commit passes with a note (CI is the gate)
  d = project({ "babysitter.config.json": '{"mode":"strict","themeFirst":false}' });
  bs(d, ["install-hooks"]);
  writeFileSync(join(d, "src/app/page.tsx"), 'export default function P() {\n  return <main className="p-4 bg-blue-500">ok</main>;\n}\n'); git(d, "add", "-A");
  r = commit(d, "no node_modules yet");
  assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /not installed \(run npm install\)/);
  mkdirSync(join(d, "node_modules"), { recursive: true }); symlinkSync(TOOL, join(d, "node_modules/claudes-babysitter"));
  writeFileSync(join(d, ".gitignore"), "node_modules\n");
  writeFileSync(join(d, "src/app/page.tsx"), 'export default function P() {\n  return <main className="p-4 bg-red-500">ok</main>;\n}\n'); git(d, "add", "-A");
  r = commit(d, "bad colour");
  assert.notEqual(r.status, 0); assert.match(r.stderr + r.stdout, /bg-red-500/);
  ok("the hook runs node_modules/claudes-babysitter; missing → passes with a note, present → blocks new debt");

  // ── audit --diff ──
  d = project({ "src/app/old.tsx": 'export function Old() {\n  return <p className="bg-blue-500 p-2">old debt</p>;\n}\n' });
  git(d, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(d, "checkout", "-q", "-b", "feature");
  writeFileSync(join(d, "src/app/old.tsx"), 'export function Old() {\n  return <p className="bg-blue-500 p-3">old debt</p>;\n}\n');
  git(d, "add", "-A"); commit(d, "touch a line that already had debt");
  r = bs(d, ["audit", "--diff", "origin/main"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  ok("audit --diff: a PR that only touches old debt passes");

  writeFileSync(join(d, "src/app/new.tsx"), 'export function New() {\n  return <p className="text-red-500">new debt</p>;\n}\n');
  git(d, "add", "-A"); commit(d, "new debt");
  const summary = join(d, "summary.md");
  r = bs(d, ["audit", "--diff", "origin/main"], { GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: summary });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^::error file=src\/app\/new\.tsx,line=2,title=Babysitter ui\/no-raw-palette::"text-red-500" is a raw palette colour/m);
  assert.ok(!/old\.tsx/.test(r.stdout), "old debt is not annotated");
  assert.match(readFileSync(summary, "utf8"), /1 new problem\(s\)[\s\S]*src\/app\/new\.tsx:2/);
  ok("audit --diff in GitHub Actions: exit 1, an ::error annotation on the new line, a step summary");

  // the base moved on after the branch: only the branch's own changes count (merge-base)
  git(d, "checkout", "-q", "main");
  writeFileSync(join(d, "src/app/main-only.tsx"), 'export function M() {\n  return <p className="text-green-500">landed on main</p>;\n}\n');
  git(d, "add", "-A"); commit(d, "main moves on"); git(d, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(d, "checkout", "-q", "feature");
  r = bs(d, ["audit", "--diff", "origin/main"]);
  assert.ok(!/main-only/.test(r.stdout), "debt that landed on main is not the PR's");
  r = bs(d, ["audit", "--diff", "origin/nope"]);
  assert.equal(r.status, 2); assert.match(r.stderr, /fetch-depth: 0/);
  ok("audit --diff compares with the merge-base; an unknown base exits 2 with the fetch-depth hint");
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
console.log(`team: ${n} cases passed`);
