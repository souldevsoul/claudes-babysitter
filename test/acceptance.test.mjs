// Business acceptance end to end: a good and a bad fixture site (fixtures/site/*) served locally, the real
// `babysitter e2e --only acceptance` run against each. The good site must pass every check; the bad one must
// fail exactly the checks it was built to break.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITES = join(ROOT, "fixtures/site");

function serve(dir) {
  const layout = readFileSync(join(dir, "_layout.html"), "utf8");
  const srv = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const name = path === "/" ? "index" : path.slice(1).replace(/\/$/, "");
    if (/\.svg$/.test(name) && existsSync(join(dir, name))) { res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end(readFileSync(join(dir, name))); }
    const main = join(dir, `${name}.main`);
    const ok = /^[a-z-]+$/.test(name) && existsSync(main);
    const body = ok ? readFileSync(main, "utf8") : "<h1>Not found</h1>";
    res.writeHead(ok ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(layout.replace("{{TITLE}}", ok ? name : "Not found").replace("{{MAIN}}", body));
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

async function run(site) {
  const dir = mkdtempSync(join(tmpdir(), "bs-acc-"));
  writeFileSync(join(dir, "babysitter.config.json"), JSON.stringify({
    baseURL: site.url,
    routes: ["/", "/pricing", "/terms", "/login", "/register"],
    login: { url: "/login" },
    acceptance: { currencies: ["EUR", "USD"], company: { name: "Acme Sp. z o.o.", supportEmail: "support@acme.test" }, auth: { signIn: "/login", signUp: "/register" } },
  }));
  const child = spawn(process.execPath, [join(ROOT, "bin/babysitter.mjs"), "e2e", "--skip-prepare", "--only", "acceptance", "--project=desktop-1440", "--workers=6", "--timeout=60000"], {
    cwd: dir, env: { ...process.env, BASE_URL: site.url, ROUTES: "/,/pricing,/terms,/login,/register", BABYSITTER_ROOT: dir },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  await new Promise((r) => child.on("close", r));
  if (!existsSync(join(dir, ".babysitter/report.json"))) throw new Error(`no report for ${site.url}:\n${out.slice(-2000)}`);
  const report = JSON.parse(readFileSync(join(dir, ".babysitter/report.json"), "utf8"));
  rmSync(dir, { recursive: true, force: true });
  const results = [];
  const walk = (s, path) => { for (const x of s.suites || []) walk(x, [...path, x.title]); for (const sp of s.specs || []) for (const t of sp.tests) results.push({ title: [...path, sp.title].join(" › "), status: t.results.at(-1)?.status, error: t.results.at(-1)?.error?.message?.slice(0, 4000) }); };
  for (const s of report.suites) walk(s, []);
  return { results, out };
}

const good = await serve(join(SITES, "good"));
const bad = await serve(join(SITES, "bad"));
let failures = 0;
try {
  const [g, b] = await Promise.all([run(good), run(bad)]);
  const gFailed = g.results.filter((t) => t.status === "failed" || t.status === "timedOut");
  if (gFailed.length) { failures++; console.error(`✗ good site must pass, ${gFailed.length} failed:\n${gFailed.map((t) => `  - ${t.title}\n${(t.error || "").split("\n").slice(0, 6).join("\n")}`).join("\n")}`); }
  else console.log(`✓ good site: ${g.results.filter((t) => t.status === "passed").length} passed, ${g.results.filter((t) => t.status === "skipped").length} skipped`);

  const failed = (re) => b.results.some((t) => re.test(t.title) && (t.status === "failed" || t.status === "timedOut"));
  const expectFail = {
    "B1 build notes (/)": /\/ › B1/, "B2–B4 money (/)": /\/ › B2/, "H2 cursor (/)": /\/ › H2/, "H1 hover (/)": /\/ › H1/,
    "N4 duplicate header links": /\/ › N4/, "F0 footer on /login": /\/login › F0/, "D3 duplicate image": /\/ › D3/, "L1 ragged grid": /\/ › L1/,
    "1.18 palette": /\/ › 1\.18/, "1.19 number spinners": /\/ › 1\.19/, "P1/P2 policy layout": /\/terms › P1/, "P3 unlinked page name": /\/terms › P3/,
    "1.17 shape": /site-wide › 1\.17/, "F1–F5 footer": /site-wide › F1/, "C1 cookie choice": /site-wide › C1/, "C2 analytics claim": /site-wide › C2/,
    "D1 dead link": /site-wide › D1/, "M1 currency": /site-wide › M1/, "D2 /gdpr": /site-wide › D2/, "A1/A3/A6 auth pages": /site-wide › A1/,
  };
  for (const [name, re] of Object.entries(expectFail)) {
    if (!failed(re)) { failures++; console.error(`✗ bad site should fail ${name}: ${b.results.filter((t) => re.test(t.title)).map((t) => t.status).join(",") || "test not found"}`); }
  }
  // the footer test names every break, not just the first
  const footer = b.results.find((t) => /site-wide › F1/.test(t.title))?.error || "";
  for (const w of ["Terms comes first", "Manage cookies", "logo/brand mark", "support email", "We accept"]) if (!footer.includes(w)) { failures++; console.error(`✗ footer report misses "${w}"`); }
  if (!failures) console.log(`✓ bad site: ${Object.keys(expectFail).length} expected failures caught`);
} finally { good.close(); bad.close(); }
if (failures) process.exit(1);
