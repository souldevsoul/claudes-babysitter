// 5.5.0 — GitHub issues #4 (onboarding Kindred) and #5 (Compass): the setup gaps and false alarms that need no
// browser, each from the real case. The rendered ones are in test/misses-550.test.mjs.
// RUN: node test/issues-550.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { excludeFromTsconfig, ignoreInEslintFlat, parseJsonc } from "../lib/project-ignores.js";
import { summarize, isTimeoutOnly } from "../lib/run-summary.js";
import { latestRelease } from "../lib/version-check.js";
import { update } from "../lib/update.js";
import { missesDir } from "../lib/misses.js";
import { lintContent, placeholderKeys } from "../lib/content-lint.js";
import { lintSegment } from "../lib/content-rules.js";
import { hireRe, HIRE_RE } from "../playwright/checks/stage.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(TOOL, "node_modules/.bin");
let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 8).join("\n    ")}`); } };
const tmp = (p) => mkdtempSync(join(tmpdir(), `bs-550-${p}-`));
const put = (root, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); } };
const gitRepo = (root) => spawnSync("git", ["init", "-q"], { cwd: root });
const HOME = tmp("home");
const ENV = { ...process.env, HOME, BABYSITTER_HOME: HOME, BABYSITTER_NO_VERSION_CHECK: "1" };
delete ENV.BABYSITTER_LATEST;

/* ═════ #4.1 + #4.2 init: login.url from the sign-in route; the vendored copy out of the product's tsc and eslint ═════ */
const NEXT_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    // Next's own plugin
    "plugins": [{ "name": "next" }],
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mts"],
  "exclude": ["node_modules"]
}
`;
const NEXT_ESLINT = `const eslintConfig = [
  { files: ["**/*.js", "**/*.mjs"], rules: { "no-undef": "error" } },
];

export default eslintConfig;
`;
await t("#4.1/#4.2 init --vendor (Kindred): writes login.url = the detected sign-in route; the product's tsc --noEmit and eslint . pass (they failed on the vendored copy before)", async () => {
  const r = tmp("init");
  put(r, { "package.json": JSON.stringify({ name: "fx", private: true, dependencies: { next: "15.0.0", react: "19.0.0" } }), "app/login/page.tsx": "export default function P() { return null; }\n", "app/dashboard/page.tsx": "export default function P() { return null; }\n", "tsconfig.json": NEXT_TSCONFIG, "eslint.config.mjs": NEXT_ESLINT });
  spawnSync("git", ["init", "-q"], { cwd: r });
  const init = spawnSync(process.execPath, [join(TOOL, "bin/ui-init.mjs"), r, "--existing", "--vendor", "--no-install", "--yes", "--no-git-hook"], { encoding: "utf8", env: ENV });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const cfg = JSON.parse(readFileSync(join(r, "babysitter.config.json"), "utf8"));
  assert.equal(cfg.acceptance.auth.signIn, "/login");
  assert.deepEqual(cfg.login, { url: "/login" }, "prepare signs every role in at login.url");
  assert.match(init.stdout, /login\.url = \/login/);
  const ts = parseJsonc(readFileSync(join(r, "tsconfig.json"), "utf8"));
  assert.ok(ts.exclude.includes("tools/claudes-babysitter") && ts.exclude.includes("node_modules"), JSON.stringify(ts.exclude));
  assert.match(readFileSync(join(r, "tsconfig.json"), "utf8"), /\/\/ Next's own plugin/, "comments and formatting stay");
  assert.match(readFileSync(join(r, "eslint.config.mjs"), "utf8"), /ignores: \["tools\/claudes-babysitter\/\*\*"\]/);
  // the copy's own dependencies (npm install --omit=dev in a real init): the tool's here
  symlinkSync(join(TOOL, "node_modules"), join(r, "tools/claudes-babysitter/node_modules"));
  const tsc = spawnSync(join(BIN, "tsc"), ["-p", "tsconfig.json"], { cwd: r, encoding: "utf8" });
  assert.equal(tsc.status, 0, `tsc after init: ${tsc.stdout}${tsc.stderr}`);
  const lint = spawnSync(join(BIN, "eslint"), ["."], { cwd: r, encoding: "utf8" });
  assert.equal(lint.status, 0, `eslint after init: ${lint.stdout}${lint.stderr}`);
  // without the exclude (5.4.1's init) the product's tsc fails on the copy: the regression is real
  writeFileSync(join(r, "tsconfig.old.json"), NEXT_TSCONFIG);
  const old = spawnSync(join(BIN, "tsc"), ["-p", "tsconfig.old.json"], { cwd: r, encoding: "utf8" });
  assert.notEqual(old.status, 0, "the copy breaks a Next tsconfig when it is not excluded");
  assert.match(old.stdout, /tools\/claudes-babysitter\//);
  // a second init changes nothing
  const again = spawnSync(process.execPath, [join(TOOL, "bin/ui-init.mjs"), r, "--existing", "--vendor", "--no-install", "--yes", "--no-git-hook"], { encoding: "utf8", env: ENV });
  assert.equal(again.status, 0, again.stderr);
  assert.equal((readFileSync(join(r, "eslint.config.mjs"), "utf8").match(/claudes-babysitter/g) || []).length, 2, "one ignore entry (glob + comment)");
  rmSync(r, { recursive: true, force: true });
});

await t("#4.2 project-ignores: tsconfig without an exclude (node_modules kept), an exclude already covering it, the shapes of a flat ESLint config", async () => {
  let r = excludeFromTsconfig('{\n  "compilerOptions": { "strict": true }\n}\n', ["tools/claudes-babysitter"]);
  assert.deepEqual(parseJsonc(r.text).exclude, ["node_modules", "tools/claudes-babysitter"]);
  assert.equal(parseJsonc(r.text).compilerOptions.strict, true);
  r = excludeFromTsconfig('{ "exclude": ["node_modules", "tools"] }', ["tools/claudes-babysitter"]);
  assert.deepEqual(r.added, [], "tools/ already excludes it (Kindred's hand fix)");
  r = excludeFromTsconfig('{ "exclude": [] }', ["tools/claudes-babysitter"]);
  assert.deepEqual(parseJsonc(r.text).exclude, ["tools/claudes-babysitter"]);
  // Next 15's eslint.config.mjs (Kindred, Compass): const eslintConfig = defineConfig([...]); export default eslintConfig;
  const next = 'import { defineConfig, globalIgnores } from "eslint/config";\nconst eslintConfig = defineConfig([\n  ...nextVitals,\n  globalIgnores([".next/**"]),\n]);\n\nexport default eslintConfig;\n';
  let e = ignoreInEslintFlat(next, "tools/claudes-babysitter/**");
  assert.ok(e.done && /defineConfig\(\[\n  \{ ignores: \["tools\/claudes-babysitter\/\*\*"\] \}/.test(e.text), e.text);
  e = ignoreInEslintFlat('export default tseslint.config(\n  js.configs.recommended,\n);\n', "tools/claudes-babysitter/**");
  assert.ok(e.done && /tseslint\.config\(\n  \{ ignores/.test(e.text), e.text);
  e = ignoreInEslintFlat('export default [\n  js.configs.recommended,\n];\n', "tools/claudes-babysitter/**");
  assert.ok(e.done && /export default \[\n  \{ ignores/.test(e.text), e.text);
  e = ignoreInEslintFlat('module.exports = [ { rules: {} } ];', "tools/claudes-babysitter/**");
  assert.ok(e.done, e.text);
  e = ignoreInEslintFlat('globalIgnores(["tools/claudes-babysitter/**"])\nexport default [];', "tools/claudes-babysitter/**");
  assert.ok(!e.done && e.already, "already ignored: left alone");
});

/* ═════ #4.1 a configured role that did not sign in: the run is partial and fails, loudly ═════ */
const report = (tests) => ({ suites: [{ title: "babysitter.spec.js", file: "babysitter.spec.js", specs: [], suites: [{ title: "ui /", specs: tests.map(([title, status, error = "", project = "desktop-1440"]) => ({ title, file: "babysitter.spec.js", tests: [{ projectName: project, status: status === "passed" ? "expected" : "unexpected", results: [{ status, errors: error ? [{ message: error }] : [] }] }] })) }] }] });
await t("#4.1 summary (Kindred): every role skipped with 'no login.url' → each NOT CHECKED, no 'Clean.', rolesNotChecked set (e2e exits 1)", async () => {
  const root = tmp("sum");
  put(root, { ".babysitter/report.json": JSON.stringify(report([["1.1 one primary per view", "passed"]])), ".babysitter/crawl.json": JSON.stringify({ roles: [{ name: "buyer", ok: false, why: "no login.url in babysitter.config.json" }, { name: "specialist", ok: false, why: "no login.url in babysitter.config.json" }] }), ".babysitter/routes.json": JSON.stringify([{ path: "/", auth: false }]) });
  const s = summarize({ root, rerun: "x" });
  assert.deepEqual(s.rolesNotChecked, ["buyer", "specialist"]);
  assert.match(s.text, /✗ role "buyer" NOT CHECKED: no login\.url/);
  assert.match(s.text, /SIGNED-IN PAGES NOT CHECKED for "buyer", "specialist" — the run is partial and fails/);
  assert.doesNotMatch(s.text, /\nClean\./);
  assert.match(readFileSync(join(TOOL, "bin/babysitter.mjs"), "utf8"), /if \(!status && sum\.rolesNotChecked\?\.length\) status = 1;/);
  rmSync(root, { recursive: true, force: true });
});

/* ═════ #4.9 a timeout is "not tested (time budget)", not a finding ═════ */
await t("#4.9 C2 'Test timeout of 250000ms exceeded' @1440 (Kindred) is listed as not tested and kept out of findings.json; a real failure that also timed out stays a finding", async () => {
  const root = tmp("to");
  put(root, { ".babysitter/report.json": JSON.stringify(report([["C2 Analytics / Marketing cookies are offered only when such scripts load", "timedOut", "Test timeout of 250000ms exceeded."], ["C1 cookie choice", "failed", "Error: cookie banner offers no Reject\n\nTest timeout of 30000ms exceeded."], ["1.1 one primary", "passed"]])), ".babysitter/crawl.json": "{}", ".babysitter/routes.json": "[]" });
  const s = summarize({ root, rerun: "x" });
  const f = JSON.parse(readFileSync(join(root, ".babysitter/findings.json"), "utf8")).findings;
  assert.deepEqual(f.map((x) => x.test), ["C1 cookie choice"], JSON.stringify(f));
  assert.match(s.text, /Not tested — time budget \(1\)/);
  assert.match(s.text, /⏱ .*C2 Analytics/);
  assert.equal(s.timeouts, 1);
  assert.ok(isTimeoutOnly({ status: "timedOut", error: "Test timeout of 30000ms exceeded while running \"beforeEach\" hook.\n\nError: page.goto: Target page, context or browser has been closed" }));
  assert.ok(!isTimeoutOnly({ status: "failed", error: "Error: expect(received).toEqual(expected)" }));
  rmSync(root, { recursive: true, force: true });
});

/* ═════ #4.11 update never reads the 12-hour cache, nor a BABYSITTER_LATEST pin ═════ */
await t("#4.11 update (Kindred: 'already at 5.3.0' while v5.3.1 was out): asks git ls-remote although the cache and BABYSITTER_LATEST say older, and refreshes the cache", async () => {
  const home = tmp("cache");
  const prev = { h: process.env.BABYSITTER_HOME, l: process.env.BABYSITTER_LATEST };
  process.env.BABYSITTER_HOME = home; process.env.BABYSITTER_LATEST = "v5.3.0";
  writeFileSync(join(home, "latest-tag.json"), JSON.stringify({ tag: "v5.3.0", at: Date.now() }));
  const repo = tmp("prod");
  put(repo, { "tools/claudes-babysitter/package.json": JSON.stringify({ name: "claudes-babysitter", version: "5.3.0" }), "package.json": "{}" });
  const calls = [];
  const runner = (cmd, args) => { calls.push(`${cmd} ${args.slice(0, 2).join(" ")}`); if (args[0] === "ls-remote") return { status: 0, stdout: "x\trefs/tags/v5.3.0\ny\trefs/tags/v5.3.1\n" }; if (args[0] === "status") return { status: 0, stdout: "" }; return { status: 128, stderr: "fatal: Remote branch v5.3.1 not found in upstream origin" }; };
  try {
    assert.throws(() => update(repo, { runner, install: false }), /could not fetch v5\.3\.1/);
    assert.ok(calls.some((c) => /ls-remote/.test(c)), calls.join("; "));
    assert.equal(JSON.parse(readFileSync(join(home, "latest-tag.json"), "utf8")).tag, "v5.3.1", "the cache now says what the remote said");
    // up to date: the answer names the tag it saw
    put(repo, { "tools/claudes-babysitter/package.json": JSON.stringify({ name: "claudes-babysitter", version: "5.3.1" }) });
    const r = update(repo, { runner, install: false });
    assert.ok(r.upToDate && r.latest.join(".") === "5.3.1");
    assert.match(readFileSync(join(TOOL, "bin/update.mjs"), "utf8"), /asked just now/);
    // the version check itself still uses its cache
    calls.length = 0;
    assert.deepEqual(latestRelease({ env: { BABYSITTER_HOME: home }, runner }), [5, 3, 1]);
    assert.equal(calls.length, 0, "version-check: from the cache");
  } finally {
    process.env.BABYSITTER_HOME = prev.h ?? ""; if (prev.h === undefined) delete process.env.BABYSITTER_HOME;
    if (prev.l === undefined) delete process.env.BABYSITTER_LATEST; else process.env.BABYSITTER_LATEST = prev.l;
  }
});

/* ═════ #4.10 misses writes into the product's .babysitter/, not into the vendored copy ═════ */
await t("#4.10 misses from tools/claudes-babysitter or node_modules/claudes-babysitter → <product>/.babysitter/misses; the tool's own repo keeps misses/", () => {
  assert.equal(missesDir("/p/kindred/tools/claudes-babysitter", "/p/kindred"), "/p/kindred/.babysitter/misses");
  assert.equal(missesDir("/p/x/node_modules/claudes-babysitter/", "/p/x"), "/p/x/.babysitter/misses");
  assert.equal(missesDir(TOOL, "/elsewhere"), join(TOOL, "misses"));
  assert.match(readFileSync(join(TOOL, "bin/misses.mjs"), "utf8"), /missesDir\(TOOL/);
});

/* ═════ #4.3 CT2 by use, not by key name ═════ */
await t("#4.3 CT2 (Kindred auth.astronautEmail = you@example.com): a message used only as placeholder={t(…)} is an input hint; the same address shown as text still fails", async () => {
  const r = tmp("ct2");
  put(r, {
    "package.json": "{}",
    "messages/en.json": JSON.stringify({ auth: { astronautEmail: "you@example.com", emailPlaceholder: "you@example.com", contact: "Write to you@example.com" } }, null, 2),
    "app/login/page.tsx": 'export default function P({ t }) { return (<form><input type="email" placeholder={t("astronautEmail")} /><input placeholder={t("emailPlaceholder")} /><p>{t("contact")}</p></form>); }\n',
  });
  gitRepo(r);
  const res = await lintContent(r, { cfg: {} });
  const ct2 = res.problems.filter((p) => p.id === "CT2");
  assert.deepEqual(ct2.map((p) => p.message.split(":")[0]), ["auth.contact"], JSON.stringify(ct2, null, 1));
  assert.deepEqual([...placeholderKeys(['<input placeholder={t("a.b")} />', "<p>{t(\"c\")}</p><input placeholder={t(\"c\")} />"])], ["a.b"], "a key also shown as text is not a hint");
  rmSync(r, { recursive: true, force: true });
});

/* ═════ #5 A: CT1 in en, and the same key in every locale ═════ */
await t("#5 A CT1 (Compass Terms §4.2, Payment §3, Shipping §2, AML §2, Privacy §2/§5): 'not switched on yet' / 'once card payment is live' fail in en; look-alikes pass", () => {
  const ct1 = (text) => lintSegment({ text, kind: "body", locale: "en" }, {}).filter((x) => x.id === "CT1").map((x) => x.match);
  assert.deepEqual(ct1("Card payment is not switched on yet; once it is, you pay by card at checkout."), ["not switched on yet"]);
  assert.deepEqual(ct1("We store the last four digits once card payment is live."), ["once card payment is live"]);
  assert.deepEqual(ct1("Until payouts are switched on, your balance stays in credits."), ["Until payouts are switched on"]);
  for (const ok of ["Once your profile is live, clients can hire you.", "Notifications are switched on.", "Your listing goes live after review.", "Once the work is accepted, the credits move to the specialist."]) assert.deepEqual(ct1(ok), [], ok);
});
await t("#5 A CT1 parity (Compass: caught in az 'hələ aktiv deyil', missed in en): unfinished copy in one locale is reported at the same key in the others", async () => {
  const r = tmp("ct1");
  put(r, {
    "package.json": "{}",
    "messages/en.json": JSON.stringify({ terms: { s42: "Card payments are paused while we finish the setup with our provider." } }, null, 2),
    "messages/az.json": JSON.stringify({ terms: { s42: "Kartla ödəniş hələ aktiv deyil; provayderlə quraşdırmanı bitiririk." } }, null, 2),
  });
  gitRepo(r);
  const res = await lintContent(r, { cfg: {} });
  const ct1 = res.problems.filter((p) => p.id === "CT1");
  assert.ok(ct1.some((p) => p.file === "messages/az.json"), JSON.stringify(ct1));
  const en = ct1.find((p) => p.file === "messages/en.json");
  assert.ok(en && /the az text of this message is unfinished/.test(en.message), JSON.stringify(ct1));
  rmSync(r, { recursive: true, force: true });
});

/* ═════ #4.6 / #5 FP3 ST3: the product's own hire wording ═════ */
await t("#4.6 / #5 ST3: 'Open a case' (Kindred), 'Start a brief with this profile' (Compass) are hire CTAs; stageGates.hireLabel adds a product's own; 'Open menu' is not", () => {
  assert.ok(HIRE_RE.test("Open a case"));
  assert.ok(HIRE_RE.test("Start a brief with this profile"));
  assert.ok(!HIRE_RE.test("Open menu"));
  assert.ok(!HIRE_RE.test("Read the brief"));
  assert.ok(hireRe({ stageGates: { hireLabel: ["Engage"] } }).test("Engage Nadia"));
  assert.match(readFileSync(join(TOOL, "playwright/acceptance.spec.js"), "utf8"), /stageGates\?\.catalogRole/);
});

/* ═════ #5 robustness: a signal to `babysitter e2e` reaches its child ═════ */
await t("#5 a SIGTERM to the runner reaches its child (lib/forward.js): no orphan keeps running", async () => {
  const d = tmp("sig");
  const pidFile = join(d, "child.pid");
  writeFileSync(join(d, "child.mjs"), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);\n`);
  writeFileSync(join(d, "parent.mjs"), `import { forward } from ${JSON.stringify(join(TOOL, "lib/forward.js"))}; await forward(process.execPath, [${JSON.stringify(join(d, "child.mjs"))}], { stdio: "ignore" });\n`);
  const p = spawn(process.execPath, [join(d, "parent.mjs")], { stdio: "ignore" });
  for (let i = 0; i < 50 && !existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 100));
  const childPid = Number(readFileSync(pidFile, "utf8"));
  const code = await new Promise((res) => { p.on("exit", (c, s) => res(c ?? s)); p.kill("SIGTERM"); });
  assert.equal(code, 143, "the parent exits 128 + SIGTERM once the child is gone");
  await new Promise((r) => setTimeout(r, 300));
  let alive = true; try { process.kill(childPid, 0); } catch { alive = false; }
  if (alive) process.kill(childPid, "SIGKILL");
  assert.equal(alive, false, "the child got the signal");
  rmSync(d, { recursive: true, force: true });
});

/* ═════ #5 FP1 storage for a roles-only project; #5 B the narrowest viewport of the run ═════ */
await t("#5 FP1 (Compass: storage.json ENOENT): a roles-only project's default storage is its first role's; #5 B: --project mobile-390 + desktop-1440 makes 390 the narrowest", () => {
  const root = tmp("store");
  put(root, { "babysitter.config.json": JSON.stringify({ roles: [{ name: "buyer" }, { name: "specialist" }] }), ".babysitter/storage-specialist.json": "{}", ".babysitter/storage-buyer.json": "{}" });
  const code = `import { storageFor, defaultStorage, viewports } from ${JSON.stringify(join(TOOL, "playwright/project.js"))};
console.log(JSON.stringify({ d: storageFor(), u: storageFor("user"), s: storageFor("specialist"), vp: viewports({}, { BABYSITTER_PROJECTS: "mobile-390,desktop-1440" }).map((v) => v.name), all: viewports({}, {}).length }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { ...process.env, BABYSITTER_ROOT: root } });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.d, join(root, ".babysitter/storage-buyer.json"));
  assert.equal(o.u, join(root, ".babysitter/storage-buyer.json"));
  assert.equal(o.s, join(root, ".babysitter/storage-specialist.json"));
  assert.deepEqual(o.vp, ["mobile-390", "desktop-1440"]);
  assert.equal(o.all, 5);
  assert.match(readFileSync(join(TOOL, "bin/babysitter.mjs"), "utf8"), /BABYSITTER_PROJECTS/);
  rmSync(root, { recursive: true, force: true });
});

rmSync(HOME, { recursive: true, force: true });
if (failed) { console.error(`issues-550: ${failed} failed`); process.exit(1); }
console.log("issues-550: all passed");
