// Express order / reset logic: a fixture spec (test/fixtures/express/order/order.spec.js) whose checks that act on the
// page come first and whose read-only checks come after. Run normally (a fresh page per check) and in express mode
// (one shared page): every result must be the same, so nothing a check did leaked into the next one. Also checks the
// express bookkeeping: one load for the read-only stretch, a fresh page for the check that needs one (and it says so),
// skip / soft / hard / timeout reported per check.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resultsWithExpress } from "../lib/run-summary.js";
import { cleanError } from "../lib/express-results.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(TOOL, "test/fixtures/express/order");
const HTML = `<!doctype html><html><head><style>body{margin:0;font:16px Arial;color:#111}#h:hover{color:#b00}.box{width:40px;height:40px;background:#ccc}</style></head>
<body><p id="t">Text</p><p><a id="h" href="#">Hover me</a> <button id="add" onclick="const d=document.createElement('div');d.className='box';document.body.append(d)">Add</button> <input id="f"></p>
<div class="box"></div><div id="menu" hidden>Menu</div><div style="height:3000px"></div></body></html>`;
const srv = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(HTML); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const root = mkdtempSync(join(tmpdir(), "bs-order-"));
const run = (express) => new Promise((res) => {
  const report = join(root, `report-${express ? "express" : "normal"}.json`);
  const cli = join(TOOL, "node_modules/@playwright/test/cli.js");
  const c = spawn(process.execPath, [cli, "test", "-c", join(DIR, "playwright.config.mjs")], { cwd: DIR, env: { ...process.env, BASE_URL: BASE, REPORT_FILE: report, BABYSITTER_ROOT: root, BABYSITTER_EXPRESS: express ? "1" : "", BABYSITTER_EXPRESS_CACHE: "0" } });
  let out = "";
  c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  c.on("close", () => { try { res({ out, ...resultsWithExpress(JSON.parse(readFileSync(report, "utf8"))) }); } catch (e) { res({ out, error: e }); } });
});
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } };
try {
  const [N, E] = [await run(false), await run(true)];
  const key = (r) => r.path.slice(1).join(" › ");
  const view = (list) => Object.fromEntries(list.map((r) => [key(r), { status: r.status, error: (r.errors || []).map(cleanError).join("\n").replace(/\d+ms/g, "#ms"), annotations: [...new Set(r.annotations.filter((a) => a.type !== "express").map((a) => `${a.type}: ${a.description ?? ""}`))] }]));
  await t("both runs reported", () => { assert.ok(N.list?.length, N.out); assert.ok(E.list?.length, E.out); });
  await t("every check: same status, same message, same annotations in express mode as on its own fresh page", () => {
    assert.deepEqual(view(E.list), view(N.list));
  });
  await t("the read-only checks after a check that acted on the page saw the pristine page (pass in both modes)", () => {
    for (const r of N.list.filter((x) => /^read after/.test(x.title))) assert.equal(r.status, "passed", `${r.title} (normal)`);
  });
  await t("skip / soft + hard / timeout are reported per check", () => {
    const by = Object.fromEntries(E.list.map((r) => [r.title, r]));
    assert.equal(by["skips at runtime"].status, "skipped");
    assert.deepEqual(by["skips at runtime"].annotations.find((a) => a.type === "skip").description, "nothing to check here");
    assert.equal(by["soft and hard failures"].status, "failed");
    assert.equal(by["soft and hard failures"].errors.length, 2);
    assert.match(by["soft and hard failures"].errors[0], /soft one/);
    assert.ok(by["soft and hard failures"].annotations.some((a) => a.type === "not tested"));
    assert.equal(by["runs out of time"].status, "timedOut");
    assert.equal(by["fails on purpose with a list"].status, "failed");
  });
  await t("a check that touched the page before opening it ran on its own fresh page, and says so", () => {
    const r = E.list.find((x) => x.title === "touches the page before opening it");
    assert.equal(r.status, "passed");
    assert.ok(r.annotations.some((a) => a.type === "express" && /own fresh page/.test(a.description)), JSON.stringify(r.annotations));
  });
  await t("express loads the page once per check that acted on it, not once per check", () => {
    assert.ok(E.express.loads < E.express.rules, `${E.express.loads} loads for ${E.express.rules} checks`);
    const shared = E.list.filter((r) => r.express?.served === "shared").map((r) => r.title);
    assert.ok(shared.length >= 1, "at least one check reused the loaded page");
  });
} finally { srv.close(); rmSync(root, { recursive: true, force: true }); }
if (failed) process.exit(1);
console.log("express order / reset: ok");
