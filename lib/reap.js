// 5.8.1: headless Chrome left running by a stopped run.
// Playwright starts each browser in a process group of its own. When the runner is killed outright — the 15 s SIGKILL in
// lib/forward.js, a wrapper's SIGKILL, a closed terminal — its workers die without closing their browsers, and every
// browser lives on under launchd with ~700 MB. On a 17 GB Mac five of them from earlier runs plus a live run of six
// pushed swap to 15 GB and filled the disk (2026-11-16).
// An orphan is a headless Chrome whose parent is launchd (ppid 1) and whose profile is a Playwright temporary profile.
// A browser of a run that is still going has its worker as parent, so a sweep never touches another live run.
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROFILE = /--user-data-dir=\S*playwright_chromiumdev_profile-/;

/** pids of orphaned Playwright browsers in `ps -axo pid=,ppid=,command=` output. */
export function parseOrphans(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m || m[2] !== "1") continue;
    const cmd = m[3];
    if (/\s--type=/.test(cmd) || !/\s--headless(?:=|\s|$)/.test(cmd) || !PROFILE.test(cmd)) continue;
    out.push(Number(m[1]));
  }
  return out;
}

/** Stop orphaned Playwright browsers; returns their pids. Never throws: a sweep must not fail a run. */
export function reapOrphans({ log = (s) => console.error(s), ps } = {}) {
  if (process.platform === "win32" || process.env.BABYSITTER_NO_REAP === "1") return [];
  let pids = [];
  try { pids = parseOrphans(ps ?? execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 16 << 20 })); }
  catch { return []; }
  for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch {} }
  if (pids.length) log(`babysitter: closed ${pids.length} headless browser${pids.length > 1 ? "s" : ""} an earlier stopped run left open`);
  return pids;
}

// A run killed with SIGKILL — the memory guard of an agent harness, `kill -9`, a closed terminal — never reaches the
// cleanup in lib/forward.js, so its browsers stayed open until the next run swept them. The watchdog is a detached
// node process in its own group: it outlives the run, checks every 2 s whether the run's pid is still there, sweeps the
// orphans once it is gone and exits. It holds no stdio and never keeps the run alive (unref).
/** Start a detached watchdog that sweeps orphans when `pid` exits; returns its pid (0 when it could not start). */
export function watchRun(pid = process.pid) {
  if (process.platform === "win32" || process.env.BABYSITTER_NO_REAP === "1") return 0;
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--watch", String(pid)], { detached: true, stdio: "ignore" });
    child.unref();
    return child.pid ?? 0;
  } catch { return 0; }
}

// a zombie (killed, not yet collected by its parent) counts as gone
export const alive = (pid) => {
  try { process.kill(pid, 0); } catch (e) { if (e.code !== "EPERM") return false; }
  try { return !/^Z/.test(execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim()); } catch { return false; }
};

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--watch") {
  const pid = Number(process.argv[3]);
  if (!pid) process.exit(0);
  const timer = setInterval(() => {
    if (alive(pid)) return;
    clearInterval(timer);
    // Playwright's browsers outlive their worker by a moment; sweep twice
    reapOrphans({ log: () => {} });
    setTimeout(() => { reapOrphans({ log: () => {} }); process.exit(0); }, 3000);
  }, 2000);
}
