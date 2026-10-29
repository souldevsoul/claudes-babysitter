// 5.5.0 — money that adds up (B4) and what a top-up dialog shows (2.14 placeholder, B4 number grouping): the Compass,
// Praxis and Kindred cards of the round that checks of the format alone (layout.js moneyIssues) could not see.
//   numberGrouping   one grouping separator for every amount and credit count ≥ 1,000 in one state ("6 000 credits"
//                    in the Add Credits dialog next to packs "1,000" / "2,500", Compass 6lyos0 / 5fgum8)
//   placeholderCut   an input's placeholder fits its field (2.14; Compass 7bouc8 / kdn5xf "Any whole amount, €1 to €17,8…")
//   moneyPairs       credits ↔ money pairs ("600–950 cr · €53.40–€84.60"), stated rates ("10 credits = €0.89"), bracket
//                    repeats, calculator labels — per page, per currency
//   conversionConflicts / rateMismatches / bracketRepeats / unconverted / entityPriceConflicts — the comparisons
// In-page parts need checks.install(page). Findings follow ../checks.js ({ what, where, selector, human }).
import { MONEY_SRC } from "./layout.js";

// case-sensitive on purpose: "KR" is a credits unit (Compass "600–950 KR"), "96.32 kr" is Swedish kronor
const CREDITS = "(?:[Cc]redits?|CREDITS?|[Cc][Rr]\\b|[Кк]редит\\p{L}*|КРЕДИТ\\p{L}*|[Kk]redit\\p{L}*|KREDIT\\p{L}*|KR\\b)";
// a credits count, or a range of them: "600–950 KR", "1,000 credits", "10 cr"
const CREDIT_SRC = `(?<![\\d.,])(?<c1>\\d{1,3}(?:[,.\\u00a0\\u202f ]\\d{3})+|\\d+)(?:\\s*[–—-]\\s*(?<c2>\\d{1,3}(?:[,.\\u00a0\\u202f ]\\d{3})+|\\d+))?\\s*${CREDITS}`;

/* ───────────── B4 one grouping separator (6lyos0, 5fgum8) ───────────── */
/**
 * Every number of 4+ integer digits that sits next to a currency or the word credits, in the visible page (an open
 * dialog included): the grouping separator it uses — comma, dot, space (U+0020 / U+00A0 / U+202F count as one),
 * apostrophe. Two kinds in one state is hard. A page that writes every number one way ("10 000", "1 000" in kk) passes.
 */
