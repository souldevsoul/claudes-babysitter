// The end of every `babysitter e2e`: what ran, what did NOT run (suites, viewports, languages, routes, roles, states),
// what failed by page, and the exact command that re-checks only the failures. Praxis (2026-10): a run with
// `--only ui --project=mobile-390 --project=desktop-1440` passed as "0 failed" while acceptance, two viewports, two
// languages and every dynamic route had never been opened — nothing on screen said so.
// Also writes .babysitter/findings.json: one entry per failed test with its route, role, locale and items — read by
// the Stop hook (findings on changed routes block "done") and by `babysitter fix-plan`.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

/** "acceptance [signed-in: specialist] /tasks/1" → { suite, route, role, auth } */
export function parseTitle(path) {
  const out = { suite: "ui", route: null, role: null, auth: false, locale: null };
  const file = path[0] || "";
  if (/acceptance\.spec/.test(file)) out.suite = "acceptance";
  else if (/content\.spec/.test(file)) out.suite = "content";
  else if (/run\.spec/.test(file)) out.suite = "states/locales";
  else if (/layout\.spec/.test(file)) out.suite = "layout";
  else if (/forms\.spec/.test(file)) out.suite = "forms";
  // other spec files next to the tool's are UI checks; layout and forms are named on their own so a run that left
  // one of them out says so; the product's own e2e is told by its Playwright project ("product"), see results()
  // describe titles of every spec: "/x", "[signed-in] /x", "acceptance [signed-in: role] /x", "forms /x", "/x layout",
  // "content [az] [signed-in] /x"; test titles may start "i18n [az]" / "states [kk]"
  for (const t of path.slice(1)) {
    const m = t.match(/(?:^|\s)(\[signed-in(?::\s*([\w-]+))?\]\s)?(\/[^\s]*)(?:\s|$)/);
    if (m && !out.route) { out.route = m[3]; out.auth = !!m[1]; out.role = m[2] || (out.auth ? "user" : null); }
    const l = t.match(/^(?:i18n|states|content) \[([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\]/);
    if (l) out.locale = l[1];
  }
  return out;
}

/** Bullet items of a failure message ("  • what — where"). */
export function bullets(message = "") {
  const out = [];
  for (const line of String(message).replace(/\u001b\[[0-9;]*m/g, "").split("\n")) {
    const m = line.match(/^(?:\s*Error:)?\s*•\s(.*)$/);
    if (!m) continue;
    const i = m[1].lastIndexOf(" — ");
    out.push(i > 0 ? { what: m[1].slice(0, i), where: m[1].slice(i + 3) } : { what: m[1], where: "" });
  }
  return out;
}

/** Flat list of test results from a Playwright JSON report. */
export function results(report) {
  const list = [];
  const walk = (s, path) => {
    for (const x of s.suites || []) walk(x, [...path, x.title]);
    for (const sp of s.specs || []) for (const t of sp.tests || []) {
      const last = (t.results || []).at(-1) || {};
      list.push({ path: [...path, sp.title], title: sp.title, file: sp.file || path[0], project: t.projectName, status: last.status || t.status || "skipped", outcome: t.status, error: (last.errors || []).map((e) => e.message || "").join("\n") || last.error?.message || "", annotations: [...(t.annotations || []), ...(last.annotations || [])] });
    }
  };
  for (const s of report?.suites || []) walk(s, [s.title]);
  return list;
}

/**
 * @param {{ root: string, only?: string|null, args?: string[], cfg?: any, configured?: { viewports: string[] }, rerun: string }} o
 * @returns {{ text: string, failed: any[], findings: any[] }}
 */
export function summarize({ root, only = null, args = [], cfg = {}, configured = { viewports: [] }, rerun, lastFailed = false }) {
  const dir = join(root, ".babysitter");
  const report = readJson(join(dir, "report.json"));
  const crawl = readJson(join(dir, "crawl.json")) || {};
  const locales = readJson(join(dir, "locales.json"));
  const rs = results(report);
  const lines = [];
  const bar = "━".repeat(64);
  lines.push(bar, "Claude's Babysitter — run summary", bar);
  if (!report) { lines.push("No report (.babysitter/report.json) — the run did not finish."); return { text: lines.join("\n"), failed: [], findings: [] }; }
  const failed = rs.filter((r) => r.status === "failed" || r.status === "timedOut" || r.status === "interrupted");
  const passed = rs.filter((r) => r.status === "passed");
  const skipped = rs.filter((r) => r.status === "skipped");
  lines.push(`Tests: ✓ ${passed.length} passed   ✗ ${failed.length} failed   ↷ ${skipped.length} skipped`);
  if (lastFailed) lines.push("Re-check of the last run's failures (--last-failed): only those tests ran — run the full `e2e` once before reporting done.");
  // suites
  const suiteOf = (r) => (r.project === "product" ? "product" : parseTitle(r.path).suite);
  const ran = new Set(rs.filter((r) => r.status !== "skipped").map(suiteOf));
  const has = (spec) => rs.some((r) => new RegExp(spec.replace(".", "\\.")).test(r.path[0] || "")) || existsSync(join(TOOL, `playwright/${spec}.ts`));
  const all = ["ui", ...["layout", "forms"].filter((x) => has(`${x}.spec`)), "acceptance", "states/locales", ...(rs.some((r) => /content\.spec/.test(r.path[0] || "")) || existsSync(join(TOOL, "playwright/content.spec.ts")) ? ["content"] : []), ...(rs.some((r) => r.project === "product") || existsSync(join(root, cfg.e2eDir || "e2e")) ? ["product"] : [])];
  const notRun = lastFailed ? [] : all.filter((s) => !ran.has(s));
  lines.push(`Suites:    ${all.map((s) => `${s} ${ran.has(s) ? "✓" : lastFailed ? "–" : "✗ NOT RUN"}`).join("   ")}`);
  // --only ui runs the UI, layout, forms and states/languages specs together
  const inOnly = (s) => only && (s === only || (only === "ui" && ["states/locales", "layout", "forms"].includes(s)));
  const byOnly = notRun.filter((s) => only && !inOnly(s)), empty = notRun.filter((s) => !only || inOnly(s));
  if (byOnly.length) lines.push(`  ⚠ NOT RUN: ${byOnly.join(", ")} (--only ${only}) — their checks did not look at this site. Run \`e2e\` without --only.`);
  if (empty.length) lines.push(`  ⚠ NO TEST RAN in: ${empty.join(", ")} — filtered out (--grep / --project / skip), or no routes / languages to check.`);
  // viewports
  const projects = [...new Set(rs.filter((r) => r.status !== "skipped").map((r) => r.project).filter(Boolean))];
  const missingVp = lastFailed ? [] : configured.viewports.filter((v) => !projects.some((p) => p === v || p.startsWith(`${v}-`)));
  lines.push(`Viewports: ${projects.filter((p) => p !== "product").join(", ") || "none"}${missingVp.length ? `   ⚠ NOT RUN: ${missingVp.join(", ")}${args.some((a) => a.startsWith("--project")) ? " (--project)" : ""}` : ""}`);
  // languages
  const locs = (locales?.locales || []);
  const narrowed = process.env.LOCALES ? ` (LOCALES=${process.env.LOCALES})` : "";
  const ranLocs = new Set(rs.filter((r) => r.status !== "skipped").map((r) => parseTitle(r.path).locale).filter(Boolean));
  if (!locales) lines.push("Languages: not detected (no .babysitter/locales.json — run prepare)");
  else if (locs.length < 2) lines.push(`Languages: ${locs.map((l) => l.code).join(", ") || "default only"} (${locales.note || "one language"})`);
  else {
    const notChecked = locs.filter((l) => !l.default && !ranLocs.has(l.code)).map((l) => `${l.code}${l.verified === false ? ` (could not be switched on: ${l.why})` : ""}`);
    lines.push(`Languages: ${locs.map((l) => `${l.code}${l.default ? " (default)" : ""}`).join(", ")}${narrowed}${notChecked.length ? `   ⚠ NOT CHECKED: ${notChecked.join("; ")}` : ""}`);
  }
  // routes and roles
  const routes = readJson(join(dir, "routes.json")) || [];
  const byRole = {};
  for (const r of routes) { const k = r.auth ? `signed-in as ${r.role || "user"}` : "public"; byRole[k] = (byRole[k] || 0) + 1; }
  lines.push(`Routes:    ${routes.length} (${Object.entries(byRole).map(([k, n]) => `${n} ${k}`).join(", ") || "none"})`);
  for (const r of crawl.roles || []) if (!r.ok) lines.push(`  ⚠ role "${r.name}" NOT CHECKED: ${r.why}`);
  if (!(crawl.roles || []).length && !routes.some((r) => r.auth)) lines.push("  ⚠ NO SIGNED-IN PAGES: set LOGIN_EMAIL / LOGIN_PASSWORD (or SESSION_COOKIES) and config.login — dashboards, settings and wallets were not checked");
  if ((crawl.missingDynamic || []).length) lines.push(`  ⚠ dynamic routes NOT REACHED (no page found to open): ${crawl.missingDynamic.join(", ")} — link one from a list page, or set sampleParams`);
  for (const c of crawl.capped || []) lines.push(`  ⚠ crawl cap: ${c}`);
  // what the checks themselves could not reach
  const notTested = [];
  for (const r of rs) for (const a of r.annotations) if (a.type === "not tested" && a.description) for (const l of a.description.split("\n")) if (l.trim() && !notTested.includes(l.trim())) notTested.push(l.trim());
  if (notTested.length) {
    lines.push(`Not tested inside pages (${notTested.length}):`);
    for (const l of notTested) lines.push(`  · ${l}`);
  }
  // skipped by design vs skipped by config
  const reasons = {};
  for (const r of skipped) { const a = r.annotations.find((x) => x.type === "skip"); const k = (a?.description || "skipped").split("\n")[0].slice(0, 110); reasons[k] = (reasons[k] || 0) + 1; }
  const cfgSkips = Object.entries(reasons).filter(([k]) => /switched off|babysitter\.config|allow\./.test(k));
  if (cfgSkips.length) { lines.push("Switched off in babysitter.config.json:"); for (const [k, n] of cfgSkips) lines.push(`  · ${k} (${n})`); }
  // failures by page
  const findings = failed.map((r) => { const t = { ...parseTitle(r.path), suite: suiteOf(r) }; return { ...t, test: r.title, project: r.project, file: r.file, status: r.status, items: bullets(r.error), error: r.error.replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 12).join("\n") }; });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "findings.json"), JSON.stringify({ at: new Date().toISOString(), base: crawl.base || cfg.baseURL || null, findings }, null, 2));
  if (failed.length) {
    const byRoute = new Map();
    for (const f of findings) { const k = `${f.route || "site-wide"}${f.auth ? ` [${f.role}]` : ""}`; if (!byRoute.has(k)) byRoute.set(k, []); byRoute.get(k).push(f); }
    lines.push(`Failed (${failed.length}) by page:`);
    for (const [k, list] of byRoute) {
      lines.push(`  ${k}`);
      for (const f of list) lines.push(`    ✗ ${f.test.split(" [")[0].slice(0, 70)}${f.locale ? ` [${f.locale}]` : ""} @ ${f.project}${f.items.length ? ` — ${f.items.length} item(s): ${f.items[0].what.slice(0, 90)}` : ""}`);
    }
    lines.push("", "These are blocking: fix every one (babysitter fix-plan lists them with the files to change), then re-check only what failed:", `  ${rerun}`);
  } else if (notRun.length || missingVp.length) lines.push("", "No failures in what ran — but the run above was partial; it is not a clean bill of health.");
  else lines.push("", "Clean.");
  lines.push(bar);
  return { text: lines.join("\n"), failed, findings };
}
