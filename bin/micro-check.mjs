#!/usr/bin/env node
/**
 * Micro-run of the rendered checks against a running dev server, for the routes touched by the change.
 *   micro-check --repo . [--url http://localhost:3000] [--routes /,/pricing] [--format agent|json]
 * Exit 0 = clean or skipped (no server), 1 = problems. Used by the Stop hook after the static check.
 * Checks (fast subset of the Playwright suite):
 *   • text contrast measured in the rendered DOM (alpha blended, lab()/oklch() resolved)      [6.4]
 *   • cards in one flex/grid row: same top (y) and same height; CTAs/prices aligned          [2.6]
 *   • no horizontal overflow at 390px                                                        [2.1]
 *   • tables keep every column visible at 390px (stacked rows, no sideways scroll)          [2.3]
 *   • fields/selects visible at rest: border ≥ 3:1 or a distinct fill                       [1.9]
 *   • no native select/date/file/checkbox/radio in the rendered page                        [1.1]
 *   • DOM sniper: no [style] attribute with anything but CSS custom properties (--x)         [6.5]
 *   • every dropdown / menu / popover / dialog / accordion opens and closes with motion      [6.12]
 */
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import * as c from "../playwright/checks.js";
import * as RM from "../lib/route-map.js";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repo = resolve(opt("repo") || ".");
const format = opt("format") || "agent";
const cfgPath = join(repo, "babysitter.config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
const url = opt("url") || process.env.BABYSITTER_DEV_URL || cfg.devServer;
const out = (s) => process.stdout.write(s + "\n");
if (!url) { if (format === "json") out("[]"); process.exit(0); }

// optional step: skip silently when nothing is listening
// (a dev server compiling its first page can take many seconds: wait for it rather than call the page clean).
// Asked for explicit routes and nothing answers → that is a failure (exit 2), never an empty "clean" result.
{
  let up = false;
  for (const ms of [1500, 30000, 60000]) { try { await fetch(url, { signal: AbortSignal.timeout(ms) }); up = true; break; } catch {} }
  if (!up) {
    if (opt("routes")) { process.stderr.write(`micro-check: no dev server answered at ${url} — the rendered check did not run\n`); process.exit(2); }
    if (format !== "json") out(`micro-check: no dev server at ${url} — skipped`); else out("[]"); process.exit(0);
  }
}

/**
 * Changed files → the pages they reach (a component is followed up the import graph to every page that
 * renders it) → URLs (dynamic segments from sampleParams, then the crawl). Pages that cannot be opened are
 * returned in `unreached` and reported: a page nobody looked at is not a clean page.
 */
function routesFromChanges() {
  if (opt("routes")) return { routes: opt("routes").split(",").map((s) => s.trim()).filter(Boolean), unreached: [] };
  const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
  const changed = [...new Set([git("diff --name-only HEAD"), git("ls-files --others --exclude-standard")].join("\n").split("\n").filter(Boolean))];
  const uiChanged = changed.some((f) => /\.(jsx|tsx|s?css)$/.test(f));
  if (!uiChanged) return { routes: [], unreached: [] };
  const all = git("ls-files --cached --others --exclude-standard").split("\n").filter(Boolean);
  const { templates, layoutWide } = RM.pagesReached(repo, changed, all);
  const crawled = RM.crawledRoutes(repo);
  const routes = [], unreached = [];
  for (const t of templates) {
    const r = RM.concreteRoute(t, { sampleParams: cfg.sampleParams || {}, crawled });
    if (r) routes.push(r); else unreached.push(t);
  }
  // a layout, the theme or a stylesheet changed: every page is touched, open the configured ones
  if (layoutWide || (!templates.length && changed.some((f) => /\.s?css$/.test(f))) || (!templates.length && !unreached.length)) routes.push(...(cfg.routes || ["/"]).slice(0, 3));
  return { routes: [...new Set(routes)].slice(0, 8), unreached };
}

// DOM sniper settings (babysitter.config.json → domSniper): { "allowProps": [...], "skip": ["css selector"], "strict": false }
// strict: true drops the built-in framework/motion exceptions (checks/SNIPER_SKIP, SNIPER_MOTION_PROPS)
const sniper = { allowProps: [], skip: [], strict: false, ...(cfg.domSniper || {}) };
const { routes, unreached } = routesFromChanges();
if (!routes.length && !unreached.length) { if (format === "json") out("[]"); process.exit(0); }
const storage = join(repo, ".babysitter/storage.json");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const problems = [];
// a changed page that cannot be opened was not checked — say so, with the fix
for (const t of unreached) {
  const seg = (t.match(/\[\[?(?:\.\.\.)?(\w+)\]?\]/) || [])[1] || "param";
  problems.push({ route: t, viewport: "-", check: "not rendered [coverage]", what: `this change reaches ${t}, but no URL is known for [${seg}] — the page was not checked. Add "sampleParams": { "${seg}": "<a real value>" } to babysitter.config.json (or run \`babysitter prepare\` so the crawl knows one)`, where: t });
}
const VIEWPORTS = [{ name: "390", width: 390, height: 844, mobile: true }, { name: "1280", width: 1280, height: 800, mobile: false }];
for (const route of routes) {
  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, isMobile: v.mobile, storageState: existsSync(storage) ? storage : undefined, baseURL: url });
    const page = await ctx.newPage();
    await c.install(page);
    const res = await page.goto(route, { waitUntil: "load", timeout: 30000 }).catch((e) => ({ err: e.message }));
    if (res && res.err) { problems.push({ route, viewport: v.name, check: "load", what: res.err.split("\n")[0] }); await ctx.close(); continue; }
    // an error page is not the page: checking it would pass the real one unseen
    if (res && typeof res.status === "function" && res.status() >= 400) { problems.push({ route, viewport: v.name, check: "load", what: `${route} answered ${res.status()} — the page itself was not checked`, where: route }); await ctx.close(); continue; }
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (await c.applyColorScheme(page)) await page.waitForTimeout(300);
    await c.revealLazy(page);
    const { hard } = await c.illegibleText(page, !!(cfg.allow && cfg.allow.lightWeights));
    for (const o of hard.filter((x) => /contrast/.test(x.what))) problems.push({ route, viewport: v.name, check: "contrast [6.4]", ...o });
    for (const o of await c.rowAlignment(page)) problems.push({ route, viewport: v.name, check: "row alignment [2.6]", ...o });
    if (v.mobile) for (const o of await c.horizontalOverflow(page)) problems.push({ route, viewport: v.name, check: "horizontal overflow [2.1]", ...o });
    if (v.mobile) for (const o of await c.tableClipping(page)) problems.push({ route, viewport: v.name, check: "mobile table [2.3]", ...o });
    for (const o of await c.inputVisibility(page)) problems.push({ route, viewport: v.name, check: "control boundary [1.9]", ...o });
    if (!v.mobile) for (const o of await c.nativeControls(page)) problems.push({ route, viewport: v.name, check: "native control [1.1]", ...o });
    if (!v.mobile) for (const o of await c.nativeSkin(page)) problems.push({ route, viewport: v.name, check: "native parts [1.19]", ...o });
    if (!v.mobile) {
      // one shape language: the configured design.shape, or this page's own majority when it has enough pieces
      const shapes = await c.collectShapes(page, route);
      const shape = c.siteShape(shapes.length >= 8 || cfg.design?.shape ? shapes : [], cfg.design?.shape);
      for (const o of c.shapeOutliers(shapes, shape)) problems.push({ route, viewport: v.name, check: "shape [1.17]", ...o });
      if (!(cfg.allow && cfg.allow.palette)) { const pal = await c.offPalette(page); for (const o of pal.offenders) problems.push({ route, viewport: v.name, check: "palette [1.18]", ...o }); }
    }
    // DOM sniper: rendered style attributes may only carry CSS custom properties
    if (!v.mobile) for (const o of await c.inlineStyles(page, sniper.allowProps, sniper.skip, sniper.strict)) problems.push({ route, viewport: v.name, check: "inline style [DOM]", ...o });
    // last: it opens and closes things. Every dropdown / menu / popover / dialog must move both ways — measured
    for (const o of await c.overlayMotion(page)) problems.push({ route, viewport: v.name, check: "overlay motion [6.12]", ...o });
    await ctx.close();
  }
}
await browser.close();

if (format === "json") out(JSON.stringify(problems, null, 2));
else if (!problems.length) out(`micro-check: clean (${routes.join(", ")} at 390 and 1280)`);
else {
  out(`Claude's Babysitter (rendered check on ${url}): ${problems.length} problem(s) on the pages you changed. Fix them, then finish.`);
  for (const p of problems.filter((x) => x.check === "inline style [DOM]").slice(0, 15))
    out(`❌ [Playwright] Нарушение архитектуры! Обнаружены хардкодные inline-стили в DOM: <${p.tag}> содержит запрещенные свойства ${p.props.join(", ")} (${p.route} — ${p.where})`);
  for (const p of problems.filter((x) => x.check !== "inline style [DOM]").slice(0, 25)) out(`  ${p.route} @${p.viewport}px  ${p.check}: ${p.what} — ${p.where || ""}`);
  if (problems.length > 25) out(`  … and ${problems.length - 25} more`);
}
process.exitCode = problems.length ? 1 : 0;
