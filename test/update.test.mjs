// 5.3.0 — copies must not fall behind: `babysitter update` (lib/update.js, bin/update.mjs) and the version check
// (lib/version-check.js, bin/version-check.mjs, `babysitter check`, `babysitter doctor`, the CI templates).
// Everything runs against a local "upstream" git repository with release tags, never the network.
// RUN: node test/update.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseVersion, latestFromTags, classify, exitCode, annotate, productVersion, latestRelease, checkRepo } from "../lib/version-check.js";
import { update, notesBetween, wireVersionCheck, vendorCopy, VENDOR_SKIP } from "../lib/update.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } };
const tmp = (p) => mkdtempSync(join(tmpdir(), `bs-update-${p}-`));
const sh = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }); if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`); return r.stdout; };
const put = (root, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); } };
const HOME = tmp("home"); // the latest-tag cache goes here, never into the real ~/.claudes-babysitter
const ENV = { ...process.env, BABYSITTER_HOME: HOME, BABYSITTER_LATEST: "" };
delete ENV.BABYSITTER_LATEST;

/* ── an upstream with releases 5.0.0, 5.1.0, 6.0.0 and a pre-release 6.1.0-rc.1 ── */
const UP = tmp("upstream");
sh(UP, "init", "-q", "-b", "main");
const CHANGELOG = (sections) => `# Changelog\n\nEarlier releases (4.11.1 and before) are described in the README under "What changed in …".\n\n${sections.join("\n")}`;
const README = "# Claude's Babysitter\n\n## What changed in 4.11.1 (two false alarms)\n\nA modal's backdrop.\n\n## What changed in 4.11.0 (sign-in behind a banner)\n\nThe banner.\n\n## What changed in 4.10.0 (controls)\n\nCards.\n\n## Quick start\n\nnpm i\n";
const S500 = "## 5.0.0 — every check runs everywhere (2026-10-16)\n\nAll suites by default.\n";
const S510 = "## 5.1.0 — false alarms (2026-10-19)\n\nIssue #3.\n";
const S600 = "## 6.0.0 — a major (2026-11-01)\n\nBreaking.\n";
const release = (v, files, sections) => {
  put(UP, { "package.json": JSON.stringify({ name: "claudes-babysitter", version: v }, null, 2), "CHANGELOG.md": CHANGELOG(sections), "README.md": README, ...files });
  sh(UP, "add", "-A"); sh(UP, "commit", "-qm", v); sh(UP, "tag", `v${v}`);
};
release("5.0.0", { "bin/babysitter.mjs": "// 5.0.0\n", "bin/old.mjs": "// removed in 5.1.0\n", "lib/a.js": "export const v = 500;\n", "test/fixtures/big.html": "<p>fixture</p>", "reports/private.txt": "never vendored" }, [S500]);
rmSync(join(UP, "bin/old.mjs"));
release("5.1.0", { "bin/babysitter.mjs": "// 5.1.0\n", "lib/a.js": "export const v = 510;\n", "lib/new.js": "export const added = true;\n" }, [S510, S500]);
release("6.0.0", { "bin/babysitter.mjs": "// 6.0.0\n" }, [S600, S510, S500]);
put(UP, { "package.json": JSON.stringify({ name: "claudes-babysitter", version: "6.1.0-rc.1" }) }); sh(UP, "commit", "-qam", "rc"); sh(UP, "tag", "v6.1.0-rc.1");

const OLD_LINT = "name: claudes-babysitter\non: [pull_request]\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci --prefix tools/claudes-babysitter\n      - run: node tools/claudes-babysitter/bin/ui-check.mjs --changed origin/main\n  runtime:\n    steps:\n      - run: npm ci --prefix tools/claudes-babysitter && npx --prefix tools/claudes-babysitter playwright install chromium\n";
const OLD_DEPLOY = "name: Babysitter after deploy\njobs:\n  e2e:\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install\n        run: npm ci --prefix tools/claudes-babysitter\n      - name: Babysitter — everything\n        run: node tools/claudes-babysitter/bin/babysitter.mjs e2e\n";

