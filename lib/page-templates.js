// 5.7.1: page templates of a repo, for `e2e --fast` (768 on one route per template).
// A route's "template" was its dynamic pattern (/blog/[slug]) or else its own path, so on an app-router product every
// page.tsx was a template of its own: a live run checked 768 on 52 of 52 routes. A template is what a tablet layout
// actually depends on — the shell around the page and the frame the page is built from:
//   • shell: the nearest layout/template file above the page that renders something (a layout that only returns
//     {children}, or only sets metadata, is not one); two layouts that render the same components (every auth folder's
//     <AuthHeader/>) are one shell. The root layout wraps every page and tells nothing apart.
//   • frame: a shared page-building component the page imports (a LegalDocument, a PageHero, an AdminPageHeader, a
//     dashboard chrome module) — named like a frame (shell, layout, document, hero, header, heading, chrome, frame,
//     template, scaffold) and not a kit primitive (components/ui/) or a helper (lib/, hooks/, utils/).
//   Pages under the same non-root shell are one template whatever they import beyond their frame (dashboard/* collapse);
//   pages under the root shell with no frame stay one template each (the home page, a blog post).
// Every dynamic route of one page.tsx is one template by construction (one file).
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { execFileSync } from "node:child_process";
import { templateOf } from "./route-map.js";

const FRAME_RE = /(shell|layout|document|hero|header|heading|chrome|frame|template|scaffold)/i;
const NOT_FRAME_PATH = /(^|\/)(ui|lib|hooks?|utils?|helpers?|icons?|types?|data|config|constants?)(\/|$)/i;
const LAYOUT_NAMES = ["layout.tsx", "layout.jsx", "layout.ts", "layout.js", "template.tsx", "template.jsx", "template.js"];

const read = (repo, f) => { try { return readFileSync(join(repo, f), "utf8"); } catch { return ""; } };

/** The repo's source files (git), or [] outside a git checkout. */
export function repoFiles(repo) {
  if (!existsSync(join(repo, "package.json"))) return [];
  try { return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean); } catch { return []; }
}

/** A layout that renders nothing of its own: returns {children} (or <>{children}</>), whatever metadata it exports. */
export function passThrough(src) {
  const body = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const returns = [...body.matchAll(/return\s*\(?\s*([\s\S]*?)\)?\s*;?\s*\}/g)].map((m) => m[1].replace(/\s+/g, ""));
  const arrow = [...body.matchAll(/=>\s*\(?\s*(<>\s*\{\s*children\s*\}\s*<\/>|children)\s*\)?\s*[;\n]/g)];
  if (arrow.length && !returns.length) return true;
  return returns.length > 0 && returns.every((r) => /^(<>)?\{?children\}?(<\/>)?\)?;?$/.test(r));
}

/** The components a layout renders (capitalised JSX tags), the identity of its shell. */
function shellSignature(src, file) {
  const tags = [...new Set([...src.matchAll(/<([A-Z][\w.]*)[\s/>]/g)].map((m) => m[1]).filter((t) => !/^(Fragment|React\.Fragment|Suspense|StrictMode)$/.test(t)))].sort();
  // a layout of plain elements (a console rail of divs) is its own shell
  return tags.length ? `renders ${tags.join(", ")}` : file;
}

/** Local imports of a page file: [{ spec, names }]. */
function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(/import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const spec = m[2];
    if (!/^(\.{1,2}\/|@\/|~\/|#\/|src\/)/.test(spec)) continue;
    const names = [...m[1].replace(/\btype\s+\w+/g, "").matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]).filter((n) => n !== "as");
    out.push({ spec, names });
  }
  return out;
}
/** "@/components/legal/legal-document" → "legal/legal-document" (the last two steps name the module). */
const moduleName = (spec) => spec.replace(/\.(t|j)sx?$/, "").split("/").filter((s) => s && s !== "." && s !== ".." && s !== "@" && s !== "~").slice(-2).join("/");

/**
 * @param {string} repo
 * @param {string[]} [files] repo-relative source files (git ls-files)
 * @returns {Map<string, { key: string, shell: string, frame: string|null, file: string }>} route template → family
 */
export function pageFamilies(repo, files = repoFiles(repo)) {
  const pages = files.map((f) => ({ f, t: templateOf(f) })).filter((x) => x.t !== null && /(^|\/)app\//.test(x.f));
  const out = new Map();
  if (!pages.length) return out;
  const fileSet = new Set(files);
  const shellOf = new Map();
  const shellFor = (pageFile) => {
    // nearest layout above the page (the page's own folder first), up to — not including — the app root's layout
    const appDir = pageFile.match(/^((?:.*?\/)?app)\//)[1];
    for (let dir = posix.dirname(pageFile); dir !== appDir && dir.startsWith(`${appDir}/`); dir = posix.dirname(dir)) {
      for (const n of LAYOUT_NAMES) {
        const lf = `${dir}/${n}`;
        if (!fileSet.has(lf)) continue;
        if (!shellOf.has(lf)) { const src = read(repo, lf); shellOf.set(lf, passThrough(src) ? null : shellSignature(src, lf)); }
        if (shellOf.get(lf)) return shellOf.get(lf);
      }
    }
    return "root";
  };
  const info = pages.map((p) => {
    const src = read(repo, p.f);
    const frames = importsOf(src).filter((i) => !NOT_FRAME_PATH.test(i.spec.replace(/^(@|~|#)\//, "")) && (FRAME_RE.test(moduleName(i.spec).split("/").pop()) || i.names.some((n) => /^[A-Z]/.test(n) && FRAME_RE.test(n)))).map((i) => moduleName(i.spec));
    return { ...p, shell: shellFor(p.f), frames: [...new Set(frames)].sort() };
  });
  // a frame nearly every page of its shell imports (a site-wide <Layout>) tells nothing apart: it is part of the shell
  const byShell = new Map();
  for (const x of info) { if (!byShell.has(x.shell)) byShell.set(x.shell, []); byShell.get(x.shell).push(x); }
  for (const list of byShell.values()) {
    if (list.length < 5) continue;
    const n = new Map();
    for (const x of list) for (const fr of x.frames) n.set(fr, (n.get(fr) || 0) + 1);
    for (const x of list) x.frames = x.frames.filter((fr) => n.get(fr) < list.length * 0.8);
  }
  for (const x of info) {
    const frame = x.frames.join(" + ") || null;
    const key = x.shell === "root" && !frame ? `page ${x.t}` : `${x.shell === "root" ? "site layout" : x.shell}${frame ? ` · ${frame}` : ""}`;
    out.set(x.t, { key, shell: x.shell, frame, file: x.f });
  }
  return out;
}

const tplRe = (t) => new RegExp("^" + t.replace(/^\/\[(locale|lang|lng|language)\]/, "(?:/[a-z]{2}(?:-[A-Za-z]{2,4})?)?").replace(/\/\[\[\.\.\.\w+\]\]/g, "(?:/.*)?").replace(/\[\.\.\.\w+\]/g, ".+").replace(/\[\w+\]/g, "[^/]+") + "/?$");
/** The family of a crawled route ({ path, template? }), or null when no page file renders it. */
export function familyOf(families, route) {
  if (!families?.size) return null;
  if (route.template && families.has(route.template)) return families.get(route.template);
  const path = String(route.path || "").split("?")[0];
  if (families.has(path)) return families.get(path);
  const hits = [...families.keys()].filter((t) => tplRe(t).test(path)).sort((a, b) => (a.match(/\[/g) || []).length - (b.match(/\[/g) || []).length);
  return hits.length ? families.get(hits[0]) : null;
}
