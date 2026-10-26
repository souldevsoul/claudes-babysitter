// `babysitter e2e --fast`: a smaller matrix, every check that is not run listed as "by design scope" (never silent).
//   • viewports 390 + 1440 for every route; 768 only on a sample — one route per page template (the home page
//     always), since a tablet layout is the same template's breakpoint and not a page of its own; 360 and 1280 are
//     not projects of a --fast run (VIEWPORTS / babysitter.config.json viewports still win);
//   • a route a second role sees with the same rendered main text as the first (a legal page signed in) is checked
//     once, for the first role (the text pass told which);
//   • copy is read once by the text pass (content.spec skips what it read).
// The plan is written to .babysitter/fast-plan.json and read by every per-route describe (playwright/express.js).
import { existsSync, readFileSync } from "node:fs";
import { routeKey } from "./route-selection.js";

export const FAST_VIEWPORTS = [390, 768, 1440];
export const MID = "tablet-768";

const mainText = (p) => p.lines.filter((l) => l.region === "main" || l.region === "collapsed").map((l) => l.text).join("\n");
/** @returns {{ mid: string, midRoutes: string[], drop: Record<string, string>, of: number }} */
export function buildFastPlan(routes, textPages = []) {
  const seen = new Set(), midRoutes = [];
  for (const r of routes) {
    const tpl = `${r.auth ? r.role || "user" : "public"} ${r.template || r.path}`;
    if (r.path === "/" || !seen.has(tpl)) { seen.add(tpl); midRoutes.push(routeKey(r)); }
  }
  const drop = {};
  const byPath = new Map();
  for (const p of textPages) { if (p.locale) continue; const k = p.route; if (!byPath.has(k)) byPath.set(k, []); byPath.get(k).push(p); }
  for (const [path, list] of byPath) {
    if (list.length < 2) continue;
    const first = list[0], t = mainText(first);
    for (const p of list.slice(1)) if (mainText(p) === t) drop[routeKey({ path, auth: p.auth, role: p.role })] = `the same rendered main text as ${first.auth ? `[${first.role}]` : "signed out"} ${path}: checked once`;
  }
  return { mid: MID, midRoutes, drop, of: routes.length };
}

let PLAN;
export function fastPlan() {
  if (PLAN !== undefined) return PLAN;
  PLAN = null;
  const f = process.env.BABYSITTER_FAST_PLAN;
  if (process.env.BABYSITTER_FAST === "1" && f && existsSync(f)) { try { PLAN = JSON.parse(readFileSync(f, "utf8")); } catch { PLAN = null; } }
  return PLAN;
}
/** The reason a route's per-page checks do not run in this project of a --fast run, or null. */
export function fastSkip(route, project) {
  const p = fastPlan();
  if (!p) return null;
  const k = routeKey(route);
  if (p.drop[k]) return `--fast: ${p.drop[k]} [by design scope]`;
  if (project === p.mid || project.startsWith(`${p.mid}-`)) if (!p.midRoutes.includes(k)) return `--fast: 768 runs on one route per page template (${p.midRoutes.length} of ${p.of}) [by design scope]`;
  return null;
}
