// End-to-end checks of bin/ui-check.mjs on throwaway git repos (created in the OS temp dir).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const CHECK = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "ui-check.mjs");
function repo(files) {
  const d = mkdtempSync(join(tmpdir(), "uig-test-"));
  for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); }
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: d });
  return d;
}
const run = (d, ...a) => JSON.parse(spawnSync(process.execPath, [CHECK, "--repo", d, "--format", "json", ...a], { encoding: "utf8" }).stdout || "[]");
const rules = (list) => (Array.isArray(list) ? list : list.problems).map((p) => p.rule);
let n = 0;
const t = (name, fn) => { const dirs = []; try { fn((f) => { const d = repo(f); dirs.push(d); return d; }); n++; } catch (e) { console.error(`✗ ${name}\n`, e.message); process.exitCode = 1; } finally { dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); } };

const unlayered = ".card { padding: var(--s-4); }\n";

t("require-layer is ON in a Tailwind project", (mk) => {
  const d = mk({ "package.json": '{"devDependencies":{"tailwindcss":"^4"}}', "src/app/x.css": unlayered });
  assert.ok(rules(run(d)).includes("ui/require-layer"));
});
t("require-layer is OFF in an unlayered Bootstrap/SCSS project", (mk) => {
  const d = mk({ "package.json": '{"dependencies":{"bootstrap":"^5"}}', "src/app/x.css": unlayered });
  assert.ok(!rules(run(d)).includes("ui/require-layer"));
});
t("cssLayers in the config overrides detection", (mk) => {
  const d = mk({ "package.json": "{}", "babysitter.config.json": '{"cssLayers":true}', "src/app/x.css": unlayered });
  assert.ok(rules(run(d)).includes("ui/require-layer"));
});
t("public/ theme is checked, vendored libraries and minified files are not", (mk) => {
  const lit = "@layer components { .a { color: #123456; } }\n";
  const d = mk({ "package.json": "{}", "public/assets/scss/_theme.scss": lit, "public/assets/css/bootstrap.css": lit, "public/assets/css/app.min.css": lit, "public/assets/css/fontawesome-all.css": lit });
  const files = new Set(run(d).map((p) => p.file));
  assert.ok(files.has("public/assets/scss/_theme.scss"));
  for (const f of ["public/assets/css/bootstrap.css", "public/assets/css/app.min.css", "public/assets/css/fontawesome-all.css"]) assert.ok(!files.has(f), f);
});
t("SCSS variables and colours computed from tokens are tokens", (mk) => {
  const d = mk({ "package.json": "{}", "src/x.scss": "@layer c { .a { color: $primary; background: rgba($primary, .5); border-color: color-mix(in srgb, var(--x) 3%, transparent); font-family: var(--font); } }\n" });
  assert.deepEqual(rules(run(d)).filter((r) => r === "ui/token-values"), []);
});
t("the product's own eslint-disable comments for unknown rules are not reported", (mk) => {
  const d = mk({ "package.json": "{}", "src/app/p.tsx": "// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const P = () => <p>ok</p>;\n" });
  assert.deepEqual(rules(run(d)), []);
});

/* ───────── 3.0: theme gates, component heuristic, @apply, registry, micro-check ───────── */
const shadcn = (css, extra = {}) => ({
  "package.json": '{"dependencies":{"next":"16","class-variance-authority":"^0.7"},"devDependencies":{"tailwindcss":"^4"}}',
  "components.json": "{}",
  "src/app/globals.css": css,
  "src/app/layout.tsx": 'import { Geist } from "next/font/google";\nexport default function L({ children }) { return <html><body>{children}</body></html>; }\n',
  "src/components/ui/button.tsx": 'import { cva } from "class-variance-authority";\nexport const b = cva("", { variants: { variant: { default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90", outline: "" } } });\nexport function Button(p) { return <button {...p} />; }\n',
  ...extra,
});
const STOCK = '@import "tailwindcss";\n@layer base { :root { --background: oklch(1 0 0); --foreground: oklch(0.145 0 0); --primary: oklch(0.205 0 0); --primary-foreground: oklch(0.985 0 0); --radius: 0.625rem; } }\n';
const OWN = '@import "tailwindcss";\n@layer base { :root { --background: oklch(0.98 0.01 80); --foreground: oklch(0.2 0.02 60); --muted-foreground: oklch(0.45 0.02 60); --primary: oklch(0.55 0.17 35); --primary-foreground: oklch(0.99 0 0); --radius: 2px; } }\n';
const commitAll = (d) => execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm next", { cwd: d });
const changedJson = (d) => JSON.parse(spawnSync(process.execPath, [CHECK, "--repo", d, "--changed", "HEAD", "--format", "json"], { encoding: "utf8" }).stdout);

