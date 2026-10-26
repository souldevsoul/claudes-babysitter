// 5.7.0 — every skip is reported. A rule Babysitter decided does not apply (no claim, no credits, too few pages, no
// header found) is listed one by one and the run does not end "Clean." until the owner approves it; missing setup makes
// the run partial; "check by eye" / "not checked" notes and the findings carried from the last run are printed;
// findings.json, fix-plan and the Stop hook see all of it.
// RUN: node test/skip-report.test.mjs   (the last two cases start one browser each, one after the other)
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { summarize } from "../lib/run-summary.js";
import { classifySkip, parseSkip, approvalFor, ruleOfTitle } from "../lib/skip-kinds.js";
import { scope, config, setup, decision } from "../playwright/skip.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(TOOL, "bin/babysitter.mjs");
let n = 0, failed = 0;
async function t(name, fn) { try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const dirs = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), `bs-skip-${p}-`)); dirs.push(d); mkdirSync(join(d, ".babysitter"), { recursive: true }); return d; };
const env = { ...process.env, CI: "", GITHUB_ACTIONS: "", BABYSITTER_NO_VERSION_CHECK: "1" };

/** A Playwright JSON report: [file, describe, title, project, status, annotations] rows. */
const report = (rows) => ({
  suites: rows.map(([file, describe, title, project, status, annotations = [], msg = ""]) => ({ title: file, specs: [], suites: [{ title: describe, specs: [{ title, file, tests: [{ projectName: project, status: status === "skipped" ? "skipped" : status === "passed" ? "expected" : "unexpected", annotations: status === "skipped" ? annotations : [], results: [{ status, annotations: status === "skipped" ? [] : annotations, errors: msg ? [{ message: msg }] : [] }] }] }] }] })),
});
const skip = (description) => [{ type: "skip", description }];
// one passing test in every suite: a run with a suite that did not run is partial for its own reason
const BASE_ROWS = [["acceptance.spec.js", "acceptance /", "N4 no duplicate links", "desktop-1440", "passed"], ["run.spec.js", "run /", "3.8 in-app links open at the top", "desktop-1440", "passed"], ["content.spec.js", "content /", "CT1 no build notes", "desktop-1440", "passed"]];
const put = (d, rows, extra = {}) => {
  writeFileSync(join(d, ".babysitter/report.json"), JSON.stringify(report([...BASE_ROWS, ...rows])));
  writeFileSync(join(d, ".babysitter/crawl.json"), JSON.stringify(extra.crawl || {}));
  writeFileSync(join(d, ".babysitter/routes.json"), JSON.stringify(extra.routes || [{ path: "/", auth: false }, { path: "/wallet", auth: true }]));
  writeFileSync(join(d, ".babysitter/locales.json"), JSON.stringify({ default: "en", locales: [{ code: "en", default: true }] }));
};
const ALL = { viewports: ["desktop-1440"] };