export const numberGrouping = (page) => page.evaluate(({ MONEY, CREDIT }) => {
  const W = window;
  const kinds = new Map();
  const reM = new RegExp(MONEY, "gu"), reC = new RegExp(CREDIT, "gu");
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && !n.parentElement.closest("script, style, noscript, template, code, pre, [aria-hidden=true]") ? 1 : 2 });
  const blocks = new Set();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (/\d/.test(n.nodeValue) && W.__uiVisible(n.parentElement)) blocks.add(n.parentElement.closest("p, li, td, th, button, label, span, div, dd, dt, h1, h2, h3, h4, strong, b") || n.parentElement);
  /* Grouping means the whole number is runs of exactly three: 20,000 / 1 234 567 / 1'000.
     ".*" let a sub-cent rate in, so "$0.000111" beside "$20,000" read as a page using two
     separators when the dot there is where the cents start (relaygpu, 2026-10: three findings,
     every one a rate below a cent). A decimal tail is allowed after the groups, on the other
     separator — "12,345.67" is grouped with a comma. */
  const kindOf = (num) => {
    const m = num.match(/^\d{1,3}([,.   '])(?:\d{3}\1)*\d{3}(?:([.,])\d+)?$/);
    if (!m || (m[2] && m[2] === m[1])) return null;
    return /[   ]/.test(m[1]) ? "space" : m[1] === "," ? "comma" : m[1] === "." ? "dot" : "apostrophe";
  };
  for (const b of blocks) {
    const t = (b.innerText || "").replace(/\s+/g, (s) => (/[  ]/.test(s) ? s : " "));
    if (t.length > 200) continue;
    const nums = [];
    for (const m of t.matchAll(reM)) nums.push((m.groups.n1 || m.groups.n2).replace(/[.,]\d{1,2}$/, ""));
    for (const m of t.matchAll(reC)) { nums.push(m.groups.c1); if (m.groups.c2) nums.push(m.groups.c2); }
    for (const num of nums) {
      const digits = num.replace(/\D/g, "");
      if (digits.length < 4) continue;
      const k = kindOf(num.trim());
      if (!k) continue;
      if (!kinds.has(k)) kinds.set(k, { raw: num.trim(), el: b, n: 0 });
      kinds.get(k).n++;
    }
  }
  if (kinds.size < 2) return [];
  const list = [...kinds.entries()].sort((x, y) => y[1].n - x[1].n);
  const [major, ...rest] = list;
  const name = { comma: "a comma", dot: "a dot", space: "a space", apostrophe: "an apostrophe" };
  return rest.map(([k, v]) => ({ what: `"${v.raw}" groups thousands with ${name[k]} while ${major[1].n} other amount(s) here use ${name[major[0]]} ("${major[1].raw}") — one number format for amounts and credit counts (format them with one helper) [B4]`, where: W.__uiDescribe(v.el), selector: W.__uiSelector(v.el), human: W.__uiHuman(v.el) }));
}, { MONEY: MONEY_SRC, CREDIT: CREDIT_SRC });

/* ───────────── 2.14 a placeholder fits its field (7bouc8, kdn5xf) ───────────── */
/**
 * An empty single-line field's placeholder, measured in the field's own font: wider than the content box → cut.
 * Search fields (the browser draws a clear button over them) and fields narrower than 40px are left out.
 */
export const placeholderCut = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  const ctx = document.createElement("canvas").getContext("2d");
  for (const el of Array.from(document.querySelectorAll("input[placeholder]"))) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (!/^(text|email|tel|url|number|password)$/.test(type) || el.value || !W.__uiVisible(el)) continue;
    const ph = el.getAttribute("placeholder") || "";
    if (ph.trim().length < 4) continue;
    const cs = getComputedStyle(el);
    const box = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (box < 40) continue;
    // ::placeholder may set its own font; the field's font is what it inherits by default
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ls = parseFloat(cs.letterSpacing) || 0;
    const w = ctx.measureText(ph).width + ls * ph.length;
    if (w > box + 2) {
      // what a reader sees: the characters that fit
      let k = ph.length; while (k > 1 && ctx.measureText(ph.slice(0, k)).width + ls * k > box) k--;
      out.push({ what: `placeholder cut: "${ph.slice(0, k)}…" of "${ph}" (${Math.round(w)}px in a ${Math.round(box)}px field) — shorten it, or move the rule into a hint under the field [2.14]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
  }
  return out;
});

/* ───────────── credits ↔ money on one page ───────────── */
/**
 * In-page: { pairs, rates, brackets, calculators } —
 *   pairs: the smallest blocks that hold a credits count (or range) and a money amount (or range), in reading order:
 *          { c1, c2, m1, m2, code, raw, discount, struck, where … }
 *   rates: "10 credits = €0.89", "€0.89 = 10 credits", "10 per €0.89", "Ten credits for €0.89" → { n, value, code, raw }
 *   brackets: a sentence whose (…) repeats the money of the sentence, or says "equivalent in <the same currency>"
 *   calculators: an amount field with a "Credits at N per <money>" label and the result it shows
 */
export const moneyPairs = (page, { scope = null } = {}) => page.evaluate(({ MONEY, CREDIT, scope }) => {
  const W = window;
  // the money pattern without its group names, to embed it more than once in one expression
  const MONEY_ANON = MONEY.replace(/\(\?<\w+>/g, "(?:");
  const root = (scope && document.querySelector(scope)) || document.body;
  const SYM = { "$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₸": "KZT", "₼": "AZN", "₽": "RUB", "zł": "PLN", "kr": "SEK" };
  const parse = (m) => { const g = m.groups; const mark = (g.pre || g.post).trim(); const num = g.n1 || g.n2; const dec = /[.,](\d{1,2})$/.exec(num); const int = (dec ? num.slice(0, -dec[0].length) : num).replace(/\D/g, ""); return { code: SYM[mark] || mark.toUpperCase(), value: parseFloat(int + (dec ? "." + dec[1] : "")), raw: m[0] }; };
  const cnum = (s) => (s ? parseInt(String(s).replace(/\D/g, ""), 10) : null);
  const at = (el) => ({ where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  const pairs = [], rates = [], brackets = [], calculators = [];
  const els = Array.from(root.querySelectorAll("p, li, tr, td, div, span, dd, article, section, label, button, a, h2, h3, h4"));
  const textOf = (e) => (e.innerText || "").replace(/\s+/g, " ").trim();
  const reM = () => new RegExp(MONEY, "gu"), reC = () => new RegExp(CREDIT, "gu");
  const isStruck = (e) => !!e.closest("s, del, strike") || /line-through/.test(getComputedStyle(e).textDecorationLine);
  // pairs: an element whose text holds both, and no child that holds both (the smallest)
  const both = (e) => { const t = textOf(e); return t.length <= 220 && reC().test(t) && reM().test(t); };
  const hits = els.filter((e) => W.__uiVisible(e) && !e.closest("script, style, [aria-hidden=true], input, textarea, select") && both(e));
  for (const e of hits) {
    if (hits.some((o) => o !== e && e.contains(o))) continue;
    const t = textOf(e);
    if (/=|\bper\b|\bfor\b/.test(t) && /^\D*\d+\s*(credits?|cr)\s*(=|for)\s*\S+\s*$/i.test(t)) continue; // a rate line on its own
    // "$5 /hr" and "$1 per 10 credits" are unit prices; "$48.50 / 500 credits" separates a price from its pack
    let ms = [...t.matchAll(reM())].filter((m) => !/^\s*(=|per\b|\/(?!\s*\d))/i.test(t.slice(m.index + m[0].length, m.index + m[0].length + 6)) && !/(per|\/)\s*$/i.test(t.slice(Math.max(0, m.index - 6), m.index)));
    const cs = [...t.matchAll(reC())];
    // a calculator line: "500 credits · discount −$4.00 · total price $46.00" — the total is the price
    if (ms.length > 1 && cs.length === 1 && !cs[0].groups.c2) { const tot = ms.filter((m) => /\btotal\b[^$€£\d]{0,20}$/i.test(t.slice(Math.max(0, m.index - 24), m.index))); ms = tot.length === 1 ? tot : ms.filter((m) => !/[−–-]\s*$/.test(t.slice(Math.max(0, m.index - 2), m.index))).slice(-1); }
    if (cs.length !== 1 || !ms.length || ms.length > 2) continue;
    const c = cs[0];
    if (/\b(per|\/)\s*$/i.test(t.slice(Math.max(0, c.index - 6), c.index))) continue; // "$1 per 10 credits"
    const m1 = parse(ms[0]), m2 = ms[1] ? parse(ms[1]) : null;
    if (m2 && m2.code !== m1.code) continue;
    // a range of money goes with a range of credits; two single amounts are a price and something else
    if (!!m2 !== !!c.groups.c2) continue;
    const moneyEls = Array.from(e.querySelectorAll("*")).filter((x) => reM().test(x.innerText || "") && !Array.from(x.children).some((y) => reM().test(y.innerText || "")));
    pairs.push({ c1: cnum(c.groups.c1), c2: cnum(c.groups.c2), m1: m1.value, m2: m2 ? m2.value : null, code: m1.code, raw: t.slice(0, 90), discount: /%|\b(off|save|saving|discount|bonus|скидк|endirim|жеңілдік)\b/i.test(t), struck: moneyEls.some(isStruck), ...at(e) });
  }
  // stated rates
  const RATE = new RegExp(`(?<n>\\d+)\\s*(?:credits?|cr)\\s*(?:=|for|per)\\s*(?<money>${MONEY_ANON})|(?<money2>${MONEY_ANON})\\s*=\\s*(?<n2>\\d+)\\s*(?:credits?|cr)|(?:credits? at\\s*)?(?<n3>\\d+)\\s*per\\s*(?<money3>${MONEY_ANON})`, "giu");
  const seenRate = new Set();
  for (const e of els) {
    if (!W.__uiVisible(e) || Array.from(e.children).some((x) => (x.innerText || "").trim() === textOf(e))) continue;
    const t = textOf(e);
    if (t.length > 160) continue;
    for (const m of t.matchAll(RATE)) {
      const g = m.groups; const n = parseInt(g.n || g.n2 || g.n3, 10); const mm = new RegExp(MONEY, "u").exec(g.money || g.money2 || g.money3);
      if (!mm || !n) continue;
      const p = parse(mm);
      const k = `${n}|${p.code}|${p.value}`;
      if (seenRate.has(k)) continue;
      seenRate.add(k);
      rates.push({ n, value: p.value, code: p.code, raw: m[0], ...at(e) });
    }
  }
  // bracket repeats: "from €5 to €20,000 (€5 to €20,000, or the equivalent in US dollars)" in EUR
  for (const e of Array.from(root.querySelectorAll("p, li, dd, span, div"))) {
    if (!W.__uiVisible(e) || Array.from(e.children).some((x) => /\(/.test(x.innerText || "") && (x.innerText || "").length >= (e.innerText || "").length - 2)) continue;
    const t = textOf(e);
    if (t.length > 400) continue;
    for (const b of t.matchAll(/\(([^()]{3,140})\)/g)) {
      const inner = [...b[1].matchAll(reM())].map(parse), outer = [...(t.slice(0, b.index) + t.slice(b.index + b[0].length)).matchAll(reM())].map(parse);
      if (!inner.length || !outer.length) continue;
      const same = inner.length === outer.length && inner.every((x, i) => x.code === outer[i].code && x.value === outer[i].value);
      if (same) brackets.push({ what: `the bracket repeats the amounts it explains ("${b[0].slice(0, 80)}") — show the other currency's amounts there [B4]`, ...at(e) });
    }
  }
  // calculators: an amount field next to "Credits at N per <money>" and the number it shows
  for (const input of Array.from(root.querySelectorAll("input"))) {
    if (!W.__uiVisible(input) || !/^(number|text|tel)?$/.test(input.getAttribute("type") || "")) continue;
    let box = input.parentElement; for (let i = 0; i < 4 && box && !/per\s/i.test(box.innerText || ""); i++) box = box.parentElement;
    if (!box) continue;
    const m = new RegExp(`(?<n>\\d+)\\s*per\\s*(?<money>${MONEY_ANON})`, "u").exec((box.innerText || "").replace(/\s+/g, " "));
    if (!m) continue;
    const p = parse(new RegExp(MONEY, "u").exec(m.groups.money));
    input.setAttribute("data-bs-calc", String(calculators.length));
    box.setAttribute("data-bs-calc-box", String(calculators.length));
    calculators.push({ n: parseInt(m.groups.n, 10), value: p.value, code: p.code, raw: m[0], min: Number(input.min) || null, max: Number(input.max) || null, ...at(input) });
  }
  return { pairs, rates, brackets, calculators };
}, { MONEY: MONEY_SRC, CREDIT: CREDIT_SRC, scope });

