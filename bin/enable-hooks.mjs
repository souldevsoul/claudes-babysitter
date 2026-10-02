#!/usr/bin/env node
// babysitter enable-hooks [repo] [--force]
// Step 4 of the adoption: switch the project to strict mode — the Claude Code hooks and the git pre-commit
// gate start BLOCKING new problems, and Theme First turns on. Refuses while the audit is not green
// (--force switches anyway: strict mode only blocks problems on lines you change, so old debt never blocks).
import { resolve, join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditRepo, tick } from "../lib/adoption.js";

const args = process.argv.slice(2);
const repo = resolve(args.find((a) => !a.startsWith("--")) || ".");
const cfgPath = join(repo, "babysitter.config.json");
if (!existsSync(cfgPath)) { console.error("enable-hooks: no babysitter.config.json here — run `babysitter init` first."); process.exit(2); }

const { problems, counted } = auditRepo(repo);
if (problems.length && !args.includes("--force")) {
  console.error(`\n✋ Аудит ещё не зелёный: ${problems.length} проблем(ы).`);
  for (const [label, list] of counted) if (list.length) console.error(`   ${label}: ${list.length}`);
  console.error("\n   Сначала шаг 3 (ветка chore/tech-debt), затем снова `npm run babysitter -- audit`.");
  console.error("   Включить всё равно: `npm run babysitter -- enable-hooks --force` (старый долг не блокирует — только новые строки).\n");
  process.exit(1);
}

// re-run init in strict mode: same install type (vendored or linked), hooks and pre-commit gate refreshed
// keep the install type the project already has: a dependency (team setup), a vendored copy, or a link
const vendored = existsSync(join(repo, "tools/claudes-babysitter/bin/ui-check.mjs"));
const pkg = (() => { try { const p = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")); return !!({ ...p.dependencies, ...p.devDependencies })["claudes-babysitter"]; } catch { return false; } })() || existsSync(join(repo, "node_modules/claudes-babysitter/bin/babysitter.mjs"));
const initArgs = [join(dirname(fileURLToPath(import.meta.url)), "ui-init.mjs"), repo, "--new", "--yes", "--no-install", ...(pkg ? ["--package"] : vendored ? ["--vendor"] : ["--link"])];
const r = spawnSync(process.execPath, initArgs, { encoding: "utf8" });
if (r.status !== 0) { process.stderr.write(r.stdout + r.stderr); process.exit(1); }
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
if (cfg.mode !== "strict") { cfg.mode = "strict"; cfg.themeFirst = true; writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n"); }
tick(repo, 2); tick(repo, 3); tick(repo, 4);
console.log(`\n🔒 Файрвол включён: "mode": "strict". Хуки Claude Code и git pre-commit теперь блокируют новые нарушения${problems.length ? ` (старый долг — ${problems.length} — не блокирует, только новые строки)` : ""}.`);
console.log("   BABYSITTER-ADOPTION.md: шаг 4 отмечен.");
