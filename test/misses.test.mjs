// babysitter misses (lib/misses.js + bin/misses.mjs): the Nexus REST API is mocked — a local HTTP server for the CLI, an
// injected fetch for the library. No network, no browser.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../lib/misses.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
async function test(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").join("\n    ")}`); } }

const KEY = "nxk_test_secret_key_123";
const card = (id, at, by, title, extra = {}) => ({ id, createdAt: at, title, description: extra.description || title, labels: extra.labels || [], createdBy: { name: by, email: `${by.toLowerCase()}@x.test` }, severity: "MEDIUM", status: "DONE" });
const CARDS = [
  card("c000000000000000000aaa111", "2026-10-15T10:00:00Z", "Tester", "Old card before the window"),
  card("c000000000000000000bbb222", "2026-10-16T11:51:00Z", "Tester", "Task board: pagination 2 / 3 does not scroll to the top of the list", { description: "Где: /dashboard/tasks — the page stays at the bottom after clicking 2" }),
  card("c000000000000000000ccc333", "2026-10-16T12:00:00Z", "Tester", "Cookie Decline does nothing", { description: "On https://shop.example/ the Decline button does nothing" }),
  card("c000000000000000000ddd444", "2026-10-16T13:00:00Z", "Admin", "Admin's own note"),
  card("c000000000000000000eee555", "2026-10-16T14:00:00Z", "Bench", "QA · deploy 2026-10-16 (3 findings)"),
  card("c000000000000000000fff666", "2026-10-17T09:00:00Z", "Owner", "Please make the rate cap 1000 instead of 500", { labels: ["kind:decision"] }),
  card("c000000000000000000ggg777", "2026-10-17T10:00:00Z", "Tester", "**Name:** Corner radius of tags differs between pages"),
];
const FINDINGS = { at: "2026-10-16T20:00:00Z", base: "https://shop.example", findings: [
  { suite: "states/locales", route: "/dashboard/tasks", test: "states 2.10/2.1/6.4/B4/N6/A1/4.4 inside dialogs, menus, after an empty submit, wizard steps, pagination [P16 P52]", project: "mobile-360", status: "failed", items: [{ what: "after the pagination \"2\" the new page of results: it starts 300px above the screen [4.4, P52]", where: "ul" }] },
  { suite: "ui", route: "/about", test: "4.6 cookie banner does not cover navigation [P57]", project: "desktop-1440", status: "failed", items: [] },
] };

await test("humanCards: the window is (since, until]; Admin and 'QA · …' deploy cards are left out and counted", async () => {
  const r = M.humanCards(CARDS, { since: "2026-10-16T00:00:00Z", until: "2026-10-20T00:00:00Z" });
  assert.deepEqual(r.cards.map((c) => c.id.slice(-3)), ["222", "333", "666", "777"]);
  assert.deepEqual(r.excluded, { author: 1, deploy: 1, before: 1 });
});
await test("cardTitle drops markdown labels and [BUG]", async () => {
  assert.equal(M.cardTitle(CARDS[6]), "Corner radius of tags differs between pages");
  assert.equal(M.cardTitle({ title: "[BUG] The decline button does nothing" }), "The decline button does nothing");
});
await test("cardRoutes: paths from URLs and from '/route' words", async () => {
  assert.deepEqual(M.cardRoutes(CARDS[1]), ["/dashboard/tasks"]);
  assert.deepEqual(M.cardRoutes(CARDS[2]), ["/"]);
});
await test("classify: a matching finding on the card's page → CAUGHT (suggested); a finding on another page does not count", async () => {
  const r = M.classify(CARDS[1], { findings: FINDINGS.findings });
  assert.equal(r.bucket, "CAUGHT"); assert.equal(r.confirmed, false); assert.match(r.why, /states on \/dashboard\/tasks/);
  // the cookie finding is on /about, the card names / → not caught
  assert.equal(M.classify(CARDS[2], { findings: FINDINGS.findings }).bucket, "MISSED");
  // a card that names no page is never tied to a finding by the heuristic (it matched every finding of its topic)
  assert.equal(M.classify(card("x00000000000000000000hhh8", "2026-10-17T10:00:00Z", "T", "Pagination does not scroll to the top"), { findings: FINDINGS.findings }).bucket, "MISSED");
});
await test("classify: kind:decision → OUT OF SCOPE (suggested); no match → MISSED (suggested)", async () => {
  assert.equal(M.classify(CARDS[5], {}).bucket, "OUT OF SCOPE");
  const m = M.classify(CARDS[6], {});
  assert.equal(m.bucket, "MISSED"); assert.equal(m.confirmed, false);
});
await test("classify: a label wins; only confirmed: true makes it confirmed; the short id (last 6) works too", async () => {
  const labels = { ggg777: { bucket: "MISSED", check: "1.17s tag radius site-wide", confirmed: true, why: "per-page check only" }, "c000000000000000000fff666": { bucket: "OUT OF SCOPE", why: "product decision" } };
  const a = M.classify(CARDS[6], { labels });
  assert.equal(a.bucket, "MISSED"); assert.equal(a.confirmed, true); assert.equal(a.check, "1.17s tag radius site-wide");
  const b = M.classify(CARDS[5], { labels });
  assert.equal(b.bucket, "OUT OF SCOPE"); assert.equal(b.confirmed, false);
  assert.equal(M.classify(CARDS[6], { labels: { ggg777: { bucket: "NOPE" } } }).bucket, "MISSED", "an unknown bucket in a label is ignored");
});
await test("catchRate = CAUGHT / (CAUGHT + MISSED); OUT OF SCOPE stays out; n/a when nothing is in scope", async () => {
  const r = M.catchRate([{ bucket: "CAUGHT", confirmed: true }, { bucket: "MISSED" }, { bucket: "MISSED" }, { bucket: "MISSED" }, { bucket: "OUT OF SCOPE" }]);
  assert.equal(r.text, "1/4 = 25%"); assert.equal(r.oos, 1); assert.equal(r.unconfirmed, 4);
  assert.equal(M.catchRate([{ bucket: "OUT OF SCOPE" }]).text, "n/a (nothing in scope)");
});
await test("fetchCards: Bearer key in the header only; an HTTP error never echoes the key", async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push({ url, auth: opts.headers.Authorization }); return { ok: true, status: 200, text: async () => JSON.stringify(CARDS) }; };
  const list = await M.fetchCards({ url: "https://nexus.test", key: KEY, slug: "shop", fetchImpl });
  assert.equal(list.length, CARDS.length);
  assert.equal(seen[0].url, "https://nexus.test/api/mcp/projects/shop/bugs?limit=2000");
  assert.equal(seen[0].auth, `Bearer ${KEY}`);
  assert.ok(!seen[0].url.includes(KEY));
  await assert.rejects(M.fetchCards({ url: "https://nexus.test", key: KEY, slug: "nope", fetchImpl: async () => ({ ok: false, status: 404, text: async () => `{"error":"Project not found","key":"${KEY}"}` }) }), (e) => !String(e.message).includes(KEY) && /HTTP 404/.test(e.message));
  await assert.rejects(M.fetchCards({ url: "https://nexus.test", key: "", slug: "x", fetchImpl }), /NEXUS_API_KEY/);
});
await test("nexusEnv: NEXUS_API_KEY, else the first of NEXUS_API_KEYS", async () => {
  assert.equal(M.nexusEnv({ NEXUS_URL: "https://n.test/", NEXUS_API_KEYS: "k1, k2" }).key, "k1");
  assert.equal(M.nexusEnv({ NEXUS_URL: "https://n.test/", NEXUS_API_KEY: "k0", NEXUS_API_KEYS: "k1" }).key, "k0");
  assert.equal(M.nexusEnv({ NEXUS_URL: "https://n.test/" }).url, "https://n.test");
});
await test("runMisses: since = the state's last run when not given; writes the report and moves the state on; suggested ones say so", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-misses-"));
  try {
    const stateFile = join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ projects: { shop: { lastRun: "2026-10-16T12:30:00Z" } } }));
    writeFileSync(join(dir, "findings.json"), JSON.stringify(FINDINGS));
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(CARDS) });
    const r = await M.runMisses({ slug: "shop", product: "Shop", findingsFiles: [join(dir, "findings.json")], outDir: dir, stateFile, version: "9.9.9", env: { NEXUS_URL: "https://n.test", NEXUS_API_KEY: KEY }, fetchImpl, now: new Date("2026-10-20T08:00:00Z") });
    assert.deepEqual(r.rows.map((x) => x.short), ["fff666", "ggg777"], "only cards after the last run");
    assert.equal(r.file, join(dir, "shop-2026-10-20.md"));
    const md = readFileSync(r.file, "utf8");
    assert.match(md, /Catch rate: 0\/1 = 0%/);
    assert.match(md, /suggested — needs human confirm/);
    assert.ok(!md.includes(KEY), "the key is never written");
    assert.ok(!md.includes("Tester") && !md.includes("Owner"), "authors are left out by default (public repo)");
    const st = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(st.projects.shop.lastRun, "2026-10-20T08:00:00.000Z");
    assert.equal(st.projects.shop.catchRate, "0/1 = 0%");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ───────── the CLI against a mocked Nexus ───────── */
