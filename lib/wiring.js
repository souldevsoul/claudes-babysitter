// Is this product wired so that babysitter findings get re-checked and fixed — not just found once?
// Praxis (2026-10) had no wiring at all: one external run, fixes on a branch, a merge onto a main that had moved by
// 83 commits, and nothing ran again. These are the pieces `babysitter init` installs; anything missing is named.
import { existsSync, readFileSync, readdirSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { join, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";

const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
export function hooksDir(repo) {
  try {
    const custom = (() => { try { return execFileSync("git", ["config", "core.hooksPath"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } })();
    if (custom) return isAbsolute(custom) ? custom : join(repo, custom);
    const gd = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return join(isAbsolute(gd) ? gd : join(repo, gd), "hooks");
  } catch { return null; }
}

/**
 * husky: git runs the stubs in core.hooksPath (v9: .husky/_/<name>, which call .husky/<name>; v4–8: .husky with
 * husky.sh under _/). The commands a team writes — and the babysitter lines — live in .husky/<name>.
 * @returns the directory of the hook scripts people edit, or null when the repo does not use husky
 */
export function huskyScriptsDir(repo, hd = hooksDir(repo)) {
  if (!hd) return null;
  const norm = hd.replace(/[\\/]+$/, "");
  const stub = (f) => /husky\.sh|\/h"|\/h'|\/h\s*$|dirname "\$0"\)\/h\b/m.test(read(f));
  // v9: hooksPath ends in "/_" and holds the h stub (or husky.sh), or the hook files source it
  if (/[\\/]_$/.test(norm) && (existsSync(join(norm, "h")) || existsSync(join(norm, "husky.sh")) || stub(join(norm, "pre-commit")))) return norm.replace(/[\\/]_$/, "");
  // v4–8: hooksPath is .husky itself, with _/husky.sh next to the scripts
  if (existsSync(join(norm, "_", "husky.sh")) || /(^|[\\/])\.husky$/.test(norm)) return norm;
  return null;
}
/** the file whose commands run for a git hook: the husky script when husky manages hooks, else the hook itself */
export function hookScript(repo, name) {
  const hd = hooksDir(repo);
  if (!hd) return null;
  return join(huskyScriptsDir(repo, hd) || hd, name);
}

/** @returns {{ repo: boolean, missing: { piece: string, fix: string }[], present: string[] }} */
export function wiringStatus(repo) {
  const out = { repo: existsSync(join(repo, "package.json")), missing: [], present: [] };
  if (!out.repo) { out.missing.push({ piece: "product repo", fix: "run babysitter from the product's repo (cwd / BABYSITTER_ROOT) and `babysitter init` it — a run from elsewhere is never repeated after a merge or deploy" }); return out; }
  const need = (ok, piece, fix) => (ok ? out.present.push(piece) : out.missing.push({ piece, fix }));
  need(existsSync(join(repo, "babysitter.config.json")), "babysitter.config.json", "babysitter init");
  const settings = read(join(repo, ".claude/settings.json"));
  need(/hook-stop\.mjs/.test(settings), "Claude Code Stop hook (findings block \"done\")", "babysitter init");
  need(/hook-post-edit\.mjs/.test(settings), "Claude Code post-edit hook", "babysitter init");
  const agent = ["CLAUDE.md", "AGENTS.md", ".claude/CLAUDE.md"].map((f) => read(join(repo, f))).join("\n");
  need(/claudes-babysitter:start/.test(agent), "agent instructions (CLAUDE.md block: findings are blocking)", "babysitter init");
  const hd = hooksDir(repo);
  if (hd) {
    // with husky the stub in core.hooksPath runs .husky/<name>: read what actually runs
    const script = (name) => read(join(huskyScriptsDir(repo, hd) || hd, name)) + "\n" + read(join(hd, name));
    need(/babysitter|hook-pre-commit/.test(script("pre-commit")), "git pre-commit gate", "babysitter init (or babysitter install-hooks)");
    need(/babysitter/.test(script("post-merge")), "git post-merge re-check (after pull / merge)", "babysitter init");
    need(/babysitter/.test(script("post-rewrite")), "git post-rewrite re-check (after rebase)", "babysitter init");
  }
  const wf = join(repo, ".github/workflows");
  const flows = existsSync(wf) ? readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).map((f) => read(join(wf, f))).join("\n") : "";
  need(/babysitter (audit|e2e)|bin\/babysitter\.mjs|claudes-babysitter/.test(flows), "CI gate on pull requests", "babysitter init --ci");
  need(/deployment_status[\s\S]*babysitter|babysitter[\s\S]*deployment_status/.test(flows), "CI full run after deploy (deployment_status)", "babysitter init --ci");
  if (flows) need(/version-check/.test(flows), "CI version check (the copy against the latest release)", "babysitter update (adds the step) or babysitter init --ci");
  return out;
}

/** A loud banner for what is missing, or "" when everything is wired. */
export function wiringBanner(repo, { context = "" } = {}) {
  const s = wiringStatus(repo);
  if (!s.missing.length) return "";
  const line = "!".repeat(64);
  return [line, `!! Claude's Babysitter is NOT WIRED into this repo${context ? ` (${context})` : ""}:`, ...s.missing.map((m) => `!!   ✗ ${m.piece} — ${m.fix}`), "!! Findings from this run will not be re-checked after the next merge or deploy, and a coding", "!! agent can report \"done\" with them still open. Wire it: babysitter init [--ci]", line].join("\n");
}

/**
 * Append a babysitter block to a hook script (husky's .husky/<name>, or any hook file) once: nothing when `already`
 * matches the file. Creates the script when it does not exist. @returns true when it wrote
 */
export function appendHookBlock(file, block, already) {
  const cur = read(file);
  if (already.test(cur)) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, cur.trim() ? `${cur.trimEnd()}\n\n${block}\n` : `#!/usr/bin/env sh\n${block}\n`);
  try { chmodSync(file, 0o755); } catch {}
  return true;
}