const r2 = (x) => Math.round(x * 100) / 100;
const key = (p) => `${p.code}|${p.c1}${p.c2 ? `-${p.c2}` : ""}`;
const show = (p) => (p.m2 != null ? `${p.m1}–${p.m2}` : `${p.m1}`);

/**
 * B4 one conversion everywhere (Compass 5nel9b, 84u591, xivil1): the same credits (or range of credits) priced in
 * one currency with two different amounts, across pages and states. `records`: [{ place, pairs }]. Struck-through
 * (old) prices are left out.
 */
export function conversionConflicts(records) {
  const by = new Map();
  for (const r of records) for (const p of r.pairs || []) {
    if (p.struck) continue;
    const k = key(p);
    if (!by.has(k)) by.set(k, new Map());
    const vals = by.get(k), v = show(p);
    if (!vals.has(v)) vals.set(v, []);
    vals.get(v).push({ ...p, place: r.place });
  }
  const out = [];
  for (const [k, vals] of by) {
    if (vals.size < 2) continue;
    const [code, credits] = k.split("|");
    const list = [...vals.entries()].sort((a, b) => b[1].length - a[1].length);
    const places = list.map(([v, ps]) => `${code} ${v} on ${[...new Set(ps.map((p) => p.place))].slice(0, 3).join(", ")}`).join("; ");
    out.push({ what: `${credits} credits cost ${vals.size} different amounts in ${code}: ${places} — one price per pack / range everywhere (compute it in one place) [B4]`, where: list[1][1][0].where, selector: list[1][1][0].selector, human: list[1][1][0].human });
  }
  return out;
}

