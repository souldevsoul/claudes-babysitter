// Rendered-page copy checks (playwright/checks/content.js) on fixture pages in test/fixtures/content/pages:
// each planted problem is reported with its element, each planted look-alike is not. Live false positives found
// on vertex.boutique / truelogos.pro / sprout.boutique / praxis-seven-gamma.vercel.app are pinned here too.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";
import * as k from "../playwright/checks/content.js";
import * as acceptance from "../playwright/acceptance.js";
import { _resetDnsCache } from "../lib/email-dns.js";

const here = dirname(fileURLToPath(import.meta.url));
const url = (name) => pathToFileURL(join(here, "fixtures", "content", "pages", name)).href;
const browser = await chromium.launch({ channel: "chrome" });
let failed = 0, n = 0;
async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await checks.install(page);
  try { await fn(page); n++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); }
  finally { await ctx.close(); }
}
const at = (list, id) => list.filter((f) => (f.selector || "").includes(`#${id}`) || (f.where || "").includes(`#${id}`));
const fired = (list, id, re) => assert.ok(at(list, id).some((f) => re.test(f.what)), `#${id} should report ${re}: ${JSON.stringify(list.map((f) => [f.selector, f.what.slice(0, 90)]), null, 1)}`);
const silent = (list, id) => assert.equal(at(list, id).length, 0, `#${id} must not be reported: ${JSON.stringify(at(list, id).map((f) => f.what))}`);

