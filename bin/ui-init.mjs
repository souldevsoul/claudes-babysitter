#!/usr/bin/env node
/**
 * babysitter init — wire the guardrails into a product repo in one step, for a project being
 * generated right now or an existing one.
 *
 *   babysitter init [repo] [options]
 *     --package      use the copy in the project's node_modules (a devDependency — the team setup; chosen
 *                    automatically when claudes-babysitter is installed or listed in package.json). Every
 *                    command init writes then goes through node_modules: the version pinned in package.json
 *     --vendor       copy the tool into <repo>/tools/claudes-babysitter (works without npm, for any teammate)
 *     --link         reference this checkout by absolute path instead (local machine only, nothing copied)
 *     --ci           also add the GitHub Actions workflow
 *     --no-git-hook  do not install the git pre-commit gate
 *     --new          a brand-new project: strict mode from the start (hooks block)
 *     --existing     an existing project: adoption mode (hooks warn only, BABYSITTER-ADOPTION.md checklist)
 *     --yes          never prompt (CI / generators)
 *   Without --new/--existing an interactive terminal is asked; otherwise ≤ 5 pages → new, more → existing.
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
import * as clack from "@clack/prompts";

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const opt = (f) => { const i = args.indexOf(`--${f}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["--url", "--dev-url", "--registry"].includes(args[i - 1]))) || ".");
const DRY = has("dry-run");
// install mode: explicit flag > installed as the project's dependency > vendored copy
const PKG = "claudes-babysitter";
const pkgJsonOf = (d) => { try { return JSON.parse(readFileSync(join(d, "package.json"), "utf8")); } catch { return {}; } };
const listed = (d) => { const p = pkgJsonOf(d); return !!({ ...p.dependencies, ...p.devDependencies }[PKG]); };
const installedHere = (d) => existsSync(join(d, "node_modules", PKG, "bin", "babysitter.mjs"));
const mode = has("link") ? "link" : has("vendor") ? "vendor" : has("package") || installedHere(repo) || listed(repo) || TOOL.startsWith(join(repo, "node_modules") + "/") ? "package" : "vendor";

if (!existsSync(join(repo, "package.json"))) { console.error(`babysitter init: ${repo} has no package.json`); process.exit(2); }
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

/* ───────── 1b. where are we installing? (strict for a new project, adoption for an existing one) ───────── */
const pageCount = gitFiles.filter((f) => /(^|\/)page\.(t|j)sx$/.test(f)).length;
const prevCfg = readJson(join(repo, "babysitter.config.json"), null);
const interactive = !!(process.stdin.isTTY && process.stdout.isTTY) && !DRY && !has("yes");
let installMode = has("new") || has("strict") ? "strict" : has("existing") || has("adoption") ? "adoption" : opt("mode");
const askedOrFlagged = !!installMode;
if (!installMode && interactive) {
  clack.intro("Claude's Babysitter");
  const answer = await clack.select({
    message: "Куда мы устанавливаем Babysitter?",
    initialValue: prevCfg?.mode || (pageCount <= 5 ? "strict" : "adoption"),
    options: [
      { value: "strict", label: "В абсолютно новый проект", hint: "жёсткий режим со старта — хуки блокируют" },
      { value: "adoption", label: "В уже существующий проект", hint: "мягкий режим аудита — хуки только предупреждают" },
    ],
  });
  if (clack.isCancel(answer)) { clack.cancel("Установка отменена."); process.exit(1); }
  installMode = answer;
}
if (!installMode) installMode = prevCfg?.mode || (pageCount <= 5 ? "strict" : "adoption");
if (!["strict", "adoption"].includes(installMode)) { console.error(`babysitter init: unknown mode "${installMode}" (use --new or --existing)`); process.exit(2); }
detected.installMode = installMode + (!askedOrFlagged && !interactive ? ` (auto: ${pageCount} page${pageCount === 1 ? "" : "s"})` : "");

