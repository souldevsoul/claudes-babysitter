// Proposals: fixes prepared next to the original, applied to it only when a human approves them in Studio.
//
//   babysitter propose start            the working tree as it is now becomes the ORIGINAL (baseline)
//   (edit files: the fix)
//   babysitter propose save --title … --for <regex> [--id x] [--requires a,b]
//                                       the edits since the baseline become a proposal (a patch); the working tree
//                                       is put back to the original at once — nothing stays changed
//   studio review --repo . --proposals  the panel shows each finding with its proposed fix: Before = the page as
//                                       it is, After = a second dev server with the pending proposals applied;
//                                       Approve applies the patch to the original files, Reject drops it,
//                                       Comment sends it back for another try (propose save --id x replaces it)
//
// Everything lives in .babysitter/proposals/: baseline (a tree id) and <id>.json { id, title, for, requires, patch,
// files, status: pending | approved | rejected | revising, comments }. The repository's index, HEAD and branches are
// never touched: trees and commits are built with a temporary index file.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, mkdtempSync, chmodSync, unlinkSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { tmpdir } from "node:os";

export const proposalsDir = (repo) => join(repo, ".babysitter", "proposals");
const git = (repo, args, opts = {}) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...opts });
const gitBuf = (repo, args) => execFileSync("git", args, { cwd: repo, maxBuffer: 512 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });

/**
 * Run fn(env) with a throwaway, empty index. Not a copy of the real one: its stat cache can call a file that was
 * rewritten within the same second, at the same size, "unchanged" — every file is read for real instead.
 */
function withIndex(repo, fn) {
  const dir = mkdtempSync(join(tmpdir(), "babysitter-idx-"));
  try { return fn({ ...process.env, GIT_INDEX_FILE: join(dir, "index") }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The working directory as a git tree: tracked and untracked files (.gitignore respected, .babysitter left out). */
export function workingTree(repo) {
  excludeLocal(repo); // .babysitter/ never enters the tree
  return withIndex(repo, (env) => { git(repo, ["add", "-A"], { env }); return git(repo, ["write-tree"], { env }).trim(); });
}

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
export function baseline(repo) { try { return readFileSync(join(proposalsDir(repo), "baseline"), "utf8").trim(); } catch { return null; } }

// .babysitter/ is local state: keep it out of `git status` and commits without touching a tracked file
function excludeLocal(repo) {
  try {
    let common = git(repo, ["rev-parse", "--git-common-dir"]).trim();
    if (!isAbsolute(common)) common = join(repo, common);
    const f = join(common, "info", "exclude");
    const cur = existsSync(f) ? readFileSync(f, "utf8") : "";
    if (!/^\/?\.babysitter\/?$/m.test(cur)) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + ".babysitter/\n"); }
  } catch {}
}

export function start(repo) {
  excludeLocal(repo);
  mkdirSync(proposalsDir(repo), { recursive: true });
  const tree = workingTree(repo);
  writeFileSync(join(proposalsDir(repo), "baseline"), tree + "\n");
  return tree;
}

/** Make the given paths on disk match `tree`: written if the tree has them, deleted if it does not. */
function checkoutPaths(repo, tree, paths) {
  for (const path of paths) {
    const abs = join(repo, path);
    const entry = git(repo, ["ls-tree", tree, "--", path]).trim();
    if (!entry) { try { unlinkSync(abs); } catch {} continue; }
    const [mode] = entry.split(/\s+/);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, gitBuf(repo, ["cat-file", "blob", `${tree}:${path}`]));
    chmodSync(abs, mode === "100755" ? 0o755 : 0o644);
  }
}

/**
 * Apply patches on top of `tree` in a throwaway index, three-way (proposals are all made against the same original,
 * so two of them touching neighbouring lines of one file still combine). Returns { tree, applied, failed }.
 */
