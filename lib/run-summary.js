// The end of every `babysitter e2e`: what ran, what did NOT run (suites, viewports, languages, routes, roles, states),
// what failed by page, and the exact command that re-checks only the failures. Praxis (2026-10): a run with
// `--only ui --project=mobile-390 --project=desktop-1440` passed as "0 failed" while acceptance, two viewports, two
// languages and every dynamic route had never been opened — nothing on screen said so.
// Also writes .babysitter/findings.json: one entry per failed test with its route, role, locale and items — read by
// the Stop hook (findings on changed routes block "done") and by `babysitter fix-plan`.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expand, cleanError } from "./express-results.js";
import { routeKey } from "./route-selection.js";
import { classifySkip, parseNote, approvals, approvalFor } from "./skip-kinds.js";

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

/** A test that failed only because its page could not be opened (see playwright/checks.js gotoStable / NAV_FLAKE). */
export const NAV_FLAKE_RE = /navigation flake:|chrome-error:\/\/chromewebdata|is interrupted by another navigation to "chrome-error|net::ERR_(NETWORK_CHANGED|CONNECTION_(RESET|CLOSED|REFUSED|TIMED_OUT)|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|HTTP2_PROTOCOL_ERROR|EMPTY_RESPONSE|ADDRESS_UNREACHABLE)/;
export const isNavFlake = (error = "") => NAV_FLAKE_RE.test(String(error));
const TIMEOUT_RE = /^(?:Error: )?(?:Test timeout of \d+ms exceeded(?: while [^.]*)?\.?|Test finished within timeout of \d+ms, but tearing down "[^"]*" ran out of time\.?|.*Target page, context or browser has been closed.*|Worker teardown timeout of \d+ms exceeded.*)$/;
/** A failure that is only the test's time running out (Playwright "timedOut", nothing else asserted). */
export function isTimeoutOnly(r) {
  const lines = String(r.error || "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines.filter((l) => !/^at |^\d+ \||^>|^\||^Call log:|^- |^waiting for|^\^/.test(l));
  if (r.status === "timedOut") return first.every((l) => TIMEOUT_RE.test(l) || /^(?:Error: )?(?:page|locator)\.[\w.]+: (?:Test ended|Target page, context or browser has been closed)/.test(l));
  return first.length > 0 && first.every((l) => TIMEOUT_RE.test(l));
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

/** Flat list of test results from a Playwright JSON report (an express page test counts as one result per check). */
export const results = (report) => resultsWithExpress(report).list;
/** results() plus what the express page tests report about themselves (null for a normal run). */
export function resultsWithExpress(report) {
  const list = [];
  const walk = (s, path) => {
    for (const x of s.suites || []) walk(x, [...path, x.title]);
    for (const sp of s.specs || []) for (const t of sp.tests || []) {
      const last = (t.results || []).at(-1) || {};
      const errors = (last.errors || []).map((e) => e.message || "");
      list.push({ path: [...path, sp.title], title: sp.title, file: sp.file || path[0], project: t.projectName, status: last.status || t.status || "skipped", outcome: t.status, error: errors.join("\n") || last.error?.message || "", errors: errors.length ? errors : last.error?.message ? [last.error.message] : [], annotations: [...(t.annotations || []), ...(last.annotations || [])], attachments: last.attachments || [] });
    }
  };
  for (const s of report?.suites || []) walk(s, [s.title]);
  return expand(list);
}

/**
 * @param {{ root: string, only?: string|null, args?: string[], cfg?: any, configured?: { viewports: string[] }, rerun: string }} o
 * @returns {{ text: string, failed: any[], findings: any[] }}
 */
export function summarize({ root, only = null, args = [], cfg = {}, configured = { viewports: [] }, rerun, lastFailed = false, selection = null }) {
  const dir = join(root, ".babysitter");
  const report = readJson(join(dir, "report.json"));
  const crawl = readJson(join(dir, "crawl.json")) || {};
  const locales = readJson(join(dir, "locales.json"));
  const prevFindings = selection && !selection.all ? readJson(join(dir, "findings.json")) : null;
  const { list: rs, express } = resultsWithExpress(report);
  const lines = [];
  const bar = "━".repeat(64);
  lines.push(bar, "Claude's Babysitter — run summary", bar);
  if (!report) { lines.push("No report (.babysitter/report.json) — the run did not finish."); return { text: lines.join("\n"), failed: [], findings: [] }; }
  const failedAll = rs.filter((r) => r.status === "failed" || r.status === "timedOut" || r.status === "interrupted");
  // a page the browser could not open (chrome-error://, "interrupted by another navigation", net::ERR_CONNECTION_*,
  // after gotoStable's retries) is a flake of the network, not a finding: listed on its own, kept out of findings.json
  // (parallel /refund: D3 and 3.8 failed, passed on rerun)
  const flakes = failedAll.filter((r) => isNavFlake(r.error));
  // 5.5.0 (Kindred C2 @1440, issue #4): a test that ran out of time measured nothing — "not tested (time budget)",
  // listed on its own and kept out of findings.json / fix-plan; a timeout that also carries a real failure stays one
  const timeouts = failedAll.filter((r) => !flakes.includes(r) && isTimeoutOnly(r));
  const failed = failedAll.filter((r) => !flakes.includes(r) && !timeouts.includes(r));
  const passed = rs.filter((r) => r.status === "passed");
  const skipped = rs.filter((r) => r.status === "skipped");
  lines.push(`Tests: ✓ ${passed.length} passed   ✗ ${failed.length} failed   ↷ ${skipped.length} skipped${flakes.length ? `   ~ ${flakes.length} navigation flake(s)` : ""}`);
  if (express) {
    lines.push(`Express:   ${express.rules} check results from ${express.pages} page test(s), ${express.loads} page load(s)${express.cached ? `, ${express.cached} cached (unchanged render)` : ""}${express.own ? `, ${express.own} on their own fresh page` : ""} — every check is counted above as if it had its own test`);
    for (const b of express.broken) lines.push(`  ✗ express page test stopped before it reported its checks: ${b.path.slice(1, -1).join(" › ")} @ ${b.project} — its checks did NOT run (re-run without --express to see them one by one)`);
  }
  if (selection && !selection.all) lines.push(`Changed:   ${selection.routes.length}${selection.of ? ` of ${selection.of}` : ""} route(s) reached by the change${selection.since ? ` since ${selection.since}` : ""} were checked page by page; the others were not opened — their findings of the last run are kept in findings.json (marked "carried")`);
  if (lastFailed) lines.push("Re-check of the last run's failures (--last-failed): only those tests ran — run the full `e2e` once before reporting done.");
  // suites
  const suiteOf = (r) => (r.project === "product" ? "product" : parseTitle(r.path).suite);
  const ran = new Set(rs.filter((r) => r.status !== "skipped").map(suiteOf));
  const has = (spec) => rs.some((r) => new RegExp(spec.replace(".", "\\.")).test(r.path[0] || "")) || existsSync(join(TOOL, `playwright/${spec}.ts`));
  const all = ["ui", ...["layout", "forms"].filter((x) => has(`${x}.spec`)), "acceptance", "states/locales", ...(rs.some((r) => /content\.spec/.test(r.path[0] || "")) || existsSync(join(TOOL, "playwright/content.spec.js")) ? ["content"] : []), ...(rs.some((r) => r.project === "product") || existsSync(join(root, cfg.e2eDir || "e2e")) ? ["product"] : [])];
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
  // 5.5.0 (Kindred, issue #4): a configured role that did not sign in makes the run partial, and the run fails
  const rolesNotChecked = (crawl.roles || []).filter((r) => !r.ok);
  for (const r of rolesNotChecked) lines.push(`  ✗ role "${r.name}" NOT CHECKED: ${r.why}`);
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
  // 5.7.0: every skip is reported by its kind (lib/skip-kinds.js) — by design, switched off, setup missing, or decided
  // by Babysitter itself; before, only the switched-off ones were printed and a run whose rules were decided not to
  // apply still ended "Clean."
  const sk = skipReport(rs, skipped, cfg, crawl);
  if (sk.scope) lines.push(`By design: ${sk.scope} test(s) skipped — the rule runs at chosen widths / once per run (not a gap)`);
  if (sk.config.length) { lines.push("Switched off in babysitter.config.json:"); for (const g of sk.config) lines.push(`  · ${g.legacy ? g.reason : `${g.rule}: ${g.reason.replace(new RegExp(`^${esc(g.rule)} `), "")}`} (${g.n})`); }
  if (sk.setupMissing.length) {
    lines.push(`Setup missing — the run is PARTIAL (${sk.setupMissing.length}): these rules did not run; fix the setup and run again:`);
    for (const g of sk.setupMissing) lines.push(`  ✗ ${g.rule}: ${g.reason} (${g.n} test(s)${g.required ? "; babysitter.config.json declares it — the run fails" : ""})`);
  }
  if (sk.decisions.length) {
    lines.push(`Babysitter decided not to check (${sk.decisions.length}) — a rule it has, judged not to apply here; check by hand, or approve it in babysitter.config.json → acceptance.notApplicable { "<rule>": "<why>" }:`);
    // every one, never capped: grouped by rule and reason, so one decision on 40 pages is one line
    for (const g of sk.decisions) lines.push(`  ? ${g.rule}${g.skipped ? "" : " (ran, nothing judged)"}: ${g.reason} — ${where(g)}`);
  }
  if (sk.approved.length) {
    lines.push(`Not applicable (owner-approved) (${sk.approved.length}):`);
    for (const g of sk.approved.slice(0, 30)) lines.push(`  · ${g.rule}: ${g.reason} — approved: ${g.approved} — ${where(g)}`);
  }
  if (sk.product) lines.push(`Skipped by the product's own e2e: ${sk.product}`);
  if (sk.needsHuman.length) {
    lines.push(`Needs a human (${sk.needsHuman.length}) — measured as "check by eye" / "not checked" / "could not verify", never a failure:`);
    for (const h of sk.needsHuman.slice(0, 40)) lines.push(`  ◎ ${h.route || "site-wide"} ${h.rule} @ ${h.project}: ${h.text}`);
    if (sk.needsHuman.length > 40) lines.push(`  ◎ … ${sk.needsHuman.length - 40} more (findings.json → needsHuman)`);
  }
  // failures by page
  // the error is the check's message (the code frame and stack of the spec around it are left out: they differ between a
  // test of its own and an express page test, and fix-plan reads the message)
  const findings = failed.map((r) => { const t = { ...parseTitle(r.path), suite: suiteOf(r) }; return { ...t, test: r.title, project: r.project, file: r.file, status: r.status, items: bullets(r.error), error: (r.errors?.length ? r.errors : [r.error]).map(cleanError).join("\n").split("\n").slice(0, 12).join("\n") }; });
  // --changed / --since: the routes the change does not reach were not opened — their findings of the last run stand
  const carried = [];
  if (prevFindings && selection?.routes) {
    const sel = new Set(selection.routes);
    for (const f of prevFindings.findings || []) {
      if (!f.route) continue;
      if (sel.has(routeKey({ path: f.route, auth: f.auth, role: f.role === "user" ? null : f.role }))) continue;
      carried.push({ ...f, carried: f.carried || prevFindings.at || true });
    }
  }
  if (carried.length) {
    lines.push(`Carried from the last run, routes not opened (${carried.length}) — still open, not re-checked by this run:`);
    for (const f of carried.slice(0, 20)) lines.push(`  ↺ ${f.route || "site-wide"}${f.auth ? ` [${f.role}]` : ""} ${String(f.test || "").split(" [")[0].slice(0, 70)} @ ${f.project}`);
    if (carried.length > 20) lines.push(`  ↺ … ${carried.length - 20} more (findings.json)`);
  }
  mkdirSync(dir, { recursive: true });
  // decisions / setupMissing / needsHuman: what did not run or was not judged, for fix-plan, the hooks and the Stop hook
  const flat = (list) => list.map(({ items, ...g }) => ({ ...g, where: items }));
  writeFileSync(join(dir, "findings.json"), JSON.stringify({ at: new Date().toISOString(), base: crawl.base || cfg.baseURL || null, ...(express ? { mode: "express" } : {}), ...(selection && !selection.all ? { selection: { routes: selection.routes.length, of: selection.of ?? null, since: selection.since ?? null } } : {}), findings: [...findings, ...carried], decisions: flat(sk.decisions), approved: flat(sk.approved), setupMissing: flat(sk.setupMissing), needsHuman: sk.needsHuman, carried: carried.map((f) => ({ route: f.route, auth: f.auth, role: f.role, test: f.test, project: f.project, at: f.carried })) }, null, 2));
  if (express) writeExpressState(dir, rs, express, report);
  if (failed.length) {
    const byRoute = new Map();
    for (const f of findings) { const k = `${f.route || "site-wide"}${f.auth ? ` [${f.role}]` : ""}`; if (!byRoute.has(k)) byRoute.set(k, []); byRoute.get(k).push(f); }
    lines.push(`Failed (${failed.length}) by page:`);
    for (const [k, list] of byRoute) {
      lines.push(`  ${k}`);
      for (const f of list) lines.push(`    ✗ ${f.test.split(" [")[0].slice(0, 70)}${f.locale ? ` [${f.locale}]` : ""} @ ${f.project}${f.items.length ? ` — ${f.items.length} item(s): ${f.items[0].what.slice(0, 90)}` : ""}`);
    }
    lines.push("", "These are blocking: fix every one (babysitter fix-plan lists them with the files to change), then re-check only what failed:", `  ${rerun}`);
  }
  if (timeouts.length) {
    lines.push(`Not tested — time budget (${timeouts.length}): the test ran out of time before it measured anything; not a finding, re-run it (more time: --timeout=…):`);
    for (const r of timeouts.slice(0, 12)) { const t = parseTitle(r.path); lines.push(`  ⏱ ${t.route || "site-wide"} ${r.title.split(" [")[0].slice(0, 60)} @ ${r.project}`); }
    if (timeouts.length > 12) lines.push(`  ⏱ … ${timeouts.length - 12} more`);
  }
  if (flakes.length) {
    lines.push(`Navigation flakes (${flakes.length}) — the page could not be opened (network / browser), not a defect; re-run them:`);
    for (const r of flakes.slice(0, 12)) { const t = parseTitle(r.path); lines.push(`  ~ ${t.route || "site-wide"} ${r.title.split(" [")[0].slice(0, 60)} @ ${r.project}`); }
    if (flakes.length > 12) lines.push(`  ~ … ${flakes.length - 12} more`);
    lines.push(`  ${rerun}`);
  }
  if (rolesNotChecked.length) lines.push("", `SIGNED-IN PAGES NOT CHECKED for ${rolesNotChecked.map((r) => `"${r.name}"`).join(", ")} — the run is partial and fails (exit 1) until every configured role signs in.`);
  const setupRequired = sk.setupMissing.filter((g) => g.required);
  if (setupRequired.length && !rolesNotChecked.length) lines.push("", `SETUP MISSING for what babysitter.config.json declares (${setupRequired.map((g) => g.rule).join(", ")}) — the run is partial and fails (exit 1) until it is in place.`);
  if (!failed.length && !rolesNotChecked.length) {
    if (notRun.length || missingVp.length) lines.push("", "No failures in what ran — but the run above was partial; it is not a clean bill of health.");
    else if (sk.setupMissing.length) lines.push("", `No failures in what ran — but ${sk.setupMissing.length} rule(s) did not run for missing setup (listed above); the run is partial, not a clean bill of health.`);
    else if (flakes.length || timeouts.length) lines.push("", `No failures — but ${flakes.length + timeouts.length} test(s) could not open their page or ran out of time: re-run them (above) before calling it clean.`);
    else if (sk.decisions.length) lines.push("", `No failures in what ran — ${sk.decisions.length} rule(s) were decided not to apply (listed above); not a clean bill of health. Check them by hand, or approve each in babysitter.config.json → acceptance.notApplicable.`);
    // 5.6.3: --changed opened only the routes the change reaches — the last run's findings on the others still stand
    else if (carried.length) lines.push("", `Clean for this change; ${carried.length} finding(s) elsewhere on the site (routes not opened, from the last run — not blocking; listed above): see \`fix-plan\`, or run \`e2e\` without --changed.`);
    else lines.push("", "Clean.");
    if ((notRun.length || missingVp.length || sk.setupMissing.length || flakes.length || timeouts.length || sk.decisions.length) && carried.length) lines.push(`Also: ${carried.length} finding(s) elsewhere on the site (routes not opened, from the last run — not blocking): see \`fix-plan\`.`);
  }
  lines.push(bar);
  return { text: lines.join("\n"), failed, findings, carried, express, rolesNotChecked: rolesNotChecked.map((r) => r.name), timeouts: timeouts.length, decisions: sk.decisions, approved: sk.approved, setupMissing: sk.setupMissing, setupRequired: setupRequired.map((g) => g.rule), needsHuman: sk.needsHuman };
}

const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "/pricing, /plans [signed-in: buyer] @ desktop-1440, mobile-390" — the pages of one grouped skip or decision. */
function where(g) {
  const pages = [...new Set(g.items.map((i) => `${i.route || "site-wide"}${i.auth ? ` [signed-in${i.role && i.role !== "user" ? `: ${i.role}` : ""}]` : ""}`))];
  const projects = [...new Set(g.items.map((i) => i.project).filter(Boolean))];
  return `${pages.slice(0, 6).join(", ")}${pages.length > 6 ? `, … ${pages.length - 6} more` : ""}${projects.length ? ` @ ${projects.join(", ")}` : ""}`;
}
const NEEDS_HUMAN = new Set(["check by eye", "not checked", "could not verify"]);
/** Login / role storage / credentials missing while babysitter.config.json declares them: the run fails. */
const requiredSetup = (reason, cfg = {}, crawl = {}) => !!(cfg.login || (cfg.roles || []).length || (crawl.roles || []).length) && /sign|log ?in|LOGIN_|storage|credential|test account|role/i.test(reason);

/**
 * Every skipped test and every check that ran without judging (a "decision" annotation), grouped by kind, rule and
 * reason, with the pages each applies to; the owner's approvals (acceptance.notApplicable) move a decision to
 * `approved`. "check by eye" / "not checked" / "could not verify" notes are `needsHuman`.
 */
export function skipReport(rs, skipped, cfg = {}, crawl = {}) {
  const ok = approvals(cfg);
  const groups = new Map();
  const add = (kind, rule, reason, r, extra = {}) => {
    const t = parseTitle(r.path);
    const k = `${kind}|${rule}|${reason}`;
    if (!groups.has(k)) groups.set(k, { kind, rule, reason, n: 0, items: [], ...extra });
    const g = groups.get(k);
    g.n++;
    if (!g.items.some((i) => i.route === t.route && i.role === t.role && i.project === r.project)) g.items.push({ route: t.route, auth: t.auth, role: t.role, project: r.project, test: r.title });
  };
  for (const r of skipped) {
    const c = classifySkip(r);
    add(c.kind, c.rule, c.reason, r, { skipped: true, ...(c.legacy ? { legacy: true } : {}) });
  }
  const needsHuman = [];
  for (const r of rs) for (const a of r.annotations || []) {
    if (a.type === "decision" && a.description) { const d = parseNote(a.description, r.title); add("decision", d.rule, d.reason, r, { skipped: false }); }
    if (NEEDS_HUMAN.has(a.type) && a.description) {
      const t = parseTitle(r.path);
      const text = String(a.description).replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join(" · ").slice(0, 220);
      if (!needsHuman.some((h) => h.text === text && h.route === t.route && h.project === r.project)) needsHuman.push({ kind: a.type, rule: parseNote("", r.title).rule, route: t.route, auth: t.auth, role: t.role, project: r.project, test: r.title, text });
    }
  }
  const all = [...groups.values()];
  const decisions = [], approved = [];
  for (const g of all.filter((x) => x.kind === "decision")) {
    // approved for every page it is on: a rule-wide approval, or one per route
    const per = g.items.map((i) => approvalFor(ok, g.rule, i.route));
    if (per.every((x) => x != null)) approved.push({ ...g, approved: per[0] });
    else decisions.push(g);
  }
  return {
    scope: all.filter((x) => x.kind === "scope").reduce((n, g) => n + g.n, 0),
    product: all.filter((x) => x.kind === "product").reduce((n, g) => n + g.n, 0),
    config: all.filter((x) => x.kind === "config"),
    setupMissing: all.filter((x) => x.kind === "setup").map((g) => ({ ...g, required: requiredSetup(g.reason, cfg, crawl) })),
    decisions,
    approved,
    needsHuman,
  };
}

/**
 * After an express run: .babysitter/express-profile.json (which checks left the page changed, which needed a page of
 * their own — the next run orders them last / gives them their own page at once) and .babysitter/express-failed.json
 * (the checks that failed on each page: `--last-failed` re-runs those, not every check of the page).
 */
function writeExpressState(dir, rs, express, report) {
  try {
    const f = join(dir, "express-profile.json");
    const prev = readJson(f)?.rules || {};
    const agg = {};
    for (const p of express.profile) {
      const k = `${p.file}|${p.title}`;
      const a = (agg[k] ??= { n: 0, dirty: 0, own: false });
      a.n++;
      if (p.dirty) a.dirty++;
      if (p.own) a.own = true;
    }
    const rules = { ...prev };
    for (const [k, a] of Object.entries(agg)) rules[k] = { dirty: a.dirty / a.n, own: a.own || !!prev[k]?.own };
    writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), rules }, null, 2));
  } catch { }
  try {
    const failed = {};
    for (const r of rs) {
      if (!r.express || !(r.status === "failed" || r.status === "timedOut" || r.status === "interrupted")) continue;
      (failed[r.express.container] ??= []).push(r.title);
    }
    writeFileSync(join(dir, "express-failed.json"), JSON.stringify(failed, null, 2));
  } catch { }
  void report;
}
