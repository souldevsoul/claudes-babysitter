// The audit must never call a repository clean because a check broke on it.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseColor } from "../lib/colors.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0; const ok = (m) => { n++; console.log("  ✓", m); };
const repo = mkdtempSync(join(tmpdir(), "audit-safety-"));
try {
  // a theme colour with too few channels (seen on Resonate: an hsl() with two values) is "not a colour", not a crash
  assert.equal(parseColor("hsl(222 47%)"), null);
  assert.equal(parseColor("rgb(10 20)"), null);
  assert.ok(parseColor("hsl(222 47% 11%)"));
  mkdirSync(join(repo, "src/app"), { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "15", tailwindcss: "4" } }));
  writeFileSync(join(repo, "src/app/globals.css"), '@import "tailwindcss";\n@theme { --color-background: hsl(0 0% 100%); --color-foreground: hsl(222 47%); --color-muted: hsl(210 40%); }\n');
  writeFileSync(join(repo, "src/app/page.tsx"), "export default function P() { return <select />; }\n");
  execFileSync("git", ["init", "-q"], { cwd: repo }); execFileSync("git", ["add", "-A"], { cwd: repo });
  const r = spawnSync(process.execPath, [join(ROOT, "bin/audit-summary.mjs"), repo], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Total\s+[1-9]/, "findings reported, not a silent zero");
  assert.doesNotMatch(r.stdout, /зелёный/);
  ok("a theme with a malformed colour is audited (no crash, no false green)");
  // a check that dies → the audit fails loudly (exit 2), never "green"
  const broken = spawnSync(process.execPath, ["-e", `process.argv[1]=${JSON.stringify(join(ROOT, "bin/audit-summary.mjs"))}; import(${JSON.stringify(join(ROOT, "lib/adoption.js"))}).then(({ auditRepo }) => { try { auditRepo("/nonexistent/dir/for/audit"); console.log("NO THROW"); } catch (e) { console.log("THREW", e.message); } })`], { encoding: "utf8" });
  assert.match(broken.stdout, /THREW the check did not finish/, broken.stdout + broken.stderr);
  ok("a check that does not finish makes the audit fail loudly, never green");
  // a folder with code but no git repository lists no files: that is "nothing checked" (exit 2), never 0 problems
  const plain = mkdtempSync(join(tmpdir(), "nogit-"));
  mkdirSync(join(plain, "src", "app"), { recursive: true });
  writeFileSync(join(plain, "package.json"), "{}");
  writeFileSync(join(plain, "src", "app", "page.tsx"), "export default function P(){ return <button className=\"bg-red-500\">x</button>; }\n");
  const ng = spawnSync(process.execPath, [join(ROOT, "bin/ui-check.mjs"), "--repo", plain, "--format", "json"], { encoding: "utf8" });
  assert.equal(ng.status, 2, ng.stdout + ng.stderr); assert.match(ng.stderr, /nothing was checked/);
  rmSync(plain, { recursive: true, force: true });
  ok("a full check that finds no files to check fails (exit 2) instead of reporting a clean repository");
} finally { rmSync(repo, { recursive: true, force: true }); }
console.log(`audit-safety: ${n} cases passed`);
