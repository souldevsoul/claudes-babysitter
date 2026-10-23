// 5.5.0 — the missed cards of Praxis / Parallel (deferred), Kindred and Compass that need a page driven into a state, a
// form submitted in the sandbox or a page nobody links to: each card as it shipped ("bad"), the fix ("good") and
// look-alikes that stay quiet. RUN: node test/misses-550-states.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import * as run from "../playwright/checks/run.js";
import * as fm from "../playwright/checks/forms.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

let site = { "/": "" };
const hits = [];
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  hits.push(`${req.method} ${u.pathname}`);
  const v = site[`${req.method} ${u.pathname}`] ?? site[u.pathname];
  if (typeof v === "function") return v(req, res);
  if (v && typeof v === "object") { res.writeHead(v.status || 200, { "content-type": v.type || "application/json", ...(v.headers || {}) }); return res.end(v.body ?? ""); }
  res.writeHead(v === undefined ? 404 : 200, { "content-type": "text/html; charset=utf-8" });
  res.end(v ?? "<!doctype html><title>404</title><h1>Not found</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial;background:#fff;color:#111}${head}</style></head><body>${body}</body></html>`;
async function load(page, html, extra = {}, path = "/") { site = { [path]: html, ...extra }; hits.length = 0; await page.goto(ORIGIN + path, { waitUntil: "load" }); await page.waitForTimeout(150); }
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } finally { await ctx.close(); }
}
const states = (page, extra = {}) => run.stateChecks(page, { reload: async () => { await page.reload({ waitUntil: "load" }); await page.waitForTimeout(150); }, maxOpeners: 4, maxForms: 2, deadline: Date.now() + 90_000, selections: false, deadButtons: false, ...extra });
const ids = (list, re) => list.filter((f) => re.test(`${f.check || f.id || ""} ${f.what}`));

