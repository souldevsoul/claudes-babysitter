// The text pass reads every page once and runs the copy rules content.spec runs: on the express fixture product (a
// second language, a signed-in role) every content.spec finding must also be a text-pass finding — on the same route,
// role and language, with the same message. Then `e2e --fast` (Jev off: no token) runs the text pass first: content.spec
// skips what it read, the summary says so, the copy findings are in findings.json (suite "text") and everything the
// smaller matrix leaves out is listed as by design scope. No Jev call is made (no token in this test).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "./fixtures/express/server.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (args, opts) => new Promise((res) => {
  const c = spawn(process.execPath, args, opts);
  let out = "";
  c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  const timer = setTimeout(() => c.kill("SIGKILL"), opts.timeout || 1_200_000);
  c.on("close", (status) => { clearTimeout(timer); res({ status, out }); });
});
let failed = 0;
async function t(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }

const site = await start();
const repo = mkdtempSync(join(tmpdir(), "bs-text-"));
writeFileSync(join(repo, "package.json"), '{"name":"ledgerly","private":true}');
writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify({ name: "ledgerly", baseURL: site.url, login: { url: "/login" }, routes: ["/", "/pricing", "/form", "/terms"], acceptance: { company: { name: "Ledgerly", supportEmail: "help@ledgerly.test" }, auth: { signIn: "/login" } } }));
const env = { ...process.env, BABYSITTER_ROOT: repo, BASE_URL: site.url, LOGIN_EMAIL: "user@ledgerly.test", LOGIN_PASSWORD: "pw", BABYSITTER_DNS: "0", CI: "", ROUTES: "", JEV_API_KEY: "", AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "", BABYSITTER_JEV_ENV: "", BABYSITTER_COPY_RECORD: "0", BABYSITTER_NO_VERSION_CHECK: "1" };
const BIN = join(TOOL, "bin/babysitter.mjs");
const W = process.env.PARITY_WORKERS || "2";
const norm = (f) => `${f.route} ${f.auth ? f.role : "public"} ${f.locale || ""} ${String(f.what).replace(/\s+/g, " ").trim()}`;
try {
  const prep = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env, timeout: 300_000 });
  assert.equal(prep.status, 0, prep.out.slice(-2000));
  const t0 = Date.now();
  const content = await sh([BIN, "e2e", "--skip-prepare", "--no-text", "--only", "content", "--project=desktop-1440", `--workers=${W}`, "--reporter=dot"], { cwd: repo, env });
  const tContent = Date.now() - t0;
  const A = JSON.parse(readFileSync(join(repo, ".babysitter/findings.json"), "utf8")).findings;
  const t1 = Date.now();
  const text = await sh([BIN, "text", "--no-jev", "--no-merge"], { cwd: repo, env });
  const tText = Date.now() - t1;
  const B = JSON.parse(readFileSync(join(repo, ".babysitter/text-pass.json"), "utf8"));
  console.log(`  content.spec ${Math.round(tContent / 1000)} s (${A.length} failed tests) · text pass ${Math.round(tText / 1000)} s (${B.loads} loads, ${B.findings.length} findings)`);
  await t("the text pass ran without Jev and said so", () => {
    assert.match(text.out, /Jev off \(--no-jev/);
    assert.equal(B.jev.on, false);
  });
  await t("every content.spec finding is a text-pass finding (same route, role, language and message)", () => {
    const items = A.flatMap((f) => f.items.map((it) => ({ ...f, what: it.what })));
    assert.ok(items.length >= 5, `the fixture should break copy rules (${items.length})`);
    const have = new Set(B.findings.map((f) => norm({ ...f, what: f.items[0].what })));
    // the site-wide tests' findings ("content site-wide" describe; its titles name "Sign in / Log in", which the
    // summary's title parser reads as route "/") are compared with the text pass's site-wide findings
    const SITE = /^(CT15\/CT16|CT17 one term|CT24\/CT26|CT11 other languages)/;
    const missing = items.filter((x) => x.route && !SITE.test(x.test) && !have.has(norm(x)));
    const siteWide = items.filter((x) => !x.route || SITE.test(x.test)).map((x) => String(x.what).replace(/\s+/g, " ").trim());
    const haveSite = new Set(B.findings.filter((f) => !f.route).map((f) => String(f.items[0].what).replace(/\s+/g, " ").trim()));
    assert.deepEqual(missing.map(norm), []);
    assert.deepEqual(siteWide.filter((w) => !haveSite.has(w)), []);
  });
  await t("one load per route × locale × role (content.spec opened pages per test)", () => {
    const routes = JSON.parse(readFileSync(join(repo, ".babysitter/routes.json"), "utf8"));
    assert.ok(B.loads <= routes.length * 2 + 4, `${B.loads} loads for ${routes.length} routes × 2 languages`);
  });
  const fast = await sh([BIN, "e2e", "--skip-prepare", "--fast", "--only", "content", `--workers=${W}`, "--reporter=dot"], { cwd: repo, env });
  await t("e2e --fast: the text pass first, content.spec skips what it read, the summary says so", () => {
    assert.match(fast.out, /text pass — every route read once \(Jev off: no token/);
    assert.match(fast.out, /content ✓ \(text pass\)/, fast.out.slice(-3000));
    assert.match(fast.out, /By design scope \(not run, on purpose\):[\s\S]*content\.spec copy checks \(\d+\): read once by the text pass/);
    assert.match(fast.out, /Text pass: \d+ page\(s\) read once/);
    const F = JSON.parse(readFileSync(join(repo, ".babysitter/findings.json"), "utf8")).findings;
    assert.ok(F.some((f) => f.suite === "text"));
  });
} finally {
  site.close();
  rmSync(repo, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log("text pass parity: ok");
