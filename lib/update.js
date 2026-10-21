// babysitter update (5.3.0): bring a product's copy of Claude's Babysitter up to a release tag.
//   vendored (tools/claudes-babysitter): the copy is replaced by the tag's files (the same files `init --vendor`
//            copies), its node_modules kept and refreshed with npm install;
//   pinned   (devDependency github:souldevsoul/claudes-babysitter#vX.Y.Z): the pin is moved; `npm install` fetches it.
// Never touched: babysitter.config.json, .babysitter/ (findings, baseline, state), allowances, the product's own e2e,
// hooks and CLAUDE.md — they live outside the copy. Prints what changed between the two versions (CHANGELOG.md, and
// README "What changed in …" for releases before 5.0.0, which have no CHANGELOG entry).
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync, mkdtempSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { ignoreVendoredCopy } from "./project-ignores.js";
import { parseVersion, compare, fmt, latestRelease, productVersion, REPO_URL } from "./version-check.js";

export const PKG = "claudes-babysitter";
export const VENDOR_DIR = "tools/claudes-babysitter";
// what a vendored copy leaves out (init --vendor and update use the same list)
export const VENDOR_SKIP = /(^|\/)(node_modules|reports|test-results|playwright-report|\.babysitter|fixtures|\.git)(\/|$)/;

/** Copy the tool tree `from` → `to`, leaving out VENDOR_SKIP. Returns the number of files copied. */
export function vendorCopy(from, to, { dry = false } = {}) {
  let n = 0;
  const walk = (a, b) => {
    for (const f of readdirSync(a)) {
      const src = join(a, f), dst = join(b, f);
      if (VENDOR_SKIP.test(relative(from, src))) continue;
      if (statSync(src).isDirectory()) walk(src, dst);
      else { n++; if (!dry) { mkdirSync(b, { recursive: true }); copyFileSync(src, dst); } }
    }
  };
  walk(from, to);
  return n;
}

/** Fetch release `tag` of `source` (git URL or local repository) into a fresh temp directory; returns its path. */
export function fetchRelease(source, tag, { runner = spawnSync } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "babysitter-update-"));
  const r = runner("git", ["clone", "--quiet", "--depth", "1", "--branch", tag, source, dir], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error(`could not fetch ${tag} from ${source}: ${(r.stderr || "").trim().split("\n").at(-1)}${/not found/i.test(r.stderr || "") ? " — that tag is not on the remote (not pushed yet?)" : ""}`); }
  return dir;
}

/**
 * The release notes after `from` up to and including `to`: CHANGELOG.md sections "## X.Y.Z — …", then README
 * sections "## What changed in X.Y[.Z] (…)" for versions the CHANGELOG does not have. Newest first.
 * Returns [{ version, title, body, source }].
 */
