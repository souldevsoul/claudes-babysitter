#!/usr/bin/env node
// babysitter fingerprint [repo…] [--register] [--registry PATH|URL] [--threshold 0.8] [--json]
// Prints each repo's theme fingerprint and the registered products it resembles (≥ threshold).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fingerprint } from "../lib/theme.js";
import { lookalikes, register, DEFAULT_REGISTRY, projectName } from "../lib/registry.js";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const repos = args.filter((a, i) => !a.startsWith("--") && !["--registry", "--threshold"].includes(args[i - 1])).map((r) => resolve(r));
if (!repos.length) repos.push(process.cwd());
const results = [];
for (const repo of repos) {
  const cfg = existsSync(join(repo, "babysitter.config.json")) ? JSON.parse(readFileSync(join(repo, "babysitter.config.json"), "utf8")) : {};
  const where = opt("registry") || cfg.registry || DEFAULT_REGISTRY;
  const name = projectName(repo, cfg);
  const fp = fingerprint(repo);
  const twins = await lookalikes(name, fp, { where, threshold: Number(opt("threshold") || cfg.similarityThreshold || 0.8) });
  if (args.includes("--register")) await register(name, fp, where);
  results.push({ project: name, fingerprint: fp, lookalikes: twins.map((t) => ({ project: t.project, score: t.score })) });
}
if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  const f = r.fingerprint;
  console.log(`${r.project}  #${f.hash}  hue ${f.hue ?? "—"}  chroma ${f.chroma ?? "—"}  radius ${f.radius ?? "—"}px  fonts ${f.fonts.join(", ") || "—"}  ${f.mode || ""}`);
  for (const t of r.lookalikes) console.log(`   ⚠ ${Math.round(t.score * 100)}% similar to ${t.project}`);
}
