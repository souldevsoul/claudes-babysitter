// 5.8.1: the orphan sweep closes only headless Playwright browsers whose run is gone.
import assert from "node:assert/strict";
import { parseOrphans, reapOrphans, watchRun, alive } from "../lib/reap.js";
import { spawn } from "node:child_process";

let failed = 0;
const t = (name, fn) => { try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n  ${e.message}`); } };

const PW = "/Users/x/Library/Caches/ms-playwright/chromium-1200/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const prof = "--user-data-dir=/var/folders/ab/T/playwright_chromiumdev_profile-AbC123";
const ps = [
  `30044     1 ${PW} --headless --no-sandbox ${prof} --remote-debugging-pipe`,
  `30045 30044 ${PW} --type=renderer ${prof}`,
  `41000 40990 ${PW} --headless ${prof} --remote-debugging-pipe`,
  `  512     1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  `  777     1 ${PW} --headless=new --user-data-dir=/Users/x/Library/Caches/ms-playwright/mcp-chrome-9bd437a`,
  `  888     1 ${PW} --headless=new ${prof}`,
  `  999     1 ${PW} ${prof}`,
].join("\n");

t("an orphaned headless Playwright browser is selected", () => assert.ok(parseOrphans(ps).includes(30044)));
t("--headless=new is recognised", () => assert.ok(parseOrphans(ps).includes(888)));
t("a browser whose worker is alive is left alone", () => assert.ok(!parseOrphans(ps).includes(41000)));
t("child processes (--type=) are left alone", () => assert.ok(!parseOrphans(ps).includes(30045)));
t("the user's own Chrome is left alone", () => assert.ok(!parseOrphans(ps).includes(512)));
t("a Playwright MCP persistent profile is left alone", () => assert.ok(!parseOrphans(ps).includes(777)));
t("a headed browser is left alone", () => assert.ok(!parseOrphans(ps).includes(999)));
t("exactly the two orphans", () => assert.deepEqual(parseOrphans(ps), [30044, 888]));
t("empty / garbage input gives nothing", () => { assert.deepEqual(parseOrphans(""), []); assert.deepEqual(parseOrphans(undefined), []); });
t("reapOrphans logs the count and never throws on a dead pid", () => {
  const lines = []; const dead = `2147480000     1 ${PW} --headless ${prof}`;
  const pids = reapOrphans({ ps: dead, log: (s) => lines.push(s) });
  if (process.platform === "win32") return;
  assert.deepEqual(pids, [2147480000]);
  assert.match(lines[0], /closed 1 headless browser /);
});
t("the watchdog exits once the watched run is gone", () => {
  if (process.platform === "win32") return;
  const run = spawn(process.execPath, ["-e", "setTimeout(()=>{},60000)"], { stdio: "ignore" });
  const dog = watchRun(run.pid);
  assert.ok(dog > 0);
  run.kill("SIGKILL");
  const until = Date.now() + 9000;
  const up = () => alive(dog);
  while (up() && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  assert.ok(!up(), "watchdog still running 9 s after the run died");
});
t("BABYSITTER_NO_REAP=1 turns the sweep off", () => {
  process.env.BABYSITTER_NO_REAP = "1";
  try { assert.deepEqual(reapOrphans({ ps, log: () => {} }), []); } finally { delete process.env.BABYSITTER_NO_REAP; }
});

if (failed) { console.error(`${failed} failed`); process.exit(1); }