try {
  /* ═════ Parallel zu9088: the input border disappears in the error state (1.9 inside states) ═════ */
  const band = (invalid) => doc(`<main style="padding:40px"><section style="background:#ff6a1f;padding:32px"><form onsubmit="event.preventDefault();n.setAttribute('aria-invalid','true');e.hidden=false"><label>Name <input id="n" name="name"></label><p id="e" hidden style="color:#111">Enter your name</p><button type="submit" style="background:#111;color:#fff;padding:8px 16px;border:0">Send</button></form></section></main>`, `#n{width:240px;padding:8px;background:#ff6a1f;border:2px solid #111}#n[aria-invalid=true]{border-color:${invalid}}`);
  await test("zu9088 1.9 in the error state: a red edge on an orange band (1.2:1) is reported after the empty submit; an ink edge passes", async (page) => {
    await load(page, band("#e5484d"));
    const r = await states(page);
    assert.ok(ids(r.findings, /1\.9/).some((f) => /after submitting "Send" empty/.test(f.what)), JSON.stringify(r.findings, null, 1));
    await load(page, band("#111"));
    assert.deepEqual(ids((await states(page)).findings, /1\.9/), []);
  });

  /* ═════ Praxis 32q0gs: the cookie settings window mixes centred and left blocks (2.7 dialog axis) ═════ */
  await test("32q0gs 2.7 inside an open dialog: centred intro + left categories + a start-packed button row fail; all-left passes; a centred title alone and an all-centred notice stay quiet", async (page) => {
    const dlg = (inner, st = "") => doc(`<div role="dialog" aria-modal="true" style="position:fixed;inset:20px;background:#fff;border:1px solid #ccc;padding:20px;${st}">${inner}</div>`);
    await load(page, dlg(`<h2 style="text-align:center">Cookie settings</h2><p style="text-align:center">We use cookies to keep you signed in.</p><div style="text-align:left">Necessary — always on</div><div style="display:flex;justify-content:flex-start;gap:8px"><button>Decline</button><button>Accept</button></div><a href="/cookies" style="display:block;text-align:center">Cookie Policy</a>`), {}, "/");
    const bad = await run.dialogAxis(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /mixes centred and left-aligned/);
    await load(page, dlg(`<h2>Cookie settings</h2><p>We use cookies to keep you signed in.</p><div>Necessary — always on</div><div style="display:flex;gap:8px"><button style="flex:1">Decline</button><button style="flex:1">Accept</button></div><a href="/cookies" style="display:block">Cookie Policy</a>`));
    assert.deepEqual(await run.dialogAxis(page), []);
    await load(page, dlg(`<h2 style="text-align:center">Cookie settings</h2><p>We use cookies to keep you signed in.</p><div>Necessary — always on</div>`));
    assert.deepEqual(await run.dialogAxis(page), [], "only the title is centred");
    await load(page, dlg(`<div style="text-align:center">✓</div><h2 style="text-align:center">Saved</h2><p style="text-align:center">Your choice is stored.</p><button style="width:100%">Close</button>`));
    assert.deepEqual(await run.dialogAxis(page), [], "all centred, the button fills the row");
  }, { width: 360, height: 780 });

  /* ═════ Parallel s6dz59: the success message looks like the text that was there (FM13) ═════ */
  const contact = (ok) => doc(`<main style="padding:40px"><form id="f"><label>Name <input name="name"></label><label>Message <textarea name="message"></textarea></label><div class="row"><button type="submit">Send</button><p id="h" style="color:#111;font-weight:600">We reply within a day.</p></div></form></main><script>f.onsubmit=async(e)=>{e.preventDefault();const r=await fetch('/api/contact',{method:'POST',body:new FormData(f)});if(r.ok){h.outerHTML=${JSON.stringify(ok)}}else{h.outerHTML='<p role="alert" style="color:#b91c1c;background:#fee2e2">Could not send. Try again.</p>'}}</script>`);
  await test("s6dz59 FM13: 'Message received…' takes the place of 'We reply within a day.' in the same look (fails); a green pill with a tick passes; the whole form replaced by a panel stays quiet", async (page) => {
    await load(page, contact(`<p style="color:#111;font-weight:600">Message received, we will reply within a day.</p>`));
    const bad = ids(await fm.submitOutcomes(page), /FM13/);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /where "We reply within a day\." was/);
    await load(page, contact(`<p role="status" style="background:#e7f8ec;color:#137333;border-radius:12px;padding:4px 8px">✓ Message received, we will reply within a day.</p>`));
    assert.deepEqual(ids(await fm.submitOutcomes(page), /FM13/), []);
    await load(page, doc(`<main style="padding:40px"><div id="w"><form id="f"><label>Name <input name="name"></label><label>Message <textarea name="message"></textarea></label><button type="submit">Send</button><p style="color:#111">We reply within a day.</p></form></div></main><script>f.onsubmit=async(e)=>{e.preventDefault();const r=await fetch('/api/contact',{method:'POST'});w.innerHTML=r.ok?'<h2>Thanks!</h2><p style="color:#111">Message received.</p>':'<p role="alert" style="color:#b91c1c">Could not send.</p>'}</script>`));
    assert.deepEqual(ids(await fm.submitOutcomes(page), /FM13/), [], "a new panel with a heading is a new state, not the old text");
  });

  /* ═════ Compass b4jdlq: red error text on a maroon toast (6.4 on submit outcomes) · av0m5i: HTML error page → raw JSON error ═════ */
  const pw = (handler) => doc(`<main style="padding:40px"><form id="f"><label>Current password <input type="password" name="current"></label><label>New password <input type="password" name="next"></label><label>Repeat <input type="password" name="next2"></label><button type="submit">Change password</button></form><div id="t" style="position:fixed;right:16px;bottom:16px"></div></main><script>const toast=(m,ok)=>{t.innerHTML='<div role="status" class="toast" style="padding:12px;'+(ok?'background:#052e16;color:#14532d':'background:#450a0a;color:#b91c1c')+'">'+m+'</div>'};f.onsubmit=async(e)=>{e.preventDefault();${handler}}</script>`);
  await test("av0m5i + b4jdlq FM3/FM4: an HTML 404 reply makes the page say 'Unexpected token … is not valid JSON' (fails); a toast at 2.1:1 fails; plain words on a readable toast pass", async (page) => {
    await load(page, pw(`try{const r=await fetch('/api/pw',{method:'POST'});const j=await r.json();toast(j.error||'Password changed',r.ok)}catch(err){toast(err.message,false)}`));
    const bad = await fm.submitOutcomes(page);
    assert.ok(ids(bad, /FM3/).some((f) => /HTML error page/.test(f.what) && /not valid JSON|Unexpected token/.test(f.what)), JSON.stringify(bad, null, 1));
    assert.ok(ids(bad, /6\.4/).length >= 1, "the maroon toast is under 4.5:1");
    await load(page, pw(`const r=await fetch('/api/pw',{method:'POST'}).catch(()=>null);t.innerHTML=r&&r.ok?'<div role="status" style="background:#052e16;color:#dcfce7;padding:12px">Password changed</div>':'<div role="status" style="background:#450a0a;color:#fecaca;padding:12px">We could not change your password. Try again.</div>'`));
    const good = await fm.submitOutcomes(page);
    assert.deepEqual([...ids(good, /HTML error page/), ...ids(good, /6\.4/)], []);
  });

  /* ═════ Praxis dejlep: rate 25 refused although the message says "between 25 and 500" (FM1 stated bounds) ═════ */
  const rate = (cmp) => doc(`<main style="padding:40px"><form id="f"><label>Hourly rate, credits <input name="rate" inputmode="numeric" id="r"></label><p id="e" class="error" style="color:#b91c1c"></p><button type="submit">Save rate</button></form></main><script>const check=()=>{const v=Number(r.value);if(!/^\\d+$/.test(r.value)||${cmp}){e.textContent='Your rate must be between 25 and 500 credits';r.setAttribute('aria-invalid','true');return false}e.textContent='';r.removeAttribute('aria-invalid');return true};r.oninput=check;f.onsubmit=async(ev)=>{ev.preventDefault();if(check())await fetch('/api/rate',{method:'POST',body:r.value})}</script>`);
  await test("dejlep FM1: the stated bounds are allowed — 'between 25 and 500' with v <= 25 refused fails; v < 25 passes", async (page) => {
    await load(page, rate("v<=25||v>500"));
    const bad = ids(await fm.numericBounds(page), /refuses 25/);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    await load(page, rate("v<25||v>500"));
    assert.deepEqual(ids(await fm.numericBounds(page), /refuses/), []);
  });

  /* ═════ Parallel uzbnam: the onboarding walk stops at "Choose at least one" — the DOB picker "Da…" is never seen ═════ */
  const wiz = (dayStyle) => doc(`<main style="padding:24px"><section id="s1"><h2>Your disciplines</h2><fieldset><legend>Disciplines</legend><label><input type="checkbox" name="d" value="ml"> ML</label><label><input type="checkbox" name="d" value="nlp"> NLP</label></fieldset><p id="err" role="alert" style="color:#b91c1c"></p><button id="go">Continue</button></section><section id="s2" hidden><h2>Identity</h2><p>Date of birth</p><button role="combobox" aria-expanded="false" style="${dayStyle}">Day</button><button role="combobox" aria-expanded="false">Month</button></section></main><script>go.onclick=()=>{if(!document.querySelector('input[name=d]:checked')){err.textContent='Choose at least one discipline';return}s1.hidden=true;s2.hidden=false}</script>`);
  await test("uzbnam wizard: the walk ticks the group the step's error asks for, reaches step 2, and 2.14 sees 'Day' cut to 'Da…'; a wide trigger passes", async (page) => {
    await load(page, wiz("width:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px"));
    const r = await states(page);
    assert.ok(r.states.some((x) => /wizard: [1-9]/.test(x)), JSON.stringify(r.states));
    assert.ok(ids(r.findings, /2\.14|N6/).some((f) => /Day|Da…/.test(f.what)), JSON.stringify(r.findings, null, 1));
    await load(page, wiz("padding:6px 12px"));
    const ok = await states(page);
    assert.deepEqual(ids(ok.findings, /2\.14|N6/).filter((f) => /Day/.test(f.what)), []);
  }, { width: 390, height: 800 });

  /* ═════ Kindred vv08yz: the contact form says "received" and sends nothing (FM4) ═════ */
  await test("vv08yz FM4: 'Thanks, your message has been received' with no request fails; a form that posts (sandbox 500, an error) passes; a validation stop stays quiet", async (page) => {
    await load(page, doc(`<main style="padding:40px"><form id="c"><label>Name <input name="name" required></label><label>Message <textarea name="message" required></textarea></label><button>Send</button></form></main><script>c.onsubmit=e=>{e.preventDefault();setTimeout(()=>{c.outerHTML='<p role="status">Thanks, your message has been received.</p>'},600)}</script>`));
    const bad = ids(await fm.submitOutcomes(page), /sent no request/);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    await load(page, doc(`<main style="padding:40px"><form id="c"><label>Name <input name="name" required></label><label>Message <textarea name="message" required></textarea></label><button>Send</button></form></main><script>c.onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/contact',{method:'POST',body:new FormData(c)});c.insertAdjacentHTML('afterend',r.ok?'<p role="status">Thanks, your message has been received.</p>':'<p role="alert">Could not send your message. Try again.</p>')}</script>`));
    assert.deepEqual(ids(await fm.submitOutcomes(page), /sent no request/), []);
    await load(page, doc(`<main style="padding:40px"><form id="c"><label>Phone <input name="tel2" pattern="\\d{40}" required></label><label>Message <textarea name="message" required></textarea></label><button>Send</button></form></main>`));
    assert.deepEqual(ids(await fm.submitOutcomes(page), /sent no request/), [], "native validation stopped it");
  });

  /* ═════ Compass 1r8kpw / ay9r6a: a UK mobile refused; "Up to 15 digits" under "+1 555 000 0000"; Country after Phone (FM14) ═════ */
  await test("1r8kpw + ay9r6a FM14: a pattern of digits only refuses +44 7700 900123 (hard), the hint contradicts the example and Country follows the phone (soft); a lenient field with Country first passes", async (page) => {
    await load(page, doc(`<main style="padding:40px"><form id="r"><label>Name <input name="name"></label><label>Phone number <input name="phone" pattern="\\d{7,15}" placeholder="+1 555 000 0000"></label><small>Up to 15 digits</small><label>Country <select name="country"><option value="">Choose</option><option>United Kingdom</option></select></label><button>Create account</button></form></main>`));
    const bad = await fm.phoneFields(page);
    assert.ok(bad.some((f) => !f.soft && /refuses "\+44 7700 900123"/.test(f.what)), JSON.stringify(bad, null, 1));
    assert.ok(bad.some((f) => f.soft && /digits only/.test(f.what)), "hint vs example");
    assert.ok(bad.some((f) => f.soft && /put Country first/.test(f.what)), "Country after Phone");
    await load(page, doc(`<main style="padding:40px"><form id="r"><label>Name <input name="name"></label><label>Country <select name="country"><option value="">Choose</option><option>United Kingdom</option></select></label><label>Phone number <input name="phone" pattern="\\+?[\\d\\s()\\-]{7,20}" placeholder="+44 7700 900123"></label><small>e.g. +44 7700 900123</small><button>Create account</button></form></main><script>r.onsubmit=e=>{e.preventDefault();fetch('/api/register',{method:'POST'})}</script>`));
    assert.deepEqual(await fm.phoneFields(page), []);
  });

  /* ═════ Compass af1p4q: a document upload that does not say which files it takes (FM15) ═════ */
  await test("af1p4q FM15: 'Passport or National ID *' with a bare file picker fails; accept + 'PDF, JPG or PNG, up to 10 MB' passes; an avatar picker with accept=image/* and a size hint stays quiet", async (page) => {
    await load(page, doc(`<main style="padding:40px"><form><label>Passport or National ID * <input type="file" name="doc"></label><button>Upload</button></form></main>`));
    const bad = await fm.fileHints(page);
    assert.equal(bad.length, 1, JSON.stringify(bad));
    await load(page, doc(`<main style="padding:40px"><form><label>Passport or National ID * <input type="file" accept=".pdf,.jpg,.png" name="doc"></label><small>PDF, JPG or PNG, up to 10 MB</small><button>Upload</button></form></main>`));
    assert.deepEqual(await fm.fileHints(page), []);
    await load(page, doc(`<main style="padding:40px"><div><label class="drop" style="display:block;border:2px dashed #999;padding:24px">Drop a photo — square image, up to 2 MB<input type="file" accept="image/*" style="display:none"></label></div></main>`));
    assert.deepEqual(await fm.fileHints(page), []);
  });

  /* ═════ Kindred x6wx1s: "Failed to fetch verification status" with Retry after a 404 on load (D4) ═════ */
  await test("x6wx1s D4: GET /api/kyc/status 404 + 'Failed to fetch verification status' + Retry fails; a real explanation passes; a 404 avatar with a fallback stays quiet", async (page) => {
    const bad = doc(`<nav><a href="/dashboard/verification">Verification</a></nav><main><div id="v"></div></main><script>fetch('/api/kyc/status').then(r=>{if(!r.ok)throw new Error('Failed to fetch verification status')}).catch(e=>{v.innerHTML='<p style="color:#b91c1c">'+e.message+'</p><button onclick="location.reload()">Retry</button>'})</script>`);
    await load(page, bad, { "/api/kyc/status": { status: 404, body: '{"error":"Specialist not found"}' } }, "/dashboard/verification");
    const f = await run.dataErrorOnLoad(page, ORIGIN + "/dashboard/verification", { auth: true });
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.match(f[0].what, /GET \/api\/kyc\/status answered 404.*Failed to fetch verification status.*Retry/);
    const good = doc(`<main><div id="v"></div></main><script>fetch('/api/kyc/status').then(r=>{if(!r.ok){v.innerHTML='<h1>Identity Verification</h1><p>Verification is for specialists\\' payouts; your client account does not need it. <a href="/become-partner">Become a partner</a></p>'}})</script>`);
    await load(page, good, { "/api/kyc/status": { status: 404, body: "{}" } }, "/dashboard/verification");
    assert.deepEqual(await run.dataErrorOnLoad(page, ORIGIN + "/dashboard/verification", { auth: true }), []);
    await load(page, doc(`<main><img id="a" alt="avatar" width="40" height="40"><p>Welcome back</p></main><script>fetch('/api/avatar').then(r=>{if(!r.ok)a.src='data:image/gif;base64,R0lGODlhAQABAAAAACw='})</script>`), { "/api/avatar": { status: 404, body: "{}" } }, "/dashboard");
    assert.deepEqual(await run.dataErrorOnLoad(page, ORIGIN + "/dashboard", { auth: true }), []);
  });

  /* ═════ Kindred gn3zcj: "Open case" in every specialist card opens the same bare /request-service (4.5) ═════ */
  await test("gn3zcj 4.5: two specialist cards whose 'Open case' both open /request-service fail; ?specialist=<id> passes; plan cards on /pricing and a shared mailto stay quiet", async (page) => {
    const cards = (a, b) => doc(`<main><div class="grid"><div class="card"><h3>Bright Signal #723</h3><p>NLP</p><a href="${a}">Open case</a></div><div class="card"><h3>Swift Atlas #684</h3><p>Vision</p><a href="${b}">Open case</a></div></div></main>`);
    await load(page, cards("/request-service", "/request-service"), {}, "/specialists");
    const bad = await run.cardActions(page, "/specialists");
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /"Open case" in 2 cards/);
    await load(page, cards("/request-service?specialist=sp_723", "/request-service?specialist=sp_684"), {}, "/specialists");
    assert.deepEqual(await run.cardActions(page, "/specialists"), []);
    await load(page, doc(`<main><div class="card"><h3>Starter</h3><a href="/register">Get started</a></div><div class="card"><h3>Pro</h3><a href="/register">Get started</a></div></main>`), {}, "/pricing");
    assert.deepEqual(await run.cardActions(page, "/pricing"), []);
    await load(page, cards("mailto:sales@x.test", "mailto:sales@x.test"), {}, "/specialists");
    assert.deepEqual(await run.cardActions(page, "/specialists"), []);
  });

  /* ═════ Compass tco25o / 6pn1k8: the CTA loses the specialist; "Start your application" preselects Client (J1) ═════ */
  await test("tco25o + 6pn1k8 J1: 'Hire this specialist' to an empty /request fails, ?specialist=zoe shown there passes; a sign-up link for specialists that opens with Client selected fails", async (page) => {
    const prof = (href) => doc(`<main><h1>Zoe Park</h1><p>Motion design</p><a href="${href}">Hire this specialist</a></main>`);
    const extra = { "/request": doc(`<main><h1>New brief</h1><form><textarea name="b"></textarea></form></main>`), "/request2": doc(`<main><h1>Brief for Zoe Park</h1></main>`) };
    await load(page, prof("/request"), extra, "/specialists/zoe");
    const bad = await run.ctaContext(page, { entity: true });
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /shows neither "Zoe Park"/);
    await load(page, prof("/request2?specialist=zoe"), extra, "/specialists/zoe");
    assert.deepEqual(await run.ctaContext(page, { entity: true }), []);
    const signup = (sel) => doc(`<main><h1>Join</h1><div role="radiogroup"><button role="radio" aria-checked="${sel === "client"}">I am a client</button><button role="radio" aria-checked="${sel === "spec"}">I am a specialist</button></div></main>`);
    await load(page, doc(`<main><h1>Become a specialist</h1><a href="/register?role=specialist">Start your application</a></main>`), { "/register": signup("client") }, "/become-a-specialist");
    const role = await run.ctaContext(page, {});
    assert.equal(role.length, 1, JSON.stringify(role));
    assert.match(role[0].what, /"I am a client" selected — the link is for a specialist/);
    await load(page, doc(`<main><h1>Become a specialist</h1><a href="/register?role=specialist">Start your application</a></main>`), { "/register": signup("spec") }, "/become-a-specialist");
    assert.deepEqual(await run.ctaContext(page, {}), []);
  });

  /* ═════ Compass kls2ou / 2g46xt: a guest's choice is lost through sign-in (J2) ═════ */
  await test("kls2ou + 2g46xt J2: a guest picks Erik, presses 'Sign in to start', signs in and lands on an empty brief (fails); landing on ?specialist=erik showing Erik passes", async (page) => {
    const req = (next) => doc(`<main><h1>Request</h1><section class="confirm"><h3>Erik Olsen</h3><p>Confirm hire</p><a href="/login?next=${encodeURIComponent(next)}">Sign in to start</a></section></main>`);
    const login = doc(`<main><form id="l"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form></main><script>l.onsubmit=e=>{e.preventDefault();location.href=new URLSearchParams(location.search).get('next')||'/'}</script>`);
    const pages = { "/login": login, "/request": doc(`<main><h1>Your brief</h1><form><textarea name="b"></textarea></form></main>`), "/request-kept": doc(`<main><h1>Your brief for Erik Olsen</h1></main>`) };
    await load(page, req("/request"), pages, "/request-guest");
    const bad = await run.guestChoice(page, { creds: { email: "qa@x.test", password: "pw" } });
    assert.equal(bad.length, 1, JSON.stringify(bad));
    assert.match(bad[0].what, /"Erik Olsen".*without it/);
    await load(page, req("/request-kept?specialist=erik"), pages, "/request-guest");
    assert.deepEqual(await run.guestChoice(page, { creds: { email: "qa@x.test", password: "pw" } }), []);
    await load(page, doc(`<main><h1>Home</h1><p>Hello</p></main>`), pages, "/");
    assert.deepEqual(await run.guestChoice(page, { creds: { email: "qa@x.test", password: "pw" } }), [], "no CTA, no choice");
  });

  /* ═════ Compass gn14vd / vu8j0h / 2t4uiv / 1fxg7h / r2jy12: after a choice the result stays below the screen (3.9) ═════ */
  const chips = (scroll, header = "") => doc(`${header}<main style="padding:16px"><div role="group" aria-label="Discipline"><button aria-pressed="true">All</button><button aria-pressed="false" id="d">Design AI</button><button aria-pressed="false">Language AI</button></div><div style="height:900px">Intro text about the service index.</div><section id="r"><h3>All specialists</h3></section><div style="height:1200px">More content below the results.</div></main><script>d.onclick=()=>{d.setAttribute('aria-pressed','true');r.innerHTML='<h3>4 specialists in Design AI</h3><ul><li>A</li><li>B</li></ul>';${scroll}}</script>`);
  await test("gn14vd + vu8j0h 3.9: choosing a discipline renders '4 specialists in Design AI' 600px below the screen (fails); scrollIntoView passes; under a sticky header it fails again (2t4uiv / 1fxg7h)", async (page) => {
    await load(page, chips(""));
    const bad = await run.selectionChecks(page, { max: 1 });
    assert.ok(bad.findings.some((f) => f.check === "3.9" && /below the screen/.test(f.what) && /Design AI/.test(f.what)), JSON.stringify(bad));
    await load(page, chips("r.scrollIntoView({block:'start'})"));
    assert.deepEqual((await run.selectionChecks(page, { max: 1 })).findings.filter((f) => f.check === "3.9"), []);
    await load(page, chips("r.scrollIntoView({block:'start'})", `<header style="position:sticky;top:0;height:72px;background:#fff;border-bottom:1px solid #ddd;z-index:5">Compass</header>`));
    const under = await run.selectionChecks(page, { max: 1 });
    assert.ok(under.findings.some((f) => f.check === "3.9" && /under the 72px sticky header/.test(f.what)), JSON.stringify(under, null, 1));
    // a toggle that changes only itself, and results right under the chips
    await load(page, doc(`<main style="padding:16px"><div role="group"><button aria-pressed="false" onclick="this.setAttribute('aria-pressed','true')">Remote only</button><button aria-pressed="false">On site</button></div><p>Listings</p></main>`));
    assert.deepEqual((await run.selectionChecks(page, { max: 1 })).findings, []);
  }, { width: 360, height: 800 });

  /* ═════ Compass s2l9w1 / 1nel7r / r2jy12: the match result behind a POST (states.allowPost) ═════ */
  const match = doc(`<main style="padding:16px"><form id="m"><label>Describe the task <textarea name="brief" required minlength="20"></textarea></label><button type="submit">Find specialists</button></form><div style="height:900px"></div><section id="res"></section></main><script>m.onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/match',{method:'POST',body:new FormData(m)});const j=await r.json();res.innerHTML='<h2>'+j.cards.length+' matches</h2><div class="confirm"><h3>Erik Olsen</h3><p>Confirm hire · 120 credits</p><a href="/login">Sign in to start</a><button id="h">Hire</button></div>';document.getElementById('h').onclick=()=>fetch('/api/hire',{method:'POST'})}</script>`);
  await test("s2l9w1 + 1nel7r + r2jy12 states.allowPost: the read-only /api/match POST passes and the result is checked (below the screen: 3.9; 'Sign in to start' to a signed-in user: A5); /api/hire is never sent; without allowPost the result is 'not tested'", async (page) => {
    await load(page, match, { "POST /api/match": { body: JSON.stringify({ cards: [1, 2, 3] }) } });
    const r = await states(page, { allowPost: ["/api/match"], auth: true });
    assert.ok(r.states.some((x) => /with sample data \(allowPost\)/.test(x)), JSON.stringify(r.states));
    assert.ok(r.findings.some((f) => f.check === "3.9" && /matches/.test(f.what)), JSON.stringify(r.findings, null, 1));
    assert.ok(r.findings.some((f) => f.check === "A5" && /Sign in to start/.test(f.what)), "A5 in the result state");
    assert.equal(hits.filter((h) => h === "POST /api/hire").length, 0, "nothing hired");
    assert.ok(hits.includes("POST /api/match"), "the match POST reached the server");
    await load(page, match, { "POST /api/match": { body: JSON.stringify({ cards: [1] }) } });
    const off = await states(page);
    assert.ok(off.notTested.some((x) => /the result of "Find specialists" with data/.test(x)), JSON.stringify(off.notTested));
    assert.ok(!hits.includes("POST /api/match"), "aborted without allowPost");
  }, { width: 390, height: 800 });

  /* ═════ 6.12 windows open and close with motion (5.5.8) ═════ */
  // open: a fade + rise of `inMs`; close: unmounted at once (outMs 0) or faded out for `outMs` and then removed
  const win = (inMs, outMs) => doc(`<main style="padding:24px"><h1>Plans</h1><button id="open">Buy credits</button></main>
    <style>@keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
      .scrim{position:fixed;inset:0;background:rgba(0,0,0,.4)}
      @keyframes out{to{opacity:0;transform:translateY(12px)}}
      .win{position:fixed;top:20%;left:30%;width:360px;padding:24px;background:#fff;animation:in ${inMs}ms ease-out both}
      .win.out{animation:out ${outMs}ms ease-in both}</style>
    <script>
      document.getElementById("open").onclick = () => {
        const s = document.createElement("div"); s.className = "scrim";
        s.innerHTML = '<div class="win" role="dialog" aria-modal="true"><h2>Top up</h2><button class="x">Close</button></div>';
        document.body.appendChild(s);
        const close = () => { const w = s.querySelector(".win"); if (${outMs} === 0) return s.remove(); w.classList.add("out"); setTimeout(() => s.remove(), ${outMs}); };
        s.querySelector(".x").onclick = close;
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { once: true });
      };
    </script>`);
  const motion = async (page) => {
    await run.armWindowMotion(page);
    await page.click("#open");
    const entrance = await run.windowEntrance(page);
    const exit = await run.windowExit(page);
    return { entrance, exit };
  };
  await test("6.12 windows: unmounted on close and a 150ms opening fail; a 180ms fade-out and a 240ms opening pass; nothing under reduced motion", async (page) => {
    await load(page, win(150, 0));
    let r = await motion(page);
    assert.equal(r.entrance.length, 1, JSON.stringify(r.entrance));
    assert.match(r.entrance[0].what, /opens abruptly: its opening animation lasts 1\d\dms/);
    assert.equal(r.exit.findings.length, 1, JSON.stringify(r.exit));
    assert.match(r.exit.findings[0].what, /closes with no animation: it is removed at once/);
    await load(page, win(240, 180));
    r = await motion(page);
    assert.deepEqual(r.entrance, [], "240ms opening");
    assert.deepEqual(r.exit, { findings: [], notTested: [] }, "180ms fade-out");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await load(page, win(150, 0));
    r = await motion(page);
    assert.deepEqual([...r.entrance, ...r.exit.findings], [], "reduced motion: skipped");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });
  await test("6.12 in the states run: the window a click opens is measured as it opens and as it closes", async (page) => {
    await load(page, win(150, 0));
    const res = await states(page);
    const m = res.findings.filter((f) => f.check === "6.12");
    assert.ok(m.some((f) => /after clicking "Buy credits": the window opens abruptly/.test(f.what)), JSON.stringify(res.findings.map((f) => f.what)));
    assert.ok(m.some((f) => /closes with no animation/.test(f.what)), JSON.stringify(res.findings.map((f) => f.what)));
    await load(page, win(240, 180));
    const ok = await states(page);
    assert.deepEqual(ok.findings.filter((f) => f.check === "6.12"), [], JSON.stringify(ok.findings.map((f) => f.what)));
  });

  /* ═════ Compass tpag4h: "Talk to sales" does nothing (6.14) ═════ */
  await test("tpag4h 6.14: a button with no handler fails; a mailto link, a Copy button and a disabled button stay quiet", async (page) => {
    await load(page, doc(`<main style="padding:24px"><section><h2>Professional solutions</h2><button class="btn">Talk to sales</button><button id="cp">Copy link</button><button disabled>Soon</button><button id="m">More</button><p id="x"></p></section></main><script>cp.onclick=()=>navigator.clipboard.writeText('x').catch(()=>{});m.onclick=()=>{x.textContent='More details'}</script>`));
    const bad = await run.deadButtons(page);
    assert.deepEqual(bad.map((f) => f.what.split('"')[1]), ["Talk to sales"], JSON.stringify(bad));
    await load(page, doc(`<main style="padding:24px"><a class="btn" href="mailto:sales@compass.test">Talk to sales</a></main>`));
    assert.deepEqual(await run.deadButtons(page), []);
  });
  await test("6.14 a click that opens a modal is undone before the next button: buttons under the overlay are not dead; a dead one after them still is; a click that cannot land is not tested, not dead", async (page) => {
    const modal = (escape) => `<script>
      function openModal(n) {
        const o = document.createElement("div");
        o.className = "overlay"; o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50";
        o.innerHTML = '<div role="dialog" aria-modal="true" style="position:absolute;top:20%;left:20%;width:300px;background:#fff;padding:24px">Checkout ' + n + '</div>';
        document.body.appendChild(o);
      }
      ${escape ? 'document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".overlay").forEach((o) => o.remove()); });' : ""}
    </script>`;
    const buy = [100, 500, 1000].map((n) => `<button onclick="openModal(${n})">Buy ${n} credits</button>`).join("");
    for (const escape of [true, false]) {
      await load(page, doc(`<main style="padding:24px"><section><h2>Plans</h2>${buy}</section></main>${modal(escape)}`));
      assert.deepEqual(await run.deadButtons(page), [], `modal buttons are not dead (Escape ${escape ? "closes" : "does not close"} the modal)`);
    }
    await load(page, doc(`<main style="padding:24px"><section><h2>Plans</h2>${buy}<button class="btn">Choose an amount</button><button>Talk to sales</button></section></main>${modal(false)}<script>document.querySelector(".btn").onclick = () => openModal(0)</script>`));
    const bad = await run.deadButtons(page);
    assert.deepEqual(bad.map((f) => f.what.split('"')[1]), ["Talk to sales"], JSON.stringify(bad));
    // a button the click cannot reach (always covered) is listed as not tested, never as dead
    const notTested = [];
    await load(page, doc(`<main style="padding:24px;position:relative"><button>Covered</button><div style="position:absolute;inset:0;z-index:5"></div></main>`));
    assert.deepEqual(await run.deadButtons(page, { notTested }), []);
    assert.ok(notTested.some((x) => /6\.14 "Covered": the click did not land/.test(x)), JSON.stringify(notTested));
  });

  /* ═════ Kindred ga1ipn / d6p4gh / spdonv / gm21xv / 2b9nt9: /admin and /docs/api are not linked from anything (COV1) ═════ */
  await test("ga1ipn + d6p4gh + spdonv + gm21xv + 2b9nt9 COV1: prepare opens the repo's static routes no link leads to (/admin, /docs/api); api/ routes and a page that bounces to /login stay out", async () => {
    const repo = mkdtempSync(join(tmpdir(), "bs-cov1-"));
    const w = (f, t) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), t); };
    w("package.json", '{"name":"fx","private":true}');
    for (const f of ["app/page.tsx", "app/pricing/page.tsx", "app/(admin)/admin/page.tsx", "app/docs/api/page.tsx", "app/(auth)/login/page.tsx", "app/settings/page.tsx", "app/_drafts/page.tsx"]) w(f, "export default function P() { return null; }\n");
    w("app/api/x/route.ts", "export const GET = () => new Response('x');\n");
    w("babysitter.config.json", JSON.stringify({ baseURL: ORIGIN, routes: ["/"], login: { url: "/login" }, locales: false }));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    site = {
      "/": doc(`<main><a href="/pricing">Pricing</a><a href="/login">Sign in</a></main>`), "/pricing": doc("<main><h1>Pricing</h1></main>"), "/login": doc("<main><form><input type=email><input type=password></form></main>"),
      "/admin": doc(`<aside><a href="/admin"><b>KINDRED</b></a><a href="/admin">Overview</a></aside><main><h1>Bureau</h1><p>Users: 42</p></main>`), "/docs/api": doc("<main><h1>API</h1><code>https://api.kindred.ai/v1</code></main>"),
      "/settings": (req, res) => { res.writeHead(307, { location: "/login" }); res.end(); }, "/api/x": "x",
    };
    const r = await new Promise((done) => { const ch = spawn(process.execPath, [join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env: { ...process.env, BABYSITTER_ROOT: repo, BASE_URL: ORIGIN, LOGIN_EMAIL: "", LOCALES: "" } }); let o = ""; ch.stdout.on("data", (d) => (o += d)); ch.stderr.on("data", (d) => (o += d)); ch.on("close", (s) => done({ s, o })); });
    const routes = JSON.parse(readFileSync(join(repo, ".babysitter/routes.json"), "utf8")).map((x) => x.path);
    const crawl = JSON.parse(readFileSync(join(repo, ".babysitter/crawl.json"), "utf8"));
    rmSync(repo, { recursive: true, force: true });
    assert.equal(r.s, 0, r.o);
    assert.ok(routes.includes("/admin") && routes.includes("/docs/api"), JSON.stringify(routes));
    assert.deepEqual(crawl.unlinked.sort(), ["/admin", "/docs/api"], JSON.stringify(crawl.unlinked));
    assert.ok(!routes.includes("/settings") && !routes.some((p) => /api\/x|_drafts/.test(p)), JSON.stringify(routes));
    assert.match(r.o, /2 page\(s\) no link leads to/);
  });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error(`misses-550-states: ${failed} failed`); process.exit(1); }
console.log("misses-550-states: all passed");
