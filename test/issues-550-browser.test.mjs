// 5.5.0 — GitHub issues #4 (Kindred) and #5 (Compass): the false alarms and setup gaps that need a browser, each
// from the real case (bad / good / look-alike). RUN: node test/issues-550-browser.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import * as a from "../playwright/acceptance.js";
import * as k from "../playwright/checks/content.js";
import * as stg from "../playwright/checks/stage.js";
import * as run from "../playwright/checks/run.js";
import * as forms from "../playwright/checks/forms.js";
import * as L from "../playwright/checks/layout.js";
import { start } from "./fixtures/run/site/server.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let site = { "/": "" };
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method !== "GET") { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}"); }
  res.writeHead(site[u.pathname] ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
  res.end(site[u.pathname] ?? "<!doctype html><title>404</title><h1>Not found</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (body, head = "", lang = "en") => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page</title><style>*{box-sizing:border-box}body{margin:0;font:14px/1.4 Arial;background:#fff;color:#111}${head}</style></head><body>${body}</body></html>`;
async function load(page, html, extra = {}, path = "/") { site = { "/": html, ...extra }; await page.goto(ORIGIN + path, { waitUntil: "load" }); await page.waitForTimeout(120); }
async function test(name, fn, viewport = { width: 1280, height: 800 }) {
  if (only && !only.test(name)) return;
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")}`); } finally { await ctx.close(); }
}

try {
  /* ═════ #4.8 / #5 FP6 C1: an essential-only notice with one OK; "OK" + "Manage" is a banner ═════ */
  const banner = (buttons, script = "") => doc(`<main><h1>Home</h1><p>Text</p></main><div class="cookie-notice" role="region" aria-label="Cookies" style="position:fixed;bottom:0;left:0;right:0;background:#eee;padding:12px"><p>We use only strictly necessary cookies to keep you signed in.</p>${buttons}</div><script>document.querySelectorAll(".cookie-notice button").forEach((b) => b.onclick = () => { localStorage.setItem("cookie-consent", "ok"); ${script} document.querySelector(".cookie-notice").remove(); });</script>`);
  await test("#4.8 C1 (Kindred): a notice with one 'OK' on a site that stores only the choice is compliant — no 'no Accept button', no 'no Reject'", async (page) => {
    await load(page, banner("<button>OK</button>"));
    assert.deepEqual(await a.cookieConsent(page, { acc: a.DEFAULTS }), []);
  });
  await test("#5 FP6 C1 (Compass): 'OK' + 'Manage' is the banner's accept; 'OK' that stores an analytics id still needs Reject", async (page) => {
    await load(page, banner('<button>OK</button><button type="button" class="m">Manage</button>'));
    const out = await a.cookieConsent(page, { acc: a.DEFAULTS });
    assert.ok(!out.some((o) => /no cookie banner with an Accept/.test(o.what)), JSON.stringify(out));
    await load(page, banner("<button>OK</button>", 'localStorage.setItem("_ga_tracker", "GA1.2.3");'));
    const bad = await a.cookieConsent(page, { acc: a.DEFAULTS });
    assert.ok(bad.length === 1 && /offers only "OK", but the site stores localStorage "_ga_tracker"/.test(bad[0].what), JSON.stringify(bad));
  });
  await test("#4.8 C1 look-alike: an 'OK' in an ordinary dialog is not a cookie banner; no banner at all still fails", async (page) => {
    await load(page, doc('<main><h1>Home</h1></main><div role="dialog"><p>Your changes were saved.</p><button>OK</button></div>'));
    assert.match((await a.cookieConsent(page, { acc: a.DEFAULTS }))[0]?.what || "", /no cookie banner/);
    await load(page, doc("<main><h1>Home</h1></main>"));
    assert.match((await a.cookieConsent(page, { acc: a.DEFAULTS }))[0]?.what || "", /no cookie banner/);
  });

  /* ═════ #4.5 1.19: the painted surface decides, not <body> ═════ */
  await test("#4.5 1.19 (Kindred): body keeps a dark root theme, every page is wrapped in a cream .surface-editorial → light page, no finding; a dark painted page without color-scheme dark still fails", async (page) => {
    await load(page, doc('<div class="surface-editorial" style="min-height:100vh;background:#f6f0e4;color:#222;color-scheme:light"><main style="padding:40px"><h1>Specialists</h1><p>Text</p></main></div>', "body{background:#0b0b10;color:#eee}"));
    assert.deepEqual((await c.nativeSkin(page)).filter((f) => /dark page/.test(f.what)), []);
    await load(page, doc('<main style="padding:40px"><h1>Specialists</h1><p>Text</p></main>', "body{background:#0b0b10;color:#eee}"));
    assert.equal((await c.nativeSkin(page)).filter((f) => /dark page/.test(f.what)).length, 1);
    await load(page, doc('<div style="min-height:100vh;background:#111;color:#eee"><main style="padding:40px"><h1>Dark</h1></main></div>'));
    assert.equal((await c.nativeSkin(page)).filter((f) => /dark page/.test(f.what)).length, 1, "a dark surface over a white body is a dark page");
  });

  /* ═════ #4.7 / #5 FP4 CT9 / CT10 / CT2: the signed-in test account's own address ═════ */
  await test("#4.7 / #5 FP4 (Kindred /settings, Compass /settings): the role account's own e-mail (roles[].env) is not CT10 / CT9 / CT2; another plain address still is", async (page) => {
    const cfg = { roles: [{ name: "specialist", env: { LOGIN_EMAIL: "SPEC_EMAIL" } }] };
    const prev = process.env.SPEC_EMAIL; process.env.SPEC_EMAIL = "executor@example.com";
    try {
      await load(page, doc('<main><h1>Settings</h1><p>Signed in as executor@example.com</p><p>Questions: help@kindred.test</p></main>'));
      const own = k.ownEmails(cfg);
      assert.deepEqual(own, ["executor@example.com"]);
      const em = await k.emailFindings(page, { cfg, dns: false, loginEmail: "" });
      assert.ok(!em.hard.some((f) => /executor@/.test(f.what)), JSON.stringify(em.hard));
      assert.ok(em.hard.some((f) => /help@kindred\.test/.test(f.what)), "a support address shown as text is still CT10 / CT9");
      const cf = await k.copyFindings(page, {}, null, null, { own });
      assert.ok(!cf.hard.some((f) => /executor@example\.com/.test(f.what)), JSON.stringify(cf.hard));
      const pub = await k.copyFindings(page, {}, null, null, { own: [] });
      assert.ok(pub.hard.some((f) => /test data shown to users: "executor@example\.com"/.test(f.what)), "on a public page (no own address) it is test data");
    } finally { if (prev === undefined) delete process.env.SPEC_EMAIL; else process.env.SPEC_EMAIL = prev; }
  });

  /* ═════ #5 FP5 CT11: what a user wrote is shown back as written ═════ */
  await test("#5 FP5 CT11 [kk] (Compass /dashboard/tasks): the buyer's English brief (pre-wrap, [data-user-content]) is not untranslated copy; an English UI label still is", async (page) => {
    const brief = "I need three AI-generated product images for the launch page, square, on a white background.";
    await load(page, doc(`<main><h1>Тапсырмалар</h1><p>Сіздің тапсырмаларыңыз осында көрсетіледі.</p><article><h2>Өнім суреттері</h2><p style="white-space:pre-wrap">${brief}</p></article><div data-user-content><p>${brief}</p></div><button>View all tasks</button></main>`, "", "kk"));
    const out = (await k.languageFindings(page, { cfg: {}, locale: "kk" })).hard.filter((f) => f.id === "CT11" || /CT11/.test(f.what));
    assert.ok(!out.some((f) => /AI-generated/.test(f.what)), JSON.stringify(out));
    assert.ok(out.some((f) => /View all tasks/.test(f.what)), JSON.stringify(out));
  });

  /* ═════ #4.6 / #5 FP3 ST3: the product's own hire CTA, followed one step ═════ */
  await test("#5 FP3 ST3 (Compass /specialists/<id>): 'Start a brief with this profile' is hireable; a link into /request is followed one step to its Hire", async (page) => {
    await load(page, doc('<main><h1>Nadia</h1><a href="/request?specialist=nadia">Start a brief with this profile</a></main>'), {}, "/");
    assert.equal((await stg.catalogState(page, "/specialists/nadia")).hireable, "Start a brief with this profile");
    await load(page, doc('<main><h1>Nadia</h1><a href="/request?specialist=nadia">Continue with Nadia</a></main>'));
    const st = await stg.catalogState(page, "/specialists/nadia");
    assert.equal(st.hireable, null);
    assert.equal(new URL(st.flow).pathname, "/request");
    await load(page, doc('<main><h1>Nadia</h1><a href="/about">More about Nadia</a></main>'));
    assert.equal((await stg.catalogState(page, "/specialists/nadia")).flow, null, "an ordinary link is not the request flow");
  });

  /* ═════ #5 FP2 A4: the avatar menu after the language and currency switchers ═════ */
  await test("#5 FP2 A4 (Compass): Sign Out is the last item of the avatar dropdown (aria-label=\"Account menu\") behind 5 other header menus", async (page) => {
    const menus = ["Language", "Currency", "Help", "Products", "Resources"].map((x) => `<button aria-haspopup="menu" aria-expanded="false">${x}</button>`).join("");
    await load(page, doc(`<header style="display:flex;gap:8px;padding:8px">${menus}<button aria-label="Account menu" aria-haspopup="menu" id="acc"><span class="avatar">B</span></button></header><div id="m" role="menu" hidden><div role="menuitem">Profile</div><div role="menuitem" id="so">Sign Out</div></div><main><h1>Dashboard</h1></main><script>document.getElementById("acc").onclick = () => { document.getElementById("m").hidden = false; }; document.getElementById("so").onclick = () => { document.title = "signed out"; };</script>`));
    assert.equal(await a.clickControl(page, a.SIGN_OUT_RE), true);
    await page.waitForTimeout(100);
    assert.equal(await page.title(), "signed out");
  });

  /* ═════ #4.12 FM1: "15 to 34 letters and digits" (aria-describedby) is the reason ═════ */
  await test("#4.12 FM1 (Kindred IBAN): a hint wired with aria-describedby saying '15 to 34 letters and digits' explains a refused value", async (page) => {
    const field = (hint) => doc(`<main><form onsubmit="event.preventDefault()"><div><div><div><label for="iban">IBAN</label><input id="iban" name="iban" type="number" min="15" max="34" aria-describedby="iban-hint" required></div></div></div><p id="iban-hint">${hint}</p><button>Save payout details</button></form></main>`);
    await load(page, field("15 to 34 letters and digits, no spaces"));
    const out = (await forms.numericBounds(page)).filter((f) => !f.na && /IBAN/.test(f.what + f.where));
    assert.ok(!out.some((f) => /nothing next to the field says why/.test(f.what)), JSON.stringify(out));
  });

  /* ═════ #5 C (Compass Add Credits): states.wallet false opens the top-up dialog and measures it, presses nothing in it ═════ */
  await test("#5 C wallet: with states.wallet off the 'Add credits' dialog is opened and measured (its cut hint is found); nothing inside it is pressed", async (page) => {
    await load(page, doc(`<main><h1>Wallet</h1><button id="add" aria-haspopup="dialog">Add credits</button></main><div role="dialog" id="d" hidden style="position:fixed;top:40px;left:20px;width:320px;background:#fff;border:1px solid #ccc;padding:16px"><h2>Add credits</h2><label>Amount<input id="amt" type="text"></label><p id="hint" style="width:560px">Any whole amount, €1 to €17,850 per top-up</p><button id="cont">Continue</button></div><script>document.getElementById("add").onclick = () => { document.getElementById("d").hidden = false; }; document.getElementById("cont").onclick = () => { document.title = "pressed"; };</script>`));
    const res = await run.stateChecks(page, { reload: () => page.reload({ waitUntil: "load" }), wallet: false, maxOpeners: 5, maxForms: 0 });
    assert.ok(res.states.some((s) => /clicked "Add credits"/.test(s)), JSON.stringify(res));
    assert.ok(res.notTested.some((s) => /opened and measured, nothing pressed/.test(s)), JSON.stringify(res.notTested));
    assert.notEqual(await page.title(), "pressed");
    assert.ok(res.findings.some((f) => /after clicking "Add credits"/.test(f.what)), JSON.stringify(res.findings.map((f) => f.what)));
  }, { width: 390, height: 800 });


  /* ═════ #4.13 1.3: a select trigger is a field, not an outlined button ═════ */
  await test("#4.13 1.3/1.16 (Kindred): the currency SelectTrigger and a form select (role=combobox) are not outlined buttons with their own font; a real outlined button still counts", async (page) => {
    await load(page, doc(`<main style="padding:20px"><button role="combobox" aria-haspopup="listbox" style="border:1px solid #888;padding:8px 12px;height:48px;font-family:Arial">$ USD</button><button id="contact-topic" role="combobox" style="border:1px solid #888;padding:8px 12px;height:48px;font-family:Arial">Other</button><div><button style="border:1px solid #888;padding:8px 12px;height:40px;font-family:Georgia;border-radius:999px">Sign In</button></div></main>`));
    const btns = (await c.collectSignatures(page, "/")).filter((x) => x.kind === "button");
    assert.deepEqual(btns.map((x) => x.where.match(/"([^"]+)"/)?.[1] || x.where), ["Sign In"], JSON.stringify(btns.map((x) => x.where)));
  });

  /* ═════ #4.15 2.7: a sticky contents column is not an empty section ═════ */
  await test("#4.15 2.7 (Kindred /terms): an aside stretched to the article's height around a sticky nav is not 'mostly empty'; a min-h-screen section with nothing in it still is", async (page) => {
    const para = "<p>Clause text. ".repeat(1) + "</p>";
    await load(page, doc(`<main><section style="display:grid;grid-template-columns:220px 1fr;gap:24px"><aside><nav style="position:sticky;top:96px"><a href="#a">One</a><br><a href="#b">Two</a></nav></aside><article>${Array.from({ length: 120 }, (_, i) => `<p>Clause ${i + 1}: the specialist keeps the work private and delivers it on time.</p>`).join("")}</article></section><section><p>End</p></section></main>`));
    const r = await L.emptySpace(page);
    assert.ok(!r.soft.some((f) => /mostly empty/.test(f.what)), JSON.stringify(r.soft.map((f) => f.what)));
    await load(page, doc(`<main><section style="min-height:300vh"><h2>Hero</h2></section><section><p>End</p></section></main>`));
    assert.ok((await L.emptySpace(page)).soft.some((f) => /mostly empty/.test(f.what)), "a tall empty section still fails");
    void para;
  });

  /* ═════ #4.14 6.12: toggling back is judged on what the click opened ═════ */
  await test("#4.14 6.12 (Kindred /dashboard @390): 'Manage cookies' reopens an animated notice; the page's own re-render hiding its content wrapper is not blamed on the toggle", async (page) => {
    await load(page, doc(`<div id="app" class="min-h-screen"><main><h1>Case log Dashboard</h1><p>Rows</p></main></div><footer><button id="mc" type="button">Manage cookies</button></footer><div id="note" style="position:fixed;bottom:0;left:0;right:0;background:#eee;padding:12px;transition:opacity .2s, transform .2s;opacity:0;transform:translateY(8px);display:none">We use only necessary cookies <button id="ok" type="button">OK</button></div><script>
const note = document.getElementById("note"); let open = false;
document.getElementById("mc").onclick = () => {
  if (!open) { note.style.display = "block"; requestAnimationFrame(() => requestAnimationFrame(() => { note.style.opacity = 1; note.style.transform = "none"; })); open = true; }
  else { note.style.opacity = 0; note.style.transform = "translateY(8px)"; setTimeout(() => { note.style.display = "none"; }, 220); open = false;
    const app = document.getElementById("app"); const copy = app.cloneNode(true); app.replaceWith(copy); }
};</script>`));
    const u = page.url();
    const r = await c.interactionMotion(page, { reload: () => page.goto(u) });
    assert.ok(!r.hard.some((f) => /min-h-screen|Case log/.test(f.what)), JSON.stringify(r.hard.map((f) => f.what)));
  }, { width: 390, height: 800 });

  /* ═════ #4.17 3.5: the longest prefix is the current section ═════ */
  await test("#4.17 3.5 (Kindred /admin drawer): on /admin/users/42 'Members' (/admin/users) is the current section, not 'Overview' (/admin)", async (page) => {
    const nav = `<header><nav><ul><li><a href="/admin">Overview</a></li><li><a href="/admin/users" style="font-weight:700;color:#06c">Members</a></li><li><a href="/admin/cases">Cases</a></li><li><a href="/admin/settings">Settings</a></li></ul></nav></header><main><h1>Member 42</h1></main>`;
    await load(page, doc(nav), { "/admin/users/42": doc(nav) }, "/admin/users/42");
    const r = await L.activeNavStyle(page);
    assert.ok(![...r.hard, ...r.soft].some((f) => /Overview|Members/.test(f.what)), JSON.stringify([...r.hard, ...r.soft].map((f) => f.what)));
  });

  /* ═════ #4.16 P2: a collapsible contents list at the top on phones ═════ */
  await test("#4.16 P2 (Kindred, owner 21.10): on a phone a collapsible contents list (accordion) before the first section is the contents; one after the sections, or at desktop, still has to stay on screen", async (page) => {
    const sections = Array.from({ length: 8 }, (_, i) => `<h2 id="s${i}">Section ${i + 1}</h2>${"<p>" + "The specialist keeps the work private and delivers it on time. ".repeat(6) + "</p>"}`.repeat(1)).join("");
    const acc = `<div><button aria-expanded="false" aria-controls="toc" id="tb">On this page</button><nav id="toc" hidden>${Array.from({ length: 8 }, (_, i) => `<a href="#s${i}">Section ${i + 1}</a>`).join("")}</nav></div>`;
    await load(page, doc(`<main><h1>Terms</h1>${acc}${sections}</main>`));
    assert.ok(!(await a.policyLayout(page)).some((f) => /scrolls away/.test(f.what)), "collapsible at the top on a phone");
    assert.ok((await a.policyLayout(page, { tocMobile: "sticky" })).some((f) => /scrolls away/.test(f.what)), "layout.tocMobile: sticky asks for the sticky bar");
    await load(page, doc(`<main><h1>Terms</h1>${sections}${acc}</main>`));
    assert.ok((await a.policyLayout(page)).some((f) => /scrolls away/.test(f.what)), "a list after the sections is not the contents at the top");
  }, { width: 390, height: 800 });
  /* ═════ #4.1 prepare: login.url from acceptance.auth.signIn; no signed-in page reached → exit 1, loudly ═════ */
  const fx = await start();
  const repo = mkdtempSync(join(tmpdir(), "bs-550-prep-"));
  writeFileSync(join(repo, "package.json"), '{"name":"fx","private":true}');
  const sh = (args, opts) => new Promise((res) => { const ch = spawn(process.execPath, args, opts); let out = ""; ch.stdout.on("data", (d) => (out += d)); ch.stderr.on("data", (d) => (out += d)); ch.on("close", (status) => res({ status, out })); });
  const env = { ...process.env, BABYSITTER_ROOT: repo, BASE_URL: fx.url, LOCALES: "", SPEC_EMAIL: "spec@x.test", SPEC_PASSWORD: "pw" };
  delete env.LOGIN_EMAIL; delete env.LOGIN_PASSWORD;
  await test("#4.1 prepare (Kindred): no login.url but acceptance.auth.signIn = /login → the role signs in there", async () => {
    writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify({ baseURL: fx.url, routes: ["/"], acceptance: { auth: { signIn: "/login" } }, roles: [{ name: "specialist", env: { LOGIN_EMAIL: "SPEC_EMAIL", LOGIN_PASSWORD: "SPEC_PASSWORD" } }] }));
    const r = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env });
    assert.equal(r.status, 0, r.out.slice(-2000));
    const routes = JSON.parse(readFileSync(join(repo, ".babysitter/routes.json"), "utf8"));
    assert.ok(routes.some((x) => x.role === "specialist" && x.path === "/dashboard/jobs"), JSON.stringify(routes));
  });
  await test("#4.1 prepare (Kindred): every configured role fails to sign in → exit 1 with NO SIGNED-IN PAGE WAS REACHED (BABYSITTER_SIGNED_OUT=1 allows it)", async () => {
    writeFileSync(join(repo, "babysitter.config.json"), JSON.stringify({ baseURL: fx.url, routes: ["/"], roles: [{ name: "buyer", env: { LOGIN_EMAIL: "NO_SUCH_EMAIL", LOGIN_PASSWORD: "NO_SUCH_PW" } }, { name: "specialist", env: { LOGIN_EMAIL: "SPEC_EMAIL", LOGIN_PASSWORD: "SPEC_PASSWORD" } }] }));
    const r = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env });
    assert.equal(r.status, 1, r.out.slice(-2000));
    assert.match(r.out, /NO SIGNED-IN PAGE WAS REACHED — 2 role\(s\) configured/);
    assert.match(r.out, /specialist: no login\.url in babysitter\.config\.json/);
    const ok = await sh([join(TOOL, "playwright/prepare.mjs")], { cwd: repo, env: { ...env, BABYSITTER_SIGNED_OUT: "1" } });
    assert.equal(ok.status, 0, ok.out.slice(-1500));
  });
  fx.close();
  rmSync(repo, { recursive: true, force: true });
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error(`issues-550-browser: ${failed} failed`); process.exit(1); }
console.log("issues-550-browser: all passed");
