// 5.6.1 — CT19–CT22 in French. Business QA notes on a bilingual product: "the same thing said differently between
// pages and inside one page (card payment, refunds, deleting the account, prices in different currencies, the role
// Specialist / Expert / executor); buttons and pages named differently in different places; links to pages that do
// not exist (Specialist Service Terms)". Before 5.6.1 only the English pages were read for facts, labels and named
// pages. Each case: the French defect is caught, its correct French twin stays quiet, and a French label is never
// compared with an English one. RUN: node test/content-fr-561.test.mjs
import assert from "node:assert/strict";
import * as C from "../lib/content-consistency.js";

let failed = 0, n = 0;
async function t(name, fn) {
  try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); }
}
const T = (text, locale, where, kind = "body") => ({ text, kind, locale, where, route: where.split(" ")[0] });
const L = (path, label, locale, region, where) => ({ path, label, locale, region, where, route: where.split(" ")[0] });
const P = (path, names, locale, title = "") => ({ path, names, title, locale, where: `${path} <h1>` });
const run = (site, ids) => C.consistencyFindings({ texts: [], links: [], pages: [], ...site }, {}, {}).filter((g) => ids.includes(g.id));
const say = (gs) => gs.map((g) => `${g.id} ${g.concept}: ${g.what}`).join("\n");

await t("CT19 fr: the role, the refund, the card and the currency each named one way — 'expert' next to 'Spécialiste', 'restitution des fonds' next to 'remboursement', 'carte de crédit' next to 'carte bancaire'", () => {
  const bad = run({ texts: [
    T("Un Spécialiste relit votre script.", "fr", "/fr"), T("Chaque Spécialiste est vérifié.", "fr", "/fr/specialists"), T("Votre Spécialiste répond en un jour.", "fr", "/fr/help"),
    T("Un expert relit chaque traduction.", "fr", "/fr/how-it-works"),
    T("Le remboursement des crédits non utilisés est possible.", "fr", "/fr/refunds"), T("Demandez un remboursement depuis votre compte.", "fr", "/fr/help"),
    T("La restitution des fonds se fait sous 10 jours.", "fr", "/fr/faq"),
    T("Payez par carte bancaire.", "fr", "/fr/pricing"), T("Toute carte bancaire convient.", "fr", "/fr/faq"), T("Votre carte de crédit est débitée une fois.", "fr", "/fr/checkout"),
  ] }, ["CT19"]);
  const concepts = bad.map((g) => g.concept);
  for (const c of ["role", "refund", "card payment"]) assert.ok(concepts.some((x) => x.startsWith(c)), `${c} drift is caught:\n${say(bad)}`);
  const good = run({ texts: [
    T("Un Spécialiste relit votre script.", "fr", "/fr"), T("Chaque Spécialiste est vérifié.", "fr", "/fr/specialists"),
    T("Le remboursement des crédits non utilisés est possible.", "fr", "/fr/refunds"), T("Demandez un remboursement.", "fr", "/fr/help"),
    T("Payez par carte bancaire.", "fr", "/fr/pricing"), T("Toute carte bancaire convient.", "fr", "/fr/faq"),
    // "en avoir" / "peut avoir" are the verb, not a credit note
    T("Vous pouvez en avoir besoin plus tard.", "fr", "/fr/faq"), T("Un Spécialiste peut avoir plusieurs langues.", "fr", "/fr/specialists"),
    // English on the English pages is its own language: never a French variant
    T("A Specialist reviews your script; get a refund by credit card.", "en", "/"),
  ] }, ["CT19"]);
  assert.deepEqual(good, [], say(good));
});