export function notesBetween(toolDir, from, to) {
  const out = [];
  const inRange = (v) => v && compare(v, from) > 0 && compare(v, to) <= 0;
  const sections = (text, re) => {
    const res = [];
    const lines = text.split("\n");
    let cur = null;
    for (const l of lines) {
      const m = l.match(re);
      if (m) { if (cur) res.push(cur); const p = m[1].split(".").map(Number); cur = { version: [p[0], p[1] ?? 0, p[2] ?? 0], title: l.replace(/^#+\s*/, ""), body: [] }; continue; }
      if (/^## /.test(l)) { if (cur) res.push(cur); cur = null; continue; }
      if (cur) cur.body.push(l);
    }
    if (cur) res.push(cur);
    return res.map((s) => ({ ...s, body: s.body.join("\n").trim() }));
  };
  const read = (f) => { try { return readFileSync(join(toolDir, f), "utf8"); } catch { return ""; } };
  const have = new Set();
  for (const s of sections(read("CHANGELOG.md"), /^## (\d+\.\d+\.\d+)\b/)) if (inRange(s.version)) { out.push({ ...s, source: "CHANGELOG.md" }); have.add(fmt(s.version)); }
  for (const s of sections(read("README.md"), /^## What changed in (\d+\.\d+(?:\.\d+)?)\b/)) if (inRange(s.version) && !have.has(fmt(s.version))) { out.push({ ...s, source: "README.md" }); have.add(fmt(s.version)); }
  return out.sort((a, b) => compare(b.version, a.version));
}

/**
 * The version check step in the product's CI workflows (written by `init --ci` before 5.3.0 without one): added once
 * after the step that installs the vendored copy. A workflow without that step, or already checking, is left alone.
 * Returns the files changed.
 */
export function wireVersionCheck(repo, { dry = false } = {}) {
  const changed = [];
  const dir = join(repo, ".github/workflows");
  if (!existsSync(dir)) return changed;
  for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    const file = join(dir, f);
    const yml = readFileSync(file, "utf8");
    if (/babysitter(\.mjs)? version-check|bin\/version-check\.mjs/.test(yml)) continue;
    const lines = yml.split("\n");
    let at = -1, indent = "";
    for (let i = 0; i < lines.length; i++) {
      // "- run: npm ci --prefix tools/claudes-babysitter …" (one line), or a named step whose run: line installs it
      const one = lines[i].match(/^(\s*)- run: npm ci --prefix tools\/claudes-babysitter\b/);
      if (one) { at = i; indent = one[1]; break; }
      const named = lines[i].match(/^(\s*)run: npm ci --prefix tools\/claudes-babysitter\s*$/);
      if (named && i > 0 && /^\s*- name:/.test(lines[i - 1])) { at = i; indent = lines[i - 1].match(/^(\s*)/)[1]; break; }
    }
    if (at < 0) continue;
    lines.splice(at + 1, 0, `${indent}# Claude's Babysitter version: warns a minor behind the latest release, fails a major behind (babysitter update)`, `${indent}- run: node ${VENDOR_DIR}/bin/babysitter.mjs version-check`);
    if (!dry) writeFileSync(file, lines.join("\n"));
    changed.push(relative(repo, file));
  }
  return changed;
}

/**
 * Update `repo`'s copy to `to` (a tag "vX.Y.Z", default: the latest release of `source`).
 * Returns { from, to, mode, notes, workflows, upToDate, files }. Throws on a missing copy, an unknown tag, or (unless
 * force) uncommitted edits inside the vendored copy.
 */
export function update(repo, { to = null, source = REPO_URL, dry = false, install = true, force = false, runner = spawnSync, log = () => {} } = {}) {
  const pv = productVersion(repo);
  if (!pv) throw new Error(`no copy of Claude's Babysitter in ${repo} (${VENDOR_DIR}/ or a ${PKG} dependency) — set it up with \`babysitter init\``);
  const from = pv.version;
  // 5.5.0 (Kindred, issue #4): update always asks the remote (one git ls-remote) — never the 12-hour version-check
  // cache, never a BABYSITTER_LATEST pin — and refreshes the cache with what it saw
  const latest = to ? null : latestRelease({ source, cache: false, refresh: source === REPO_URL, env: { ...process.env, BABYSITTER_LATEST: "" }, runner });
  const target = to ? parseVersion(to) : latest;
  if (!target) throw new Error(to ? `"${to}" is not a version (use vX.Y.Z)` : `could not read the release tags of ${source}`);
  const tag = `v${fmt(target)}`;
  const mode = pv.source === "vendored" ? "vendored" : "pinned";
  if (compare(from, target) >= 0 && !force) return { from, to: target, latest, mode, notes: [], workflows: [], upToDate: true, files: 0 };
  const toolDir = join(repo, VENDOR_DIR);
  if (mode === "vendored" && !force) {
    const st = runner("git", ["status", "--porcelain", "--", VENDOR_DIR], { cwd: repo, encoding: "utf8" });
    if (st.status === 0 && st.stdout.trim()) throw new Error(`${VENDOR_DIR} has uncommitted changes — commit or discard them first (or --force to replace them)`);
  }
  const fetched = fetchRelease(source, tag, { runner });
  try {
    const got = parseVersion(JSON.parse(readFileSync(join(fetched, "package.json"), "utf8")).version);
    if (!got || compare(got, target) !== 0) throw new Error(`${tag} of ${source} says it is ${fmt(got)} in package.json`);
    const notes = notesBetween(fetched, from, target);
    let files = 0;
    if (mode === "vendored") {
      log(`replacing ${VENDOR_DIR} (${fmt(from)} → ${fmt(target)})`);
      if (!dry) for (const f of readdirSync(toolDir)) if (f !== "node_modules") rmSync(join(toolDir, f), { recursive: true, force: true });
      files = vendorCopy(fetched, toolDir, { dry });
      if (!dry && install) {
        log("npm install in the copy (production dependencies)");
        const r = runner("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: toolDir, stdio: "inherit" });
        if (r.status !== 0) throw new Error(`npm install in ${VENDOR_DIR} failed — the files are ${tag}; run it again by hand`);
      }
    } else {
      const pjFile = join(repo, "package.json");
      const pj = JSON.parse(readFileSync(pjFile, "utf8"));
      for (const k of ["devDependencies", "dependencies"]) if (pj[k]?.[PKG]) pj[k][PKG] = /#/.test(pj[k][PKG]) ? pj[k][PKG].replace(/#.*$/, `#${tag}`) : `github:souldevsoul/claudes-babysitter#${tag}`;
      if (!dry) writeFileSync(pjFile, JSON.stringify(pj, null, 2) + "\n");
    }
    const workflows = mode === "vendored" ? wireVersionCheck(repo, { dry }) : [];
    // 5.5.0: copies vendored before 5.5.0 were left in the product's tsc / eslint (issue #4)
    const ignores = mode === "vendored" ? ignoreVendoredCopy(repo, VENDOR_DIR, { dry }) : [];
    return { from, to: target, mode, notes, workflows, ignores, upToDate: false, files };
  } finally {
    rmSync(fetched, { recursive: true, force: true });
  }
}