function applyToTree(repo, tree, patches) {
  const applied = [], failed = [];
  const out = withIndex(repo, (env) => {
    git(repo, ["read-tree", tree], { env });
    let cur = tree;
    const dir = mkdtempSync(join(tmpdir(), "babysitter-patch-"));
    try {
      for (const p of patches) {
        const attempt = (args, patch) => { writeFileSync(join(dir, "p.patch"), patch); git(repo, ["apply", "--cached", "--whitespace=nowarn", ...args, join(dir, "p.patch")], { env }); return git(repo, ["write-tree"], { env }).trim(); };
        try {
          try { cur = attempt(["--3way"], p.patch); }
          catch (e) { git(repo, ["read-tree", cur], { env }); if (!p.patch0) throw e; cur = attempt(["--unidiff-zero"], p.patch0); }
          applied.push(p.id);
        } catch (e) {
          failed.push({ id: p.id, error: String(e.stderr || e.message).trim().split("\n").filter((l) => !/^(hint|Applied|Falling back|Performing)/.test(l))[0] || "does not apply" });
          git(repo, ["read-tree", cur], { env }); // drop a half-merged state
        }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
    return cur;
  });
  return { tree: out, applied, failed };
}
const nameStatus = (repo, a, b) => git(repo, ["diff", "--no-renames", "--name-status", a, b]).split("\n").filter(Boolean).map((l) => { const [status, ...p] = l.split("\t"); return { status: status[0], path: p.join("\t") }; });

export function list(repo) {
  if (!existsSync(proposalsDir(repo))) return [];
  return readdirSync(proposalsDir(repo)).filter((f) => f.endsWith(".json")).map((f) => readJson(join(proposalsDir(repo), f))).filter(Boolean).sort((a, b) => (a.created || 0) - (b.created || 0));
}
export function get(repo, id) { return readJson(join(proposalsDir(repo), `${id}.json`)); }
function put(repo, p) { mkdirSync(proposalsDir(repo), { recursive: true }); writeFileSync(join(proposalsDir(repo), `${p.id}.json`), JSON.stringify(p, null, 2) + "\n"); return p; }
const slug = (s) => String(s || "fix").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "fix";

/**
 * The edits made since `start` become a proposal; the working tree goes back to the original.
 * { title, for: regex source matched against findings, id (replace an existing one), requires: [ids] }
 */
export function save(repo, { title, for: match = "", id = null, requires = [], kind = null, route = null, selector = null, why = null } = {}) {
  const base = baseline(repo);
  if (!base) throw new Error("no baseline: run `babysitter propose start` before editing");
  const now = workingTree(repo);
  if (now === base) throw new Error("nothing changed since `propose start`");
  const patch = git(repo, ["diff", "--binary", "--full-index", base, now]);
  // the same edits without context lines: anchored only on the lines they replace, so a fix on line 2 still applies
  // when another proposal changed line 1 (a three-way merge calls adjacent edits a conflict)
  const patch0 = git(repo, ["diff", "--binary", "--full-index", "-U0", base, now]);
  const changes = nameStatus(repo, base, now);
  const old = id ? get(repo, id) : null;
  const pid = id || (() => { let s = slug(title), k = s, n = 2; while (existsSync(join(proposalsDir(repo), `${k}.json`))) k = `${s}-${n++}`; return k; })();
  const p = put(repo, {
    id: pid, title: title || old?.title || pid, for: match || old?.for || "", requires: requires.length ? requires : old?.requires || [],
    // kind "code": changes nothing a person can see (style= → classes…) — applied without asking once `propose auto`
    // has shown every checked page to be pixel-identical; "visual": waits for a decision in Studio
    kind: kind || old?.kind || "visual",
    // where to look at a fix that answers a request rather than a finding (shown as its own entry in Studio)
    route: route || old?.route || null, selector: selector || old?.selector || null, why: why || old?.why || null,
    patch, patch0, files: changes.map((c) => c.path), status: "pending", comments: old?.comments || [], created: old?.created || Date.now(), updated: Date.now(),
  });
  checkoutPaths(repo, base, changes.map((c) => c.path));
  if (workingTree(repo) !== base) throw new Error(`proposal ${pid} saved, but the working tree did not return to the original — check git status`);
  return p;
}

/**
 * Revise a proposal: the original becomes the baseline again and the proposal's version of the files is put on
 * disk; edit, then save with the same id. (The files go back to the original on save.)
 */
export function edit(repo, id) {
  const p = get(repo, id);
  if (!p) throw new Error(`no proposal ${id}`);
  const base = start(repo);
  const r = applyToTree(repo, base, [p]);
  if (r.failed.length) throw new Error(`"${p.title}" does not apply to the files as they are now: ${r.failed[0].error}`);
  checkoutPaths(repo, r.tree, nameStatus(repo, base, r.tree).map((c) => c.path));
  return p;
}

export function setStatus(repo, id, status, extra = {}) { const p = get(repo, id); if (!p) throw new Error(`no proposal ${id}`); return put(repo, { ...p, ...extra, status, updated: Date.now() }); }
export function drop(repo, id) { rmSync(join(proposalsDir(repo), `${id}.json`), { force: true }); }

/** Approve: apply the patch (and what it requires) to the original files; the result becomes the new baseline. */
export function approve(repo, id, seen = new Set()) {
  const p = get(repo, id);
  if (!p) throw new Error(`no proposal ${id}`);
  if (p.status === "approved") return [];
  if (seen.has(id)) return [];
  seen.add(id);
  const done = [];
  for (const r of p.requires || []) {
    const q = get(repo, r);
    if (!q) continue;
    if (q.status === "rejected") throw new Error(`"${p.title}" needs "${q.title}", which was rejected`);
    done.push(...approve(repo, r, seen));
  }
  const now = workingTree(repo);
  const r = applyToTree(repo, now, [p]);
  if (r.failed.length) { setStatus(repo, id, "conflict", { error: r.failed[0].error }); throw new Error(`"${p.title}" does not apply to the files as they are now: ${r.failed[0].error}`); }
  checkoutPaths(repo, r.tree, nameStatus(repo, now, r.tree).map((c) => c.path));
  setStatus(repo, id, "approved", { approvedAt: Date.now() });
  if (baseline(repo)) writeFileSync(join(proposalsDir(repo), "baseline"), workingTree(repo) + "\n");
  return [...done, id];
}

/**
 * A commit of the working tree with every pending proposal applied (nothing on disk changes; no ref moves).
 * Returns { sha, applied: [ids], failed: [{ id, error }] } — the After side's dev server is started from it.
 */
export function proposalCommit(repo) {
  // the After side of a review shows what waits for a person: visual fixes (code-only ones are checked by `propose auto`)
  const pending = list(repo).filter((p) => (p.status === "pending" || p.status === "revising") && p.kind !== "code");
  const { tree, applied, failed } = applyToTree(repo, workingTree(repo), pending);
  let parent = []; try { parent = ["-p", git(repo, ["rev-parse", "--verify", "HEAD"]).trim()]; } catch {}
  const sha = git(repo, ["commit-tree", tree, ...parent, "-m", "babysitter: pending proposals"], { env: { ...process.env, GIT_AUTHOR_NAME: "babysitter", GIT_AUTHOR_EMAIL: "babysitter@localhost", GIT_COMMITTER_NAME: "babysitter", GIT_COMMITTER_EMAIL: "babysitter@localhost" } }).trim();
  return { sha, applied, failed };
}

/** A commit of the working tree with only the given proposals applied (nothing on disk changes). */
export function commitWith(repo, ids = []) {
  const ps = ids.map((id) => get(repo, id)).filter(Boolean);
  const { tree, applied, failed } = applyToTree(repo, workingTree(repo), ps);
  let parent = []; try { parent = ["-p", git(repo, ["rev-parse", "--verify", "HEAD"]).trim()]; } catch {}
  const env = { ...process.env, GIT_AUTHOR_NAME: "babysitter", GIT_AUTHOR_EMAIL: "babysitter@localhost", GIT_COMMITTER_NAME: "babysitter", GIT_COMMITTER_EMAIL: "babysitter@localhost" };
  return { sha: git(repo, ["commit-tree", tree, ...parent, "-m", "babysitter: check"], { env }).trim(), applied, failed };
}

/** Which proposal answers a finding: the first whose `for` pattern matches what the finding says. */
export function matchText(p) {
  return [p.check || p.rule || "", p.what || p.message || "", p.where || "", p.human ? `${p.human.kind}:${p.human.name}` : "", p.selector || "", p.route || "", p.file || ""].join(" | ");
}
export function assign(problems, proposals) {
  const rx = proposals.filter((p) => p.for).map((p) => { try { return [p, new RegExp(p.for, "i")]; } catch { return null; } }).filter(Boolean);
  return problems.map((f) => { const hit = rx.find(([, r]) => r.test(matchText(f))); return hit ? { ...f, proposal: hit[0].id } : f; });
}
