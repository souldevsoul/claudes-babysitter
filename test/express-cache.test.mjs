// The express result cache: an unchanged render reuses the last verdict ("cached (unchanged render)"); a change to the
// CSS, the DOM, the config, the tool's version or its check code measures again; a failure is never reused as a pass
// (failures are not stored at all), and --no-cache measures everything.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resultsWithExpress } from "../lib/run-summary.js";
import * as X from "../lib/express-cache.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(TOOL, "test/fixtures/express/cache");
let css = "p{color:#111}", body = "<p>One</p>";
const srv = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const root = mkdtempSync(join(tmpdir(), "bs-cache-"));
writeFileSync(join(root, "babysitter.config.json"), "{}");
const run = (extra = {}) => new Promise((res) => {
  const report = join(root, "report.json");
  const c = spawn(process.execPath, [join(TOOL, "node_modules/@playwright/test/cli.js"), "test", "-c", join(DIR, "playwright.config.mjs")], { cwd: DIR, env: { ...process.env, BASE_URL: BASE, REPORT_FILE: report, BABYSITTER_ROOT: root, BABYSITTER_EXPRESS: "1", ...extra } });
  let out = "";
  c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  c.on("close", () => { try { const r = resultsWithExpress(JSON.parse(readFileSync(report, "utf8"))); res({ out, by: Object.fromEntries(r.list.map((x) => [x.title, x])) }); } catch (e) { res({ out, error: e }); } });
});
const cached = (r, title) => !!r.by[title]?.express?.cached;
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } };
try {
  await t("lookup never returns a failure, and only for the same render hash", () => {
    const e = { rules: { a: { hash: "h1", status: "passed" }, b: { hash: "h1", status: "failed" }, c: { hash: "h1", status: "skipped" } } };
    assert.ok(X.lookup(e, "a", "h1"));
    assert.equal(X.lookup(e, "a", "h2"), null);
    assert.equal(X.lookup(e, "b", "h1"), null);
    assert.ok(X.lookup(e, "c", "h1"));
    const dir = join(root, ".state");
    X.writeEntry(dir, "page", [{ title: "a", status: "passed", hash: "h1", cacheable: true }, { title: "b", status: "failed", hash: "h1", cacheable: true }, { title: "n", status: "passed", hash: "h1", cacheable: false }]);
    const back = X.readEntry(dir, "page");
    assert.deepEqual(Object.keys(back.rules), ["a"], "failed and uncacheable verdicts are not stored");
    X.writeEntry(dir, "page", [{ title: "a", status: "failed", hash: "h1", cacheable: true }]);
    assert.deepEqual(Object.keys(X.readEntry(dir, "page").rules), [], "a pass that now fails is dropped");
  });
  await t("the check-code hash, the version and the config hash move with the code / version / config", () => {
    const copy = join(root, "tool");
    mkdirSync(copy);
    cpSync(join(TOOL, "lib"), join(copy, "lib"), { recursive: true });
    const h1 = X.codeHash(copy);
    writeFileSync(join(copy, "lib/extra-check.js"), "export const x = 1;\n");
    assert.notEqual(X.codeHash(copy), h1);
    writeFileSync(join(copy, "package.json"), '{"version":"9.9.9"}');
    assert.equal(X.toolVersion(copy), "9.9.9", "the tool's version is part of the key");
    const st = join(root, ".s2");
    mkdirSync(st);
    writeFileSync(join(root, "cfg.json"), '{"a":1}');
    const c1 = X.configHash(st, join(root, "cfg.json"), {});
    writeFileSync(join(root, "cfg.json"), '{"a":2}');
    assert.notEqual(X.configHash(st, join(root, "cfg.json"), {}), c1);
    assert.notEqual(X.configHash(st, join(root, "cfg.json"), { STRICT: "0" }), X.configHash(st, join(root, "cfg.json"), {}));
  });
  const r1 = await run();
  await t("first run: measured, nothing cached; the failure is a failure", () => {
    assert.ok(r1.by["text colour is the theme's"], r1.out);
    assert.equal(r1.by["text colour is the theme's"].status, "passed");
    assert.equal(r1.by["always fails"].status, "failed");
    assert.ok(!Object.values(r1.by).some((x) => x.express?.cached));
  });
  const r2 = await run();
  await t("unchanged render: passes reused and labelled; the failure measured again and still failing", () => {
    assert.ok(cached(r2, "text colour is the theme's") && cached(r2, "one paragraph"), r2.out);
    assert.ok(r2.by["text colour is the theme's"].annotations.some((a) => a.description === "cached (unchanged render)"));
    assert.equal(r2.by["always fails"].status, "failed");
    assert.ok(!cached(r2, "always fails"));
  });
  css = "p{color:#b00}";
  const r3 = await run();
  await t("a CSS change: measured again — and the check that now fails is not served from the cache", () => {
    assert.ok(!cached(r3, "text colour is the theme's"));
    assert.equal(r3.by["text colour is the theme's"].status, "failed");
    assert.ok(!cached(r3, "one paragraph"));
  });
  css = "p{color:#111}";
  await run(); // measured on the old CSS again: stores
  body = "<p>One</p><div>new</div>";
  const r4 = await run();
  await t("a DOM change: measured again", () => { assert.ok(!cached(r4, "one paragraph")); assert.equal(r4.by["one paragraph"].status, "passed"); });
  const r5 = await run();
  await t("…and reused once it is the last clean render", () => assert.ok(cached(r5, "one paragraph")));
  writeFileSync(join(root, "babysitter.config.json"), '{"allow":{"emoji":true}}');
  const r6 = await run();
  await t("a config change: measured again", () => assert.ok(!cached(r6, "one paragraph")));
  const r7 = await run({ STRICT: "0" });
  await t("an env that changes verdicts (STRICT=0): measured again", () => assert.ok(!cached(r7, "one paragraph")));
  const r8 = await run({ BABYSITTER_EXPRESS_CACHE: "0" });
  await t("--no-cache: everything measured", () => assert.ok(!Object.values(r8.by).some((x) => x.express?.cached)));
} finally { srv.close(); rmSync(root, { recursive: true, force: true }); }
if (failed) process.exit(1);
console.log("express cache: ok");
