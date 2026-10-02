// End-to-end: target dev server ← Studio proxy (+ bus) ← real browser panel, and the CLI review client.
import http from "node:http";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { startStudio, injectHtml } from "../lib/server.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { INJECT_TAG, PATH } from "../lib/protocol.js";
import WebSocket from "ws";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "studio.mjs");
const PAGE = `<!doctype html><html><head><title>t</title></head><body class="bg-white">
<main><h1>Settings</h1><select id="country"><option>DE</option></select><p class="faint" style="color:#ccc">fine print</p>
<script>window.snippet = "</body>";</script></main></body></html>`;
let LIVE = null; // a file of the test repo, served raw — stands in for the dev server re-rendering after HMR
const target = http.createServer((req, res) => {
  if (req.url === "/live" && LIVE) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(`<!doctype html><body><pre id="src">${readFileSync(LIVE, "utf8").replace(/</g, "&lt;")}</pre></body>`); }
  if (req.url === "/api") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE);
});
await new Promise((r) => target.listen(0, r));
const studio = await startStudio({ port: 0, target: `http://localhost:${target.address().port}`, log: () => {} });
const base = `http://localhost:${studio.port}`;
let n = 0;
const ok = (name) => { n++; console.log("  ✓", name); };

// review client in its own process (the bus and the browser keep running in this one)
const review = (problems, extra = []) => {
  const p = spawn(process.execPath, [BIN, "review", "--url", base, "--title", "Test review", "--timeout", "30", ...extra], { stdio: ["pipe", "pipe", "pipe"] });
  let err = "", out = ""; p.stderr.on("data", (d) => (err += d)); p.stdout.on("data", (d) => (out += d));
  p.stdin.end(JSON.stringify(problems));
  return { proc: p, done: new Promise((r) => p.on("exit", (code) => r({ code, err, out }))), get err() { return err; } };
};
const PROBLEMS = [
  { selector: "#country", message: "Native <select> — use the kit Select [1.1]" },
  { selector: "p.faint", message: "Inline style color:#ccc — contrast 1.6:1 [6.4]" },
  { file: "src/app/page.tsx", line: 4, message: "text-[#ccc] hard-codes a colour [6.5]" },
];

