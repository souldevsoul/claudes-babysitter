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
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const node = (file, args) => process.exit(spawnSync(process.execPath, [join(root, file), ...args], { stdio: "inherit" }).status ?? 1);
switch (cmd) {
  case "init": node("bin/ui-init.mjs", rest); break;
  case "check": node("bin/ui-check.mjs", rest); break;
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
        const p = P.save(repo, { title: opt("title"), for: opt("for") || "", id: opt("id"), requires: (opt("requires") || "").split(",").filter(Boolean), kind: opt("kind") });
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
      else { console.error("usage: babysitter propose start | save --title T --for REGEX [--id X] [--requires a,b] [--kind code] | edit <id> | auto --routes /,/x [--widths 1280,390] | list | drop <id>"); process.exit(2); }
    } catch (e) { console.error(`babysitter propose: ${e.message}`); process.exit(1); }
    break;
  }
  case "micro-check": node("bin/micro-check.mjs", rest); break;
  case "prepare": node("playwright/prepare.mjs", rest); break;
  case "test-ui": process.exit(spawnSync("npx", ["playwright", "test", "-c", join(root, "playwright/playwright.config.ts"), ...rest], { stdio: "inherit", cwd: process.cwd() }).status ?? 1);
  default:
    console.log("usage: babysitter <init|check|audit|prepare|test-ui> [...]\n  init [repo] [--new|--existing] [--link|--vendor] [--ci] [--url URL] [--dev-url URL] [--dry-run] [--no-install] [--yes] [--force]");
    process.exit(cmd ? 2 : 0);
}
