// 5.7.1: does the product sell credits, or money? One answer per run, read by every rule that depends on it.
// Before, each check decided on the page in front of it from the bare word "credit": M2 judged "the product shows no
// credits" on one signed-in page and failed "the header must show the credit balance" on the next (it said "Adjust
// Credits"), while the money check called a dollar balance in the header wrong "because the product sells credits" — on
// a product whose every amount is in dollars ("credit card", "sign-up credit", "unused credit" are words, not a unit).
//
// The unit is what decides: a product sells credits when an amount is given in credits ("6,000 credits", "120 cr",
// "Credits: 500"); it sells money when amounts carry a currency and none is given in credits. Owner override:
// babysitter.config.json → moneyModel: "credits" | "money" (acceptance.headerBalance: true still forces M2 on).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// an amount in credits: a number followed by the unit, or "credits: 500" / "balance: 500 credits"; never a currency
// amount ("$5 credit" is money) and never "credit card" / "credit union"
export const CREDIT_AMOUNT_SRC = String.raw`(?:(?<![$€£¥₽₹]\s?)(?<![\d.,])\d[\d,.\u00a0\u202f ]*\s*(?:credits?|cr|кредит\p{L}*|kredit\p{L}*)(?!\s*(?:card|union|line|score|note|hours?)\b)(?![\p{L}])|\b(?:credits?|кредиты?)\s*:\s*\d[\d,.]*)`;
export const CREDIT_AMOUNT_RE = new RegExp(CREDIT_AMOUNT_SRC, "iu");
export const CURRENCY_AMOUNT_RE = /(?:[$€£¥₽₹]\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|GBP|RUB|INR|руб|₽|€)\b)/u;

/** Credit amounts in a text (up to `max` samples). */
export function creditAmounts(text, max = 3) {
  const re = new RegExp(CREDIT_AMOUNT_SRC, "giu");
  return [...String(text || "").matchAll(re)].map((m) => m[0].trim()).filter((x) => /\d/.test(x)).slice(0, max);
}

/**
 * @param {{ cfg?: any, texts?: { route: string, text: string }[] }} o every page's text the run read
 * @returns {{ model: "credits"|"money"|"unknown", why: string, samples: string[] }}
 */
export function moneyModel({ cfg = {}, texts = [] } = {}) {
  const own = cfg.moneyModel;
  if (own === "credits" || own === "money") return { model: own, why: `babysitter.config.json → moneyModel: "${own}"`, samples: [] };
  const credit = [], money = [];
  for (const t of texts) {
    for (const a of creditAmounts(t.text)) if (credit.length < 5) credit.push(`${a} (${t.route})`);
    const m = String(t.text || "").match(CURRENCY_AMOUNT_RE);
    if (m && money.length < 5) money.push(`${m[0]} (${t.route})`);
  }
  if (credit.length) return { model: "credits", why: `amounts are given in credits: ${credit.slice(0, 3).join(", ")}`, samples: credit };
  if (money.length) return { model: "money", why: `amounts are in a currency (${money.slice(0, 2).join(", ")}) and none on any page is given in credits`, samples: money };
  return { model: "unknown", why: "no amount found on the pages read", samples: [] };
}

/** The pages' text this run has: the text pass (every line of every page), else what prepare's crawl noted. */
export function runTexts(root) {
  const read = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
  const tp = existsSync(join(root, ".babysitter/text-pages.json")) ? read(join(root, ".babysitter/text-pages.json")) : null;
  if (tp?.pages?.length) return tp.pages.map((p) => ({ route: p.route, text: (p.lines || []).map((l) => l.text).join("\n") }));
  const crawl = read(join(root, ".babysitter/crawl.json"));
  return (crawl?.money?.pages || []).map((p) => ({ route: p.route, text: p.text }));
}

let CACHED;
/** The run's money model (cached per process); `root` is the product (BABYSITTER_ROOT). */
export function siteMoneyModel(cfg, root = process.env.BABYSITTER_ROOT || process.cwd()) {
  if (CACHED && CACHED.root === root) return CACHED.value;
  const value = moneyModel({ cfg, texts: runTexts(root) });
  CACHED = { root, value };
  return value;
}

/**
 * ONE ANSWER FOR THE WHOLE RUN, NOT ONE PER PAGE.
 *
 * M2 decided page by page from the word "credit" in front of it, so a product that bills in
 * dollars got "the header shows money instead of credits" on its billing page (which says
 * "credit card") and a skip on the page beside it: two opposite answers, both wrong, for one
 * product. The model is decided once from every page the run read (moneyModel); this says
 * what follows from it, with the same reason on every page, so the summary reads as one
 * decision rather than a disagreement with itself.
 *
 * @param {{ model: { model: string, why: string }, pageText?: string, headerBalance?: boolean }} o
 * @returns {{ applies: boolean, reason: string }}
 */
export function m2Decision({ model, pageText = "", headerBalance = false } = {}) {
  const m = model?.model || "unknown";
  // A balance actually drawn in the header is the thing M2 is about, whatever the product
  // sells in: on a money product that is the money the customer holds, not a mistake.
  if (headerBalance) return { applies: true, reason: "the header shows a balance: what it shows is checked" };
  if (m === "credits") return { applies: true, reason: `this product sells in credits (${model.why})` };
  if (m === "money") return { applies: false, reason: `this product sells in money, not credits (${model.why}) — a balance in a currency is what it should show` };
  return { applies: false, reason: "no amount was found on the pages read, so what the product sells in is not known" };
}
