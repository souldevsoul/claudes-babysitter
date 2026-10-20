// Is the copy of Claude's Babysitter a product runs behind the latest release? (5.3.0)
// A product vendors the tool (tools/claudes-babysitter) or pins it (devDependency github:…#vX.Y.Z); nothing used to say
// when that copy fell behind — praxis and parallel ran 5.0.0 and deskhand / proxy / tandem 4.11.1 while 5.2.0 was out.
//   same or newer          ok
//   a patch behind         note (exit 0)
//   a minor behind         warn (exit 0)
//   a major behind         fail (exit 1)
//   latest tag unknown     note "could not check" (offline, rate limit) — never a failure
// The latest tag comes from `git ls-remote --tags` of the public repo (no token needed), cached for 12 hours in
// ~/.claudes-babysitter/latest-tag.json; BABYSITTER_LATEST=v5.3.0 pins it (tests, air-gapped CI).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

export const REPO_URL = "https://github.com/souldevsoul/claudes-babysitter.git";
const PKG = "claudes-babysitter";

/** "v5.2.0" / "5.2.0" / "github:souldevsoul/claudes-babysitter#v5.2.0" → [5, 2, 0], or null. */
export function parseVersion(v) {
  const m = String(v || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export const fmt = (v) => (v ? v.join(".") : "?");
export function compare(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

/** The highest release tag (vX.Y.Z, no pre-release) among `git ls-remote --tags` lines or tag names. */
export function latestFromTags(lines) {
  let best = null;
  for (const l of String(lines).split("\n")) {
    const m = l.match(/(?:refs\/tags\/|^)v(\d+)\.(\d+)\.(\d+)$/);
    if (!m) continue;
    const v = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!best || compare(v, best) > 0) best = v;
  }
  return best;
}

/**
 * How far `current` is behind `latest`: { level: "ok" | "patch" | "minor" | "major" | "unknown", current, latest, text }.
 * A major behind fails (exit 1); a minor behind warns; a patch behind is a note.
 */
export function classify(current, latest) {
  const c = Array.isArray(current) ? current : parseVersion(current);
  const l = Array.isArray(latest) ? latest : parseVersion(latest);
  if (!c) return { level: "unknown", current: null, latest: l, text: "Claude's Babysitter: the version of this copy is unknown (no package.json)" };
  if (!l) return { level: "unknown", current: c, latest: null, text: `Claude's Babysitter ${fmt(c)}: could not find the latest release (offline?) — not checked` };
  if (compare(c, l) >= 0) return { level: "ok", current: c, latest: l, text: `Claude's Babysitter ${fmt(c)} is the latest release` };
  const level = c[0] < l[0] ? "major" : c[1] < l[1] ? "minor" : "patch";
  const how = level === "major" ? `${l[0] - c[0]} major version${l[0] - c[0] > 1 ? "s" : ""} behind` : level === "minor" ? `${l[1] - c[1]} minor version${l[1] - c[1] > 1 ? "s" : ""} behind` : "a patch behind";
  return { level, current: c, latest: l, text: `Claude's Babysitter ${fmt(c)} is ${how} the latest release ${fmt(l)} — run \`babysitter update\` (it keeps babysitter.config.json and .babysitter/)` };
}

/** The version of the copy a product runs: vendored, installed, or pinned in package.json; else null. */
export function productVersion(repo) {
  const read = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
  for (const f of [join(repo, "tools", PKG, "package.json"), join(repo, "node_modules", PKG, "package.json")]) {
    const j = read(f);
    if (j?.version) return { version: parseVersion(j.version), source: f.includes("node_modules") ? "installed" : "vendored", file: f };
  }
  const pj = read(join(repo, "package.json"));
  const spec = pj?.devDependencies?.[PKG] || pj?.dependencies?.[PKG];
  if (spec && parseVersion(spec)) return { version: parseVersion(spec), source: "pinned", file: join(repo, "package.json") };
  return null;
}

const CACHE = (env) => join(env.BABYSITTER_HOME || join(homedir(), ".claudes-babysitter"), "latest-tag.json");
const MAX_AGE = 12 * 3600 * 1000;

/**
 * The latest release tag of `source` (a git URL or a local repository). Order: BABYSITTER_LATEST; the 12-hour cache
 * (default source only); `git ls-remote --tags` with a timeout. Returns [major, minor, patch] or null.
 */
export function latestRelease({ source = REPO_URL, env = process.env, cache = source === REPO_URL, timeoutMs = 8000, now = Date.now(), runner = spawnSync } = {}) {
  if (env.BABYSITTER_LATEST) return parseVersion(env.BABYSITTER_LATEST);
  const file = CACHE(env);
  if (cache) { try { const j = JSON.parse(readFileSync(file, "utf8")); if (now - j.at < MAX_AGE && parseVersion(j.tag)) return parseVersion(j.tag); } catch {} }
  const r = runner("git", ["ls-remote", "--tags", "--refs", source], { encoding: "utf8", timeout: timeoutMs, env: { ...env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0) return null;
  const v = latestFromTags(r.stdout);
  if (v && cache) { try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ tag: `v${fmt(v)}`, at: now }) + "\n"); } catch {} }
  return v;
}

/**
 * One line (and the level) for a product: `repo`'s copy against the latest release. `toolVersion` is the version of
 * the running tool, used when the product has no copy of its own (a link install).
 */
export function checkRepo(repo, { toolVersion = null, ...opts } = {}) {
  const pv = productVersion(repo);
  const current = pv?.version || parseVersion(toolVersion);
  const r = classify(current, latestRelease(opts));
  return { ...r, source: pv?.source || "running" };
}

/** GitHub Actions annotation for a result (::error for major, ::warning for minor, ::notice otherwise). */
export function annotate(r) {
  const kind = r.level === "major" ? "error" : r.level === "minor" ? "warning" : "notice";
  return `::${kind} title=Claude's Babysitter version::${r.text}`;
}

export const exitCode = (r) => (r.level === "major" ? 1 : 0);