t("theme first: a UI edit on a stock shadcn theme is blocked; after theming it passes", (mk) => {
  const d = mk(shadcn(STOCK, { "src/app/layout.tsx": 'import { Geist } from "next/font/google";\\nexport default function L({ children }) { return <html><body>{children}</body></html>; }\\n' }));
  writeFileSync(join(d, "src/app/page.tsx"), "export default function P(){ return <p className=\"text-foreground\">hi</p>; }\n");
  assert.ok(changedJson(d).problems.some((p) => p.rule === "theme/theme-first" && /Сначала обнови тему/.test(p.message)));
  writeFileSync(join(d, "src/app/globals.css"), OWN);
  writeFileSync(join(d, "src/app/layout.tsx"), 'import { Fraunces } from "next/font/google";\nexport default function L({ children }) { return <html><body>{children}</body></html>; }\n');
  assert.ok(!changedJson(d).problems.some((p) => p.rule === "theme/theme-first"));
});

t("contrast: a theme change that drops muted text to 1.6:1 blocks; card pair only warns", (mk) => {
  const d = mk(shadcn(OWN));
  writeFileSync(join(d, "src/app/globals.css"), OWN.replace("--muted-foreground: oklch(0.45 0.02 60)", "--muted-foreground: oklch(0.85 0 0)").replace("--radius: 2px;", "--radius: 2px; --card: oklch(0.3 0 0); --card-foreground: oklch(0.35 0 0);"));
  const j = changedJson(d);
  const c = j.problems.filter((p) => p.rule === "theme/contrast");
  assert.equal(c.length, 1, JSON.stringify(j.problems));
  assert.match(c[0].message, /muted text \/ background/);
  assert.ok(c[0].line > 1, "points at the token line");
  assert.ok(j.warnings.some((w) => /card text/.test(w.message)));
});

t("contrast: a field border token under 3:1 blocks (control boundary, WCAG 1.4.11)", (mk) => {
  const d = mk(shadcn(OWN));
  writeFileSync(join(d, "src/app/globals.css"), OWN.replace("--radius: 2px;", "--radius: 2px; --input: oklch(0.922 0 0);"));
  const c = changedJson(d).problems.filter((p) => p.rule === "theme/contrast");
  assert.ok(c.some((p) => /field border/.test(p.message) && /3:1/.test(p.message)), JSON.stringify(c));
});

t("components: a new kit StatCard next to StatTile is a duplicate role; an unused kit component is flagged; a used one passes", (mk) => {
  const d = mk(shadcn(OWN, {
    "src/components/ui/stat-tile.tsx": "export function StatTile(){ return <div className=\"rounded-lg border p-4\" />; }\n",
    "src/app/page.tsx": 'import { StatTile } from "@/components/ui/stat-tile";\nexport default function P(){ return <StatTile />; }\n',
  }));
  writeFileSync(join(d, "src/components/ui/stat-card.tsx"), "export function StatCard(){ return <div className=\"rounded-lg border p-4\" />; }\n");
  writeFileSync(join(d, "src/components/ui/kpi-strip.tsx"), "export function KpiStrip(){ return <div className=\"flex gap-4\" />; }\n");
  const j = changedJson(d).problems.map((p) => p.message).join("\n");
  assert.match(j, /StatCard duplicates the role of StatTile/);
  assert.match(j, /KpiStrip is a shared component that nothing imports/);
  writeFileSync(join(d, "src/app/page.tsx"), 'import { StatTile } from "@/components/ui/stat-tile";\nimport { KpiStrip } from "@/components/ui/kpi-strip";\nexport default function P(){ return <KpiStrip><StatTile /></KpiStrip>; }\n');
  rmSync(join(d, "src/components/ui/stat-card.tsx"));
  assert.deepEqual(changedJson(d).problems.filter((p) => p.rule.startsWith("ui-audit")), []);
});

