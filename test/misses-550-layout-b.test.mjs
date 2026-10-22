// 5.5.0 — the miss loop, layout part B: boxes, icons, the header and the brand (playwright/checks/boxes.js). Each card
// as it shipped ("bad" fails), the fix ("good" passes) and look-alikes that stay quiet. The cards: misses/*-2026-10-20.md
// (Praxis, Parallel) and the Kindred / Compass catch-rate runs. RUN: node test/misses-550-layout-b.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";

const opt = async (path) => { try { return await import(path); } catch { return {}; } };
const B = await opt("../playwright/checks/boxes.js");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

let site = { "/": "" };
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const body = site[u.pathname];
  if (body && typeof body === "object") { res.writeHead(200, { "content-type": body.type }); res.end(body.body); return; }
  if (body == null && /favicon|manifest/.test(u.pathname)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body ?? "<!doctype html><title>other</title><h1>Other</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page · Acme</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial;background:#fff;color:#111}${head}</style></head><body>${body}</body></html>`;
async function load(page, html, extra = {}) { site = { "/": html, ...extra }; await page.goto(ORIGIN + "/", { waitUntil: "load" }); await page.waitForTimeout(150); }
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 5).join("\n    ")}`); } finally { await ctx.close(); }
}
const need = (fn) => { assert.ok(fn, "the check does not exist in this version"); return fn; };

try {
  /* ═════ 2.14 cell spill — Praxis izrv19 (Cookie Policy table, fix 14b45f1) ═════ */
  const table = (name) => `<table style="table-layout:fixed;width:360px;border-collapse:collapse"><tr><td style="width:120px;padding:4px">${name}</td><td style="padding:4px">Keeps an unfinished request in this browser</td></tr></table>`;
  await test("izrv19 Cookie Policy table: 'praxis_consultation_state' runs into the Purpose column; broken with <wbr> it passes; a scroller / ellipsis cell stays quiet", async (page) => {
    const check = need(B.cellSpill);
    await load(page, doc(table('<span style="white-space:nowrap">praxis_consultation_state</span>')));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /praxis_consultation_state.*runs \d+px out of its cell/);
    await load(page, doc(table('<span style="white-space:nowrap">praxis_</span><wbr><span style="white-space:nowrap">consultation_state</span>')));
    assert.deepEqual(await check(page), []);
    await load(page, doc(table('<div style="overflow-x:auto"><span style="white-space:nowrap">praxis_consultation_state</span></div>')));
    assert.deepEqual(await check(page), [], "a scroller in the cell");
    await load(page, doc(table('<span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">praxis_consultation_state</span>')));
    assert.deepEqual(await check(page), [], "a deliberate ellipsis");
  }, { width: 360, height: 700 });

  /* ═════ 1.20 header faces — Praxis f8e3xf, m0n604 (fix fae5f6f) ═════ */
  const hdr = (ctrlFont) => `<header style="display:flex;gap:16px;align-items:center;padding:12px"><a href="/" style="font-family:Georgia">PRAXIS</a><nav style="display:flex;gap:12px"><a href="/specialists" style="font-family:Arial;font-size:13px">Specialists</a><a href="/services" style="font-family:Arial;font-size:13px">Services</a><a href="/pricing" style="font-family:Arial;font-size:13px">Pricing</a></nav><span style="font-family:monospace">EN · AZ · KK</span><button style="font-family:${ctrlFont};font-size:13px">Currency</button><a href="/login" style="font-family:${ctrlFont};font-size:13px">Sign in</a><a href="/join" style="font-family:${ctrlFont};font-size:13px">Join Platform</a></header><main><h1>Home</h1></main>`;
  await test("f8e3xf / m0n604 header: currency, Sign in and Join in another face than the nav; one face passes; the wordmark and a language code in their own faces stay quiet", async (page) => {
    const check = need(B.headerFaces);
    await load(page, doc(hdr("'Courier New'")));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /two typefaces: arial .*"Specialists".* courier new \("Currency", "Sign in", "Join Platform"\)/i);
    await load(page, doc(hdr("Arial")));
    assert.deepEqual(await check(page), [], "the wordmark (Georgia) and EN · AZ · KK (mono) are not word controls");
  });

  /* ═════ 2.19 empty box scrolls — Praxis prmi5d ═════ */
  const thread = (inner) => `<div style="height:400px;display:flex;flex-direction:column;border:1px solid #ddd"><div id="th" style="flex:1;min-height:0;overflow:auto">${inner}</div></div>`;
  await test("prmi5d empty message thread: 'No messages yet' scrolls by 24px; sized to the box it passes; a real thread that scrolls stays quiet", async (page) => {
    const check = need(B.emptyScroller);
    await load(page, doc(thread('<div style="padding:16px"><div style="height:380px">No messages yet</div></div>')));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /No messages yet.*scrolls by \d+px/);
    await load(page, doc(thread('<div style="height:100%;display:grid;place-items:center">No messages yet</div>')));
    assert.deepEqual(await check(page), []);
    await load(page, doc(thread(`<ul>${Array.from({ length: 30 }, (_, i) => `<li style="height:40px">Message ${i}</li>`).join("")}</ul>`)));
    assert.deepEqual(await check(page), [], "a real thread");
  });

  /* ═════ 3.5 desktop header nav — Kindred sxnm89, 62i3ff ═════ */
  const kHeader = (nav) => `<header style="display:flex;justify-content:space-between;padding:12px"><a href="/">KINDRED</a>${nav}<a href="/login">Sign In</a><button aria-expanded="false" aria-controls="m" aria-label="Menu">☰</button></header><div id="m" hidden><a href="/request-service">Services</a><a href="/pricing">Pricing</a><a href="/about">About</a></div><main><h1>Home</h1></main><footer><a href="/pricing">Pricing</a><a href="/about">About</a><a href="/terms">Terms</a></footer>`;
  await test("sxnm89 / 62i3ff Kindred desktop header is only a logo, Sign In and a burger at 1440; with a nav it passes", async (page) => {
    const check = need(B.desktopHeaderNav);
    await load(page, doc(kHeader("")));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /shows no navigation.*\/request-service, \/pricing, \/about are hidden behind the toggle/);
    await load(page, doc(kHeader('<nav><a href="/specialists">Specialists</a><a href="/pricing">Pricing</a><a href="/about">About</a></nav>')));
    assert.deepEqual(await check(page), []);
  }, { width: 1440, height: 900 });
  await test("3.5 look-alikes: the same header at 390 (a phone), a site with fewer than 3 destinations", async (page) => {
    const check = need(B.desktopHeaderNav);
    await load(page, doc(kHeader("")));
    assert.deepEqual(await check(page), [], "phone width");
  }, { width: 390, height: 800 });
  await test("3.5 look-alike: a one-page site (2 destinations) at 1440", async (page) => {
    await load(page, doc('<header><a href="/">X</a><button aria-label="Menu" aria-expanded="false">☰</button></header><main><h1>X</h1></main><footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>'));
    assert.deepEqual(await B.desktopHeaderNav(page), []);
  }, { width: 1440, height: 900 });

  /* ═════ B5 custom amount tile — Kindred c25ux3 ═════ */
  const wallet = (custom) => `<style>.tile{border:2px solid #ccc;border-radius:12px;padding:12px;background:#fff}</style><div role="dialog" aria-modal="true" style="position:fixed;inset:40px;background:#fff;padding:16px"><h2>Add credits</h2><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"><button class="tile">100 credits<br>$10.00</button><button class="tile">500 credits<br>$48.50</button><button class="tile">1000 credits<br>$92.00</button>${custom === "tile" ? '<label class="tile">Custom<input inputmode="numeric" placeholder="10–99,999"></label>' : ""}</div>${custom === "field" ? '<label>Or enter custom amount</label><input inputmode="numeric" placeholder="Enter credits">' : ""}</div>`;
  await test("c25ux3 Kindred top-up: the custom amount is a field under the package grid; as a tile like the packages it passes; a dialog with one price stays quiet", async (page) => {
    const check = need(B.customAmountTile);
    await load(page, doc(wallet("field")));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.ok(bad[0].hard && /field under the packages, not a tile/.test(bad[0].what));
    await load(page, doc(wallet("tile")));
    assert.deepEqual(await check(page), []);
    await load(page, doc(wallet("none")));
    assert.match((await check(page))[0].what, /no custom amount/);
    assert.deepEqual(await check(page, { customAmount: false }), [], "acceptance.customAmount: false");
    await load(page, doc('<div role="dialog"><button class="tile" style="border:1px solid">500 credits $48</button></div>'));
    assert.deepEqual(await check(page), [], "one fixed price");
  });

  /* ═════ 1.20 popular badge placement — Kindred fqsn52 ═════ */
  const pricingCard = '<div class="card" style="position:relative;padding:24px;border:1px solid #ccc;width:300px;margin:40px"><h3>Pro</h3><p>All you need</p><p>Many lines here</p><p>And more</p><span style="background:#186b54;color:#fff;border-radius:999px;padding:2px 8px">MOST POPULAR</span></div>';
  const tileTop = '<div class="tile" style="position:relative;border:1px solid #ccc;padding:24px;width:300px;margin:40px"><span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#186b54;color:#fff;border-radius:999px;padding:2px 8px">Popular</span><b>500 credits</b><p>$48.50</p></div>';
  await test("fqsn52 Kindred 'Most popular': in the card's flow on /pricing, on the top border in the wallet dialog — two placements fail; one placement passes; a 'Popular searches' heading stays quiet", async (page) => {
    const collect = need(B.siteSignals), judge = need(B.siteSignalFindings);
    await load(page, doc(pricingCard));
    const p1 = await collect(page, "/pricing");
    await load(page, doc(`<div role="dialog">${tileTop}</div>`));
    const p2 = await collect(page, "/dashboard (wallet)");
    const bad = judge([p1, p2]).hard.filter((f) => /\[1\.20\]/.test(f.what));
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /badge sits (inside-flow|straddle)/);
    await load(page, doc(tileTop));
    const p3 = await collect(page, "/pricing");
    assert.deepEqual(judge([p3, p2]).hard.filter((f) => /\[1\.20\]/.test(f.what)), []);
    await load(page, doc('<h2>Popular searches</h2><div style="border:1px solid;padding:20px"><b>Popular</b> tags</div>'));
    assert.deepEqual((await collect(page, "/blog")).popular, [], "not a painted badge");
  });

  /* ═════ 1.6 hover edge — Kindred 1rto89 (/request-service .case-card) ═════ */
  const caseCard = (hover) => `<a class="case-card" href="/x" style="width:300px;height:120px;margin:40px">Bright Signal #723</a><style>.case-card{position:relative;display:block;border:1px solid #ddd;border-radius:20px;padding:16px}${hover}</style>`;
  const BAD_HOVER = '.case-card::before{content:"";position:absolute;left:24px;right:24px;top:-1px;height:3px;background:#186b54}.case-card:hover{border-color:#186b54;transform:translateY(-3px)}.case-card:hover::before{left:0;right:0}.case-card:not(:hover)::before{opacity:0}';
  await test("1rto89 Kindred case card: hover adds a 3px top bar beside 1px sides and lifts the card 3px; an outline ring passes; a ring-2 on all sides stays quiet", async (page) => {
    const check = need(B.hoverEdge);
    await load(page, doc(caseCard(BAD_HOVER)));
    const bad = await check(page);
    assert.equal(bad.hard.length, 1, JSON.stringify(bad));
    assert.match(bad.hard[0].what, /uneven edge: top 4px, right 1px/);
    assert.match(bad.soft[0].what, /moves the card by 3px/);
    await load(page, doc(caseCard(".case-card:hover{outline:2px solid #186b54;outline-offset:0}")));
    const ok = await check(page);
    assert.deepEqual([...ok.hard, ...ok.soft], []);
    await load(page, doc(caseCard(".case-card:hover{box-shadow:0 0 0 2px #186b54}")));
    assert.deepEqual((await check(page)).hard, []);
  });

  /* ═════ 1.11 one brand mark — Kindred kytm39 (footer), bmlrc4 (tab icon, manifest) ═════ */
  const seal = '<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#186b54"/><path d="M11 9v14M11 16l8-7M11 16l8 7" stroke="#fff" stroke-width="3"/></svg>';
  const sat = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1e40af"/><circle cx="16" cy="16" r="6" fill="#38bdf8"/></svg>';
  const sealFile = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#186b54"/></svg>`;
  const kPage = (footerLogo, icon) => doc(`<header><a href="/" aria-label="Kindred">${seal} Kindred</a></header><main><h1>Home</h1></main><footer><a href="/">${footerLogo} KINDRED</a></footer>`, "").replace("<title>", `<link rel="icon" href="${icon}"><link rel="manifest" href="/site.webmanifest"><title>`);
  await test("kytm39 / bmlrc4 Kindred: footer logo is a drawn stand-in, the tab icon is a blue satellite, the manifest says ORBITA; the same mark, a green favicon and 'Kindred' pass", async (page) => {
    const check = need(B.brandMark);
    await load(page, kPage('<div class="rings" style="width:20px;height:20px;border:2px solid #186b54;border-radius:50%;display:inline-block"></div>', "/favicon.svg"), { "/favicon.svg": { type: "image/svg+xml", body: sat }, "/site.webmanifest": { type: "application/manifest+json", body: '{"name":"ORBITA","short_name":"ORBITA"}' } });
    const bad = await check(page);
    assert.equal(bad.hard.length, 3, JSON.stringify(bad.hard));
    assert.ok(bad.hard.some((f) => /footer logo is a different mark/.test(f.what)));
    assert.ok(bad.hard.some((f) => /browser-tab icon .* is not the site's mark/.test(f.what)));
    assert.ok(bad.hard.some((f) => /manifest names the app "ORBITA"/.test(f.what)));
    await load(page, kPage(seal, "/favicon.svg"), { "/favicon.svg": { type: "image/svg+xml", body: sealFile }, "/site.webmanifest": { type: "application/manifest+json", body: '{"name":"Kindred","short_name":"Kindred"}' } });
    assert.deepEqual((await check(page)).hard, []);
    // a monochrome footer copy of the same mark (other fill, same shapes)
    await load(page, kPage(seal.replace('fill="#186b54"', 'fill="#fff"'), "/favicon.svg"), { "/favicon.svg": { type: "image/svg+xml", body: sealFile } });
    assert.deepEqual((await check(page)).hard, [], "same shapes, other fill");
  });

  /* ═════ 2.18 rounded box scrolls itself — Kindred 5k8emt (fix 2cceadf) ═════ */
  const long = '<div style="height:900px">Order details</div>';
  await test("5k8emt Kindred: the opened card scrolls on its own 20px-rounded box; radius on an outer clip passes; a box whose content fits, scrollbar-width:none and a rounded-left sidebar stay quiet", async (page) => {
    const check = need(B.roundedScroller);
    await load(page, doc(`<div role="dialog" style="border-radius:20px;overflow-y:auto;max-height:300px;border:1px solid">${long}</div>`));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /20px-rounded box scrolls itself/);
    await load(page, doc(`<div role="dialog" style="border-radius:20px;overflow:hidden;border:1px solid"><div style="overflow-y:auto;max-height:300px">${long}</div></div>`));
    assert.deepEqual(await check(page), []);
    await load(page, doc('<div style="border-radius:20px;overflow-y:auto;max-height:300px">short</div>'));
    assert.deepEqual(await check(page), [], "fits");
    await load(page, doc(`<div style="border-radius:20px;overflow-y:auto;max-height:300px;scrollbar-width:none">${long}</div>`));
    assert.deepEqual(await check(page), [], "no scrollbar");
    await load(page, doc(`<aside style="border-radius:16px 0 0 16px;overflow-y:auto;max-height:300px">${long}</aside>`));
    assert.deepEqual(await check(page), [], "right corners square");
  });

  /* ═════ 2.20 sideways scroll over nothing — Kindred 1zetde (vaul drawer, fix f273c0c) ═════ */
  const drawer = (x) => `<style>.p::after{content:"";position:absolute;left:100%;top:0;width:200%;height:100%}</style><div role="dialog" class="p" style="position:fixed;right:0;top:0;width:599px;height:100vh;overflow-y:auto;${x}"><p>Order #123 · Completed</p></div>`;
  await test("1zetde Kindred order drawer: scrolls sideways to 1797px over a pseudo-element filler; overflow-x:hidden passes; a chip scroller with real chips stays quiet", async (page) => {
    const check = need(B.sidewaysScroll);
    await load(page, doc(drawer("")));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /scrolls sideways by \d+px although nothing in it is wider.*::after/);
    await load(page, doc(drawer("overflow-x:hidden")));
    assert.deepEqual(await check(page), []);
    await load(page, doc(`<div style="display:flex;gap:8px;overflow-x:auto;width:300px">${Array.from({ length: 12 }, (_, i) => `<span style="flex:0 0 80px;border:1px solid">Chip ${i}</span>`).join("")}</div>`));
    assert.deepEqual(await check(page), [], "real chips");
    await load(page, doc(`<div style="overflow-x:auto;width:300px"><table style="width:800px"><tr><td>a</td></tr></table></div>`));
    assert.deepEqual(await check(page), [], "a wide table");
  }, { width: 1440, height: 900 });

  /* ═════ 6.5 all-caps h1 outlier — Kindred 9ha0j4 ═════ */
  await test("9ha0j4 Kindred: /about 'ABOUT US' while /pricing, /specialists, /contact write h1 in normal case; 'About Us' passes; a site of uppercase h1s and 'FAQ' stay quiet", async (page) => {
    const collect = need(B.siteSignals), judge = need(B.siteSignalFindings);
    const h1 = async (route, html) => { await load(page, doc(html)); return collect(page, route); };
    const mixed = [await h1("/pricing", "<h1>Connect with elite specialists</h1>"), await h1("/specialists", "<h1>Active Specialists</h1>"), await h1("/contact", "<h1>Talk to our team</h1>")];
    const bad = judge([...mixed, await h1("/about", "<h1>ABOUT US</h1>")]).hard.filter((f) => /\[6\.5\]/.test(f.what));
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /"ABOUT US" is set in capitals \(typed in capitals\)/);
    assert.deepEqual(judge([...mixed, await h1("/about", "<h1>About Us</h1>")]).hard.filter((f) => /\[6\.5\]/.test(f.what)), []);
    const allUp = [await h1("/a", '<h1 style="text-transform:uppercase">Connect with us</h1>'), await h1("/b", '<h1 style="text-transform:uppercase">Our pricing plans</h1>'), await h1("/c", '<h1 style="text-transform:uppercase">About the team</h1>'), await h1("/faq", "<h1>FAQ</h1>")];
    assert.deepEqual(judge(allUp).hard.filter((f) => /\[6\.5\]/.test(f.what)), []);
  });

  /* ═════ 2.14 icon clipped / squeezed — Kindred x099su (Active Orders rocket) ═════ */
  await test("x099su Kindred 'Active Orders' rocket: cut by the 12px box that clips it, or squeezed by a long label in a flex row (min-w-0 icon); room / shrink-0 passes; an oversized decorative svg and an avatar mask stay quiet", async (page) => {
    const check = need(B.iconClipped);
    await load(page, doc('<h3><span style="display:inline-flex;width:12px;height:12px;overflow:hidden"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg></span> Active Orders</h3>'));
    let bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /icon (cut by 4px by a box that clips|squeezed to 12×16px)/);
    await load(page, doc('<h3><span style="display:inline-flex;width:16px;height:16px;overflow:hidden"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg></span> Active Orders</h3>'));
    assert.deepEqual(await check(page), []);
    const row = (st) => `<div style="display:flex;width:120px;overflow:hidden"><svg width="14" height="14" viewBox="0 0 24 24" style="min-width:0;${st}"><path d="M2 2h20v20H2z"/></svg><span style="white-space:nowrap">Active Orders and a long label</span></div>`;
    await load(page, doc(row("")));
    bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /icon squeezed to \d+×14px \(intended 14px\)/);
    await load(page, doc(row("flex-shrink:0")));
    assert.deepEqual(await check(page), []);
    // an icon set's width attribute is not its size: lucide draws width="24" and CSS sizes it (size-4 = 16px)
    const css = (st) => `<div style="display:flex;align-items:center;gap:8px;width:${st}"><svg width="24" height="24" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M2 2h20v20H2z"/></svg><span style="white-space:nowrap">Active Orders and a long label</span></div>`;
    await load(page, doc(css("320px")));
    assert.deepEqual(await check(page), [], "CSS-sized 16px icon with width=24, room to spare: not squeezed");
    await load(page, doc(css("120px;overflow:hidden").replace('style="width:16px', 'style="min-width:0;width:16px')));
    bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /icon squeezed to \d+×16px \(intended 16px\)/, "a CSS-sized icon that flex really shrank is still caught");
    await load(page, doc('<div style="display:flex;width:120px;overflow:hidden"><svg width="24" height="24" viewBox="0 0 24 24" style="min-width:0"><path d="M2 2h20v20H2z"/></svg><span style="white-space:nowrap">Active Orders and a long label</span></div>'));
    bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /icon squeezed to \d+×24px \(intended 24px\)/, "a 24px icon at shrink 1 beside a long label");
    await load(page, doc('<div style="width:200px;overflow:hidden"><svg width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300"/></svg></div><div style="width:32px;height:32px;border-radius:50%;overflow:hidden"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40"></div>'));
    assert.deepEqual(await check(page), [], "decorative / avatar");
  });

  /* ═════ 2.24 icon glued to its label — Kindred dq793h ("Under review") ═════ */
  await test("dq793h Kindred 'Under review': the seal icon touches its label (0px); a gap-2 row passes; an icon-only button and a chevron 6px from 'Menu' stay quiet", async (page) => {
    const check = need(B.iconGap);
    await load(page, doc('<p><span class="seal-badge" style="display:inline-flex"><svg width="16" height="16"><rect width="16" height="16"/></svg></span><span>Under review</span></p>'));
    const bad = await check(page);
    assert.equal(bad.hard.length, 1, JSON.stringify(bad));
    assert.match(bad.hard[0].what, /touches "Under review" \(0px apart\)/);
    await load(page, doc('<div style="display:flex;gap:8px;align-items:center"><svg width="16" height="16"><rect width="16" height="16"/></svg><span>Under review</span></div>'));
    assert.deepEqual([...(await check(page)).hard, ...(await check(page)).soft], []);
    await load(page, doc('<button aria-label="Close"><svg width="16" height="16"><rect width="16" height="16"/></svg></button><button style="display:flex;gap:6px">Menu<svg width="12" height="12"><rect width="12" height="12"/></svg></button>'));
    assert.deepEqual((await check(page)).hard, []);
  });

  /* ═════ 6.9 one focus ring — Compass h59hxv ("Set your bearing") ═════ */
  await test("h59hxv Compass 'Set your bearing': focus rings the inner input inside the framed field; :focus-within on the frame passes; a plain input with its own border stays quiet", async (page) => {
    const check = need(B.innerFocusRing);
    await load(page, doc('<style>.fr input:focus{outline:2px solid #b08d57}</style><div class="fr" style="border:1px solid #999;padding:8px;width:300px"><input style="border:0;width:100%" placeholder="Set your bearing"></div>'));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /second ring inside the field "Set your bearing"/);
    await load(page, doc('<style>.fr:focus-within{box-shadow:0 0 0 2px #b08d57}.fr input{outline:none}</style><div class="fr" style="border:1px solid #999;padding:8px;width:300px"><input style="border:0;width:100%" placeholder="Set your bearing"></div>'));
    assert.deepEqual(await check(page), []);
    await load(page, doc('<style>input:focus{outline:2px solid blue}</style><input style="border:1px solid #999" placeholder="Email">'));
    assert.deepEqual(await check(page), [], "its own border and ring");
  });

  /* ═════ 1.21 one accent per site — Compass u5brwv, 9ln1xx (Forge orange on inner pages) ═════ */
  await test("u5brwv / 9ln1xx Compass: brass buttons on /, /specialists, /about; Forge orange on /pricing — fails; brass everywhere passes; a red Delete button stays quiet", async (page) => {
    const collect = need(B.siteSignals), judge = need(B.siteSignalFindings);
    const pg = async (route, color, extra = "") => { await load(page, doc(`<main><h1>X</h1><button style="background:${color};color:#fff;padding:12px 24px">Start a brief</button><a href="/x" style="background:${color};color:#fff;padding:12px 24px;display:inline-block">Browse</a>${extra}</main>`)); return collect(page, route); };
    const brass = [await pg("/", "#b08d57"), await pg("/specialists", "#b08d57"), await pg("/about", "#b08d57")];
    const bad = judge([...brass, await pg("/pricing", "#f46f00")]).hard.filter((f) => /\[1\.21\]/.test(f.what));
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].where, /\/pricing/);
    assert.deepEqual(judge([...brass, await pg("/pricing", "#b08d57", '<button style="background:#dc2626;color:#fff;padding:12px 40px">Delete account</button>')]).hard.filter((f) => /\[1\.21\]/.test(f.what)), []);
  });

  /* ═════ 3.10 burger repeats the visible nav — Compass 6d0aki ═════ */
  const cHead = (panel) => `<header style="display:flex;gap:12px"><a href="/">Compass</a><nav><a href="/specialists">Specialists</a> <a href="/pricing">Pricing</a> <a href="/about">About</a></nav><button aria-expanded="false" aria-label="Menu" onclick="document.getElementById('m').hidden=!document.getElementById('m').hidden">☰</button></header><div id="m" hidden>${panel}</div><main><h1>Home</h1></main>`;
  await test("6d0aki Compass: at desktop the burger opens Specialists / Pricing / About, the links the header already shows; a menu that adds Settings and Sign out stays quiet", async (page) => {
    const check = need(B.burgerRepeatsNav);
    await load(page, doc(cHead('<a href="/specialists">Specialists</a><a href="/pricing">Pricing</a><a href="/about">About</a>')));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /opens the same 3 links the header already shows/);
    await load(page, doc(cHead('<a href="/settings">Settings</a><a href="/logout">Sign out</a>')));
    assert.deepEqual(await check(page), []);
  }, { width: 1440, height: 900 });

  /* ═════ 1.22 sibling cards have the same parts — Compass 01s1e1 (soft) ═════ */
  await test("01s1e1 Compass templates: one of 6 cards lacks the discipline caption (soft); all with it pass; a featured card with an extra badge stays quiet", async (page) => {
    const check = need(B.siblingParts);
    const card = (name, meta = true, extra = "") => `<div class="tpl" style="border:1px solid;padding:12px;height:120px;width:200px">${extra}<h3>${name}</h3>${meta ? '<p class="meta">Language generation</p>' : ""}<p class="desc">Brief</p></div>`;
    const grid = (cards) => doc(`<main><div style="display:grid;grid-template-columns:repeat(3,200px);gap:12px">${cards.join("")}</div></main>`);
    await load(page, grid([card("Blog post"), card("Product copy"), card("Creative Writing", false), card("Newsletter"), card("Landing page"), card("FAQ")]));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /"Creative Writing" lacks a part the other 5 cards/);
    await load(page, grid(["A", "B", "C", "D", "E", "F"].map((n) => card(n))));
    assert.deepEqual(await check(page), []);
    await load(page, grid(["A", "B", "C", "D", "E", "F"].map((n, i) => card(n, true, i === 0 ? '<span class="badge">Featured</span>' : ""))));
    assert.deepEqual(await check(page), [], "an extra part on one card");
  });
  await test("1.22 one kit component in another variant is the same part: a neutral badge on the first pricing card passes; a card with no badge is still reported", async (page) => {
    const check = need(B.siblingParts);
    const KIT = "inline-flex items-center gap-1.5 rounded-full border font-medium px-2.5 py-0.5 text-xs";
    const badge = (tone, text) => `<span class="${KIT} ${tone}">${text}</span>`;
    const card = (name, b) => `<div class="plan" style="border:1px solid;padding:12px;height:160px;width:200px"><h3>${name}</h3><p class="price">£35</p>${b}</div>`;
    const row = (cards) => doc(`<main><div style="display:grid;grid-template-columns:repeat(4,200px);gap:12px">${cards.join("")}</div></main>`);
    const saving = (n) => badge("border-transparent bg-success/10 text-success", `${n}% less per credit`);
    await load(page, row([card("Starter", badge("border-transparent bg-muted text-foreground", "Standard rate")), card("Pro", saving(12)), card("Creator", saving(19)), card("Agency", saving(25))]));
    assert.deepEqual(await check(page), [], "the same badge in its neutral variant");
    await load(page, row([card("Starter", ""), card("Pro", saving(12)), card("Creator", saving(19)), card("Agency", saving(25))]));
    const bad = await check(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /"Starter" lacks a part the other 3 cards/);
    await load(page, row([card("Starter", '<span class="note">Billed monthly</span>'), card("Pro", saving(12)), card("Creator", saving(19)), card("Agency", saving(25))]));
    assert.equal((await check(page)).length, 1, "another span that is not the badge does not stand in for it");
  });

  /* ═════ 6.5 one accent style in headings — Compass 5dudz9 (soft) ═════ */
  await test("5dudz9 Compass: the accented word is italic on one page and upright on the others (soft); one style passes", async (page) => {
    const collect = need(B.siteSignals), judge = need(B.siteSignalFindings);
    const pg = async (route, style) => { await load(page, doc(`<h1>Where innovation <em style="color:#1a7f5a;font-style:${style}">finds direction</em></h1>`)); return collect(page, route); };
    const s = judge([await pg("/", "normal"), await pg("/about", "normal"), await pg("/pricing", "italic")]).soft.filter((f) => /\[6\.5\]/.test(f.what));
    assert.equal(s.length, 1, JSON.stringify(s));
    assert.match(s[0].what, /italic here and upright/);
    assert.deepEqual(judge([await pg("/", "normal"), await pg("/about", "normal")]).soft, []);
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error(`misses-550-layout-b: ${failed} failed`); process.exit(1); }
console.log("misses-550-layout-b: all passed");
