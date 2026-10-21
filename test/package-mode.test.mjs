// Package mode, as a product installs it: the files `npm pack` ships, under <project>/node_modules/claudes-babysitter.
// Node refuses to strip TypeScript types under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and
// Playwright does not transpile files there either — so everything Playwright loads from the package is plain
// JavaScript, and `babysitter e2e` must really run from such a copy. A run that stops before Playwright writes its
// report exits non-zero with a message, never a quiet summary.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const TOOL = join(here, "..");
let failed = 0, n = 0;
async function t(name, fn) {
  try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); }
}

const files = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: TOOL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].files.map((f) => f.path);

await t("the package ships no TypeScript that Playwright or Node would load (configs and specs are .js)", () => {
  const ts = files.filter((f) => /^(playwright|bin|lib)\/.*\.(ts|mts|cts)$/.test(f) && !/\.d\.ts$/.test(f));
  assert.deepEqual(ts, []);
  assert.ok(files.includes("playwright/playwright.config.js") && files.includes("playwright/content.spec.js"));
  assert.ok(files.includes("playwright/fixtures.d.ts"), "typed entry point for e2e/babysitter.ts");
});

// a product with the packed files under node_modules (dependencies linked from the tool's own node_modules)
const proj = mkdtempSync(join(tmpdir(), "bs-pkg-"));
const pkg = join(proj, "node_modules/claudes-babysitter");
mkdirSync(pkg, { recursive: true });
for (const f of files) { mkdirSync(dirname(join(pkg, f)), { recursive: true }); cpSync(join(TOOL, f), join(pkg, f)); }
for (const d of readdirSync(join(TOOL, "node_modules"))) {
  if (d === "claudes-babysitter" || d.startsWith(".") || existsSync(join(proj, "node_modules", d))) continue;
  symlinkSync(join(TOOL, "node_modules", d), join(proj, "node_modules", d));
}
writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "product", private: true, type: "module" }));
const page = (title, body) => `<!doctype html><html lang="en"><head><title>${title} | Acme</title><meta name="viewport" content="width=device-width"></head><body><header><nav><a href="/">Home</a> <a href="/about">About</a></nav></header><main><h1>${title}</h1>${body}</main><footer><a href="/about">About</a><p>© 2026 Acme Ltd</p></footer></body></html>`;
const site = { "/": page("Home", "<p>Hire a specialist for your task.</p>"), "/about": page("About", "<p>Every specialist is vetted.</p>") };
// the site runs in its own process: the runs below block this one
const server = spawn(process.execPath, ["-e", `const site = ${JSON.stringify(site)}; const s = require("node:http").createServer((q, r) => { const p = q.url.split("?")[0]; if (site[p]) { r.writeHead(200, { "content-type": "text/html" }); r.end(site[p]); } else { r.writeHead(404); r.end("not found"); } }); s.listen(0, "127.0.0.1", () => console.log(s.address().port));`], { stdio: ["ignore", "pipe", "inherit"] });
const port = await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())));
const base = `http://127.0.0.1:${port}`;
writeFileSync(join(proj, "babysitter.config.json"), JSON.stringify({ baseURL: base, routes: ["/", "/about"] }));
const run = (...a) => spawnSync(process.execPath, [join(pkg, "bin/babysitter.mjs"), ...a], { cwd: proj, encoding: "utf8", env: { ...process.env, BASE_URL: base, BABYSITTER_DNS: "0", WORKERS: "1", BABYSITTER_NO_VERSION_CHECK: "1" }, timeout: 300_000 });

try {
  await t(`e2e runs from node_modules on Node ${process.versions.node}: Playwright loads the config and the specs, the report is written`, () => {
    const r = run("e2e", "--only", "content", "--quick");
    const out = `${r.stdout}\n${r.stderr}`;
    assert.ok(!/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING|Stripping types/.test(out), out.slice(-3000));
    assert.ok(existsSync(join(proj, ".babysitter/report.json")), `no report:\n${out.slice(-3000)}`);
    assert.match(out, /Suites:.*content ✓/);
    assert.match(out, /\d+ passed/);
  });
  await t("a strict TypeScript project compiles e2e/babysitter.ts and a spec that uses it (fixtures.d.ts; no TS7016)", () => {
    mkdirSync(join(proj, "e2e"), { recursive: true });
    writeFileSync(join(proj, "e2e/babysitter.ts"), 'export * from "claudes-babysitter/playwright/fixtures.js";\n');
    writeFileSync(join(proj, "e2e/journey.spec.ts"), 'import { test, expect, open, routes } from "./babysitter";\ntest("home", async ({ page, user }) => { await open(page, routes[0]?.path ?? "/"); await expect(user.locator("h1")).toHaveCount(1); });\n');
    writeFileSync(join(proj, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "esnext", moduleResolution: "bundler", target: "es2022", skipLibCheck: true, types: [] }, include: ["e2e/**/*.ts"] }));
    const r = spawnSync(process.execPath, [join(TOOL, "node_modules/typescript/bin/tsc"), "-p", join(proj, "tsconfig.json")], { cwd: proj, encoding: "utf8" });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    rmSync(join(proj, "e2e"), { recursive: true, force: true });
  });
  await t("a run that stops before Playwright writes its report exits non-zero and says so", () => {
    const r = run("e2e", "--skip-prepare", "--only", "content", "--no-such-flag");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Playwright stopped before it wrote a report/);
    assert.doesNotMatch(`${r.stdout}`, /Tests: ✓/, "no summary of the previous run's report");
  });
} finally {
  server.kill();
  rmSync(proj, { recursive: true, force: true });
}
console.log(failed ? `package-mode: ${failed} failed, ${n} passed` : `package-mode: ${n} passed`);
if (failed) process.exit(1);