/**
 * B4 the stated rate reproduces the prices (Praxis 3v7u9n, Compass 3iey9d): with "10 credits = €0.89" on screen, a pair
 * "800 credits €71.33" should be 800 × 0.89 / 10 = €71.20. Discounted packs ("save 8%", "10% off") are left out.
 */
export function rateMismatches({ pairs = [], rates = [] }) {
  const out = [];
  for (const rate of rates) {
    for (const p of pairs) {
      if (p.code !== rate.code || p.discount || p.struck || p.c1 === rate.n) continue;
      const exp = [r2((p.c1 * rate.value) / rate.n), p.c2 != null ? r2((p.c2 * rate.value) / rate.n) : null];
      const off = Math.abs(p.m1 - exp[0]) > 0.005 || (p.m2 != null && exp[1] != null && Math.abs(p.m2 - exp[1]) > 0.005);
      if (!off) continue;
      out.push({ what: `"${p.raw.slice(0, 60)}" does not follow the rate on screen "${rate.raw}": ${p.c1}${p.c2 ? `–${p.c2}` : ""} credits at that rate are ${rate.code} ${exp[0].toFixed(2)}${exp[1] != null ? `–${exp[1].toFixed(2)}` : ""}, not ${show(p)} — show the rate the prices are computed with (or compute the prices from the rate shown) [B4]`, where: p.where, selector: p.selector, human: p.human });
    }
  }
  return out;
}

