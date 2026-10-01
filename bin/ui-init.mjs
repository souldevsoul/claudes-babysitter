#!/usr/bin/env node
/**
 * babysitter  — wire the guardrails into a product repo in one step, for a project being
 * generated right now or an existing one.
 *
 *   babysitter  [repo] [options]
 *     --vendor       copy the tool into <repo>/tools/claudes-babysitter (default; works in CI and for teammates)
 *     --link         reference this checkout by absolute path instead (local machine only, nothing copied)
 *     --ci           also add .github/workflows/claudes-babysitter.yml
 *     --no-git-hook  do not install the git pre-commit gate
 *     --url URL      preview/production URL for the runtime checks
 *     --dev-url URL  local dev server (e.g. http://localhost:3000) for the rendered micro-check in the Stop hook
 *     --dry-run      print the plan, write nothing
 *     --no-install   with --vendor: do not run npm install in tools/claudes-babysitter
 *     --force        overwrite the vendored copy even if it exists
 *
 * Idempotent: re-running updates in place — config is merged, hooks are de-duplicated, the agent
 * instructions live between markers and are replaced, never appended twice.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execSync } from "node:child_process";

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const opt = (f) => { const i = args.indexOf(`--${f}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--url", "--dev-url", "--registry"].includes(args[i - 1]))) || ".");
const DRY = has("dry-run");
const mode = has("link") ? "link" : "vendor";

if (!existsSync(join(repo, "package.json"))) { console.error(`babysitter : ${repo} has no package.json`); process.exit(2); }
const plan = [];
const say = (what, file) => plan.push(`  ${DRY ? "[plan]" : "✓"} ${what}${file ? ` → ${relative(repo, file) || "."}` : ""}`);
const write = (file, content) => { if (!DRY) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content); } };
const readJson = (f, d = {}) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };

/* ───────── 1. detect ───────── */
const pkg = readJson(join(repo, "package.json"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const gitFiles = (() => { try { return execSync("git ls-files --cached --others --exclude-standard", { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean); } catch { return []; } })();
const srcPrefix = existsSync(join(repo, "src")) ? "src/" : "";
const kitDir = ["src/components/ui", "components/ui", "app/components/ui"].find((d) => existsSync(join(repo, d)));
const kitFiles = gitFiles.filter((f) => kitDir && f.startsWith(kitDir + "/") && /\.(t|j)sx$/.test(f)).sort();
const exported = kitFiles.flatMap((f) => [...readFileSync(join(repo, f), "utf8").matchAll(/export\s+(?:const|function)\s+([A-Z]\w*)|export\s*\{([^}]+)\}/g)]
  .flatMap((m) => (m[1] ? [m[1]] : m[2].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter((x) => /^[A-Z]/.test(x)))));
const tailwind = !!deps.tailwindcss || gitFiles.some((f) => /\.css$/.test(f) && /@import\s+["']tailwindcss|@tailwind\s/.test(readFileSync(join(repo, f), "utf8")));
const layered = tailwind || gitFiles.some((f) => /\.s?css$/.test(f) && !/\.min\.|vendor/.test(f) && /@layer\s/.test(readFileSync(join(repo, f), "utf8")));
const shadcn = existsSync(join(repo, "components.json"));
const themeFile = gitFiles.find((f) => /\.css$/.test(f) && !/\.min\./.test(f) && /--primary\s*:|@theme/.test(readFileSync(join(repo, f), "utf8"))) || gitFiles.find((f) => /globals\.s?css$/.test(f));
const hasEmojiBrand = false;
const detected = { framework: deps.next ? `next ${deps.next}` : deps.vite ? "vite" : "unknown", tailwind, cssLayers: layered, shadcn, kitDir: kitDir || "(none yet)", kitComponents: exported.length, themeFile: themeFile || "(none)" };

/* ───────── 2. tool location ───────── */
const toolRel = mode === "vendor" ? "tools/claudes-babysitter" : null;
const toolPath = mode === "vendor" ? join(repo, toolRel) : TOOL;
const hookCmd = (script) => (mode === "vendor" ? `node "$CLAUDE_PROJECT_DIR/${toolRel}/bin/${script}"` : `node "${TOOL}/bin/${script}"`);
if (mode === "vendor") {
  const exists = existsSync(join(toolPath, "bin/ui-check.mjs"));
  if (!exists || has("force") || TOOL === toolPath) {
    if (TOOL !== toolPath) {
      const SKIP = /(^|\/)(node_modules|reports|test-results|playwright-report|\.babysitter|fixtures|\.git)(\/|$)/;
      const copy = (from, to) => {
        for (const f of readdirSync(from)) {
          const a = join(from, f), b = join(to, f), r = relative(TOOL, a);
          if (SKIP.test(r)) continue;
          if (statSync(a).isDirectory()) copy(a, b);
          else if (!DRY) { mkdirSync(to, { recursive: true }); copyFileSync(a, b); }
        }
      };
      if (!DRY && has("force")) rmSync(toolPath, { recursive: true, force: true });
      copy(TOOL, toolPath);
      say(`vendored the tool (v${readJson(join(TOOL, "package.json")).version})`, toolPath);
    }
  } else say("tool already vendored (use --force to refresh)", toolPath);
  if (!DRY && !has("no-install")) {
    const r = spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: toolPath, stdio: "inherit" });
    if (r.status !== 0) { console.error("npm install in tools/claudes-babysitter failed"); process.exit(1); }
    say("installed its dependencies", join(toolPath, "node_modules"));
  }
} else say(`linked to ${TOOL} (nothing copied; works on this machine only)`);

/* ───────── 3. project config (merged) ───────── */
const cfgPath = join(repo, "babysitter.config.json");
const prev = readJson(cfgPath, null);
const cfg = {
  $comment: "claudes-babysitter project settings. Every allowance is a design decision: write the reason in allowReasons.",
  baseURL: opt("url") || prev?.baseURL || "",
  routes: prev?.routes || ["/"],
  ...(prev || {}),
  cssLayers: prev?.cssLayers ?? layered,
  kit: [...new Set([...(prev?.kit || []), ...exported])],
  themePaths: prev?.themePaths || [kitDir ? `**/${kitDir.replace(/^src\//, "")}/**` : "**/components/ui/**", "**/theme/**"],
  allow: { rails: false, emoji: hasEmojiBrand, negativeMargins: false, lightWeights: false, palette: false, ...(prev?.allow || {}) },
  allowReasons: prev?.allowReasons || {},
  devServer: opt("dev-url") || prev?.devServer || "",
  // Theme First blocks every UI edit on a stock theme: right for a product being generated, too blunt for an
  // existing product with dozens of pages (turn it on when that product is re-themed)
  themeFirst: prev?.themeFirst ?? (gitFiles.filter((f) => /(^|\/)page\.(t|j)sx$/.test(f)).length <= 5),
  contrast: prev?.contrast ?? true,
  registry: opt("registry") || prev?.registry || "",
};
delete cfg.kitFiles; // replaced by the component heuristic (exported + used + no duplicate role)
if (opt("url")) cfg.baseURL = opt("url");
write(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
say(prev ? "merged project config (your values kept)" : "created project config", cfgPath);

/* ───────── 4. Claude Code hooks (merged, de-duplicated) ───────── */
const setPath = join(repo, ".claude/settings.json");
const settings = readJson(setPath, {});
settings.hooks ||= {};
const ensure = (event, matcher, command, timeout) => {
  const list = (settings.hooks[event] ||= []);
  // drop any older claudes-babysitter entry (path may have changed between link/vendor)
  for (const g of list) g.hooks = (g.hooks || []).filter((h) => !/claudes-babysitter\/bin\/hook-|bin\/hook-(post-edit|stop)\.mjs/.test(h.command || ""));
  const group = list.find((g) => (g.matcher || "") === (matcher || "")) || (list.push(matcher ? { matcher, hooks: [] } : { hooks: [] }), list[list.length - 1]);
  group.hooks.push({ type: "command", command, timeout });
  settings.hooks[event] = list.filter((g) => g.hooks.length);
};
ensure("PostToolUse", "Edit|Write|MultiEdit", hookCmd("hook-post-edit.mjs"), 90);
ensure("Stop", null, hookCmd("hook-stop.mjs"), 180);
write(setPath, JSON.stringify(settings, null, 2) + "\n");
say("Claude Code hooks: check after every edit, block finishing with UI problems", setPath);

/* ───────── 5. agent instructions (between markers) ───────── */
const agentFile = ["CLAUDE.md", "AGENTS.md", ".claude/CLAUDE.md"].map((f) => join(repo, f)).find(existsSync) || join(repo, "CLAUDE.md");
const checkCmd = mode === "vendor" ? `node ${toolRel}/bin/ui-check.mjs` : `node ${TOOL}/bin/ui-check.mjs`;
let block = readFileSync(join(TOOL, "templates/AGENTS.babysitter.md"), "utf8").replace(/node tools\/claudes-babysitter\/bin\/ui-check\.mjs/g, checkCmd).replace(/tools\/claudes-babysitter/g, mode === "vendor" ? toolRel : TOOL);
const START = "<!-- claudes-babysitter: (managed by `babysitter `, edit the config instead) -->", END = "<!-- claudes-babysitter: -->";
const cur = existsSync(agentFile) ? readFileSync(agentFile, "utf8") : "";
const re = /<!-- claudes-babysitter:[\s\S]*?<!-- claudes-babysitter: -->/;
const next = re.test(cur) ? cur.replace(re, `${START}\n${block.trim()}\n${END}`) : `${cur.trimEnd()}${cur ? "\n\n" : ""}${START}\n${block.trim()}\n${END}\n`;
write(agentFile, next);
say(re.test(cur) ? "refreshed agent instructions" : "added agent instructions", agentFile);

/* ───────── 6. .gitignore ───────── */
const giPath = join(repo, ".gitignore");
const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
const need = [".babysitter/", ...(mode === "vendor" ? [`${toolRel}/node_modules/`] : [])].filter((l) => !gi.split("\n").includes(l));
if (need.length) { write(giPath, `${gi.trimEnd()}\n\n# claudes-babysitter\n${need.join("\n")}\n`); say(`ignored ${need.join(", ")}`, giPath); }

/* ───────── 6b. git pre-commit gate (every commit, whoever makes it) ───────── */
if (!has("no-git-hook")) {
  const gitDir = (() => { try { return execSync("git rev-parse --git-dir", { cwd: repo, encoding: "utf8" }).trim(); } catch { return null; } })();
  if (gitDir) {
    const hooksPath = (() => { try { return execSync("git config core.hooksPath", { cwd: repo, encoding: "utf8" }).trim(); } catch { return ""; } })();
    const dir = hooksPath ? join(repo, hooksPath) : join(repo, gitDir, "hooks");
    const file = join(dir, "pre-commit");
    const line = mode === "vendor" ? `node "$(git rev-parse --show-toplevel)/${toolRel}/bin/hook-pre-commit.mjs" || exit 1` : `node "${TOOL}/bin/hook-pre-commit.mjs" || exit 1`;
    const MARK = "# claudes-babysitter";
    const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
    const body = cur.includes(MARK)
      ? cur.replace(new RegExp(`${MARK}\\n.*\\n`), `${MARK}\n${line}\n`)
      : `${cur.trim() ? cur.trimEnd() + "\n\n" : "#!/bin/sh\n"}${MARK}\n${line}\n`;
    if (!DRY) { mkdirSync(dir, { recursive: true }); writeFileSync(file, body, { mode: 0o755 }); }
    say(cur && !cur.includes(MARK) ? "added the UI gate to the existing pre-commit hook" : "git pre-commit gate (blocks commits that add UI problems; --no-verify bypasses)", file);
  }
}

/* ───────── 7. CI (opt-in) ───────── */
if (has("ci")) {
  const wf = join(repo, ".github/workflows/claudes-babysitter.yml");
  let yml = readFileSync(join(TOOL, "templates/.github/workflows/claudes-babysitter.yml"), "utf8");
  if (mode === "link") console.warn("  ! --ci needs the vendored tool; the workflow assumes tools/claudes-babysitter");
  write(wf, yml);
  say("CI workflow (lint changed files, then runtime checks on the preview)", wf);
}

/* ───────── 8. report ───────── */
console.log(`babysitter  ${DRY ? "(dry run) " : ""}— ${relative(process.cwd(), repo) || "."}`);
console.log("detected:", Object.entries(detected).map(([k, v]) => `${k}=${v}`).join("  "));
console.log(plan.join("\n"));
if (DRY) process.exit(0);

// the report runs from THIS copy of the tool (it has its dependencies; a fresh vendored copy may not yet)
const audit = spawnSync(process.execPath, [join(TOOL, "bin/ui-audit.mjs"), repo, "--only", "theme", "--json"], { encoding: "utf8" });
const theme = (() => { try { return JSON.parse(audit.stdout || "[]"); } catch { return []; } })();
const check = spawnSync(process.execPath, [join(TOOL, "bin/ui-check.mjs"), "--repo", repo, "--format", "json"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const problems = (() => { try { const j = JSON.parse(check.stdout || "[]"); return Array.isArray(j) ? j : j.problems; } catch { return []; } })();
const byRule = {};
for (const p of problems) byRule[p.rule] = (byRule[p.rule] || 0) + 1;

console.log("\nnext steps:");
if (!kitDir) console.log("  1. There is no UI-kit yet. Create components/ui (e.g. `npx shadcn@latest init`) and re-run init so the kit is recorded.");
const stock = theme.filter((t) => !/warning/.test(t.rule));
if (stock.length && !cfg.themeFirst) console.log("  • Theme First is OFF for this existing product (more than 5 pages). Set \"themeFirst\": true once it is being re-themed.");
if (stock.length) console.log(`  • THEME FIRST: ${stock[0].msg}\n    Do this before building pages — every page inherits it.`);
else if (shadcn) console.log("  • Theme: product-specific (not the stock shadcn look).");
if (!cfg.baseURL) console.log("  • Set baseURL in babysitter.config.json (or pass --url) to enable the runtime checks.");
if (!cfg.devServer) console.log("  • Set devServer (or pass --dev-url http://localhost:3000) to let the Stop hook check rendered contrast, rows and overflow while generating.");
// theme contrast + fingerprint registry
const { checkContrast, fingerprint } = await import(join(TOOL, "lib/theme.js"));
const { lookalikes, register, DEFAULT_REGISTRY, projectName } = await import(join(TOOL, "lib/registry.js"));
const low = checkContrast(repo, { aliases: cfg.contrastTokens || {} }).filter((r) => !r.ok);
for (const r of low) console.log(`  • ${r.required ? "CONTRAST (blocks UI edits)" : "contrast (warning)"}: ${r.label}, ${r.scheme} theme = ${r.ratio}:1 (needs 4.5).`);
const fp = fingerprint(repo);
const projName = projectName(repo, cfg);
const twins = await lookalikes(projName, fp, { where: cfg.registry || DEFAULT_REGISTRY });
for (const t of twins.slice(0, 3)) console.log(`  • LOOK-ALIKE: theme is ${Math.round(t.score * 100)}% similar to "${t.project}". Change the accent hue, type pairing or radius.`);
await register(projName, fp, cfg.registry || DEFAULT_REGISTRY);
console.log(`  • Registered theme fingerprint #${fp.hash} for "${projName}" in ${cfg.registry || DEFAULT_REGISTRY}.`);
console.log(problems.length
  ? `  • Existing code: ${problems.length} problem(s) — ${Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, n]) => `${r} ${n}`).join(", ")}.\n    The hooks only block NEW problems on changed lines; this debt is listed for information.`
  : "  • Existing code: clean.");
console.log(`  • Generators: hooks are active in Claude Code sessions opened in this repo. Manual check: ${checkCmd} --changed --format agent`);
