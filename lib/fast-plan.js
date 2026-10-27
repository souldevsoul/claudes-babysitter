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
import { familyOf } from "./page-templates.js";

export const FAST_VIEWPORTS = [390, 768, 1440];
export const MID = "tablet-768";

const mainText = (p) => p.lines.filter((l) => l.region === "main" || l.region === "collapsed").map((l) => l.text).join("\n");
/**
 * @param routes the crawl (.babysitter/routes.json)
 * @param textPages the text pass's page models (role duplicates)
 * @param {{ families?: Map }} o page templates of the repo (lib/page-templates.js pageFamilies) — 5.7.1: a template is
 *   the shell + frame a page is built from, not its own path; without a repo, the dynamic pattern or the path
 * @returns {{ mid: string, midRoutes: string[], drop: Record<string, string>, of: number, templates: { key: string, sample: string, routes: string[] }[] }}
 */
export function buildFastPlan(routes, textPages = [], { families = null } = {}) {
  const drop = {};
  const byPath = new Map();
  for (const p of textPages) { if (p.locale) continue; const k = p.route; if (!byPath.has(k)) byPath.set(k, []); byPath.get(k).push(p); }
  for (const [path, list] of byPath) {
    if (list.length < 2) continue;
    const first = list[0], t = mainText(first);
    for (const p of list.slice(1)) if (mainText(p) === t) drop[routeKey({ path, auth: p.auth, role: p.role })] = `the same rendered main text as ${first.auth ? `[${first.role}]` : "signed out"} ${path}: checked once`;
  }
  const byTpl = new Map();
  for (const r of routes) {
    // with the repo's templates, one template whatever role opens it (the same page file renders it); without them, the
    // dynamic pattern or the path, per role
    const fam = familyOf(families, r);
    const tpl = fam ? fam.key : `${r.auth ? r.role || "user" : "public"} ${r.template || r.path}`;
    if (!byTpl.has(tpl)) byTpl.set(tpl, { key: tpl, sample: null, routes: [] });
    byTpl.get(tpl).routes.push(routeKey(r));
  }
  const midRoutes = [];
  for (const g of byTpl.values()) {
    // the sample is a route that is checked at all (not a role duplicate dropped above)
    g.sample = g.routes.find((k) => !drop[k]) || g.routes[0];
    midRoutes.push(g.sample);
  }
  // the home page always
  const home = routes.find((r) => r.path === "/" && !r.auth);
  if (home && !midRoutes.includes(routeKey(home))) midRoutes.unshift(routeKey(home));
  return { mid: MID, midRoutes, drop, of: routes.length, templates: [...byTpl.values()], source: families?.size ? "repo" : "paths" };
}

/** "768 on 7 of 52 route(s), one per page template: / · /features (+7 like it) · …" — the honest list for the summary. */
export function describeFastPlan(plan) {
  const name = (k) => k.replace(/^(public|user|[\w-]+) /, (m, r) => (r === "public" ? "" : `[${r}] `));
  const parts = (plan.templates || []).map((t) => `${name(t.sample)}${t.routes.length > 1 ? ` (+${t.routes.length - 1} like it)` : ""}`);
  return `768 on ${plan.midRoutes.length} of ${plan.of} route(s), one per page template${plan.source === "repo" ? " (layout + page frame, from the repo)" : " (no repo: one per route pattern)"}: ${parts.join(" · ")}`;
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
  if (project === p.mid || project.startsWith(`${p.mid}-`)) if (!p.midRoutes.includes(k)) {
    const t = (p.templates || []).find((x) => x.routes.includes(k));
    return `--fast: 768 runs on one route per page template (${p.midRoutes.length} of ${p.of})${t ? `; this page's template is checked on ${t.sample.replace(/^(public|user|[\w-]+) /, "")}` : ""} [by design scope]`;
  }
  return null;
}
