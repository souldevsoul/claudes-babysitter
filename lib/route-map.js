// Which pages does a change reach, and at which URL can each be opened?
//
// A rendered check is only as good as the pages it opens. Two gaps let a native <select> through on a
// real product (plinth, 2026-10): the select lived in a component (components/gallery/gallery-controls.tsx),
// so no page file "changed", and its page sat under a dynamic segment (app/[game]/gallery), which was
// skipped without a word. This module closes both: changed files are followed up the import graph to every
// page that uses them, and dynamic segments are filled from config.sampleParams, then from the crawl
// (.babysitter/routes.json). What still has no URL is returned to the caller, which reports it instead of
// passing silently.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";
import { resolveImport, aliasesOf } from "./components.js";

const PAGE_RE = /(?:^|\/)app\/(.*?)\/?page\.(t|j)sx?$|(?:^|\/)pages\/(.*?)\.(t|j)sx?$/;
const LAYOUT_RE = /(?:^|\/)app\/(.*?)\/?(layout|template)\.(t|j)sx?$/;
const DYN = /^\[\[?(?:\.\.\.)?(\w+)\]?\]$/;

/** Repo-relative page file → route template ("/[game]/gallery"), or null for non-pages / API. */
export function templateOf(file) {
  const m = file.match(PAGE_RE);
  if (!m) return null;
  const body = m[1] ?? m[3] ?? "";
  if (/(^|\/)(api|_app|_document|_error)(\/|$)/.test(body)) return null;
  const segs = body.split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@") && s !== "index");
  return "/" + segs.join("/");
}

/** Every file that (transitively) imports `start`, via static imports, re-exports and import(). */
function reverseImports(repo, files) {
  const aliases = aliasesOf(repo);
  const rev = new Map();
  for (const f of files) {
    let src;
    try { src = readFileSync(join(repo, f), "utf8"); } catch { continue; }
    const specs = new Set();
    try {
      const ast = parse(src, { jsx: true });
      for (const st of ast.body) if ((st.type === "ImportDeclaration" || st.type === "ExportAllDeclaration" || st.type === "ExportNamedDeclaration") && st.source) specs.add(st.source.value);
    } catch {}
    for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
    for (const s of specs) {
      const t = resolveImport(repo, f, s, aliases);
      if (!t) continue;
      if (!rev.has(t)) rev.set(t, new Set());
      rev.get(t).add(f);
    }
  }
  return rev;
}

/**
 * @param repo       repo root
 * @param changed    repo-relative changed files
 * @param allFiles   repo-relative source files (git ls-files)
 * @returns {{ pages: string[], templates: string[], layoutWide: boolean }}
 *   pages: page files reached; layoutWide: a layout/template (or something every page imports) changed
 */
export function pagesReached(repo, changed, allFiles) {
  const src = allFiles.filter((f) => /\.(t|j)sx?$/.test(f) && !/node_modules|\.next\//.test(f));
  const rev = reverseImports(repo, src);
  const pages = new Set();
  let layoutWide = false;
  const seen = new Set();
  const queue = changed.filter((f) => /\.(t|j)sx?$/.test(f));
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    if (templateOf(f) !== null) { pages.add(f); continue; }
    if (LAYOUT_RE.test(f)) { layoutWide = true; continue; }
    for (const by of rev.get(f) || []) queue.push(by);
  }
  const templates = [...new Set([...pages].map(templateOf).filter((t) => t !== null))];
  return { pages: [...pages], templates, layoutWide };
}

/**
 * Template → a URL that opens it. "/[game]/gallery" + sampleParams {game:"tf2"} → "/tf2/gallery";
 * otherwise the first crawled route with the same shape. null when neither knows a value.
 */
export function concreteRoute(template, { sampleParams = {}, crawled = [] } = {}) {
  const segs = template.split("/").filter(Boolean);
  if (!segs.some((s) => DYN.test(s))) return template;
  // an optional catch-all with no sample: the bare prefix is a valid URL ("/docs/[[...slug]]" → "/docs")
  const last = segs[segs.length - 1];
  const optional = /^\[\[\.\.\.\w+\]\]$/.test(last);
  if (optional && !segs.slice(0, -1).some((s) => DYN.test(s)) && sampleParams[last.match(DYN)[1]] === undefined) return "/" + segs.slice(0, -1).join("/");
  let ok = true;
  const filled = segs.map((s) => {
    const d = s.match(DYN);
    if (!d) return s;
    if (sampleParams[d[1]] !== undefined) return String(sampleParams[d[1]]);
    ok = false;
    return s;
  });
  if (ok) return "/" + filled.join("/");
  for (const r of crawled) {
    const parts = r.split("?")[0].split("/").filter(Boolean);
    const catchAll = segs.findIndex((s) => /^\[\[?\.\.\./.test(s));
    if (catchAll < 0 ? parts.length !== segs.length : parts.length < catchAll + 1) continue;
    if (segs.every((s, i) => DYN.test(s) || /^\[\[?\.\.\./.test(s) || s === parts[i])) return "/" + parts.join("/");
  }
  return null;
}

/** Crawled paths from `babysitter prepare` (.babysitter/routes.json), [] when there is no crawl yet. */
export function crawledRoutes(repo) {
  const p = join(repo, ".babysitter/routes.json");
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")).map((r) => (typeof r === "string" ? r : r.path)).filter(Boolean); } catch { return []; }
}