await t("CT20 fr: a refund window, a deletion time and the accepted cards that disagree between French pages are caught; the same facts agreeing are not", () => {
  const bad = run({ texts: [
    T("Vous pouvez demander un remboursement dans les 14 jours suivant l'achat.", "fr", "/fr/refunds"),
    T("Un remboursement peut être demandé dans les 14 jours.", "fr", "/fr/faq"),
    T("Vous avez 30 jours pour demander un remboursement.", "fr", "/fr/pricing"),
    T("Nous supprimons votre compte dans les 30 jours.", "fr", "/fr/privacy"), T("La suppression de votre compte prend 7 jours.", "fr", "/fr/help"),
    T("Nous acceptons Visa et Mastercard.", "fr", "/fr/pricing"), T("Nous acceptons Visa, Mastercard et PayPal.", "fr", "/fr/faq"),
  ] }, ["CT20"]);
  const facts = bad.map((g) => g.concept);
  for (const f of ["refund window", "account deletion time", "accepted payment methods"]) assert.ok(facts.includes(f), `${f} is caught:\n${say(bad)}`);
  assert.ok(bad.some((g) => /"30 days".*\/fr\/pricing|\/fr\/pricing.*"30 days"/.test(g.what)), say(bad));
  const good = run({ texts: [
    T("Vous pouvez demander un remboursement dans les 14 jours suivant l'achat.", "fr", "/fr/refunds"), T("Un remboursement peut être demandé dans les 14 jours.", "fr", "/fr/faq"),
    // the money reaching the card is another clock than the window to ask
    T("Le remboursement apparaît sur votre carte sous 5 à 10 jours ouvrés.", "fr", "/fr/refunds"),
    T("Nous acceptons Visa et Mastercard.", "fr", "/fr/pricing"), T("Nous acceptons les cartes Visa et Mastercard.", "fr", "/fr/faq"),
    // a negated sentence is not a second window
    T("Vous ne pouvez pas obtenir de remboursement après 14 jours.", "fr", "/fr/terms"),
  ] }, ["CT20"]);
  assert.deepEqual(good, [], say(good));
});

await t("CT20 across languages: '14 days' on the English refund page against '30 jours' on the French one is one fact stated twice; agreeing languages are quiet", () => {
  const bad = run({ texts: [
    T("You can ask for a refund within 14 days of purchase.", "en", "/refund-policy"), T("Refunds can be requested within 14 days.", "en", "/faq"),
    T("Vous pouvez demander un remboursement dans les 30 jours suivant l'achat.", "fr", "/fr/refund-policy"),
  ] }, ["CT20"]);
  assert.ok(bad.some((g) => g.concept === "refund window" && /14 days/.test(g.what) && /30 days/.test(g.what) && /\/fr\/refund-policy/.test(g.what)), say(bad));
  const good = run({ texts: [
    T("You can ask for a refund within 14 days of purchase.", "en", "/refund-policy"), T("Vous pouvez demander un remboursement dans les 14 jours suivant l'achat.", "fr", "/fr/refund-policy"),
    T("Prices are shown in pounds sterling (GBP).", "en", "/pricing"), T("Les prix sont affichés en livres sterling (GBP).", "fr", "/fr/pricing"),
  ] }, ["CT20"]);
  assert.deepEqual(good, [], say(good));
});

await t("CT20 fr: prices in euros on French pages while the site says it sells in pounds only are caught", () => {
  const bad = run({ texts: [
    T("Les prix sont affichés uniquement en livres sterling (GBP).", "fr", "/fr/pricing"),
    T("Le pack de 1 000 crédits coûte 80 €.", "fr", "/fr/credits"),
  ] }, ["CT20"]);
  assert.ok(bad.some((g) => g.concept === "prices in currencies" && /EUR/.test(g.what)), say(bad));
});

