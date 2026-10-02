// The BEFORE side as a second, read-only dev server: a git worktree of the base ref, next to the developer's
// own server, never touching their working tree or their open page. Studio captures both and the panel
// flips between them instantly.
//
//   worktree   <tmp>/babysitter-base-<repo>-<sha12>, detached at the base commit, checked out fresh (leftovers of a killed Studio are cleared)
//   deps       node_modules is linked from the repo (no reinstall); .env* files are copied (they are untracked)
//   server     Next → `next dev --webpack` (Turbopack refuses a node_modules link that points outside its root),
//              Vite → `vite --port`, anything else → `npm run dev -- --port` with PORT set
//   lifetime   one server per (repo, sha) per Studio process; stopped and the worktree removed on exit
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, copyFileSync, symlinkSync, rmSync, openSync, closeSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const sites = new Map(); // `${repo}@${sha}` -> Promise<{ url, stop }>
const git = (repo, ...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.unref(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

function devCommand(dir, port) {
  const pkg = (() => { try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { return {}; } })();
  const dev = String(pkg.scripts?.dev || "");
  const bin = (n) => join(dir, "node_modules", ".bin", n);
  if (/\bnext\s+dev\b/.test(dev) && existsSync(bin("next"))) return [bin("next"), ["dev", "--webpack", "-p", String(port)]];
  if (/\bvite\b/.test(dev) && existsSync(bin("vite"))) return [bin("vite"), ["--port", String(port), "--strictPort"]];
  return ["npm", ["run", "dev", "--", "--port", String(port)]];
}

async function waitUp(url, child, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`the base dev server exited (code ${child.exitCode})`);
    try { await fetch(url, { signal: AbortSignal.timeout(5000) }); return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the base dev server did not answer in time");
}

function clearWorktree(repo, dir) {
  try { git(repo, "worktree", "unlock", dir); } catch {}
  try { git(repo, "worktree", "remove", "--force", "--force", dir); } catch {}
  rmSync(dir, { recursive: true, force: true });
  try { git(repo, "worktree", "prune"); } catch {}
}

/** Start (or reuse) the dev server of `ref` for `repo`. Resolves to { url, sha, dir, stop }. */
export function baseSite({ repo, ref = "HEAD", log = () => {}, timeoutMs = 180000 }) {
  const sha = git(repo, "rev-parse", "--verify", `${ref}^{commit}`);
  const key = `${repo}@${sha}`;
  if (sites.has(key)) return sites.get(key);
  const started = (async () => {
    const dir = join(tmpdir(), `babysitter-base-${basename(repo).replace(/[^\w.-]/g, "_")}-${sha.slice(0, 12)}`);
    // always a fresh checkout: a Studio killed mid-cleanup leaves a half-deleted worktree behind (its .git file
    // but no package.json → the wrong dev command → a server that never starts), or a "locked" one
    clearWorktree(repo, dir);
    git(repo, "worktree", "add", "--detach", "-f", "-f", dir, sha);
    if (!existsSync(join(dir, "node_modules")) && existsSync(join(repo, "node_modules"))) symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"), "dir");
    for (const f of readdirSync(repo)) if (/^\.env(\..+)?$/.test(f) && !existsSync(join(dir, f))) copyFileSync(join(repo, f), join(dir, f));
    const port = await freePort();
    const [cmd, args] = devCommand(dir, port);
    log(`base site ${ref} (${sha.slice(0, 7)}) → ${cmd.split("/").pop()} ${args.join(" ")}`);
    // its output goes to <dir>.log (next to the worktree, kept after it is removed) — the place to look when it dies
    const logFile = `${dir}.log`;
    const out = openSync(logFile, "w");
    const child = spawn(cmd, args, { cwd: dir, env: { ...process.env, PORT: String(port), BROWSER: "none" }, stdio: ["ignore", out, out], detached: process.platform !== "win32" });
    closeSync(out);
    // a server that dies (killed from outside, crashed) is forgotten at once: the next request starts a new one
    child.on("exit", () => { if (sites.get(key) === started) sites.delete(key); });
    const url = `http://127.0.0.1:${port}`;
    const stop = () => {
      try { process.platform !== "win32" ? process.kill(-child.pid, "SIGTERM") : child.kill(); } catch {}
      clearWorktree(repo, dir);
      sites.delete(key);
    };
    cleanups.add(stop);
    try { await waitUp(url, child, timeoutMs); }
    catch (e) { stop(); cleanups.delete(stop); throw e; }
    return { url, sha, dir, stop };
  })();
  sites.set(key, started);
  started.catch(() => sites.delete(key));
  return started;
}

const cleanups = new Set();
/** Stop every base site this process started (Studio calls it on close and on exit). */
export function stopBaseSites() { for (const stop of cleanups) { try { stop(); } catch {} } cleanups.clear(); }
process.on("exit", stopBaseSites);
