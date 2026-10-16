// Changed files → the routes they reach → the last run's findings on those routes. Shared by the git post-merge /
// post-rewrite re-check (bin/after-merge.mjs) and the Claude Code Stop hook (findings on changed routes block "done").
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pagesReached, concreteRoute, crawledRoutes } from "./route-map.js";

const git = (repo, ...a) => { try { return execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); } catch { return ""; } };
export const allFiles = (repo) => git(repo, "ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter(Boolean);
/** Files changed since `base` (a ref) plus uncommitted and untracked ones; base null → working tree vs HEAD only. */
export function changedFiles(repo, base = null) {
  const list = [git(repo, "diff", "--name-only", "HEAD"), git(repo, "ls-files", "--others", "--exclude-standard")];
  if (base) list.push(git(repo, "diff", "--name-only", `${base}...HEAD`) || git(repo, "diff", "--name-only", base, "HEAD"));
  return [...new Set(list.join("\n").split("\n").filter(Boolean))];
}
/** The branch's base: merge-base with origin/main (or master), else null. */
export const branchBase = (repo) => (git(repo, "merge-base", "HEAD", "origin/main") || git(repo, "merge-base", "HEAD", "origin/master")).trim() || null;

export const templateRe = (t) => new RegExp("^" + t.replace(/^\/\[(locale|lang|lng|language)\]/, "(?:/[a-z]{2}(?:-[A-Za-z]{2,4})?)?").replace(/\/\[\[\.\.\.\w+\]\]/g, "(?:/.*)?").replace(/\[\.\.\.\w+\]/g, ".+").replace(/\[\w+\]/g, "[^/]+") + "/?$");

/** @returns {{ templates: string[], routes: string[], unreached: string[], layoutWide: boolean, ui: boolean }} */
export function changedRoutes(repo, changed, cfg = {}) {
  const ui = changed.some((f) => /\.(jsx|tsx|vue|svelte|astro|s?css|json)$/.test(f));
  if (!ui) return { templates: [], routes: [], unreached: [], layoutWide: false, ui };
  const { templates, layoutWide } = pagesReached(repo, changed, allFiles(repo));
  const crawled = crawledRoutes(repo);
  const routes = [], unreached = [];
  for (const t of templates) { const r = concreteRoute(t, { sampleParams: cfg.sampleParams || {}, crawled }); if (r) routes.push(r); else unreached.push(t); }
  // a layout, a stylesheet, a messages file or the theme: every page is touched
  const wide = layoutWide || changed.some((f) => /\.s?css$|(^|\/)(messages|locales|translations|i18n)\/.*\.json$|tailwind\.config/.test(f));
  if (wide) routes.push(...(crawled.length ? crawled : cfg.routes || ["/"]));
  return { templates, routes: [...new Set(routes)], unreached, layoutWide: wide, ui };
}

/** Findings of the last run (.babysitter/findings.json) on the given routes / templates; all of them when layoutWide. */
export function findingsOn(repo, { templates = [], routes = [], layoutWide = false }) {
  const p = join(repo, ".babysitter/findings.json");
  if (!existsSync(p)) return { at: null, list: [] };
  let j;
  try { j = JSON.parse(readFileSync(p, "utf8")); } catch { return { at: null, list: [] }; }
  const res = templates.map(templateRe);
  const list = (j.findings || []).filter((f) => layoutWide || (!f.route ? false : routes.includes(f.route) || res.some((r) => r.test(f.route.split("?")[0]))));
  return { at: j.at, list };
}
