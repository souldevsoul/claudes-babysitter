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
//   e2e [--skip-prepare] [--quick] [--only ui|acceptance|content|product] [--last-failed] [...playwright args]
//                    → prepare (login per role + crawl + languages) + the UI checks + states / languages / scroll
//                      (run.spec.ts) + business acceptance (acceptance.spec.ts) + the product's own e2e/*.spec.ts, in one
//                      Playwright run at 360/390/768/1280/1440 (--quick: 390 + 1440). --only is a partial run and says so.
//                      Ends with a summary of what did not run and the command that re-checks only the failures.
//   fix-plan [--format md|agent|json]  → the last run's findings grouped into a fix list with the files to change
//   after-merge      → the git post-merge / post-rewrite re-check: static check of what the merge changed, then the
//                      runtime checks on the routes it reached (when a dev server / preview answers)
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
// the Playwright CLI next to Claude's Babysitter — the same @playwright/test copy the checks import
// (a bare `npx playwright` from the project could fetch a different version)
function playwright(args, env = process.env) {
  let cli;
  try { cli = createRequire(join(root, "package.json")).resolve("@playwright/test/cli"); }
  catch { console.error("babysitter: @playwright/test is not installed next to Claude's Babysitter (npm install)"); return 2; }
  return spawnSync(process.execPath, [cli, "test", "-c", join(root, "playwright/playwright.config.ts"), ...args], { stdio: "inherit", cwd: process.cwd(), env }).status ?? 1;
}
const node = (file, args) => process.exit(spawnSync(process.execPath, [join(root, file), ...args], { stdio: "inherit" }).status ?? 1);
switch (cmd) {
  case "init": node("bin/ui-init.mjs", rest); break;
  case "check": node("bin/ui-check.mjs", rest); break;
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
  case "test-ui": process.exit(playwright(rest)); break;
  case "e2e": {
    const env = { ...process.env, BABYSITTER_ROOT: process.env.BABYSITTER_ROOT || process.cwd() };
    const ROOT = env.BABYSITTER_ROOT;
    const args = [...rest];
    const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v && !v.startsWith("--") ? 2 : 1); return v || true; };
    const skipPrepare = take("--skip-prepare");
    const only = take("--only");
    if (take("--quick")) env.BABYSITTER_PROFILE = "quick";
    const lastFailed = args.includes("--last-failed");
    const { wiringBanner } = await import("../lib/wiring.js");
    const banner = wiringBanner(ROOT, { context: "e2e" });
    if (banner) console.error(banner);
    // everything runs by default; --only is a partial run and says so, loudly, before and after
    const SUITES = { ui: ["babysitter.spec", "run.spec"], acceptance: ["acceptance.spec"], content: ["content.spec"], product: ["--project=product"] };
    if (only && !SUITES[only]) { console.error(`babysitter e2e: --only ui | acceptance | content | product (got "${only}")`); process.exit(2); }
    if (only) {
      const skippedNames = { ui: "UI checks + states/languages/scroll (babysitter.spec, run.spec)", acceptance: "business acceptance (acceptance.spec: B1 copy leaks, B2–B4 money, H1/H2 hover and cursor, N1/N4/N6, F0–F5 footer, P1–P3 policies, D1–D3, C1/C2 cookies, M1 currency, A1–A9 sign-in)", content: "copy (content.spec: CT1–CT18 unfinished copy, test data, raw errors, punctuation, dates, plurals, email MX + mailto, translations, legal names, © line)", product: "the product's own e2e/*.spec.ts" };
      const off = Object.keys(SUITES).filter((k) => k !== only);
      console.error(`${"!".repeat(64)}\n!! PARTIAL RUN (--only ${only}). NOT RUN:\n${off.map((k) => `!!   ✗ ${skippedNames[k]}`).join("\n")}\n!! Defects those suites catch will not be found. Drop --only for a full check.\n${"!".repeat(64)}`);
    }
    if (!skipPrepare && !lastFailed) {
      const st = spawnSync(process.execPath, [join(root, "playwright/prepare.mjs")], { stdio: "inherit", env }).status;
      if (st !== 0) { console.error("babysitter e2e: prepare failed (set BASE_URL or baseURL in babysitter.config.json; LOGIN_EMAIL / LOGIN_PASSWORD for signed-in pages). --skip-prepare to run on the last crawl."); process.exit(st ?? 1); }
    }
    if (only === "product") args.unshift("--project=product");
    else if (only) args.unshift(...SUITES[only]);
    const status = playwright(args, env);
    // the summary: what ran, what did not, failures by page, and the command that re-checks only the failures
    try {
      const { summarize } = await import("../lib/run-summary.js");
      const { loadConfig, viewports } = await import("../playwright/project.js");
      process.env.BABYSITTER_ROOT = ROOT;
      const cfg = loadConfig();
      const vps = viewports(cfg, env).map((v) => v.name);
      const full = viewports(cfg, { ...env, BABYSITTER_PROFILE: "", VIEWPORTS: "" }).map((v) => v.name);
      const RUN = existsSync(join(ROOT, "node_modules/claudes-babysitter/bin/babysitter.mjs")) ? "npx --no babysitter" : `node ${relative(ROOT, join(root, "bin/babysitter.mjs")) || join(root, "bin/babysitter.mjs")}`;
      const { text } = summarize({ root: ROOT, only, args, cfg, configured: { viewports: full }, rerun: `${RUN} e2e --skip-prepare --last-failed${only ? ` --only ${only}` : ""}${env.BABYSITTER_PROFILE === "quick" ? " --quick" : ""}` });
      console.log(`\n${text}`);
      if (vps.length < full.length) console.log(`(--quick / VIEWPORTS: ${vps.join(", ")} of ${full.join(", ")})`);
    } catch (e) { console.error(`babysitter e2e: summary failed: ${e.message}`); }
    if (banner) console.error(banner);
    process.exit(status);
    break;
  }
  case "fix-plan": node("bin/fix-plan.mjs", rest); break;
  case "after-merge": node("bin/after-merge.mjs", rest); break;
  default:
    console.log("usage: babysitter <init|check|audit|prepare|test-ui|e2e|fix-plan|after-merge> [...]\n  e2e [--skip-prepare] [--quick] [--only ui|acceptance|product] [--last-failed]\n  init [repo] [--new|--existing] [--link|--vendor] [--ci] [--url URL] [--dev-url URL] [--dry-run] [--no-install] [--yes] [--force]");
    process.exit(cmd ? 2 : 0);
}