const server = createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401); return res.end('{"error":"Unauthorized"}'); }
  const m = req.url.match(/^\/api\/mcp\/projects\/([^/]+)\/bugs/);
  if (!m || m[1] !== "shop") { res.writeHead(404); return res.end('{"error":"Project not found"}'); }
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(CARDS));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const NEXUS = `http://127.0.0.1:${server.address().port}`;
const cli = (args, env = {}) => new Promise((resolve) => {
  // spawnSync would block the mock server's event loop: run the CLI asynchronously
  import("node:child_process").then(({ spawn }) => {
    const p = spawn(process.execPath, [join(TOOL, "bin/babysitter.mjs"), "misses", ...args], { env: { PATH: process.env.PATH, NEXUS_URL: NEXUS, NEXUS_API_KEY: KEY, ...env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("close", (status) => resolve({ status, out, err }));
  });
});
await test("CLI: --project --since --findings --labels --out: prints the catch rate, writes misses/<slug>-<date>.md and the state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-misses-cli-"));
  try {
    writeFileSync(join(dir, "f.json"), JSON.stringify(FINDINGS));
    mkdirSync(join(dir, "labels"));
    writeFileSync(join(dir, "labels", "shop.json"), JSON.stringify({ ccc333: { bucket: "MISSED", check: "C6 decline really declines", fixture: "test/misses-52.test.mjs", oldPassed: "C1 only looked for the button", confirmed: true } }));
    const r = await cli(["--project", "shop", "--since", "2026-10-16T00:00:00Z", "--findings", join(dir, "f.json"), "--out", dir]);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /shop: catch rate 1\/3 = 33% — CAUGHT 1 · MISSED 2 · OUT OF SCOPE 1 \(4 cards, 3 suggested/);
    assert.ok(!r.out.includes(KEY) && !r.err.includes(KEY));
    const file = readFileSync(join(dir, readFileSync(join(dir, "state.json"), "utf8").match(/"report": "[^/]+\/([^"]+)"/)[1]), "utf8");
    assert.match(file, /C6 decline really declines — test\/misses-52.test.mjs/);
    assert.match(file, /\| ccc333 \| 2026-10-16 \|.*\| confirmed \|/);
    assert.ok(existsSync(join(dir, "state.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
await test("CLI: --dry-run writes nothing; a wrong key or project fails with the HTTP status, never the key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-misses-cli-"));
  try {
    const r = await cli(["--project", "shop", "--since", "2026-10-16T00:00:00Z", "--out", dir, "--dry-run"]);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /no findings\.json given: nothing can be CAUGHT/);
    assert.match(r.out, /# Misses — shop/);
    assert.ok(!existsSync(join(dir, "state.json")));
    const bad = await cli(["--project", "nope", "--out", dir, "--dry-run"]);
    assert.equal(bad.status, 1); assert.match(bad.err, /HTTP 404/);
    const nokey = await cli(["--project", "shop", "--out", dir, "--dry-run"], { NEXUS_API_KEY: "wrong" });
    assert.equal(nokey.status, 1); assert.match(nokey.err, /HTTP 401/); assert.ok(!nokey.err.includes("wrong"));
    const none = await cli(["--project", "shop", "--out", dir, "--dry-run"], { NEXUS_API_KEY: "" });
    assert.equal(none.status, 1); assert.match(none.err, /NEXUS_API_KEY/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
server.close();
if (failed) { console.log(`\n${failed} misses test(s) failed`); process.exit(1); }
console.log("\nmisses: all tests passed");