try {
  await t("skip kinds: '<kind>: <rule>: <reason>' parses; older texts are classified; '*' takes the rule from the title; an unknown text is a decision", () => {
    assert.equal(decision("M2", "the product shows no credits"), "decision: M2: the product shows no credits");
    assert.deepEqual(parseSkip(setup("A4", "needs LOGIN_EMAIL: and config.login")), { kind: "setup", rule: "A4", reason: "needs LOGIN_EMAIL: and config.login" });
    assert.equal(parseSkip("B1 switched off in babysitter.config.json"), null);
    const c = (desc, title = "M2 the signed-in header shows the credit balance", project = "desktop-1440") => classifySkip({ title, project, annotations: desc == null ? [] : [{ type: "skip", description: desc }] });
    assert.deepEqual(c(scope("*", "runs at one mobile and one desktop width")), { kind: "scope", rule: "M2", reason: "runs at one mobile and one desktop width" });
    assert.equal(c("B1 switched off in babysitter.config.json → acceptance.skip").kind, "config");
    assert.equal(c("run at one mobile and one desktop width").kind, "scope");
    assert.equal(c("no signed-in storage — run `babysitter prepare` with LOGIN_EMAIL / LOGIN_PASSWORD").kind, "setup");
    assert.equal(c("the site does not claim 2FA").kind, "decision");
    assert.deepEqual(c(null), { kind: "decision", rule: "M2", reason: "skipped with no reason given" });
    assert.equal(c("whatever the product's own spec says", "checkout works", "product").kind, "product");
    assert.equal(ruleOfTitle("ST1/ST2 stage: no test entity"), "ST1/ST2");
    assert.equal(ruleOfTitle("1.18 colours come from the theme palette"), "1.18");
    assert.equal(ruleOfTitle("2FA two-factor sign-in"), "2FA");
    assert.equal(ruleOfTitle("CT12/CT25/CT29 no link labelled"), "CT12/CT25/CT29");
    assert.equal(approvalFor({ FM3: "no forms" }, "FM3/FM4", "/"), "no forms");
    assert.equal(approvalFor({ "M2 /wallet": "credits live elsewhere" }, "M2", "/wallet"), "credits live elsewhere");
    assert.equal(approvalFor({ "M2 /wallet": "x" }, "M2", "/other"), null);
  });

  await t("summary: by design is one count line, switched off is listed, setup missing makes the run partial, every decision is listed with its pages; needs-a-human and carried findings are printed; no 'Clean.'", () => {
    const d = tmp("all");
    put(d, [
      ["acceptance.spec.js", "acceptance /", "H2 everything clickable shows the hand cursor", "mobile-390", "skipped", skip(scope("H2", "no cursor on touch"))],
      ["acceptance.spec.js", "acceptance /", "N1 sticky header", "tablet-768", "skipped", skip(scope("*", "runs at one mobile and one desktop width"))],
      ["acceptance.spec.js", "acceptance /", "B1 no build notes", "desktop-1440", "skipped", skip(config("B1", "B1 switched off in babysitter.config.json → acceptance.skip: owner checks copy"))],
      ["acceptance.spec.js", "acceptance site-wide", "A4 sign out works with one click", "desktop-1440", "skipped", skip(setup("A4", "needs LOGIN_EMAIL / LOGIN_PASSWORD and config.login"))],
      ["acceptance.spec.js", "acceptance [signed-in] /wallet", "M2 the signed-in header shows the credit balance [owner rule]", "desktop-1440", "skipped", skip(decision("M2", "the product shows no credits (acceptance.headerBalance: true to require a balance anyway)"))],
      ["acceptance.spec.js", "acceptance site-wide", "P2 every policy with sections has the contents rail", "desktop-1440", "skipped", skip(decision("P2", "fewer than 3 policy pages (1 found; acceptance.policyPaths lists more)"))],
      ["acceptance.spec.js", "acceptance site-wide", "2FA two-factor sign-in is offered", "desktop-1440", "skipped", skip("the site does not claim 2FA (acceptance.twoFactor: if-claimed)")],
      ["babysitter.spec.js", "/", "1.20 the header's word controls share one typeface", "desktop-1440", "passed", [{ type: "decision", description: "1.20: no header bar found in the top 120 px: the header's typefaces were not compared" }]],
      ["forms.spec.js", "forms /", "FM3/FM4 a failed submit keeps the values", "desktop-1440", "passed", [{ type: "not checked", description: "  • Contact form sent nothing with sample values — not checked — form#contact" }]],
      ["babysitter.spec.js", "/", "6.4 text ≥12px", "desktop-1440", "passed", [{ type: "check by eye", description: "  • contrast over image — check by eye — h1.hero" }]],
      ["e2e/checkout.spec.ts", "checkout", "pays", "product", "skipped", skip("flaky on staging")],
    ]);
    // the last run had a finding on /about, a route this --changed run did not open
    writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ at: "2026-10-25T10:00:00.000Z", findings: [{ suite: "ui", route: "/about", auth: false, role: null, test: "2.1 no horizontal scroll", project: "mobile-390", items: [] }] }));
    const s = summarize({ root: d, cfg: {}, configured: ALL, rerun: "x", selection: { all: false, routes: ["/"], of: 3 } });
    assert.match(s.text, /By design: 2 test\(s\) skipped/);
    assert.match(s.text, /Switched off in babysitter\.config\.json:\n  · B1: switched off in babysitter\.config\.json → acceptance\.skip: owner checks copy \(1\)/);
    assert.match(s.text, /Setup missing — the run is PARTIAL \(1\)[^\n]*\n  ✗ A4: needs LOGIN_EMAIL/);
    assert.match(s.text, /Babysitter decided not to check \(4\)/);
    assert.match(s.text, /  \? M2: the product shows no credits .* — \/wallet \[signed-in\] @ desktop-1440/);
    assert.match(s.text, /  \? P2: fewer than 3 policy pages .* — site-wide @ desktop-1440/);
    assert.match(s.text, /  \? 2FA: the site does not claim 2FA/, "an old-style skip text is a decision, not dropped");
    assert.match(s.text, /  \? 1\.20 \(ran, nothing judged\): no header bar found/);
    assert.match(s.text, /Skipped by the product's own e2e: 1/);
    assert.match(s.text, /Needs a human \(2\)/);
    assert.match(s.text, /◎ \/ FM3\/FM4 @ desktop-1440: • Contact form sent nothing/);
    assert.match(s.text, /Carried from the last run, routes not opened \(1\)[^\n]*\n  ↺ \/about 2\.1 no horizontal scroll @ mobile-390/);
    assert.doesNotMatch(s.text, /\nClean\./);
    assert.match(s.text, /not a clean bill of health/);
    assert.deepEqual(s.setupRequired, [], "no login is declared: partial, but not a failing exit");
    const f = JSON.parse(readFileSync(join(d, ".babysitter/findings.json"), "utf8"));
    assert.deepEqual(f.decisions.map((g) => g.rule).sort(), ["1.20", "2FA", "M2", "P2"]);
    assert.equal(f.decisions.find((g) => g.rule === "M2").where[0].route, "/wallet");
    assert.deepEqual(f.setupMissing.map((g) => g.rule), ["A4"]);
    assert.equal(f.needsHuman.length, 2);
    assert.deepEqual(f.carried.map((x) => x.route), ["/about"]);
    assert.equal(f.findings.length, 1, "the carried finding stays in findings");
  });

  await t("summary: with decisions only, the verdict says 'N rules were decided not to apply' — not 'Clean.'", () => {
    const d = tmp("dec");
    put(d, [
      ["babysitter.spec.js", "/", "3.3 exactly one h1", "desktop-1440", "passed"],
      ["acceptance.spec.js", "acceptance site-wide", "P2 every policy", "desktop-1440", "skipped", skip(decision("P2", "fewer than 3 policy pages"))],
    ]);
    const s = summarize({ root: d, configured: ALL, rerun: "x" });
    assert.match(s.text, /No failures in what ran — 1 rule\(s\) were decided not to apply \(listed above\); not a clean bill of health/);
    assert.doesNotMatch(s.text, /\nClean\./);
  });

  await t("summary: 'Clean.' only when nothing is undecided — by design and switched-off skips are fine, an owner-approved decision moves to 'Not applicable (owner-approved)'", () => {
    const d = tmp("clean");
    const rows = [
      ["babysitter.spec.js", "/", "3.3 exactly one h1", "desktop-1440", "passed"],
      ["babysitter.spec.js", "/", "2.5 no word broken", "desktop-1440", "skipped", skip(scope("*", "narrow screens only"))],
      ["acceptance.spec.js", "acceptance /", "B1 no build notes", "desktop-1440", "skipped", skip(config("B1", "B1 switched off in babysitter.config.json → acceptance.skip"))],
      ["acceptance.spec.js", "acceptance site-wide", "P2 every policy", "desktop-1440", "skipped", skip(decision("P2", "fewer than 3 policy pages"))],
    ];
    put(d, rows);
    assert.doesNotMatch(summarize({ root: d, configured: ALL, rerun: "x" }).text, /\nClean\./, "unapproved");
    put(d, rows);
    const s = summarize({ root: d, cfg: { acceptance: { notApplicable: { P2: "one policy page only, by design" } } }, configured: ALL, rerun: "x" });
    assert.match(s.text, /Not applicable \(owner-approved\) \(1\):\n  · P2: fewer than 3 policy pages — approved: one policy page only, by design/);
    assert.doesNotMatch(s.text, /Babysitter decided not to check/);
    assert.match(s.text, /\nClean\./);
    const f = JSON.parse(readFileSync(join(d, ".babysitter/findings.json"), "utf8"));
    assert.deepEqual(f.decisions, []);
    assert.equal(f.approved[0].approved, "one policy page only, by design");
    put(d, rows.slice(0, 3));
    assert.match(summarize({ root: d, configured: ALL, rerun: "x" }).text, /\nClean\./);
  });

  await t("summary: a login babysitter.config.json declares but the run lacks is required setup — listed, the run fails (e2e exits 1)", () => {
    const d = tmp("req");
    put(d, [
      ["babysitter.spec.js", "/", "3.3 exactly one h1", "desktop-1440", "passed"],
      ["acceptance.spec.js", "acceptance site-wide signed in", "A5 sign-in / sign-up are not offered to a signed-in user", "desktop-1440", "skipped", skip(setup("A5/A7/2FA/A9", "no signed-in storage — run `babysitter prepare` with LOGIN_EMAIL / LOGIN_PASSWORD"))],
    ]);
    const s = summarize({ root: d, cfg: { login: { url: "/login" } }, configured: ALL, rerun: "x" });
    assert.deepEqual(s.setupRequired, ["A5/A7/2FA/A9"]);
    assert.match(s.text, /No failures in what ran — but 1 rule\(s\) did not run for missing setup \(listed above\); the run is partial/);
    assert.match(s.text, /SETUP MISSING for what babysitter\.config\.json declares \(A5\/A7\/2FA\/A9\) — the run is partial and fails \(exit 1\)/);
    assert.doesNotMatch(s.text, /\nClean\./);
    assert.match(readFileSync(BIN, "utf8"), /if \(!status && sum\.setupRequired\?\.length\) status = 1;/);
  });

  await t("fix-plan: the decisions and the missing setup come first — 'check these by hand or approve them' — also when there is nothing to fix", () => {
    const d = tmp("fp");
    writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ at: new Date().toISOString(), findings: [], decisions: [{ kind: "decision", rule: "M2", reason: "the product shows no credits", n: 1, where: [{ route: "/wallet", auth: true, role: "user", project: "desktop-1440" }] }], setupMissing: [{ kind: "setup", rule: "A4", reason: "needs LOGIN_EMAIL", n: 1, where: [] }] }));
    const r = spawnSync(process.execPath, [join(TOOL, "bin/fix-plan.mjs"), "--repo", d], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nothing to fix in the last run — but it did not check everything \(below\)/);
    assert.match(r.stdout, /## Not run — setup missing \(1\)[\s\S]*- A4: needs LOGIN_EMAIL/);
    assert.match(r.stdout, /## Babysitter decided not to check \(1\) — check these by hand, or approve them in babysitter\.config\.json → acceptance\.notApplicable[\s\S]*- M2: the product shows no credits — \/wallet \[user\]/);
    writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ at: new Date().toISOString(), findings: [{ suite: "ui", route: "/", test: "3.3 exactly one h1", project: "desktop-1440", items: [{ what: "2 h1 [3.3]", where: "h1" }], error: "" }], decisions: [{ rule: "P2", reason: "fewer than 3 policy pages", where: [{ route: null }] }] }));
    const r2 = spawnSync(process.execPath, [join(TOOL, "bin/fix-plan.mjs"), "--repo", d], { encoding: "utf8", env });
    const lines = r2.stdout.split("\n");
    assert.match(lines[0], /^# Babysitter fix plan — 1 problem/);
    assert.ok(lines.findIndex((l) => /decided not to check/.test(l)) < lines.findIndex((l) => /^## 3\.3/.test(l)), r2.stdout);
  });

  await t("Stop hook: a clean last run with decisions on a changed route lets the turn end but prints them", () => {
    const d = mkdtempSync(join(tmpdir(), "bs-skip-stop-")); dirs.push(d);
    const PAGE = 'export default function P() {\n  return <main className="p-4">ok</main>;\n}\n';
    for (const [p, c] of Object.entries({ "package.json": '{"name":"p","dependencies":{"next":"16"}}', "src/app/page.tsx": PAGE, "src/app/pricing/page.tsx": PAGE })) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); }
    const git = (...a) => execFileSync("git", a, { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const commit = (m) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", m], { cwd: d });
    git("init", "-q", "-b", "main"); git("add", "-A"); commit("init");
    spawnSync(process.execPath, [BIN, "init", ".", "--yes", "--new", "--link"], { cwd: d, encoding: "utf8", env });
    writeFileSync(join(d, "babysitter.config.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(d, "babysitter.config.json"), "utf8")), mode: "strict", themeFirst: false, contrast: false, devServer: "" }));
    git("add", "-A"); commit("wired");
    mkdirSync(join(d, ".babysitter"), { recursive: true });
    writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ at: new Date().toISOString(), findings: [], decisions: [{ rule: "M2", reason: "the product shows no credits", where: [{ route: "/pricing", project: "desktop-1440" }] }] }));
    writeFileSync(join(d, "src/app/pricing/page.tsx"), PAGE.replace("ok", "prices"));
    const r = spawnSync(process.execPath, [join(TOOL, "bin/hook-stop.mjs")], { cwd: d, input: "{}", encoding: "utf8", env: { ...env, CLAUDE_PROJECT_DIR: d } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const msg = JSON.parse(r.stdout).systemMessage;
    assert.match(msg, /did not check 1 rule\(s\) on the routes this work changed — not a clean bill of health/);
    assert.match(msg, /decided not to apply: M2: the product shows no credits/);
  });

  /* ── the specs themselves: a heuristic skip and a silent early return carry their decision into the report ── */
  if (!process.env.BABYSITTER_TEST_NO_BROWSER) {
  const srv = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><html lang=en><head><title>Home</title></head><body><main><h1>Home</h1><p>No header on this page.</p><a href='/terms'>Terms</a></main></body></html>"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const e2e = (d, args) => new Promise((res) => {
    const c = spawn(process.execPath, [BIN, "e2e", "--skip-prepare", ...args], { cwd: d, env: { ...env, BABYSITTER_ROOT: d, BASE_URL: BASE } });
    let out = ""; c.stdout.on("data", (x) => (out += x)); c.stderr.on("data", (x) => (out += x));
    c.on("close", (code) => res({ code, out }));
  });
  const site = (p) => { const d = tmp(p); writeFileSync(join(d, "babysitter.config.json"), JSON.stringify({ baseURL: BASE, routes: ["/"] })); return d; };
  try {
    await t("acceptance.spec P2 on a site with one page: the heuristic skip is a 'decision' annotation, listed in the summary and findings.json (no 'Clean.')", async () => {
      const d = site("p2");
      const r = await e2e(d, ["--only", "acceptance", "--project=desktop-1440", "-g", "P2 every policy"]);
      const rep = JSON.parse(readFileSync(join(d, ".babysitter/report.json"), "utf8"));
      const flat = []; const walk = (s) => { for (const x of s.suites || []) walk(x); for (const sp of s.specs || []) for (const tt of sp.tests || []) flat.push(tt); };
      for (const s of rep.suites) walk(s);
      const ann = flat.flatMap((x) => [...(x.annotations || []), ...(x.results || []).flatMap((y) => y.annotations || [])]).filter((a) => a.type === "skip");
      assert.ok(ann.some((a) => a.description === "decision: P2: fewer than 3 policy pages (0 found; acceptance.policyPaths lists more)"), JSON.stringify(ann) + r.out.slice(-1500));
      assert.match(r.out, /Babysitter decided not to check \(1\)[^\n]*\n  \? P2: fewer than 3 policy pages/);
      assert.doesNotMatch(r.out, /\nClean\./);
      assert.equal(JSON.parse(readFileSync(join(d, ".babysitter/findings.json"), "utf8")).decisions[0].rule, "P2");
    });
    await t("babysitter.spec 1.20/3.5 on a page with no header (express): the check passes, and its early return is noted as a decision", async () => {
      const d = site("hdr");
      const r = await e2e(d, ["--only", "ui", "--express", "--no-cache", "--project=desktop-1440", "-g", "1\\.20 the header's word controls"]);
      assert.match(r.out, /\? 1\.20 \(ran, nothing judged\): no header bar found in the top 120 px/, r.out.slice(-2500));
      assert.match(r.out, /\? 3\.5 \(ran, nothing judged\): no header bar found in the top 120 px: the desktop navigation was not looked for/);
      const f = JSON.parse(readFileSync(join(d, ".babysitter/findings.json"), "utf8"));
      assert.deepEqual(f.findings, [], "the verdict is unchanged: a pass");
      assert.deepEqual(f.decisions.map((g) => g.rule).sort(), ["1.20", "3.5"]);
    });
  } finally { srv.close(); }
  }
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}
if (failed) { console.error(`skip-report: ${failed} failed`); process.exit(1); }
console.log(`skip-report: ${n} cases passed`);