/** A product that vendored `version` from the upstream, with its own config, state and workflows, all committed. */
function product(version = "5.0.0") {
  const d = tmp("product");
  sh(d, "init", "-q", "-b", "main");
  const co = tmp("co");
  sh(UP, "worktree", "add", "-q", "--detach", co, `v${version}`);
  vendorCopy(co, join(d, "tools/claudes-babysitter"));
  sh(UP, "worktree", "remove", "--force", co);
  put(d, {
    "package.json": JSON.stringify({ name: "product", scripts: { babysitter: "node tools/claudes-babysitter/bin/babysitter.mjs" } }, null, 2),
    ".gitignore": "node_modules/\n.babysitter/\n",
    "babysitter.config.json": JSON.stringify({ mode: "adoption", baseURL: "https://example.test", allow: { emoji: true }, allowReasons: { emoji: "brand" } }, null, 2),
    ".babysitter/findings.json": JSON.stringify({ at: "2026-10-20", findings: [{ test: "2.14" }] }),
    ".babysitter/baseline.json": JSON.stringify({ "ui/no-raw-color": 12 }),
    "tools/claudes-babysitter/node_modules/dep/index.js": "module.exports = 1;\n",
    ".github/workflows/claudes-babysitter.yml": OLD_LINT,
    ".github/workflows/babysitter-deploy.yml": OLD_DEPLOY,
  });
  sh(d, "add", "-A"); sh(d, "commit", "-qm", "product");
  return d;
}
const snapshot = (d) => ["babysitter.config.json", ".babysitter/findings.json", ".babysitter/baseline.json", "tools/claudes-babysitter/node_modules/dep/index.js"].map((f) => readFileSync(join(d, f), "utf8"));

