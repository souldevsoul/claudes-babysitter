// 5.7.1 — what the first run of 5.7.0 on a real product (an app-router site, 52 routes, 3 roles) got wrong. Each case
// fails on 5.7.0 and passes on 5.7.1:
//   1. a product with its own Playwright specs (another @playwright/test copy) under e2e/: they were all loaded into the
//      "product" project, "Requiring @playwright/test second time" stopped the run and every suite was NOT RUN
//   2. --fast sampled 768 on "one route per template" where every page.tsx was a template (52 of 52)
//   3. M2 / the money check decided "sells credits" page by page from the word "credit": a skip and a failure at once
//   4. three counts for one set of findings (Playwright tests, checks, fix-plan "failed tests"), none labelled
//   5. text of neighbouring inline elements glued ("BRANDTERMS OF SERVICE") by textContent / innerText
//   6. error codes, curl lines and code blocks read as copy by the copy rules and Jev
//   7. 6.4 items that said only "11px", one per element
//   +  a quoted heading with line breaks split a finding; "look at" hints from notes and tests; Jev questions that do
//      not fit legal pages
// RUN: node test/fixes-571.test.mjs   (one browser, for the cases that render a page)
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { ...process.env, CI: "", GITHUB_ACTIONS: "", BABYSITTER_NO_VERSION_CHECK: "1" };
let n = 0, failed = 0;
async function t(name, fn) { try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const dirs = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), `bs-571-${p}-`)); dirs.push(d); return d; };
const put = (root, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); } };
const show = (x) => JSON.stringify(x, null, 1);

const { classifySpecs, testMatchFor } = await import("../lib/product-specs.js").catch(() => ({}));
const { summarize } = await import("../lib/run-summary.js");

/* ───────── 1. the product's own Playwright specs ───────── */
await t("1 product specs: only the specs that use ./babysitter are Babysitter's; a spec of the product's own setup is not", () => {
  assert.ok(classifySpecs, "lib/product-specs.js exists");
  const d = tmp("specs");
  put(d, {
    "e2e/journeys.spec.ts": 'import { test } from "./babysitter";\ntest("j", async () => {});\n',
    "e2e/flows/deep.spec.ts": 'import { test, expect } from "../babysitter";\ntest("d", async () => {});\n',
    "e2e/tests/own.spec.ts": 'import { test } from "./helpers";\ntest("o", async () => {});\n',
    "e2e/node_modules/x/a.spec.ts": "never read",
  });
  const c = classifySpecs(join(d, "e2e"));
  assert.deepEqual(c.ours.map((f) => f.slice(join(d, "e2e").length + 1)), ["flows/deep.spec.ts", "journeys.spec.ts"]);
  assert.deepEqual(c.foreign.map((f) => f.file), ["tests/own.spec.ts"]);
  const re = testMatchFor(c.ours, c.dir);
  assert.ok(re.some((r) => r.test(join(d, "e2e/journeys.spec.ts"))) && !re.some((r) => r.test(join(d, "e2e/tests/own.spec.ts"))), String(re));
  assert.ok(testMatchFor([], c.dir).every((r) => !r.test(join(d, "e2e/journeys.spec.ts"))), "no spec of ours: the list matches nothing (an empty testMatch would match everything)");
});

await t("1 a product whose e2e/ holds specs on its own @playwright/test copy: the product project loads only ./babysitter specs, no 'Requiring @playwright/test second time'", () => {
  const d = tmp("pw2");
  // a second copy of @playwright/test in the product (as a product with its own Playwright setup has)
  const req = createRequire(join(TOOL, "package.json"));
  const pwDir = dirname(req.resolve("playwright/package.json")), testDir = dirname(req.resolve("@playwright/test/package.json"));
  cpSync(pwDir, join(d, "node_modules/playwright"), { recursive: true });
  cpSync(testDir, join(d, "node_modules/@playwright/test"), { recursive: true });
  symlinkSync(dirname(req.resolve("playwright-core/package.json")), join(d, "node_modules/playwright-core"));
  put(d, {
    "package.json": '{ "name": "fx", "private": true }\n',
    "babysitter.config.json": '{ "baseURL": "http://127.0.0.1:9" }\n',
    "e2e/package.json": '{ "type": "module" }\n',
    "e2e/babysitter.ts": `export * from "${join(TOOL, "playwright/fixtures.js")}";\n`,
    "e2e/journeys.spec.ts": 'import { test } from "./babysitter";\ntest("journey of ours", async () => {});\n',
    "e2e/tests/own.spec.ts": 'import { test } from "@playwright/test";\ntest("the product\'s own", async () => {});\n',
  });
  const cli = req.resolve("@playwright/test/cli");
  const r = spawnSync(process.execPath, [cli, "test", "--list", "-c", join(TOOL, "playwright/playwright.config.js"), "--project=product"], { cwd: d, encoding: "utf8", env: { ...ENV, BABYSITTER_ROOT: d } });
  const out = r.stdout + r.stderr;
  assert.doesNotMatch(out, /Requiring @playwright\/test second time/, out.slice(0, 1500));
  assert.equal(r.status, 0, out.slice(0, 1500));
  assert.match(out, /journey of ours/);
  assert.doesNotMatch(out, /the product's own/);
});

await t("1 summary: a load error is said as one (with its cause), not 'filtered out'; the product's own specs are named, not a suite NOT RUN", () => {
  const d = tmp("sum1");
  mkdirSync(join(d, ".babysitter"), { recursive: true });
  put(d, { "e2e/tests/own.spec.ts": 'import { test } from "./helpers";\n' });
  writeFileSync(join(d, ".babysitter/report.json"), JSON.stringify({ suites: [], errors: [{ message: "Error: Requiring @playwright/test second time, \nFirst:\nError: \n    at Object.<anonymous> (/x/node_modules/playwright/lib/index.js:67:33)", location: { file: "/p/e2e/tests/own.spec.ts", line: 1, column: 1 } }], stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 } }));
  writeFileSync(join(d, ".babysitter/routes.json"), "[]");
  const s = summarize({ root: d, cfg: {}, configured: { viewports: ["desktop-1440"] }, rerun: "x" }).text;
  assert.match(s, /PLAYWRIGHT STOPPED WHILE LOADING THE SPECS/, s);
  assert.match(s, /second copy of @playwright\/test/, s);
  assert.doesNotMatch(s, /filtered out/, s);
  assert.match(s, /1 spec\(s\) in e2e\/ NOT loaded/, s);
  assert.doesNotMatch(s, /product ✗ NOT RUN/, "the product suite is the specs Babysitter loads — none here");
});