t("components: a kit part rendered inside its own file (DialogOverlay) is not an orphan", (mk) => {
  const d = mk(shadcn(OWN, {
    "src/components/ui/dialog.tsx": "function DialogOverlay(p){ return <div {...p} />; }\nfunction DialogContent(p){ return <div><DialogOverlay />{p.children}</div>; }\nexport { DialogOverlay, DialogContent };\n",
    "src/app/page.tsx": 'import { DialogContent } from "@/components/ui/dialog";\nexport default function P(){ return <DialogContent />; }\n',
  }));
  const r = spawnSync(process.execPath, [join(dirname(CHECK), "ui-audit.mjs"), d, "--only", "components", "--json"], { encoding: "utf8" });
  assert.ok(!JSON.parse(r.stdout).some((x) => /DialogOverlay is a shared component that nothing imports/.test(x.msg)), r.stdout);
});

t("init installs a git pre-commit gate: a commit adding a native <select> is blocked, a clean one passes, an existing hook is kept", (mk) => {
  const d = mk(shadcn(OWN, { "src/app/layout.tsx": 'import { Fraunces } from "next/font/google";\nexport default function L({ children }) { return <html><body>{children}</body></html>; }\n' }));
  mkdirSync(join(d, ".git/hooks"), { recursive: true });
  writeFileSync(join(d, ".git/hooks/pre-commit"), "#!/bin/sh\necho project-hook-ran\n", { mode: 0o755 });
  spawnSync(process.execPath, [join(dirname(CHECK), "ui-init.mjs"), d, "--link", "--no-install"], { encoding: "utf8" });
  const hook = readFileSync(join(d, ".git/hooks/pre-commit"), "utf8");
  assert.match(hook, /project-hook-ran/); assert.match(hook, /hook-pre-commit\.mjs/);
  execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: d });
  writeFileSync(join(d, "src/app/page.tsx"), "export default function P(){ return <select />; }\n");
  const bad = spawnSync("sh", ["-c", "git add -A && git -c user.email=t@t -c user.name=t commit -qm bad"], { cwd: d, encoding: "utf8" });
  assert.notEqual(bad.status, 0, "commit should be blocked"); assert.match(bad.stderr, /blocked this commit/);
  writeFileSync(join(d, "src/app/page.tsx"), "export default function P(){ return <p className=\"text-foreground\">ok</p>; }\n");
  const ok = spawnSync("sh", ["-c", "git add -A && git -c user.email=t@t -c user.name=t commit -qm good"], { cwd: d, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
});

t("red-team: a kit component that is only mentioned (void X) is still an orphan", (mk) => {
  const d = mk(shadcn(OWN, {
    "src/components/ui/payment-badge.tsx": "export function PaymentBadge(){ return <span className=\"text-sm\" />; }\n",
    "src/app/page.tsx": 'import { PaymentBadge } from "@/components/ui/payment-badge";\nvoid PaymentBadge;\nexport default function P(){ return <p>hi</p>; }\n',
  }));
  const r = spawnSync(process.execPath, [join(dirname(CHECK), "ui-audit.mjs"), d, "--only", "components", "--json"], { encoding: "utf8" });
  assert.ok(JSON.parse(r.stdout).some((x) => /PaymentBadge is a shared component that nothing imports/.test(x.msg)), r.stdout);
});

t("@apply with arbitrary values is blocked, theme utilities pass", (mk) => {
  const d = mk({ "package.json": '{"devDependencies":{"tailwindcss":"^4"}}', "src/a.css": "@layer components { .promo { @apply rounded-[13px] bg-[#fef3c7] text-[11px]; } .ok { @apply rounded-lg bg-primary text-sm; } }\n" });
  const r = run(d).filter((p) => p.rule === "ui/apply-values");
  assert.equal(r.length, 3);
});