/* ───────── 2. tool location ───────── */
const toolRel = mode === "vendor" ? "tools/claudes-babysitter" : mode === "package" ? `node_modules/${PKG}` : null;
const toolPath = mode === "link" ? TOOL : join(repo, toolRel);
// package mode: the hook runs the copy package.json pins. Before `npm install` the file is not there yet —
// then the hook does nothing (exit 0) instead of failing every edit; once present, its exit code (2 = block)
// passes through unchanged. Plain node, not npx: PostToolUse runs after every edit, npx would add ~0.5 s.
const hookCmd = (script) => {
  if (mode === "package") { const f = `"$CLAUDE_PROJECT_DIR/${toolRel}/bin/${script}"`; return `if [ -f ${f} ]; then node ${f}; fi`; }
  return mode === "vendor" ? `node "$CLAUDE_PROJECT_DIR/${toolRel}/bin/${script}"` : `node "${TOOL}/bin/${script}"`;
};
if (mode === "package") {
  const version = readJson(join(TOOL, "package.json")).version;
  if (!listed(repo)) {
    // pin the version that is running this init, from the public repo (the npm name "babysitter" is someone else's package)
    const pj = readJson(join(repo, "package.json"));
    pj.devDependencies = { ...(pj.devDependencies || {}), [PKG]: `github:souldevsoul/claudes-babysitter#v${version}` };
    write(join(repo, "package.json"), JSON.stringify(pj, null, 2) + "\n");
    say(`added the devDependency ${PKG}@v${version} — run npm install to fetch it`, join(repo, "package.json"));
  } else say(`uses ${PKG} from node_modules (the version pinned in package.json${installedHere(repo) ? `: v${readJson(join(repo, "node_modules", PKG, "package.json")).version}` : ", not installed yet — run npm install"})`);
} else if (mode === "vendor") {
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
  // adoption: hooks warn instead of blocking, Theme First stays off until the team switches to strict (enable-hooks)
  mode: installMode,
  themeFirst: installMode === "adoption" ? false : prev?.mode === "adoption" ? true : prev?.themeFirst ?? true,
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
  for (const g of list) g.hooks = (g.hooks || []).filter((h) => !/claudes-babysitter\/bin\/hook-|bin\/hook-(post-edit|stop|prompt)\.mjs/.test(h.command || ""));
  const group = list.find((g) => (g.matcher || "") === (matcher || "")) || (list.push(matcher ? { matcher, hooks: [] } : { hooks: [] }), list[list.length - 1]);
  group.hooks.push({ type: "command", command, timeout });
  settings.hooks[event] = list.filter((g) => g.hooks.length);
};
ensure("PostToolUse", "Edit|Write|MultiEdit", hookCmd("hook-post-edit.mjs"), 90);
// long enough to freeze for a Babysitter Studio review (default 15 min); without Studio the hook ends in seconds
ensure("Stop", null, hookCmd("hook-stop.mjs"), 1800);
// notes pinned in Babysitter Studio (🎯 Inspect) ride along with the next prompt; silent without Studio
ensure("UserPromptSubmit", null, hookCmd("hook-prompt.mjs"), 10);
write(setPath, JSON.stringify(settings, null, 2) + "\n");
say("Claude Code hooks: check after every edit, block finishing with UI problems", setPath);

/* ───────── 5. agent instructions (between markers) ───────── */
const agentFile = ["CLAUDE.md", "AGENTS.md", ".claude/CLAUDE.md"].map((f) => join(repo, f)).find(existsSync) || join(repo, "CLAUDE.md");
// how the agent runs the tool. package mode: `npx --no babysitter` — the local bin only. Never a bare `npx babysitter`:
// "babysitter" on the npm registry is an unrelated package, and npx without a TTY installs and runs it unasked.
const checkCmd = mode === "package" ? "npx --no babysitter check" : mode === "vendor" ? `node ${toolRel}/bin/ui-check.mjs` : `node ${TOOL}/bin/ui-check.mjs`;
const uiTestCmd = mode === "package" ? "npx --no babysitter prepare && npx --no babysitter test-ui" : null;
let block = readFileSync(join(TOOL, "templates/AGENTS.babysitter.md"), "utf8").replace(/node tools\/claudes-babysitter\/bin\/ui-check\.mjs/g, checkCmd);
if (uiTestCmd) block = block.replace(/node tools\/claudes-babysitter\/playwright\/prepare\.mjs && npx playwright test -c tools\/claudes-babysitter\/playwright\/playwright\.config\.ts/g, uiTestCmd);
// {{RUN}}: how a person or the agent runs any babysitter command in this project
const RUN = mode === "package" ? "npx --no babysitter" : mode === "vendor" ? `node ${toolRel}/bin/babysitter.mjs` : `node ${TOOL}/bin/babysitter.mjs`;
block = block.replace(/\{\{RUN\}\}/g, RUN).replace(/tools\/claudes-babysitter/g, mode === "link" ? TOOL : toolRel);
const START = "<!-- claudes-babysitter:start (managed by `babysitter init`, edit the config instead) -->", END = "<!-- claudes-babysitter:end -->";
const cur = existsSync(agentFile) ? readFileSync(agentFile, "utf8") : "";
// also matches the markers older versions wrote (ui-guardrails:…, and a control character left by a rename)
const re = /<!-- (?:claudes-babysitter|ui-guardrails):(?:start|\x01)[\s\S]*?<!-- (?:claudes-babysitter|ui-guardrails):(?:end|\x01) -->/;
const next = re.test(cur) ? cur.replace(re, `${START}\n${block.trim()}\n${END}`) : `${cur.trimEnd()}${cur ? "\n\n" : ""}${START}\n${block.trim()}\n${END}\n`;
write(agentFile, next);
say(re.test(cur) ? "refreshed agent instructions" : "added agent instructions", agentFile);

