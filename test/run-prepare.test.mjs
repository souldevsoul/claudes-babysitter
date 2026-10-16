// RUN area: prepare finds every language and how to switch it on, one real instance of every dynamic route (rows that
// navigate by click included), every role; and what it could not reach is written down (crawl.json), not dropped.
// Then `babysitter e2e` runs the locale / state checks it found and its summary names what did not run.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { start } from "./fixtures/run/site/server.mjs";
import { repoLocales, localize, selectLocales, inOtherLocale } from "../lib/locales.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
// the fixture server lives in this process: children must run asynchronously (spawnSync would freeze the server)
const sh = (args, opts) => new Promise((res) => {
  const c = spawn(process.execPath, args, opts);
  let stdout = "", stderr = "";
  c.stdout.on("data", (d) => (stdout += d)); c.stderr.on("data", (d) => (stderr += d));
  const timer = setTimeout(() => c.kill("SIGKILL"), opts.timeout || 600_000);
  c.on("close", (status) => { clearTimeout(timer); res({ status, stdout, stderr }); });
});
let failed = 0;
async function t(name, fn) { try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const site = await start();
const repo = mkdtempSync(join(tmpdir(), "bs-run-prep-"));
const w = (f, s) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), s); };
w("package.json", '{"name":"fx","private":true}');
for (const p of ["app/page.tsx", "app/about/page.tsx", "app/login/page.tsx", "app/dashboard/page.tsx", "app/dashboard/jobs/page.tsx", "app/tasks/page.tsx", "app/tasks/[id]/page.tsx", "app/projects/[slug]/page.tsx"]) w(p, "export default function P() { return null; }\n");
w("lib/i18n/context.tsx", 'export type Locale = "en" | "az" | "kk";\nconst STORAGE_KEY = "site-locale";\nexport const get = () => localStorage.getItem(STORAGE_KEY);\n');
w("babysitter.config.json", JSON.stringify({ baseURL: site.url, login: { url: "/login" }, routes: ["/"] }));
execFileSync("git", ["init", "-q"], { cwd: repo });
const env = { ...process.env, BABYSITTER_ROOT: repo, BASE_URL: site.url, LOGIN_EMAIL: "user@x.test", LOGIN_PASSWORD: "pw", SPEC_EMAIL: "spec@x.test", SPEC_PASSWORD: "pw" };
try {
  await t("lib/locales: repo codes + storage key; localize with prefix / query / always-prefixed default; selectLocales narrows by LOCALES", async () => {
    const r = repoLocales(repo);
    assert.deepEqual(r.codes.sort(), ["az", "en", "kk"]);
    assert.equal(r.storageKey, "site-locale");
    assert.equal(localize("/pricing", { code: "kk", prefix: "/kk" }), "/kk/pricing");
    assert.equal(localize("/", { code: "kk", prefix: "/kk" }), "/kk");
    assert.equal(localize("/en/a?x=1", { code: "az", prefix: "/az" }, { code: "en", default: true, prefix: "/en" }), "/az/a?x=1");
    assert.equal(localize("/a", { code: "az", query: { lang: "az" } }), "/a?lang=az");
    const det = { default: "en", locales: [{ code: "en", default: true }, { code: "az" }, { code: "kk" }] };
    assert.deepEqual(selectLocales(det, null, "kk").locales.map((l) => l.code), ["en", "kk"]);
    assert.deepEqual(selectLocales(det, false).locales.map((l) => l.code), ["en"]);
    assert.deepEqual(selectLocales(null, { list: ["ru", "en"], default: "ru", cookie: "NEXT_LOCALE" }).locales[1].cookies, [{ name: "NEXT_LOCALE", value: "en" }]);
    assert.ok(inOtherLocale("/kk/about", det.locales.map((l) => (l.code === "kk" ? { ...l, prefix: "/kk" } : l)) && { locales: [{ code: "kk", prefix: "/kk" }] }));
  });
  writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify({ baseURL: site.url, login: { url: "/login" }, routes: ["/"], roles: [{ name: "specialist", env: { LOGIN_EMAIL: "SPEC_EMAIL", LOGIN_PASSWORD: "SPEC_PASSWORD" } }, { name: "admin", env: { LOGIN_EMAIL: "ADMIN_EMAIL", LOGIN_PASSWORD: "ADMIN_PASSWORD" } }] }));
  const r = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env, timeout: 300_000 });
  const out = r.stdout + r.stderr;
  await t("prepare: exits 0 and reports languages, roles and the dynamic route it could not reach", async () => {
    assert.equal(r.status, 0, out);
    assert.match(out, /languages: en \(default\), az, kk|languages: en \(default\), kk, az/, out);
    assert.match(out, /no page found for 1 dynamic route\(s\): \/projects\/\[slug\]/, out);
    assert.match(out, /role "admin" not checked: no credentials/, out);
  });
  await t("prepare: a dynamic route reached through a row that navigates by click; a page per role", async () => {
    const routes = JSON.parse(readFileSync(join(repo, ".babysitter/routes.json"), "utf8"));
    const task = routes.find((x) => x.template === "/tasks/[id]");
    assert.ok(task && task.auth, JSON.stringify(routes));
    assert.ok(routes.some((x) => x.path === "/dashboard/jobs" && x.role === "specialist"), JSON.stringify(routes));
    assert.ok(!routes.some((x) => x.path.startsWith("/kk")), "pages of another language are covered by the locale runs, not as routes");
    assert.ok(existsSync(join(repo, ".babysitter/storage-specialist.json")) && existsSync(join(repo, ".babysitter/storage.json")));
    const crawl = JSON.parse(readFileSync(join(repo, ".babysitter/crawl.json"), "utf8"));
    assert.ok(crawl.clickedRows.some((x) => /\/tasks → \/tasks\/cmv8/.test(x)), JSON.stringify(crawl));
  });
  await t("prepare: az is switched by the localStorage key the switcher sets, kk by its /kk prefix (hreflang); both verified", async () => {
    const loc = JSON.parse(readFileSync(join(repo, ".babysitter/locales.json"), "utf8"));
    const az = loc.locales.find((l) => l.code === "az"), kk = loc.locales.find((l) => l.code === "kk");
    assert.equal(loc.default, "en");
    assert.deepEqual(az.storage, [{ key: "site-locale", value: "az" }], JSON.stringify(az));
    assert.equal(az.verified, true, JSON.stringify(az));
    assert.equal(kk.prefix, "/kk", JSON.stringify(kk));
    assert.equal(kk.verified, true, JSON.stringify(kk));
  });
  await t("e2e --only ui: run.spec checks every language (az: the CTA sticks out of its card, untranslated title) and the summary says what did not run + --last-failed", async () => {
    const e = await sh([join(TOOL, "bin/babysitter.mjs"), "e2e", "--skip-prepare", "--only", "ui", "--project=mobile-360", "--grep", "i18n", "--workers=2", "--reporter=line"], { cwd: repo, env: { ...env, ROUTES: "" }, timeout: 600_000 });
    const o = e.stdout + e.stderr;
    assert.equal(e.status, 1, o.slice(-3000));
    assert.match(o, /PARTIAL RUN \(--only ui\)\. NOT RUN:[\s\S]*business acceptance/);
    assert.match(o, /NOT WIRED into this repo/);
    assert.match(o, /Suites: .*acceptance ✗ NOT RUN/);
    assert.match(o, /Viewports: mobile-360\s+⚠ NOT RUN: mobile-390, tablet-768, laptop-1280, desktop-1440/);
    assert.match(o, /dynamic routes NOT REACHED .*\/projects\/\[slug\]/);
    assert.match(o, /role "admin" NOT CHECKED/);
    assert.match(o, /e2e --skip-prepare --last-failed --only ui/);
    const f = JSON.parse(readFileSync(join(repo, ".babysitter/findings.json"), "utf8")).findings;
    if (process.env.DEBUG_RUN) console.log(o, JSON.stringify(f, null, 1));
    const az = f.filter((x) => x.locale === "az" && x.route === "/");
    const items = az.flatMap((x) => x.items.map((i) => i.what)).join("\n");
    assert.match(items, /\[az\] sticks out of its card/, items);
    assert.match(items, /\[az\] word broken mid-word: "Tapşı/, `a longer language breaks a header label mid-word at 360: ${items}`);
    assert.ok(!/untranslated|English on the/.test(items), `untranslated text is CT11 in content.spec, not reported again per viewport by run.spec: ${items}`);
    assert.ok(!f.some((x) => x.locale === "kk" && x.route === "/" && x.items.some((i) => /sticks out|broken mid-word/.test(i.what))), "kk fits: no false alarm");
    // --last-failed re-runs exactly the failures (Playwright's .last-run.json in .babysitter/test-results)
    const nFailed = (o.match(/(\d+) failed/) || [])[1];
    const again = await sh([join(TOOL, "bin/babysitter.mjs"), "e2e", "--skip-prepare", "--last-failed", "--only", "ui", "--project=mobile-360", "--workers=2"], { cwd: repo, env, timeout: 600_000 });
    const ao = again.stdout + again.stderr;
    assert.match(ao, new RegExp(`Running ${nFailed} tests?`), ao.slice(0, 1500));
    // fix-plan: grouped, with the re-check command
    const fp = await sh([join(TOOL, "bin/babysitter.mjs"), "fix-plan"], { cwd: repo, env });
    assert.equal(fp.status, 1, fp.stdout + fp.stderr);
    assert.match(fp.stdout, /# Babysitter fix plan/);
    assert.match(fp.stdout, /on: \/ .*mobile-360 in az/);
    assert.match(fp.stdout, /look at: app\/page\.tsx \(page\)/);
    assert.match(fp.stdout, /e2e --skip-prepare --last-failed/);
    // the untranslated title is reported once, by content.spec's CT11, in the language prepare found
    const ct = await sh([join(TOOL, "bin/babysitter.mjs"), "e2e", "--skip-prepare", "--only", "content", "--project=desktop-1440", "--grep", "CT11", "--workers=2", "--reporter=line"], { cwd: repo, env: { ...env, ROUTES: "", BABYSITTER_DNS: "0" }, timeout: 600_000 });
    const co = ct.stdout + ct.stderr;
    assert.equal(ct.status, 1, co.slice(-3000));
    assert.equal((co.match(/Find a specialist for your task/g) || []).length > 0, true, co.slice(-3000));
    assert.match(co, /\[az\][\s\S]*(untranslated in "az"|English on the "az" page): "Find a specialist for your task"/, co.slice(-3000));
  });
  await t("prepare: a crawl that finds no page fails loudly instead of writing an empty route list", async () => {
    const d = mkdtempSync(join(tmpdir(), "bs-run-empty-"));
    writeFileSync(join(d, "babysitter.config.json"), JSON.stringify({ baseURL: site.url, routes: ["/no-such-page"] }));
    const e = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: d, env: { ...process.env, BABYSITTER_ROOT: d, BASE_URL: site.url, LOCALES: "" }, timeout: 120_000 });
    rmSync(d, { recursive: true, force: true });
    assert.equal(e.status, 1, e.stdout + e.stderr);
    assert.match(e.stderr, /the crawl found NO page/);
  });
} finally {
  site.close();
  rmSync(repo, { recursive: true, force: true });
}
if (failed) { console.error(`run-prepare: ${failed} failed`); process.exit(1); }
console.log("run-prepare: all passed");
