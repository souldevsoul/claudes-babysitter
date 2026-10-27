// 5.7.0 Jev: the client, the consistency engine, the text pass's agreement with the copy rules, the recall net, the
// triage, the invariant (Jev never makes a hard rule pass), the --fast plan, the project map and the benchmark scorer.
// Every Jev answer comes from a mock endpoint (test/jev-mock.mjs): no network, no real token.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn, execFileSync } from "node:child_process";
// the mock answers in this process: a child that calls it must not block the event loop (no spawnSync)
const spawnAsync = (cmd, argv, opts) => new Promise((res) => { const c = spawn(cmd, argv, opts); let stdout = "", stderr = ""; c.stdout.on("data", (d) => (stdout += d)); c.stderr.on("data", (d) => (stderr += d)); c.on("close", (status) => res({ status, stdout, stderr })); });
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mockJev } from "./jev-mock.mjs";
import { makeJev, jevProvider } from "../lib/jev/client.js";
import { claimsOf, consistency } from "../lib/jev/consistency.js";
import { jevTextPass, level, DEFAULTS } from "../lib/jev/text-pass.js";
import { triage, annotate } from "../lib/jev/triage.js";
import { buildFastPlan, fastSkip } from "../lib/fast-plan.js";
import { buildProjectMap, placesOf, mergeRendered } from "../lib/project-map.js";
import { flatten, score } from "./jev-bench/score.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
async function t(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const line = (text, kind = "body", extra = {}) => ({ text, kind, region: "main", section: "", li: false, ...extra });
const page = (route, lines, extra = {}) => ({ route, locale: null, auth: false, role: null, title: route, h1: "", lines, links: [], controls: [], ...extra });

// a small site: a refund window that contradicts, the same fee named two ways, a promise of a control
const SITE = () => [
  page("/terms", [line("Terms", "heading"), line("Refunds are possible within 14 days of purchase."), line("Every run costs at least €1."), line("You can delete a run with the delete button on the run page.")]),
  page("/refund", [line("Refund policy", "heading"), line("Refunds are possible within 30 days of purchase."), line("A routing fee applies to each request.")]),
  page("/pricing", [line("Pricing", "heading"), line("An orchestration fee applies to each request."), line("Every launch costs at least €1.")]),
  page("/dashboard", [line("Dashboard", "heading"), line("Start a run", "button")], { auth: true, role: "user", controls: [{ label: "Start a run", href: "/runs/new" }] }),
];
// the mock reads like a careful reviewer of SITE
const reviewer = (k, q, state) => {
  const text = JSON.stringify(state);
  if (q.type === "choice" && /mainly about/.test(q.instructions)) {
    const id = q.instructions.match(/statement (S\d+)/)[1];
    const s = (state.STATEMENTS.split("\n").find((l) => l.startsWith(id)) || "").replace(/^S\d+\| \([^)]*\) /, "").toLowerCase();
    return /refund/.test(s) ? { refund: 0.9 } : /fee/.test(s) ? { fees: 0.9 } : /delete/.test(s) ? { "deletion-controls": 0.9 } : /€1/.test(s) ? { fees: 0.8 } : { other: 1 };
  }
  if (q.type === "choice" && /same specific point/.test(q.instructions)) {
    const id = q.instructions.match(/as (S\d+)/)[1];
    const rows = state.STATEMENTS.split("\n").map((l) => [l.split("|")[0], l.replace(/^S\d+\| \([^)]*\) /, "").toLowerCase()]);
    const mine = rows.find(([x]) => x === id)?.[1] || "";
    const key = ["refund", "fee", "€1", "delete"].find((w) => mine.includes(w));
    const other = rows.find(([x, l]) => x !== id && key && l.includes(key));
    return other ? { [other[0]]: 0.8 } : { none: 1 };
  }
  if (q.type === "choice" && /how do A and B relate/.test(q.instructions)) {
    const i = Number(q.instructions.match(/pair P(\d+)/)[1]);
    const pair = state.PAIRS.split(/\n(?=P\d+\|)/)[i] || "";
    return /14 days/.test(pair) && /30 days/.test(pair) ? { conflict: 0.92 } : /routing fee/.test(pair) && /orchestration fee/.test(pair) ? { differ: 0.85 } : { same: 0.9 };
  }
  if (q.type === "choice" && /careful customer who reads both conclude/.test(q.instructions)) {
    const i = Number(q.instructions.match(/pair P(\d+)/)[1]);
    const pair = state.PAIRS.split(/\n(?=P\d+\|)/)[i] || "";
    return /14 days/.test(pair) && /30 days/.test(pair) ? { inconsistent: 0.9 } : /routing fee/.test(pair) && /orchestration fee/.test(pair) ? { inconsistent: 0.8 } : { detail: 0.9 };
  }
  if (q.type === "noul" && /UI_INVENTORY does not have/.test(q.instructions)) return /delete button/.test(text) && /S\d+/.test(q.instructions) && state.STATEMENTS.split("\n").find((l) => l.startsWith(q.instructions.match(/statement (S\d+)/)[1]))?.includes("delete") ? 0.85 : 0;
  if (q.type === "noul" && /^Does any line in LINES say that a feature/.test(q.instructions)) return /not open yet/.test(text) ? 0.9 : 0;
  if (q.type === "choice" && /clearest instance/.test(q.instructions)) { const m = (state.LINES || "").split("\n").find((l) => /not open yet/.test(l)); return m ? { [m.split("|")[0]]: 1 } : null; }
  if (q.type === "noul" && /^Does line L\d+ say that a feature/.test(q.instructions)) return 0.9;
  return 0;
};

