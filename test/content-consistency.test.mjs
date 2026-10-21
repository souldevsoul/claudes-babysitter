// Site-wide copy consistency (CT19–CT22; lib/content-consistency.js over lib/content-site.js) and the French spacing
// rule of CT8. Every check has cases that must be caught and look-alikes that must stay quiet, including cases where
// one check's pattern must not set off another. The fixture repo is test/fixtures/content/site (a small Next.js app
// with next-intl messages in en and fr). The classes come from business QA feedback: the same thing described
// differently between pages and inside one page, buttons and pages named differently, references to pages that do
// not exist.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import * as R from "../lib/content-rules.js";
import * as C from "../lib/content-consistency.js";
import { buildSite, siteMarksOfText } from "../lib/content-site.js";
import { lintContent } from "../lib/content-lint.js";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, n = 0;
async function t(name, fn) {
  try { await fn(); n++; } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.message.split("\n").join("\n  ")}`); }
}
const T = (text, locale = "en", where = "x") => ({ text, kind: "body", locale, where });
const terms = (group, text) => C.termUses(C.TERM_GROUPS.find((g) => g.concept === group && g.locale === "en"), text).map((u) => u.term);

/* ───────── CT8, French typography ───────── */
await t("CT8 French: a space (or U+00A0 / U+202F) before ? ! : ; is right; a missing one is a soft note; English keeps its rule", () => {
  const ct8 = (text, locale) => R.lintSegment({ text, kind: "body", locale }, R.CONTENT_DEFAULTS).filter((x) => x.id === "CT8");
  for (const s of ["Combien puis-je recharger ?", "Nouveau ? Vos 500 premiers crédits sont offerts.", "Nouveau ? Vos crédits", "Prix : 10 €", "Attention !", "Oui ; non"]) {
    assert.equal(ct8(s, "fr").length, 0, `"${s}" is correct French: ${JSON.stringify(ct8(s, "fr"))}`);
    assert.equal(ct8(s, "fr-CA").length, 0);
  }
  const miss = ct8("Nouveau? Vos crédits", "fr");
  assert.ok(miss.length === 1 && miss[0].soft && /French: no space before "\?"/.test(miss[0].what), JSON.stringify(miss));
  assert.ok(ct8("Prix , 10 €", "fr").some((x) => !x.soft && /space before ","/.test(x.what)), "a space before a comma is wrong in French too");
  assert.ok(!ct8("Heure : 10:30", "fr").some((x) => x.soft), "a time is not a missing space");
  assert.equal(ct8("What is Acme?", "fr").length, 0, "English left on a French page is CT11's, not a French spacing slip");
  assert.ok(ct8("Really ?", "en").some((x) => !x.soft), "English: no space before ?");
  assert.ok(ct8("Combien puis-je recharger ?", undefined).length === 1, "no locale: the English rule");
});

/* ───────── CT19 terminology drift ───────── */
await t("CT19 role words: nouns count, adjectives, plan names, quotes, emails, code-like ids and other senses do not", () => {
  assert.deepEqual(terms("role", "Hire an expert today."), ["expert"]);
  assert.deepEqual(terms("role", "Our experts reply within a day."), ["expert"]);
  assert.deepEqual(terms("role", "Your specialist."), ["specialist"]);
  assert.deepEqual(terms("role", "The executor will deliver it."), ["executor"]);
  for (const s of ["Get an expert review of your brief.", "The Pro plan adds support.", "Weigh the pros and cons.", "Specialists are independent contractors.",
    "Never call them “experts” in a contract.", "Write to expert@acme.com.", "Professional and friendly, always.", "It uses specialist terms.", "Visit https://acme.com/experts now.",
    "A reviewer reads every application.", "The translator turns speech into text."])
    assert.ok(!terms("role", s).some((x) => x !== "specialist") || /Specialists are/.test(s), `"${s}": ${JSON.stringify(terms("role", s))}`);
  assert.deepEqual(terms("role", "You are matched with a translator you hire."), ["translator"], "a weak word counts when hired / matched");
});
await t("CT19 account deletion, refunds, cards, currencies: the members and their guards", () => {
  assert.deepEqual(terms("account deletion", "You can close your account at any time."), ["close"]);
  assert.deepEqual(terms("account deletion", "Delete my account"), ["delete"]);
  assert.deepEqual(terms("account deletion", "Account deletion is permanent."), ["delete"]);
  assert.deepEqual(terms("account deletion", "We may suspend or close your account if you break the rules."), [], "the provider ending it is another concept");
  assert.deepEqual(terms("account deletion", "Deleting your account data takes a day."), [], "account data is not the account");
  assert.deepEqual(terms("refund", "Get your money back on unused credits."), ["money back"]);
  assert.deepEqual(terms("refund", "You can raise a chargeback with your bank."), [], "a chargeback is the bank's process");
  assert.deepEqual(terms("refund", "Disputes and Chargebacks"), [], "a section about chargebacks names chargebacks");
  assert.deepEqual(terms("refund", "We will issue a chargeback to your card."), ["chargeback"], "used for the shop's own refund it is drift");
  assert.deepEqual(terms("card payment", "Pay with a credit or debit card."), ["credit or debit card"], "the long form is one member, not two");
  assert.deepEqual(terms("card payment", "Any bank card works."), ["bank card"]);
  assert.deepEqual(C.termUses(C.TERM_GROUPS.find((g) => g.concept === "currency: US dollar"), "Your balance is kept in dollars, shown in USD.").map((u) => u.term), ["USD", "dollars"]);
  assert.deepEqual(C.termUses(C.TERM_GROUPS.find((g) => g.concept === "currency: US dollar"), "Switch between USD, EUR or GBP. It costs 10 USD or $5.").map((u) => u.term), [], "a list of codes and amounts are not prose naming");
  assert.deepEqual(C.termUses(C.TERM_GROUPS.find((g) => g.concept === "currency: US dollar"), "USD").map((u) => u.term), [], "a selector option alone");
});
await t("CT19 groups: dominant term, every location, glossary preference, CT17 overlap, termAllow, termGroups, per language", () => {
  const texts = [T("Hire a specialist.", "en", "a:1"), T("Every specialist is vetted.", "en", "a:2"), T("An expert will reply.", "en", "b:3"), T("Un expert vous répond.", "fr", "fr:1"), T("Un spécialiste vous répond.", "fr", "fr:2"), T("Engagez un expert aujourd'hui.", "fr", "fr:3")];
  const g = C.termDrift(texts, {});
  const en = g.find((x) => x.locale === "en");
  assert.equal(en.dominant, "specialist");
  assert.equal(en.variant, "expert");
  assert.deepEqual(en.report.map((x) => x.where), ["b:3"]);
  assert.match(en.fix, /replace "expert" with "specialist"/);
  const fr = g.find((x) => x.locale === "fr");
  assert.ok(fr && fr.dominant === "expert" && fr.variant === "spécialiste", `French is compared with French: ${JSON.stringify(g.map((x) => [x.locale, x.dominant, x.variant]))}`);
  assert.ok(!g.some((x) => x.report.some((r) => r.where.startsWith("fr:") && x.locale === "en")), "no English group sees French copy");
  // the glossary's preferred term wins even when used less; the variants it bans are CT17's
  const gl = C.termDrift([...texts.slice(0, 3), T("Your executor delivers.", "en", "c:4")], { glossary: { expert: ["executor"] } });
  assert.ok(gl.every((x) => x.dominant === "expert"), JSON.stringify(gl.map((x) => x.dominant)));
  assert.ok(gl.some((x) => x.variant === "specialist") && !gl.some((x) => x.variant === "executor"), "executor is banned by the glossary → CT17, not twice");
  assert.equal(C.termDrift(texts.slice(0, 3), { termAllow: [{ term: "expert", reason: "the premium tier is called Expert" }] }).length, 0);
  assert.equal(C.termDrift(texts.slice(0, 3), { termAllow: [{ term: "expert", where: "^b:", reason: "x" }] }).length, 0);
  assert.equal(C.termDrift(texts.slice(0, 3), { termGroups: { role: false } }).length, 0, "a built-in group can be switched off");
  const custom = C.termDrift([T("Open the dashboard."), T("Back to the dashboard."), T("Your workspace is ready.")], { termGroups: { dashboard: ["dashboard", "workspace"] } });
  assert.ok(custom.length === 1 && custom[0].dominant === "dashboard" && custom[0].variant === "workspace", JSON.stringify(custom));
  const tie = C.termDrift([T("A specialist."), T("An expert will do it.")], {});
  assert.ok(tie[0].tie && /pick one name/.test(tie[0].fix));
});

/* ───────── CT20 conflicting policy statements ───────── */
await t("CT20 facts: refund window vs processing vs withdrawal, deletion time, retention with a minimum, methods, currencies, amounts", () => {
  const f = (s) => C.policyFacts(s).map((x) => `${x.fact}=${x.value}`);
  assert.deepEqual(f("You can ask for a refund within 14 days of purchase."), ["refund window=14 days"]);
  assert.deepEqual(f("Refunds reach your card within 5 business days."), ["refund processing time=5 business days"]);
  assert.deepEqual(f("Refunds are separate from your statutory 14-day right of withdrawal."), ["withdrawal period=14 days"]);
  assert.deepEqual(f("You may get a refund within two weeks."), ["refund window=14 days"], "weeks are days");
  assert.deepEqual(f("We delete your data within 30 days of account deletion."), ["account deletion time=30 days"]);
  assert.deepEqual(f("Invoices are kept for 7 years."), ["retention of financial records=7 years"]);
  assert.deepEqual(f("We accept Visa, Mastercard and American Express."), ["accepted payment methods=Visa, Mastercard, American Express"]);
  assert.deepEqual(f("Pay with a credit card or Apple Pay."), [], "one method named in passing is not the list");
  assert.deepEqual(f("You can pay in GBP, EUR or USD."), ["currencies offered=GBP, EUR, USD"]);
  assert.deepEqual(f("Prices are in USD only."), ["currencies offered=USD"]);
  assert.deepEqual(f("Credits are priced in USD."), ["billing currency=USD"]);
  assert.deepEqual(f("We do not accept Amex."), [], "a negated list is not the accepted list");
  assert.deepEqual(C.amountCurrencies("100 credits for £10, or 12 EUR, or $15.").map((a) => a.currency).sort(), ["EUR", "GBP", "USD"]);
});
await t("CT20 conflicts: disagreeing values are reported where they are; agreeing, qualified, open and minimum statements are not", () => {
  const texts = [
    T("You can ask for a refund within 14 days of purchase.", "en", "/refunds"), T("Unused credits are refundable within 14 days.", "en", "/pricing"), T("You can ask for a refund within 30 days of purchase.", "en", "/terms"),
    T("Refunds are separate from your statutory 14-day right of withdrawal.", "en", "/terms"),
    T("We accept Visa, Mastercard.", "en", "/pricing"), T("We accept Visa, Mastercard, Amex.", "en", "/terms"),
    T("You can pay in GBP, EUR or USD.", "en", "/pricing"), T("Prices show in euros, pounds and other currencies.", "en", "/about"),
    T("Invoices are kept for 7 years.", "en", "/privacy"), T("We keep transaction records for at least five (5) years.", "en", "/aml"),
    T("Credit refunds: processed within 5 business days. Cash refunds: 5-10 business days to appear.", "en", "/refunds"),
  ];
  const g = C.policyConflicts(texts, {});
  const by = (fact) => g.filter((x) => x.concept === fact);
  assert.equal(by("refund window").length, 1);
  assert.equal(by("refund window")[0].dominant, "14 days");
  assert.deepEqual(by("refund window")[0].report.map((x) => x.where), ["/terms"]);
  assert.equal(by("withdrawal period").length, 0, "the withdrawal period is its own clock");
  assert.equal(by("accepted payment methods").length, 1, "Visa, Mastercard vs Visa, Mastercard, Amex");
  assert.equal(by("currencies offered").length, 0, "an open list that names only offered currencies agrees");
  assert.equal(by("retention of financial records").length, 0, "\"at least 5 years\" agrees with 7 years");
  assert.equal(by("refund processing time").length, 0, "two values in one statement are qualified (credit vs cash)");
  // only, open lists that add a currency, amounts outside what is offered
  const g2 = C.policyConflicts([T("You can pay in GBP, EUR or USD.", "en", "/pricing"), T("Prices are in USD only.", "en", "/terms"), T("100 credits for £10.", "en", "/wallet"), T("Prices show in euros, yen and others.", "en", "/about")], {});
  assert.ok(g2.some((x) => x.concept === "currencies offered"), JSON.stringify(g2.map((x) => x.what)));
  assert.ok(g2.some((x) => x.concept === "prices in currencies" && x.variant === "GBP" && /offers USD only/.test(x.what)), JSON.stringify(g2.map((x) => x.what)));
  // content.currencies / acceptance.currencies say what is offered
  const g3 = C.policyConflicts([T("It costs €10.", "en", "/a"), T("It costs $12.", "en", "/b")], { currencies: ["EUR", "USD"] });
  assert.equal(g3.length, 0, "both currencies are offered");
  const g4 = C.policyConflicts([T("It costs €10.", "en", "/a"), T("It costs €12.", "en", "/c"), T("It costs $12.", "en", "/b")], {});
  assert.ok(g4.length === 1 && g4[0].variant === "USD" && g4[0].dominant === "EUR", JSON.stringify(g4.map((x) => x.what)));
  assert.equal(C.policyConflicts([T("Remboursement sous 30 jours.", "fr"), T("You can ask for a refund within 14 days.", "en")], {}).length, 0, "French copy is not compared with English");
  assert.equal(C.policyConflicts(texts, { policyAllow: [{ fact: "refund window", value: "30 days", reason: "B2B customers" }] }).filter((x) => x.concept === "refund window").length, 0);
});

/* ───────── CT21 naming drift of links, pages and actions ───────── */
await t("CT21 (a) one destination, several names; subsets, card links, CTAs in the body, back links and labelAllow pass", () => {
  const L = (path, label, region = "nav", where = `${region}:${label}`, kind = "link") => ({ path, label, region, where, kind });
  const pages = [{ path: "/help", names: ["Help Center"], title: "Help Center | Acme", where: "/help <h1>" }, { path: "/sign-up", names: ["Sign up"], title: "Sign up | Acme", where: "" }, { path: "/pricing", names: ["Pricing"], title: "Pricing | Acme", where: "" }];
  const g = C.labelDrift({ links: [L("/help", "Help Centre", "footer"), L("/help", "Support"), L("/help", "FAQ", "nav")], pages }, {});
  const a = g.filter((x) => x.concept === "links to /help");
  assert.equal(a.length, 2, JSON.stringify(g.map((x) => x.what)));
  assert.ok(a.every((x) => x.dominant === "Help Centre"), "the page's own name wins (Centre = Center)");
  const quiet = C.labelDrift({ links: [L("/pricing", "Pricing"), L("/pricing", "See pricing", "body"), L("/pricing", "price list", "inline"), L("/pricing", "Upload your first video and see the price", "body"),
    L("/sign-up", "Sign up"), L("/sign-up", "Back to Sign up", "body"), L("/sign-up", "Learn more", "body"), L("/sign-up", "Start your first project", "body")], pages }, {});
  assert.equal(quiet.length, 0, JSON.stringify(quiet.map((x) => x.what)));
  const allowed = C.labelDrift({ links: [L("/sign-up", "Sign up"), L("/sign-up", "Create account", "footer")], pages }, { labelAllow: { "/sign-up": ["Sign up", "Create account"] } });
  assert.equal(allowed.filter((x) => x.concept === "links to /sign-up").length, 0);
  assert.equal(C.labelDrift({ links: [L("/sign-up", "Sign up"), L("/sign-up", "Create account", "footer")], pages }, {}).filter((x) => x.concept === "links to /sign-up").length, 1, "not configured: reported");
});
await t("CT21 (b) a nav / footer label the page does not carry; legal names left to CT15 on rendered pages; taglines and brands are not names", () => {
  const pages = [{ path: "/cookies", names: ["Cookie Policy"], title: "Cookie Policy | Acme", where: "/cookies <h1>" }, { path: "/terms", names: ["Terms of Service"], title: "Terms of Service | Acme", where: "" },
    { path: "/help", names: ["How can we help you?"], title: "Help | Acme", where: "" }, { path: "/status", names: ["Acme Status"], title: "Status | Acme", where: "" }, { path: "/x", names: [], title: "Acme", where: "" }];
  for (const p of [{ path: "/a", title: "A | Acme", names: [] }, { path: "/b", title: "B | Acme", names: [] }]) pages.push({ ...p, where: "" });
  const links = [{ path: "/cookies", label: "Cookie notice", region: "footer", where: "footer" }, { path: "/terms", label: "Terms", region: "footer", where: "footer" }, { path: "/help", label: "Help centre", region: "nav", where: "nav" }, { path: "/status", label: "Service status", region: "footer", where: "footer" }];
  const g = C.labelDrift({ links, pages }, {});
  assert.deepEqual(g.map((x) => x.variant), ["Cookie notice"], JSON.stringify(g.map((x) => x.what)));
  assert.match(g[0].fix, /rename the footer link to "Cookie Policy"/);
  assert.equal(C.labelDrift({ links, pages }, {}, { skipLegal: true }).length, 1, "Cookie notice and Cookie Policy are not one legal family name: still reported");
  // a label that shares nothing with the page's name is reported only when that name is what another link calls a different page
  const clash = C.labelDrift({ links: [{ path: "/docs", label: "Docs", region: "footer", where: "f1" }, { path: "/help", label: "Help Centre", region: "footer", where: "f2" }], pages: [{ path: "/docs", names: ["Help Center"], title: "", where: "/docs <h1>" }, { path: "/help", names: ["Help Center"], title: "", where: "" }, { path: "/about", names: ["Your video in other languages"], title: "", where: "" }] }, {});
  assert.ok(clash.length === 1 && clash[0].variant === "Docs" && /another link calls a different page "Help Center"/.test(clash[0].fix), JSON.stringify(clash.map((x) => [x.what, x.fix])));
  assert.equal(C.labelDrift({ links: [{ path: "/about", label: "Company", region: "nav", where: "n" }, { path: "/x", label: "Languages", region: "nav", where: "n2" }], pages: [{ path: "/about", names: ["Your video in other languages"], title: "AI Video Translation | Acme", where: "" }] }, {}).length, 0, "a tagline heading or SEO title is not the page's name");
  assert.equal(C.labelDrift({ links: [{ path: "/pricing", label: "Pricing", region: "nav", where: "n" }, { path: "/pricing", label: "How credits work", region: "body", where: "b" }], pages: [] }, {}).length, 0, "a question in the body is a call to action");
  assert.equal(C.labelDrift({ links: [{ path: "/privacy", label: "Privacy Notice", region: "footer", where: "f" }], pages: [{ path: "/privacy", names: ["Privacy Policy"], title: "", where: "" }] }, {}, { skipLegal: true }).length, 0, "same legal family on rendered pages: CT15 reports it");
});
await t("CT21 (c) one action, one label: action groups on buttons, the same onClick behind two labels; nav items are not actions", () => {
  const texts = [{ text: "Buy credits", kind: "button", locale: "en", where: "a:1" }, { text: "Top up", kind: "button", locale: "en", where: "b:2" }, { text: "Top up", kind: "button", locale: "en", where: "c:3" }, { text: "Buy credits", kind: "button", locale: "en", where: "d:4" }, { text: "Buy credits", kind: "body", locale: "en", where: "e:5" }];
  const g = C.labelDrift({ texts }, {});
  assert.ok(g.length === 1 && g[0].concept === "buying credits", JSON.stringify(g.map((x) => x.what)));
  const g2 = C.labelDrift({ actions: [{ key: "Wallet.tsx setBuyOpen(true)", label: "Top up", where: "w:8" }, { key: "Wallet.tsx setBuyOpen(true)", label: "Add credits", where: "w:9" }, { key: "Wallet.tsx setMenuOpen(true)", label: "Menu", where: "w:10" }] }, {});
  assert.ok(g2.length === 1 && /setBuyOpen/.test(g2[0].concept), JSON.stringify(g2));
  assert.equal(C.labelDrift({ links: [{ path: "/contact", label: "Contact", region: "footer", where: "f" }], texts: [{ text: "Contact support", kind: "button", locale: "en", where: "b" }] }, {}).length, 0, "a footer item names the page, it is not the action");
  assert.equal(C.labelDrift({ texts: [{ text: "Acheter des crédits", kind: "button", locale: "fr", where: "x" }, { text: "Top up", kind: "button", locale: "en", where: "y" }] }, {}).length, 0, "other languages are not matched against the English groups");
});

/* ───────── CT22 references to pages that do not exist ───────── */
await t("CT22 named documents: Title Case names ending in Terms / Policy / Agreement / Centre / Guide / FAQ; generic and third-party names pass", () => {
  const names = (s) => C.documentNames(s).map((d) => d.name);
  assert.deepEqual(names("Read the Specialist Service Terms before you start."), ["Specialist Service Terms"]);
  assert.deepEqual(names("See our “Acceptable Use Policy”."), ["Acceptable Use Policy"]);
  assert.deepEqual(names("The Data Processing Agreement and the Help Centre."), ["Data Processing Agreement", "Help Centre"]);
  assert.deepEqual(names("See our AML / KYC Policy."), ["AML / KYC Policy"]);
  assert.deepEqual(names("Answers are in our FAQ."), ["FAQ"]);
  for (const s of ["Stripe's Services Agreement applies.", "This Agreement is between you and us.", "6. Changes to This Policy", "Answer FAQs automatically", "Company FAQ and policies", "Our Data Center is in Frankfurt.", "Read the policy.", "Google Privacy Policy", "a Legal Notice", "1. Agreement to Terms"])
    assert.deepEqual(names(s), [], `"${s}": ${JSON.stringify(names(s))}`);
});
await t("CT22 missing pages: unknown names reported once with every place; names the site carries, same legal family, knownDocuments and dead links", () => {
  const pages = [{ path: "/terms", names: ["Terms of Service"], title: "Terms of Service | Acme", where: "" }, { path: "/help", names: ["Help Center"], title: "", where: "" }];
  const links = [{ path: "/refunds", label: "Refund Policy", region: "footer", where: "f" }];
  const texts = [T("Read the Specialist Service Terms.", "en", "/a"), T("The Specialist Service Terms apply.", "en", "/b"), T("Our Help Centre has answers.", "en", "/c"), T("See the Refund Policy.", "en", "/d"),
    T("The Terms and Conditions apply.", "en", "/e"), T("The Acme Partner Agreement applies.", "en", "/f"), T("Sign the Partner Agreement first.", "en", "/g"), { text: "Refund Policy", kind: "heading", locale: "en", where: "/h" },
    T("Lisez les Conditions Générales.", "fr", "/fr")];
  const g = C.missingPages({ texts, links, pages }, {});
  const unknown = g.map((x) => x.variant);
  assert.deepEqual(unknown.sort(), ["Partner Agreement", "Specialist Service Terms"], JSON.stringify(g.map((x) => x.what)));
  assert.equal(g.find((x) => x.variant === "Specialist Service Terms").report.length, 2);
  assert.ok(g.find((x) => x.variant === "Partner Agreement").report.some((r) => r.where === "/f"), "the brand in front is the same name");
  assert.ok(!g.some((x) => x.report.some((r) => r.where === "/h")), "a heading that is only the name labels a block");
  assert.equal(C.missingPages({ texts, links, pages }, { knownDocuments: ["Specialist Service Terms", "Partner Agreement"] }).length, 0);
  const dead = C.missingPages({ deadLinks: [{ path: "/specialist-terms", label: "Specialist terms", where: "/ body", status: 404 }], pages }, {});
  assert.ok(dead.length === 1 && /answers 404/.test(dead[0].what) && /\/terms/.test(dead[0].fix), JSON.stringify(dead));
});

/* ───────── cross-rule: one pattern, one report ───────── */
await t("cross-rule: a refund sentence is a CT20 fact, not a CT19 drift; a legal heading is not a CT22 reference; a CT21 label is not a CT19 term in French", () => {
  const texts = [T("You can ask for a refund within 14 days.", "en", "/a"), T("Refunds within 30 days.", "en", "/b"), { text: "Refund Policy", kind: "heading", locale: "en", where: "/refunds" }];
  const all = C.consistencyFindings({ texts, links: [{ path: "/refunds", label: "Refund Policy", region: "footer", where: "f" }], pages: [{ path: "/refunds", names: ["Refund Policy"], title: "", where: "" }] }, {});
  assert.deepEqual(all.map((x) => x.id), ["CT20"], JSON.stringify(all.map((x) => x.what)));
  assert.equal(C.consistencyFindings({ texts, links: [], pages: [] }, { skip: ["CT20"] }).length, 0, "content.skip turns a rule off");
});

/* ───────── the fixture repo, statically ───────── */
await t("fixture site: every planted problem is found at its file:line, the look-alikes are not; admin pages and French copy stay out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-site-"));
  cpSync(join(here, "fixtures/content/site"), dir, { recursive: true });
  execSync("git init -q && git add -A", { cwd: dir });
  const { problems, consistency, soft } = await lintContent(dir, { dns: false });
  const mine = problems.filter((p) => /^CT(19|2[0-2])$/.test(p.id));
  const has = (id, file, re) => mine.some((p) => p.id === id && p.file === file && re.test(p.message));
  const expect = [
    ["CT19", "app/[locale]/help/page.tsx", /role: "executor" here — the site mostly says "specialist"/],
    ["CT19", "messages/en.json", /role: "expert" here/],
    ["CT19", "app/[locale]/help/page.tsx", /account deletion: "close your account" here — the site mostly says "delete"/],
    ["CT19", "messages/en.json", /refund: "Get your money back" here/],
    ["CT19", "messages/en.json", /card payment: "bank card" here — the site mostly says "credit card"/],
    ["CT19", "messages/en.json", /currency: US dollar: "USD" here — the site mostly says "dollars"/],
    ["CT19", "app/[locale]/terms/page.tsx", /currency: US dollar: "USD" here/],
    ["CT20", "app/[locale]/terms/page.tsx", /accepted payment methods: "American Express, Mastercard, Visa" here/],
    ["CT20", "app/[locale]/terms/page.tsx", /currencies offered: "USD" here \("Prices are in USD only\."\)/],
    ["CT20", "app/[locale]/terms/page.tsx", /account deletion time: "7 days" here/],
    ["CT20", "app/[locale]/terms/page.tsx", /refund window: "30 days" here/],
    ["CT20", "messages/en.json", /a price in GBP here .*offers USD only/],
    ["CT21", "components/Navbar.tsx", /"Support" here — other links to \/help say "Help Centre"/],
    ["CT21", "components/Footer.tsx", /this footer calls \/cookies "Cookie notice", the page itself says "Cookie Policy"/],
    ["CT21", "components/Wallet.tsx", /buying credits: "Top up" here/],
    ["CT21", "components/Wallet.tsx", /buying credits: "Add credits" here/],
    ["CT21", "components/Wallet.tsx", /the action components\/Wallet\.tsx setBuyOpen\(true\): "Add credits" here/],
    ["CT22", "app/[locale]/page.tsx", /go to \/specialist-terms, which is not a page/],
    ["CT22", "app/[locale]/page.tsx", /names "Specialist Service Terms" but no page/],
  ];
  for (const [id, file, re] of expect) assert.ok(has(id, file, re), `missing ${id} ${file} ${re}\n${mine.map((p) => `${p.id} ${p.file}:${p.line} ${p.message}`).join("\n")}`);
  assert.equal(mine.length, expect.length, `exactly the planted problems:\n${mine.map((p) => `${p.id} ${p.file}:${p.line} ${p.message.slice(0, 140)}`).join("\n")}`);
  // look-alikes the fixture plants
  const all = mine.map((p) => p.message).join("\n");
  for (const re of [/expert review|Pro plan|pros and cons|contractors|“experts”|expert@|Professional and friendly/, /suspend or close/, /chargeback/i, /guide\.pdf|old-pricing|pricing#faq|\/fr\/pricing/, /price list/, /Stripe|This Agreement|Help Center|Refund Policy" but/, /Terms of Service/, /Professionals|admin/, /withdrawal|5 years|business days/, /Become a specialist/])
    assert.ok(!re.test(all), `false positive ${re}:\n${all}`);
  assert.ok(!mine.some((p) => p.file === "messages/fr.json"), "French copy is checked against French only");
  assert.ok(!problems.some((p) => p.id === "CT8" && p.file === "messages/fr.json"), `French spacing is right: ${JSON.stringify(problems.filter((p) => p.id === "CT8"))}`);
  assert.ok(consistency.every((g) => g.fix && g.report.length), "every group says what to do and where");
  void soft;
  // babysitter content: the grouped list for an agent, and JSON with the groups
  const out = spawnSync(process.execPath, [join(here, "../bin/content-lint.mjs"), dir, "--offline"], { encoding: "utf8" }).stdout;
  assert.match(out, /Site-wide copy \(CT19–CT22\): \d+ thing\(s\) to make consistent/);
  assert.match(out, /change: app\/\[locale\]\/help\/page\.tsx:6/);
  const js = JSON.parse(spawnSync(process.execPath, [join(here, "../bin/content-lint.mjs"), dir, "--offline", "--format", "json"], { encoding: "utf8" }).stdout);
  assert.ok(js.consistency.some((g) => g.id === "CT19" && g.dominant === "specialist" && g.change.length), "json carries the groups");
  // config: skip, termAllow, labelAllow, knownDocuments
  writeFileSync(join(dir, "babysitter.config.json"), JSON.stringify({ content: { skip: ["CT20", "CT21"], termAllow: [{ term: "executor", reason: "the help page quotes the old name" }], knownDocuments: ["Specialist Service Terms"] } }));
  const cfgd = (await lintContent(dir, { dns: false })).problems.filter((p) => /^CT(19|2[0-2])$/.test(p.id));
  assert.ok(!cfgd.some((p) => /^CT2[01]$/.test(p.id) || /executor|Specialist Service Terms/.test(p.message)), JSON.stringify(cfgd.map((p) => p.message)));
  assert.ok(cfgd.some((p) => p.id === "CT22" && /specialist-terms/.test(p.message)), "the dead link is still there");
  rmSync(dir, { recursive: true, force: true });
});
await t("the site model: t() keys followed to the default language, link objects, locale templates, routes, public files, redirects", () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-site-model-"));
  cpSync(join(here, "fixtures/content/site"), dir, { recursive: true });
  execSync("git init -q && git add -A", { cwd: dir });
  const site = buildSite(dir);
  const label = (path, region) => site.links.filter((l) => l.path === path && (!region || l.region === region)).map((l) => l.label);
  assert.deepEqual(label("/help", "footer"), ["Help Centre"], "t(l.key) over a link array");
  assert.deepEqual(label("/help", "nav"), ["Support"], "t(\"help\") with useTranslations(\"Nav\")");
  assert.ok(label("/help", "body").includes("Help Centre"), "`/${locale}/help`");
  assert.ok(site.links.some((l) => l.path === "/pricing" && l.region === "inline"), "a link inside a sentence is inline");
  assert.ok(site.links.some((l) => l.path === "/sign-up" && l.label === "Become a specialist"), "a card link is named by its heading");
  assert.ok(site.pages.find((p) => p.path === "/terms").names.includes("Terms of Service"), "<PolicyLayout title> names the page");
  for (const p of ["/", "/help", "/terms", "/guide.pdf", "/old-pricing", "/pricing"]) assert.ok(site.routes.exists(p), p);
  assert.ok(!site.routes.exists("/specialist-terms"));
  assert.ok(site.texts.filter((x) => x.admin).length > 0 && site.pages.some((p) => p.admin), "the admin area is marked (and left out by default)");
  rmSync(dir, { recursive: true, force: true });
});

/* ───────── babysitter check --changed: only new drift on changed lines ───────── */
await t("ui-check --changed: a new minority term on a changed line is reported; old drift on a line touched for another reason is not", () => {
  const dir = mkdtempSync(join(tmpdir(), "bs-site-check-"));
  cpSync(join(here, "fixtures/content/site"), dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}");
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: dir });
  const run = (...a) => JSON.parse(spawnSync(process.execPath, [join(here, "../bin/ui-check.mjs"), "--repo", dir, "--format", "json", ...a], { encoding: "utf8" }).stdout || "[]");
  const f = join(dir, "app/[locale]/help/page.tsx");
  // touch the line with the old "executor" for another reason, and add a new "expert" line
  writeFileSync(f, readFileSync(f, "utf8").replace("Your executor will reply to every ticket.", "Your executor will reply to every ticket, fast.").replace("<p>To close your account, write to us.</p>", "<p>To close your account, write to us.</p>\n      <p>An expert will check it.</p>"));
  const ch = run("--changed", "HEAD");
  const list = (ch.problems || []).filter((p) => /^content\/(term-drift|policy-conflict|label-drift|missing-page)$/.test(p.rule));
  assert.ok(list.some((p) => /"expert" here/.test(p.message)), `the new term is reported: ${JSON.stringify(list.map((p) => p.message))}`);
  assert.ok(!list.some((p) => /"executor" here/.test(p.message)), `old drift on a touched line is not new: ${JSON.stringify(list.map((p) => p.message))}`);
  assert.equal(siteMarksOfText("app/x.tsx", "export default () => <p>An expert will reply.</p>;").filter((m) => m.baseKey === "CT19|role|expert").length, 1);
  rmSync(dir, { recursive: true, force: true });
});

console.log(failed ? `content-consistency: ${failed} failed, ${n} passed` : `content-consistency: ${n} passed`);
if (failed) process.exit(1);