try {
  await test("CT1–CT8 on a page: every planted problem, with its element", async (page) => {
    await page.goto(url("copy.html"));
    const { hard } = await k.copyFindings(page, {});
    fired(hard, "launch", /open at launch.*\[CT1\]/);
    fired(hard, "promise", /We don't promise.*\[CT1\]/);
    fired(hard, "tpl", /#highlighted#/);
    fired(hard, "mustache", /\{\{name\}\}/);
    fired(hard, "company", /New Company 2.*\[CT2\]/);
    fired(hard, "nan", /NaN.*\[CT3\]/);
    fired(hard, "obj", /object Object/);
    fired(hard, "dash", /—.*\[CT5\]/);
    fired(hard, "date", /October 1, 2026.*\[CT6\]/);
    fired(hard, "iso", /2026-09-02T12:55:00Z/);
    assert.ok(hard.some((f) => /"1 profiles".*\[CT8\]/.test(f.what)), "1 profiles (uppercased by CSS) is caught");
    fired(hard, "btn", /button label "Save changes\."/);
    assert.ok(hard.some((f) => /heading "Simple pricing\."/.test(f.what)), "h1 with a period");
    assert.ok(hard.some((f) => /nav item "Pricing\."/.test(f.what)), "nav item with a period");
    assert.ok(hard.some((f) => /Pricing \| Acme/.test(f.what)) === false, "the <title> has no period");
  });

  await test("CT1–CT8 look-alikes stay quiet (live false positives: a price '500', prose about the 'Last updated' date, a heading split into lines, <br>)", async (page) => {
    await page.goto(url("copy.html"));
    const { hard } = await k.copyFindings(page, {});
    for (const id of ["ok-date", "ok-range", "ok-price", "ok-prose", "ok-body", "ok-btn", "ok-code", "ok-demo"]) silent(hard, id); // ok-code / ok-demo: Sprout /docs, /privacy
    assert.ok(!hard.some((f) => /an option\./.test(f.what)), "the middle line of a split heading is not its end (Vertex home)");
    assert.ok(!hard.some((f) => /designer\.Identity/.test(f.what)), "<br> reads as a space (TrueLogos home)");
    assert.ok(!hard.some((f) => /John Doe|--watch|a — b|Coming soon|TODO/.test(f.what)), `placeholders, code and hidden text are not copy: ${JSON.stringify(hard.map((f) => f.what))}`);
  });

  await test("CT9/CT10 emails: plain text, mismatched mailto, preview host and no-MX fail; the signed-in user's own address, table cells and image names pass; DNS cached", async (page) => {
    _resetDnsCache();
    await page.goto(url("email.html"));
    const dir = mkdtempSync(join(tmpdir(), "bs-dns-"));
    const asked = [];
    const fetchImpl = async (u) => {
      const q = new URL(u); asked.push(`${q.searchParams.get("name")}:${q.searchParams.get("type")}`);
      const name = q.searchParams.get("name");
      if (name === "acme.com" && q.searchParams.get("type") === "MX") return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 15, data: "10 mx.acme.com." }] }) };
      return { ok: true, json: async () => ({ Status: 0 }) };
    };
    const { hard } = await k.emailFindings(page, { dns: true, cache: join(dir, "dns.json"), loginEmail: "me@acme.com", fetchImpl });
    fired(hard, "plain", /support@acme\.com is shown as plain text.*\[CT10\]/);
    fired(hard, "mismatch", /says billing@acme\.com but opens mailto:sales@acme\.com/);
    fired(hard, "preview", /vercel\.app.*\[CT9\]/);
    fired(hard, "nomx", /cannot receive mail: .*no MX/);
    silent(hard, "linked"); silent(hard, "me"); silent(hard, "example"); // Sprout /agents/scheduler
    assert.ok(!at(hard, "cell").some((f) => /CT10/.test(f.what)), "an address in a table cell (a user list) need not be a mailto link");
    assert.ok(!hard.some((f) => /logo@2x|ghost@/.test(f.what)), "image names and hidden text are not addresses");
    assert.equal(asked.filter((a) => a === "acme.com:MX").length, 1, "one lookup per domain");
    // without DNS the preview host still fails
    _resetDnsCache();
    const off = await k.emailFindings(page, { dns: false, loginEmail: "me@acme.com" });
    fired(off.hard, "preview", /vercel\.app/);
    rmSync(dir, { recursive: true, force: true });
  });

  await test("CT11–CT13 a page shown in az: English sentence and a printed key fail, <html lang=en> fails; brands, domains and native text pass", async (page) => {
    await page.goto(url("lang-az.html"));
    const { hard } = await k.languageFindings(page, { locale: "az", keys: new Set(["pricing.calc.clamped"]) });
    fired(hard, "en", /English on the "az" page.*\[CT11\]/);
    fired(hard, "key", /translation key shown.*\[CT12\]/);
    assert.ok(hard.some((f) => /shown in "az" but <html lang="en">.*\[CT13\]/.test(f.what)), "lang must follow the locale");
    silent(hard, "az"); silent(hard, "domain"); silent(hard, "brands");
  });

  await test("CT11 one check, both heuristics: English left OR the default-language text unchanged — each string reported once; lang-tagged, translate=no, locales.keep, brands, one-token ids pass", async (page) => {
    const html = (h) => page.goto("data:text/html;charset=utf-8," + encodeURIComponent(h));
    await html(`<html lang="en"><body><h1>Hire specialists today</h1><p>Find a specialist for your task</p><p>Praxis Studio</p><p>Brand new tagline</p><p>__Secure-authjs.session-token</p></body></html>`);
    const defaults = await k.collectCopy(page);
    await html(`<html lang="az"><body><h1 id="same">Hire specialists today</h1><p id="en">Find a specialist for your task</p><p id="brand">Praxis Studio</p><p id="kept">Brand new tagline</p>
      <p id="cookie">__Secure-authjs.session-token</p><blockquote lang="en" id="quote">Hire specialists today</blockquote><p translate="no" id="tn">Hire specialists today</p><p id="az">Mütəxəssis tapın</p></body></html>`);
    const { hard } = await k.languageFindings(page, { cfg: { content: { brandTerms: ["Praxis", "Studio"] }, locales: { keep: ["Brand new tagline"] } }, locale: "az", defaults, defaultLocale: "en" });
    const ct11 = hard.filter((f) => f.id === "CT11");
    fired(ct11, "same", /untranslated in "az": "Hire specialists today" is the same text as on the default-language page/);
    fired(ct11, "en", /English on the "az" page/);
    assert.equal(at(ct11, "en").length, 1, `one report per string, not one per heuristic: ${JSON.stringify(at(ct11, "en"))}`);
    for (const id of ["brand", "kept", "cookie", "quote", "tn", "az"]) silent(ct11, id);
  });

  await test("B1 = CT1: acceptance's build-note check reports with the CT1 rules (one source of truth), defensive copy included", async (page) => {
    await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(`<html lang="en"><body><p id="leak">No mailbox is connected to this build.</p><p id="def">We would rather say so plainly.</p><p id="host">Open qa-preview.vercel.app to try it</p><p id="ok">We answer within a day.</p></body></html>`));
    await checks.install(page);
    const out = await acceptance.copyLeaks(page);
    fired(out, "leak", /\[B1 = CT1, BQA 5\]/); fired(out, "def", /would rather/); fired(out, "host", /vercel\.app/); silent(out, "ok");
    const { hard } = await k.copyFindings(page, {});
    assert.deepEqual(at(hard, "leak").length, 1, "CT1 reports the same phrase once");
  });

  await test("CT11 a Cyrillic locale: Latin-only sentence fails; names inside Kazakh sentences pass; lang matches", async (page) => {
    await page.goto(url("lang-kk.html"));
    const { hard } = await k.languageFindings(page, { locale: "kk" });
    fired(hard, "latin", /English on the "kk" page/);
    silent(hard, "kk"); silent(hard, "brand");
    assert.ok(!hard.some((f) => /CT13/.test(f.what)), JSON.stringify(hard));
  });

  await test("CT13 default locale: Cyrillic page declared lang=en is caught; no lang at all is caught", async (page) => {
    const html = (h) => page.goto("data:text/html;charset=utf-8," + encodeURIComponent(h));
    await html(`<html lang="en"><body><main>${"<p>Құпия сөзді электрондық пошта арқылы қалпына келтіру мүмкін емес, сондықтан бізге жазыңыз.</p>".repeat(5)}</main></body></html>`);
    const a = await k.languageFindings(page, {});
    assert.ok(a.hard.some((f) => /written in Cyrillic but <html lang="en">/.test(f.what)), JSON.stringify(a.hard));
    await html("<html><body><p>Hello there</p></body></html>");
    const b = await k.languageFindings(page, {});
    assert.ok(b.hard.some((f) => /no lang attribute/.test(f.what)));
    await html('<html lang="en"><body><p>Hello there, plain English page.</p></body></html>');
    assert.equal((await k.languageFindings(page, {})).hard.length, 0);
  });

  await test("CT15/CT16 legal names and the © line across pages; CT17 variants; CT18 numbers; CT7 dates by language", async () => {
    const rec = (route, o) => ({ route, locale: null, title: o.title || "", h1: o.h1 || [], legal: o.legal || [], copyright: o.copyright ?? "© 2026 Acme Ltd.", lastUpdated: o.lu || [], segs: (o.segs || []).map((t) => (typeof t === "string" ? { text: t, kind: "body" } : t)), footerSegs: [] });
    const legal = [{ text: "Terms", path: "/terms", family: "terms" }, { text: "Privacy Policy", path: "/privacy", family: "privacy" }, { text: "Cookie Policy", path: "/cookies", family: "cookies" }];
    const records = [
      rec("/", { legal, segs: ["Read the Terms of Service before you hire.", { text: "Log in", kind: "nav" }], copyright: "© 2026 Acme Ltd. All rights reserved." }),
      rec("/terms", { legal, title: "Terms of Service | Acme", h1: ["Terms of Service"], segs: ["See our Privacy Policy and the Cookies Notice.", { text: "Sign in", kind: "button" }] }),
      rec("/privacy", { legal, title: "Privacy Policy · Acme", h1: ["Privacy Policy"], segs: ["Refunds are possible within 14 days."] }),
      rec("/cookies", { legal: [{ text: "Cookies", path: "/cookies", family: "cookies" }, ...legal.slice(0, 2)], title: "Cookie Policy | Acme", h1: ["Cookie Policy"], segs: ["You can ask for a refund within 30 days."] }),
    ];
    const out = k.namingFindings(records, {});
    const w = out.map((o) => o.what).join("\n");
    assert.match(w, /footer calls it "Terms", its page heading says "Terms of Service"/);
    assert.match(w, /browser tab says "Terms of Service \| Acme"/);
    assert.match(w, /"Cookies Notice" — the footer calls this document "Cookie Policy"/);
    assert.match(w, /"Terms of Service" — the footer calls this document "Terms"/);
    assert.match(w, /footer on \/cookies calls \/cookies "Cookies"/);
    assert.match(w, /© line differs: "© 2026 Acme Ltd. All rights reserved\."/);
    assert.ok(!/"Privacy Policy" — the footer|Cookie Policy", the browser tab|Privacy Policy", its page heading/.test(w), `matching names pass:\n${w}`);
    assert.equal(k.variantFindings(records).length, 1, "Log in vs Sign in");
    assert.match(k.factFindings(records)[0]?.what || "", /refund \(days\): 14 vs 30/);
    const byLocale = new Map([["en", [rec("/terms", { lu: [{ kind: "updated", iso: "2026-10-01", text: "Last updated 01.10.2026" }] })]], ["az", [rec("/terms", { lu: [{ kind: "updated", iso: "2026-10-05", text: "Son yenilənmə 05.10.2026" }] })]]]);
    assert.match(k.localeDateFindings(byLocale)[0]?.what || "", /differs by language/);
    const same = new Map([["en", byLocale.get("en")], ["az", byLocale.get("en")]]);
    assert.equal(k.localeDateFindings(same).length, 0);
  });

  await test("CT19–CT22 on rendered pages: terms, policy facts, link names and named pages across the crawl; look-alikes and French copy stay quiet; CT8 French spacing", async (page) => {
    const foot = `<footer><a href="/help">Help Centre</a> <a href="/docs">Docs</a> <a href="/cookies">Cookie notice</a> <a href="/terms">Terms</a> <a href="/refunds">Refund Policy</a><p>© 2026 Acme Ltd</p></footer>`;
    const site = {
      "/": `<html lang="en"><head><title>Acme</title></head><body><header><nav><a href="/help">Support</a> <a href="/pricing">Pricing</a></nav></header><main><h1>Hire a specialist</h1><p>Every specialist is vetted.</p><p>Your specialist replies within a day.</p><p>Read the Specialist Service Terms before you start.</p><p>Get an expert review of your brief. The Pro plan adds support.</p><p>See the <a href="/pricing">price list</a> for what each task costs.</p><button>Buy credits</button></main>${foot}</body></html>`,
      "/help": `<html lang="en"><head><title>Help Center | Acme</title></head><body><main><h1>Help Center</h1><p>Hire an expert today.</p><p>We may suspend or close your account if you break the rules.</p><p>You can delete your account in settings.</p><p>To close your account, write to us.</p></main>${foot}</body></html>`,
      "/cookies": `<html lang="en"><head><title>Cookie Policy | Acme</title></head><body><main><h1>Cookie Policy</h1><p>One cookie keeps you signed in.</p></main>${foot}</body></html>`,
      "/terms": `<html lang="en"><head><title>Terms of Service | Acme</title></head><body><main><h1>Terms of Service</h1><p>You can ask for a refund within 30 days of purchase.</p><p>We accept Visa, Mastercard and American Express.</p><p>You can raise a chargeback with your bank.</p></main>${foot}</body></html>`,
      "/refunds": `<html lang="en"><head><title>Refund Policy | Acme</title></head><body><main><h1>Refund Policy</h1><p>You can ask for a refund within 14 days of purchase.</p><p>Refunds are separate from your 14-day right of withdrawal.</p></main>${foot}</body></html>`,
      "/pricing": `<html lang="en"><head><title>Pricing | Acme</title></head><body><main><h1>Pricing</h1><p>Unused credits are refundable within 14 days of purchase.</p><p>We accept Visa and Mastercard.</p><button>Top up</button></main>${foot}</body></html>`,
      "/fr": `<html lang="fr"><head><title>Acme</title></head><body><main><h1>Engagez un expert</h1><p id="fr-q">Combien puis-je recharger ?</p><p>Chaque expert est vérifié.</p></main></body></html>`,
    };
    await page.route("http://site.test/**", (r) => { const p = new URL(r.request().url()).pathname.replace(/\/$/, "") || "/"; return site[p] ? r.fulfill({ contentType: "text/html", body: site[p] }) : r.fulfill({ status: 404, body: "not found" }); });
    const recs = [];
    for (const path of Object.keys(site)) {
      await page.goto(`http://site.test${path}`);
      await checks.install(page);
      const copy = await k.collectCopy(page);
      recs.push(k.pageRecord(path, copy, path === "/fr" ? "fr" : null));
    }
    assert.ok(recs[0].links.some((l) => l.path === "/pricing" && l.region === "inline"), `a link in a sentence is inline: ${JSON.stringify(recs[0].links)}`);
    const out = k.consistencyRendered(new Map([["en", recs.filter((r) => r.route !== "/fr")], ["fr", recs.filter((r) => r.route === "/fr")]]), {}, { defaultLocale: "en", deadLinks: [{ path: "/specialist-terms", label: "Specialist terms", where: "/ body", status: 404 }], redirects: new Map([["/docs", "/help"]]) });
    const w = out.map((o) => o.what).join("\n");
    assert.match(w, /role \(the person who does the work\) is named 2 ways: "specialist" \d+×, "expert" 1×.*\[CT19\]/);
    assert.match(w, /account deletion .*"close" .*\[CT19\]/);
    assert.match(w, /refund window: .*"14 days".*"30 days".*\[CT20\]/);
    assert.match(w, /accepted payment methods: .*\[CT20\]/);
    assert.match(w, /links to \/help have 3 names: "Help Centre" .*"Docs".*"Support".*\[CT21\]/);
    assert.match(w, /the footer calls \/cookies "Cookie notice", the page itself says "Cookie Policy".*\[CT21\]/);
    assert.match(w, /buying credits is labelled 2 ways.*\[CT21\]/);
    assert.match(w, /names "Specialist Service Terms" but no page.*\[CT22\]/);
    assert.match(w, /go to \/specialist-terms, which is not a page on this site \(answers 404\)/);
    assert.match(w, /the footer links to the same page twice under different names: "Help Centre" \(\/help\) and "Docs" \(\/docs → \/help\).*\[CT21\]/);
    assert.match(w, /go to \/docs, which redirects to \/help.*\[CT22\]/);
    assert.ok(!/suspend|chargeback|withdrawal|price list|expert review|Pro plan|Terms of Service"|Refund Policy" but|spécialiste|\[fr\]/.test(w), `look-alikes and French copy:\n${w}`);
    // CT8: the French page's "recharger ?" is French typography, the rule follows <html lang>
    await page.goto("http://site.test/fr");
    await checks.install(page);
    const { hard, soft } = await k.copyFindings(page, {});
    assert.ok(!hard.some((f) => /space before/.test(f.what)) && !soft.length, JSON.stringify([hard, soft]));
  });

  await test("F3 (acceptance footer): a support address on a preview host fails even when the site itself runs on one; a real domain does not", async (page) => {
    const html = (mail) => page.goto("data:text/html;charset=utf-8," + encodeURIComponent(`<html lang="en"><body><main><h1>x</h1></main><footer><p>Acme Ltd</p><a href="mailto:${mail}">${mail}</a></footer></body></html>`));
    await html("support@praxis-soultosoul.vercel.app");
    assert.ok((await acceptance.footer(page)).some((o) => o.id === "F3" && /preview host/.test(o.what)), "Praxis card #38: the vercel.app address is reported");
    await html("support@acme.com");
    assert.ok(!(await acceptance.footer(page)).some((o) => /preview host/.test(o.what)));
  });

  await test("locales: a prefix, a cookie and a localStorage entry", async (page) => {
    assert.equal(await k.applyLocale(page, { code: "az", prefix: "/az" }, "/pricing", "http://x"), "/az/pricing");
    assert.equal(await k.applyLocale(page, { code: "az", prefix: "az" }, "/", "http://x"), "/az");
    assert.equal(await k.applyLocale(page, { code: "az", prefix: "/az" }, "/az/pricing", "http://x"), "/az/pricing");
    await k.applyLocale(page, { code: "kk", localStorage: { "praxis-locale": "kk" } }, "/", "http://x");
    await page.goto(url("lang-kk.html"));
    assert.equal(await page.evaluate(() => localStorage.getItem("praxis-locale")), "kk");
    await k.applyLocale(page, { code: "kk", cookie: { NEXT_LOCALE: "kk" } }, "/", "http://localhost:1");
    assert.ok((await page.context().cookies("http://localhost:1")).some((c) => c.name === "NEXT_LOCALE" && c.value === "kk"));
  });
} finally {
  await browser.close();
}
console.log(failed ? `content-runtime: ${failed} failed, ${n} passed` : `content-runtime: ${n} passed`);
if (failed) process.exit(1);