await t("1 init on a repo that runs Playwright itself: Babysitter's journeys go to e2e-babysitter/, its e2e/ is left alone", () => {
  const r = tmp("init");
  put(r, { "package.json": JSON.stringify({ name: "fx", private: true, dependencies: { next: "15.0.0", react: "19.0.0" }, devDependencies: { "@playwright/test": "1.50.0" } }), "playwright.config.ts": 'export default { testDir: "./e2e/tests" };\n', "e2e/tests/own.spec.ts": 'import { test } from "@playwright/test";\n', "app/page.tsx": "export default function P() { return null; }\n" });
  spawnSync("git", ["init", "-q"], { cwd: r });
  const init = spawnSync(process.execPath, [join(TOOL, "bin/ui-init.mjs"), r, "--existing", "--link", "--yes", "--no-git-hook"], { encoding: "utf8", env: ENV });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const cfg = JSON.parse(readFileSync(join(r, "babysitter.config.json"), "utf8"));
  assert.equal(cfg.e2eDir, "e2e-babysitter", show(cfg.e2eDir));
  assert.ok(existsSync(join(r, "e2e-babysitter/journeys.spec.ts")) && existsSync(join(r, "e2e-babysitter/babysitter.ts")));
  assert.ok(!existsSync(join(r, "e2e/babysitter.ts")) && !existsSync(join(r, "e2e/journeys.spec.ts")), "nothing of ours in the product's own e2e/");
});

