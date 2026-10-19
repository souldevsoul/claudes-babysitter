// RUN area: findings get re-checked and FIXED — init wires post-merge / post-rewrite hooks, the after-deploy CI run and
// the "findings are blocking" agent block, and warns about anything still missing; the Stop hook blocks "done" while the
// last run has findings on routes the work changed; after-merge re-checks what a merge brought in; the run summary and
// fix-plan read the report.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { summarize, parseTitle, bullets } from "../lib/run-summary.js";
import { wiringStatus } from "../lib/wiring.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(TOOL, "bin/babysitter.mjs");
let n = 0, failed = 0;
async function t(name, fn) { try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const dirs = [];
const git = (d, ...a) => execFileSync("git", a, { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "" } });
const commit = (d, msg) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", msg], { cwd: d, encoding: "utf8", env: { ...process.env, CI: "" } });
const PAGE = 'export default function P() {\n  return <main className="p-4">ok</main>;\n}\n';
function project() {
  const d = mkdtempSync(join(tmpdir(), "bs-run-wire-")); dirs.push(d);
  for (const [p, c] of Object.entries({ "package.json": '{"name":"p","dependencies":{"next":"16"}}', "src/app/page.tsx": PAGE, "src/app/pricing/page.tsx": PAGE, "src/app/about/page.tsx": PAGE })) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); }
  git(d, "init", "-q", "-b", "main"); git(d, "add", "-A"); commit(d, "init");
  return d;
}
const env = { ...process.env, CI: "", GITHUB_ACTIONS: "" };
try {
  await t("init (vendor-less link mode): post-merge + post-rewrite hooks, the blocking agent block, and a loud warning for the CI that is missing", async () => {
    const d = project();
    const r = spawnSync(process.execPath, [BIN, "init", ".", "--yes", "--new", "--link"], { cwd: d, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const h of ["post-merge", "post-rewrite"]) assert.match(readFileSync(join(d, ".git/hooks", h), "utf8"), /after-merge\.mjs/);
    assert.equal(JSON.parse(readFileSync(join(d, "babysitter.config.json"), "utf8")).name, "p", "init records the product name (favicon registry, reports)");
    const md = readFileSync(join(d, "CLAUDE.md"), "utf8");
    assert.match(md, /Babysitter findings are blocking/);
    assert.match(md, /e2e --skip-prepare --last-failed/);
    assert.match(md, /fix-plan/);
    assert.match(r.stderr + r.stdout, /NOT WIRED into this repo \(after init\)[\s\S]*CI gate on pull requests[\s\S]*CI full run after deploy/);
    assert.ok(!/post-merge re-check/.test(r.stderr), "hooks are wired: not listed as missing");
  });
  await t("init --ci (package mode): the after-deploy workflow (deployment_status → the full suite + fix plan); install-hooks adds post-merge / post-rewrite; nothing left unwired", async () => {
    const d = project();
    const pj = JSON.parse(readFileSync(join(d, "package.json"), "utf8"));
    pj.devDependencies = { "claudes-babysitter": "github:souldevsoul/claudes-babysitter#v4.11.1" };
    writeFileSync(join(d, "package.json"), JSON.stringify(pj, null, 2));
    mkdirSync(join(d, "node_modules"), { recursive: true }); symlinkSync(TOOL, join(d, "node_modules/claudes-babysitter"));
    writeFileSync(join(d, ".gitignore"), "node_modules\n");
    const r = spawnSync(process.execPath, [join(d, "node_modules/claudes-babysitter/bin/babysitter.mjs"), "init", ".", "--yes", "--existing", "--ci"], { cwd: d, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const wf = readFileSync(join(d, ".github/workflows/babysitter-deploy.yml"), "utf8");
    assert.match(wf, /deployment_status/);
    assert.match(wf, /run: npx --no babysitter e2e\n/);
    assert.match(wf, /npx --no babysitter fix-plan/);
    assert.match(wf, /run: npm ci\n/);
    assert.ok(!/\{\{(RUN|INSTALL)\}\}/.test(wf), "no placeholders left");
    for (const h of ["post-merge", "post-rewrite"]) assert.match(readFileSync(join(d, ".git/hooks", h), "utf8"), /node_modules\/claudes-babysitter\/bin\/after-merge\.mjs/);
    assert.deepEqual(wiringStatus(d).missing, []);
    assert.ok(!/NOT WIRED/.test(r.stdout + r.stderr), r.stdout + r.stderr);
  });
  await t("Stop hook: findings of the last run on a route the work changed block finishing (strict); a change elsewhere does not", async () => {
    const d = project();
    spawnSync(process.execPath, [BIN, "init", ".", "--yes", "--new", "--link"], { cwd: d, encoding: "utf8", env });
    writeFileSync(join(d, "babysitter.config.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(d, "babysitter.config.json"), "utf8")), mode: "strict", themeFirst: false, contrast: false, devServer: "" }));
    git(d, "add", "-A"); commit(d, "wired");
    mkdirSync(join(d, ".babysitter"), { recursive: true });
    writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ at: new Date().toISOString(), findings: [{ suite: "states/locales", route: "/pricing", auth: false, role: null, locale: "az", test: "i18n [az] 2.1/2.10 …", project: "mobile-360", items: [{ what: "[az] sticks out of its card by 57px [2.10, P16]", where: "button.cta" }], error: "" }] }));
    const stop = () => spawnSync(process.execPath, [join(TOOL, "bin/hook-stop.mjs")], { cwd: d, input: "{}", encoding: "utf8", env: { ...env, CLAUDE_PROJECT_DIR: d } });
    writeFileSync(join(d, "src/app/about/page.tsx"), PAGE.replace("ok", "about us"));
    let r = stop();
    assert.equal(r.status, 0, `a change to /about is not blocked by a finding on /pricing: ${r.stderr}`);
    writeFileSync(join(d, "src/app/pricing/page.tsx"), PAGE.replace("ok", "prices"));
    r = stop();
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /findings are blocking/);
    assert.match(r.stderr, /\/pricing \[az\] @ mobile-360/);
    assert.match(r.stderr, /e2e --skip-prepare --last-failed/);
    assert.match(r.stderr, /fix-plan/);
    // re-checked and clean → the hook lets the turn end
    writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ at: new Date().toISOString(), findings: [] }));
    assert.equal(stop().status, 0);
  });
  await t("after-merge (git post-merge): a pull that changes /pricing re-checks it — static now, the runtime run recorded as pending with the exact command when no app answers", async () => {
    const d = project();
    spawnSync(process.execPath, [BIN, "init", ".", "--yes", "--new", "--link"], { cwd: d, encoding: "utf8", env });
    writeFileSync(join(d, "babysitter.config.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(d, "babysitter.config.json"), "utf8")), themeFirst: false, contrast: false, devServer: "http://127.0.0.1:9" }));
    git(d, "add", "-A"); commit(d, "wired");
    git(d, "checkout", "-q", "-b", "other");
    writeFileSync(join(d, "src/app/pricing/page.tsx"), PAGE.replace("ok", "new prices"));
    git(d, "add", "-A"); commit(d, "pricing changed elsewhere");
    git(d, "checkout", "-q", "main");
    const m = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "merge", "-q", "--no-ff", "-m", "merge other", "other"], { cwd: d, encoding: "utf8", env });
    assert.equal(m.status, 0, m.stderr);
    assert.match(m.stderr, /changed route\(s\) need the runtime checks: \/pricing/);
    const rec = JSON.parse(readFileSync(join(d, ".babysitter/after-merge.json"), "utf8"));
    assert.deepEqual(rec.routes, ["/pricing"]);
    assert.equal(rec.static, "clean");
    assert.match(rec.runtime, /pending: no app answered/);
    assert.match(rec.command, /ROUTES=\/pricing .* e2e --skip-prepare --quick/);
  });
  await t("run summary: titles parse to suite / route / role / locale; bullets; NOT RUN suites, viewports, languages, unreached routes; findings.json; the --last-failed command", async () => {
    assert.deepEqual(parseTitle(["run.spec.ts", "run [signed-in: specialist] /tasks/1", "states [az] 2.10 …"]), { suite: "states/locales", route: "/tasks/1", role: "specialist", auth: true, locale: "az" });
    assert.deepEqual(parseTitle(["acceptance.spec.ts", "acceptance /pricing", "B1 …"]).route, "/pricing");
    assert.deepEqual(parseTitle(["content.spec.ts", "content [kk] [signed-in: buyer] /wallet", "CT1 …"]), { suite: "content", route: "/wallet", role: "buyer", auth: true, locale: "kk" });
    assert.equal(parseTitle(["layout.spec.ts", "/pricing layout", "L1 …"]).route, "/pricing");
    assert.equal(parseTitle(["forms.spec.ts", "forms [signed-in] /settings", "FM3 …"]).role, "user");
    // layout and forms are suites of their own in the summary (5.0.1): a run that left one out says so
    assert.equal(parseTitle(["layout.spec.ts", "/pricing layout", "L1 …"]).suite, "layout");
    assert.equal(parseTitle(["forms.spec.ts", "forms /signin", "FM3 …"]).suite, "forms");
    assert.deepEqual(bullets("Error:   • a — b\n  • c — d e — f"), [{ what: "a", where: "b" }, { what: "c — d e", where: "f" }]);
    const d = mkdtempSync(join(tmpdir(), "bs-run-sum-")); dirs.push(d);
    mkdirSync(join(d, ".babysitter"));
    const spec = (file, title, describe, project, status, msg = "") => ({ title: file, specs: [], suites: [{ title: describe, specs: [{ title, file, tests: [{ projectName: project, status: status === "skipped" ? "skipped" : "expected", annotations: status === "skipped" ? [{ type: "skip", description: "acceptance.skip: B1 switched off in babysitter.config.json → acceptance.skip" }] : [], results: [{ status, errors: msg ? [{ message: msg }] : [] }] }] }] }] });
    writeFileSync(join(d, ".babysitter/report.json"), JSON.stringify({ suites: [spec("babysitter.spec.ts", "2.1 no horizontal scroll", "/pricing", "mobile-390", "failed", "Error:   • extends to x=0..420 — div.hero"), spec("babysitter.spec.ts", "3.3 one h1", "/", "desktop-1440", "passed"), spec("acceptance.spec.ts", "B1 no build notes", "acceptance /", "desktop-1440", "skipped")] }));
    writeFileSync(join(d, ".babysitter/crawl.json"), JSON.stringify({ roles: [{ name: "user", ok: true, pages: 3 }, { name: "admin", ok: false, why: "no credentials" }], missingDynamic: ["/tasks/[id]"], capped: [] }));
    writeFileSync(join(d, ".babysitter/locales.json"), JSON.stringify({ default: "en", locales: [{ code: "en", default: true }, { code: "az", verified: true }, { code: "kk", verified: false, why: "stayed in English" }] }));
    writeFileSync(join(d, ".babysitter/routes.json"), JSON.stringify([{ path: "/", auth: false }, { path: "/pricing", auth: false }]));
    const s = summarize({ root: d, only: "ui", args: ["--project=mobile-390", "--project=desktop-1440"], configured: { viewports: ["mobile-360", "mobile-390", "tablet-768", "laptop-1280", "desktop-1440"] }, rerun: "npx --no babysitter e2e --skip-prepare --last-failed" });
    assert.match(s.text, /acceptance ✗ NOT RUN/);
    assert.match(s.text, /NOT RUN: mobile-360, tablet-768, laptop-1280 \(--project\)/);
    assert.match(s.text, /NOT CHECKED: az; kk \(could not be switched on: stayed in English\)/);
    assert.match(s.text, /role "admin" NOT CHECKED: no credentials/);
    assert.match(s.text, /dynamic routes NOT REACHED .*\/tasks\/\[id\]/);
    assert.match(s.text, /Switched off in babysitter\.config\.json:\n  · acceptance\.skip: B1/);
    assert.match(s.text, /\/pricing\n    ✗ 2\.1 no horizontal scroll @ mobile-390 — 1 item\(s\): extends to x=0\.\.420/);
    assert.match(s.text, /npx --no babysitter e2e --skip-prepare --last-failed/);
    const again = summarize({ root: d, lastFailed: true, configured: { viewports: ["mobile-360", "mobile-390"] }, rerun: "x" });
    assert.match(again.text, /Re-check of the last run's failures/);
    assert.ok(!/NOT RUN/.test(again.text), again.text);
    const f = JSON.parse(readFileSync(join(d, ".babysitter/findings.json"), "utf8"));
    assert.equal(f.findings.length, 1);
    assert.deepEqual(f.findings[0].items, [{ what: "extends to x=0..420", where: "div.hero" }]);
  });
  await t("e2e: a boolean flag never swallows the spec file after it (`e2e --skip-prepare --quick forms.spec` runs forms.spec only)", async () => {
    const d = project();
    writeFileSync(join(d, "babysitter.config.json"), JSON.stringify({ baseURL: "http://127.0.0.1:9", routes: ["/"] }));
    const r = spawnSync(process.execPath, [BIN, "e2e", "--skip-prepare", "--quick", "forms.spec", "--list"], { cwd: d, encoding: "utf8", env: { ...env, BABYSITTER_ROOT: d } });
    const o = r.stdout + r.stderr;
    assert.match(o, /Total: \d+ tests? in 1 file/, o.slice(-1500));
    assert.match(o, /forms\.spec\.ts/);
    assert.ok(!/layout\.spec\.ts|content\.spec\.ts/.test(o), "only the named spec");
    const listed = o.split("\n").filter((l) => /^\s+\[[\w-]+\] › /.test(l));
    assert.ok(listed.length && listed.every((l) => /\[(mobile-390|desktop-1440)\]/.test(l)), `--quick still applies: ${listed.slice(0, 3).join(" | ")}`);
  });
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
if (failed) { console.error(`run-wiring: ${failed} failed`); process.exit(1); }
console.log(`run-wiring: ${n} cases passed`);
