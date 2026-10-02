// Time Travel Visual Diff: swap the changed UI files between HEAD (BEFORE) and the working tree (AFTER) on disk,
// and let the dev server's HMR re-render the page. The developer's work must survive anything, so:
//
//  1. Snapshot first. Both versions of every file are copied into a journal (.babysitter/time-travel/) before
//     a single byte on disk changes; the journal records the side that may be on disk ("BEFORE" is written to
//     the journal BEFORE the files, "AFTER" only after every file is back).
//  2. We only overwrite what we wrote. A switch first checks that every file still holds the content we expect
//     for the current side; if anyone (editor, formatter, Claude) touched a file, nothing is written at all.
//  3. Restore never destroys content. A file that holds something unknown when AFTER is put back is copied to
//     .babysitter/time-travel-conflicts/<time>/ first.
//  4. Crash-safe. try/finally in the caller, plus SIGINT/SIGTERM/SIGHUP/exit handlers; and if the process is
//     SIGKILLed, recover(repo) — called by every hook on start — finishes the restore from the journal.
//
// Binary-safe (Buffers), keeps file modes, writes atomically (temp file + rename). Untracked new files are
// removed for BEFORE and recreated for AFTER; deleted files come back for BEFORE. Config, lockfiles, env files
// and anything outside UI sources are never swapped (they would restart the dev server or worse).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, statSync, chmodSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";

const UI_FILE = /\.(tsx|jsx|ts|js|mjs|cjs|css|scss|sass|less|mdx|md|html|vue|svelte|astro|svg|json)$/i;
const NEVER = /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig[^/]*\.json|jsconfig\.json|babysitter\.config\.json|[^/]*\.config\.[cm]?[jt]s|\.env[^/]*)$|(^|\/)(\.babysitter|\.claude|\.git|node_modules|tools\/claudes-babysitter)\//;
const MAX_BYTES = 2 * 1024 * 1024;
const RESCAN_MARK = Buffer.from("\n/* babysitter: rescan */\n");