/* ───────── 6. .gitignore ───────── */
const giPath = join(repo, ".gitignore");
const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
const need = [".babysitter/", ...(mode === "vendor" ? [`${toolRel}/node_modules/`] : [])].filter((l) => !gi.split("\n").includes(l));
if (need.length) { write(giPath, `${gi.trimEnd()}\n\n# claudes-babysitter\n${need.join("\n")}\n`); say(`ignored ${need.join(", ")}`, giPath); }

/* ───────── 6b. git pre-commit gate (every commit, whoever makes it) ───────── */
if (!has("no-git-hook") && mode === "package") {
  // the same gate `prepare` installs on every npm install: runs node_modules/claudes-babysitter, keeps a foreign hook
  const r = DRY ? { status: 0 } : spawnSync(process.execPath, [join(TOOL, "bin/install-hooks.mjs"), repo, "--force"], { encoding: "utf8" });
  if (r.status === 0) say("git pre-commit gate (runs the node_modules copy; reinstalled on every npm install by \"prepare\")", join(repo, ".git/hooks/pre-commit"));
} else if (!has("no-git-hook")) {
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

/* ───────── 6c. `npm run babysitter -- <cmd>` in the project ───────── */
// Never a bare `npx babysitter`: an unrelated package called "babysitter" is on the npm registry. In package mode
// the script name resolves to the local bin (npm puts node_modules/.bin first), which only ever runs our copy.
const runCmd = mode === "package" ? "babysitter" : mode === "vendor" ? `node ${toolRel}/bin/babysitter.mjs` : `node ${TOOL}/bin/babysitter.mjs`;
{
  const pj = readJson(join(repo, "package.json"));
  pj.scripts ||= {};
  if (mode === "package" && !pj.scripts.prepare) { pj.scripts.prepare = "babysitter install-hooks"; write(join(repo, "package.json"), JSON.stringify(pj, null, 2) + "\n"); say('added "prepare": "babysitter install-hooks" (every clone gets the git gate on npm install)', join(repo, "package.json")); }
  else if (mode === "package" && !/babysitter install-hooks/.test(pj.scripts.prepare)) say(`"prepare" is taken ("${pj.scripts.prepare}") — append: && babysitter install-hooks`);
  if (!pj.scripts.babysitter || /claudes-babysitter|bin\/babysitter\.mjs|^babysitter$/.test(pj.scripts.babysitter)) {
    if (pj.scripts.babysitter !== runCmd) {
      pj.scripts.babysitter = runCmd;
      write(join(repo, "package.json"), JSON.stringify(pj, null, 2) + "\n");
      say("added the `babysitter` script (npm run babysitter -- audit | enable-hooks | check)", join(repo, "package.json"));
    }
  }
}

/* ───────── 7. CI (opt-in) ───────── */
if (has("ci") && mode === "package") {
  const wf = join(repo, ".github/workflows/babysitter.yml");
  write(wf, readFileSync(join(TOOL, "templates/github-babysitter.yml"), "utf8"));
  say("CI workflow: pull requests fail only on UI problems they add (audit --diff, annotations on the PR)", wf);
} else if (has("ci")) {
  const wf = join(repo, ".github/workflows/claudes-babysitter.yml");
  let yml = readFileSync(join(TOOL, "templates/.github/workflows/claudes-babysitter.yml"), "utf8");
  if (mode === "link") console.warn("  ! --ci needs the vendored tool; the workflow assumes tools/claudes-babysitter");
  write(wf, yml);
  say("CI workflow (lint changed files, then runtime checks on the preview)", wf);
}

/* ───────── 8. report ───────── */
console.log(`babysitter init ${DRY ? "(dry run) " : ""}— ${relative(process.cwd(), repo) || "."}`);
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
const RUN_HINT = mode === "package" ? "npx --no babysitter" : "npm run babysitter --";
if (stock.length && !cfg.themeFirst) console.log(`  • Theme First is off in adoption mode. It switches on with \`${RUN_HINT} enable-hooks\`.`);
if (stock.length) console.log(`  • THEME FIRST: ${stock[0].msg}\n    Do this before building pages — every page inherits it.`);
else if (shadcn) console.log("  • Theme: product-specific (not the stock shadcn look).");
if (!cfg.baseURL) console.log("  • Set baseURL in babysitter.config.json (or pass --url) to enable the runtime checks.");
if (!cfg.devServer) console.log("  • Set devServer (or pass --dev-url http://localhost:3000) to let the Stop hook check rendered contrast, rows and overflow while generating.");
// theme contrast + fingerprint registry
const { checkContrast, fingerprint } = await import(join(TOOL, "lib/theme.js"));
const { lookalikes, register, DEFAULT_REGISTRY, projectName } = await import(join(TOOL, "lib/registry.js"));
const low = checkContrast(repo, { aliases: cfg.contrastTokens || {} }).filter((r) => !r.ok);
for (const r of low) console.log(`  • ${r.required ? "CONTRAST (blocks UI edits)" : "contrast (warning)"}: ${r.label}, ${r.scheme} theme = ${r.ratio}:1 (needs ${r.min}).`);
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

/* ───────── 9. adoption checklist + closing message ───────── */
const summary = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
const group = (re) => summary.filter(([r]) => re.test(r)).reduce((n, [, c]) => n + c, 0);
if (installMode === "adoption") {
  const file = join(repo, "BABYSITTER-ADOPTION.md");
  const WHY = mode === "package"
  ? "> Почему \`npx --no babysitter\`, а не просто \`npx babysitter\`: `--no` запускает только версию из `node_modules` (закреплённую в `package.json`). Без него, если `npm install` ещё не сделан, npx скачал бы из npm постороннюю программу с именем `babysitter` — и без терминала (в сессии ИИ) сделал бы это молча."
  : "> Почему \`npm run babysitter\`, а не \`npx babysitter\`: инструмент лежит в проекте (\`" + (toolRel || TOOL) + "\`) и не является npm-пакетом — \`npx babysitter\` скачал бы из npm постороннюю программу с таким именем.";
  if (existsSync(file) && !has("force")) {
    // the checklist holds the team's ticks — keep them; refresh only the commands and the note, which depend on
    // how the tool is installed (a link-mode note named this machine's path)
    const cur = readFileSync(file, "utf8");
    const next = cur.replace(/`(?:npm run babysitter --|npx --no babysitter|node [^`]*babysitter\.mjs) (audit|enable-hooks)`/g, (m, c) => `\`${RUN_HINT} ${c}\``).replace(/^> Почему[^\n]*$/m, WHY);
    if (next !== cur) { write(file, next); console.log(`  ✓ adoption checklist: commands refreshed for this install → ${relative(repo, file)}`); }
  }
  if (!existsSync(file) || has("force")) {
    const today = new Date().toISOString().slice(0, 10);
    const tick = String.fromCharCode(96);
    const topLine = summary.length
      ? "Чаще всего: " + summary.slice(0, 5).map(([r, n]) => tick + r + tick + " " + n).join(", ") + "."
      : "Нарушений нет — можно сразу переходить к шагу 4.";
    const md = `# Claude's Babysitter — внедрение в существующий проект

Babysitter установлен в **мягком режиме аудита** (\`"mode": "adoption"\` в \`babysitter.config.json\`):
хуки Claude Code и git \`pre-commit\` пока **только предупреждают** и ничего не блокируют, Theme First выключен.
Пройдите шаги по порядку и отмечайте их здесь.

- [x] **1. Инициализация** — выполнено ${today}: установлен мягкий режим.
- [ ] **2. Глобальный аудит** — запустите \`${RUN_HINT} audit\`, чтобы оценить масштаб: AST-нарушения, контраст, мёртвый код.
- [ ] **3. Изолированная зачистка** — создайте ветку \`chore/tech-debt\` и поручите AI или команде исправить найденное. Хуки в этом режиме подсказывают по ходу правок.
- [ ] **4. Активация файрвола** — когда аудит станет зелёным, выполните \`${RUN_HINT} enable-hooks\`: режим в \`babysitter.config.json\` станет строгим (\`"mode": "strict"\`), хуки начнут блокировать. С этого момента грязный код не пройдёт.

## Снимок на момент установки (${today})

| Что | Сколько |
|---|---|
| AST-нарушения (стили, классы, контролы) | ${group(/^ui\//)} |
| CSS (Stylelint) | ${group(/^(scale-unlimited|declaration|color-named|selector|ui\/(require-layer|token-values|apply-values|z-index-scale))/)} |
| Контраст темы | ${group(/^theme\/contrast/)} |
| Компоненты: мёртвые, дубли, повторяющаяся разметка | ${group(/^ui-audit\/components/)} |
| **Всего** | **${problems.length}** |

${topLine}

${WHY}
`;
    write(file, md);
    console.log(`  ✓ adoption checklist → ${relative(repo, file)}`);
  }
}
const done = installMode === "adoption"
  ? "✅ Babysitter установлен в режиме аудита! Откройте BABYSITTER-ADOPTION.md для получения дальнейших инструкций."
  : "✅ Babysitter установлен в строгом режиме: хуки блокируют нарушения с первой правки.";
if (interactive) clack.outro(done); else console.log("\n" + done);