/**
 * B4 after a currency switch, an amount that kept the base currency's number while the others were converted
 * (Compass b2950h / 9n16n2: "from $1 to $20,000" → "from €1 to €20,000"). `base` and `now`: money tokens of one page
 * in reading order ({ raw }), parsed with `parse` (layout.parseMoney). Amounts under 10 are left out (€1 = $1 by rounding).
 */
export function unconverted(base, now, parse, label = "") {
  const a = base.map((t) => ({ t, p: parse(t.raw) })).filter((x) => x.p), b = now.map((t) => ({ t, p: parse(t.raw) })).filter((x) => x.p);
  if (a.length !== b.length || a.length < 3) return [];
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x.p.code !== y.p.code);
  if (pairs.length < 3) return [];
  const changed = pairs.filter(([x, y]) => x.p.value !== y.p.value);
  if (changed.length / pairs.length < 0.6) return []; // nothing was converted: a symbol swap of the whole page is another finding
  return pairs.filter(([x, y]) => x.p.value === y.p.value && x.p.value >= 10).map(([x, y]) => ({ what: `${label ? `${label}: ` : ""}"${y.p.raw}" is the ${x.p.code} number "${x.p.raw}" with another symbol — every other amount here was converted; convert it (or say it is fixed in ${x.p.code}) [B4]`, where: y.t.where, selector: y.t.selector, human: y.t.human }));
}

/** B4: brackets and calculators read by moneyPairs, as findings. The calculator is typed into: see calculatorCheck. */
export const bracketRepeats = (r) => r.brackets || [];

/**
 * B4 the calculator follows its own label (Praxis 0a32tm: "Credits at 10 per €0.89", 6260 → 70,206 instead of 70,337).
 * Types a round amount into each calculator moneyPairs found and reads the credits number it shows; ±1 credit.
 */
