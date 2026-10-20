// 5.2.0 stage gates (lib/stage.js, playwright/checks/stage.js): production vs testing. Fixture pages are served
// locally; the Nexus status is mocked. Like misses-520, this file also runs on an older checkout: there the stage
// modules do not exist and the old detector (CT2 test-data patterns over the page text) is all there is.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import * as c from "../playwright/checks.js";
import { TEST_DATA } from "../lib/content-rules.js";

const opt = async (p) => { try { return await import(p); } catch { return {}; } };
const S = await opt("../playwright/checks/stage.js");
const LS = await opt("../lib/stage.js");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
let failed = 0, passed = 0;
let site = {};
const server = createServer((req, res) => { const u = new URL(req.url, "http://x"); res.writeHead(site[u.pathname] ? 200 : 404, { "content-type": "text/html; charset=utf-8" }); res.end(site[u.pathname] || "<h1>Not found</h1>"); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const doc = (b) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>x</title></head><body>${b}</body></html>`;
async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await c.install(page);
  try { await fn(page); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 4).join("\n    ")}`); } finally { await ctx.close(); }
}
const load = async (page, path, html) => { site[path] = html; await page.goto(ORIGIN + path); await page.waitForTimeout(100); };
// the old detector: CT2's test-data patterns over the visible text
const ct2 = async (page) => { const t = await page.evaluate(() => document.body.innerText); return TEST_DATA.map((re) => t.match(re)?.[0]).filter(Boolean); };
const card = (name, extra = "") => `<li class="card" style="list-style:none;border:1px solid #ccc;padding:12px;margin:8px"><a href="/specialists/${name.toLowerCase().replace(/\W+/g, "-")}"><strong>${name}</strong></a> ${extra}<p>Brand designer · 800 credits</p></li>`;

try {
  await test("stage: config wins; else the Nexus status (LIVE = live, anything else = test); the testCredentials text is reduced to true/false", async () => {
    assert.ok(LS.resolveStage, "lib/stage.js exists");
    assert.equal(LS.stageFromStatus("LIVE"), "live");
    assert.equal(LS.stageFromStatus("READY_FOR_ONBOARDING"), "test");
    assert.deepEqual(LS.resolveStage({ stage: "live" }).stage, "live");
    assert.equal(LS.resolveStage({}, null), null);
    const fetchImpl = async (u, o) => { assert.equal(o.headers.Authorization, "Bearer k"); return { ok: true, status: 200, text: async () => JSON.stringify({ status: "READY_FOR_BUSINESS_REVIEW", testCredentials: "buyer: qa@x / secret" }) }; };
    const st = await LS.fetchStage({ url: "https://n.test", key: "k", slug: "parallel", fetchImpl });
    assert.equal(st.stage, "test"); assert.equal(st.testCredentials, true);
    assert.ok(!JSON.stringify(st).includes("secret"), "credentials are never kept");
  });
  await test("ST1 live: a specialist named 'Arman Test' and a 'Demo client' card are reported; CT2 alone passed them (Praxis catalog)", async (page) => {
    await load(page, "/specialists", doc(`<main><h1>Specialists</h1><ul>${card("Gunel Zeynalova")}${card("Arman Test")}${card("Demo Client")}</ul></main>`));
    const old = await ct2(page);
    const now = S.liveTestEntities ? await S.liveTestEntities(page) : [];
    assert.ok(now.some((f) => /Arman Test/.test(f.what)) && now.some((f) => /Demo Client/.test(f.what)), JSON.stringify({ old, now }));
  });
  await test("ST1 live: real names and copy about testing ('We test every brief', 'A/B testing', the service 'QA & Test Automation') are not test entities (Praxis /request-service)", async (page) => {
    assert.ok(S.liveTestEntities, "stage checks exist");
    await load(page, "/", doc(`<main><h1>Hire a designer</h1><p>We test every brief before it reaches a specialist.</p><h3>A/B testing for landing pages</h3><ul>${card("Gunel Zeynalova")}${card("Erik Olsen")}<li class="card"><button><span><span>QA & Test Automation</span></span></button></li><li class="card"><strong>Unit Test Suites</strong></li></ul></main>`));
    assert.deepEqual(await S.liveTestEntities(page), []);
  });
  await test("ST2 test: a test specialist without a marker is presented as real; with a visible 'Test' badge (or data-test-entity) it passes", async (page) => {
    assert.ok(S.unmarkedTestEntities, "stage checks exist");
    await load(page, "/specialists", doc(`<main><ul>${card("Arman Test")}</ul></main>`));
    assert.equal((await S.unmarkedTestEntities(page)).length, 1);
    await load(page, "/specialists", doc(`<main><ul>${card("Arman Test", '<span style="background:#ffe;padding:2px 6px">Test</span>')}${card("QA Buyer", '<span data-test-entity>Test account</span>')}</ul></main>`));
    assert.deepEqual(await S.unmarkedTestEntities(page), []);
  });
  await test("ST3 test: an empty catalog, or one where nobody can be hired, is reported; a catalog with a hireable test specialist passes", async (page) => {
    assert.ok(S.catalogState, "stage checks exist");
    await load(page, "/specialists", doc(`<main><h1>Specialists</h1><p>No specialists yet.</p></main>`));
    let cs = await S.catalogState(page, "/specialists");
    assert.equal(cs.items.length, 0); assert.equal(cs.empty, true);
    site["/specialists/arman-test"] = doc(`<main><h1>Arman Test <span>Test</span></h1><button disabled>Hire</button></main>`);
    await load(page, "/specialists", doc(`<main><ul>${card("Arman Test", "<span>Test</span>")}</ul></main>`));
    cs = await S.catalogState(page, "/specialists");
    assert.deepEqual(cs.items, ["/specialists/arman-test"]); assert.equal(cs.hireable, null);
    await page.goto(ORIGIN + "/specialists/arman-test");
    assert.equal((await S.catalogState(page, "/specialists/arman-test")).hireable, null, "a disabled Hire is not hireable");
    // a catalog drawn as dossier buttons, no links (Praxis /specialists): the entities still count
    await load(page, "/specialists", doc(`<main><button style="display:block;height:120px">Adam T. Test profile — Test profile run by the team for trying hires on the test site. OPEN DOSSIER</button></main>`));
    cs = await S.catalogState(page, "/specialists");
    assert.equal(cs.items.length, 0); assert.equal(cs.buttons, 1);
    site["/specialists/arman-test"] = doc(`<main><h1>Arman Test <span>Test</span></h1><button>Hire</button></main>`);
    await page.goto(ORIGIN + "/specialists/arman-test");
    assert.equal((await S.catalogState(page, "/specialists/arman-test")).hireable, "Hire");
  });
} finally { await browser.close(); server.close(); }
console.log(`\nstage: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
