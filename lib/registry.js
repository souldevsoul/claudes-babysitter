// Registry of theme fingerprints across products. Local JSON by default
// (~/.claudes-babysitter/registry.json), or an HTTP endpoint that answers GET with
// [{project, fingerprint}] and accepts POST {project, fingerprint}.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, basename } from "node:path";
import { execSync } from "node:child_process";
import { similarity } from "./theme.js";

export const DEFAULT_REGISTRY = join(homedir(), ".claudes-babysitter", "registry.json");
const isUrl = (s) => /^https?:\/\//.test(s || "");

export async function load(where = DEFAULT_REGISTRY) {
  if (isUrl(where)) {
    try { const r = await fetch(where, { signal: AbortSignal.timeout(4000) }); return r.ok ? await r.json() : []; } catch { return []; }
  }
  try { return existsSync(where) ? JSON.parse(readFileSync(where, "utf8")) : []; } catch { return []; }
}

export async function register(project, fp, where = DEFAULT_REGISTRY) {
  const entry = { project, fingerprint: fp, updatedAt: new Date().toISOString() };
  if (isUrl(where)) {
    try { await fetch(where, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entry), signal: AbortSignal.timeout(4000) }); } catch {}
    return;
  }
  const list = (await load(where)).filter((e) => e.project !== project);
  list.push(entry);
  mkdirSync(dirname(where), { recursive: true });
  writeFileSync(where, JSON.stringify(list, null, 2) + "\n");
}

/** Other projects whose theme is ≥ threshold similar to this fingerprint. */
export async function lookalikes(project, fp, { where = DEFAULT_REGISTRY, threshold = 0.8 } = {}) {
  return (await load(where))
    .filter((e) => e.project !== project && e.fingerprint)
    .map((e) => ({ project: e.project, score: Math.round(similarity(fp, e.fingerprint) * 100) / 100, fingerprint: e.fingerprint }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/** Stable product name for the registry: config "name" → git remote repo name → folder name.
 *  (package.json names are often the template's — "nextjs-scaffold" — and would collide.) */
export function projectName(repo, cfg = {}) {
  if (cfg.name) return cfg.name;
  try {
    const url = execSync("git remote get-url origin", { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const m = url.match(/([^/:]+?)(\.git)?$/);
    if (m) return m[1];
  } catch {}
  return basename(repo);
}