try {
  // 1. proxy + injection
  const html = await (await fetch(base + "/")).text();
  assert.equal(html.split(INJECT_TAG).length - 1, 1, "injected exactly once");
  assert.ok(html.indexOf(INJECT_TAG) > html.indexOf('window.snippet = "</body>"'), "before the LAST </body>, not the one in a script string");
  assert.equal(await (await fetch(base + "/api")).text(), '{"ok":true}');
  assert.match(await (await fetch(base + "/__babysitter/injector.js")).text(), /attachShadow/);
  assert.equal(injectHtml(injectHtml("<body></body>")).split(INJECT_TAG).length - 1, 1);
  ok("proxy passes everything through and injects the panel into HTML only, once, before the last </body>");

  // security: a foreign page cannot join as a panel, a browser cannot pose as the CLI, and the server is loopback-only
  const wsTry = (role, origin) => new Promise((r) => {
    const w = new WebSocket(base.replace("http", "ws") + PATH + "?role=" + role, origin ? { origin } : {});
    w.on("open", () => { w.close(); r("open"); }); w.on("error", () => r("refused")); w.on("unexpected-response", () => r("refused"));
  });
  assert.equal(await wsTry("studio", "https://evil.example"), "refused", "foreign origin cannot open a panel socket");
  assert.equal(await wsTry("studio", undefined), "refused", "a panel socket needs the proxy's origin");
  assert.equal(await wsTry("cli", "https://evil.example"), "refused", "a browser page cannot pose as the CLI");
  assert.equal(await wsTry("studio", base), "open");
  assert.equal(await wsTry("cli", undefined), "open");
  const { networkInterfaces } = await import("node:os");
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
  if (lan) assert.equal(await fetch(`http://${lan.address}:${studio.port}/`).then(() => "reachable", () => "unreachable"), "unreachable", "not reachable from the LAN");
  ok("cross-site WebSocket hijacking refused (foreign origin, origin-less panel, browser posing as CLI); loopback-only");

  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  const page = await browser.newPage();
  await page.goto(base + "/");
  await page.locator("#__babysitter-studio .status").filter({ hasText: "connected" }).waitFor({ timeout: 10000 });
  ok("panel mounts in a Shadow DOM and connects to the bus");

  // 2. review → overlays → comment → approve
  const r1 = review(PROBLEMS);
  await page.locator("#__babysitter-studio #approve").waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#__babysitter-studio .box").count(), 2, "one red frame per DOM problem, none for the file-only one");
  const frame = await page.locator("#__babysitter-studio .box").first().boundingBox();
  const sel = await page.locator("#country").boundingBox();
  assert.ok(Math.abs(frame.x - (sel.x - 3)) <= 1 && Math.abs(frame.width - (sel.width + 6)) <= 1, "frame sits on the element");
  assert.equal(await page.locator("#__babysitter-studio .list li").count(), 3);
  assert.equal(await page.locator("#__babysitter-studio .title").textContent(), "Babysitter: 3 problems");
  assert.match(r1.err, /⏳ Visual Review required\. Open http:\/\/localhost:\d+/);
  ok("REVIEW_REQUIRED draws red frames over the flagged elements, lists all problems, the CLI is frozen with the banner");

  // frames follow the element: DOM change (HMR-like) pushes it below the fold, then the page scrolls
  const frameOn = async (sel) => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const [f, e] = [await page.locator("#__babysitter-studio .box").first().boundingBox(), await page.locator(sel).boundingBox()];
    return Math.abs(f.y - (e.y - 3)) <= 1 && Math.abs(f.x - (e.x - 3)) <= 1;
  };
  await page.evaluate(() => { const d = document.createElement("div"); d.id = "spacer"; d.style.height = "2400px"; document.querySelector("main").prepend(d); });
  assert.ok(await frameOn("#country"), "frame moved with the DOM change");
  await page.mouse.wheel(0, 900);
  assert.ok(await frameOn("#country"), "frame follows the scroll");
  await page.locator("#__babysitter-studio .list li").first().click();
  await page.waitForFunction(() => { const r = document.querySelector("#country").getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight; }, null, { timeout: 5000 });
  assert.ok(await frameOn("#country"), "frame still on it after scrollIntoView");
  await page.evaluate(() => { document.getElementById("spacer").remove(); scrollTo(0, 0); });
  ok("frames track scroll, resize and DOM changes; clicking a problem scrolls its element into view");

  assert.ok(await page.locator("#__babysitter-studio #comment-send").isDisabled(), "Send Comment needs text");
  await page.locator("#__babysitter-studio #comment-text").fill("Use the kit Select here, please");
  await page.locator("#__babysitter-studio #comment-send").click();
  const c1 = await r1.done;
  assert.equal(c1.code, 1); assert.match(c1.out, /Reviewer comment: Use the kit Select here, please/);
  await page.locator("#__babysitter-studio .min").filter({ hasText: "Sent back" }).waitFor({ timeout: 5000 });
  ok("Send Comment unfreezes the CLI with exit 1 and the comment on stdout (the next iteration's brief)");

  const r1b = review(PROBLEMS);
  await page.locator("#__babysitter-studio #approve").waitFor({ timeout: 10000 });
  await page.locator("#__babysitter-studio #approve").click();
  const d1 = await r1b.done;
  assert.equal(d1.code, 0, d1.err); assert.match(d1.err, /Approved/);
  await page.locator("#__babysitter-studio .min").filter({ hasText: "Approved" }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator("#__babysitter-studio .box").count(), 0);
  ok("APPROVE ends the CLI with exit 0 and clears the frames");

  // Time Travel in the panel: frames hide while HEAD is shown, come back for AFTER; only an enum reaches the CLI
  const { requestReview } = await import("../lib/review-client.js");
  const sides = [];
  const rv = requestReview({ url: base, problems: PROBLEMS, diff: { files: 2 }, onToggle: (side) => { sides.push(side); return { side, files: 2 }; } });
  await page.locator("#__babysitter-studio .seg").waitFor({ timeout: 10000 });
  assert.ok(await page.locator("#__babysitter-studio .box").first().isVisible());
  assert.equal(await page.locator("#__babysitter-studio .seg button[data-side=AFTER]").getAttribute("aria-pressed"), "true", "After by default");
  await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]").click();
  await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 5000 });
  assert.equal(await page.locator("#__babysitter-studio .box").first().isVisible(), false, "frames hidden on BEFORE");
  assert.match(await page.locator("#__babysitter-studio .tt .info").textContent(), /Viewing HEAD/);
  await page.locator("#__babysitter-studio .seg button[data-side=AFTER]").click();
  await page.locator("#__babysitter-studio .panel:not(.before)").waitFor({ timeout: 5000 });
  assert.ok(await page.locator("#__babysitter-studio .box").first().isVisible(), "frames back on AFTER");
  await page.evaluate(() => { const w = new WebSocket(`ws://${location.host}/__babysitter/ws?role=studio`); w.onopen = () => w.send(JSON.stringify({ type: "TOGGLE_DIFF", reviewId: "x", side: "../../etc/passwd" })); });
  await page.locator("#__babysitter-studio #approve").click();
  assert.equal((await rv).decision, "approve");
  assert.deepEqual(sides, ["BEFORE", "AFTER"], "the CLI saw exactly the two valid toggles");
  await page.locator("#__babysitter-studio .min").filter({ hasText: "Approved" }).waitFor({ timeout: 5000 });
  ok("Before/After switch: After by default, panel turns amber and frames hide on BEFORE, reappear on AFTER");

  // 3. reject
  const r2 = review(PROBLEMS);
  await page.locator("#__babysitter-studio #reject").waitFor({ timeout: 10000 });
  await page.locator("#__babysitter-studio #comment-text").fill("Not this one");
  await page.locator("#__babysitter-studio #reject").click();
  const d2 = await r2.done;
  assert.equal(d2.code, 1); assert.match(d2.err, /Rejected in Studio: Not this one/);
  ok("REJECT ends the CLI with exit 1 (the commit is aborted)");

  // 4. a panel opened after the CLI asked still gets the review
  const r3 = review(PROBLEMS.slice(0, 1));
  await new Promise((r) => setTimeout(r, 400));
  const late = await browser.newPage();
  await late.goto(base + "/");
  await late.locator("#__babysitter-studio #approve").waitFor({ timeout: 10000 });
  await late.locator("#__babysitter-studio #approve").click();
  assert.equal((await r3.done).code, 0);
  ok("a panel that opens later is replayed the pending review");

  // 5. the CLI gives up → the panel drops the review
  const r4 = review(PROBLEMS.slice(0, 1));
  await page.locator("#__babysitter-studio #approve").waitFor({ timeout: 10000 });
  r4.proc.kill("SIGKILL");
  await page.locator("#__babysitter-studio .min").filter({ hasText: "stopped waiting" }).waitFor({ timeout: 5000 });
  ok("an abandoned review is taken off the panel");
  // 6. the real git pre-commit gate of Claude's Babysitter, with "studio": { "enabled": true }
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const repo = mkdtempSync(join(tmpdir(), "studio-git-"));
  try {
    mkdirSync(join(repo, "src/app"), { recursive: true });
    writeFileSync(join(repo, "package.json"), '{"name":"studio-git","dependencies":{"next":"16"}}');
    writeFileSync(join(repo, "src/app/page.tsx"), "export default function P(){ return <p>ok</p>; }\n");
    execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: repo });
    execSync(`node ${join(ROOT, "bin/ui-init.mjs")} . --new --link --no-install`, { cwd: repo, stdio: "ignore" });
    const cfg = JSON.parse(readFileSync(join(repo, "babysitter.config.json"), "utf8"));
    cfg.studio = { enabled: true, url: base, timeoutSec: 30 };
    writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify(cfg, null, 2));
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm babysitter --no-verify", { cwd: repo });
    const commit = (msg) => {
      const p = spawn("sh", ["-c", `git add -A && git -c user.email=t@t -c user.name=t commit -qm "${msg}"`], { cwd: repo });
      let err = ""; p.stderr.on("data", (d) => (err += d));
      return new Promise((r) => p.on("exit", (code) => r({ code, err })));
    };
    writeFileSync(join(repo, "src/app/page.tsx"), "export default function P(){ return <select />; }\n");
    const c1 = commit("needs review");
    await page.locator("#__babysitter-studio #approve").waitFor({ timeout: 30000 });
    assert.match(await page.locator("#__babysitter-studio .list").innerText(), /no-native-controls/);
    await page.locator("#__babysitter-studio #approve").click();
    const r1 = await c1;
    assert.equal(r1.code, 0, r1.err); assert.match(r1.err, /Approved in Studio/);
    assert.match(execSync("git log --oneline -1", { cwd: repo, encoding: "utf8" }), /needs review/);
    ok("git pre-commit → REVIEW_REQUIRED → Approve in the browser → the commit goes through");
    writeFileSync(join(repo, "src/app/page.tsx"), "export default function P(){ return <div><select /><select /></div>; }\n");
    const before = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" });
    const c2 = commit("rejected one");
    await page.locator("#__babysitter-studio #reject").waitFor({ timeout: 30000 });
    await page.locator("#__babysitter-studio #reject").click();
    const r2 = await c2;
    assert.notEqual(r2.code, 0); assert.match(r2.err, /Review rejected by user\. The commit is aborted/);
    assert.equal(execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }), before, "HEAD did not move");
    ok("Reject in the browser → the commit is aborted, HEAD unchanged");

    // the Claude Code Stop hook freezes the turn the same way (the rejected change is still uncommitted)
    const stopHook = () => {
      const p = spawn(process.execPath, [join(ROOT, "bin/hook-stop.mjs")], { cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
      let err = "", out = ""; p.stderr.on("data", (d) => (err += d)); p.stdout.on("data", (d) => (out += d));
      p.stdin.end("{}");
      return new Promise((r) => p.on("exit", (code) => r({ code, err, out })));
    };
    const h1 = stopHook();
    await page.locator("#__babysitter-studio #comment-text").waitFor({ timeout: 30000 });
    await page.locator("#__babysitter-studio #comment-text").fill("Swap both selects for the kit Select");
    await page.locator("#__babysitter-studio #comment-send").click();
    const s1 = await h1;
    assert.equal(s1.code, 2, "exit 2 = Claude Code feeds stderr back and keeps working");
    assert.match(s1.err, /Visual Review required/); assert.match(s1.err, /Reviewer comment[^\n]*\nSwap both selects for the kit Select/);
    const h2 = stopHook();
    await page.locator("#__babysitter-studio #approve").waitFor({ timeout: 30000 });
    await page.locator("#__babysitter-studio #approve").click();
    const s2 = await h2;
    assert.equal(s2.code, 0); assert.match(s2.out, /approved in Studio/);
    ok("Stop hook: frozen until the browser decides — comment → exit 2 with the brief for Claude, approve → the turn ends");

    // 7. Time Travel through the real Stop hook: Before (HEAD) swaps the file on disk, Approve puts AFTER back
    LIVE = join(repo, "src/app/page.tsx");
    const AFTER_SRC = readFileSync(LIVE, "utf8"), HEAD_SRC = "export default function P(){ return <select />; }\n";
    assert.notEqual(AFTER_SRC, HEAD_SRC);
    const h3 = stopHook();
    await page.locator("#__babysitter-studio .seg").waitFor({ timeout: 30000 });
    assert.match(await page.locator("#__babysitter-studio .tt .info").textContent(), /1 file\(s\) differ from HEAD/);
    await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]").click();
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    assert.equal(readFileSync(LIVE, "utf8"), HEAD_SRC, "HEAD version on disk");
    assert.ok(existsSync(join(repo, ".babysitter/time-travel/journal.json")), "journaled while BEFORE is on disk");
    const live = await browser.newPage(); await live.goto(base + "/live");
    assert.equal(await live.locator("#src").textContent(), HEAD_SRC, "the dev server renders the HEAD version");
    await page.locator("#__babysitter-studio .seg button[data-side=AFTER]").click();
    await page.locator("#__babysitter-studio .panel:not(.before)").waitFor({ timeout: 10000 });
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC);
    await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]").click();
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    await page.locator("#__babysitter-studio #approve").click(); // approve while viewing HEAD
    const s3 = await h3;
    assert.equal(s3.code, 0, s3.err);
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC, "AFTER back on disk when the review ends");
    assert.ok(!existsSync(join(repo, ".babysitter/time-travel")), "journal removed");
    assert.match(s3.err, /your changes \(AFTER\) are back on disk/);
    await live.reload(); assert.equal(await live.locator("#src").textContent(), AFTER_SRC);
    ok("Time Travel: Before (HEAD) swaps the files and the page shows HEAD; After and Approve put the work back");

    // the hook is killed while HEAD is on disk: SIGTERM → its guard restores; SIGKILL → the next hook recovers
    const h4 = spawn(process.execPath, [join(ROOT, "bin/hook-stop.mjs")], { cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    h4.stdin.end("{}");
    await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]").click({ timeout: 30000 });
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    h4.kill("SIGTERM"); await new Promise((r) => h4.on("exit", r));
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC, "SIGTERM → restored");
    const h5 = spawn(process.execPath, [join(ROOT, "bin/hook-stop.mjs")], { cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    h5.stdin.end("{}");
    await page.locator("#__babysitter-studio .min").filter({ hasText: "stopped waiting" }).waitFor({ timeout: 10000 }).catch(() => {});
    await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]").click({ timeout: 30000 });
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    h5.kill("SIGKILL"); await new Promise((r) => h5.on("exit", r));
    assert.equal(readFileSync(LIVE, "utf8"), HEAD_SRC, "SIGKILL leaves HEAD on disk…");
    execSync(`node ${join(ROOT, "bin/babysitter.mjs")} restore`, { cwd: repo });
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC, "…and `babysitter restore` (or any hook) puts AFTER back");
    ok("hook killed while viewing HEAD: SIGTERM restores at once, SIGKILL is recovered from the journal");
  } finally { rmSync(repo, { recursive: true, force: true }); }

  await browser.close();
} finally {
  await studio.close();
  target.close();
}

// 6. no studio → exit 2 so the git hook can fall back to plain blocking
const r5 = spawn(process.execPath, [BIN, "review", "--url", "http://localhost:9"], { stdio: ["pipe", "pipe", "pipe"] });
r5.stdin.end("[]");
assert.equal(await new Promise((r) => r5.on("exit", r)), 2);
ok("no studio running → exit 2");
console.log(`studio: ${n} end-to-end cases passed`);
