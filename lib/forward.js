// 5.5.0 (Compass, issue #5): `babysitter e2e` killed by a wrapper's SIGTERM / SIGALRM exited, and its Playwright child
// ran on for 40 minutes with its browsers, outside any lock (spawnSync: a parent blocked in it cannot react to a
// signal). The child runs asynchronously; a signal the parent gets is passed on, a second one (or 15 s) kills it, and
// the parent exits with 128 + the signal number once the child is gone.
import { spawn } from "node:child_process";
import os from "node:os";

const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP", "SIGALRM", "SIGQUIT"];
/** Run `cmd args` like spawnSync(…, { stdio: "inherit" }), forwarding signals. Resolves to the exit status. */
export function forward(cmd, args, opts = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, opts);
    let got = null;
    const on = (sig) => {
      if (got) { try { child.kill("SIGKILL"); } catch {} return; }
      got = sig;
      try { child.kill(sig); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 15_000).unref();
    };
    for (const s of SIGNALS) process.on(s, on);
    child.on("error", (e) => { console.error(`babysitter: ${e.message}`); });
    child.on("close", (code, sig) => {
      for (const s of SIGNALS) process.off(s, on);
      const n = got || sig ? 128 + (os.constants.signals[got || sig] || 15) : code ?? 1;
      if (got) { console.error(`babysitter: stopped by ${got} — the child run was stopped with it`); process.exit(n); }
      done(n);
    });
  });
}