export async function calculatorCheck(page, calcs) {
  const out = [];
  for (const [i, c] of (calcs || []).entries()) {
    const input = page.locator(`[data-bs-calc="${i}"]`).first();
    const v = Math.max(c.min || 0, Math.min(c.max || 1000, 1000));
    await input.fill(String(v), { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(500);
    const shown = await page.locator(`[data-bs-calc-box="${i}"]`).first().evaluate((box, v) => {
      const t = (box.innerText || "").replace(/\s+/g, " ");
      const nums = [...t.matchAll(/(\d{1,3}(?:[,.   ]\d{3})+|\d{3,})\s*(?:credits?|cr\b|кредит|kredit)?/gi)].map((m) => parseInt(m[1].replace(/\D/g, ""), 10)).filter((n) => n !== v);
      return nums;
    }, v).catch(() => []);
    const exp = (v / c.value) * c.n;
    if (!shown.length) continue;
    const best = shown.reduce((x, y) => (Math.abs(y - exp) < Math.abs(x - exp) ? y : x));
    // ±1 credit for rounding; the label's own rounding (€0.89 for €0.8909, 0.1 %) is the defect, not a tolerance
    if (Math.abs(best - exp) > Math.max(1, exp * 0.0002) && Math.abs(best - exp) < exp * 0.2)
      out.push({ what: `the calculator says "${c.raw}", but ${c.code} ${v} gives ${best.toLocaleString("en-US")} credits — by that label it is ${Math.floor(exp).toLocaleString("en-US")}; compute with the rate shown, or show the exact rate [B4]`, where: c.where, selector: c.selector, human: c.human });
  }
  return out;
}

/* ───────────── one price, one unit (zcg5fp) ───────────── */
/**
 * In-page: entities (cards, rows) with a short name and a price with its unit: { name, n, unit: "credits" | <code>,
 * per: "hr" | "task" | … }.
 */
export const entityPrices = (page) => page.evaluate(({ MONEY }) => {
  const W = window;
  const out = [];
  const PRICE = new RegExp(`(?:(?<money>${MONEY.replace(/\(\?<\w+>/g, "(?:")})|(?<cr>\\d[\\d,]*)\\s*(?:credits?|cr|kr)\\b)\\s*(?:\\/|per)\\s*(?<per>hr|hour|h|task|job|project|day|session)\\b`, "giu");
  for (const card of Array.from(document.querySelectorAll("li, article, tr, [class*=card i], a[href]"))) {
    if (!W.__uiVisible(card)) continue;
    const t = (card.innerText || "").replace(/\s+/g, " ").trim();
    if (t.length > 300) continue;
    const nameEl = card.querySelector("h2, h3, h4, strong, [class*=name i]");
    const name = nameEl ? (nameEl.innerText || "").trim() : "";
    if (!name || name.length > 40 || /\d/.test(name)) continue;
    const ms = [...t.matchAll(PRICE)];
    if (ms.length !== 1) continue;
    const g = ms[0].groups;
    let n, unit;
    if (g.money) { const mm = new RegExp(MONEY, "u").exec(g.money); const num = mm.groups.n1 || mm.groups.n2; n = parseFloat(num.replace(/,/g, "")); unit = (mm.groups.pre || mm.groups.post).trim(); }
    else { n = parseFloat(g.cr.replace(/,/g, "")); unit = "credits"; }
    out.push({ name, n, unit, per: g.per.toLowerCase().replace(/^(h|hour)$/, "hr"), raw: ms[0][0], where: W.__uiDescribe(card), selector: W.__uiSelector(card), human: W.__uiHuman(card) });
  }
  // nested cards: keep the innermost per name
  return out.filter((x, i) => !out.some((y, j) => j !== i && y.name === x.name && y.raw === x.raw && x.where.length < y.where.length));
}, { MONEY: MONEY_SRC });

/** B4: one entity priced in two units (credits / money) or per two things (hour / task) on two pages. records: [{ place, prices }] */
export function entityPriceConflicts(records) {
  const by = new Map();
  for (const r of records) for (const e of r.prices || []) { const k = e.name.toLowerCase(); if (!by.has(k)) by.set(k, []); by.get(k).push({ ...e, place: r.place }); }
  const out = [];
  for (const [, list] of by) {
    const forms = new Map();
    for (const e of list) { const f = `${e.unit}/${e.per}`; if (!forms.has(f)) forms.set(f, e); }
    if (forms.size < 2) continue;
    const ex = [...forms.values()];
    if (!ex.every((e) => e.n === ex[0].n) && new Set(ex.map((e) => e.per)).size < 2) continue; // a different number in the same unit is CT18's
    out.push({ what: `${ex[0].name} is priced "${ex[0].raw}" on ${ex[0].place} and "${ex[1].raw}" on ${ex[1].place} — one unit (credits or money) and one basis (per hour / per task) for one rate [B4]`, where: ex[1].where, selector: ex[1].selector, human: ex[1].human });
  }
  return out;
}
