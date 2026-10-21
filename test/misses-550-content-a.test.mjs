// 5.5.0 part B, content-a — site-wide consistency of facts and names (lib/content-consistency.js over
// lib/content-site.js, and the rendered side in playwright/checks/content.js). Every missed card of the catch-rate
// runs (Praxis, Parallel, Kindred, Compass) in this area is pinned here: the copy as it shipped ("bad" must fail), the
// fix ("good" passes) and look-alikes that must stay quiet. One browser test (the page's own payment marks); the rest
// is pure functions and static fixture repos.
// RUN: node test/misses-550-content-a.test.mjs (ONLY=regex)
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import * as C from "../lib/content-consistency.js";
import { lintContent } from "../lib/content-lint.js";
import { buildSite } from "../lib/content-site.js";

let failed = 0;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const t = async (name, fn) => { if (only && !only.test(name)) return; try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.stack || e.message).split("\n").slice(0, 8).join("\n    ")}`); } };
const T = (text, where = "x", extra = {}) => ({ text, kind: "body", locale: "en", where, ...extra });
const site = (o) => ({ texts: [], links: [], pages: [], ...o });
const find = (o, cfg = {}) => C.consistencyFindings(site(o), {}, cfg);
const ids = (list, id, re) => list.filter((g) => g.id === id && (!re || re.test(g.what)));
const repo = (files) => {
  const r = mkdtempSync(join(tmpdir(), "bs-550-ca-"));
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(r, f)), { recursive: true }); writeFileSync(join(r, f), body); }
  spawnSync("git", ["init", "-q"], { cwd: r });
  return r;
};

/* ═════ CT19 (Praxis 2ixn7g) one spelling of a loanword per language ═════ */
await t("2ixn7g CT19 az: 'Kuki parametrləri' / 'kukilərdən' next to 'Cookie siyasəti' is a spelling drift; one family with inflections and an identifier are quiet", () => {
  const az = (text, where) => ({ text, kind: "body", locale: "az", where });
  const bad = C.termDrift([az("Kuki parametrləri", "az.json:1"), az("Cookie siyasəti", "az.json:2"), az("PRAXIS yalnız zəruri kukilərdən istifadə edir", "az.json:3")]);
  const g = bad.find((x) => x.concept === "cookie (spelling)");
  assert.ok(g && g.locale === "az" && g.variant === "cookie" && g.dominant === "kuki", JSON.stringify(bad));
  assert.deepEqual(C.termDrift([az("Cookie parametrləri"), az("Cookie siyasəti"), az("zəruri cookie fayllarından")]).filter((x) => x.concept === "cookie (spelling)"), []);
  assert.deepEqual(C.termDrift([az("kukilər"), az("kukiləri silin"), az("Kuki parametrləri")]).filter((x) => x.concept === "cookie (spelling)"), [], "one family, three inflections");
  assert.deepEqual(C.termDrift([az("praxis_cookie_consent"), az("kuki seçiminiz")]).filter((x) => x.concept === "cookie (spelling)"), [], "an identifier is not a spelling");
  assert.deepEqual(C.termDrift([T("Cookie settings"), T("We use kuki")]).filter((x) => x.concept === "cookie (spelling)"), [], "English is not compared");
});

/* ═════ CT19 (Praxis 69ukru) one verb for handing over the work ═════ */
await t("69ukru CT19: /become-partner 'mark it complete' vs Agreement / Terms 'marks it delivered'; the client completing and a status word are quiet", () => {
  const bad = C.termDrift([T("You accept, do the work and mark it complete on the task thread.", "/become-partner"), T("The specialist does the work and marks it delivered on the task thread. You then accept the work.", "/terms"), T("Once you mark the task as delivered, the client has 7 days.", "/specialist-agreement")]);
  const g = bad.find((x) => x.concept === "work handover");
  assert.ok(g && g.variant === "complete" && g.dominant === "delivered", JSON.stringify(bad));
  assert.deepEqual(C.termDrift([T("mark it delivered on the thread"), T("marks it delivered")]).filter((x) => x.concept === "work handover"), []);
  assert.deepEqual(C.termDrift([T("The specialist marks it delivered."), T("The hire is marked complete when the client accepts the delivery."), T("Completed"), T("Once the client accepts, the task is complete.")]).filter((x) => x.concept === "work handover"), []);
});

/* ═════ CT20 (Praxis lzldsx, q26219, 9slhlk) three facts ═════ */
await t("lzldsx CT20: Pricing 'after that, write to support' vs Terms 'after the specialist has accepted, open a dispute'; other situations are quiet", () => {
  const bad = find({ texts: [T("You can cancel a task while it waits for the specialist to accept. After that, write to support.", "/pricing"), T("If something goes wrong after the specialist has accepted, open a dispute from the task.", "/terms"), T("Once the task is accepted, open a dispute from the task if the work is late.", "/refund")] });
  const g = ids(bad, "CT20", /recourse after the specialist accepts/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.equal(g[0].variant, "write to support");
  assert.deepEqual(ids(find({ texts: [T("You can cancel while it waits for the specialist to accept. After that, open a dispute from the task.", "/pricing"), T("If something goes wrong after the specialist has accepted, open a dispute.", "/terms")] }), "CT20"), []);
  assert.deepEqual(ids(find({ texts: [T("Unused credits can be refunded within 14 days, write to support.", "/pricing"), T("If credits do not appear after a payment, write to support. If a specialist doesn't deliver, open a dispute.", "/help"), T("After the specialist has accepted, open a dispute if needed.", "/terms")] }), "CT20", /recourse/), []);
});
await t("q26219 CT20: Agreement 'tasks the team agrees with you' vs Payments 'specialists choose the tasks they offer'; clients choosing and the team approving a listing are quiet", () => {
  const bad = find({ texts: [T("You are listed for the tasks the team agrees with you.", "/specialist-agreement"), T("Specialists set their own rates and choose the tasks they offer.", "/payments-policy"), T("You choose the tasks you offer on your profile.", "/become-partner")] });
  const g = ids(bad, "CT20", /task list/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.equal(g[0].variant, "the team");
  assert.deepEqual(ids(find({ texts: [T("You choose the tasks you offer; the team approves the listing.", "/specialist-agreement"), T("Specialists set their own rates and choose the tasks they offer.", "/payments-policy")] }), "CT20", /task list/), []);
  assert.deepEqual(ids(find({ texts: [T("Clients choose the task and the platform lists the specialists who offer it.", "/"), T("The team decides on your application within 5 business days.", "/become-partner"), T("Specialists choose the tasks they offer.", "/payments-policy")] }), "CT20", /task list/), []);
});
await t("9slhlk CT20: the cookie banner's closed list lacks 'an unfinished request' the cookie settings name; 'four entries' must list four; an open list is quiet", () => {
  const banner = T("PRAXIS uses only necessary cookies and browser storage: to keep you signed in and to remember your language, currency and this choice.", "banner");
  const settings = T("Necessary: four browser-storage entries for your language, currency, this choice and an unfinished request.", "cookie settings");
  const bad = find({ texts: [banner, settings] });
  const g = ids(bad, "CT20", /what the site stores/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.ok(/unfinished request/.test(g[0].what) && g[0].report[0].where === "banner", g[0].what);
  assert.deepEqual(ids(find({ texts: [T("PRAXIS uses only necessary cookies and browser storage: to keep you signed in and to remember your language, currency, this choice and an unfinished request.", "banner"), settings] }), "CT20"), []);
  assert.equal(ids(find({ texts: [T("Necessary: three browser-storage entries for your language, currency, this choice and an unfinished request.", "settings")] }), "CT20", /says 3 but lists 4/).length, 1, "the count word must match");
  assert.deepEqual(ids(find({ texts: [T("Cookies remember your preferences, for example your language and currency.", "banner"), settings] }), "CT20"), [], "an open list");
});

/* ═════ CT15 (Praxis tpp8au) the brand in front of a document's name ═════ */
await t("tpp8au CT15: 'PRAXIS Specialist Agreement' (h1, onboarding checkbox) vs footer 'Specialist Agreement'; a brand suffix in <title>, 'PRAXIS LLC' and a consistent brand prefix are quiet", () => {
  const links = [{ path: "/specialist-agreement", label: "Specialist Agreement", region: "footer", where: "footer" }, { path: "/terms", label: "Terms of Service", region: "footer", where: "footer" }];
  const bad = find({ links, pages: [{ path: "/specialist-agreement", names: ["PRAXIS Specialist Agreement"], title: "Specialist Agreement · PRAXIS", where: "/specialist-agreement <h1>" }], texts: [T("I accept the PRAXIS Specialist Agreement", "/onboarding label")] });
  const g = ids(bad, "CT15", /two names/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.ok(/"PRAXIS Specialist Agreement"/.test(g[0].what) && /"Specialist Agreement"/.test(g[0].what));
  assert.deepEqual(ids(find({ links, pages: [{ path: "/specialist-agreement", names: ["Specialist Agreement"], title: "Specialist Agreement · PRAXIS", where: "h1" }], texts: [T("I accept the Specialist Agreement", "label"), T("This agreement is between you and PRAXIS LLC.", "/specialist-agreement")] }), "CT15"), []);
  const acme = [{ path: "/terms", label: "Acme Terms of Service", region: "footer", where: "footer" }, { path: "/privacy", label: "Acme Privacy Policy", region: "footer", where: "footer" }];
  assert.deepEqual(ids(find({ links: acme, pages: [{ path: "/terms", names: ["Acme Terms of Service"], where: "h1" }] }, {}), "CT15"), [], "every document with the brand: consistent");
});

/* ═════ CT15 (Compass k7ue1f, qcq5fq, u23b9o) document names in any case; a qualified document keeps one name ═════ */
await t("k7ue1f CT15: /pricing '… and payment policy' while the footer says 'Payment Policy'; 'our policy on payments' is quiet", () => {
  const links = [{ path: "/payment-policy", label: "Payment Policy", region: "footer", where: "footer" }, { path: "/refund", label: "Refund Policy", region: "footer", where: "footer" }];
  const bad = find({ links, texts: [T("The conditions are in the Refund Policy, Cancellation Policy and payment policy.", "/pricing")] });
  const g = ids(bad, "CT15", /"payment policy"/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.match(g[0].fix, /write "Payment Policy"/);
  assert.deepEqual(ids(find({ links, texts: [T("The conditions are in the Refund Policy and the Payment Policy.", "/pricing"), T("Our policy on payments is simple.", "/pricing")] }), "CT15"), []);
});
await t("qcq5fq / u23b9o CT15: two consent checkboxes 'Specialist Terms of Service' and 'Specialist Service Terms' for one document (h1 'Specialist Service Terms'); 'Terms of Service' next to it is another document", () => {
  const pages = [{ path: "/specialist-terms", names: ["Specialist Service Terms"], where: "/specialist-terms <h1>" }, { path: "/terms", names: ["Terms of Service"], where: "/terms <h1>" }];
  const bad = find({ pages, texts: [T("I agree to the Specialist Terms of Service", "/onboarding checkbox 1"), T("I agree to the Specialist Service Terms", "/onboarding checkbox 2")] });
  const g = ids(bad, "CT15", /Specialist Terms of Service/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.equal(g[0].dominant, "Specialist Service Terms", "the page's heading wins");
  assert.deepEqual(ids(find({ pages, texts: [T("I agree to the Specialist Service Terms", "/onboarding"), T("Read the Terms of Service and the Specialist Service Terms.", "/become-partner")] }), "CT15"), []);
});

/* ═════ F5 / P3 (Praxis 992bgb) "the marks shown in X" are in X ═════ */
await t("992bgb F5: About says the marks are shown in the footer and in the Payments Policy, which shows none; 'badges shown on each profile' and a page that has them are quiet", () => {
  const links = [{ path: "/payments-policy", label: "Payments Policy", region: "footer", where: "footer" }];
  const claim = T("You pay by Visa or Mastercard card, the two marks shown in the footer and in the Payments Policy.", "/about");
  const bad = find({ links, pages: [{ path: "/payments-policy", names: ["Payments Policy"], marks: false }, { path: "/about", names: ["About"], marks: false }], texts: [claim] });
  assert.equal(ids(bad, "F5").length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.deepEqual(ids(find({ links, pages: [{ path: "/payments-policy", names: ["Payments Policy"], marks: true }], texts: [claim] }), "F5"), []);
  assert.deepEqual(ids(find({ links, pages: [{ path: "/payments-policy", names: ["Payments Policy"], marks: false }], texts: [T("Card payment badges shown on each profile.", "/")] }), "F5"), []);
  assert.deepEqual(ids(find({ links, pages: [{ path: "/payments-policy", names: ["Payments Policy"] }], texts: [claim] }), "F5"), [], "static: the marks are not known");
});

/* ═════ CT21 (Parallel 9a8qvx) the page's own name is the suggested label ═════ */
await t("9a8qvx CT21: header 'Orders' and sidebar 'All tasks' → /dashboard/tasks, which calls itself 'Tasks': the fix names 'Tasks'", () => {
  const links = [{ path: "/dashboard/tasks", label: "Orders", region: "nav", where: "header.tsx:75" }, { path: "/dashboard/tasks", label: "Orders", region: "nav", where: "header.tsx:163" }, { path: "/dashboard/tasks", label: "All tasks", region: "nav", where: "sidebar.tsx:20" }, { path: "/dashboard/tasks", label: "All tasks", region: "nav", where: "sidebar.tsx:40" }, { path: "/dashboard/tasks", label: "All tasks", region: "nav", where: "dash.tsx:9" }];
  const g = ids(find({ links, pages: [{ path: "/dashboard/tasks", names: ["Tasks"], where: "page.tsx:1" }] }), "CT21", /links to \/dashboard\/tasks/);
  assert.equal(g.length, 1, JSON.stringify(g));
  assert.match(g[0].fix, /label every link to \/dashboard\/tasks "Tasks"/);
  assert.equal(g[0].variant, "Orders");
});

/* ═════ CT20 (Kindred 3h4bom) a closed list of payment methods vs what the checkout offers (static) ═════ */
await t("3h4bom CT20 (static): 'We accept Visa and Mastercard only.' while lib/payments/apm-methods.ts offers BLIK and Swish; an open statement and a dead APM file are quiet", async () => {
  const files = {
    "package.json": "{}",
    "messages/en.json": JSON.stringify({ paymentsPolicy: { methods: "We accept Visa and Mastercard only." } }, null, 2),
    "lib/payments/apm-methods.ts": 'export const APM = [\n  { id: "blik", name: "BLIK", currency: "PLN" },\n  { id: "swish", name: "Swish", currency: "SEK" },\n];\n',
    "components/checkout.tsx": 'import { APM } from "@/lib/payments/apm-methods";\nexport function Checkout() { return <ul>{APM.map((m) => <li key={m.id}>{m.name}</li>)}</ul>; }\n',
  };
  let r = repo(files);
  let res = await lintContent(r, { cfg: {} });
  const g = res.problems.filter((p) => p.id === "CT20" && /closed list/.test(p.message));
  assert.equal(g.length, 1, JSON.stringify(res.problems.map((p) => p.message), null, 1));
  assert.match(g[0].message, /BLIK.*Swish/);
  assert.equal(g[0].file, "messages/en.json");
  rmSync(r, { recursive: true, force: true });
  r = repo({ ...files, "messages/en.json": JSON.stringify({ paymentsPolicy: { methods: "We accept Visa and Mastercard, and BLIK (PLN) and Swish (SEK) through our payment partner." } }) });
  assert.deepEqual((await lintContent(r, { cfg: {} })).problems.filter((p) => p.id === "CT20" && /closed list/.test(p.message)), []);
  rmSync(r, { recursive: true, force: true });
  r = repo({ ...files, "messages/en.json": JSON.stringify({ paymentsPolicy: { methods: "We accept Visa and Mastercard." } }) });
  assert.deepEqual((await lintContent(r, { cfg: {} })).problems.filter((p) => p.id === "CT20" && /closed list/.test(p.message)), [], "no 'only': an open statement");
  rmSync(r, { recursive: true, force: true });
  const { "components/checkout.tsx": _, ...dead } = files;
  r = repo(dead);
  assert.deepEqual((await lintContent(r, { cfg: {} })).problems.filter((p) => p.id === "CT20" && /closed list/.test(p.message)), [], "nothing imports the APM file");
  rmSync(r, { recursive: true, force: true });
});

/* ═════ CT20 (Kindred ff5psx) one minimum age ═════ */
await t("ff5psx CT20: Terms 'at least 18 (or the age of majority…)' vs Privacy 'not intended for anyone under 16'; experience, months and payouts are quiet", () => {
  const terms = T("You must be at least 18 years old (or the age of majority where you live, if higher) to use the Service.", "/terms");
  const bad = find({ texts: [terms, T("The Service is not intended for anyone under 16.", "/privacy")] });
  const g = ids(bad, "CT20", /minimum age/);
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.ok(/18 years/.test(g[0].what) && /16 years/.test(g[0].what));
  assert.deepEqual(ids(find({ texts: [terms, T("The Service is not intended for anyone under 18 (see our Terms).", "/privacy")] }), "CT20"), []);
  assert.deepEqual(ids(find({ texts: [terms, T("Our specialists have over 16 years of experience.", "/about"), T("Usage data is kept for at least 18 months.", "/privacy"), T("Specialists must be at least 21 to accept payouts.", "/become-partner")] }), "CT20", /minimum age/), []);
});

/* ═════ CT23 (Kindred ancvgr, ql7sv4) a promise the policies back ═════ */
await t("ancvgr / ql7sv4 CT23: 'Escrow 100% BACKED' with no policy describing escrow; FAQ 'No questions asked' vs a refund policy with conditions; look-alikes quiet", () => {
  const refund = T("5. Satisfaction Guarantee. Contact us within 7 days of completion and explain the specific issues. Remedies: revision, re-assignment, full or partial refund.", "/refund", { route: "/refund" });
  const terms = T("These terms govern your use of Kindred.", "/terms", { route: "/terms" });
  const bad = find({ texts: [T("Escrow 100% BACKED", "/", { route: "/" }), T("What if I'm not satisfied? We'll make it right or refund your credits. No questions asked.", "/pricing", { route: "/pricing" }), refund, terms] });
  assert.equal(ids(bad, "CT23", /escrow/).length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.equal(ids(bad, "CT23", /No questions asked/i).length, 1, JSON.stringify(bad.map((x) => x.what)));
  const good = find({ texts: [T("Vetted 100%", "/", { route: "/" }), T("Not satisfied? Contact us within 7 days and tell us what went wrong. The full terms are in our Refund Policy.", "/pricing", { route: "/pricing" }), refund, terms] });
  assert.deepEqual(ids(good, "CT23"), []);
  const backed = find({ texts: [T("Escrow-backed payments", "/", { route: "/" }), T("Escrow: funds are held until you approve the work.", "/payments-policy", { route: "/payments-policy" })] });
  assert.deepEqual(ids(backed, "CT23"), [], "a policy describes escrow");
  assert.deepEqual(ids(find({ texts: [T("Refunds for any reason within 30 days, no questions asked.", "/refund", { route: "/refund" }), terms, T("24/7 status page", "/", { route: "/" })] }), "CT23"), [], "on the policy itself; a status page is not support");
});

/* ═════ M3 (Kindred 2895jy) the payment API accepts every currency the switcher offers (static) ═════ */
await t("2895jy M3 (static): CURRENCY_CODES has 8 currencies, the payment gate's z.enum 6 → SEK, ZAR fail; derived enum, payoutCurrency, method enums and a superset are quiet", async () => {
  const base = { "package.json": "{}", "lib/currency/constants.ts": 'export const CURRENCY_CODES = ["USD", "EUR", "PLN", "CAD", "AZN", "AUD", "SEK", "ZAR"] as const;\n', "app/page.tsx": "export default function P() { return <h1>Home</h1>; }\n" };
  let r = repo({ ...base, "app/api/payments/gate/init/route.ts": 'import { z } from "zod";\nconst schema = z.object({\n  amount: z.number(),\n  currency: z.enum(["USD", "EUR", "PLN", "CAD", "AZN", "AUD"]),\n});\nexport async function POST() {}\n' });
  let res = await lintContent(r, { cfg: {} });
  const g = res.problems.filter((p) => p.id === "M3");
  assert.equal(g.length, 1, JSON.stringify(res.problems.map((p) => p.message)));
  assert.equal(g[0].file, "app/api/payments/gate/init/route.ts");
  assert.equal(g[0].line, 4);
  assert.match(g[0].message, /SEK, ZAR/);
  rmSync(r, { recursive: true, force: true });
  for (const route of ['const s = z.object({ currency: z.enum(CURRENCY_CODES) });', 'const s = z.object({ payoutCurrency: z.enum(["USD", "EUR"]) });', 'const s = z.object({ method: z.enum(["card", "blik"]) });', 'const s = z.object({ currency: z.enum(["USD", "EUR", "PLN", "CAD", "AZN", "AUD", "SEK", "ZAR", "GBP"]) });']) {
    r = repo({ ...base, "app/api/payments/gate/init/route.ts": `import { z } from "zod";\n${route}\n` });
    assert.deepEqual((await lintContent(r, { cfg: {} })).problems.filter((p) => p.id === "M3"), [], route);
    rmSync(r, { recursive: true, force: true });
  }
});

/* ═════ CT20 (Compass msds2g, vgs44j) a country the terms refuse is offered ═════ */
await t("msds2g / vgs44j CT20 (static): Terms refuse people in Russia, Belarus, Iran; the sign-up country list offers Russia and Belarus; a refused list and a site that refuses nothing are quiet", async () => {
  const countries = (extra = "") => `export const COUNTRIES = [\n  { code: "DE", name: "Germany" },\n  { code: "FR", name: "France" },\n  { code: "PL", name: "Poland" },\n  { code: "ES", name: "Spain" },\n  { code: "IT", name: "Italy" },\n  { code: "GB", name: "United Kingdom" },\n  { code: "US", name: "United States" },\n  { code: "AZ", name: "Azerbaijan" },\n  { code: "KZ", name: "Kazakhstan" },${extra}\n];\n`;
  const files = {
    "package.json": "{}",
    "app/terms/page.tsx": 'export default function T() { return <main><h1>Terms of Service</h1><p>We do not open accounts for people in Russia, Belarus, Iran or North Korea.</p></main>; }\n',
    "components/register/countries.ts": countries('\n  { code: "RU", name: "Russia" },\n  { code: "BY", name: "Belarus" },'),
    "components/register/form.tsx": 'import { COUNTRIES } from "./countries";\nexport function F() { return <select>{COUNTRIES.map((c) => <option key={c.code}>{c.name}</option>)}</select>; }\n',
  };
  let r = repo(files);
  let res = await lintContent(r, { cfg: {} });
  const g = res.problems.filter((p) => p.id === "CT20" && /terms refuse/.test(p.message));
  assert.equal(g.length, 2, JSON.stringify(res.problems.map((p) => `${p.file}:${p.line} ${p.message}`), null, 1));
  assert.deepEqual(g.map((p) => `${p.file}:${p.line}`), ["components/register/countries.ts:11", "components/register/countries.ts:12"]);
  rmSync(r, { recursive: true, force: true });
  r = repo({ ...files, "components/register/countries.ts": countries() });
  assert.deepEqual((await lintContent(r, { cfg: {} })).problems.filter((p) => p.id === "CT20" && /terms refuse/.test(p.message)), []);
  rmSync(r, { recursive: true, force: true });
  r = repo({ ...files, "app/terms/page.tsx": 'export default function T() { return <main><h1>Terms</h1><p>We ship to the countries below.</p></main>; }\n', "lib/sanctions.ts": 'export const SANCTIONED_COUNTRIES = ["Russia", "Belarus", "Iran", "North Korea", "Syria", "Cuba", "Venezuela", "Myanmar"];\n' });
  assert.deepEqual((await lintContent(r, { cfg: {} })).problems.filter((p) => p.id === "CT20" && /terms refuse/.test(p.message)), [], "a site that refuses nothing; a sanctions list is not offered");
  rmSync(r, { recursive: true, force: true });
});

/* ═════ CT27 (Compass wy8h00) a worked example adds up ═════ */
await t("wy8h00 CT27: 'Top up 1,000 credits for $92' then '−700 cr · $70' and 'Balance carried forward 300 cr · $30' — credits add up, money does not; priced at the rate, and an FAQ of packs, are quiet", () => {
  const steps = (a, b) => [T("Top up 1,000 credits for $92", "/ step 1", { route: "/" }), T(`Hire: −700 cr · $${a}`, "/ step 2", { route: "/" }), T(`Balance carried forward 300 cr · $${b}`, "/ step 3", { route: "/" })];
  const bad = find({ texts: steps(70, 30) });
  const g = ids(bad, "CT27");
  assert.equal(g.length, 1, JSON.stringify(bad.map((x) => x.what)));
  assert.match(g[0].what, /\$92 for 1000 credits.*\$100/);
  assert.match(g[0].fix, /700 → \$64\.40/);
  assert.deepEqual(ids(find({ texts: steps("64.40", "27.60") }), "CT27"), []);
  assert.deepEqual(ids(find({ texts: [T("Buy 500 credits for $46", "/pricing 1", { route: "/pricing" }), T("1,000 credits · $92", "/pricing 2", { route: "/pricing" }), T("2,500 credits · $220", "/pricing 3", { route: "/pricing" })] }), "CT27"), [], "packs: credits do not add up to a top-up");
});

/* ═════ CT31 (Compass ey1511) one list, one order — soft, rendered ═════ */
await t("ey1511 CT31 (soft): the same disciplines in two orders on /tasks and /about; one order, and a list with a 'Sort by' control, are quiet", () => {
  const list = (route, names, extra = []) => [...extra, ...names].map((n) => ({ text: n, kind: "button", locale: "en", where: `${route} "${n}"`, route }));
  const A = ["Visual", "Design", "Narrative", "Audio", "Creative"], B = ["Audio", "Creative", "Design", "Narrative", "Visual"];
  const rec = (route, segs) => ({ route, locale: "en", title: "", h1: [], legal: [], copyright: null, lastUpdated: [], segs: segs.map((s) => ({ text: s.text, kind: s.kind })), footerSegs: [], lang: "en", brand: [], links: [] });
  const bad = C.listOrders([...list("/tasks", A, ["All the tasks waiting for you"]), ...list("/about", B, ["About us and our team"])]);
  assert.equal(bad.length, 1, JSON.stringify(bad));
  assert.ok(bad[0].soft && /\/tasks Visual, Design.*\/about Audio, Creative/.test(bad[0].what));
  assert.deepEqual(C.listOrders([...list("/tasks", A), ...list("/about", A)]), []);
  assert.deepEqual(C.listOrders([...list("/tasks", A, ["Sort by price"]), ...list("/about", B)]), [], "the order is announced");
  return import("../playwright/checks/content.js").then((k) => {
    const out = k.consistencyRendered(new Map([["en", [rec("/tasks", list("/tasks", A)), rec("/about", list("/about", B))]]]), {});
    const s = out.filter((x) => x.id === "CT31");
    assert.ok(s.length === 1 && s[0].soft, JSON.stringify(out));
  });
});

/* ═════ the rendered page record knows whether the page itself shows payment marks (992bgb) ═════ */
await t("992bgb collectCopy: payment marks in the page body count, the footer's do not", async () => {
  const { chromium } = await import("@playwright/test");
  const c = await import("../playwright/checks.js");
  const k = await import("../playwright/checks/content.js");
  let html = "";
  const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
  try {
    const page = await (await browser.newContext()).newPage();
    await c.install(page);
    const at = async (body) => { html = `<!doctype html><html lang="en"><title>Payments Policy</title><body>${body}</body></html>`; await page.goto(`http://127.0.0.1:${server.address().port}/payments-policy`); return k.pageRecord("/payments-policy", await k.collectCopy(page)).marks; };
    assert.equal(await at('<main><h1>Payments Policy</h1><p>By Visa or Mastercard card.</p></main><footer><img alt="Visa" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="20"><img alt="Mastercard" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="20"></footer>'), false);
    assert.equal(await at('<main><h1>Payments Policy</h1><p>We accept</p><img alt="Visa" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="20"></main>'), true);
  } finally { await browser.close(); server.close(); }
});

if (failed) { console.error(`misses-550-content-a: ${failed} failed`); process.exit(1); }
console.log("misses-550-content-a: all passed");
