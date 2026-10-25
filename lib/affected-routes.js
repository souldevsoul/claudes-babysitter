// `babysitter e2e --changed` / `--since <ref>`: which routes a change can reach, and why.
//
// Every changed file is followed up the import graph of the app (static imports, re-exports and barrels, import(),
// require(), next/dynamic, import() with a template path → every file under its folder; tsconfig / jsconfig paths
// aliases and baseUrl) to the page and layout files that use it. A page file selects its route; a layout or template
// selects every route under its folder. What every page depends on widens the run to ALL routes: global CSS, the
// theme and tokens, tailwind / postcss config, the UI kit (components/ui), root and route-group layouts, the header,
// footer and navigation, middleware, next.config, package.json and lockfiles, babysitter.config.json, tsconfig, env
// files, the database schema, API route handlers (pages fetch them at runtime), and any file the graph cannot place.
// A message file (i18n) selects the routes whose code uses the namespaces whose keys changed; when that cannot be
// told, every route. A route that no page file maps to is always checked.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, posix } from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";
import { templateOf } from "./route-map.js";
import { templateRe } from "./changed-routes.js";
import { routeKey } from "./route-selection.js";

const git = (repo, ...a) => { try { return execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 }); } catch { return null; } };
const SRC = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/;
const EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".json", ".css", ".scss", ".sass", ".less", ".mdx", ".md"];
const SKIP_DIR = /(^|\/)(node_modules|\.next|\.git|out|dist|build|coverage|\.turbo|\.vercel|\.babysitter|playwright-report|test-results)(\/|$)/;