/* ───────── 2. --fast: page templates of an app-router repo ───────── */
await t("2 --fast: templates are layout + page frame from the repo — 28 routes of an app-router site → 7 at 768, each listed", async () => {
  const { pageFamilies } = await import("../lib/page-templates.js");
  const { buildFastPlan, describeFastPlan } = await import("../lib/fast-plan.js");
  const r = tmp("tpl");
  const pass = 'export const metadata = { title: "x" };\nexport default function L({ children }) {\n  return <>{children}</>;\n}\n';
  const page = (imports, body = "<main />") => `${imports}\nexport default function P() {\n  return ${body};\n}\n`;
  const legal = page('import { LegalDocument } from "@/components/legal/legal-document";');
  const hero = page('import { PageHero } from "@/components/page-hero";\nimport { Money } from "@/components/currency";');
  const dash = (extra = "") => page(`import { Breadcrumb, PageHeading } from "@/components/dashboard/chrome";\nimport { Button } from "@/components/ui/button";${extra}`);
  const admin = page('import { AdminPageHeader } from "../_components/page-header";\nimport { prisma } from "@/lib/prisma";');
  const authLayout = 'import { AuthHeader } from "@/components/auth-header";\nexport default function L({ children }) {\n  return (\n    <>\n      <AuthHeader />\n      {children}\n    </>\n  );\n}\n';
  const files = {
    "package.json": "{}",
    "src/app/layout.tsx": 'export default function R({ children }) { return <html><body><Nav />{children}<Footer /></body></html>; }\n',
    "src/app/page.tsx": page('import { Hero } from "@/components/home/rail";'),
    "src/app/blog/[slug]/page.tsx": page('import { getPost } from "@/lib/blog";'),
    "src/app/dashboard/layout.tsx": 'export default async function D({ children }) {\n  const s = await getSession();\n  return <div className="min-h-screen">{children}</div>;\n}\n',
    "src/app/admin/layout.tsx": 'export default async function A({ children }) {\n  return <div className="console"><AdminNav />{children}</div>;\n}\n',
  };
  for (const p of ["terms", "privacy", "cookies", "refund", "aml-policy"]) files[`src/app/${p}/page.tsx`] = legal;
  for (const p of ["about", "pricing", "docs", "faq", "contact"]) files[`src/app/${p}/page.tsx`] = hero;
  for (const p of ["sign-in", "sign-up", "forgot-password"]) { files[`src/app/${p}/page.tsx`] = page('import { Input } from "@/components/ui/input";'); files[`src/app/${p}/layout.tsx`] = authLayout; }
  for (const p of ["", "billing", "deploy", "profile", "requests", "requests/[id]"]) { files[`src/app/dashboard${p ? `/${p}` : ""}/page.tsx`] = dash(); if (p && !p.includes("[")) files[`src/app/dashboard/${p}/layout.tsx`] = pass; }
  for (const p of ["", "users", "users/[id]", "billing"]) files[`src/app/admin${p ? `/${p}` : ""}/page.tsx`] = admin;
  put(r, files);
  spawnSync("git", ["init", "-q"], { cwd: r });
  const fam = pageFamilies(r);
  const routes = [
    { path: "/", auth: false }, ...["terms", "privacy", "cookies", "refund", "aml-policy", "about", "pricing", "docs", "faq", "contact", "sign-in", "sign-up", "forgot-password"].map((p) => ({ path: `/${p}`, auth: false })),
    { path: "/blog/first-post", template: "/blog/[slug]", auth: false },
    ...["", "/billing", "/deploy", "/profile", "/requests"].map((p) => ({ path: `/dashboard${p}`, auth: true })), { path: "/dashboard/requests/r1", template: "/dashboard/requests/[id]", auth: true },
    ...["", "/billing", "/deploy"].map((p) => ({ path: `/dashboard${p}`, auth: true, role: "admin" })),
    ...["", "/users", "/billing"].map((p) => ({ path: `/admin${p}`, auth: true, role: "admin" })), { path: "/admin/users/u1", template: "/admin/users/[id]", auth: true, role: "admin" },
  ];
  assert.equal(routes.length, 28);
  const plan = buildFastPlan(routes, [], { families: fam });
  assert.deepEqual(plan.midRoutes, ["public /", "public /terms", "public /about", "public /sign-in", "public /blog/first-post", "user /dashboard", "admin /admin"], show(plan.templates));
  const line = describeFastPlan(plan);
  assert.match(line, /^768 on 7 of 28 route\(s\), one per page template \(layout \+ page frame, from the repo\): \/ · \/terms \(\+4 like it\) · \/about \(\+4 like it\) · \/sign-in \(\+2 like it\) · \/blog\/first-post · \[user\] \/dashboard \(\+8 like it\) · \[admin\] \/admin \(\+3 like it\)$/, line);
  // the skip reason of a page left out at 768 names the page its template is checked on
  const f = join(r, "plan.json");
  writeFileSync(f, JSON.stringify(plan));
  process.env.BABYSITTER_FAST = "1"; process.env.BABYSITTER_FAST_PLAN = f;
  const { fastSkip } = await import(`../lib/fast-plan.js?x=${Date.now()}`);
  assert.match(fastSkip({ path: "/privacy", auth: false }, "tablet-768"), /7 of 28\); this page's template is checked on \/terms \[by design scope\]/);
  delete process.env.BABYSITTER_FAST; delete process.env.BABYSITTER_FAST_PLAN;
});

/* ───────── 3. one money model ───────── */
await t("3 money model: amounts in a currency and the word 'credit' (card, sign-up credit) are money; an amount in credits is credits — M2 gets one answer on every page", async () => {
  const { moneyModel, m2Decision, creditAmounts } = await import("../lib/money-model.js");
  assert.deepEqual(creditAmounts("Balance: 6,000 credits · 120 cr · $5 credit · Visa credit card"), ["6,000 credits", "120 cr"]);
  const money = moneyModel({ texts: [{ route: "/dashboard", text: "Balance $100.00\nAdjust Credits" }, { route: "/faq", text: "Visa credit and debit cards. Unused credits are refundable within 14 days. $3 sign-up credit." }] });
  assert.equal(money.model, "money", money.why);
  const a = m2Decision({ model: money, pageText: "Adjust Credits · Amount" }), b = m2Decision({ model: money, pageText: "Your endpoints" });
  assert.equal(a.applies, false); assert.equal(b.applies, false);
  assert.equal(a.reason, b.reason, "the same decision, for the same reason, on a page that says 'Credits' and on one that does not");
  assert.match(a.reason, /sells in money, not credits/);
  const credits = moneyModel({ texts: [{ route: "/wallet", text: "Balance: 6,000 credits" }, { route: "/", text: "Plans from $10" }] });
  assert.equal(credits.model, "credits");
  assert.equal(m2Decision({ model: credits, pageText: "Your tasks" }).applies, true, "a credits product: every signed-in header, whatever the page says");
  assert.equal(moneyModel({ cfg: { moneyModel: "credits" }, texts: [] }).model, "credits", "the owner's word wins");
  assert.equal(m2Decision({ headerBalance: true, model: money }).applies, true);
});

