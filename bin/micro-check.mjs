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
 */
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import * as c from "../playwright/checks.ts";

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
try { await fetch(url, { signal: AbortSignal.timeout(1500) }); } catch { if (format !== "json") out(`micro-check: no dev server at ${url} — skipped`); else out("[]"); process.exit(0); }

/** Changed page files → routes (Next app router and pages router). */
function routesFromChanges() {
  if (opt("routes")) return opt("routes").split(",").map((s) => s.trim()).filter(Boolean);
  const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
  const changed = [...new Set([git("diff --name-only HEAD"), git("ls-files --others --exclude-standard")].join("\n").split("\n").filter(Boolean))];
  const sample = cfg.sampleParams || {};
  const routes = [];
  for (const f of changed) {
    let m = f.match(/(?:^|\/)app\/(.*?)\/?page\.(t|j)sx?$/) || f.match(/(?:^|\/)pages\/(.*?)\.(t|j)sx?$/);
    if (!m || /(^|\/)(api|_app|_document)(\/|$)/.test(m[1])) continue;
    let ok = true;
    const segs = m[1].split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@") && s !== "index").map((s) => {
      const d = s.match(/^\[\[?\.{0,3}(\w+)\]?\]$/);
      if (!d) return s;
      if (sample[d[1]] === undefined) { ok = false; return s; }
      return String(sample[d[1]]);
    });
    if (ok) routes.push("/" + segs.join("/"));
  }
  const uiChanged = changed.some((f) => /\.(jsx|tsx|s?css)$/.test(f));
  const list = routes.length ? routes : uiChanged ? (cfg.routes || ["/"]).slice(0, 3) : [];
  return [...new Set(list)].slice(0, 5);
}

// DOM sniper settings (babysitter.config.json → domSniper): { "allowProps": [...], "skip": ["css selector"], "strict": false }
// strict: true drops the built-in framework/motion exceptions (checks/SNIPER_SKIP, SNIPER_MOTION_PROPS)
const sniper = { allowProps: [], skip: [], strict: false, ...(cfg.domSniper || {}) };
const routes = routesFromChanges();
if (!routes.length) { if (format === "json") out("[]"); process.exit(0); }
const storage = join(repo, ".babysitter/storage.json");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const problems = [];
const VIEWPORTS = [{ name: "390", width: 390, height: 844, mobile: true }, { name: "1280", width: 1280, height: 800, mobile: false }];
for (const route of routes) {
  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, isMobile: v.mobile, storageState: existsSync(storage) ? storage : undefined, baseURL: url });
    const page = await ctx.newPage();
    await c.install(page);
    const res = await page.goto(route, { waitUntil: "load", timeout: 30000 }).catch((e) => ({ err: e.message }));
    if (res && res.err) { problems.push({ route, viewport: v.name, check: "load", what: res.err.split("\n")[0] }); await ctx.close(); continue; }
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (await c.applyColorScheme(page)) await page.waitForTimeout(300);
    const { hard } = await c.illegibleText(page, !!(cfg.allow && cfg.allow.lightWeights));
    for (const o of hard.filter((x) => /contrast/.test(x.what))) problems.push({ route, viewport: v.name, check: "contrast [6.4]", ...o });
    for (const o of await c.rowAlignment(page)) problems.push({ route, viewport: v.name, check: "row alignment [2.6]", ...o });
    if (v.mobile) for (const o of await c.horizontalOverflow(page)) problems.push({ route, viewport: v.name, check: "horizontal overflow [2.1]", ...o });
    if (v.mobile) for (const o of await c.tableClipping(page)) problems.push({ route, viewport: v.name, check: "mobile table [2.3]", ...o });
    for (const o of await c.inputVisibility(page)) problems.push({ route, viewport: v.name, check: "control boundary [1.9]", ...o });
    if (!v.mobile) for (const o of await c.nativeControls(page)) problems.push({ route, viewport: v.name, check: "native control [1.1]", ...o });
    // DOM sniper: rendered style attributes may only carry CSS custom properties
    if (!v.mobile) for (const o of await c.inlineStyles(page, sniper.allowProps, sniper.skip, sniper.strict)) problems.push({ route, viewport: v.name, check: "inline style [DOM]", ...o });
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
