// Express parity: the same fixture product (test/fixtures/express/server.mjs — pages built to break many checks, a
// dialog, a dropdown menu, a burger menu, a form, a second language, a signed-in role) checked by `babysitter e2e`
// and by `babysitter e2e --express`. Every check result must be the same — status, and for failures the route, role,
// locale, project, test, items (what / where) and message — and so must findings.json. Then the express run again
// with its result cache: nothing changed, so passes are reused ("cached (unchanged render)") and the findings stay
// identical; a failure is never served from the cache.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "./fixtures/express/server.mjs";
import { resultsWithExpress } from "../lib/run-summary.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEEP = process.env.KEEP_PARITY;
const sh = (args, opts) => new Promise((res) => {
  const c = spawn(process.execPath, args, opts);
  let out = "";
  c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  const timer = setTimeout(() => c.kill("SIGKILL"), opts.timeout || 1_800_000);
  c.on("close", (status) => { clearTimeout(timer); res({ status, out }); });
});
let failed = 0;
async function t(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }

const site = await start();
const repo = mkdtempSync(join(tmpdir(), "bs-express-"));
writeFileSync(join(repo, "package.json"), '{"name":"ledgerly","private":true}');
writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify({
  name: "ledgerly", baseURL: site.url, login: { url: "/login" }, routes: ["/", "/pricing", "/form", "/terms"],
  acceptance: { company: { name: "Ledgerly", supportEmail: "help@ledgerly.test" }, auth: { signIn: "/login" } },
}));
const env = { ...process.env, BABYSITTER_ROOT: repo, BASE_URL: site.url, LOGIN_EMAIL: "user@ledgerly.test", LOGIN_PASSWORD: "pw", BABYSITTER_DNS: "0", CI: "", ROUTES: "" };
const BIN = join(TOOL, "bin/babysitter.mjs");
const WORKERS = process.env.PARITY_WORKERS || "4";
const PROJECTS = (process.env.PARITY_PROJECTS || "mobile-390,desktop-1440").split(",").flatMap((p) => ["--project", p]);
const snap = (tag) => {
  const d = join(repo, `.snap-${tag}`);
  cpSync(join(repo, ".babysitter/report.json"), `${d}-report.json`);
  cpSync(join(repo, ".babysitter/findings.json"), `${d}-findings.json`);
  return { report: JSON.parse(readFileSync(`${d}-report.json`, "utf8")), findings: JSON.parse(readFileSync(`${d}-findings.json`, "utf8")).findings };
};
// one result per check: what a reader of the report, findings.json and fix-plan sees
const resultKey = (r) => `${r.path.join(" › ")} @ ${r.project}`;
const normFinding = (f) => JSON.stringify({ suite: f.suite, route: f.route, role: f.role, auth: f.auth, locale: f.locale, test: f.test, project: f.project, file: f.file, status: f.status, items: f.items, error: f.error.replace(/\d+ms/g, "#ms") });
function compare(a, b, label) {
  const ra = new Map(resultsWithExpress(a.report).list.map((r) => [resultKey(r), r.status]));
  const rb = new Map(resultsWithExpress(b.report).list.map((r) => [resultKey(r), r.status]));
  const diffs = [];
  for (const [k, s] of ra) if (rb.get(k) !== s) diffs.push(`${k}: normal ${s}, ${label} ${rb.get(k) ?? "missing"}`);
  for (const [k, s] of rb) if (!ra.has(k)) diffs.push(`${k}: only in ${label} (${s})`);
  const fa = a.findings.map(normFinding).sort(), fb = b.findings.map(normFinding).sort();
  const onlyA = fa.filter((x) => !fb.includes(x)), onlyB = fb.filter((x) => !fa.includes(x));
  return { diffs, onlyA, onlyB, results: ra.size, findings: fa.length };
}
try {
  const prep = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env, timeout: 300_000 });
  await t("prepare: the fixture's routes, its second language and the signed-in role", async () => {
    assert.equal(prep.status, 0, prep.out.slice(-3000));
    const routes = JSON.parse(readFileSync(join(repo, ".babysitter/routes.json"), "utf8"));
    assert.ok(routes.some((r) => r.auth && r.path === "/account"), JSON.stringify(routes));
    const loc = JSON.parse(readFileSync(join(repo, ".babysitter/locales.json"), "utf8"));
    assert.ok(loc.locales.some((l) => l.code === "kk" && l.verified), JSON.stringify(loc));
  });
  // four pages keep the test to a few minutes: the dialog + menus + burger page, the table + long list, the form, and
  // the signed-in page
  const KEEP_ROUTES = (process.env.PARITY_ROUTES || "/,/pricing,/form,/account").split(",");
  const routesFile = join(repo, ".babysitter/routes.json");
  writeFileSync(routesFile, JSON.stringify(JSON.parse(readFileSync(routesFile, "utf8")).filter((r) => KEEP_ROUTES.includes(r.path)), null, 2));
  const t0 = Date.now();
  const normal = await sh([BIN, "e2e", "--skip-prepare", ...PROJECTS, `--workers=${WORKERS}`, "--reporter=dot"], { cwd: repo, env });
  const tNormal = Date.now() - t0;
  const N = snap("normal");
  const t1 = Date.now();
  // the cache is empty here: this run measures every check (and stores the passes for the cached run below)
  const express = await sh([BIN, "e2e", "--skip-prepare", "--express", ...PROJECTS, `--workers=${WORKERS}`, "--reporter=dot"], { cwd: repo, env });
  const tExpress = Date.now() - t1;
  const E = snap("express");
  console.log(`  normal ${Math.round(tNormal / 1000)} s, express ${Math.round(tExpress / 1000)} s`);
  await t("normal and express runs finished and wrote their reports", async () => {
    assert.ok(N.report && E.report, normal.out.slice(-2000) + express.out.slice(-2000));
    assert.match(express.out, /Express: +\d+ check results from \d+ page test/, express.out.slice(-3000));
  });
  await t("express = normal: every check result (status) and every finding (route, role, locale, project, test, items, message)", async () => {
    const c = compare(N, E, "express");
    console.log(`    ${c.results} check results, ${c.findings} findings`);
    assert.ok(c.findings > 20, `the fixture should produce many findings (${c.findings})`);
    assert.deepEqual(c.diffs, [], `status differences:\n${c.diffs.join("\n")}`);
    assert.deepEqual({ onlyNormal: c.onlyA, onlyExpress: c.onlyB }, { onlyNormal: [], onlyExpress: [] });
  });
  await t("express loads each page far fewer times than it runs checks", async () => {
    const m = express.out.match(/Express: +(\d+) check results from (\d+) page test\(s\), (\d+) page load/);
    assert.ok(m, express.out.slice(-2000));
    assert.ok(Number(m[3]) * 2 < Number(m[1]), `${m[3]} loads for ${m[1]} checks`);
  });
  await t("the first express run measured everything (an empty cache serves nothing)", () => {
    assert.ok(!resultsWithExpress(E.report).list.some((r) => r.express?.cached));
  });
  const t2 = Date.now();
  const cached = await sh([BIN, "e2e", "--skip-prepare", "--express", ...PROJECTS, `--workers=${WORKERS}`, "--reporter=dot"], { cwd: repo, env });
  const tCached = Date.now() - t2;
  const C = snap("cached");
  console.log(`  express with a warm cache ${Math.round(tCached / 1000)} s`);
  await t("express with the cache on an unchanged site: passes reused, findings identical, no failure from the cache", async () => {
    assert.match(cached.out, /\d+ cached \(unchanged render\)/, cached.out.slice(-2000));
    const c = compare(N, C, "cached");
    assert.deepEqual(c.diffs, [], c.diffs.join("\n"));
    assert.deepEqual({ onlyNormal: c.onlyA, onlyExpress: c.onlyB }, { onlyNormal: [], onlyExpress: [] });
    for (const r of resultsWithExpress(C.report).list) if (r.express?.cached) assert.ok(r.status === "passed" || r.status === "skipped", `${resultKey(r)} cached as ${r.status}`);
  });
} finally {
  site.close();
  if (!KEEP) rmSync(repo, { recursive: true, force: true });
  else console.log(`  kept ${repo}`);
}
if (failed) process.exit(1);
console.log("express parity: ok");