const m = await mockJev(reviewer);
const J = () => makeJev({ cache: null, env: { ...m.env }, concurrency: 2, retryBaseMs: 1 });
try {
  await t("client: no token → off with a plain message; a token is never echoed", async () => {
    assert.equal(jevProvider({}, {}).ok, false);
    assert.throws(() => makeJev({ env: {} }), /Jev off: no token/);
    const p = jevProvider({ JEV_API_KEY: "secret-123" }, {});
    assert.ok(p.ok && !JSON.stringify({ ...p, token: undefined }).includes("secret-123"));
  });
  await t("client: answers cached on disk by content (a re-run pays nothing)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bs-jev-cache-"));
    const before = m.requests.length;
    const a = makeJev({ cache: dir, env: { ...m.env } });
    await a.ask({ X: 1 }, { q: { type: "noul", instructions: "Is it?" } });
    const b = makeJev({ cache: dir, env: { ...m.env } });
    await b.ask({ X: 1 }, { q: { type: "noul", instructions: "Is it?" } });
    assert.equal(m.requests.length - before, 1);
    assert.equal(b.stats.cached, 1);
    assert.equal(m.requests.at(-1).auth, "Bearer test-token-not-real");
    rmSync(dir, { recursive: true, force: true });
  });
  await t("client: 429 backs off and retries; the budget stops new calls and says so", async () => {
    const busy = await mockJev(() => 0.5, { status: (n) => (n === 1 ? 429 : 200) });
    const c = makeJev({ env: { ...busy.env }, retryBaseMs: 1 });
    const a = await c.ask({}, { q: { type: "noul", instructions: "x" } });
    assert.equal(a.q.noul, 0.5);
    assert.equal(c.stats.throttled, 1);
    const d = makeJev({ env: { ...busy.env }, budgetUsd: 0.0005, retryBaseMs: 1 });
    await d.ask({}, { a: { type: "noul", instructions: "one" } });
    const r = await d.ask({}, { b: { type: "noul", instructions: "two" } });
    assert.equal(r.b, undefined);
    assert.ok(d.stats.budgetHit);
    await busy.close();
  });
  await t("consistency: a contradiction across pages, the same fee in two words, a promise the UI does not keep", async () => {
    const pages = SITE();
    const r = await consistency(J(), pages, { min: 0.5 });
    const c = r.findings.find((f) => f.rule === "consistency/contradiction");
    assert.ok(c, JSON.stringify(r.findings.map((f) => f.rule)));
    assert.deepEqual([c.claim.text, c.other.text].sort(), ["Refunds are possible within 14 days of purchase.", "Refunds are possible within 30 days of purchase."]);
    assert.ok(r.findings.some((f) => f.rule === "consistency/different-words" && /routing fee|orchestration fee/.test(f.claim.text + f.other.text)));
    assert.ok(r.findings.some((f) => f.rule === "consistency/promise-without-feature" && /delete button/.test(f.claim.text)));
  });
  await t("text pass: a contradiction ≥ 0.8 is hard; Jev-only ≥ jev.min is marked Jev; 0.5–min is unsure", async () => {
    assert.equal(level({ rule: "consistency/contradiction", p: 0.92, conflict: 0.92 }), "hard");
    assert.equal(level({ rule: "consistency/contradiction", p: 0.75, conflict: 0.6 }), "jev");
    assert.equal(level({ rule: "f/copy-unclear", p: 0.6 }), "unsure");
    assert.equal(level({ rule: "f/copy-unclear", p: 0.4 }), "below");
    assert.equal(DEFAULTS.min, 0.7);
  });
  await t("text pass: a copy rule's hit stays the hard finding (Jev agrees); where the rule passed, Jev ≥ 0.8 is 'passed, Jev disagrees'", async () => {
    const pages = [page("/", [line("Welcome", "heading"), line("Full fine-tune · not open yet")]), page("/docs", [line("Docs", "heading"), line("Pick a model; the 70B model is not open yet.")])];
    const det = [{ id: "CT1", key: "/", what: 'unfinished copy: "Full fine-tune · not open yet" [CT1]', quote: "Full fine-tune · not open yet" }];
    const r = await jevTextPass(J(), pages, { det });
    const home = r.findings.find((f) => f.rule === "jev/not-yet" && f.key === "/");
    const docs = r.findings.find((f) => f.rule === "jev/not-yet" && f.key === "/docs");
    assert.equal(home?.level, "agrees", JSON.stringify(r.findings.map((f) => [f.rule, f.key, f.level])));
    assert.equal(docs?.level, "disagrees");
    assert.equal(docs.ctPassed, "passed");
  });
  await t("invariant: Jev never makes a hard rule pass — a Jev that sees nothing leaves every rule finding in place", async () => {
    const repo = mkdtempSync(join(tmpdir(), "bs-jev-inv-"));
    writeFileSync(join(repo, "babysitter.config.json"), "{}");
    const det = [{ id: "CT5", route: "/", key: "/", test: "CT1–CT8 copy", what: '"—" in copy: "A — B" [CT5]', where: "p" }];
    writeFileSync(join(repo, "pages.json"), JSON.stringify({ pages: SITE(), det, soft: [], site: [], notReached: [] }));
    const quiet = await mockJev(() => 0);
    const run = (extra, env) => spawnAsync(process.execPath, [join(TOOL, "bin/text-pass.mjs"), "--from-pages", join(repo, "pages.json"), "--no-merge", "--out", join(repo, extra), ...(env ? [] : ["--no-jev"])], { cwd: repo, env: { ...process.env, BABYSITTER_ROOT: repo, BABYSITTER_JEV_ENV: "", ...(env || { JEV_API_KEY: "", AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "" }) } });
    const off = await run("off"), on = await run("on", quiet.env);
    const a = JSON.parse(readFileSync(join(repo, "off/text-pass.json"), "utf8")), b = JSON.parse(readFileSync(join(repo, "on/text-pass.json"), "utf8"));
    assert.equal(a.jev.on, false, off.stdout + off.stderr);
    assert.match(off.stdout, /Jev off/);
    assert.equal(b.jev.on, true, on.stdout + on.stderr);
    const ruleOnly = (x) => x.findings.filter((f) => !f.jev).map((f) => f.items[0].what);
    assert.deepEqual(ruleOnly(b), ruleOnly(a));
    assert.equal(ruleOnly(b).length, 1);
    assert.equal(on.status, 1, "a rule finding still fails the pass");
    await quiet.close();
    rmSync(repo, { recursive: true, force: true });
  });
  await t("invariant: content.spec skips its copy checks only when the text pass ran them, never because of a Jev answer", async () => {
    const src = readFileSync(join(TOOL, "playwright/content.spec.js"), "utf8");
    assert.match(src, /const TEXT_PASS = process\.env\.BABYSITTER_TEXT_PASS && existsSync/);
    assert.doesNotMatch(src, /jev/i);
  });
  await t("triage: every finding is kept and labelled; a noise verdict carries its mechanism; hard stays hard", async () => {
    const findings = [
      { route: "/", test: "6.4 contrast", items: [{ what: "text at 1.02:1 on 9 pages [6.4]", where: "p.muted" }], status: "failed" },
      { route: "/terms", test: "consistency/contradiction", rule: "consistency/contradiction", items: [{ what: "14 days ⟷ 30 days [consistency/contradiction]", where: "/terms" }], status: "failed" },
    ];
    const tj = await mockJev((k, q, st) => (q.type === "choice" ? (/C000/.test(k) ? { N1: 0.9, none: 0.1 } : { none: 1 }) : /C000/.test(k) ? 0.5 : 0.9));
    const r = await triage(makeJev({ env: { ...tj.env } }), findings);
    annotate(findings, r.candidates);
    assert.equal(findings.length, 2);
    assert.equal(findings[0].triage[0].verdict, "likely noise");
    assert.match(findings[0].triage[0].reason, /Contrast maths/);
    assert.equal(findings[1].triage[0].verdict, "likely real");
    assert.ok(!findings[0].advisory);
    await tj.close();
  });
  await t("--fast: 768 on one route per template, a role that sees the same page checked once, both said", async () => {
    const routes = [{ path: "/", auth: false }, { path: "/blog/a", template: "/blog/[slug]", auth: false }, { path: "/blog/b", template: "/blog/[slug]", auth: false }, { path: "/terms", auth: false }, { path: "/terms", auth: true, role: "user" }];
    const tp = [page("/terms", [line("Terms", "heading"), line("Same text.")]), page("/terms", [line("Terms", "heading"), line("Same text.")], { auth: true, role: "user" })];
    const plan = buildFastPlan(routes, tp);
    assert.deepEqual(plan.midRoutes, ["public /", "public /blog/a", "public /terms", "user /terms"]);
    assert.ok(plan.drop["user /terms"]);
    process.env.BABYSITTER_FAST = "1";
    const f = join(mkdtempSync(join(tmpdir(), "bs-fast-")), "plan.json");
    writeFileSync(f, JSON.stringify(plan));
    process.env.BABYSITTER_FAST_PLAN = f;
    assert.match(fastSkip({ path: "/blog/b", auth: false }, "tablet-768"), /768 runs on one route per page template .*\[by design scope\]/);
    assert.equal(fastSkip({ path: "/blog/b", auth: false }, "desktop-1440"), null);
    assert.match(fastSkip({ path: "/terms", auth: true, role: "user" }, "mobile-390"), /checked once/);
    delete process.env.BABYSITTER_FAST; delete process.env.BABYSITTER_FAST_PLAN;
  });
  await t("project map: copy with file:line, UI hints, the route's files; a changed file re-parsed, the rest reused", async () => {
    const repo = mkdtempSync(join(tmpdir(), "bs-map-"));
    mkdirSync(join(repo, "app/terms"), { recursive: true }); mkdirSync(join(repo, "components"), { recursive: true });
    writeFileSync(join(repo, "app/terms/page.tsx"), 'import { Note } from "../../components/note";\nexport default function P() {\n  return <main><h1>Terms</h1><p>Refunds are possible within 14 days of purchase.</p><select><option>a</option></select><Note /></main>;\n}\n');
    writeFileSync(join(repo, "components/note.tsx"), 'export function Note() { return <p>We do not operate a telephone line.</p>; }\n');
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const a = buildProjectMap(repo);
    assert.equal(a.stats.parsed, 2);
    assert.deepEqual(a.map.routes["/terms"].files, ["app/terms/page.tsx", "components/note.tsx"]);
    assert.equal(a.map.routes["/terms"].ui.nativeSelect, 1);
    assert.deepEqual(placesOf(a.map, "Refunds are possible within 14 days of purchase.").map((p) => `${p.file}:${p.line}`), ["app/terms/page.tsx:3"]);
    writeFileSync(join(repo, "components/note.tsx"), 'export function Note() { return <p>Write to us through the contact form.</p>; }\n');
    const b = buildProjectMap(repo);
    assert.equal(b.stats.parsed, 1); assert.equal(b.stats.reused, 1);
    mergeRendered(b.map, [page("/terms", [line("Terms", "heading")])]);
    assert.equal(b.map.rendered["/terms"].rendered, true);
    rmSync(repo, { recursive: true, force: true });
  });
  await t("benchmark: the stored site (140 tester cards) scores the 5.6.2 rules of its read; a dash finding never counts as a caught contradiction", () => {
    const bench = join(TOOL, "test/jev-bench/site-a");
    const cards = JSON.parse(readFileSync(join(bench, "cards.json"), "utf8")).cards;
    assert.equal(cards.length, 140);
    const p = JSON.parse(readFileSync(join(bench, "pages.json"), "utf8"));
    const det = [...p.det, ...p.site].map((d) => ({ route: d.route, rule: d.id, items: [{ what: d.what, where: d.where }] }));
    const s = score(flatten({ findings: det }), cards);
    assert.ok(s.caught >= 13 && s.caught <= 20, `rules alone: ${s.caught}`);
    assert.equal(s.byKind.contradiction.caught, 0);
    // anonymised: none of the source product's or tester's names (compared by hash, so the names are not in the repo)
    const named = new Set(["2ecad292594e8592", "9f55818a72148cbb"]);
    const words = new Set(JSON.stringify(p).toLowerCase().match(/\p{L}+/gu) || []);
    assert.ok(![...words].some((w) => named.has(createHash("sha256").update(w).digest("hex").slice(0, 16))), "a name left in the benchmark pages");
  });
} finally { await m.close(); }
if (failed) process.exit(1);
console.log("jev: ok");
void existsSync;
