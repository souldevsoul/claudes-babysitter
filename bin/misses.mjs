#!/usr/bin/env node
// babysitter misses [--project <nexus slug>]… [--since ISO] [--findings <findings.json>]… [--labels <file>] [--out <dir>]
//                   [--state <file>] [--dry-run] [--authors]
// The miss loop (lib/misses.js): people's cards since the last run → CAUGHT / MISSED / OUT OF SCOPE → misses/<slug>-<date>.md
// and the catch rate CAUGHT / (CAUGHT + MISSED). Projects default to misses/projects.json (the babysitter-adopted ones).
// Needs NEXUS_URL and NEXUS_API_KEY (or NEXUS_API_KEYS) in the environment; the key is never printed.
// --findings: the last run's .babysitter/findings.json (repeat it for shards / viewports); default: ./.babysitter/findings.json
// with one --project. Without findings nothing can be CAUGHT, and the report says so.
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMisses, missesDir } from "../lib/misses.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const many = (f) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === f && args[i + 1] && !args[i + 1].startsWith("--")) out.push(args[++i]); return out; };
const one = (f) => many(f).at(-1) || null;
const has = (f) => args.includes(f);
if (has("--help") || has("-h")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const version = JSON.parse(readFileSync(join(TOOL, "package.json"), "utf8")).version;
const outDir = resolve(one("--out") || missesDir(TOOL, process.env.BABYSITTER_ROOT || process.cwd()));
const stateFile = resolve(one("--state") || join(outDir, "state.json"));
const registry = (() => { try { return JSON.parse(readFileSync(join(TOOL, "misses/projects.json"), "utf8")).projects || []; } catch { return []; } })();
const slugs = many("--project");
const projects = slugs.length ? slugs.map((s) => registry.find((p) => p.slug === s) || { slug: s, name: s }) : registry;
if (!projects.length) { console.error("babysitter misses: no project (--project <nexus slug>, or list them in misses/projects.json)"); process.exit(2); }
let findings = many("--findings").map((f) => resolve(f));
if (!findings.length && projects.length === 1 && existsSync(resolve(".babysitter/findings.json"))) findings = [resolve(".babysitter/findings.json")];
if (findings.length && projects.length > 1) { console.error("babysitter misses: --findings belongs to one product — run once per --project"); process.exit(2); }
for (const f of findings) if (!existsSync(f)) { console.error(`babysitter misses: ${f} does not exist`); process.exit(2); }

let failed = 0;
for (const p of projects) {
  const labelsFile = resolve(one("--labels") || join(outDir, "labels", `${p.slug}.json`));
  try {
    const r = await runMisses({ slug: p.slug, product: p.name || p.slug, since: one("--since"), findingsFiles: findings, labelsFile, outDir, stateFile, version, write: !has("--dry-run"), authors: has("--authors"), excludeAuthors: p.excludeAuthors });
    const x = r.rate;
    console.log(`${p.name || p.slug}: catch rate ${x.text} — CAUGHT ${x.caught} · MISSED ${x.missed} · OUT OF SCOPE ${x.oos} (${x.total} cards${x.unconfirmed ? `, ${x.unconfirmed} suggested — need a person to confirm` : ""})${findings.length ? "" : " — no findings.json given: nothing can be CAUGHT"}${r.unseen ? ` — ${r.unseen} of ${r.total} project cards not visible through the API (souldevsoul/nexus#1)` : ""}`);
    console.log(has("--dry-run") ? r.text : `  → ${r.file}`);
  } catch (e) {
    failed++;
    console.error(`babysitter misses: ${p.slug}: ${String(e.message || e)}`);
  }
}
process.exit(failed ? 1 : 0);
