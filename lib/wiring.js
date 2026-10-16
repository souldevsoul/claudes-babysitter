// Is this product wired so that babysitter findings get re-checked and fixed — not just found once?
// Praxis (2026-10) had no wiring at all: one external run, fixes on a branch, a merge onto a main that had moved by
// 83 commits, and nothing ran again. These are the pieces `babysitter init` installs; anything missing is named.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";

const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
function hooksDir(repo) {
  try {
    const custom = (() => { try { return execFileSync("git", ["config", "core.hooksPath"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } })();
    if (custom) return isAbsolute(custom) ? custom : join(repo, custom);
    const gd = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return join(isAbsolute(gd) ? gd : join(repo, gd), "hooks");
  } catch { return null; }
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
    need(/babysitter|hook-pre-commit/.test(read(join(hd, "pre-commit"))), "git pre-commit gate", "babysitter init (or babysitter install-hooks)");
    need(/babysitter/.test(read(join(hd, "post-merge"))), "git post-merge re-check (after pull / merge)", "babysitter init");
    need(/babysitter/.test(read(join(hd, "post-rewrite"))), "git post-rewrite re-check (after rebase)", "babysitter init");
  }
  const wf = join(repo, ".github/workflows");
  const flows = existsSync(wf) ? readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).map((f) => read(join(wf, f))).join("\n") : "";
  need(/babysitter (audit|e2e)|bin\/babysitter\.mjs|claudes-babysitter/.test(flows), "CI gate on pull requests", "babysitter init --ci");
  need(/deployment_status[\s\S]*babysitter|babysitter[\s\S]*deployment_status/.test(flows), "CI full run after deploy (deployment_status)", "babysitter init --ci");
  return out;
}

/** A loud banner for what is missing, or "" when everything is wired. */
export function wiringBanner(repo, { context = "" } = {}) {
  const s = wiringStatus(repo);
  if (!s.missing.length) return "";
  const line = "!".repeat(64);
  return [line, `!! Claude's Babysitter is NOT WIRED into this repo${context ? ` (${context})` : ""}:`, ...s.missing.map((m) => `!!   ✗ ${m.piece} — ${m.fix}`), "!! Findings from this run will not be re-checked after the next merge or deploy, and a coding", "!! agent can report \"done\" with them still open. Wire it: babysitter init [--ci]", line].join("\n");
}