const jdir = (repo) => join(repo, ".babysitter", "time-travel");
const jfile = (repo) => join(jdir(repo), "journal.json");
const sha = (b) => (b === null ? null : createHash("sha1").update(b).digest("hex"));
const git = (repo, args) => execFileSync("git", args, { cwd: repo, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
const readOrNull = (abs) => { try { return readFileSync(abs); } catch { return null; } };

function put(abs, buf, mode) {
  if (buf === null) { rmSync(abs, { force: true }); return; }
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.babysitter-${process.pid}.tmp`;
  writeFileSync(tmp, buf);
  if (mode) chmodSync(tmp, mode);
  renameSync(tmp, abs); // atomic: the dev server never sees a half-written file
}

function saveJournal(repo, j) { mkdirSync(jdir(repo), { recursive: true }); put(jfile(repo), Buffer.from(JSON.stringify(j, null, 2))); }
const blob = (repo, h) => (h === null ? null : readFileSync(join(jdir(repo), "blobs", h)));

/** Collect the changed UI files and journal both versions. Returns null when there is nothing to compare.
 *  base: what BEFORE means — HEAD by default (uncommitted work), or any ref (a branch's whole change vs main). */
export function snapshot(repo, { base = "HEAD" } = {}) {
  repo = resolve(repo);
  if (recover(repo)?.busy) return null; // another live review owns this repo's files; never stack swaps
  try { git(repo, ["rev-parse", "--verify", `${base}^{commit}`]); } catch { return null; } // no commits yet / unknown base
  const changed = new Map();
  const z = (b) => b.toString("utf8").split("\0").filter(Boolean);
  const st = z(git(repo, ["-c", "core.quotepath=off", "diff", "--name-status", "--no-renames", "-z", base]));
  for (let i = 0; i + 1 < st.length; i += 2) changed.set(st[i + 1], st[i][0]);
  for (const p of z(git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]))) changed.set(p, "A");

  const files = [], skipped = [];
  mkdirSync(join(jdir(repo), "blobs"), { recursive: true });
  for (const [path, status] of changed) {
    if (!UI_FILE.test(path) || NEVER.test(path)) { skipped.push(path); continue; }
    const abs = join(repo, path);
    const after = readOrNull(abs);
    let before = null;
    if (status !== "A") { try { before = git(repo, ["show", `${base}:${path}`]); } catch { before = null; } }
    if ((after && after.length > MAX_BYTES) || (before && before.length > MAX_BYTES)) { skipped.push(path); continue; }
    if (sha(after) === sha(before)) continue; // e.g. mode-only change
    for (const b of [after, before]) if (b !== null) writeFileSync(join(jdir(repo), "blobs", sha(b)), b);
    let mode; try { mode = statSync(abs).mode & 0o777; } catch {}
    files.push({ path, status, before: sha(before), after: sha(after), mode });
  }
  if (!files.length) { rmSync(jdir(repo), { recursive: true, force: true }); return null; }
  const j = { version: 1, pid: process.pid, started: new Date().toISOString(), side: "AFTER", base, files, skipped };
  saveJournal(repo, j);
  return { repo, journal: j };
}

/** Switch the disk to "BEFORE" or "AFTER".
 *  → BEFORE is all-or-nothing: if any file no longer holds the AFTER we journaled (an editor, a formatter), nothing
 *    is written. → AFTER always succeeds: unknown content is kept as a conflict copy first. */
export function apply(tt, side) {
  if (side !== "BEFORE" && side !== "AFTER") throw new Error(`unknown side ${side}`);
  const { repo, journal: j } = tt;
  if (j.side === side) return { side, files: j.files.length };
  if (side === "AFTER") { const conflicts = toAfter(repo, j); return { side, files: j.files.length, conflicts }; }
  const touched = j.files.filter((f) => sha(readOrNull(join(repo, f.path))) !== f.after).map((f) => f.path);
  if (touched.length) {
    const e = new Error(`changed on disk since the review started — nothing swapped: ${touched.slice(0, 3).join(", ")}${touched.length > 3 ? ` (+${touched.length - 3})` : ""}`);
    e.touched = touched; throw e;
  }
  j.side = "BEFORE"; saveJournal(repo, j); // the journal is ahead of the disk: a crash from here on is recoverable
  for (const f of j.files) put(join(repo, f.path), blob(repo, f.before), f.mode);
  return { side, files: j.files.length };
}

/**
 * apply() for a running dev server: stylesheets first, a pause, then everything else. Turbopack/Vite start a
 * rebuild on the first changed file; if a component triggers it while the theme CSS is still the old one, the
 * CSS compiled from it is one step behind (Orbit: the page showed the theme of the other side). Writing the
 * stylesheets alone first lets the watcher take them in before any component asks for a rebuild. Then, once the
 * components are in, the stylesheets are written once more (same bytes): Tailwind's class scan runs when its
 * CSS entry is rebuilt, and that last write makes it scan the components as they are now.
 */
export async function applyStaged(tt, side, { pauseMs = 900 } = {}) {
  if (side !== "BEFORE" && side !== "AFTER") throw new Error(`unknown side ${side}`);
  const { repo, journal: j } = tt;
  if (j.side === side) return { side, files: j.files.length };
  const styles = j.files.filter((f) => /\.(s?css|less|sass)$/i.test(f.path));
  if (!styles.length) return apply(tt, side);
  if (side === "BEFORE") {
    // same all-or-nothing guard as apply(): nothing is written if anyone touched a file since the snapshot
    const touched = j.files.filter((f) => sha(readOrNull(join(repo, f.path))) !== f.after).map((f) => f.path);
    if (touched.length) { const e = new Error(`changed on disk since the review started — nothing swapped: ${touched.slice(0, 3).join(", ")}${touched.length > 3 ? ` (+${touched.length - 3})` : ""}`); e.touched = touched; throw e; }
    if (tt.closed) throw new Error("the review has ended");
    j.side = "BEFORE"; saveJournal(repo, j);
    for (const f of styles) put(join(repo, f.path), blob(repo, f.before), f.mode);
    await new Promise((r) => setTimeout(r, pauseMs));
    if (tt.closed) return { side: "AFTER", files: j.files.length, cancelled: true }; // restore() already put AFTER back
    for (const f of j.files) if (!styles.includes(f)) put(join(repo, f.path), blob(repo, f.before), f.mode);
    await rescan(tt, styles, pauseMs);
    return { side, files: j.files.length };
  }
  // AFTER: the stylesheets go back first, then the rest; unknown content is kept as a conflict copy, as in toAfter()
  const conflicts = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const back = (f) => {
    const abs = join(repo, f.path), now = sha(readOrNull(abs));
    if (now === f.after) return;
    if (now !== f.before && now !== null) { const keep = join(repo, ".babysitter", "time-travel-conflicts", stamp, f.path); mkdirSync(dirname(keep), { recursive: true }); copyFileSync(abs, keep); conflicts.push(relative(repo, keep)); }
    put(abs, blob(repo, f.after), f.mode);
  };
  if (tt.closed) throw new Error("the review has ended");
  styles.forEach(back);
  await new Promise((r) => setTimeout(r, pauseMs));
  if (tt.closed) return { side: "AFTER", files: j.files.length, conflicts, cancelled: true };
  j.files.filter((f) => !styles.includes(f)).forEach(back);
  j.side = "AFTER"; saveJournal(repo, j);
  await rescan(tt, styles, pauseMs);
  return { side, files: j.files.length, conflicts };
}
// After the components landed, make the CSS pipeline rebuild once more on a settled tree. Bundlers dedupe a
// write of identical bytes (and ignore a touch), so the stylesheet briefly gets a trailing comment, then its
// exact bytes again: two real changes, the last one compiled with every source in place. A crash in between
// leaves the commented version, which restore() keeps as a conflict copy before putting the real one back.
async function rescan(tt, styles, pauseMs) {
  await new Promise((r) => setTimeout(r, pauseMs));
  if (tt.closed) return;
  const exact = styles.map((f) => [join(tt.repo, f.path), readOrNull(join(tt.repo, f.path))]).filter(([, b]) => b !== null);
  for (const [abs, b] of exact) writeFileSync(abs, Buffer.concat([b, RESCAN_MARK]));
  await new Promise((r) => setTimeout(r, pauseMs));
  // exact bytes back even if the review ended meanwhile: restore() may have read the commented version — then
  // it already wrote AFTER over it and this write must not run; it only rewrites what is still the commented copy
  for (const [abs, b] of exact) { const now = readOrNull(abs); if (now && now.length === b.length + RESCAN_MARK.length && now.subarray(0, b.length).equals(b)) writeFileSync(abs, b); }
}

/** Put AFTER back no matter what, keep any unknown content as a conflict copy, drop the journal.
 *  Also closes the snapshot: a staged swap still in flight stops at its next step and writes nothing more. */
export function restore(tt) { tt.closed = true; return finish(tt.repo, tt.journal); }

function finish(repo, j) {
  const restored = j.side !== "AFTER";
  const conflicts = toAfter(repo, j);
  rmSync(jdir(repo), { recursive: true, force: true });
  return { restored, conflicts };
}

function toAfter(repo, j) {
  const conflicts = [];
  if (j.side !== "AFTER") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const f of j.files) {
      const abs = join(repo, f.path);
      const buf = readOrNull(abs);
      // a stylesheet caught mid-rescan carries our own trailing marker: that is still a known version, not an edit
      const now = sha(buf && buf.subarray(buf.length - RESCAN_MARK.length).equals(RESCAN_MARK) ? buf.subarray(0, buf.length - RESCAN_MARK.length) : buf);
      if (now === f.after) continue;
      if (now !== f.before) { // someone edited the BEFORE version (or a crash left something else): keep it
        const keep = join(repo, ".babysitter", "time-travel-conflicts", stamp, f.path);
        if (now !== null) { mkdirSync(dirname(keep), { recursive: true }); copyFileSync(abs, keep); conflicts.push(relative(repo, keep)); }
      }
      put(abs, blob(repo, f.after), f.mode);
    }
    j.side = "AFTER"; saveJournal(repo, j); // only once every file is back
  }
  return conflicts;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** Finish an interrupted swap (the process was killed while BEFORE was on disk). Safe to call any time. */
export function recover(repo) {
  repo = resolve(repo);
  if (!existsSync(jfile(repo))) return null;
  let j; try { j = JSON.parse(readFileSync(jfile(repo), "utf8")); } catch { return null; }
  if (j.pid !== process.pid && alive(j.pid) && Date.now() - Date.parse(j.started) < 6 * 3600_000) return { busy: j.pid }; // its owner is still reviewing
  return finish(repo, j);
}

/** Restore on Ctrl-C / kill / normal exit. Returns a disposer for the finally block. */
export function guard(tt, log = (m) => process.stderr.write(m + "\n")) {
  let done = false;
  const run = () => { if (done) return; done = true; try { const r = restore(tt); if (r.restored) log(`↩︎  Babysitter Studio: your changes (AFTER) are back on disk${r.conflicts.length ? `; edits made during the review kept in ${r.conflicts[0].replace(/\/[^/]*$/, "")}` : ""}.`); } catch (e) { log(`⚠️  Babysitter Studio could not restore AFTER: ${e.message}. Run \`babysitter restore\`.`); } };
  const onSig = (sig) => () => { run(); process.exit(sig === "SIGINT" ? 130 : 143); };
  const handlers = { SIGINT: onSig("SIGINT"), SIGTERM: onSig("SIGTERM"), SIGHUP: onSig("SIGHUP") };
  for (const [s, h] of Object.entries(handlers)) process.on(s, h);
  process.on("exit", run);
  return () => { run(); for (const [s, h] of Object.entries(handlers)) process.off(s, h); process.off("exit", run); };
}
