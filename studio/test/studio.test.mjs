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
<section class="cards"><div class="card flex gap-2"><button class="btn px-4 hover:bg-red-500" onclick="window.appClicks=(window.appClicks||0)+1">Save</button></div><div class="card flex gap-2"><button class="btn px-4 hover:bg-red-500" onclick="window.appClicks=(window.appClicks||0)+1">Save</button></div></section>
<div id=":r1:"><span>generated id</span></div><div id="base-ui-_R_4j9bn5rlb_"><button class="pick-me"><span class="flex flex-1">Неделя</span></button></div><button aria-label='Период: "Выручка"'>x</button><ul><li>a</li><li>b</li><li><a href="/x">c</a></li></ul>
<div class="tall-tail" aria-hidden="true" style="height:1400px"></div>
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
  // a Before/After switch reloads the page once the swap is done: click, then wait for that reload
  const clickSide = async (side, opts = {}) => {
    const nav = page.waitForEvent("framenavigated", { predicate: (f) => f === page.mainFrame(), timeout: 30000 });
    // the live switch (files swapped under the dev server) is the ↻ button; the segmented switch compares snapshots
    await page.locator("#__babysitter-studio #live").click(opts);
    await nav;
  };

  await page.goto(base + "/");
  await page.locator("#__babysitter-studio .status").filter({ hasText: "connected" }).waitFor({ timeout: 10000 });
  ok("panel mounts in a Shadow DOM and connects to the bus");

  // 2. review → overlays → comment → approve
  const r1 = review(PROBLEMS);
  await page.locator("#__babysitter-studio #approve").waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#__babysitter-studio .box").count(), 2, "one red frame per DOM problem, none for the file-only one");
  const frame = await page.locator("#__babysitter-studio .box").first().boundingBox();
  const sel = await page.locator("#country").boundingBox();
  assert.ok(Math.abs(frame.x - (sel.x - 8)) <= 1 && Math.abs(frame.width - (sel.width + 16)) <= 1, "frame wraps the element with 6px of air");
  assert.ok(frame.x < sel.x - 5 && frame.y < sel.y - 5, "never touching the element's own edge");
  assert.equal(await page.locator("#__babysitter-studio .list li").count(), 3);
  assert.equal(await page.locator("#__babysitter-studio .title").textContent(), "Babysitter: 3 problems");
  assert.match(r1.err, /⏳ Visual Review required\. Open http:\/\/localhost:\d+/);
  ok("REVIEW_REQUIRED draws red frames over the flagged elements, lists all problems, the CLI is frozen with the banner");

  // frames follow the element: DOM change (HMR-like) pushes it below the fold, then the page scrolls
  const frameOn = async (sel) => {
    // let a smooth scroll finish first: the frame follows the element one animation frame later
    await page.evaluate(() => new Promise((r) => { let last = -1, still = 0; const tick = () => { if (scrollY === last && ++still >= 3) return r(); if (scrollY !== last) still = 0; last = scrollY; requestAnimationFrame(tick); }; tick(); }));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const [f, e] = [await page.locator("#__babysitter-studio .box").first().boundingBox(), await page.locator(sel).boundingBox()];
    return Math.abs(f.y - (e.y - 8)) <= 1 && Math.abs(f.x - (e.x - 8)) <= 1;
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

  // a smooth-scroll library (Lenis-like: every wheel on the window is cancelled and replayed as a page scroll)
  // must not steal the wheel from the panel's list — and the page outside the panel keeps scrolling
  await page.evaluate(() => {
    window.__smooth = (e) => { e.preventDefault(); window.scrollBy(0, e.deltaY); };
    window.addEventListener("wheel", window.__smooth, { passive: false });
    const st = document.createElement("style"); st.id = "short-list"; st.textContent = ".list{max-height:40px!important}";
    document.querySelector("#__babysitter-studio").shadowRoot.append(st);
  });
  const lb = await page.locator("#__babysitter-studio .list").boundingBox();
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(() => document.querySelector("#__babysitter-studio").shadowRoot.querySelector(".list").scrollTop > 0, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => scrollY), 0, "the page did not move under the panel");
  await page.mouse.move(lb.x + lb.width / 2, 20);
  await page.mouse.wheel(0, 300);
  await page.waitForFunction(() => scrollY > 0, null, { timeout: 5000 });
  await page.evaluate(() => { window.removeEventListener("wheel", window.__smooth); document.querySelector("#__babysitter-studio").shadowRoot.getElementById("short-list").remove(); scrollTo(0, 0); });
  ok("the problem list scrolls under a smooth-scroll library (Lenis) that takes the wheel; the page still scrolls outside the panel");

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
  // a switch reloads the page once the swap is done (the browser then shows what the dev server rebuilt)
  const reloaded = () => page.waitForEvent("framenavigated", { predicate: (f) => f === page.mainFrame(), timeout: 10000 });
  await page.evaluate(() => scrollTo(0, 120));
  assert.equal(await page.evaluate(() => scrollY), 120);
  await page.locator("#__babysitter-studio #comment-text").fill("draft that must survive");
  let nav = reloaded();
  await clickSide("BEFORE");
  await nav; await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 5000 });
  await page.waitForFunction(() => scrollY === 120, null, { timeout: 3000 }).catch(() => {});
  assert.equal(await page.evaluate(() => scrollY), 120, "the reload keeps the reader's scroll position");
  assert.equal(await page.locator("#__babysitter-studio #comment-text").inputValue(), "draft that must survive", "and the comment draft");
  await page.locator("#__babysitter-studio #comment-text").fill("");
  assert.equal(await page.locator("#__babysitter-studio .box").first().isVisible(), false, "frames hidden on BEFORE");
  assert.match(await page.locator("#__babysitter-studio .tt .info").textContent(), /Viewing HEAD/);
  nav = reloaded();
  await clickSide("AFTER");
  await nav; await page.locator("#__babysitter-studio .panel:not(.before) .seg").waitFor({ timeout: 5000 });
  await page.evaluate(() => scrollTo(0, 0));
  assert.ok(await page.locator("#__babysitter-studio .box").first().isVisible(), "frames back on AFTER");
  await page.evaluate(() => { const w = new WebSocket(`ws://${location.host}/__babysitter/ws?role=studio`); w.onopen = () => w.send(JSON.stringify({ type: "TOGGLE_DIFF", reviewId: "x", side: "../../etc/passwd" })); });
  await page.locator("#__babysitter-studio #approve").click();
  assert.equal((await rv).decision, "approve");
  assert.deepEqual(sides, ["BEFORE", "AFTER"], "the CLI saw exactly the two valid toggles");
  await page.locator("#__babysitter-studio .min").filter({ hasText: "Approved" }).waitFor({ timeout: 5000 });
  ok("Before/After switch: After by default, panel turns amber and frames hide on BEFORE, reappear on AFTER");

  // ───── Visual Prompting ─────
  // the selector generator: every element on the page gets a selector that matches exactly that element
  const pk = await page.evaluate(() => {
    const els = [...document.body.querySelectorAll("*")].filter((e) => e.id !== "__babysitter-studio" && e.localName !== "script");
    const bad = els.filter((e) => { const s = window.__babysitterSelector(e); const m = document.querySelectorAll(s); return m.length !== 1 || m[0] !== e; }).map((e) => e.outerHTML.slice(0, 60));
    const btn = document.querySelectorAll(".cards button")[1];
    return { bad, n: els.length, btn: window.__babysitterSelector(btn), gen: window.__babysitterSelector(document.querySelector("[id=':r1:'] span")) + " " + window.__babysitterSelector(document.querySelector(".pick-me")), aria: window.__babysitterSelector(document.querySelector("[aria-label^='Период']")) };
  });
  assert.deepEqual(pk.bad, [], "every selector is unique and points back to its element");
  assert.match(pk.btn, /nth-child\(2\)/); assert.doesNotMatch(pk.btn, /hover:/, "utility classes with variants are skipped");
  assert.equal(pk.aria, 'button[aria-label="Период: \\"Выручка\\""]', "attribute values stay readable (grep-able)");
  assert.doesNotMatch(pk.gen, /:r1:|_R_|base-ui/, "generated React / UI-kit ids are skipped (:r1:, _R_4j9bn5rlb_)");
  ok(`unique selector for all ${pk.n} elements (ids, attributes, stable classes, nth-child; no generated ids / variant classes)`);

  // point, click, write, Enter
  const ps = "#__babysitter-studio";
  await page.locator(`${ps} #inspect`).click();
  assert.equal(await page.locator(`${ps} #inspect`).getAttribute("aria-pressed"), "true");
  const target2 = page.locator(".cards button").nth(1);
  const tb = await target2.boundingBox();
  await page.mouse.move(tb.x + 5, tb.y + 5); await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 4 });
  await page.waitForFunction(() => { const h = document.getElementById("__babysitter-studio").shadowRoot.querySelector(".hover"); return h.style.display === "block"; });
  await page.waitForTimeout(120); // the 60 ms glide
  const hb = await page.locator(`${ps} .hover`).boundingBox();
  assert.ok(Math.abs(hb.x - (tb.x - 2)) <= 1 && Math.abs(hb.width - (tb.width + 4)) <= 1, "blue frame on the hovered element");
  assert.match(await page.locator(`${ps} .hover .label`).textContent(), /^button\.btn\.px-4\s+\d+×\d+$/);
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  assert.equal(await page.evaluate(() => window.appClicks), undefined, "the app never sees the picking click");
  await page.locator(`${ps} .pop`).waitFor({ state: "visible" });
  const pb = await page.locator(`${ps} .pop`).boundingBox();
  assert.ok(pb.y >= tb.y + tb.height || pb.y + pb.height <= tb.y, "popup sits next to the element, not over it");
  assert.equal(await page.locator(`${ps} .pop .sel`).textContent(), pk.btn);
  await page.keyboard.type("Make it secondary");
  await page.keyboard.press("Enter");
  await page.locator(`${ps} .sec`).filter({ hasText: "Manual Feedback · 1" }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator(`${ps} #inspect`).getAttribute("aria-pressed"), "false", "picking ends after Save");
  const nb = await page.locator(`${ps} .box.note`).boundingBox();
  assert.ok(Math.abs(nb.x - (tb.x - 8)) <= 1, "the note keeps a blue frame on its element");
  await target2.click(); assert.equal(await page.evaluate(() => window.appClicks), 1, "the page is clickable again");

  // Esc: unlock, then leave; Alt+↑ goes to the parent
  await page.locator(`${ps} #inspect`).click();
  await page.mouse.move(tb.x + 4, tb.y + 4); await page.mouse.move(tb.x + 6, tb.y + 6);
  await page.waitForFunction(() => /^button/.test(document.getElementById("__babysitter-studio").shadowRoot.querySelector(".hover .label").textContent));
  await page.keyboard.press("Alt+ArrowUp");
  assert.match(await page.locator(`${ps} .hover .label`).textContent(), /^div\.card\.flex/);
  await page.mouse.click(tb.x + 6, tb.y + 6);
  await page.locator(`${ps} .pop`).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator(`${ps} .pop`).waitFor({ state: "hidden" });
  await page.mouse.click(5, 5); // click on empty page while picking → nothing locked under a stale target
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator(`${ps} .pop`).waitFor({ state: "hidden" });
  if ((await page.locator(`${ps} #inspect`).getAttribute("aria-pressed")) === "true") await page.locator(`${ps} #inspect`).click();
  // pointing at the <span> inside a button picks the button; Shift picks the span itself
  await page.locator(`${ps} #inspect`).click();
  const inner = await page.locator(".pick-me span").boundingBox();
  await page.mouse.move(inner.x + 2, inner.y + 2); await page.mouse.move(inner.x + 4, inner.y + 4);
  await page.waitForFunction(() => /^button\.pick-me/.test(document.getElementById("__babysitter-studio").shadowRoot.querySelector(".hover .label").textContent));
  await page.keyboard.down("Shift"); await page.mouse.move(inner.x + 5, inner.y + 5);
  await page.waitForFunction(() => /^span\.flex\.flex-1/.test(document.getElementById("__babysitter-studio").shadowRoot.querySelector(".hover .label").textContent));
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(`${ps} #inspect`).getAttribute("aria-pressed"), "false", "Esc leaves picking");
  ok("🎯 Inspect: smooth blue hover frame with a label, click locks it and opens the popup next to it, Enter saves; the app never gets the clicks; snaps to the button around a <span> (Shift = exact); Esc and Alt+↑ work");

  // the note leaves with Reject, formatted for Claude
  const r6 = review(PROBLEMS.slice(0, 1));
  await page.locator(`${ps} #reject`).waitFor({ timeout: 10000 });
  assert.equal(await page.locator(`${ps} .box.note`).count(), 1, "blue and red frames together");
  await page.locator(`${ps} #reject`).click();
  const d6 = await r6.done;
  assert.equal(d6.code, 1);
  assert.ok(d6.out.includes(`Manual QA Feedback:\n- Element: \`${pk.btn}\`\n- Instruction: "Make it secondary"`), d6.out);
  await page.locator(`${ps} .min`).filter({ hasText: "Rejected" }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator(`${ps} .box.note`).count(), 0, "delivered notes leave the page");
  ok("Reject carries the manual notes to the CLI as \"Manual QA Feedback\" (Element + Instruction), then clears them");
  await page.locator(`${ps} .min`).filter({ hasText: "Watching" }).waitFor({ timeout: 5000 });

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

  // ── Before/After by snapshots: a base-ref dev server (worktree) + captures at the reviewer's view ──
  {
    const { requestReview } = await import("../lib/review-client.js");
    const proj = mkdtempSync(join(tmpdir(), "studio-cmp-"));
    const server = `const http=require("http"),fs=require("fs");const i=process.argv.indexOf("--port");const port=+(i>0?process.argv[i+1]:process.env.PORT);http.createServer((q,r)=>{r.writeHead(200,{"content-type":"text/html; charset=utf-8"});r.end(fs.readFileSync(__dirname+"/index.html"))}).listen(port,"127.0.0.1",()=>console.log("up "+port));`;
    const html = (color) => `<!doctype html><html><head><style>body{margin:0;font:16px sans-serif;background:#fff}h1{margin:0;padding:40px;font-size:48px}.tall{height:2600px}.low{padding:40px;font-size:32px}</style></head><body><h1 id="t" style="color:${color}">Title</h1><p>same text</p><p id="tick" style="font:24px monospace">-</p><p class="blink" id="blink">|</p><style>@keyframes b{50%{opacity:0}}.blink{animation:b 1s steps(1) infinite;font-size:32px}</style><script>setInterval(()=>{document.getElementById("tick").textContent=(Date.now()%100000)+" "+Math.random().toFixed(6)},37)</script><div class="tall"></div><p class="low" style="color:${color}">low line</p></body></html>`;
    writeFileSync(join(proj, "server.js"), server);
    writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "cmp", scripts: { dev: "node server.js" } }));
    writeFileSync(join(proj, "index.html"), html("#ff0000"));
    execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm v1", { cwd: proj });
    writeFileSync(join(proj, "index.html"), html("#0000ff")); // the reviewer's change, uncommitted
    const afterSrv = spawn(process.execPath, [join(proj, "server.js"), "--port", "0"], { cwd: proj });
    // port 0 is not printed back by the fixture: pick one
    afterSrv.kill();
    const { createServer } = await import("node:net");
    const freePort = () => new Promise((r) => { const s2 = createServer(); s2.listen(0, "127.0.0.1", () => { const { port } = s2.address(); s2.close(() => r(port)); }); });
    const ap = await freePort();
    const after = spawn(process.execPath, [join(proj, "server.js"), "--port", String(ap)], { cwd: proj });
    await new Promise((r) => after.stdout.once("data", r));
    // a Studio killed mid-cleanup leaves a half-deleted worktree of the base behind: it must not be reused
    const sha = execSync("git rev-parse HEAD", { cwd: proj, encoding: "utf8" }).trim();
    const leftover = join(tmpdir(), `babysitter-base-${proj.split("/").pop()}-${sha.slice(0, 12)}`);
    mkdirSync(leftover, { recursive: true }); writeFileSync(join(leftover, ".git"), "gitdir: /nowhere\n");
    const studio2 = await startStudio({ port: 0, target: `http://127.0.0.1:${ap}`, log: () => {} });
    const base2 = `http://localhost:${studio2.port}`;
    try {
      const rv = requestReview({ url: base2, title: "Compare", timeoutMs: 120000, problems: [{ selector: "#t", message: "demo" }], diff: { repo: proj, base: "HEAD", files: 1 } });
      const p2 = await browser.newPage({ viewport: { width: 900, height: 600 } });
      let navs = 0; p2.on("framenavigated", (f) => { if (f === p2.mainFrame()) navs++; });
      await p2.goto(base2 + "/");
      const ps = "#__babysitter-studio";
      await p2.locator(`${ps} .seg button[data-side=BEFORE]:not([disabled])`).waitFor({ timeout: 20000 });
      navs = 0;
      const pixel = (sel, x, y) => p2.evaluate(async ([sel, x, y]) => {
        const img = document.getElementById("__babysitter-studio").shadowRoot.querySelector(sel);
        await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data; return [d[0], d[1], d[2]];
      }, [sel, x, y]);
      const tb = await p2.locator("#t").boundingBox();
      const glyph = async (sel) => { // the darkest pixel along the heading's text row: its colour
        for (let x = tb.x + 40; x < tb.x + 200; x += 2) { const c = await pixel(sel, x, tb.y + tb.height / 2); if (Math.min(...c) < 200) return c; } return null;
      };
      await p2.locator(`${ps} .seg button[data-side=BEFORE]`).click();
      await p2.locator(`${ps} .cmp.on`).waitFor({ timeout: 90000 });
      const red = await glyph(".cmp img.b"), blue = await glyph(".cmp img.a");
      assert.ok(red && red[0] > 180 && red[2] < 80, `BEFORE heading is red: ${red}`);
      assert.ok(blue && blue[2] > 180 && blue[0] < 80, `AFTER heading is blue: ${blue}`);
      assert.equal(navs, 0, "no reload");
      assert.equal(execSync("git status --porcelain", { cwd: proj, encoding: "utf8" }).trim(), "M index.html", "the reviewer's files are not touched");
      ok("Before shows a snapshot of the base ref from its own dev server, at the reviewer's view — no reload, files untouched");

      // flip instantly with B, slider, differences
      await p2.keyboard.press("b");
      assert.equal(await p2.locator(`${ps} .seg button[aria-pressed=true]`).getAttribute("data-side"), "AFTER");
      assert.ok(await p2.locator(`${ps} .cmp img.a`).isVisible() && !(await p2.locator(`${ps} .cmp img.b`).isVisible()), "B flips to the AFTER snapshot");
      assert.ok(await p2.locator(`${ps} .box`).first().isVisible(), "frames are back on the AFTER side");
      await p2.keyboard.press("b");
      assert.ok(await p2.locator(`${ps} .cmp img.b`).isVisible());
      await p2.locator(`${ps} #cmp-slider`).click();
      assert.ok(await p2.locator(`${ps} .cmp .handle`).isVisible() && await p2.locator(`${ps} .cmp img.a`).isVisible() && await p2.locator(`${ps} .cmp img.b`).isVisible(), "slider shows both");
      await p2.locator(`${ps} #cmp-diff`).click();
      await p2.locator(`${ps} .tt .info`).filter({ hasText: /changed area/ }).waitFor({ timeout: 10000 });
      // a JS ticker (Date.now + Math.random) and an endless CSS blink are identical on both sides: frozen clock,
      // seeded random, parked animations — so the only changed area is the heading whose colour changed
      assert.equal(await p2.locator(`${ps} .tt .info`).textContent(), "1 changed area(s) highlighted");
      await p2.locator(`${ps} #cmp-diff`).click(); await p2.locator(`${ps} #cmp-slider`).click();
      ok("B flips instantly; the slider shows both sides; Differences counts the changed areas");

      // scrolling re-captures where the reader stops
      await p2.evaluate(() => scrollTo(0, 2500));
      await p2.locator(`${ps} .cmp.on`).waitFor({ state: "hidden", timeout: 5000 });
      await p2.locator(`${ps} .cmp.on`).waitFor({ timeout: 60000 });
      const low = await p2.locator(".low").boundingBox();
      const lowRed = await (async () => { for (let x = low.x + 40; x < low.x + 200; x += 2) { const c = await pixel(".cmp img.b", x, low.y + low.height / 2); if (Math.min(...c) < 200) return c; } })();
      assert.ok(lowRed && lowRed[0] > 180 && lowRed[2] < 80, `re-captured at the new scroll position: ${lowRed}`);
      await p2.keyboard.press("Escape");
      await p2.locator(`${ps} .cmp.on`).waitFor({ state: "hidden", timeout: 5000 });
      assert.equal(navs, 0);
      ok("scrolling re-captures at the new position; Esc returns to the live page; still no reload");

      // the bus refuses a path that would leave the dev server
      const rid = (await p2.locator(`${ps} .status`).textContent()).replace(/^review /, "");
      const bad = await p2.evaluate((rid) => new Promise((r) => { const w = new WebSocket(`ws://${location.host}/__babysitter/ws?role=studio`); w.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "COMPARE_FAILED" && m.reqId === "evil") { w.close(); r(m.error); } }; w.onopen = () => w.send(JSON.stringify({ type: "COMPARE", reviewId: rid, reqId: "evil", path: "//evil.example/" })); }), rid);
      assert.equal(bad, "bad path", "a capture can only open a path on the dev servers, never another host");
      await p2.locator(`${ps} #approve`).click();
      assert.equal((await rv).decision, "approve");
      await p2.close();
    } finally {
      await studio2.close();
      after.kill();
    }
    const wt = execSync("git worktree list", { cwd: proj, encoding: "utf8" }).trim().split("\n");
    assert.equal(wt.length, 1, `the base worktree is removed on close: ${wt.join(" | ")}`);
    rmSync(proj, { recursive: true, force: true });
    ok("closing Studio stops the base dev server and removes its worktree");
  }

  // ── what a reviewer reads: plain-language findings, grouped; a movable panel; Before/After always present ──
  {
    const { requestReview } = await import("../lib/review-client.js");
    const human = { kind: "dropdown", name: "€ EUR", place: { area: "header" } };
    const boundary = (route, selector) => ({ check: "control boundary [1.9]", what: "input barely visible at rest (border 1.43:1, fill 1.00:1) [1.9, P09]", human, route, selector });
    const rv = requestReview({ url: base, title: "Explained", timeoutMs: 30000, problems: [
      { check: "inline style [DOM]", what: "inline font-size", props: ["font-size"], human: { kind: "heading", name: "Settings" }, route: "/", selector: "h1" },
      boundary("/", "#country"), boundary("/", "select#country"), boundary("/pricing", "#country"),
      { ...boundary("/pricing", "select#country"), human: { ...human, place: { area: "footer" } } },
      { check: "native control [1.1]", what: "native <input type=checkbox>", human: { kind: "checkbox", name: "I agree", place: { area: "form", title: "Create Account" } }, route: "/", selector: "p.faint" },
    ] });
    const ps = "#__babysitter-studio";
    await page.locator(`${ps} #approve`).waitFor({ timeout: 10000 });
    assert.equal(await page.locator(`${ps} .list li[data-g]`).count(), 3, "5 visible findings → 2 entries: the same switch on 2 pages / 4 places (header and footer) is one; + 1 code-only");
    assert.equal(await page.locator(`${ps} .title`).textContent(), "Babysitter: 3 problems");
    assert.deepEqual(await page.locator(`${ps} .filters button`).allInnerTexts(), ["Visible · 2", "In code · 1"], "no Fixed chip when nothing was fixed");
    // style= changes nothing a person can see: listed after the visible ones, under its own heading, yellow
    assert.match(await page.locator(`${ps} .list li[data-g]`).last().innerText(), /Style hard-coded on the element/);
    assert.equal(await page.locator(`${ps} .list li[data-g]`).last().locator(".n.code").count(), 1);
    assert.match(await page.locator(`${ps} .list li.sep`).innerText(), /Not visible on the page — only in the code \(1\)/);
    assert.equal(await page.locator(`${ps} .box.code`).count(), 1, "the h1 gets a yellow frame");
    assert.equal(await page.locator(`${ps} .box.code .tag`).textContent(), "3");
    assert.equal(await page.locator(`${ps} .box.code`).evaluate((e) => getComputedStyle(e).borderTopColor), "rgb(234, 179, 8)");
    assert.equal(await page.locator(`${ps} .box:not(.code)`).first().evaluate((e) => getComputedStyle(e).borderTopColor), "rgb(239, 68, 68)", "visible defects stay red");
    const first = await page.locator(`${ps} .list li[data-g]`).first().innerText();
    assert.match(first, /The control's edge is barely visible/);
    assert.match(first, /Dropdown «€ EUR» in the site header and in the footer · on 2 pages · 4 places/);
    assert.match(first, /3:1 \(WCAG 1\.4\.11\).*border is 1\.43:1/s);
    assert.match(first, /→ Give it the theme's input border/);
    assert.ok(!(await page.locator(`${ps} .list li[data-g] .tech`).first().isVisible()), "selectors stay out of the way");
    await page.locator(`${ps} [data-more]`).first().click();
    assert.match(await page.locator(`${ps} .list li[data-g] .tech`).first().innerText(), /#country/);
    assert.equal(await page.locator(`${ps} .box:not(.code)`).first().locator(".tag").textContent(), "1", "frames carry the entry's number");
    ok("findings say what is wrong, why and how to fix it, name the element as a person would, and group repeats; code-only ones (style=) come last with yellow frames");

    // Before/After is always there; without a repository it is off and says why
    assert.ok(await page.locator(`${ps} .seg button[data-side=BEFORE]`).isDisabled());
    assert.match(await page.locator(`${ps} .tt .info`).textContent(), /needs the review's repository/);
    ok("Before/After is always shown; off with the reason when the review has no repository");

    // the panel moves, remembers where, folds, and goes back on double-click
    const hb = await page.locator(`${ps} .head`).boundingBox(), pb0 = await page.locator(`${ps} .panel`).boundingBox();
    await page.mouse.move(hb.x + 40, hb.y + hb.height / 2); await page.mouse.down();
    await page.mouse.move(hb.x - 200, hb.y + 40, { steps: 6 }); await page.mouse.up();
    const pb1 = await page.locator(`${ps} .panel`).boundingBox();
    assert.ok(Math.abs(pb1.x - (pb0.x - 240)) <= 2 && Math.abs(pb1.y - (pb0.y + 40 - hb.height / 2)) <= 2, `moved ${JSON.stringify([pb0, pb1])}`);
    // it cannot be dragged out of the window
    const hb1 = await page.locator(`${ps} .head`).boundingBox();
    await page.mouse.move(hb1.x + 40, hb1.y + 10); await page.mouse.down(); await page.mouse.move(hb1.x - 2000, hb1.y - 2000, { steps: 4 }); await page.mouse.up();
    const pbc = await page.locator(`${ps} .panel`).boundingBox();
    assert.ok(pbc.x === 8 && pbc.y === 8, `clamped ${JSON.stringify(pbc)}`);
    await page.mouse.move(pbc.x + 40, pbc.y + 10); await page.mouse.down(); await page.mouse.move(pb1.x + 40, pb1.y + 10, { steps: 4 }); await page.mouse.up();
    await page.reload(); await page.locator(`${ps} #approve`).waitFor({ timeout: 10000 });
    const pb2 = await page.locator(`${ps} .panel`).boundingBox();
    assert.ok(Math.abs(pb2.x - pb1.x) <= 2 && Math.abs(pb2.y - pb1.y) <= 2, "the place survives a reload");
    await page.locator(`${ps} #collapse`).click();
    assert.ok(!(await page.locator(`${ps} .list`).isVisible()), "folded to its header");
    await page.locator(`${ps} #collapse`).click();
    await page.locator(`${ps} .head`).dblclick({ position: { x: 30, y: 10 } });
    const pb3 = await page.locator(`${ps} .panel`).boundingBox();
    assert.ok(Math.abs(pb3.x - pb0.x) <= 2 && Math.abs(pb3.y + pb3.height - (pb0.y + pb0.height)) <= 2, "double-click puts it back");
    // frames off: the page is clean for comparing; clicking an entry shows that entry's frame for a moment
    await page.locator(`${ps} #frames`).click();
    assert.equal(await page.locator(`${ps} .box`).first().isVisible(), false, "frames hidden");
    await page.locator(`${ps} .list li[data-g]`).nth(1).click();
    await page.locator(`${ps} .box.peek`).first().waitFor({ state: "visible", timeout: 3000 });
    await page.locator(`${ps} .box.peek`).first().waitFor({ state: "hidden", timeout: 5000 });
    await page.locator(`${ps} #frames`).click();
    assert.ok(await page.locator(`${ps} .box`).first().isVisible(), "frames back");
    // EN ↔ RU, remembered across reloads
    await page.locator(`${ps} #lang`).click();
    assert.match(await page.locator(`${ps} .list li[data-g]`).first().innerText(), /Границы элемента управления почти не видно/);
    assert.deepEqual(await page.locator(`${ps} .filters button`).allInnerTexts(), ["Видно · 2", "В коде · 1"]);
    await page.reload(); await page.locator(`${ps} #approve`).waitFor({ timeout: 10000 });
    assert.equal(await page.locator(`${ps} #lang`).textContent(), "RU");
    await page.locator(`${ps} #lang`).click();
    assert.match(await page.locator(`${ps} .list li[data-g]`).first().innerText(), /The control's edge is barely visible/);
    await page.locator(`${ps} #approve`).click();
    assert.equal((await rv).decision, "approve");
    await page.locator(`${ps} .min`).filter({ hasText: "Approved" }).waitFor({ timeout: 5000 });
    ok("the panel is dragged by its header, keeps its place across reloads, folds, double-click puts it back; frames on/off with peek; EN ↔ RU");
  }

  // ── the whole site in one list: visible / in code / fixed, filters, late elements, jumping to another page ──
  {
    const { requestReview } = await import("../lib/review-client.js");
    const ps = "#__babysitter-studio";
    await page.goto(base + "/"); await page.evaluate(() => localStorage.clear()); await page.reload();
    const rv = requestReview({ url: base, title: "Site", timeoutMs: 60000, problems: [
      { check: "native control [1.1]", what: "native <select type=select-one>", human: { kind: "dropdown", name: "Country" }, route: "/", selector: "#country" },
      { check: "native control [1.1]", what: "native <select type=select-one>", human: { kind: "dropdown", name: "Late" }, route: "/", selector: "#late" },
      { check: "native control [1.1]", what: "native <input type=checkbox>", human: { kind: "checkbox", name: "Agree" }, route: "/signup", selector: "#country", viewport: "1280" },
      { check: "native control [1.1]", what: "native <input type=checkbox>", human: { kind: "checkbox", name: "Phone only" }, route: "/", selector: "h1", viewport: "390" },
      { check: "inline style [DOM]", what: "inline font-size", props: ["font-size"], human: { kind: "heading", name: "Settings" }, route: "/", selector: "h1" },
    ], fixed: [
      { check: "contrast [6.4]", what: "contrast 3.58:1", human: { kind: "text", name: "fine print" }, route: "/", selector: "p.faint" },
    ] });
    await page.locator(`${ps} #approve`).waitFor({ timeout: 10000 });
    assert.deepEqual(await page.locator(`${ps} .filters button`).allInnerTexts(), ["Visible · 4", "In code · 1", "Fixed · 1"]);
    assert.deepEqual(await page.locator(`${ps} .list li[data-g]`).evaluateAll((ls) => ls.map((l) => l.className)), ["k-red", "k-red", "k-red", "k-red", "k-code", "k-fixed"], "visible, then code-only, then fixed");
    assert.match(await page.locator(`${ps} .list li.sep.fixed`).innerText(), /Fixed since the previous check \(1\)/);
    assert.equal(await page.locator(`${ps} .box.fixed`).evaluate((e) => getComputedStyle(e).borderTopColor), "rgb(34, 197, 94)", "fixed: green frame");
    assert.equal(await page.locator(`${ps} .box.k-red`).count(), 1, "#late is not there yet; the phone-width finding is not framed on a desktop window");
    // an element a client component renders later gets its frame then
    await page.evaluate(() => { const s = document.createElement("select"); s.id = "late"; document.querySelector("main").append(s); });
    await page.waitForFunction(() => document.querySelector("#__babysitter-studio").shadowRoot.querySelectorAll(".box.k-red").length === 2, null, { timeout: 3000 });
    // filters hide the entries and their frames, and are remembered
    await page.locator(`${ps} .filters button[data-f=code]`).click();
    assert.equal(await page.locator(`${ps} .box.code`).isVisible(), false);
    assert.equal(await page.locator(`${ps} .list li.k-code`).first().isVisible(), false);
    assert.equal(await page.locator(`${ps} .list li.sep.k-code`).isVisible(), false);
    await page.locator(`${ps} .filters button[data-f=red]`).click();
    assert.equal(await page.locator(`${ps} .box.k-red`).first().isVisible(), false);
    assert.ok(await page.locator(`${ps} .box.fixed`).isVisible() && await page.locator(`${ps} .list li[data-g].k-fixed`).isVisible(), "green still shown");
    await page.reload(); await page.locator(`${ps} #approve`).waitFor({ timeout: 10000 });
    assert.equal(await page.locator(`${ps} .filters button[data-f=red]`).getAttribute("aria-pressed"), "false", "filters survive a reload");
    await page.locator(`${ps} .filters button[data-f=red]`).click(); await page.locator(`${ps} .filters button[data-f=code]`).click();
    // an entry of another page: that page opens and its frame is pointed at
    await page.locator(`${ps} .list li.k-red`).filter({ hasText: "Agree" }).click();
    await page.waitForURL(/\/signup$/, { timeout: 10000 });
    await page.locator(`${ps} .box.peek`).first().waitFor({ state: "attached", timeout: 5000 });
    assert.equal(await page.locator(`${ps} .box.peek .tag`).first().textContent(), String(1 + await page.locator(`${ps} .list li[data-g]`).evaluateAll((ls) => ls.findIndex((l) => /Agree/.test(l.textContent)))));
    await page.locator(`${ps} #approve`).click();
    assert.equal((await rv).decision, "approve");
    await page.goto(base + "/");
    ok("one list for the whole site: visible (red), in code (yellow), fixed (green); filters hide entries and frames; late elements get frames; an entry of another page opens it at its frame");
  }
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
    assert.match(await page.locator("#__babysitter-studio .list").innerText(), /A browser-default control instead of the kit's/); // the human title; the rule id sits under "details"
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
    await clickSide("BEFORE");
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    assert.equal(readFileSync(LIVE, "utf8"), HEAD_SRC, "HEAD version on disk");
    assert.ok(existsSync(join(repo, ".babysitter/time-travel/journal.json")), "journaled while BEFORE is on disk");
    const live = await browser.newPage(); await live.goto(base + "/live");
    assert.equal(await live.locator("#src").textContent(), HEAD_SRC, "the dev server renders the HEAD version");
    await clickSide("AFTER");
    await page.locator("#__babysitter-studio .panel:not(.before)").waitFor({ timeout: 10000 });
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC);
    await clickSide("BEFORE");
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
    await clickSide("BEFORE", { timeout: 30000 });
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    h4.kill("SIGTERM"); await new Promise((r) => h4.on("exit", r));
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC, "SIGTERM → restored");
    const h5 = spawn(process.execPath, [join(ROOT, "bin/hook-stop.mjs")], { cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    h5.stdin.end("{}");
    await page.locator("#__babysitter-studio .min").filter({ hasText: "stopped waiting" }).waitFor({ timeout: 10000 }).catch(() => {});
    await clickSide("BEFORE", { timeout: 30000 });
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    h5.kill("SIGKILL"); await new Promise((r) => h5.on("exit", r));
    assert.equal(readFileSync(LIVE, "utf8"), HEAD_SRC, "SIGKILL leaves HEAD on disk…");
    execSync(`node ${join(ROOT, "bin/babysitter.mjs")} restore`, { cwd: repo });
    assert.equal(readFileSync(LIVE, "utf8"), AFTER_SRC, "…and `babysitter restore` (or any hook) puts AFTER back");
    ok("hook killed while viewing HEAD: SIGTERM restores at once, SIGKILL is recovered from the journal");

    // studio review --repo --base <ref>: Before/After against any ref (a branch's whole change vs main)
    const root = execSync("git rev-list --max-parents=0 HEAD", { cwd: repo, encoding: "utf8" }).trim();
    const ROOT_SRC = execSync(`git show ${root}:src/app/page.tsx`, { cwd: repo, encoding: "utf8" });
    const NOW_SRC = readFileSync(LIVE, "utf8");
    assert.notEqual(ROOT_SRC, NOW_SRC);
    const cli = spawn(process.execPath, [BIN, "review", "--url", base, "--title", "Branch vs base", "--timeout", "60", "--repo", repo, "--base", root], { stdio: ["pipe", "pipe", "pipe"] });
    let cliErr = ""; cli.stderr.on("data", (d) => (cliErr += d));
    cli.stdin.end(JSON.stringify([{ file: "src/app/page.tsx", line: 1, message: "demo" }]));
    const cliDone = new Promise((r) => cli.on("exit", r));
    await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]:not([disabled])").waitFor({ timeout: 30000 });
    assert.match(await page.locator("#__babysitter-studio .seg button[data-side=BEFORE]").textContent(), new RegExp(root.slice(0, 7)));
    await clickSide("BEFORE");
    await page.locator("#__babysitter-studio .panel.before").waitFor({ timeout: 10000 });
    assert.equal(readFileSync(LIVE, "utf8"), ROOT_SRC, "BEFORE = the file at --base");
    await page.locator("#__babysitter-studio #approve").click();
    assert.equal(await cliDone, 0, cliErr);
    assert.equal(readFileSync(LIVE, "utf8"), NOW_SRC, "AFTER is back when the review ends");
    ok("studio review --repo --base <ref>: Before shows the files at that ref, the work is restored when it ends");

    // notes pinned while nothing waits: UserPromptSubmit hands them over with the next prompt…
    const pin = (comment) => page.evaluate(([c, s]) => new Promise((r) => { const w = new WebSocket(`ws://${location.host}/__babysitter/ws?role=studio`); w.onopen = () => { w.send(JSON.stringify({ type: "NOTE_ADD", note: { selector: s, comment: c, route: "/", text: "Save", classes: "btn px-4" } })); setTimeout(() => { w.close(); r(); }, 150); }; }), [comment, pk.btn]);
    await pin("Make it secondary");
    await page.locator("#__babysitter-studio .sec").waitFor({ timeout: 5000 });
    const hp = spawn(process.execPath, [join(ROOT, "bin/hook-prompt.mjs")], { cwd: repo, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    let hpo = ""; hp.stdout.on("data", (d) => (hpo += d)); hp.stdin.end('{"prompt":"go"}');
    assert.equal(await new Promise((r) => hp.on("exit", r)), 0);
    const ctx = JSON.parse(hpo).hookSpecificOutput;
    assert.equal(ctx.hookEventName, "UserPromptSubmit");
    assert.match(ctx.additionalContext, /Manual QA Feedback:\n- Element: `[^`]+`  \(page \/; text "Save"; class "btn px-4"\)\n- Instruction: "Make it secondary"/);
    await page.locator("#__babysitter-studio .sec").waitFor({ state: "detached", timeout: 5000 });
    // …and the Stop hook, when the checks are clean, won't let the turn end over them
    writeFileSync(join(repo, "src/app/page.tsx"), "export default function P(){ return <p>clean</p>; }\n");
    await pin("Use the brand colour here");
    const s6 = await stopHook();
    assert.equal(s6.code, 2); assert.match(s6.err, /pinned on the page[\s\S]*Instruction: "Use the brand colour here"/);
    const s7 = await stopHook();
    assert.equal(s7.code, 0, "delivered once, not again");
    ok("notes pinned with no review waiting reach Claude: UserPromptSubmit additionalContext, or the Stop hook when the checks are clean");
  } finally { rmSync(repo, { recursive: true, force: true }); }

  await browser.close();
} finally {
  await studio.close();
  target.close();
}

// the bus captures only the newest request of a panel: a reviewer who scrolled on does not wait behind old captures
{
  const { createBus } = await import("../lib/bus.js");
  const calls = [];
  const bus = createBus({ onCompare: async ({ path }) => { calls.push(path); await new Promise((r) => setTimeout(r, 300)); return { before: Buffer.from("b"), after: Buffer.from("a") }; } });
  const srv = http.createServer(); srv.on("upgrade", (req, socket, head) => bus.handleUpgrade(req, socket, head));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = (role) => `ws://127.0.0.1:${srv.address().port}${PATH}?role=${role}`;
  const open = (ws) => new Promise((r) => ws.once("open", r));
  const cli = new WebSocket(url("cli")); await open(cli);
  cli.send(JSON.stringify({ type: "REVIEW_REQUIRED", reviewId: "r1", title: "t", problems: [], diff: { repo: "/x", base: "HEAD" } }));
  const panel = new WebSocket(url("studio")); await open(panel);
  const ready = []; panel.on("message", (raw) => { const m = JSON.parse(String(raw)); if (m.type === "COMPARE_READY") ready.push(m.reqId); });
  await new Promise((r) => setTimeout(r, 100));
  for (const [reqId, path] of [["1", "/a"], ["2", "/b"], ["3", "/c"], ["4", "/d"]]) panel.send(JSON.stringify({ type: "COMPARE", reviewId: "r1", reqId, path }));
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(calls.at(-1), "/d", "the newest request is captured");
  assert.ok(calls.length <= 2 && !calls.includes("/b") && !calls.includes("/c"), `superseded requests are skipped: ${calls}`);
  assert.equal(ready.at(-1), "4");
  cli.close(); panel.close(); bus.close(); srv.close();
  ok("Before/After: superseded capture requests are skipped (scrolling on never queues minutes of captures)");
}

// 6. no studio → exit 2 so the git hook can fall back to plain blocking
const r5 = spawn(process.execPath, [BIN, "review", "--url", "http://localhost:9"], { stdio: ["pipe", "pipe", "pipe"] });
r5.stdin.end("[]");
assert.equal(await new Promise((r) => r5.on("exit", r)), 2);
ok("no studio running → exit 2");
console.log(`studio: ${n} end-to-end cases passed`);