try {
  /* ═══════════ the version check ═══════════ */
  await t("parseVersion / latestFromTags: tags, pins and package versions; pre-releases and other tags are not releases", () => {
    assert.deepEqual(parseVersion("v5.2.0"), [5, 2, 0]);
    assert.deepEqual(parseVersion("github:souldevsoul/claudes-babysitter#v4.11.1"), [4, 11, 1]);
    assert.equal(parseVersion("main"), null);
    const lines = ["abc\trefs/tags/v4.11.1", "abd\trefs/tags/v5.2.0", "abe\trefs/tags/v5.10.0", "abf\trefs/tags/v6.0.0-rc.1", "abg\trefs/tags/nightly", "abh\trefs/tags/v5.9.9"].join("\n");
    assert.deepEqual(latestFromTags(lines), [5, 10, 0], "5.10.0 > 5.9.9 (numeric, not string order); the rc is not a release");
  });
  await t("classify: same / newer = ok, a patch behind = note, a minor behind = warn (exit 0), a major behind = fail (exit 1), unknown = never fails", () => {
    assert.equal(classify("5.2.0", "5.2.0").level, "ok");
    assert.equal(classify("5.3.0", "5.2.0").level, "ok");
    const p = classify("5.2.0", "5.2.1"); assert.equal(p.level, "patch"); assert.equal(exitCode(p), 0);
    const m = classify("5.0.0", "5.2.1"); assert.equal(m.level, "minor"); assert.equal(exitCode(m), 0); assert.match(m.text, /2 minor versions behind the latest release 5\.2\.1 — run `babysitter update`/);
    const M = classify("4.11.1", "5.2.1"); assert.equal(M.level, "major"); assert.equal(exitCode(M), 1); assert.match(M.text, /1 major version behind/);
    assert.match(annotate(M), /^::error title=Claude's Babysitter version::/);
    assert.match(annotate(m), /^::warning /);
    const u = classify("5.0.0", null); assert.equal(u.level, "unknown"); assert.equal(exitCode(u), 0); assert.match(u.text, /could not find the latest release/);
  });
  await t("productVersion: the vendored copy, an installed package, a package.json pin; nothing → null", () => {
    const d = product("5.0.0");
    assert.deepEqual(productVersion(d), { version: [5, 0, 0], source: "vendored", file: join(d, "tools/claudes-babysitter/package.json") });
    const p = tmp("pin"); put(p, { "package.json": JSON.stringify({ devDependencies: { "claudes-babysitter": "github:souldevsoul/claudes-babysitter#v5.1.0" } }) });
    assert.equal(productVersion(p).source, "pinned"); assert.deepEqual(productVersion(p).version, [5, 1, 0]);
    put(p, { "node_modules/claudes-babysitter/package.json": JSON.stringify({ version: "5.1.2" }) });
    assert.deepEqual(productVersion(p).version, [5, 1, 2], "what is installed wins over the pin");
    assert.equal(productVersion(tmp("none")), null);
  });
  await t("latestRelease: BABYSITTER_LATEST pins it; git ls-remote of the source otherwise; the default source is cached 12 h; a failed lookup is null", () => {
    assert.deepEqual(latestRelease({ env: { BABYSITTER_LATEST: "v9.1.0" } }), [9, 1, 0]);
    assert.deepEqual(latestRelease({ source: UP, env: ENV }), [6, 0, 0], "the highest release tag of the local upstream, not the rc");
    let calls = 0;
    const runner = () => { calls++; return { status: 0, stdout: "x\trefs/tags/v5.2.0\nx\trefs/tags/v5.3.0\n" }; };
    const env = { ...ENV, BABYSITTER_HOME: tmp("cache") };
    assert.deepEqual(latestRelease({ env, runner, now: 1000 }), [5, 3, 0]);
    assert.deepEqual(latestRelease({ env, runner, now: 2000 }), [5, 3, 0]);
    assert.equal(calls, 1, "the second lookup within 12 h comes from the cache");
    latestRelease({ env, runner, now: 1000 + 13 * 3600 * 1000 });
    assert.equal(calls, 2, "after 12 h it asks again");
    assert.equal(latestRelease({ source: join(tmp("nope"), "missing"), env: ENV }), null);
  });
  await t("bin/version-check.mjs: a major behind exits 1 (::error under GitHub Actions), a minor behind warns and exits 0, current is quiet with --quiet", () => {
    const d = product("5.0.0");
    const run = (latest, extra = [], env = {}) => spawnSync(process.execPath, [join(TOOL, "bin/version-check.mjs"), "--repo", d, ...extra], { encoding: "utf8", env: { ...ENV, BABYSITTER_LATEST: latest, GITHUB_ACTIONS: "", ...env } });
    const major = run("v6.0.0"); assert.equal(major.status, 1, major.stdout + major.stderr); assert.match(major.stdout, /✗ Claude's Babysitter 5\.0\.0 is 1 major version behind the latest release 6\.0\.0/);
    const gh = run("v6.0.0", [], { GITHUB_ACTIONS: "true" }); assert.match(gh.stdout, /^::error title=Claude's Babysitter version::/);
    const minor = run("v5.2.1"); assert.equal(minor.status, 0); assert.match(minor.stdout, /! .*2 minor versions behind/);
    const ok = run("v5.0.0", ["--quiet"]); assert.equal(ok.status, 0); assert.equal(ok.stdout, "");
  });
  await t("babysitter check: the static check, then the version line — a major behind fails it; --format json (machines, hooks) and BABYSITTER_NO_VERSION_CHECK leave it out", () => {
    const d = product("5.0.0");
    put(d, { "src/page.tsx": "export default function Page() { return <main className=\"p-4\">Hi</main>; }\n" });
    sh(d, "add", "-A"); sh(d, "commit", "-qm", "page");
    const run = (args, env = {}) => spawnSync(process.execPath, [join(TOOL, "bin/babysitter.mjs"), "check", "--repo", d, ...args], { encoding: "utf8", env: { ...ENV, BABYSITTER_LATEST: "v6.0.0", ...env } });
    const base = run([], { BABYSITTER_NO_VERSION_CHECK: "1" });
    const r = run([]);
    assert.match(r.stdout, /major version behind the latest release 6\.0\.0/, r.stdout + r.stderr);
    assert.equal(r.status, 1, "a major behind fails the check");
    assert.ok(!/latest release/.test(base.stdout), "BABYSITTER_NO_VERSION_CHECK=1: no version line");
    const j = run(["--format", "json"]);
    assert.ok(!/latest release/.test(j.stdout), "json output stays parseable");
    const minor = run([], { BABYSITTER_LATEST: "v5.1.0" });
    assert.match(minor.stdout, /1 minor version behind/);
    assert.equal(minor.status, base.status, "a minor behind does not change the exit code");
  });
  await t("babysitter doctor: names what is wired and what is not (the CI version check among them), then the version line", () => {
    const d = product("5.0.0");
    const r = spawnSync(process.execPath, [join(TOOL, "bin/babysitter.mjs"), "doctor", d], { encoding: "utf8", env: { ...ENV, BABYSITTER_LATEST: "v5.1.0" } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✓ babysitter\.config\.json/);
    assert.match(r.stdout, /✗ CI version check/);
    assert.match(r.stdout, /1 minor version behind/);
  });
  await t("the CI templates init --ci writes run the version check (vendored PR gate, after-deploy run, package-mode PR gate)", () => {
    for (const f of ["templates/.github/workflows/claudes-babysitter.yml", "templates/github-babysitter-deploy.yml", "templates/github-babysitter.yml"]) assert.match(readFileSync(join(TOOL, f), "utf8"), /version-check/, f);
    assert.match(readFileSync(join(TOOL, "templates/github-babysitter-deploy.yml"), "utf8"), /run: \{\{RUN\}\} version-check/);
  });

  /* ═══════════ babysitter update ═══════════ */
  await t("update to a tag: the copy is the tag's files (added, changed, removed), node_modules / config / .babysitter untouched, the notes since the old version", () => {
    const d = product("5.0.0");
    const before = snapshot(d);
    const r = update(d, { to: "v5.1.0", source: UP, install: false });
    assert.deepEqual([r.from, r.to, r.mode, r.upToDate], [[5, 0, 0], [5, 1, 0], "vendored", false]);
    const tool = join(d, "tools/claudes-babysitter");
    assert.equal(JSON.parse(readFileSync(join(tool, "package.json"), "utf8")).version, "5.1.0");
    assert.equal(readFileSync(join(tool, "lib/a.js"), "utf8"), "export const v = 510;\n");
    assert.ok(existsSync(join(tool, "lib/new.js")), "a file the release added");
    assert.ok(!existsSync(join(tool, "bin/old.mjs")), "a file the release removed is gone");
    assert.ok(!existsSync(join(tool, "test/fixtures")) && !existsSync(join(tool, "reports")) && !existsSync(join(tool, ".git")), "the same files init --vendor leaves out");
    assert.deepEqual(snapshot(d), before, "babysitter.config.json, .babysitter/ and the copy's node_modules are as they were");
    assert.deepEqual(r.notes.map((n) => n.title), ["5.1.0 — false alarms (2026-10-19)"]);
    assert.deepEqual(r.workflows.sort(), [".github/workflows/babysitter-deploy.yml", ".github/workflows/claudes-babysitter.yml"]);
    const again = update(d, { to: "v5.1.0", source: UP, install: false });
    assert.equal(again.upToDate, true, "already there: nothing to do");
  });
  await t("update with no --to takes the latest release tag (not a pre-release); a major jump lists every release in between, newest first", () => {
    const d = product("5.0.0");
    const r = update(d, { source: UP, install: false });
    assert.deepEqual(r.to, [6, 0, 0]);
    assert.deepEqual(r.notes.map((n) => n.version.join(".")), ["6.0.0", "5.1.0"]);
  });
  await t("notesBetween: CHANGELOG sections, then README 'What changed in …' for releases before the CHANGELOG (4.x → 5.x)", () => {
    const co = tmp("notes");
    sh(UP, "worktree", "add", "-q", "--detach", co, "v5.1.0");
    const n = notesBetween(co, [4, 11, 0], [5, 1, 0]);
    sh(UP, "worktree", "remove", "--force", co);
    assert.deepEqual(n.map((x) => `${x.version.join(".")} ${x.source}`), ["5.1.0 CHANGELOG.md", "5.0.0 CHANGELOG.md", "4.11.1 README.md"]);
    assert.match(n[2].body, /modal's backdrop/);
  });
  await t("update refuses to throw away uncommitted edits inside the copy (--force replaces them); a product without a copy is told to init", () => {
    const d = product("5.0.0");
    writeFileSync(join(d, "tools/claudes-babysitter/lib/a.js"), "// a local patch\n");
    assert.throws(() => update(d, { to: "v5.1.0", source: UP, install: false }), /uncommitted changes/);
    assert.equal(update(d, { to: "v5.1.0", source: UP, install: false, force: true }).to.join("."), "5.1.0");
    assert.throws(() => update(tmp("bare"), { to: "v5.1.0", source: UP }), /no copy of Claude's Babysitter.*babysitter init/);
    assert.throws(() => update(product("5.0.0"), { to: "v5.9.0", source: UP, install: false }), /could not fetch v5\.9\.0/);
  });
  await t("update of a pinned devDependency moves the pin (github:…#vX.Y.Z), copies nothing", () => {
    const p = tmp("pinned");
    put(p, { "package.json": JSON.stringify({ name: "p", devDependencies: { "claudes-babysitter": "github:souldevsoul/claudes-babysitter#v5.0.0" } }, null, 2) });
    const r = update(p, { to: "v5.1.0", source: UP, install: false });
    assert.equal(r.mode, "pinned");
    assert.equal(JSON.parse(readFileSync(join(p, "package.json"), "utf8")).devDependencies["claudes-babysitter"], "github:souldevsoul/claudes-babysitter#v5.1.0");
    assert.ok(!existsSync(join(p, "tools")));
  });
  await t("wireVersionCheck: added once after the install step (one-line and named-step shapes), never twice, a foreign workflow untouched", () => {
    const d = tmp("wf");
    put(d, { ".github/workflows/a.yml": OLD_LINT, ".github/workflows/b.yml": OLD_DEPLOY, ".github/workflows/other.yml": "name: ci\njobs:\n  t:\n    steps:\n      - run: npm test\n" });
    assert.deepEqual(wireVersionCheck(d).sort(), [".github/workflows/a.yml", ".github/workflows/b.yml"]);
    const a = readFileSync(join(d, ".github/workflows/a.yml"), "utf8"), b = readFileSync(join(d, ".github/workflows/b.yml"), "utf8");
    assert.match(a, /      - run: npm ci --prefix tools\/claudes-babysitter\n      # Claude's Babysitter version[^\n]*\n      - run: node tools\/claudes-babysitter\/bin\/babysitter\.mjs version-check\n      - run: node tools\/claudes-babysitter\/bin\/ui-check\.mjs/);
    assert.equal(a.match(/version-check/g).length, 1, "only the first install step (the lint job)");
    assert.match(b, /        run: npm ci --prefix tools\/claudes-babysitter\n      # Claude's Babysitter version[^\n]*\n      - run: node tools\/claudes-babysitter\/bin\/babysitter\.mjs version-check\n      - name: Babysitter — everything/);
    assert.deepEqual(wireVersionCheck(d), [], "idempotent");
    assert.equal(readFileSync(join(d, ".github/workflows/other.yml"), "utf8"), "name: ci\njobs:\n  t:\n    steps:\n      - run: npm test\n");
  });
  await t("bin/update.mjs: prints old → new, what was kept, the release notes and the next step; --dry-run writes nothing", () => {
    const d = product("5.0.0");
    const dry = spawnSync(process.execPath, [join(TOOL, "bin/update.mjs"), d, "--to", "v5.1.0", "--source", UP, "--dry-run"], { encoding: "utf8", env: ENV });
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /5\.0\.0 → 5\.1\.0 \(dry run: nothing written\)/);
    assert.equal(JSON.parse(readFileSync(join(d, "tools/claudes-babysitter/package.json"), "utf8")).version, "5.0.0");
    assert.ok(!/version-check/.test(readFileSync(join(d, ".github/workflows/claudes-babysitter.yml"), "utf8")));
    const r = spawnSync(process.execPath, [join(TOOL, "bin/update.mjs"), d, "--to", "v5.1.0", "--source", UP, "--no-install"], { encoding: "utf8", env: ENV });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Claude's Babysitter 5\.0\.0 → 5\.1\.0 — tools\/claudes-babysitter replaced/);
    assert.match(r.stdout, /Kept as they are: babysitter\.config\.json, \.babysitter\//);
    assert.match(r.stdout, /## 5\.1\.0 — false alarms[\s\S]*Issue #3\./);
    assert.match(r.stdout, /CI: the version check added to/);
    const bad = spawnSync(process.execPath, [join(TOOL, "bin/update.mjs"), tmp("x"), "--source", UP], { encoding: "utf8", env: ENV });
    assert.equal(bad.status, 2); assert.match(bad.stderr, /no copy/);
  });
  await t("init --vendor and update copy the same files (one skip list)", () => {
    assert.ok(VENDOR_SKIP.test("test/fixtures/x.html") && VENDOR_SKIP.test("node_modules/a") && VENDOR_SKIP.test("reports/r.md") && !VENDOR_SKIP.test("lib/a.js"));
    assert.match(readFileSync(join(TOOL, "bin/ui-init.mjs"), "utf8"), /vendorCopy\(TOOL, toolPath/);
  });
  await t("checkRepo on this repository itself: the running tool's own version when the product has no copy", () => {
    const r = checkRepo(tmp("empty"), { toolVersion: "5.0.0", env: { BABYSITTER_LATEST: "v5.0.0" } });
    assert.equal(r.level, "ok"); assert.equal(r.source, "running");
  });
} finally {
  for (const d of readdirSync(tmpdir()).filter((f) => f.startsWith("bs-update-"))) rmSync(join(tmpdir(), d), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
