#!/usr/bin/env node
// One command for humans, CI and code generators.
//   ui-check                       lint every jsx/tsx/css file in the repo
//   ui-check --changed [base]      only files changed vs base (default: merge-base with origin/main, plus uncommitted/untracked)
//   ui-check --format agent        compact fix-list to feed back into a code generator (default: text; also json)
//   ui-check --repo ../my-app
//   ui-check --changed --file src/app/page.tsx   just this file (used by the editor hook)
//   ui-check --changed --all-lines               report old problems in changed files too (default: only changed lines)
// Exit code 1 on any problem: zero warnings allowed. Suppressing a ui/* rule with eslint-disable is itself a problem.
import { ESLint } from "eslint";
import stylelint from "stylelint";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, relative, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tsParser from "@typescript-eslint/parser";
import ui from "../rules/eslint/index.js";
import styleConfig from "../rules/stylelint/config.js";
import { checkContrast, stockTheme, themeFiles as themeFilesOf, fingerprint, repoFiles } from "../lib/theme.js";
import { lookalikes, register, DEFAULT_REGISTRY, projectName } from "../lib/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; return v && !v.startsWith("--") ? v : true; };
const repo = resolve(opt("repo", ".") === true ? "." : opt("repo", "."));
const format = opt("format", "text");
const changed = opt("changed");
const cfgPath = join(repo, "babysitter.config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
const git = (c) => { try { return execSync(`git ${c}`, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

let files;
let lineFilter = null; // file -> Set(line) | "all"
const movedLines = new Map(); // file -> Set(line): content that only changed place
// a line counts as moved only when it carries real content: braces, bare tags and blank lines are everywhere
const moveKey = (t) => { const k = t.trim().replace(/\s+/g, " "); return k.length >= 8 && /[A-Za-z]/.test(k) ? k : null; };
let baseRef = null;
if (changed) {
  const base = baseRef = changed === true ? git("merge-base HEAD origin/main") || git("merge-base HEAD origin/master") || "HEAD" : changed;
  if (!opt("all-lines")) {
    lineFilter = new Map();
    // base → working tree covers committed, staged and unstaged edits. A line that only MOVED — the same
    // content removed somewhere else in this diff (extracting a shared component, splitting a file) — is not
    // new code: its old problems are reported for information, never as a block.
    const removed = new Map(); // normalised content → count
    const added = []; // { file, line, key }
    let cur = null, next = 0;
    for (const l of git(`diff -U0 --no-color ${base}`).split("\n")) {
      const f = l.match(/^\+\+\+ (?:b\/(.+)|\/dev\/null)$/);
      if (f) { cur = f[1] || null; if (cur && !lineFilter.has(cur)) lineFilter.set(cur, new Set()); continue; }
      if (l.startsWith("--- ")) continue;
      const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (h) { next = Number(h[1]); continue; }
      if (l.startsWith("-")) { const k = moveKey(l.slice(1)); if (k) removed.set(k, (removed.get(k) || 0) + 1); continue; }
      if (l.startsWith("+") && cur) { added.push({ file: cur, line: next, key: moveKey(l.slice(1)), text: l.slice(1) }); next++; }
    }
    for (const u of git("ls-files --others --exclude-standard").split("\n").filter(Boolean)) {
      lineFilter.set(u, new Set());
      let text = ""; try { text = readFileSync(join(repo, u), "utf8"); } catch {}
      if (text.length > 2_000_000 || text.includes("\u0000")) { lineFilter.set(u, "all"); continue; }
      text.split("\n").forEach((t, i) => added.push({ file: u, line: i + 1, key: moveKey(t), text: t }));
    }
    const markMoved = (a) => (movedLines.get(a.file) || movedLines.set(a.file, new Set()).get(a.file)).add(a.line);
    for (const a of added) {
      const left = a.key ? removed.get(a.key) || 0 : 0;
      if (left > 0) { removed.set(a.key, left - 1); markMoved(a); a.moved = true; }
    }
    // A bare opening tag ("<Button", "<Link") carries no content of its own, yet the rules report on it — about
    // its className/style. Within the same multi-line opening tag: if the className/style line moved unchanged,
    // the finding is old debt; otherwise fall back to the first real line of the tag.
    added.forEach((a, i) => {
      if (a.key || a.moved) return;
      const isTag = /^\s*<[A-Za-z]/.test(a.text);
      let firstReal = null, styleLine = null;
      for (let j = i + 1; j < added.length && j <= i + 8; j++) {
        const b = added[j];
        if (b.file !== a.file || b.line !== a.line + (j - i)) break;
        if (b.key && !firstReal) firstReal = b;
        if (isTag && /\b(className|style)=/.test(b.text)) { styleLine = b; break; }
        if (/^\s*\/?>\s*$|\/>\s*$/.test(b.text) || (!isTag && firstReal)) break;
      }
      const decider = styleLine || firstReal;
      if (decider && decider.moved) { markMoved(a); a.moved = true; }
    });
    for (const a of added) {
      if (a.moved) continue;
      const lf = lineFilter.get(a.file);
      if (lf instanceof Set) lf.add(a.line);
    }
  }
  const list = [git(`diff --name-only --diff-filter=ACMR ${base}`), git("diff --name-only --diff-filter=ACMR"), git("ls-files --others --exclude-standard")].join("\n");
  files = [...new Set(list.split("\n").filter(Boolean))].filter((f) => /\.(jsx|tsx|ts|js|mjs|s?css)$/.test(f) && !/\.d\.ts$|(^|\/)(next|tailwind|postcss|eslint|vite|playwright)\.config\./.test(f) && existsSync(join(repo, f)));
} else {
  files = git("ls-files --cached --others --exclude-standard").split("\n").filter((f) => /\.(jsx|tsx|ts|js|mjs|s?css)$/.test(f) && !/\.d\.ts$|(^|\/)(next|tailwind|postcss|eslint|vite|playwright)\.config\./.test(f));
}
// third-party and static assets are not the product's code: vendored libraries, minified bundles, public/
// third-party code is not the product's: vendored dirs, minified bundles and well-known libraries.
// public/ itself is NOT skipped — template projects keep their own theme there (e.g. public/assets/scss).
const VENDOR_LIBS = /(^|\/)(bootstrap|font-?awesome|fontawesome-all|jquery[\w.-]*|animate|magnific-popup|swiper[\w-]*|slick[\w-]*|owl\.carousel[\w.-]*|aos|flaticon|odometer|nice-select|select2|normalize|reset)(\.[\w-]+)*\.(s?css)$/i;
const ignore = [/(^|\/)tools\/claudes-babysitter\//, /^(scripts|prisma|migrations|db)\//, /node_modules|\.next\/|dist\/|build\/|coverage\//, /(^|\/)(vendor|vendors|third[-_]party|lib\/plugins)\//, /\.min\.(s?css)$/, VENDOR_LIBS, ...(cfg.ignore || []).map((r) => new RegExp(r))];
files = files.filter((f) => !ignore.some((r) => r.test(f)));
const only = opt("file");
if (only && only !== true) { const want = relative(repo, resolve(repo, only)); files = files.filter((f) => f === want); }
const problems = [];

// ESLint (only our rules — the product's own config is not our business here)
const js = files.filter((f) => /\.(jsx|tsx|ts|js|mjs)$/.test(f));
if (js.length) {
  const eslint = new ESLint({
    cwd: repo,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.{jsx,tsx,ts,js,mjs}"], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } }, linterOptions: { reportUnusedDisableDirectives: "off" } },
      ...ui.configs.create(cfg),
    ],
  });
  for (const r of await eslint.lintFiles(js)) {
    for (const m of r.messages) {
      if (!m.ruleId) { if (m.fatal) problems.push({ file: relative(repo, r.filePath), line: m.line, rule: "parse", message: m.message }); continue; }
      if (!m.ruleId.startsWith("ui/")) continue; // the product's own eslint-disable comments for rules we don't load
      problems.push({ file: relative(repo, r.filePath), line: m.line, rule: m.ruleId, message: m.message });
    }
    // disabling a guardrail is not a fix
    const src = readFileSync(r.filePath, "utf8").split("\n");
    src.forEach((l, i) => { if (/eslint-disable[^\n]*\bui\//.test(l)) problems.push({ file: relative(repo, r.filePath), line: i + 1, rule: "ui/no-disable", message: "A ui/* guardrail is disabled here. Fix the code instead, or add a project-level allowance in babysitter.config.json with a reason." }); });
  }
}

// Stylelint
const css = files.filter((f) => /\.s?css$/.test(f));
/**
 * 6.1 @layer only makes sense where the rest of the CSS is layered (Tailwind v3/v4, or a project that
 * already uses @layer). In an unlayered project (Bootstrap/SCSS templates) a layered rule LOSES to every
 * unlayered template rule, so forcing @layer there breaks the cascade — the rule is off unless layers are
 * detected or the project sets "cssLayers": true.
 */
const detectLayers = () => {
  if (typeof cfg.cssLayers === "boolean") return cfg.cssLayers;
  try {
    const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
    if ({ ...pkg.dependencies, ...pkg.devDependencies }.tailwindcss) return true;
  } catch {}
  const all = git("ls-files --cached --others --exclude-standard").split("\n").filter((f) => /\.s?css$/.test(f) && !ignore.some((r) => r.test(f)));
  return all.some((f) => { try { return /@layer\s|@import\s+["']tailwindcss|@tailwind\s/.test(readFileSync(join(repo, f), "utf8")); } catch { return false; } });
};
const usesLayers = css.length ? detectLayers() : false;
if (css.length) {
  const config = {
    ...styleConfig,
    rules: { ...styleConfig.rules, "ui/require-layer": usesLayers },
    overrides: [{ files: ["**/*.scss"], customSyntax: "postcss-scss" }],
  };
  const { results } = await stylelint.lint({ files: css.map((f) => join(repo, f)), config, cwd: repo });
  for (const r of results) for (const w of r.warnings) problems.push({ file: relative(repo, r.source), line: w.line, rule: w.rule, message: w.text.replace(/\s*\([^)]*\)$/, "") });
}

// Repo audits (reuse + theme)
const runAudit = (dir, extra = []) => {
  const r = spawnSync(process.execPath, [join(here, "ui-audit.mjs"), dir, "--json", ...extra], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try { return JSON.parse(r.stdout || "[]").filter((f) => !/warning/.test(f.rule)); } catch { return []; }
};
// Stable identity of a finding across versions: no line numbers, no counts, no file lists.
const auditKey = (f) => `${f.kind}|${f.file}|${f.msg
  .replace(/^L\d+: /, "")
  .replace(/(\.[jt]sx):\d+/g, "$1")
  .replace(/is defined in \d+ files \([^)]*\)/, "is defined in several files")
  .replace(/\(\d+% of classes match\)/, "")
  .replace(/markup is \d+% the same/, "markup is similar")}`;
const info = []; // older findings in touched files: shown, never blocking
if (!changed) {
  for (const f of runAudit(repo)) problems.push({ file: f.file, line: 1, rule: `ui-audit/${f.kind}`, message: `${f.msg} [${f.rule}]` });
} else if (js.length) {
  const current = runAudit(repo, ["--files", js.join(",")]);
  // the same audit on the base version, unpacked to a temp dir (the repository itself is not touched)
  let baseKeys = new Set();
  const tmp = mkdtempSync(join(tmpdir(), "babysitter-base-"));
  try {
    const roots = ["src", "app", "components", "styles", "pages"].filter((d) => spawnSync("git", ["cat-file", "-e", `${baseRef}:${d}`], { cwd: repo }).status === 0);
    if (roots.length) {
      const tar = spawnSync("sh", ["-c", `git archive ${baseRef} ${roots.join(" ")} | tar -x -C "${tmp}"`], { cwd: repo });
      if (tar.status === 0) {
        if (existsSync(cfgPath)) copyFileSync(cfgPath, join(tmp, "babysitter.config.json"));
        baseKeys = new Set(runAudit(tmp).map(auditKey));
      }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const f of current) {
    const isOld = baseKeys.has(auditKey(f));
    // a new shared component (anything under components/) that an older local copy duplicates is the
    // consolidation target, not a new duplicate — the old copies are debt to migrate later
    const consolidation = /is defined in \d+ files/.test(f.msg) && /(^|\/)components\//.test(f.file) && !isOld;
    if (isOld || consolidation) info.push({ file: f.file, message: consolidation ? `${f.msg.split(" is defined")[0]} now has a shared version here; older local copies can be migrated later.` : f.msg });
    else problems.push({ file: f.file, line: 1, rule: `ui-audit/${f.kind}`, message: `${f.msg} [${f.rule}]` });
  }
}

// in --changed mode only problems on changed lines count (file-level audit findings always count)
if (lineFilter) {
  const keep = (p) => {
    const lf = lineFilter.get(p.file);
    if (lf === "all" || String(p.rule).startsWith("ui-audit/")) return true;
    return !!lf && lf.has(p.line);
  };
  const isMoved = (p) => !String(p.rule).startsWith("ui-audit/") && !!movedLines.get(p.file)?.has(p.line) && !(lineFilter.get(p.file) instanceof Set && lineFilter.get(p.file).has(p.line));
  const moved = problems.filter(isMoved);
  const before = problems.length;
  problems.splice(0, problems.length, ...problems.filter((p) => keep(p) && !isMoved(p)));
  for (const p of moved) info.push({ file: p.file, message: `L${p.line} ${p.rule} (moved here unchanged — existing debt, not new): ${p.message}` });
  const hidden = before - problems.length - moved.length;
  if (format !== "json") {
    if (hidden > 0) console.error(`(${hidden} older problem(s) in untouched lines not shown — use --all-lines)`);
    if (moved.length) console.error(`(${moved.length} problem(s) on moved lines: existing debt that only changed place — listed below, not blocking)`);
  }
}

/* ───────── theme gates (run after the line filter: they are about the theme, not about lines) ───────── */
const warnings = [];
const allRepoFiles = repoFiles(repo);
const tFiles = themeFilesOf(repo, allRepoFiles);
const uiTouched = files.some((f) => /\.(jsx|tsx|s?css)$/.test(f)) || (opt("file") && /\.(jsx|tsx|s?css)$/.test(String(opt("file"))));
const themeTouched = !changed || files.some((f) => tFiles.includes(f)) || files.some((f) => /(^|\/)tailwind\.config\./.test(f));
const lineOf = (file, token) => { try { const i = readFileSync(join(repo, file), "utf8").split("\n").findIndex((l) => new RegExp(`--(color-)?${token}\\s*:`).test(l)); return i >= 0 ? i + 1 : 1; } catch { return 1; } };

// 2. static WCAG 2.1 contrast of the theme tokens — every time the theme changes
if (themeTouched && tFiles.length && cfg.contrast !== false) {
  const results = checkContrast(repo, { files: tFiles, aliases: cfg.contrastTokens || {} });
  const where = tFiles.find((f) => !/tailwind\.config/.test(f)) || tFiles[0];
  for (const r of results.filter((x) => !x.ok)) {
    const msg = `contrast ${r.ratio}:1 for ${r.label} (${r.scheme} theme: --${r.pair.split(" on ")[0]} ${r.fg} on --${r.pair.split(" on ")[1]} ${r.bg}) — WCAG 2.1 needs ${r.min}:1${r.min === 3 ? " for a control boundary (1.4.11)" : ""}. Change the token, not the components. [${r.min === 3 ? "1.9, P09" : "6.4, P11"}]`;
    if (r.required) problems.push({ file: where, line: lineOf(where, r.pair.split(" on ")[0]), rule: "theme/contrast", message: msg });
    else warnings.push({ file: where, rule: "theme/contrast", message: msg });
  }
}

// 3. theme in the loop: no UI work on a stock theme
if (uiTouched && cfg.themeFirst !== false) {
  const st = stockTheme(repo, allRepoFiles);
  if (st.applicable && st.stock) {
    const where = tFiles.find((f) => !/tailwind\.config/.test(f)) || "src/app/globals.css";
    problems.unshift({ file: where, line: 1, rule: "theme/theme-first", message: `Сначала обнови тему (Theme First): the kit is still the stock shadcn theme — ${st.signals.filter((x) => x.stock).map((x) => x.detail).join("; ")}. Set the product's own primary colour, radius, fonts and button variants before building UI; every page inherits them.` });
  }
}

// 6. theme fingerprint vs the registry of other products (warning only)
if (themeTouched && tFiles.length && cfg.registry !== false) {
  const name = projectName(repo, cfg);
  const fp = fingerprint(repo, allRepoFiles);
  const twins = await lookalikes(name, fp, { where: cfg.registry || DEFAULT_REGISTRY, threshold: cfg.similarityThreshold || 0.8 });
  for (const t of twins.slice(0, 3)) warnings.push({ file: tFiles[0], rule: "theme/lookalike", message: `this theme is ${Math.round(t.score * 100)}% similar to "${t.project}" (hue ${t.fingerprint.hue ?? "—"}, radius ${t.fingerprint.radius ?? "—"}px, fonts ${t.fingerprint.fonts.join(", ") || "—"}). Products should not look interchangeable — change the accent hue, the type pairing or the shape language.` });
  if (opt("register")) await register(name, fp, cfg.registry || DEFAULT_REGISTRY);
}

if (format === "json") console.log(JSON.stringify(changed ? { problems, info, warnings } : problems, null, 2));
else if (format === "agent") {
  const printInfo = () => {
    if (!info.length) return;
    console.log(`\nFor information only — older issues in files you touched. Do NOT fix these unless the task asks for it; do not refactor other pages to make them go away:`);
    for (const i of info.slice(0, 10)) console.log(`  - ${i.file}: ${i.message}`);
    if (info.length > 10) console.log(`  … and ${info.length - 10} more`);
  };
  const printWarnings = () => {
    if (!warnings.length) return;
    console.log(`\nWarnings (not blocking):`);
    for (const w of warnings) console.log(`  - ${w.file} ${w.rule}: ${w.message}`);
  };
  if (!problems.length) { console.log("Claude's Babysitter: clean."); printWarnings(); printInfo(); }
  else {
    console.log(`Claude's Babysitter: ${problems.length} problem(s). Fix every item, then run ui-check again until it prints "clean".
Rules of the fix:
- Use the project's UI-kit (components/ui) and its variants. If a needed look is missing, add a variant/size to the kit component and a token to the theme — never restyle at the call site.
- Do not silence rules (eslint-disable, style={{}}, className from a variable) — those are reported too.
- Keep the product's own look: tokens, fonts and variants are where the identity lives.
`);
    const byFile = new Map();
    for (const p of problems) byFile.set(p.file, [...(byFile.get(p.file) || []), p]);
    for (const [f, list] of byFile) {
      console.log(f);
      for (const p of list.sort((a, b) => a.line - b.line)) console.log(`  L${p.line} ${p.rule}: ${p.message}`);
    }
    console.log(`\nFix only what is listed above, inside the scope of your task.`);
    printWarnings();
    printInfo();
  }
} else {
  for (const p of problems) console.log(`${p.file}:${p.line}  ${p.rule}  ${p.message}`);
  for (const w of warnings) console.log(`${w.file}  ${w.rule} (warning)  ${w.message}`);
  console.log(`\nui-check: ${problems.length} problem(s) in ${files.length} file(s)${changed ? " (changed only)" : ""}`);
}
process.exitCode = problems.length ? 1 : 0;