t("registry: a theme ≥80% like a registered product is a warning, not a block", (mk) => {
  const reg = join(mkdtempSync(join(tmpdir(), "uig-reg-")), "registry.json");
  const a = mk(shadcn(OWN, { "babysitter.config.json": JSON.stringify({ name: "first", registry: reg }) }));
  spawnSync(process.execPath, [join(dirname(CHECK), "fingerprint.mjs"), a, "--register", "--registry", reg]);
  const b = mk(shadcn(OWN.replace("oklch(0.55 0.17 35)", "oklch(0.56 0.16 38)"), { "babysitter.config.json": JSON.stringify({ name: "second", registry: reg }) }));
  writeFileSync(join(b, "src/app/globals.css"), readFileSync(join(b, "src/app/globals.css"), "utf8") + "\n");
  const j = changedJson(b);
  assert.ok(j.warnings.some((w) => w.rule === "theme/lookalike" && /similar to "first"/.test(w.message)), JSON.stringify(j.warnings));
  assert.ok(!j.problems.some((p) => p.rule === "theme/lookalike"));
});

{
  // micro-check against a real HTTP server: misaligned offer cards, low contrast, mobile overflow
  // the dev server runs in its own process: the checks below call spawnSync, which blocks this event loop
  const { spawn } = await import("node:child_process");
  const html = `<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><style>
    body{margin:0;font:16px sans-serif;background:#fff}
    .row{display:flex;gap:16px;padding:16px;width:1100px}.card{flex:1;border:1px solid #ddd;padding:16px}
    .price{font-size:28px}.muted{color:#c8c8c8}
  </style></head><body><main><h1>Plans</h1><div class="row">
    <div class="card"><h3>A</h3><div class="price">$9</div><a href="#" style="display:inline-block;padding:10px">Buy</a></div>
    <div class="card"><h3>B</h3><p>longer text that pushes things down a lot more than the others do</p><div class="price">$19</div><a href="#" style="display:inline-block;padding:10px">Buy</a></div>
    <div class="card"><h3>C</h3><div class="price">$29</div><a href="#" style="display:inline-block;padding:10px">Buy</a></div>
  </div><p class="muted">fine print nobody can read</p>
  <button role="combobox" style="border:1px solid #eee;background:#fff;padding:6px 10px">Week</button>
  <div style="overflow-x:auto"><table style="width:900px"><tr><th>ID</th><th>Client</th><th>Date</th><th>Status</th><th>Amount</th></tr><tr><td>1</td><td>A</td><td>today</td><td>ok</td><td>$1</td></tr></table></div>
  </main></body></html>`;
  const srv = spawn(process.execPath, ["-e", `const h=${JSON.stringify(html)};require("node:http").createServer((q,r)=>{r.writeHead(200,{"content-type":"text/html"});r.end(h)}).listen(0,function(){console.log(this.address().port)})`]);
  const port = await new Promise((r) => srv.stdout.once("data", (b) => r(String(b).trim())));
  const url = `http://localhost:${port}`;
  t("micro-check: rendered contrast, row alignment and mobile overflow on a running dev server", (mk) => {
    const d = mk({ "package.json": "{}" });
    const m = spawnSync(process.execPath, [join(dirname(CHECK), "micro-check.mjs"), "--repo", d, "--url", url, "--routes", "/", "--format", "json"], { encoding: "utf8", timeout: 120000 });
    const list = JSON.parse(m.stdout || "[]");
    const checks = new Set(list.map((p) => p.check));
    assert.ok([...checks].some((c) => /contrast/.test(c)), m.stdout + m.stderr);
    assert.ok([...checks].some((c) => /row alignment/.test(c)), m.stdout);
    assert.ok([...checks].some((c) => /horizontal overflow/.test(c)), m.stdout);
    assert.ok([...checks].some((c) => /mobile table/.test(c)), m.stdout);
    assert.ok([...checks].some((c) => /control boundary/.test(c)), m.stdout);
  });
  t("micro-check: no dev server → skipped, exit 0", (mk) => {
    const d = mk({ "package.json": "{}" });
    const m = spawnSync(process.execPath, [join(dirname(CHECK), "micro-check.mjs"), "--repo", d, "--url", "http://localhost:9", "--routes", "/"], { encoding: "utf8" });
    assert.equal(m.status, 0); assert.match(m.stdout, /skipped/);
  });
  srv.kill();
}

console.log(`ui-check: ${n} end-to-end cases passed`);
