// Static copy lint (lib/content-rules.js + lib/content-lint.js + lib/email-dns.js): every rule has a true positive
// that must fire and a false positive that must stay quiet. Phrases come from real cards (Praxis study 2026-10-14,
// cross-project card analysis); the fixture repo is test/fixtures/content/repo.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import * as R from "../lib/content-rules.js";
import { lintContent, parseJsonLeaves, parseYamlLeaves, parseTsLeaves, jsxSegments, messageFileInfo, keyKind, lintFileText } from "../lib/content-lint.js";
import { checkDomain, checkEmails, _resetDnsCache } from "../lib/email-dns.js";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, n = 0;
async function t(name, fn) {
  try { await fn(); n++; } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.message.split("\n").join("\n  ")}`); }
}
const lint = (text, kind = "body", cfg = R.CONTENT_DEFAULTS, ctx = {}) => R.lintSegment({ text, kind }, cfg, ctx);
const rules = (list) => list.map((x) => x.rule);
const fires = (text, rule, kind, cfg, ctx) => { const l = lint(text, kind, cfg, ctx); assert.ok(rules(l).includes(rule), `"${text}" should fire ${rule}: ${JSON.stringify(rules(l))}`); };
const quiet = (text, rule, kind, cfg, ctx) => { const l = lint(text, kind, cfg, ctx); assert.ok(!rules(l).includes(rule), `"${text}" should NOT fire ${rule}: ${JSON.stringify(l.filter((x) => x.rule === rule).map((x) => x.what))}`); };

/* CT1 unfinished / defensive */
await t("CT1 the 18 Praxis near-misses and their AZ/KK/RU variants fire", () => {
  for (const s of ["Card payments open at launch.", "Payouts Not Live Yet", "Payments are switched off today", "Password reset by email isn't available yet, so no link was sent.",
    "We don't promise a reply time.", "Everything PRAXIS sets, in two groups. There is nothing else.", "Notes #highlighted#", "PRAXIS test specialist account", "Coming soon",
    "File upload isn't working yet", "Payouts to specialists are not available on the platform yet", "Example profile", "This is a placeholder", "Lorem ipsum dolor", "Price: TBD", "TODO: copy",
    "PRAXIS has not launched yet.", "No real specialist is live yet.", "PRAXIS does not review deliverables.", "Hello {{name}}",
    "Mütəxəssislərə ödənişlər hələ mümkün deyil.", "Cavab müddətinə söz vermirik.", "Başqa heç nə yoxdur.", "Мамандарға төлем жасау әзірге қолжетімсіз.", "Жауап беру мерзіміне уәде бермейміз.", "Оплата пока недоступна", "Скоро"])
    fires(s, s === "PRAXIS test specialist account" ? "content/test-data" : "content/unfinished");
});
await t("CT1 ordinary copy, transient errors and i18n placeholders stay quiet", () => {
  for (const s of ["Launch your project in minutes", "For example, profile pages show reviews", "Today's exchange rate isn't available yet. Try again in a minute.", "Live chat is open 9–18", "We review every application within 5 business days"])
    quiet(s, "content/unfinished");
  quiet("Hello {{name}}, you have {{count}} credits", "content/unfinished", "body", undefined, { static: true });
  quiet("Your name", "content/unfinished", "placeholder");
});

/* CT2 test data */
await t("CT2 test data fires; input hints do not", () => {
  for (const s of ["© 2026 New Company 1. All rights reserved.", "New Address 1", "Signed in as Test User", "John Doe", "asdf", "qwerty123", "Contact test@example.com", "Company number 000000000"]) fires(s, "content/test-data");
  quiet("you@example.com", "content/test-data", "placeholder");
  quiet("Enter a valid email address, like you@example.com.", "content/test-data");
  quiet("E-poçt ünvanı daxil edin, məsələn you@example.com", "content/test-data");
  quiet("Latest test results are in", "content/test-data");
  quiet("John Doe", "content/test-data", "body", undefined, { example: true });
});

/* CT3 raw errors */
await t("CT3 raw errors fire; prose and prices do not", () => {
  for (const s of ["[object Object]", "Total: NaN credits", "Hello, undefined", "Error: P2002 Unique constraint failed", "TypeError: Cannot read properties of undefined (reading 'map')", "500 Internal Server Error", "Invalid Date", "CredentialsSignin", "PrismaClientKnownRequestError", "at handler (/var/task/route.js:12:5)", "Balance: null"])
    fires(s, "content/raw-error");
  for (const s of ["500 credits for $50", "The agreement is null and void", "Errors in your brief are flagged before you pay", "We respond within 24 hours"]) quiet(s, "content/raw-error");
  quiet("Error: could not save", "content/raw-error", "body", undefined, { static: true }); // a message file's own error copy
});

/* CT4 trailing period */
await t("CT4 headings, buttons, nav items: no trailing period; body text, ellipsis and abbreviations pass", () => {
  fires("Find a specialist.", "content/trailing-period", "heading");
  fires("Save changes.", "content/trailing-period", "button");
  fires("About.", "content/trailing-period", "nav");
  quiet("Find a specialist.", "content/trailing-period", "body");
  quiet("Loading...", "content/trailing-period", "button");
  quiet("Wait…", "content/trailing-period", "heading");
  quiet("Acme Inc.", "content/trailing-period", "heading");
  quiet("Fast. Simple", "content/trailing-period", "heading");
  quiet("Vusal A.", "content/trailing-period", "heading"); // Praxis specialist cards: a name with its initial
});

/* CT5 dashes */
await t("CT5 em dash and -- fire; en dash ranges, allowDash and dashes: allow pass", () => {
  fires("Fast — and simple", "content/dash");
  fires("Fast -- and simple", "content/dash");
  fires("—", "content/dash");
  quiet("10–20 days", "content/dash");
  quiet("Fast — and simple", "content/dash", "body", { ...R.CONTENT_DEFAULTS, dashes: "allow" });
  quiet("Fast — and simple", "content/dash", "body", { ...R.CONTENT_DEFAULTS, allowDash: ["^Fast"] });
  quiet("<!-- comment -->", "content/dash");
});

/* CT6 / CT7 dates */
await t("CT6 dates: every non-DD.MM.YYYY form fires (en, ru, kk); DD.MM.YYYY, versions and years pass; dateFormat is configurable", () => {
  for (const s of ["Last updated: October 1, 2026", "1 October 2026", "Oct 2026", "10/14/2026", "Due: 2026-09-02T12:55:00Z", "1.2.2026", "12 октября 2026 г.", "5 қазан 2026 ж.", "26 sentyabr 2026"]) fires(s, "content/date-format");
  for (const s of ["Last updated: 01.10.2026", "Version 1.5.10", "Founded in 2019", "Call +44 20 7946 0958", "Order #2026-1001"]) quiet(s, "content/date-format");
  quiet("Due: 2026-09-02", "content/date-format", "body", { ...R.CONTENT_DEFAULTS, dateFormat: "YYYY-MM-DD" });
  fires("Due: 02.09.2026", "content/date-format", "body", { ...R.CONTENT_DEFAULTS, dateFormat: "YYYY-MM-DD" });
  assert.equal(R.findDates("Oct 3, 2025")[0].iso, "2025-10-03");
  assert.equal(R.findDates("26 September 2026")[0].iso, "2026-09-26");
  assert.equal(R.findDates("10/14/2026")[0].iso, "2026-10-14");
  assert.equal(R.example("DD.MM.YYYY", "2026-09-26"), "26.09.2026");
});
await t("CT7 a rendered 'Last updated' without a date fires; with a date, a following date span, or in a message file it passes", () => {
  fires("Last updated", "content/last-updated");
  quiet("Last updated: 01.10.2026", "content/last-updated");
  assert.equal(R.dateFindings({ text: "Last updated", kind: "body", followedByDate: true }).length, 0);
  quiet("Last updated", "content/last-updated", "body", undefined, { static: true });
  const lu = R.lastUpdatedDates([{ text: "Last updated" }, { text: "01.10.2026" }, { text: "Effective from 05.10.2026" }]);
  assert.deepEqual(lu.map((x) => [x.kind, x.iso]), [["updated", "2026-10-01"], ["effective", "2026-10-05"]]);
});

/* CT8 grammar */
await t("CT8 plurals, double spaces, space before punctuation, unmatched quotes fire", () => {
  for (const s of ["1 PROFILES OFFER THIS TASK", "1 SERVICES", "1 items", "0 item left", "You have 5 credit.", "He said “hello", "Use «this", "(see terms", 'Say "hi'])
    fires(s, "content/grammar");
  fires("Hello  world", "content/grammar", "body", undefined, { static: true });
  fires("Total is 5 credits .", "content/grammar");
});
await t("CT8 counts that agree, ranges, decimals, inch marks and rendered (collapsed) spaces pass", () => {
  for (const s of ["1 of 3 items", "1.5 hours", "Step 1", "2 days", "30 day refund window", "1 bonus", "1 class", "0-1 years (Junior)", "Up to 1 hours? no: 1 hour", "A 27\" monitor", "(a) first (b) second", "Read our Terms (and Privacy Policy).", "1 analysis"])
    quiet(s.replace("Up to 1 hours? no: ", ""), "content/grammar");
  quiet("Hello  world", "content/grammar");
  quiet("Next.js app", "content/grammar");
});

/* CT9 email domains */
await t("CT9 preview / reserved hosts are undeliverable; real domains are not judged offline", () => {
  for (const e of ["support@praxis-soultosoul.vercel.app", "hi@x.netlify.app", "a@b.pages.dev", "x@localhost", "x@example.com", "x@acme.test", "x@foo.herokuapp.com"]) assert.ok(R.emailDomainProblem(e), e);
  for (const e of ["support@vertex.boutique", "hello@gmail.com", "x@vercel.com"]) assert.equal(R.emailDomainProblem(e), null, e);
  assert.deepEqual(R.findEmails("Write to support@acme.com. Or hi@acme.co.uk!"), ["support@acme.com", "hi@acme.co.uk"]);
  assert.deepEqual(R.findEmails("logo@2x.png hero@3x.webp"), [], "retina image names are not addresses");
});
await t("CT9 MX over DNS-over-HTTPS: no MX, null MX, NXDOMAIN fail; MX passes; network errors are 'could not verify'; cached", async () => {
  _resetDnsCache();
  const calls = [];
  const answers = {
    "mx.ok:MX": { Status: 0, Answer: [{ type: 15, data: "10 mail.mx.ok." }] },
    "nomx.ok:MX": { Status: 0 }, "nomx.ok:A": { Status: 0, Answer: [{ type: 1, data: "1.2.3.4" }] },
    "nullmx.ok:MX": { Status: 0, Answer: [{ type: 15, data: "0 ." }] },
    "gone.ok:MX": { Status: 3 },
  };
  const fetchImpl = async (url) => {
    const u = new URL(url); const k = `${u.searchParams.get("name")}:${u.searchParams.get("type")}`; calls.push(k);
    if (k.startsWith("down.ok")) throw new Error("network down");
    return { ok: true, json: async () => answers[k] || { Status: 0 } };
  };
  const dir = mkdtempSync(join(tmpdir(), "bs-dns-"));
  const cache = join(dir, "dns.json");
  assert.equal((await checkDomain("mx.ok", { fetchImpl, cache })).ok, true);
  const nomx = await checkDomain("nomx.ok", { fetchImpl, cache });
  assert.equal(nomx.ok, false); assert.match(nomx.reason, /no MX/);
  assert.equal((await checkDomain("nullmx.ok", { fetchImpl, cache })).ok, false);
  assert.match((await checkDomain("gone.ok", { fetchImpl, cache })).reason, /does not exist/);
  assert.equal((await checkDomain("down.ok", { fetchImpl, cache })).ok, null);
  assert.equal((await checkDomain("x.vercel.app", { fetchImpl, cache })).ok, false);
  const before = calls.length;
  const res = await checkEmails(["a@mx.ok", "b@mx.ok", "c@nomx.ok"], { fetchImpl, cache });
  assert.equal(calls.length, before, "answers come from the cache");
  assert.equal(res.get("c@nomx.ok").ok, false);
  _resetDnsCache();
  assert.equal((await checkDomain("mx.ok", { fetchImpl: async () => { throw new Error("must use disk cache"); }, cache })).ok, true, "disk cache survives a new process");
  assert.ok(JSON.parse(readFileSync(cache, "utf8"))["mx.ok"]);
  rmSync(dir, { recursive: true, force: true });
});

/* CT11 / CT12 */
await t("CT11 English in a non-English locale fires; translations, brands and acronyms pass", () => {
  assert.ok(R.englishIn("Payments are not live yet and we keep 20%", "az"));
  assert.ok(R.englishIn("Upload your file now please", "kk"));
  assert.ok(R.englishIn("Click here to continue", "ru"));
  assert.equal(R.englishIn("Mütəxəssislərə ödənişlər hələ mümkün deyil", "az"), null);
  assert.equal(R.englishIn("Visa Mastercard", "kk"), null);
  assert.equal(R.englishIn("PRAXIS платформасында GitHub арқылы кіріңіз", "kk", ["PRAXIS"]), null);
  assert.equal(R.englishIn("Payments are not live yet", "en"), null);
  assert.equal(R.englishIn("Sifariş PDF, CSV və API vasitəsilə", "az"), null);
  assert.equal(R.englishIn("__Secure-authjs.callback-url", "kk"), null, "cookie names on the kk Cookie Policy are identifiers (Praxis live)");
  assert.equal(R.englishIn("__Host-authjs.csrf-token", "kk"), null);
});
await t("CT12 translation keys printed as text are recognised; domains, files and abbreviations are not", () => {
  for (const k of ["home.title", "common.viewAll", "auth.errors.invalid_email", "pricing.calc.clamped"]) assert.ok(R.looksLikeKey(k), k);
  for (const k of ["praxis.com", "vertex.boutique", "file.pdf", "e.g.", "Next.js", "node.js", "support@acme.com", "v1.2"]) assert.ok(!R.looksLikeKey(k), k);
  assert.ok(R.looksLikeKey("brand.name", new Set(["brand.name"])));
});

/* CT17 / CT18 */
await t("CT17 glossary variants fire; the preferred term passes", () => {
  const cfg = { ...R.CONTENT_DEFAULTS, glossary: { "Terms of Service": ["Terms & Conditions", "T&C"], specialist: ["freelancer"] } };
  fires("Read the Terms & Conditions", "content/glossary", "body", cfg);
  fires("Hire a freelancer", "content/glossary", "body", cfg);
  quiet("Read the Terms of Service", "content/glossary", "body", cfg);
  assert.equal(R.legalFamily("Terms of Service"), "terms");
  assert.equal(R.legalFamily("Cookie Policy"), "cookies");
  assert.equal(R.legalFamily("Deliverables and Licence"), "license");
  assert.equal(R.legalFamily("Pricing"), null);
  assert.equal(R.normName("Privacy Policy →"), R.normName("Privacy Policy"), "a footer arrow is not part of the name (Praxis live)");
});
await t("CT18 numeric facts: the same keyword with different values conflicts; the same value or other keywords do not", () => {
  const facts = (txt, where) => R.numericFacts(txt).map((x) => ({ ...x, where }));
  const a = facts("You can request a refund within 14 days of purchase.", "/terms");
  const b = facts("Refunds are possible within 30 days.", "/faq");
  const c = facts("We reply within 24 hours. Our fee is 20%.", "/contact");
  const d = facts("The platform fee is 15% of each hire.", "/pricing");
  assert.equal(R.factConflicts([...a, ...b]).length, 1);
  assert.match(R.factConflicts([...a, ...b])[0].what, /14 vs 30.*\/terms.*\/faq/);
  assert.equal(R.factConflicts([...a, ...facts("Refund requests: within 14 days.", "/faq")]).length, 0);
  assert.equal(R.factConflicts([...a, ...c]).length, 0, "refund days vs reply hours are different facts");
  assert.equal(R.factConflicts([...c, ...d]).length, 1, "fee 20% vs 15%");
  assert.equal(R.factConflicts([...facts("We decide on a refund within 5 business days.", "/refund"), ...a]).length, 0, "a decision time in business days is not the refund window (Praxis /refund)");
  assert.deepEqual(R.numericFacts("10 credits = $1").map((x) => [x.key, x.unit, x.value]), [["credit price", "credit price ($)", "0.1"]]);
  // Vertex live: "a 20% fee … the other 80% is yours" is one fact; € packs vs a $ base rate are not comparable
  assert.equal(R.factConflicts([...facts("Vertex keeps a 20% platform fee from each engagement", "/"), ...facts("Vertex keeps a platform fee of 20% of each engagement's credit price; the other 80% is yours.", "/terms")]).length, 0);
  assert.equal(R.factConflicts([...facts("Purchase 100 Credits for €8.92", "/pricing"), ...facts("The base rate is 10 credits = $1.00 (US dollars).", "/terms")]).length, 0);
  assert.equal(R.factConflicts([...facts("10 credits = $1.00", "/pricing"), ...facts("1 credit = $0.50", "/faq")]).length, 1, "the same currency at another price is a conflict");
});

/* parsers */
await t("parsers: JSON / YAML / TS message files with line numbers; message-file detection", () => {
  const j = parseJsonLeaves('{\n "a": {\n  "b": "x",\n  "c": ["y", "z"]\n },\n "n": 1\n}');
  assert.deepEqual(j.map((l) => [l.key, l.value, l.line]), [["a.b", "x", 3], ["a.c.0", "y", 4], ["a.c.1", "z", 4]]);
  const y = parseYamlLeaves("home:\n  title: Hello\n  # comment\n  body: |\n    line one\n    line two\n  quoted: \"It's\"\nflag: true\n");
  assert.deepEqual(y.map((l) => [l.key, l.value, l.line]), [["home.title", "Hello", 2], ["home.body", "line one\nline two", 4], ["home.quoted", "It's", 7]]);
  const ts = parseTsLeaves('export default {\n  home: { title: "Hi", items: ["a"] },\n  "x-y": `t`,\n} as const;\n');
  assert.deepEqual(ts.map((l) => [l.key, l.value, l.line]), [["home.title", "Hi", 2], ["home.items.0", "a", 2], ["x-y", "t", 3]]);
  assert.equal(messageFileInfo("lib/i18n/translations/az.json").locale, "az");
  assert.equal(messageFileInfo("public/locales/kk/common.json").group, "public/locales/*/common.json");
  assert.equal(messageFileInfo("messages/en-US.json").locale, "en-US");
  assert.equal(messageFileInfo("app/api/assignments/[id]/messages/route.ts"), null);
  assert.equal(messageFileInfo("app/(admin)/admin/messages/page.tsx"), null);
  assert.equal(messageFileInfo("tests/unit/legal/i18n.ts"), null);
  assert.equal(keyKind("home.hero.title"), "heading");
  assert.equal(keyKind("auth.emailPlaceholder"), "placeholder");
  assert.equal(keyKind("buttons.save"), "button");
  assert.equal(keyKind("home.subtitle"), "body");
});
await t("JSX: inline children join into one segment; kinds; code and component children", () => {
  const segs = jsxSegments(`const A = () => (<div>
    <h1>Hello.</h1>
    <p>Read our <Link href="/p">Privacy Policy</Link> (it
      explains cookies).</p>
    <p>Write to <SupportEmail />.</p>
    <button><span>Go</span></button>
    <button><div><p>Delete</p><p>This cannot be undone.</p></div></button>
    <input placeholder="John Doe" />
    <pre>a -- b</pre>
    <nav><a href="/x">About</a></nav>
    {ok ? "Saved" : "Saving…"}
  </div>);`);
  const by = (txt) => segs.find((s) => s.text === txt);
  assert.equal(by("Hello.")?.kind, "heading");
  assert.ok(by("Read our Privacy Policy (it explains cookies)."), JSON.stringify(segs.map((s) => s.text)));
  assert.ok(by("Write to {x}."));
  assert.equal(by("Go")?.kind, "button");
  assert.equal(by("This cannot be undone.")?.kind, "body", "a description inside a button card is not the label");
  assert.equal(by("John Doe")?.kind, "placeholder");
  assert.ok(!segs.some((s) => /a -- b/.test(s.text)), "code is not copy");
  assert.equal(by("About")?.kind, "nav");
  assert.ok(by("Saved") && by("Saving…"));
});

/* the whole fixture repo */
await t("fixture repo: every planted problem is found, nothing else", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-content-"));
  cpSync(join(here, "fixtures/content/repo"), dir, { recursive: true });
  execSync("git init -q && git add -A", { cwd: dir });
  const { problems } = await lintContent(dir, { dns: false });
  const has = (file, rule, re) => problems.some((p) => p.file === file && p.rule === rule && re.test(p.message));
  const expect = [
    ["messages/en.json", "content/trailing-period", /home\.title/], ["messages/en.json", "content/unfinished", /open at launch/],
    ["messages/en.json", "content/date-format", /October 1, 2026/], ["messages/en.json", "content/last-updated", /legal\.terms: "last updated" dates differ/],
    ["messages/en.json", "content/test-data", /New Company 1/], ["messages/en.json", "content/grammar", /1 profiles/], ["messages/en.json", "content/email-domain", /vercel\.app/],
    ["messages/en.json", "content/missing-key", /onlyEn exists in en but is missing in az/], ["messages/az.json", "content/missing-key", /onlyAz exists in az but is missing in en/],
    ["messages/az.json", "content/unfinished", /tezliklə/], ["messages/az.json", "content/untranslated", /pricing\.fee in az contains English/],
    ["messages/az.json", "content/last-updated", /az says 2026-10-05, en says 2026-10-01/], ["messages/az.json", "content/untranslated", /footer\.company in az is the en text unchanged/],
    ["locales/ru/common.json", "content/untranslated", /cta in ru is the en text unchanged/],
    ["app/legal/page.tsx", "content/trailing-period", /Terms of Service\./], ["app/legal/page.tsx", "content/trailing-period", /button label "Save changes\."/],
    ["app/legal/page.tsx", "content/trailing-period", /nav item "About\."/], ["app/legal/page.tsx", "content/date-format", /2 October 2026/],
    ["app/legal/page.tsx", "content/last-updated", /2 different "last updated" dates/], ["app/legal/page.tsx", "content/dash", /—/],
    ["app/legal/page.tsx", "content/grammar", /1 PROFILES/], ["app/legal/page.tsx", "content/raw-error", /NaN/], ["app/legal/page.tsx", "content/unfinished", /Lorem/],
    ["emails/welcome.tsx", "content/email-domain", /acme\.test/], ["lib/site.ts", "content/email-domain", /netlify\.app/],
  ];
  for (const [file, rule, re] of expect) assert.ok(has(file, rule, re), `missing ${file} ${rule} ${re}\n${problems.map((p) => `${p.file}:${p.line} ${p.rule} ${p.message}`).join("\n")}`);
  // false positives the fixture also plants
  const not = [
    [/you@example\.com/, "content/test-data"], [/auth\.emailPlaceholder.*unchanged/, "content/untranslated"], [/John Doe/], [/a -- b|b -- c/], [/qa\.vercel\.app|qa-team|seed\.vercel/],
    [/\(it explains|unmatched brackets/], [/space before/], [/1 of 3|1\.5 hours|30 day|null and void/], [/^(upload|brand|brand2|brand3) in ru\b/, "content/untranslated"], [/10–20/, "content/dash", true],
    [/legal\.privacy/], [/1 profil"/],
  ];
  for (const [re, rule] of not) {
    const bad = problems.filter((p) => (!rule || p.rule === rule) && re.test(p.message));
    if (re.source === "10–20") continue;
    assert.equal(bad.length, 0, `false positive ${re}: ${bad.map((p) => `${p.file}:${p.line} ${p.message}`).join("\n")}`);
  }
  assert.equal(problems.filter((p) => p.rule === "content/dash").length, 1, "only the em dash, not the en dash range");
  assert.equal(problems.length, expect.length + 6, `exactly the planted problems:\n${problems.map((p) => `${p.file}:${p.line} ${p.rule} ${p.message}`).join("\n")}`);
  // skip switches a rule off
  writeFileSync(join(dir, "babysitter.config.json"), JSON.stringify({ content: { skip: ["CT5", "content/grammar"] } }));
  const off = await lintContent(dir, { dns: false });
  assert.ok(!off.problems.some((p) => p.rule === "content/dash" || p.rule === "content/grammar"));
  // per-file text lint (used for base counts) sees the same per-string problems
  assert.ok(lintFileText("messages/en.json", readFileSync(join(dir, "messages/en.json"), "utf8")).some((p) => p.rule === "content/unfinished"));
  rmSync(dir, { recursive: true, force: true });
});

/* wired into `babysitter check` and the hooks */
await t("ui-check: content problems block a full check; --changed reports only new copy problems", () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-content-check-"));
  cpSync(join(here, "fixtures/content/repo"), dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}");
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: dir });
  const run = (...a) => JSON.parse(spawnSync(process.execPath, [join(here, "../bin/ui-check.mjs"), "--repo", dir, "--format", "json", ...a], { encoding: "utf8" }).stdout || "[]");
  const full = run();
  assert.ok(full.some((p) => p.rule === "content/unfinished" && p.file === "messages/en.json"), "full check reports message-file copy");
  // change one line of az.json: only that line's new problem is reported, old debt on other lines is not
  const az = join(dir, "messages/az.json");
  writeFileSync(az, readFileSync(az, "utf8").replace('"Qiymətlər"', '"Qiymətlər — tezliklə"'));
  const ch = run("--changed", "HEAD");
  const list = ch.problems.filter((p) => p.rule.startsWith("content/"));
  assert.ok(list.some((p) => p.file === "messages/az.json" && p.rule === "content/dash"), JSON.stringify(list));
  assert.ok(!list.some((p) => /pricing\.fee|onlyAz|New Company/.test(p.message)), `old debt is not new: ${JSON.stringify(list)}`);
  // content: false turns it off
  writeFileSync(join(dir, "babysitter.config.json"), '{"content": false}');
  assert.ok(!run().some((p) => String(p.rule).startsWith("content/")));
  rmSync(dir, { recursive: true, force: true });
});
await t("hook-post-edit runs on translation files", () => {
  const src = readFileSync(join(here, "../bin/hook-post-edit.mjs"), "utf8");
  assert.match(src, /messages\|locales\?\|i18n/);
});

console.log(failed ? `content-lint: ${failed} failed, ${n} passed` : `content-lint: ${n} passed`);
if (failed) process.exit(1);
