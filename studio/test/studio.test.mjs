// End-to-end: target dev server ← Studio proxy (+ bus) ← real browser panel, and the CLI review client.
import http from "node:http";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { startStudio, injectHtml } from "../lib/server.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { INJECT_TAG, PATH } from "../lib/protocol.js";
import WebSocket from "ws";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "studio.mjs");
const PAGE = `<!doctype html><html><head><title>t</title></head><body class="bg-white">
<main><h1>Settings</h1><select id="country"><option>DE</option></select><p class="faint" style="color:#ccc">fine print</p>
<script>window.snippet = "</body>";</script></main></body></html>`;
const target = http.createServer((req, res) => {
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
  let err = ""; p.stderr.on("data", (d) => (err += d));
  p.stdin.end(JSON.stringify(problems));
  return { proc: p, done: new Promise((r) => p.on("exit", (code) => r({ code, err }))), get err() { return err; } };
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
  ok("REVIEW_REQUIRED draws red frames over the flagged elements and lists all problems");
  await page.locator("#__babysitter-studio #comment-text").fill("Use the kit Select here, please");
  await page.locator("#__babysitter-studio #comment-send").click();
  await page.waitForFunction(() => true, null, { timeout: 500 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  assert.match(r1.err, /💬 Use the kit Select here, please/);
  ok("COMMENT reaches the waiting CLI without ending the review");
  await page.locator("#__babysitter-studio #approve").click();
  const d1 = await r1.done;
  assert.equal(d1.code, 0, d1.err); assert.match(d1.err, /Approved/);
  await page.locator("#__babysitter-studio .min").filter({ hasText: "Approved" }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator("#__babysitter-studio .box").count(), 0);
  ok("APPROVE ends the CLI with exit 0 and clears the frames");

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
    assert.notEqual(r2.code, 0); assert.match(r2.err, /Rejected in Studio\. The commit is aborted/);
    assert.equal(execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }), before, "HEAD did not move");
    ok("Reject in the browser → the commit is aborted, HEAD unchanged");
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