await t("CT21 fr: the help page linked as 'Centre d'aide' and 'Assistance', and 'Acheter des crédits' next to 'Recharger', are caught; French labels are never compared with English ones", () => {
  const pages = [P("/help", ["Centre d'aide"], "fr", "Centre d'aide · Acme"), P("/help", ["Help Centre"], "en", "Help Centre · Acme"), P("/pricing", ["Tarifs"], "fr"), P("/pricing", ["Pricing"], "en")];
  const bad = run({ pages, links: [
    L("/help", "Centre d'aide", "fr", "footer", "/fr footer"), L("/help", "Centre d'aide", "fr", "footer", "/fr/pricing footer"), L("/help", "Assistance", "fr", "nav", "/fr nav"),
    L("/help", "Help Centre", "en", "footer", "/ footer"), L("/help", "Help Centre", "en", "nav", "/ nav"),
  ], texts: [
    T("Acheter des crédits", "fr", "/fr/dashboard", "button"), T("Acheter des crédits", "fr", "/fr/pricing", "button"), T("Recharger", "fr", "/fr/dashboard/credits", "button"),
  ] }, ["CT21"]);
  assert.ok(bad.some((g) => /\[fr\]/.test(g.what) && /Assistance/.test(g.what) && /Centre d'aide/.test(g.what)), `the two French names of /help:\n${say(bad)}`);
  assert.ok(bad.some((g) => /buying credits/.test(g.concept) && /recharger/i.test(g.what)), `the two French labels of buying credits:\n${say(bad)}`);
  assert.ok(!bad.some((g) => /Help Centre/.test(g.what) && /Centre d'aide/.test(g.what)), `English and French names are two languages, not two names:\n${say(bad)}`);
  const good = run({ pages, links: [
    L("/help", "Centre d'aide", "fr", "footer", "/fr footer"), L("/help", "Centre d'aide", "fr", "nav", "/fr nav"), L("/help", "Help Centre", "en", "footer", "/ footer"),
  ], texts: [T("Acheter des crédits", "fr", "/fr/dashboard", "button"), T("Acheter des crédits", "fr", "/fr/pricing", "button"), T("Buy credits", "en", "/pricing", "button")] }, ["CT21"]);
  assert.deepEqual(good, [], say(good));
});

await t("CT22 fr: 'les Conditions de service des Spécialistes' named in French copy with no such page is caught; the page's own name, a legal family and a link to it are not", () => {
  const pages = [P("/specialist-terms", ["Conditions des Spécialistes"], "fr"), P("/terms", ["Conditions générales d'utilisation"], "fr"), P("/privacy", ["Politique de confidentialité"], "fr")];
  const links = [L("/specialist-terms", "Conditions des Spécialistes", "fr", "footer", "/fr footer"), L("/privacy", "Politique de confidentialité", "fr", "footer", "/fr footer")];
  const bad = run({ pages, links, texts: [T("En postulant, vous acceptez les Conditions de service des Spécialistes.", "fr", "/fr/become-a-specialist")] }, ["CT22"]);
  assert.ok(bad.some((g) => /\[fr\]/.test(g.what) && /Conditions de service des Spécialistes/.test(g.what)), say(bad));
  const good = run({ pages, links, texts: [
    T("En postulant, vous acceptez les Conditions des Spécialistes.", "fr", "/fr/become-a-specialist"),
    T("Consultez nos Conditions d'utilisation avant de commencer.", "fr", "/fr/sign-up"),
    T("Voir la Politique de confidentialité de Stripe pour les paiements.", "fr", "/fr/pricing"),
    T("Conditions de remboursement : les crédits non utilisés sont remboursés.", "fr", "/fr/refunds"),
    // the name ends where the sentence goes on: "… Politique de confidentialité et conformément au RGPD", "… pour la liste"
    T("Nous traitons vos données comme décrit dans notre Politique de confidentialité et conformément au RGPD.", "fr", "/fr/terms"),
    T("Consultez notre Politique de confidentialité pour la liste des cookies.", "fr", "/fr/privacy"),
  ] }, ["CT22"]);
  assert.deepEqual(good, [], say(good));
});

console.log(failed ? `content-fr-561: ${failed} failed, ${n} passed` : `content-fr-561: ${n} passed`);
process.exit(failed ? 1 : 0);
