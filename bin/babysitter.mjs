#!/usr/bin/env node
// babysitter <command> [...args]
//   init [repo] [--link|--vendor] [--ci] [--url https://preview] [--dry-run] [--no-install] [--force]
//   check [...]      → bin/ui-check.mjs
//   audit [repo]     → full audit summary (AST, CSS, contrast, components); ticks BABYSITTER-ADOPTION.md
//   audit --diff [base=origin/main] → CI gate: fail only on problems added since the branch left <base>
//                      (GitHub annotations + step summary under GitHub Actions)
//   install-hooks    → the git pre-commit gate, for package.json "prepare" (silent, CI-safe, never fails)
//   studio [start|review] → Babysitter Studio (visual review)
//   audit-components → the reuse/theme audit alone (bin/ui-audit.mjs)
//   enable-hooks     → adoption → strict: hooks start blocking (refuses until the audit is green; --force)
//   fingerprint [repo…] [--register]  → theme fingerprint + look-alike products from the registry
//   restore [repo]   → put AFTER back if a Studio Time Travel review was killed mid-way
//   propose start|save|list|drop → fixes prepared next to the original; Studio shows them and applies on Approve
//                      (start: baseline = the files now · save --title T --for REGEX [--id X] [--requires a,b]: the edits
//                      since start become a proposal and the files go back to the original; --kind code: invisible
//                      fix · auto --routes /,/x: applies the code-only ones if every page is pixel-identical)
//   micro-check      → rendered contrast / row / overflow check on a running dev server
//   prepare          → playwright/prepare.mjs (login + crawl)
//   test-ui [...]    → playwright test with the bundled config
//   content [repo] [--offline] → static copy lint: i18n files of every locale, JSX copy, email addresses (MX)
//   e2e [--skip-prepare] [--quick] [--only ui|acceptance|content|product] [--last-failed] [--express [--no-cache]]
//       [--changed | --since <ref>] [...playwright args]
//                    → prepare (login per role + crawl + languages) + the UI checks + states / languages / scroll
//                      (run.spec.js) + business acceptance (acceptance.spec.js) + the product's own e2e/*.spec.ts, in one
//                      Playwright run at 360/390/768/1280/1440 (--quick: 390 + 1440). --only is a partial run and says so.
//                      Ends with a summary of what did not run and the command that re-checks only the failures.
//                    --express: one page load per route × viewport × locale × role runs every check of it (same
//                      findings, see docs/express.md); a result cache reuses passes on an unchanged render (--no-cache).
//                    --changed / --since <ref>: only the routes the git change reaches through the import graph
//                      (global inputs → every route); the run prints which and why.
//   fix-plan [--format md|agent|json]  → the last run's findings grouped into a fix list with the files to change
//   misses [--project slug]… [--since ISO] [--findings findings.json]… [--dry-run]
//                    → the miss loop: people's Nexus cards since the last run → CAUGHT / MISSED / OUT OF SCOPE,
//                      misses/<slug>-<date>.md and the catch rate CAUGHT / (CAUGHT + MISSED) (NEXUS_URL, NEXUS_API_KEY)
//   update [repo] [--to vX.Y.Z] [--dry-run] [--no-install] [--brief]
//                    → re-vendor the latest release into the product (keeps babysitter.config.json and .babysitter/),
//                      print what changed since the old version, add the version check to the CI workflows
//   version-check    → the product's copy against the latest release: a minor behind warns, a major behind fails
//   doctor           → how the product is wired (hooks, CI, config) + the version check
//   after-merge      → the git post-merge / post-rewrite re-check: static check of what the merge changed, then the
//                      runtime checks on the routes it reached (when a dev server / preview answers)
import { spawnSync, spawn } from "node:child_process";
import { forward } from "../lib/forward.js";
import { dirname, join, relative } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
// the Playwright CLI next to Claude's Babysitter — the same @playwright/test copy the checks import
// (a bare `npx playwright` from the project could fetch a different version)
function playwright(args, env = process.env) {
  // the viewports this run selects (--project=mobile-390 --project desktop-1440): the specs pick the narrowest and the
  // widest of these, not of every configured viewport (5.5.0)
  const sel = [];
  for (let i = 0; i < args.length; i++) { const m = args[i].match(/^--project(?:=(.*))?$/); if (m) sel.push(...String(m[1] ?? args[i + 1] ?? "").split(",")); }
  if (sel.filter(Boolean).length && !sel.includes("product")) env = { ...env, BABYSITTER_PROJECTS: sel.filter(Boolean).join(",") };
  let cli;
  try { cli = createRequire(join(root, "package.json")).resolve("@playwright/test/cli"); }
  catch { console.error("babysitter: @playwright/test is not installed next to Claude's Babysitter (npm install)"); return 2; }
  return forward(process.execPath, [cli, "test", "-c", join(root, "playwright/playwright.config.js"), ...args], { stdio: "inherit", cwd: process.cwd(), env });
}
const node = (file, args) => process.exit(spawnSync(process.execPath, [join(root, file), ...args], { stdio: "inherit" }).status ?? 1);
switch (cmd) {
  case "init": node("bin/ui-init.mjs", rest); break;
  case "check": {
    // the static check, then one line on the version of the copy (a major behind the latest release fails the check;
    // BABYSITTER_NO_VERSION_CHECK=1 leaves it out — the editor hooks run ui-check directly and never ask the network)
    const st = spawnSync(process.execPath, [join(root, "bin/ui-check.mjs"), ...rest], { stdio: "inherit" }).status ?? 1;
    const machine = rest.some((a, i) => (a === "--format" && /^(json|agent)$/.test(rest[i + 1] || "")) || a === "--file");
    if (process.env.BABYSITTER_NO_VERSION_CHECK || machine) process.exit(st);
    const repoArg = rest.indexOf("--repo") >= 0 ? ["--repo", rest[rest.indexOf("--repo") + 1]] : [];
    const v = spawnSync(process.execPath, [join(root, "bin/version-check.mjs"), ...repoArg], { stdio: "inherit" }).status ?? 0;
    process.exit(st || v);
    break;
  }
  case "update": node("bin/update.mjs", rest); break;
  case "version-check": node("bin/version-check.mjs", rest); break;
  case "doctor": {
    const repo = rest.find((x) => !x.startsWith("-")) || process.cwd();
    const { wiringStatus } = await import("../lib/wiring.js");
    const w = wiringStatus(repo);
    console.log(`Claude's Babysitter — ${repo}`);
    for (const p of w.present) console.log(`  ✓ ${p}`);
    for (const m of w.missing) console.log(`  ✗ ${m.piece} — ${m.fix}`);
    const v = spawnSync(process.execPath, [join(root, "bin/version-check.mjs"), "--repo", repo], { stdio: "inherit" }).status ?? 0;
    process.exit(v);
    break;
  }
  case "content": node("bin/content-lint.mjs", rest); break;
  case "audit": {
    // audit --diff <base>: the CI gate — only problems this branch adds since it left <base> fail the run
    const i = rest.indexOf("--diff");
    if (i < 0) { node("bin/audit-summary.mjs", rest); break; }
    const base = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : "origin/main";
    const others = rest.filter((_, j) => j !== i && j !== i + 1);
    const git = (...a) => spawnSync("git", a, { encoding: "utf8" });
    if (git("rev-parse", "--verify", "--quiet", base).status !== 0) {
      console.error(`babysitter audit --diff: "${base}" is not known here. In CI check out with full history (actions/checkout fetch-depth: 0) or fetch the base branch.`);
      process.exit(2);
    }
    const mb = git("merge-base", "HEAD", base);
    const from = mb.status === 0 ? mb.stdout.trim() : base; // what the branch changed, not what the base gained since
    const format = others.includes("--format") ? [] : ["--format", process.env.GITHUB_ACTIONS ? "github" : "text"];
    node("bin/ui-check.mjs", ["--changed", from, ...format, ...others]);
    break;
  }
  case "install-hooks": node("bin/install-hooks.mjs", rest); break;
  case "studio": node("studio/bin/studio.mjs", rest); break;
  case "audit-components": node("bin/ui-audit.mjs", rest); break;
  case "enable-hooks": node("bin/enable-hooks.mjs", rest); break;
  case "fingerprint": node("bin/fingerprint.mjs", rest); break;
  case "restore": {
    const { recover } = await import("../lib/time-travel.js");
    const r = recover(rest.find((x) => !x.startsWith("-")) || process.cwd());
    console.log(!r ? "Nothing to restore." : r.busy ? `A Studio review (pid ${r.busy}) is still running — decide in the panel or stop it.` : `AFTER is back on disk${r.conflicts.length ? `; edits made during the review kept in ${r.conflicts.join(", ")}` : ""}.`);
    break;
  }
  case "propose": {
    const P = await import("../lib/proposals.js");
    const [sub, ...args] = rest;
    const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
    const repo = opt("repo") || process.cwd();
    try {
      if (sub === "start") { P.start(repo); console.log("Baseline set: the files as they are now are the original. Edit, then `babysitter propose save --title … --for …`."); }
      else if (sub === "save") {
        const p = P.save(repo, { title: opt("title"), for: opt("for") || "", id: opt("id"), requires: (opt("requires") || "").split(",").filter(Boolean), kind: opt("kind"), route: opt("route"), selector: opt("selector"), why: opt("why") });
        console.log(`Proposal "${p.id}" saved (${p.files.length} file(s)); the files are back to the original.`);
      } else if (sub === "list") {
        for (const p of P.list(repo)) console.log(`${p.status.padEnd(9)} ${p.id.padEnd(28)} ${p.title}${p.for ? `  [for /${p.for}/]` : ""}${p.comments?.length ? `\n          ↳ ${p.comments.at(-1).text}` : ""}`);
      } else if (sub === "auto") {
        // code-only fixes (save --kind code) go into the files without asking — but only when every checked page
        // renders pixel-identical with and without them; otherwise nothing is applied and the differences are listed
        const code = P.list(repo).filter((p) => p.kind === "code" && (p.status === "pending" || p.status === "revising"));
        if (!code.length) { console.log("No code-only fixes waiting."); break; }
        const routes = (opt("routes") || "/").split(",").filter(Boolean);
        const widths = (opt("widths") || "1280,390").split(",").map(Number).filter(Boolean);
        const before = P.commitWith(repo, []), after = P.commitWith(repo, code.map((p) => p.id));
        if (after.failed.length) { console.error(`These do not apply: ${after.failed.map((f) => `${f.id} (${f.error})`).join("; ")}`); process.exit(1); }
        console.log(`Checking ${code.length} code-only fix(es) on ${routes.length} page(s) × ${widths.join("/")}px: original vs with the fixes…`);
        const { pixelCheck } = await import("../studio/lib/verify.js");
        const diffs = await pixelCheck({ repo, before: before.sha, after: after.sha, routes, widths, log: (m) => console.log(m) });
        if (diffs.length) {
          console.error(`\n✗ Not applied: the page looks different with these fixes on ${diffs.length} page view(s). A code-only fix must not change what a person sees — make it pixel-identical, or save it as a visual proposal (Studio asks the reviewer).`);
          process.exit(1);
        }
        for (const p of code) { P.approve(repo, p.id); console.log(`✓ applied without asking (pixel-identical): ${p.id} — ${p.title}`); }
      } else if (sub === "edit") {
        const id = args.find((a) => !a.startsWith("--"));
        const p = P.edit(repo, id);
        console.log(`"${p.id}" is on disk now (${p.files.length} file(s)); edit, then \`babysitter propose save --id ${p.id}\`.`);
      } else if (sub === "drop") { P.drop(repo, args.find((a) => !a.startsWith("--"))); }
      else { console.error("usage: babysitter propose start | save --title T --for REGEX [--id X] [--requires a,b] [--kind code] [--route /x --selector css --why text] | edit <id> | auto --routes /,/x [--widths 1280,390] | list | drop <id>"); process.exit(2); }
    } catch (e) { console.error(`babysitter propose: ${e.message}`); process.exit(1); }
    break;
  }
  case "micro-check": node("bin/micro-check.mjs", rest); break;
  case "prepare": node("playwright/prepare.mjs", rest); break;
  case "test-ui": {
    const { statSync } = await import("node:fs");
    const rep = join(process.env.BABYSITTER_ROOT || process.cwd(), ".babysitter/report.json");
    const mtime = () => { try { return statSync(rep).mtimeMs; } catch { return null; } };
    const before = mtime();
    const st = await playwright(rest);
    const fresh = mtime() !== null && mtime() !== before;
    if (!fresh) { console.error(`babysitter test-ui: Playwright stopped before it wrote a report (exit ${st}) — nothing was checked; the error is above.`); process.exit(st || 1); }
    process.exit(st);
    break;
  }
  case "e2e": {
    const env = { ...process.env, BABYSITTER_ROOT: process.env.BABYSITTER_ROOT || process.cwd() };
    const ROOT = env.BABYSITTER_ROOT;
    const args = [...rest];
    const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v && !v.startsWith("--") ? 2 : 1); return v || true; };
    // boolean flags never take the next argument (`e2e --quick forms.spec` used to drop forms.spec)
    const flag = (f) => { const i = args.indexOf(f); if (i < 0) return false; args.splice(i, 1); return true; };
    const skipPrepare = flag("--skip-prepare");
    const only = take("--only");
    let express = flag("--express");
    const noCache = flag("--no-cache");
    const changedFlag = flag("--changed");
    const since = take("--since");
    if (flag("--quick")) env.BABYSITTER_PROFILE = "quick";
    const lastFailed = args.includes("--last-failed");
    const { readFileSync: rf, writeFileSync: wf, mkdirSync: md } = await import("node:fs");
    const modeFile = join(ROOT, ".babysitter/run-mode.json");
    let lastMode = {};
    try { lastMode = JSON.parse(rf(modeFile, "utf8")); } catch { }
    // --last-failed re-runs the failures of the last run in the mode that found them: an express run's failed tests are
    // its page tests (they do not exist in a normal run)
    if (lastFailed && !express && lastMode.express) { express = true; console.error("babysitter e2e: the last run was --express — --last-failed re-runs its failed checks in express mode."); }
    if (express) {
      env.BABYSITTER_EXPRESS = "1";
      if (noCache) env.BABYSITTER_EXPRESS_CACHE = "0";
      if (lastFailed) env.BABYSITTER_EXPRESS_ONLY = join(ROOT, ".babysitter/express-failed.json");
      // -g / --grep picks checks, not page tests: the page tests run and keep only the checks that match
      const { CONTAINER_TITLE } = await import("../lib/express-title.js");
      const esc = CONTAINER_TITLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (let i = 0; i < args.length; i++) {
        const m = args[i].match(/^(-g|--grep|-gv|--grep-invert)(?:=(.*))?$/);
        if (!m) continue;
        const inline = m[2] !== undefined;
        const val = inline ? m[2] : args[i + 1];
        if (val === undefined) continue;
        const invert = m[1] === "-gv" || m[1] === "--grep-invert";
        if (invert) env.BABYSITTER_EXPRESS_GREP_INVERT = val;
        else {
          env.BABYSITTER_EXPRESS_GREP = val;
          const rm = val.match(/^\/(.*)\/([gi]*)$/);
          const next = rm ? `/(?:${rm[1]})|${esc}/${rm[2]}` : `(?:${val})|${esc}`;
          if (inline) args[i] = `${m[1]}=${next}`; else args[i + 1] = next;
        }
        if (!inline) i++;
      }
      console.error(`babysitter e2e --express: one page load serves every check of a route${noCache ? " (result cache off)" : " (result cache on: --no-cache to measure everything again)"}.`);
    }
    const { wiringBanner } = await import("../lib/wiring.js");
    const banner = wiringBanner(ROOT, { context: "e2e" });
    if (banner) console.error(banner);
    // everything runs by default; --only is a partial run and says so, loudly, before and after
    // ui = every spec next to the tool's that is not a suite of its own (babysitter, run, and the checks other areas
    // add: layout, forms …) — a new spec file is never silently left out of --only ui
    const { readdirSync } = await import("node:fs");
    const OWN = ["acceptance", "content"];
    const uiSpecs = readdirSync(join(root, "playwright")).filter((f) => /\.spec\.(t|j)s$/.test(f) && !OWN.some((o) => f.startsWith(`${o}.`))).map((f) => f.replace(/\.(t|j)s$/, ""));
    const SUITES = { ui: uiSpecs, acceptance: ["acceptance.spec"], content: ["content.spec"], product: ["--project=product"] };
    if (only && !SUITES[only]) { console.error(`babysitter e2e: --only ui | acceptance | content | product (got "${only}")`); process.exit(2); }
    // the specs know which suites share the run (B1 defers to content's CT1 unless content is left out)
    if (only) env.BABYSITTER_ONLY = only;
    if (only) {
      const skippedNames = { ui: `UI checks + states/languages/scroll (${uiSpecs.join(", ")})`, acceptance: "business acceptance (acceptance.spec: B1 copy leaks, B2–B4 money, H1/H2 hover and cursor, N1/N4/N6, F0–F5 footer, P1–P3 policies, D1–D3, C1/C2 cookies, M1 currency, A1–A9 sign-in)", content: "copy (content.spec: CT1–CT22 unfinished copy, test data, raw errors, punctuation, dates, plurals, email MX + mailto, translations, legal names, © line, one name per concept, conflicting policy facts, link / action label drift, named pages that do not exist)", product: "the product's own e2e/*.spec.ts" };
      const off = Object.keys(SUITES).filter((k) => k !== only);
      console.error(`${"!".repeat(64)}\n!! PARTIAL RUN (--only ${only}). NOT RUN:\n${off.map((k) => `!!   ✗ ${skippedNames[k]}`).join("\n")}\n!! Defects those suites catch will not be found. Drop --only for a full check.\n${"!".repeat(64)}`);
    }
    if (!skipPrepare && !lastFailed) {
      const st = await forward(process.execPath, [join(root, "playwright/prepare.mjs")], { stdio: "inherit", env });
      if (st !== 0) { console.error("babysitter e2e: prepare failed (set BASE_URL or baseURL in babysitter.config.json; LOGIN_EMAIL / LOGIN_PASSWORD for signed-in pages). --skip-prepare to run on the last crawl."); process.exit(st ?? 1); }
    }
    // --changed / --since: the routes the change reaches (after prepare: the crawl is fresh)
    let selection = null;
    if (changedFlag || since) {
      const { affectedRoutes, explainSelection, defaultBase } = await import("../lib/affected-routes.js");
      const { loadConfig: lc, loadRoutes: lr } = await import("../playwright/project.js");
      process.env.BABYSITTER_ROOT = ROOT;
      const cfg0 = lc();
      const base = since && since !== true ? since : defaultBase(ROOT);
      const res = affectedRoutes(ROOT, { base, routes: lr(cfg0), ignore: cfg0.changed?.ignore || [] });
      console.error(explainSelection(res));
      selection = { all: res.all, routes: res.routes.map((r) => r.key), of: res.of, since: base };
      if (!res.all) {
        md(join(ROOT, ".babysitter"), { recursive: true });
        const f = join(ROOT, ".babysitter/selected-routes.json");
        wf(f, JSON.stringify({ at: new Date().toISOString(), base, routes: selection.routes, why: res.routes }, null, 2));
        env.BABYSITTER_SELECTED = f;
        if (!res.routes.length) {
          console.log("\nNothing to check: the change reaches no page (the findings of the last run stand). Run without --changed for a full check.");
          process.exit(0);
        }
      }
    }
    // a --reporter on the command line replaces the config's reporters: keep the JSON report the summary, findings.json,
    // fix-plan and the Stop hook read (a live run with --reporter=line once left nothing to summarise)
    for (let i = 0; i < args.length; i++) {
      const m = args[i].match(/^--reporter(?:=(.*))?$/);
      if (!m) continue;
      const val = m[1] ?? args[i + 1];
      if (val && !/(^|,)json(,|$)/.test(val)) { if (m[1] !== undefined) args[i] = `--reporter=${val},json`; else args[i + 1] = `${val},json`; }
      env.PLAYWRIGHT_JSON_OUTPUT_NAME = join(ROOT, ".babysitter/report.json");
    }
    if (only === "product") args.unshift("--project=product");
    else if (only) args.unshift(...SUITES[only]);
    // a run that crashed before Playwright wrote its report (a config that does not load, a missing browser) is a
    // failure, loudly — never a quiet summary of nothing, or of the previous run's report
    const reportFile = env.PLAYWRIGHT_JSON_OUTPUT_NAME || join(ROOT, ".babysitter/report.json");
    const { statSync } = await import("node:fs");
    const mtime = () => { try { return statSync(reportFile).mtimeMs; } catch { return null; } };
    const before = mtime();
    const t0 = Date.now();
    let status = await playwright(args, env);
    const fresh = mtime() !== null && mtime() !== before;
    try { md(join(ROOT, ".babysitter"), { recursive: true }); wf(modeFile, JSON.stringify({ express, at: new Date().toISOString(), ms: Date.now() - t0 })); } catch { }
    if (!fresh) {
      console.error(`\n${"✗".repeat(3)} babysitter e2e: Playwright stopped before it wrote a report (exit ${status}) — nothing was checked.\n    The error is printed above. Common causes: a browser that is not installed (npx playwright install chrome), a\n    BASE_URL that does not answer, a Node version the installed @playwright/test does not support.`);
      if (banner) console.error(banner);
      process.exit(status || 1);
    }
    // the summary: what ran, what did not, failures by page, and the command that re-checks only the failures
    try {
      const { summarize } = await import("../lib/run-summary.js");
      const { loadConfig, viewports } = await import("../playwright/project.js");
      process.env.BABYSITTER_ROOT = ROOT;
      const cfg = loadConfig();
      const vps = viewports(cfg, env).map((v) => v.name);
      const full = viewports(cfg, { ...env, BABYSITTER_PROFILE: "", VIEWPORTS: "" }).map((v) => v.name);
      const RUN = existsSync(join(ROOT, "node_modules/claudes-babysitter/bin/babysitter.mjs")) ? "npx --no babysitter" : `node ${relative(ROOT, join(root, "bin/babysitter.mjs")) || join(root, "bin/babysitter.mjs")}`;
      const sum = summarize({ root: ROOT, only, args, cfg, configured: { viewports: full }, lastFailed, selection, rerun: `${RUN} e2e --skip-prepare --last-failed${only ? ` --only ${only}` : ""}${env.BABYSITTER_PROFILE === "quick" ? " --quick" : ""}${express ? " --express" : ""}` });
      console.log(`\n${sum.text}`);
      if (!status && sum.rolesNotChecked?.length) status = 1;
      // 5.7.0: a login / role / test account babysitter.config.json declares, missing at run time: partial, and fails
      if (!status && sum.setupRequired?.length) status = 1;
      if (vps.length < full.length) console.log(`(--quick / VIEWPORTS: ${vps.join(", ")} of ${full.join(", ")})`);
    } catch (e) { console.error(`babysitter e2e: summary failed: ${e.message}`); }
    if (banner) console.error(banner);
    process.exit(status);
    break;
  }
  case "fix-plan": node("bin/fix-plan.mjs", rest); break;
  case "after-merge": node("bin/after-merge.mjs", rest); break;
  case "misses": node("bin/misses.mjs", rest); break;
  default:
    console.log("usage: babysitter <init|update|check|version-check|doctor|audit|content|prepare|test-ui|e2e|fix-plan|after-merge|misses> [...]\n  e2e [--skip-prepare] [--quick] [--only ui|acceptance|content|product] [--last-failed] [--express [--no-cache]] [--changed | --since <ref>]\n  init [repo] [--new|--existing] [--link|--vendor] [--ci] [--url URL] [--dev-url URL] [--dry-run] [--no-install] [--yes] [--force]");
    process.exit(cmd ? 2 : 0);
}