/** What does not render: docs, tests, CI, editor settings, the tool's own state. */
const IGNORE = [
  /^(docs?|\.github|\.husky|\.vscode|\.idea|\.cursor|\.claude|tests?|__tests__|e2e|cypress|playwright|scripts|misses|reports|\.storybook|stories)\//,
  /(^|\/)__tests__\//, /(^|\/)[^/]+\.(test|spec|stories)\.[cm]?[jt]sx?$/, /(^|\/)(vitest|jest|playwright|checkly|commitlint|lint-staged|eslint|prettier|stylelint|codecov|crowdin)\.[\w.-]*$/,
  /^[^/]+\.(md|txt|log|csv|png|jpe?g|webm|mp4|mov|py|sh|sql|patch)$/i, /^(LICENSE|CODEOWNERS|\.gitignore|\.gitattributes|\.editorconfig|\.nvmrc|\.npmrc|\.prettierrc[\w.]*|\.eslintrc[\w.]*|\.env\.example)$/,
];
/** What every page depends on. */
const GLOBAL = [
  [/(^|\/)(tailwind|postcss)\.config\.[cm]?[jt]s$/, "tailwind / postcss config"],
  [/(^|\/)next\.config\.[cm]?[jt]s$/, "next.config"],
  [/(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/, "dependencies"],
  [/(^|\/)babysitter\.config\.json$/, "babysitter.config.json"],
  [/(^|\/)(tsconfig|jsconfig)(\.[\w-]+)?\.json$/, "tsconfig / aliases"],
  [/(^|\/)\.env(\.[\w-]+)?$/, "environment"],
  [/(^|\/)(middleware|instrumentation)\.[cm]?[jt]s$/, "middleware"],
  [/(^|\/)(components\/ui|ui\/components|components\/kit)\//, "the UI kit"],
  [/(^|\/)(themes?|tokens|design-tokens)\/|(^|\/)(theme|themes|tokens?|design-tokens)\.[\w.]+$/i, "theme / tokens"],
  [/(^|\/)(site-|app-|main-)?(header|footer|nav|navbar|navigation|topbar|top-bar|sidebar|side-nav|app-shell|shell)\.(t|j)sx?$/i, "header / footer / navigation"],
  [/(^|\/)(i18n|i18n\/request|i18n\/routing|navigation|routing)\.(t|j)s$/, "i18n setup"],
  [/(^|\/)prisma\/|\.prisma$|(^|\/)drizzle\//, "database schema"],
  [/(^|\/)app\/(?:\([^/]*\)\/)*(?:\[[^\]/]+\]\/)?(?:\([^/]*\)\/)*(layout|template|not-found|error|global-error|loading)\.(t|j)sx?$/, "root / group layout"],
  [/(^|\/)pages\/_(app|document)\.(t|j)sx?$/, "pages/_app / _document"],
  [/(^|\/)app\/(icon|apple-icon|manifest|favicon|opengraph-image|robots|sitemap)\.[\w]+$/, "site icon / manifest"],
];
const MESSAGES = /(^|\/)(messages|locales|translations|lang|i18n)\/(?:[\w-]+\/)*[\w-]+\.json$/;

/* ───────── aliases ───────── */
function readJsonc(file) {
  try { return JSON.parse(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1").replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
}
/** tsconfig / jsconfig compilerOptions.paths (with `extends`) → [{ prefix, star, targets }], plus baseUrl. */
export function aliases(repo) {
  const out = [];
  let baseUrl = null;
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    let f = join(repo, name), depth = 0;
    const chainCfg = [];
    while (f && existsSync(f) && depth++ < 5) {
      const j = readJsonc(f);
      if (!j) break;
      chainCfg.push({ j, dir: dirname(f) });
      f = j.extends && /^\./.test(j.extends) ? join(dirname(f), j.extends.endsWith(".json") ? j.extends : `${j.extends}.json`) : null;
    }
    for (const { j, dir } of chainCfg.reverse()) {
      const co = j.compilerOptions || {};
      const bu = co.baseUrl ? posix.normalize(join(dir, co.baseUrl).slice(repo.length + 1) || ".") : null;
      if (bu !== null) baseUrl = bu;
      for (const [k, v] of Object.entries(co.paths || {})) {
        const star = k.endsWith("*");
        const root = bu || (dir === repo ? "." : dir.slice(repo.length + 1));
        out.push({ prefix: star ? k.slice(0, -1) : k, star, targets: (v || []).map((t) => posix.normalize(posix.join(root, t)).replace(/\*$/, "")) });
      }
    }
  }
  if (!out.length) out.push({ prefix: "@/", star: true, targets: [existsSync(join(repo, "src")) ? "src/" : ""] }, { prefix: "~/", star: true, targets: [existsSync(join(repo, "src")) ? "src/" : ""] });
  out.sort((a, b) => b.prefix.length - a.prefix.length);
  return { list: out, baseUrl };
}

function tryFile(repo, base) {
  base = normalize(base).replace(/\\/g, "/").replace(/^\.\//, "");
  if (base.startsWith("..")) return null;
  const isFile = (p) => { try { return statSync(join(repo, p)).isFile(); } catch { return false; } };
  if (isFile(base)) return base;
  for (const e of EXT) if (isFile(base + e)) return base + e;
  for (const e of EXT) if (isFile(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}
/** an import specifier from `from` → repo-relative file, or null (a package, or not found) */
export function resolveSpec(repo, from, spec, al) {
  if (!spec) return null;
  if (spec.startsWith(".")) return tryFile(repo, posix.join(posix.dirname(from), spec));
  for (const a of al.list) {
    if (a.star ? spec.startsWith(a.prefix) : spec === a.prefix) {
      const rest = a.star ? spec.slice(a.prefix.length) : "";
      for (const t of a.targets) { const r = tryFile(repo, posix.join(t, rest)); if (r) return r; }
    }
  }
  if (spec.startsWith("/")) return tryFile(repo, spec.slice(1));
  if (al.baseUrl !== null) return tryFile(repo, posix.join(al.baseUrl, spec));
  return null;
}

/* ───────── the import graph ───────── */
function specsOf(src) {
  const specs = new Set();
  const dirs = new Set(); // import(`./x/${a}`) → "./x/"
  let parsed = true;
  try {
    const ast = parse(src, { jsx: true, range: false, loc: false, tolerant: true });
    const visit = (n) => {
      if (!n || typeof n.type !== "string") return;
      if ((n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration" || n.type === "ExportNamedDeclaration") && n.source) specs.add(n.source.value);
      if (n.type === "ImportExpression") {
        if (n.source.type === "Literal") specs.add(n.source.value);
        else if (n.source.type === "TemplateLiteral" && n.source.quasis[0]?.value.cooked) dirs.add(n.source.quasis[0].value.cooked);
      }
      if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "require" && n.arguments[0]?.type === "Literal") specs.add(n.arguments[0].value);
      for (const k of Object.keys(n)) {
        if (k === "parent") continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === "object" && typeof v.type === "string") visit(v);
      }
    };
    visit(ast);
  } catch { parsed = false; }
  if (!parsed) {
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm)) specs.add(m[1] || m[2] || m[3] || m[4]);
  }
  return { specs: [...specs].filter((s) => typeof s === "string"), dirs: [...dirs], parsed };
}

/** repo files → { importers: Map(file → Set(files importing it)), dirImporters: [{ dir, by }], unparsed: Set } */
export function importGraph(repo, files) {
  const al = aliases(repo);
  const importers = new Map();
  const dirImporters = [];
  const unparsed = new Set();
  for (const f of files) {
    if (!SRC.test(f) && !/\.(css|scss|sass|less)$/.test(f)) continue;
    let src;
    try { src = readFileSync(join(repo, f), "utf8"); } catch { continue; }
    let specs = [], dirs = [];
    if (SRC.test(f)) { const r = specsOf(src); specs = r.specs; dirs = r.dirs; if (!r.parsed) unparsed.add(f); }
    else for (const m of src.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) specs.push(m[1]);
    for (const s of specs) {
      const t = resolveSpec(repo, f, s, al);
      if (!t) continue;
      if (!importers.has(t)) importers.set(t, new Set());
      importers.get(t).add(f);
    }
    for (const d of dirs) {
      const base = d.startsWith(".") ? posix.join(posix.dirname(f), d) : (() => { for (const a of al.list) if (a.star && d.startsWith(a.prefix)) return posix.join(a.targets[0] || "", d.slice(a.prefix.length)); return null; })();
      if (base) dirImporters.push({ dir: base.endsWith("/") ? base : posix.dirname(base) + "/", by: f });
    }
  }
  return { importers, dirImporters, unparsed, aliases: al };
}

/* ───────── what changed ───────── */
/** The ref the branch left: merge-base with origin/main (main, origin/master, master), else null. */
export function defaultBase(repo) {
  for (const r of ["origin/main", "main", "origin/master", "master"]) {
    const mb = git(repo, "merge-base", "HEAD", r);
    if (mb && mb.trim()) return mb.trim();
  }
  return null;
}
/** files changed since `base` (committed), plus staged, unstaged and untracked ones */
export function changedFiles(repo, base) {
  const out = new Set();
  const add = (s) => { for (const l of String(s || "").split("\n")) if (l.trim()) out.add(l.trim()); };
  if (base) add(git(repo, "diff", "--name-only", `${base}...HEAD`) ?? git(repo, "diff", "--name-only", base, "HEAD"));
  add(git(repo, "diff", "--name-only", "HEAD"));
  add(git(repo, "diff", "--name-only", "--cached"));
  add(git(repo, "ls-files", "--others", "--exclude-standard"));
  return [...out];
}

/** top-level keys of a message file whose value differs between `base` and the working tree */
function changedNamespaces(repo, file, base) {
  let now = null, before = null;
  try { now = JSON.parse(readFileSync(join(repo, file), "utf8")); } catch { now = null; }
  const old = git(repo, "show", `${base || "HEAD"}:${file}`);
  try { before = old ? JSON.parse(old) : null; } catch { before = null; }
  if (!now && !before) return null;
  const keys = new Set([...Object.keys(now || {}), ...Object.keys(before || {})]);
  return [...keys].filter((k) => JSON.stringify(now?.[k]) !== JSON.stringify(before?.[k]));
}

/**
 * @param {string} repo
 * @param {{ base?: string|null, changed?: string[], routes?: Array<{path:string,auth?:boolean,role?:string,template?:string}>, files?: string[], ignore?: string[] }} o
 * @returns {{ all: boolean, why: string[], routes: Array<{ key: string, path: string, role: string|null, why: string }>, of: number, files: Array<{ file: string, effect: string }>, base: string|null }}
 */
export function affectedRoutes(repo, { base = undefined, changed = null, routes = [], files = null, ignore = [] } = {}) {
  if (base === undefined) base = defaultBase(repo);
  const list = changed || changedFiles(repo, base);
  const all = files || (git(repo, "ls-files", "--cached", "--others", "--exclude-standard") || "").split("\n").filter((f) => f && !SKIP_DIR.test(f));
  const extraIgnore = ignore.map((g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`));
  const widen = [];
  const effects = [];
  const pages = new Map(); // template → why
  const subtrees = new Map(); // app folder prefix → why
  let graph = null;
  const G = () => (graph ??= importGraph(repo, all));
  const pageTemplate = (f) => templateOf(f);
  const isApi = (f) => /(^|\/)app\/(.*\/)?route\.(t|j)s$/.test(f) || /(^|\/)pages\/api\//.test(f) || /(^|\/)app\/api\//.test(f);

  /** walk up from `start`: pages, layouts, API handlers; returns true when it reached anything at all */
  const walk = (start, why0) => {
    const seen = new Set([start]);
    const queue = [[start, why0]];
    let reached = false;
    while (queue.length) {
      const [f, why] = queue.shift();
      const g = GLOBAL.find(([re]) => re.test(f));
      if (g && f !== start) { widen.push(`${why} → ${f} (${g[1]})`); return true; }
      if (isApi(f)) { widen.push(`${why} → ${f} (an API route: pages read it at runtime)`); return true; }
      const t = pageTemplate(f);
      if (t !== null && /(^|\/)(app|pages)\//.test(f)) { if (!pages.has(t)) pages.set(t, why); reached = true; continue; }
      const lm = f.match(/^(.*\/)?app\/(.*?)\/?(layout|template|loading|error|not-found)\.(t|j)sx?$/);
      if (lm) { const prefix = (lm[1] || "") + "app/" + (lm[2] ? `${lm[2]}/` : ""); if (!subtrees.has(prefix)) subtrees.set(prefix, why); reached = true; continue; }
      const by = new Set(G().importers.get(f) || []);
      for (const d of G().dirImporters) if (f.startsWith(d.dir)) by.add(d.by);
      for (const b of by) if (!seen.has(b)) { seen.add(b); queue.push([b, `${why} → ${b}`]); }
    }
    return reached;
  };

  for (const f of list) {
    if (IGNORE.some((re) => re.test(f)) || extraIgnore.some((re) => re.test(f))) { effects.push({ file: f, effect: "does not render (docs, tests, CI, tooling)" }); continue; }
    const g = GLOBAL.find(([re]) => re.test(f));
    if (g) { widen.push(`${f} (${g[1]})`); effects.push({ file: f, effect: `every route: ${g[1]}` }); continue; }
    if (MESSAGES.test(f)) {
      const ns = changedNamespaces(repo, f, base);
      if (!ns) { widen.push(`${f} (a message file that cannot be read)`); effects.push({ file: f, effect: "every route: message file not readable" }); continue; }
      if (!ns.length) { effects.push({ file: f, effect: "no message changed" }); continue; }
      const users = new Map(); // namespace → files
      let rootUsers = [];
      for (const s of all) {
        if (!SRC.test(s) || IGNORE.some((re) => re.test(s))) continue;
        let src;
        try { src = readFileSync(join(repo, s), "utf8"); } catch { continue; }
        if (!/useTranslations|getTranslations|useTranslation|useI18n|i18n\.t\(|\bt\(/.test(src)) continue;
        for (const m of src.matchAll(/(?:useTranslations|getTranslations|useTranslation)\(\s*(?:\{[^}]*namespace\s*:\s*)?["'`]([\w.-]+)["'`]/g)) { const n = m[1].split(/[.:]/)[0]; if (!users.has(n)) users.set(n, []); users.get(n).push(s); }
        if (/(?:useTranslations|getTranslations|useTranslation)\(\s*(?:\)|\{\s*locale[^}]*\}\s*\))/.test(src)) rootUsers.push(s);
      }
      const unknown = ns.filter((n) => !users.has(n));
      if (unknown.length && !rootUsers.length) { widen.push(`${f}: namespace(s) ${unknown.join(", ")} changed, no code names them (used some other way)`); effects.push({ file: f, effect: `every route: namespace(s) ${unknown.join(", ")} not found in the code` }); continue; }
      if (rootUsers.length) { widen.push(`${f}: messages changed, and ${rootUsers[0]} reads messages without a namespace`); effects.push({ file: f, effect: "every route: messages read without a namespace" }); continue; }
      const seeds = [...new Set(ns.flatMap((n) => users.get(n) || []))];
      for (const s of seeds) if (!walk(s, `${f} [${ns.join(", ")}] → ${s}`)) { /* used by code no page renders */ }
      effects.push({ file: f, effect: `namespaces ${ns.join(", ")} → ${seeds.length} file(s) that use them` });
      continue;
    }
    if (/^public\//.test(f)) {
      const url = `/${f.slice("public/".length)}`;
      const refs = all.filter((s) => SRC.test(s) && !IGNORE.some((re) => re.test(s)) && (() => { try { return readFileSync(join(repo, s), "utf8").includes(url); } catch { return false; } })());
      if (!refs.length) { widen.push(`${f} (a public file no source file names)`); effects.push({ file: f, effect: "every route: public file not named in the code" }); continue; }
      for (const r of refs) walk(r, `${f} → ${r}`);
      effects.push({ file: f, effect: `named in ${refs.length} file(s)` });
      continue;
    }
    if (/\.(css|scss|sass|less)$/.test(f) && !/\.module\.(css|scss|sass|less)$/.test(f)) { widen.push(`${f} (global CSS)`); effects.push({ file: f, effect: "every route: global CSS" }); continue; }
    const exists = existsSync(join(repo, f));
    if (SRC.test(f) || /\.module\.(css|scss|sass|less)$/.test(f) || (/\.(json|mdx?)$/.test(f) && exists)) {
      if (!exists) { widen.push(`${f} (deleted: what imported it changed too)`); effects.push({ file: f, effect: "every route: a deleted source file" }); continue; }
      if (SRC.test(f) && G().unparsed.has(f)) { widen.push(`${f} (could not be parsed)`); effects.push({ file: f, effect: "every route: not parseable" }); continue; }
      const before = widen.length;
      const reached = walk(f, f);
      if (widen.length > before) effects.push({ file: f, effect: "every route (see why)" });
      else if (reached) effects.push({ file: f, effect: "the pages that import it" });
      else if (SRC.test(f) && !/\.json$/.test(f)) effects.push({ file: f, effect: "imported by no page or layout: no route renders it" });
      else { widen.push(`${f} (no page imports it: read some other way)`); effects.push({ file: f, effect: "every route: not in the import graph" }); }
      continue;
    }
    widen.push(`${f} (not in the import graph)`);
    effects.push({ file: f, effect: "every route: the graph cannot place it" });
  }

  const routeList = routes.map((r) => (typeof r === "string" ? { path: r, auth: false } : r));
  const keyOf = (r) => routeKey(r);
  if (widen.length) return { all: true, why: widen, routes: routeList.map((r) => ({ key: keyOf(r), path: r.path, role: r.auth ? r.role || "user" : null, why: "every route" })), of: routeList.length, files: effects, base };
  // which page template does each route render? (the crawl records it; else match the path against every page file)
  const allTemplates = [...new Set(all.map((f) => (/(^|\/)(app|pages)\//.test(f) ? templateOf(f) : null)).filter((t) => t !== null))];
  const templateOfRoute = (r) => {
    const p = r.path.split(/[?#]/)[0];
    if (r.template && allTemplates.includes(r.template)) return r.template;
    const hits = allTemplates.filter((t) => templateRe(t).test(p));
    if (!hits.length) return null;
    return hits.sort((a, b) => (a.match(/\[/g) || []).length - (b.match(/\[/g) || []).length)[0];
  };
  const sel = [];
  for (const r of routeList) {
    const t = templateOfRoute(r);
    if (t === null) { sel.push({ key: keyOf(r), path: r.path, role: r.auth ? r.role || "user" : null, why: "no page file maps to this route: always checked" }); continue; }
    if (pages.has(t)) { sel.push({ key: keyOf(r), path: r.path, role: r.auth ? r.role || "user" : null, why: `${pages.get(t)} (page ${t})` }); continue; }
    const pageFile = all.find((f) => /(^|\/)(app|pages)\//.test(f) && templateOf(f) === t);
    const sub = pageFile ? [...subtrees.entries()].find(([prefix]) => pageFile.startsWith(prefix)) : null;
    if (sub) sel.push({ key: keyOf(r), path: r.path, role: r.auth ? r.role || "user" : null, why: `${sub[1]} (layout over ${sub[0]})` });
  }
  return { all: false, why: [], routes: sel, of: routeList.length, files: effects, base };
}

/** the printout: which routes and why */
export function explainSelection(res, { max = 40 } = {}) {
  const L = [];
  L.push(`--changed${res.base ? ` (since ${String(res.base).slice(0, 12)})` : ""}: ${res.files.length} changed file(s)`);
  for (const f of res.files.slice(0, max)) L.push(`  · ${f.file} — ${f.effect}`);
  if (res.files.length > max) L.push(`  · … ${res.files.length - max} more`);
  if (res.all) {
    L.push(`→ ALL ${res.of} route(s): the change reaches every page`);
    for (const w of res.why.slice(0, 12)) L.push(`    because ${w}`);
  } else {
    L.push(`→ ${res.routes.length} of ${res.of} route(s) selected${res.routes.length ? ":" : " — no change reaches a page"}`);
    for (const r of res.routes.slice(0, max)) L.push(`    ${r.path}${r.role ? ` [${r.role}]` : ""} ← ${r.why}`);
    if (res.routes.length > max) L.push(`    … ${res.routes.length - max} more`);
  }
  return L.join("\n");
}