/* ───────── 4. one unit per number ───────── */
await t("4 counts: checks vs Playwright page tests vs text-pass findings are labelled; fix-plan's problems = the summary's = Jev triage's candidates", async () => {
  const d = tmp("counts");
  mkdirSync(join(d, ".babysitter"), { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: d });
  writeFileSync(join(d, "package.json"), "{}");
  // an express run: 2 page tests, both failed, holding 3 failed checks (two of them one problem at two widths)
  const rec = (title, status, msg = "") => ({ title, status, errors: msg ? [{ message: msg }] : [], annotations: [], ms: 5 });
  const payload = (route, rules) => ({ body: Buffer.from(JSON.stringify({ version: 1, containerId: route, route, stats: { loads: 1, resets: 0, rules: rules.length, cached: 0, own: 0, ms: 9 }, rules })).toString("base64"), name: "express-results.json", contentType: "application/json" });
  const msg = (what, where) => `Error: x\n  • ${what} — ${where}`;
  const pageTest = (route, project, rules, ok) => ({ title: "express: every check of this page, one load", file: "express.js", tests: [{ projectName: project, status: ok ? "expected" : "unexpected", annotations: [], results: [{ status: ok ? "passed" : "failed", errors: ok ? [] : [{ message: "express: n of m check(s) failed" }], annotations: [], attachments: [payload(route, rules)] }] }] });
  const report = { stats: { expected: 0, unexpected: 2, skipped: 0, flaky: 0 }, suites: [{ title: "babysitter.spec.js", specs: [], suites: [{ title: "/pricing", specs: [
    pageTest("/pricing", "mobile-390", [rec("6.4 text ≥12px", "failed", msg('text 11px, under the 12px minimum: "Fee" [6.4]', 'div.card > span.note.text-[11px] "Fee"')), rec("1.1 no native select", "failed", msg("native <select>", "select#cur")), rec("1.12 no emoji", "passed")], false),
    pageTest("/pricing", "desktop-1440", [rec("6.4 text ≥12px", "failed", msg('text 11px, under the 12px minimum: "Fee" [6.4]', 'div.card > span.note.text-[11px] "Fee"')), rec("1.1 no native select", "passed"), rec("1.12 no emoji", "passed")], false),
  ] }] }] };
  writeFileSync(join(d, ".babysitter/report.json"), JSON.stringify(report));
  writeFileSync(join(d, ".babysitter/routes.json"), JSON.stringify([{ path: "/pricing", auth: false }]));
  const textFile = join(d, ".babysitter/text-pass.json");
  writeFileSync(textFile, JSON.stringify({ pages: 1, loads: 1, readMs: 10, ms: 10, jev: { on: false, note: "Jev off" }, unsure: [], soft: [], findings: [{ suite: "text", project: "text", route: "/pricing", rule: "CT5", test: "CT5", items: [{ what: '"—" in copy: "A — B" [CT5]', where: "p" }], error: "" }] }));
  const s = summarize({ root: d, cfg: {}, configured: { viewports: ["mobile-390", "desktop-1440"] }, rerun: "x", textPass: textFile });
  assert.match(s.text, /^Checks: ✓ 3 passed {3}✗ 3 failed {3}↷ 0 skipped {3}\(check results; Playwright itself ran 2 page test\(s\): 0 passed, 2 failed, 0 skipped\)$/m, s.text);
  assert.match(s.text, /Failed by page — 3 failed check\(s\) \+ 1 text-pass finding\(s\) \(1 blocking\):/, s.text);
  assert.match(s.text, /groups them into 3 problem\(s\)/, s.text);
  const fj = JSON.parse(readFileSync(join(d, ".babysitter/findings.json"), "utf8"));
  assert.deepEqual({ ...fj.counts, playwright: undefined }, { unit: "check", failed: 3, text: 1, textBlocking: 1, carried: 0, playwright: undefined, problems: 3 });
  const fp = spawnSync(process.execPath, [join(TOOL, "bin/fix-plan.mjs"), "--repo", d], { encoding: "utf8", env: ENV });
  assert.match(fp.stdout, /^# Babysitter fix plan — 3 problem\(s\)$/m, fp.stdout);
  assert.match(fp.stdout, /from 3 failed check\(s\) \(express: Playwright reported 2 failed page test\(s\), each holding one or more failed checks\) \+ 1 text-pass finding\(s\) of the last run/, fp.stdout);
  const { candidates } = await import("../lib/jev/triage.js");
  assert.equal(candidates(fj.findings).length, 3, "triage labels the same problems fix-plan lists");
});

/* ───────── 7 (no browser): 6.4 grouped by component, with the element ───────── */
await t("7 fix-plan 6.4: one problem per component (four headers of one table → one item, their texts listed), never a bare '10px'", () => {
  const d = tmp("fp64");
  mkdirSync(join(d, ".babysitter"), { recursive: true });
  put(d, { "package.json": "{}", "src/app/admin/page.tsx": 'export default function P() { return <table><thead><tr><th className="cyber-label !text-[10px]">User</th></tr></thead></table>; }\n', "CLAUDE.md": "User Model Status Created cyber-label\n", "e2e/tests/admin.spec.ts": "// User Model Status Created cyber-label\n", ".claude/settings.json": '{ "x": "User Model Status Created" }\n' });
  spawnSync("git", ["init", "-q"], { cwd: d });
  const f = (text, route) => ({ route, auth: true, role: "admin", project: "desktop-1440", suite: "ui", test: "6.4 text ≥12px, legible weight, contrast ≥4.5:1 (3:1 large) [P11 P34]", items: [{ what: `text 10px, under the 12px minimum: "${text}" [6.4]`, where: `table.w-full > thead > tr.border-b > th.cyber-label.!text-[10px] "${text}"` }], error: "" });
  writeFileSync(join(d, ".babysitter/findings.json"), JSON.stringify({ findings: ["User", "Model", "Status", "Created"].map((x) => f(x, "/admin")).concat([f("User", "/admin/billing")]) }));
  const fp = spawnSync(process.execPath, [join(TOOL, "bin/fix-plan.mjs"), "--repo", d], { encoding: "utf8", env: ENV });
  assert.match(fp.stdout, /^## 6\.4 \(1\)$/m, fp.stdout);
  assert.match(fp.stdout, /text 10px, under the 12px minimum: "User" \[6\.4\]/);
  assert.match(fp.stdout, /4 elements of this component: "User", "Model", "Status", "Created"/);
  assert.match(fp.stdout, /on: \/admin, \/admin\/billing \(signed in as admin\)/);
  const look = fp.stdout.split("\n").find((l) => l.includes("look at:")) || "";
  assert.match(look, /src\/app\/admin\/page\.tsx/);
  assert.doesNotMatch(look, /CLAUDE\.md|e2e\/tests|\.claude\//, `notes, tests and agent settings are not where the fix goes: ${look}`);
});

await t("+ a quoted heading with line breaks stays one item: the bullet list prints one line per item", async () => {
  const { fmt } = await import("../playwright/format.js");
  const { bullets } = await import("../lib/run-summary.js");
  const msg = `aligned with a decorative rule\n${fmt([{ what: '"~/ADMIN/BILLING\n\nBilling ledge" lines up with the list\'s left rule [2.7]', where: 'header.mb-6 "~/admin/billing Billing ledger"' }])}`;
  const b = bullets(msg);
  assert.equal(b.length, 1);
  assert.match(b[0].what, /^"~\/ADMIN\/BILLING Billing ledge" lines up with the list's left rule \[2\.7\]$/);
});

await t("+ Jev questions that do not fit a policy: negative statements and self-defence are not asked of legal pages, cookie names not of the cookie policy", () => {
  const rules = JSON.parse(readFileSync(join(TOOL, "rules/jev/copy-rules.json"), "utf8")).rules;
  const r = (id) => rules.find((x) => x.id === id);
  for (const id of ["jev/negative-statement", "jev/self-defence"]) for (const ty of ["legal-privacy", "legal-cookies", "legal-terms"]) assert.ok((r(id).notTypes || []).includes(ty), `${id} not on ${ty}`);
  assert.ok(r("jev/jargon").notTypes.includes("legal-cookies"));
  assert.ok(!(r("jev/negative-statement").notTypes || []).includes("home"), "still asked of every other page");
});

/* ───────── second run on the product: more false alarms (a–h) ───────── */
// a fake Jev: every claim's partner is the next claim of its topic; every question answered yes
const fakeJ = (asked = []) => ({
  pool: async (jobs, fn) => Promise.all(jobs.map(fn)),
  ask: async (state, qs) => { asked.push(...Object.keys(qs)); const ids = [...String(state.STATEMENTS || "").matchAll(/^(S\d+)\|/gm)].map((m) => m[1]); return Object.fromEntries(Object.keys(qs).map((k) => { const i = ids.indexOf(k); return [k, { probabilities: { [ids[(i + 1) % ids.length] || "none"]: 0.9 }, yes: 0.9, p: 0.9 }]; })); },
});
await t("b consistency/one-page: two rows of one page's table (the minimum tier of two models) are not compared as one claim; claims of one item still are", async () => {
  const { claimsOf, compareTopics } = await import("../lib/jev/consistency.js");
  const page = { route: "/docs", auth: false, locale: null, lines: [
    { text: "min tier: Starter · context 8,192 tokens", kind: "body", region: "main", section: "Models", record: true },
    { text: "min tier: Pro · context 8,192 tokens", kind: "body", region: "main", section: "Models", record: true },
    { text: "The minimum top-up is $5 for every account.", kind: "body", region: "main", section: "Billing" },
    { text: "The minimum top-up is $10 for every account.", kind: "body", region: "main", section: "Billing" },
  ] };
  const claims = claimsOf([page]);
  assert.equal(claims.length, 4, show(claims.map((c) => c.text)));
  assert.ok(claims[0].record && !claims[2].record, "the record flag reaches the claim");
  for (const c of claims) c.topics = ["limits"];
  const pairs = await compareTopics(fakeJ(), claims);
  const texts = pairs.map((f) => [f.claim.text, f.other.text].sort().join(" | "));
  assert.ok(!texts.some((x) => /Starter/.test(x) && /Pro ·/.test(x)), show(texts));
  assert.ok(texts.some((x) => /\$5/.test(x) && /\$10/.test(x)), `two plain claims on one page are still compared: ${show(texts)}`);
});

await t("c promise-without-feature: a control on a page the run could not open (a dynamic route with no data for the test user) is 'not checked', not 'missing'", async () => {
  const { promiseCheck, describe } = await import("../lib/jev/consistency.js");
  const doc = { route: "/docs", auth: false, locale: null };
  const app = { route: "/dashboard", auth: true, role: "user", lines: [{ text: "Your endpoints", kind: "heading" }], controls: [{ label: "Deploy" }] };
  const claims = [{ id: "S0000", text: "Click Rotate on the endpoint's API key panel.", page: doc, route: "/docs", key: "/docs", section: "Keys" }, { id: "S0001", text: "Download your invoices from the Billing page at any time.", page: doc, route: "/docs", key: "/docs", section: "Billing" }];
  const asked = [];
  const out = await promiseCheck(fakeJ(asked), claims, [app], { min: 0.5, notReached: ["/dashboard/endpoints/[id]"] });
  const rot = out.find((f) => f.claim.id === "S0000");
  assert.equal(rot?.notChecked, "/dashboard/endpoints/[id]", show(out));
  assert.equal(rot.p, 0.5, "at the 'unsure, check by hand' level, never a finding");
  assert.ok(!asked.includes("S0000"), "Jev is not asked about a page nobody saw");
  assert.ok(asked.includes("S0001"), "a promise about a page the run read is still judged");
  assert.match(describe(rot).what, /^not checked: a document promises a control on a page the run did not open \(\/dashboard\/endpoints\/\[id\]/);
});

await t("e CT12: a file name over a terminal window ('nav.sh', 'model.safetensors') is not a translation key; 'nav.home' still is", async () => {
  const { looksLikeKey } = await import("../lib/content-rules.js");
  assert.equal(looksLikeKey("nav.sh"), false);
  assert.equal(looksLikeKey("model.safetensors"), false);
  assert.equal(looksLikeKey("nav.home"), true);
  assert.equal(looksLikeKey("pricing.hero.title"), true);
});

await t("h --changed: a re-read of one route reuses the last read of every other route (no page loaded for them); the site-wide rules still see all", async () => {
  const { readSite } = await import("../playwright/text-run.js");
  const model = (route) => ({ route, locale: null, lang: "en", auth: false, role: null, title: route, h1: route, lines: [{ text: `Page ${route}`, kind: "body", region: "main", section: "", li: false }], links: [], controls: [] });
  const record = (route) => ({ route, auth: false, role: null, locale: null, title: route, h1: [route], legal: [], links: [], segs: [{ text: `Page ${route}`, kind: "body" }], footerSegs: [], lastUpdated: [], copyright: null, slugs: [], extras: null, copy: { segs: [], title: route, lang: "en" } });
  const reuse = { pages: ["/a", "/b"].map(model), records: { default: ["/a", "/b"].map(record) }, det: [{ key: "/b", route: "/b", id: "CT5", what: "kept from the last read", test: "CT1–CT8 copy" }], soft: [] };
  const prev = process.env.BASE_URL;
  process.env.BASE_URL = "http://127.0.0.1:9";
  try {
    const r = await readSite({ cfg: { content: { skip: ["CT21", "CT22", "CT9", "CT10"] } }, routes: [{ path: "/a", auth: false }, { path: "/b", auth: false }], reuse, only: new Set() });
    assert.equal(r.loads, 0, "nothing the change does not reach is loaded");
    assert.equal(r.reused, 2);
    assert.deepEqual(r.pages.map((p) => p.route), ["/a", "/b"]);
    assert.ok(r.det.some((d) => d.what === "kept from the last read"), "the last read's copy findings of a reused page stand");
    assert.deepEqual(Object.keys(r.records), ["default"]);
  } finally { if (prev === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = prev; }
});

/* ───────── browser cases: 5, 6, 7, 3 ───────── */
const browser = process.env.NO_BROWSER ? null : await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const checks = await import("../playwright/checks.js");
const content = await import("../playwright/checks/content.js");
const L = await import("../playwright/checks/layout.js");
const doc = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page</title><style>body{margin:0;font:16px/1.5 Arial}</style></head><body>${body}</body></html>`;
async function inPage(html, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await checks.install(page);
  // the helpers are an init script: they need a navigation, not setContent
  await page.route("http://fixture.test/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto("http://fixture.test/page");
  try { return await fn(page); } finally { await ctx.close(); }
}
if (browser) try {
  await t("5 text of neighbouring inline elements with a gap between them reads as two words (headings and copy); glued inline markup stays one word", () => inPage(doc(`
    <h1><span class="brand">ACME</span><span style="margin-left:8px">TERMS OF SERVICE</span></h1>
    <h2><span>DEPLOY AN</span><span style="padding-left:.6em">ENDPOINT</span></h2>
    <p>Hello <b>world</b>s, a <em>re</em>start and <span style="letter-spacing:3px">spaced</span>out text.</p>`), async (page) => {
    const copy = await content.collectCopy(page);
    const texts = copy.segs.map((s) => s.text);
    assert.deepEqual(copy.h1, ["ACME TERMS OF SERVICE"], show(copy.h1));
    assert.ok(texts.includes("ACME TERMS OF SERVICE") && texts.includes("DEPLOY AN ENDPOINT"), show(texts));
    assert.ok(texts.includes("Hello worlds, a restart and spacedout text."), show(texts));
  }));

  await t("6 code is not copy: an error code in a cell, a curl line in a monospace block, <pre>/<code>/<kbd> — left out of the copy rules and Jev's lines", () => inPage(doc(`
    <main><h2>Errors</h2><table><tr><td style="font-family:monospace">503</td><td style="font-family:monospace">NO_CAPACITY</td><td>A replica is starting. Retry in a minute.</td></tr></table>
    <div style="font-family:monospace">curl localhost:3000/api/infer/slug -H "Authorization: Bearer key_live_..."</div>
    <pre>POST /v1/chat
{ "messages": [] }</pre><p>Press <kbd>Ctrl</kbd> to copy.</p><td><code>ENDPOINT_PAUSED</code></td><p>curl is a command-line tool.</p><p>PAYMENT_FAILED</p></main>`), async (page) => {
    const copy = await content.collectCopy(page);
    const texts = copy.segs.map((s) => s.text);
    for (const code of ["NO_CAPACITY", "ENDPOINT_PAUSED", "{x}"]) assert.ok(!texts.includes(code), `${code} is not copy: ${show(texts)}`);
    assert.ok(!texts.some((x) => /^curl localhost/.test(x)), show(texts));
    assert.ok(!texts.some((x) => /messages/.test(x)), show(texts));
    assert.ok(texts.includes("A replica is starting. Retry in a minute.") && texts.includes("Press {x} to copy.") && texts.includes("curl is a command-line tool."), `prose stays copy: ${show(texts)}`);
    assert.ok(texts.includes("PAYMENT_FAILED"), "a raw key in the body font is still copy (a defect the copy rules report)");
    const { readPage } = await import("../playwright/text-collect.js");
    const { model } = await readPage(page, { route: "/docs", deep: false });
    assert.ok(!model.lines.some((l) => /NO_CAPACITY|ENDPOINT_PAUSED|^curl localhost/.test(l.text)), `Jev reads no code: ${show(model.lines.map((l) => l.text))}`);
  }));

  await t("7 6.4 says what is wrong and on which text: 'text 11px, under the 12px minimum: \"3 total\" [6.4]', not '11px'", () => inPage(doc(`<p style="font-size:11px" id="s">3 total</p><p style="font-size:14px;font-weight:300" id="w">Light caption</p>`), async (page) => {
    const { hard } = await checks.illegibleText(page);
    const s = hard.find((f) => f.selector === "#s"), w = hard.find((f) => f.selector === "#w");
    assert.equal(s?.what, 'text 11px, under the 12px minimum: "3 total" [6.4]', show(hard));
    assert.equal(w?.what, 'weight 300 at 14px, under 400: "Light caption" [6.4]', show(hard));
  }));

  await t("3 money check: a dollar balance in the header of a product that bills in dollars is not 'money instead of credits' because a page says 'credit card'", async () => {
    const d = tmp("mm");
    mkdirSync(join(d, ".babysitter"), { recursive: true });
    writeFileSync(join(d, ".babysitter/crawl.json"), JSON.stringify({ money: { pages: [{ route: "/dashboard", text: "$100.00" }, { route: "/faq", text: "Visa credit and debit cards, top-ups from $5" }] } }));
    const prev = process.env.BABYSITTER_ROOT;
    process.env.BABYSITTER_ROOT = d;
    try {
      const fresh = await import(`../playwright/checks/layout.js?root=${Date.now()}`);
      const P = await import("../playwright/project.js");
      const { siteMoneyModel } = await import("../lib/money-model.js");
      assert.equal(siteMoneyModel(P.loadConfig(), d).model, "money");
      const m = await inPage(doc(`<header style="height:60px"><a href="/">Acme</a> <button>$100.00</button></header><main><h1>Billing</h1><p>Pay by credit card. Unused credit is refundable.</p></main>`), (page) => fresh.moneyFormat(page, 0));
      assert.ok(!m.soft.some((f) => /header shows money/.test(f.what)), show(m.soft));
    } finally { if (prev === undefined) delete process.env.BABYSITTER_ROOT; else process.env.BABYSITTER_ROOT = prev; }
  });

  await t("a 1.11: the brand word in a page's own title <header> and a breadcrumb's first step are not the logo; the site header's logo still is", () => inPage(doc(`
    <header style="height:56px"><span class="logo" style="font-weight:800">Acme</span> <a href="/pricing">Pricing</a></header>
    <main><header class="page-title"><h1><span style="font-weight:800">ACME</span><span style="margin-left:8px">TERMS</span></h1></header>
    <nav aria-label="Breadcrumb"><a href="/dashboard">acme</a> / billing</nav><p>Body text.</p></main>`).replace("<title>Page</title>", '<title>Acme</title><meta property="og:site_name" content="Acme">'), async (page) => {
    const r = await L.logoHome(page);
    const list = [...r.hard, ...r.soft];
    assert.ok(!list.some((f) => /h1|Breadcrumb|\/dashboard/i.test(`${f.where} ${f.what} ${f.selector}`)), show(list));
    assert.ok(list.some((f) => /header logo is not a link/.test(f.what)), `the unlinked mark in the site header is still reported: ${show(list)}`);
  }));

  await t("d H1: a card with an endless glow animation does not 'react to hover'; a card that changes on hover still does", () => inPage(doc(`
    <style>@keyframes glow { 0%,100% { box-shadow: 0 0 4px #0f0 } 50% { box-shadow: 0 0 24px #0f0 } } .glow { animation: glow 1.2s infinite } .hov:hover { transform: translateY(-4px) }
    .card { width: 300px; height: 120px; padding: 16px; border: 1px solid #ccc; margin: 16px }</style>
    <main><div class="card glow" id="g">live trace</div><div class="card hov" id="h">plain card</div></main>`), async (page) => {
    const A = await import("../playwright/acceptance.js");
    const list = await A.staticHover(page);
    assert.ok(!list.some((f) => f.selector === "#g"), show(list));
    assert.ok(list.some((f) => f.selector === "#h"), show(list));
  }));

  await t("e 1.18: aria-hidden decoration (a window's traffic-light dots) is not a palette colour; a hidden input beside a visible role=checkbox is judged on the box", () => inPage(doc(`
    <style>:root { --a: #111111; --b: #222222; --c: #eeeeee; --d: #3366ff; --e: #ff3366; --f: #00aa55 } body { background: var(--c) }
    [role=checkbox] { display: inline-block; width: 16px; height: 16px; border: 1px solid #111 } [role=checkbox][aria-checked=true] { background: #3366ff }</style>
    <main><div><span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#eab308"></span><span aria-hidden="true" style="display:inline-block;width:10px;height:10px;background:#9b59b6"></span> terminal</div>
    <div><span role="checkbox" aria-checked="false" tabindex="0" id="box"></span><input id="agree" type="checkbox" aria-hidden="true" tabindex="-1" style="position:absolute;width:1px;height:1px;clip-path:inset(50%)"><label for="agree">I agree</label></div></main>
    <script>const b = document.getElementById("box"), i = document.getElementById("agree"); const sync = (v) => { b.setAttribute("aria-checked", String(v)); i.checked = v; };
    b.addEventListener("click", () => sync(b.getAttribute("aria-checked") !== "true")); i.addEventListener("click", () => sync(i.checked));</script>`), async (page) => {
    const pal = await checks.offPalette(page);
    assert.ok(pal.applicable, show(pal));
    assert.ok(!pal.offenders.some((f) => /234, 179, 8|155, 89, 182/.test(f.what)), show(pal.offenders));
    const cs = await checks.checkedState(page);
    assert.ok(!cs.some((f) => /changes nothing visible/.test(f.what)), show(cs));
  }));

  await t("f 1.9: a faint error edge after an empty submit is said as the error state, not 'barely visible at rest'; a faint field at rest is 'at rest'", () => inPage(doc(`
    <style>body { background: #fff } input { border: 1px solid #ddd; background: #fff; width: 240px; padding: 8px }</style>
    <form><input id="bad" aria-invalid="true" style="border-color:#f4b4b4"><input id="rest"></form>`), async (page) => {
    const list = await checks.inputVisibility(page);
    assert.match(list.find((f) => f.selector === "#bad")?.what || "", /^input edge barely visible in its error state \(border/, show(list));
    assert.match(list.find((f) => f.selector === "#rest")?.what || "", /^input barely visible at rest/, show(list));
  }));

  await t("g a page is read once its loading state is gone: skeletons first, the <h1> later — the open waits for it", () => inPage(doc(`
    <main id="m"><div class="skeleton" style="width:200px;height:30px;background:#eee"></div></main>
    <script>setTimeout(() => { document.getElementById("m").innerHTML = "<h1>Billing</h1><p>Your balance.</p>"; }, 1200);</script>`), async (page) => {
    await checks.revealLazy(page);
    assert.equal(await page.evaluate(() => document.querySelector("h1")?.textContent || null), "Billing");
    const copy = await content.collectCopy(page);
    assert.deepEqual(copy.h1, ["Billing"]);
  }));
} finally {
  await browser.close();
}
for (const d of dirs) rmSync(d, { recursive: true, force: true });
console.log(failed ? `\n${failed} of ${n + failed} failed` : `\nall ${n} passed`);
process.exit(failed ? 1 : 0);
