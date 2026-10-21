// Site-wide copy consistency (CT19–CT22, docs/checks-content.md): one concept, one name; one policy, one set of
// facts; one destination, one label; no page named that does not exist. Pure functions over records that both
// halves build — `babysitter content` from the source (lib/content-site.js) and content.spec from the rendered
// crawl (playwright/checks/content.js) — so the same rules give the same answer on any product.
//
// Input records (every one carries `where`: "app/terms/page.tsx:12" or `/pricing "…quote…"`, plus file/line when static):
//   texts:   { text, kind: "heading" | "button" | "nav" | "title" | "body", locale, where, file?, line? }
//   links:   { path, label, region: "nav" | "footer" | "body", where, file?, line? }   (internal links only)
//   pages:   { path, names: [h1 / title parts / heading props], where }
//   actions: { key, label, where, file?, line? }                                      (static: buttons that open the same thing)
// Output: groups — one per concept / fact / destination / unknown name — with every location and the fix:
//   { id, rule, concept, dominant, variants: [{ value, count, at: [loc] }], what, fix, report: [loc] }
// `report` are the locations to change (the minority variants): static turns each into a file:line problem.
import { legalFamily, isFrench } from "./content-rules.js";

const EMAIL_RE = /(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])/g;
const q = (s, n = 70) => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lang = (l) => String(l || "").toLowerCase().split(/[-_]/)[0];
const isEnglish = (l) => !l || lang(l) === "en";

/** copy with what is not prose taken out: URLs, emails, {placeholders}, inline code markers; `quotes` drops quoted passages too */
export function prose(text, { quotes = false } = {}) {
  let t = String(text || "").replace(/https?:\/\/\S+|www\.\S+/g, " ").replace(EMAIL_RE, " ").replace(/\{[^{}]*\}/g, " ").replace(/`[^`]*`/g, " ");
  if (quotes) t = t.replace(/“[^”]{0,200}”|"[^"]{0,200}"|«[^»]{0,200}»|„[^“”]{0,200}[“”]|‘[^’]{0,200}’(?!\w)/g, " ");
  return t;
}
const sentences = (t) => String(t).split(/(?<=[.!?;])\s+|\n+|\s+•\s+/).map((s) => s.trim()).filter(Boolean);

/* ───────────────────────── CT19 terminology drift ───────────────────────── */
// A singular role word is a noun when what follows it is not another noun ("an expert review" is an adjective,
// "an expert will reply" / "your specialist." / "the expert's" are the role).
const AFTER_NOUN = /^(?:$|[.,;:!?)\]—–/-]|['’]s\b|(?:who|whom|whose|that|which|will|would|can|could|may|might|must|should|shall|is|are|was|were|has|have|had|does|do|did|to|for|in|on|at|with|from|of|by|you|your|we|our|they|their|it|as|than|if|when|before|after|then|here|there|instead|directly|first|now|today|yet|also|only|again|within|via|about|until|once|while|reviews|checks|reads|works|replies|answers|responds|accepts|delivers|sends|takes|gets|receives|writes|joins|starts|finishes|completes|confirms|sees|picks|leaves)\b)/i;
// a word with other senses (a reviewer who reads applications, a translator that is the AI) is the role only when it is hired / assigned / paid
const ROLE_CONTEXT = /\b(hire[sd]?|hiring|book(ed|s)?|assigned|match(ed|es)? (?:you )?with|vetted|verified|become an?|join as|work(s|ed)? with|payouts?|earn\w*|marketplace|top-rated|rated)\b/i;
const NOT_PROVIDER_CLOSE = /\b(?:we|you|they)\s+(?:may|can|will|might|could|reserve the right to|have the right to)\s+(?:\w+\s+(?:or|and)\s+)?$|\b(?:we|you|they)\s+(?:\w+\s+(?:or|and)\s+)?$|\bsuspend\w*\s+(?:or|and)\s+$|\b(?:may|might|can|will)\s+be\s+$/i;
const ROLE_NOUN = (word) => ({ term: word, re: new RegExp(`\\b${word}(s)?\\b`, "gi"), noun: true });

/**
 * Built-in groups: a concept and the competing names for it. `noun`: a singular match must read as a noun;
 * `weak`: counted only in a sentence about the role (hire / assign / verified …), a word with other senses;
 * `keep(sentence, index, match)`: false drops a match (another sense of the word).
 */
export const TERM_GROUPS = [
  {
    concept: "role", about: "the person who does the work", locale: "en",
    members: [
      ROLE_NOUN("specialist"), ROLE_NOUN("expert"), ROLE_NOUN("executor"), ROLE_NOUN("freelancer"), ROLE_NOUN("professional"),
      { term: "contractor", re: /\bcontractors?\b/gi, noun: true, keep: (s, i) => !/\b(independent|sub|general)[- ]?$/i.test(s.slice(Math.max(0, i - 13), i)) },
      // "pro" only as a lowercase noun after a determiner: "Pro" is a plan, "pros and cons", "pro rata", "pro tip" are not the role
      { term: "pro", re: /\b(?<=(?:\b(?:a|the|our|your|each|every|any|one|another|vetted|verified|top|local)\s))pros?\b(?![- ](?:rata|bono|forma|tip))/g, noun: true, keep: (s, i, m) => !/^pros\s+and\s+cons/i.test(s.slice(i)) && m[0] === m[0].toLowerCase() },
      { term: "translator", re: /\btranslators?\b/gi, noun: true, weak: true },
      { term: "reviewer", re: /\breviewers?\b/gi, noun: true, weak: true },
    ],
  },
  {
    concept: "account deletion", about: "removing the account", locale: "en",
    members: [
      ["delete", "delet(?:e|es|ed|ing|ion)"], ["close", "clos(?:e|es|ed|ing|ure)"], ["remove", "remov(?:e|es|ed|ing|al)"], ["deactivate", "deactivat(?:e|es|ed|ing|ion)"],
      ["erase", "eras(?:e|es|ed|ing|ure)"], ["cancel", "cancel(?:s|led|ed|ling|ing|lation)?"],
    ].map(([term, verb]) => ({
      term,
      re: new RegExp(`\\b${verb}\\s+(?:(?:of|your|my|the|their|this|an|a|own|user|customer|whole|entire|personal)\\s+){0,3}accounts?\\b(?!\\s+(?:data|details|information|settings|page|history|balance)\\b)|\\baccounts?\\s+${verb.replace(/\(\?:.*\)\??$/, "")}(?:ion|ure|al|lation)\\b`, "gi"),
      // "we may suspend or close your account" is the provider ending it — another concept
      keep: (s, i) => !NOT_PROVIDER_CLOSE.test(s.slice(Math.max(0, i - 60), i)) || /\byou\s+(?:can|may)\s+$/i.test(s.slice(Math.max(0, i - 12), i)),
    })),
  },
  {
    concept: "refund", about: "giving the money back", locale: "en",
    members: [
      { term: "refund", re: /\brefund(?:s|ed|ing|able)?\b/gi },
      { term: "money back", re: /\bmoney[- ]back\b|\b(?:get|have|give|send)\s+(?:your|the|their)\s+money\s+back\b/gi },
      { term: "reimbursement", re: /\breimburs(?:e|es|ed|ing|ement|ements)\b/gi },
      { term: "return of funds", re: /\breturn(?:s|ed|ing)?\s+(?:of\s+)?(?:your\s+|the\s+)?(?:funds|money|payment)\b/gi },
      // a chargeback is the bank's dispute process — a different concept, unless it is used for the shop's own refund
            // a chargeback is the bank's dispute process — another concept — unless the shop says it gives one ("we issue a chargeback")
      { term: "chargeback", re: /\bcharge-?backs?\b/gi, keep: (s) => /\b(we|us|our team)\b[^.]{0,30}\b(issue|process|give|send|make|grant|pay)\w*\b[^.]{0,20}\bcharge-?back|\bcharge-?backs?\s+(?:from|by)\s+(?:us|our)\b/i.test(s) && !/\b(bank|issuer|card (?:company|provider|scheme|network)|dispute|fraud|payment (?:provider|processor)s?)\b/i.test(s) },
    ],
  },
  {
    concept: "card payment", about: "the card a customer pays with", locale: "en",
    members: [
      { term: "credit or debit card", re: /\b(?:credit|debit)\s*(?:or|\/|and|&)\s*(?:credit|debit)\s+cards?\b/gi },
      { term: "credit card", re: /\bcredit[- ]cards?\b/gi },
      { term: "debit card", re: /\bdebit[- ]cards?\b/gi },
      { term: "bank card", re: /\bbank[- ]cards?\b/gi },
      { term: "payment card", re: /\bpayment[- ]cards?\b/gi },
    ],
  },
  ...[
    ["euro", "EUR", /\beuros?\b/gi],
    ["pound sterling", "GBP", /\b(?:pounds?\s+sterling|sterling|british\s+pounds?|pounds?)\b(?!\s+(?:of|per)\b)/gi],
    ["US dollar", "USD", /\b(?:US\s+|U\.S\.\s+|american\s+)?dollars?\b/gi],
  ].map(([name, code, word]) => ({
    concept: `currency: ${name}`, about: `how the ${name} is named in prose`, locale: "en", prose: true,
    members: [
      // a code in a list of codes ("USD, EUR, PLN") or alone on a selector is a code, not prose naming
      { term: code, re: new RegExp(`(?<![\\d.,]\\s?)\\b${code}\\b(?!\\s?\\d)`, "g"), keep: (s, i) => s.trim() !== code && !/\b[A-Z]{3}\b\s*(?:,|\/|or|and)\s*$/.test(s.slice(Math.max(0, i - 12), i)) && !/^\s*(?:,|\/|or|and)\s*\b[A-Z]{3}\b/.test(s.slice(i + 3, i + 15)) },
      { term: name === "US dollar" ? "dollars" : name === "euro" ? "euros" : "pounds", re: word },
    ],
  })),
  // French: the role and closing the account (optional groups; other languages are never matched against English)
  {
    concept: "role", about: "la personne qui fait le travail", locale: "fr",
    members: [
      { term: "spécialiste", re: /(?<![\p{L}])spécialistes?(?![\p{L}])/giu, noun: false },
      { term: "expert", re: /(?<![\p{L}])(?:un|une|les|des|l['’]|notre|nos|votre|vos|cet|cette)\s*expert(?:e)?s?(?![\p{L}])/giu },
      { term: "prestataire", re: /(?<![\p{L}])prestataires?(?![\p{L}])/giu },
      { term: "freelance", re: /(?<![\p{L}])(?:un|une|les|des|le|la|notre|nos|votre|vos)\s+freelances?(?![\p{L}])/giu },
      { term: "exécutant", re: /(?<![\p{L}])exécutant(?:e)?s?(?![\p{L}])/giu },
    ],
  },
  {
    concept: "account deletion", about: "supprimer le compte", locale: "fr",
    members: [["supprimer", "suppr\\p{L}*"], ["fermer", "ferm\\p{L}*"], ["désactiver", "désactiv\\p{L}*"], ["clôturer", "clôtur\\p{L}*"], ["résilier", "résili\\p{L}*"]].map(([term, verb]) => ({
      term, re: new RegExp(`(?<![\\p{L}])${verb}\\s+(?:(?:de|du|votre|mon|le|son|leur|d['’]un)\\s*){0,2}compte(?![\\p{L}])`, "giu"),
      keep: (s, i) => !/\bnous\s+(?:pouvons|pourrons|pourrions)\s+(?:\p{L}+\s+(?:ou|et)\s+)?$/iu.test(s.slice(Math.max(0, i - 50), i)),
    })),
  },
];

/** the groups in force for a product: built-ins, content.termGroups (concept → [variants] adds or replaces, false drops) */
export function termGroups(cc = {}) {
  const extra = cc.termGroups || {};
  const groups = TERM_GROUPS.filter((g) => !(g.concept in extra) || (extra[g.concept] !== false && !Array.isArray(extra[g.concept])));
  for (const [concept, variants] of Object.entries(extra)) {
    if (!Array.isArray(variants) || variants.length < 2) continue;
    groups.push({ concept, about: "configured in content.termGroups", locale: "en", custom: true,
      members: variants.map((v) => ({ term: v, re: new RegExp(`(?<![\\p{L}\\d])${esc(v).replace(/\\? /g, "[\\s-]+")}(?![\\p{L}\\d])`, "giu") })) });
  }
  return groups;
}

/** every use of a group's members in one text: [{ term, index, match }] — longer members win an overlap */
export function termUses(group, text) {
  const t = prose(text, { quotes: true });
  const out = [];
  for (const s of sentences(t)) {
    const base = t.indexOf(s);
    const taken = [];
    for (const m of group.members) {
      if (m.weak && !ROLE_CONTEXT.test(s)) continue;
      m.re.lastIndex = 0;
      for (let x = m.re.exec(s); x; x = m.re.exec(s)) {
        const a = x.index, b = a + x[0].length;
        if (taken.some(([p, r]) => a < r && b > p)) continue;
        if (m.keep && !m.keep(s, a, x)) continue;
        if (m.noun && !/s$/i.test(x[0]) && !AFTER_NOUN.test(s.slice(b).trimStart())) continue;
        taken.push([a, b]);
        out.push({ term: m.term, index: base + a, match: x[0] });
      }
    }
  }
  return out;
}

const matchesAllow = (allow, term, concept, where) => (allow || []).some((a) => {
  if (typeof a === "string") return a.toLowerCase() === term.toLowerCase();
  if (a.concept && a.concept !== concept) return false;
  if (a.term && a.term.toLowerCase() !== term.toLowerCase()) return false;
  if (a.where && !new RegExp(a.where, "i").test(where)) return false;
  return !!(a.term || a.concept);
});

/**
 * CT19 — one concept, one name, per language: each built-in / configured group where 2+ names are used. The dominant
 * name is the glossary's preferred term (content.glossary) when it is one of them, else the most used one. Variants the
 * glossary bans are left to CT17 (reported there already); content.termAllow drops a term (with a reason).
 */
export function termDrift(texts, cc = {}) {
  const out = [];
  const glossary = cc.glossary || {};
  for (const g of termGroups(cc)) {
    const byLocale = new Map();
    for (const x of texts) {
      const loc = lang(x.locale) || "en";
      if (loc !== g.locale) continue;
      for (const u of termUses(g, x.text)) {
        if (matchesAllow(cc.termAllow, u.term, g.concept, x.where)) continue;
        const m = byLocale.get(loc) || byLocale.set(loc, new Map()).get(loc);
        (m.get(u.term) || m.set(u.term, []).get(u.term)).push({ ...x, match: u.match, quote: q(around(x.text, u.index), 80) });
      }
    }
    for (const [loc, used] of byLocale) {
      if (used.size < 2) continue;
      // glossary: preferred → banned. A preferred term that is a member decides; banned members are CT17's
      const prefer = Object.keys(glossary).find((p) => used.has(p) || g.members.some((m) => m.term.toLowerCase() === p.toLowerCase()));
      const banned = new Set(prefer ? (glossary[prefer] || []).map((v) => v.toLowerCase()) : []);
      const variants = [...used].map(([value, at]) => ({ value, count: at.length, at })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      const dominant = prefer ? g.members.find((m) => m.term.toLowerCase() === prefer.toLowerCase())?.term || prefer : variants[0].value;
      const tie = !prefer && variants.length > 1 && variants[0].count === variants[1].count;
      const minority = variants.filter((v) => v.value !== dominant && !banned.has(v.value.toLowerCase()));
      if (!minority.length) continue;
      const tag = loc === "en" ? "" : ` [${loc}]`;
      const list = variants.map((v) => `"${v.value}" ${v.count}×`).join(", ");
      for (const v of minority) out.push({
        id: "CT19", rule: "content/term-drift", concept: g.concept, locale: loc, dominant, tie, variants, variant: v.value,
        what: `${g.concept}${tag} (${g.about}) is named ${variants.length} ways: ${list}${tie ? " — no clear majority" : ""}; "${v.value}" at ${v.at.slice(0, 4).map((a) => a.where).join(", ")}${v.at.length > 4 ? ` +${v.at.length - 4}` : ""}`,
        fix: tie ? `pick one name for ${g.concept} (content.glossary: { "<preferred>": [<the others>] }) and use it everywhere` : `replace "${v.value}" with "${dominant}"${prefer ? " (content.glossary)" : ` (used ${variants.find((x) => x.value === dominant)?.count ?? 0}× elsewhere)`} — ${v.at.length} place(s); or allow it with a reason in content.termAllow`,
        report: v.at,
      });
    }
  }
  return out;
}
const around = (t, i, r = 36) => (i > r ? "…" : "") + String(t).slice(Math.max(0, i - r), i + r) + (i + r < String(t).length ? "…" : "");

/* ───────────────────────── CT20 conflicting policy statements ───────────────────────── */
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
const NUM = `(\\d+|${Object.keys(NUM_WORDS).join("|")})`;
const DURATION = new RegExp(`\\b${NUM}(?:\\s?(?:–|-|to|and)\\s?${NUM})?(?:\\s|-)?(?:\\((?:\\d+)\\)\\s)?(business |working |calendar )?(day|hour|week|month|year)s?\\b`, "gi");
const n = (x) => (x == null ? null : /^\d+$/.test(x) ? Number(x) : NUM_WORDS[x.toLowerCase()]);

export const POLICY_TOPICS = [
  { topic: "refund", re: /\brefund\w*|\bmoney[- ]back\b|\breimburs\w*|\bcooling[- ]off\b|\bright of withdrawal\b/i },
  { topic: "account deletion", re: /\b(delet\w*|clos\w*|eras\w*|remov\w*|deactivat\w*)\s+(?:\w+\s+){0,2}accounts?\b|\baccounts?\s+(deletion|closure|removal|erasure)\b/i },
  { topic: "retention", re: /\b(retain\w*|retention|kept|keep|keeps|store[sd]?|storing|hold|held|archive[sd]?)\b/i },
  { topic: "payment methods", re: /\b(we accept|accepted|accepts|accepting|pay (?:with|by|using|via)|payment methods?|ways to pay|you can pay|we take|supported (?:cards|payment))\b/i },
  { topic: "currencies", re: /\b(currenc(?:y|ies)|pay in|paid in|prices? (?:are )?(?:shown |displayed |listed |quoted |set )?in|charged in|billed in|priced in|settled in)\b/i },
];
// which clock a number is on: the window the customer has, or how long the shop takes
const PROCESSING = /\b(process\w*|issued?|credited|credit(?:s)? back|appear\w*|arriv\w*|takes?|reach(?:es)?|receive|returned? to|back (?:on|to) (?:your|the) (?:card|account)|we (?:will )?refund|land|show up|post(?:ed)?)\b/i;
const DATA_OBJECT = [
  ["financial records", /\b(invoices?|billing|transactions?|financial|tax|accounting|purchase history|payment records?)\b/i],
  ["logs", /\b(logs?|log files)\b/i],
  ["backups", /\bbackups?\b/i],
  ["files", /\b(videos?|files?|uploads?|media|recordings?|audio|dubs?|translations?)\b/i],
];
export const PAYMENT_BRANDS = [
  ["Visa", /\bVisa\b/], ["Mastercard", /\bMaster ?[Cc]ard\b/], ["Maestro", /\bMaestro\b/], ["American Express", /\bAmerican Express\b|\bAmex\b|\bAMEX\b/],
  ["Discover", /\bDiscover(?= (?:card|cards)\b|,| and| or|\.|$)/], ["JCB", /\bJCB\b/], ["UnionPay", /\bUnion ?Pay\b/], ["Diners Club", /\bDiners(?: Club)?\b/],
  ["Apple Pay", /\bApple ?Pay\b/], ["Google Pay", /\bGoogle ?Pay\b|\bG ?Pay\b/], ["PayPal", /\bPay[Pp]al\b/], ["SEPA", /\bSEPA\b/],
  ["bank transfer", /\bbank (?:transfer|wire)s?\b|\bwire transfers?\b/i], ["crypto", /\bcrypto(?:currenc(?:y|ies))?\b|\bBitcoin\b|\bUSDT\b/i],
];
const CURRENCIES = [
  ["GBP", /\bGBP\b|£|\bpounds?(?:\s+sterling)?\b|\bsterling\b/i], ["EUR", /\bEUR\b|€|\beuros?\b/i], ["USD", /\bUSD\b|US\$|\bUS dollars?\b|\bdollars?\b/i],
  ["CAD", /\bCAD\b|C\$/], ["PLN", /\bPLN\b|\bzł|\bzloty\b|\bzłoty\b/i], ["SEK", /\bSEK\b|Swedish kron/i], ["NOK", /\bNOK\b/], ["DKK", /\bDKK\b/], ["CZK", /\bCZK\b/], ["TRY", /\bTRY\b(?![a-z])|Turkish lira/], ["INR", /\bINR\b|₹|\brupees?\b/i], ["AUD", /\bAUD\b|A\$/], ["CHF", /\bCHF\b|Swiss francs?/i], ["JPY", /\bJPY\b|¥|\byen\b/i], ["KZT", /\bKZT\b|₸|\btenge\b/i], ["AZN", /\bAZN\b|₼|\bmanat\b/i], ["RUB", /\bRUB\b|₽|\broubles?\b|\brubles?\b/i],
];
const AMOUNT = [["USD", /(?:US)?\$\s?\d/g], ["EUR", /€\s?\d|\b\d[\d.,]*\s?(?:€|EUR\b)/g], ["GBP", /£\s?\d|\b\d[\d.,]*\s?GBP\b/g], ["USD", /\b\d[\d.,]*\s?USD\b/g]];

/** Facts in one text: [{ topic, fact, value, quote, index }]. English sentences only. */
export function policyFacts(text) {
  const out = [];
  const t = prose(text);
  for (const s of sentences(t)) {
    if (s.length > 420) continue;
    const topics = POLICY_TOPICS.filter((p) => p.re.test(s)).map((p) => p.topic);
    if (!topics.length) continue;
    const neg = /\b(not|n't|never|no longer|except)\b/i.test(s);
    // durations: refund window / processing time, deletion time, retention of a kind of data
    DURATION.lastIndex = 0;
    for (let m = DURATION.exec(s); m; m = DURATION.exec(s)) {
      const a = n(m[1]), b = n(m[2]);
      if (a == null) continue;
      let unit = (m[3] ? `${m[3].trim()} ` : "") + m[4].toLowerCase() + "s";
      let lo = a, hi = b ?? a;
      const min = /\b(at least|a minimum of|minimum|no less than|not less than)\s*$/i.test(s.slice(Math.max(0, m.index - 22), m.index));
      if (unit === "weeks") { lo *= 7; hi *= 7; unit = "days"; }
      const value = lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`;
      const before = s.slice(Math.max(0, m.index - 45), m.index);
      const after = s.slice(m.index, m.index + m[0].length + 40);
      // "in the last 12 months", "for 3 years after", "up to 2 hours of video" — a number that is not this policy's clock
      if (/\b(video|minutes? of|hours? of|languages?|credits?|old|aged?|age of|years? of age)\b/i.test(after.slice(m[0].length, m[0].length + 14)) && unit === "hours") continue;
      for (const topic of topics) {
        let fact = null;
        // the statutory 14-day right of withdrawal is its own clock, not the shop's refund window
        if (topic === "refund" && unit !== "years") fact = /^[^.;]{0,30}\b(right of withdrawal|withdrawal (?:period|right)|cooling[- ]off)/i.test(s.slice(m.index)) || /\b(withdraw\w*|cooling[- ]off)\b[^.;]{0,25}$/i.test(before) ? "withdrawal period" : PROCESSING.test(before) || /\b(to (?:arrive|appear|process)|for the (?:money|refund) to)\b/i.test(after) ? "refund processing time" : "refund window";
        else if (topic === "account deletion" && /\b(delet|eras|remov|clos)\w*\b/i.test(before + after) && !/\b(retain|keep|kept|store)/i.test(before)) fact = "account deletion time";
        else if (topic === "retention" && /\b(for|up to|at least|retain\w* for|kept for|keep for|stored for)\s*$/i.test(before)) {
          const ctx = s;
          const obj = DATA_OBJECT.find(([, re]) => re.test(ctx));
          if (obj) fact = `retention of ${obj[0]}`;
        }
        if (fact) out.push({ topic, fact, value, lo, min, quote: q(s, 160), index: t.indexOf(s) + m.index, neg });
      }
    }
    // the methods a customer can pay with
    if (topics.includes("payment methods") && !neg) {
      const brands = PAYMENT_BRANDS.filter(([, re]) => re.test(s)).map(([b]) => b);
      // a sentence that names a card scheme as an example of something else ("a Visa logo") is not the accepted list
      // "we accept" / "payment methods" state the list; "pay with a card or Apple Pay" names one or two in passing
      const states = /\b(we accept|accepted|accepts|payment methods?|ways to pay|you can pay|we take|supported (?:cards|payment))\b/i.test(s);
      if (brands.length >= (states ? 1 : 2)) out.push({ topic: "payment methods", fact: "accepted payment methods", value: brands.join(", "), set: brands, quote: q(s, 160), index: t.indexOf(s) });
    }
    // the currencies the site sells in
    if (topics.includes("currencies") && !neg) {
      const cur = CURRENCIES.filter(([, re]) => re.test(s)).map(([c]) => c);
      // one currency named ("credits are priced in USD") is the billing currency; a list is what a customer can pay in
      const only = /\bonly\b|\bexclusively\b|\bsole(?:ly)?\b/i.test(s);
      // "euros, pounds and several others" is an open list: it can only be wrong by naming one the full list lacks
      const open = /\b(and|or) (?:several|many|more|other|others|any other)\b|\betc\b|\bsuch as\b|\bincluding\b|\be\.g\.|\bfor example\b|\band (?:more|others)\b/i.test(s);
      if (cur.length) out.push({ topic: "currencies", fact: cur.length === 1 && !only && !open ? "billing currency" : "currencies offered", value: cur.join(", "), set: cur, only, open, quote: q(s, 160), index: t.indexOf(s) });
    }
  }
  return out;
}

/** the currencies of the amounts in a text ("$10", "€5", "10 GBP") */
export function amountCurrencies(text) {
  const t = prose(text);
  const out = [];
  for (const [c, re] of AMOUNT) { re.lastIndex = 0; for (let m = re.exec(t); m; m = re.exec(t)) out.push({ currency: c, index: m.index, quote: q(around(t, m.index), 70) }); }
  return out;
}

/**
 * CT20 — the same policy stated with different facts: refund window / processing time, account deletion time,
 * retention per kind of data, accepted payment methods, currencies offered (and amounts in a currency the site
 * says it does not offer, or amounts in more currencies than content.currencies / acceptance.currencies allow).
 * The dominant value is the one most places state; the others are reported where they are.
 */
export function policyConflicts(texts, cc = {}, cfg = {}) {
  const facts = new Map();
  const amounts = [];
  for (const x of texts) {
    if (!isEnglish(x.locale)) continue;
    for (const f of policyFacts(x.text)) {
      if (f.neg && f.fact !== "refund window") continue;
      (facts.get(f.fact) || facts.set(f.fact, []).get(f.fact)).push({ ...x, value: f.value, set: f.set, only: f.only, open: f.open, lo: f.lo, min: f.min, quote: f.quote });
    }
    for (const a of amountCurrencies(x.text)) amounts.push({ ...x, currency: a.currency, quote: a.quote });
  }
  const out = [];
  const allow = (cc.policyAllow || []);
  for (const [fact, list] of facts) {
    // one statement per place: a policy page that repeats "14 days" three times is one voice
    const byValue = new Map();
    for (const x of list) {
      if (allow.some((a) => (a.fact ? a.fact === fact : true) && (a.value ? a.value === x.value : true) && (a.where ? new RegExp(a.where, "i").test(x.where) : true))) continue;
      (byValue.get(x.value) || byValue.set(x.value, []).get(x.value)).push(x);
    }
    let values = [...byValue].map(([value, at]) => ({ value, count: new Set(at.map(placeOf)).size, at }));
    if (fact === "accepted payment methods" || fact === "currencies offered") values = mergeSubsetLists(values, list);
    if (values.length < 2) continue;
    values.sort((a, b) => b.count - a.count || b.at.length - a.at.length);
    // an open list is wrong only when it names one the main list lacks; "at least 5 years" agrees with "7 years"
    const main = values.find((v) => !v.at.every((a) => a.open)) || values[0];
    values = values.filter((v) => {
      if (v === main) return true;
      if (v.at.every((a) => a.open) && main.at[0].set) return v.at[0].set.some((c) => !main.at[0].set.includes(c));
      if (v.at.every((a) => a.min) && main.at[0].lo != null) return v.at[0].lo > main.at[0].lo;
      return true;
    });
    if (values.length < 2) continue;
    if (values[0] !== main) values = [main, ...values.filter((v) => v !== main)];
    const dominant = values[0].value;
    const tie = values[0].count === values[1].count;
    // a value said only where the main value is said too ("credit refunds: 5 days; cash refunds: 5–10 days") is a qualified statement
    const domPlaces = new Set(values[0].at.map(placeOf));
    for (const v of values.slice(1)) if (v.at.some((a) => !domPlaces.has(placeOf(a)))) out.push({
      id: "CT20", rule: "content/policy-conflict", concept: fact, dominant, tie, variants: values, variant: v.value,
      what: `${fact}: the site says ${values.map((x) => `"${x.value}" (${x.count} place${x.count > 1 ? "s" : ""}: ${x.at.slice(0, 2).map((a) => a.where).join(", ")})`).join(" vs ")} — "${q(v.at[0].quote, 110)}"`,
      fix: tie ? `decide which is true for ${fact} and state the same everywhere (every place is listed)` : `check which is true; if it is "${dominant}" (most places), change "${v.value}" to "${dominant}" in ${v.at.length} place(s)`,
      report: v.at,
    });
  }
  // currencies: statements vs each other are above; amounts vs what the site offers
  const stated = (facts.get("currencies offered") || []);
  const exclusive = stated.filter((s) => s.only).flatMap((s) => s.set);
  const configured = cc.currencies || (Array.isArray(cfg?.acceptance?.currencies) ? cfg.acceptance.currencies : null);
  const offered = new Set(exclusive.length ? exclusive : configured || stated.flatMap((s) => s.set));
  const amountBy = new Map();
  for (const a of amounts) (amountBy.get(a.currency) || amountBy.set(a.currency, []).get(a.currency)).push(a);
  if (amountBy.size) {
    const sorted = [...amountBy].sort((a, b) => b[1].length - a[1].length);
    const odd = offered.size ? sorted.filter(([c]) => !offered.has(c)) : sorted.length > 1 ? sorted.slice(1) : [];
    for (const [c, at] of odd) out.push({
      id: "CT20", rule: "content/policy-conflict", concept: "prices in currencies", dominant: offered.size ? [...offered].join(", ") : sorted[0][0], variant: c,
      variants: sorted.map(([value, at]) => ({ value, count: at.length, at })),
      what: offered.size
        ? `prices in ${c} (${at.length}: ${at.slice(0, 3).map((a) => `${a.where} "${a.quote}"`).join(", ")}) but the site offers ${[...offered].join(", ")}${exclusive.length ? ` only (${stated.find((s) => s.only)?.where})` : configured ? " (content.currencies / acceptance.currencies)" : ` (${stated[0]?.where})`}`
        : `prices in ${sorted.length} currencies: ${sorted.map(([value, at]) => `${value} ${at.length}×`).join(", ")}; ${c} at ${at.slice(0, 3).map((a) => a.where).join(", ")}`,
      fix: offered.size ? `show these prices in ${[...offered].join(" / ")} (or the visitor's chosen currency), or add ${c} to what the site says it offers` : `one currency for prices (or the visitor's chosen one) — set content.currencies to the ones the site offers`,
      report: at,
    });
  }
  return out;
}
const placeOf = (x) => (x.key ? `${x.file}#${x.key}` : x.file) || String(x.where).split(/\s+"/)[0];
// "Visa, Mastercard" and "Visa, Mastercard, Amex" are two different lists — keep both; identical sets merge
function mergeSubsetLists(values) {
  const m = new Map();
  for (const v of values) { const k = [...new Set(v.at[0].set || [])].sort().join(", "); const e = m.get(k); if (e) { e.at.push(...v.at); e.count = new Set(e.at.map(placeOf)).size; } else m.set(k, { value: k, count: v.count, at: [...v.at] }); }
  return [...m.values()];
}

/* ───────────────────────── CT21 naming drift of links, pages and actions ───────────────────────── */
const STOP = new Set("the a an our your my their its of and & to for in on at with page view see all go read about us more here this".split(" "));
// labels that do not name the destination: they are calls to action, not names
export const GENERIC_LABEL = /^(learn more|read more|more|here|click here|try again|retry|start over|see more|view more|view all|see all|show all|details|view details|see details|back|go back|continue|next|previous|prev|open|view|explore|discover|start|get started|start now|start free|try (it )?(free|now)?|try for free|try it|sign up free|go|ok|done|cancel|close|home|menu|skip|skip to (main )?content|→|←|›|»|logo|link|more info|find out more|see how|how|why|see it|watch|watch demo|book a demo|demo|download|share|copy|edit|delete|remove|save|submit|send|apply|select|choose)$/i;
// a call to action in the copy ("Upload video", "Buy more", "Tell us") says what to do, not the name of the page it opens
const IMPERATIVE = /^(try|request|buy|upload|view|tell|translate|start|get|go|see|read|learn|make|add|open|download|book|join|explore|discover|browse|find|check|watch|order|send|write|share|manage|edit|change|update|choose|pick|compare|claim|top|pay|continue|return|resend|reset|follow|ask|email|message|call|chat|hire|post|publish|create|generate|upgrade|renew|unlock|redeem|activate|connect|invite|meet|talk|speak|hear|listen|drop|let's|lets|contact|file|complete|finish|verify|confirm|submit|place|leave|rate|review|subscribe|sign up for|describe|tell|post|list|become|apply|build|launch|grow|save|earn|work|sell|buy)\b/i;
export const isCta = (l) => (IMPERATIVE.test(l) || /^(how|why|what|when|where|who)\b/i.test(l)) && !/^create (?:an |your )?account$/i.test(l);
const words = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/centre\b/g, "center").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).map((w) => (w.length > 3 && /[^s]s$/.test(w) && !/(us|is|ss|ics)$/.test(w) ? w.slice(0, -1) : w)).filter((w) => !STOP.has(w));
const subset = (a, b) => a.length > 0 && a.every((w) => b.includes(w));
const sameName = (a, b) => { if (normLabel(a).toLowerCase() === normLabel(b).toLowerCase()) return true; const x = words(a), y = words(b); return subset(x, y) || subset(y, x); };
export const normLabel = (s) => String(s || "").replace(/[\s←-⇿➔-➿›»↗→←]+$/u, "").replace(/^[\s←-⇿←‹«]+/u, "").replace(/\s+/g, " ").trim();
// "Back to Sign In" names Sign In
const destName = (l) => normLabel(l).replace(/^(?:back|return|go back)\s+to\s+(?:the\s+)?/i, "");
const isGeneric = (l, brand = []) => !l || GENERIC_LABEL.test(l) || l.split(/\s+/).length > 6 || l.length > 48 || !/\p{L}/u.test(l) || /[•·|]/.test(l) || brand.some((b) => b && l.toLowerCase() === String(b).toLowerCase()) || /^\d/.test(l);

/** one destination, one label: [{ label, count, at }] clusters, labels that are word subsets of each other merged */
function clusters(entries, allowed = []) {
  const cl = [];
  for (const e of entries) {
    const al = allowed.find((set) => set.some((x) => normLabel(x).toLowerCase() === e.label.toLowerCase()));
    let c = cl.find((k) => (al && k.allowed === al) || k.labels.some((l) => sameName(l, e.label)));
    if (!c) { c = { labels: [], at: [], allowed: al || null }; cl.push(c); }
    if (!c.labels.includes(e.label)) c.labels.push(e.label);
    c.at.push(e);
  }
  // a cluster can join two others ("Help" ~ "Help center", "Help" ~ "Help desk"): fine, the first wins
  return cl.map((c) => ({ label: [...c.labels].sort((a, b) => c.at.filter((x) => x.label === b).length - c.at.filter((x) => x.label === a).length)[0], labels: c.labels, count: c.at.length, at: c.at }));
}

/** the name a page goes by: its <h1> and <title> parts (the brand part of the title dropped) */
const titleParts = (t) => String(t || "").split(/\s+[|·•–—-]\s+|\s+:\s+/).map((x) => x.trim()).filter(Boolean);
/** the brand: the title part most pages share ("… - Acme") */
export function siteBrand(pages) {
  const c = new Map();
  for (const p of pages) for (const t of new Set(titleParts(p.title).slice(1))) c.set(t, (c.get(t) || 0) + 1);
  const withTitle = pages.filter((p) => p.title).length;
  return [...c].filter(([, k]) => k >= 3 && k >= withTitle / 3).map(([t]) => t);
}
/** a page's names without the brand; a question or a sentence ("How can we help you?") is a tagline, not a name */
export function pageNames(page, brand = []) {
  const br = brand.map((b) => String(b).toLowerCase()).filter(Boolean);
  const strip = (s) => { let t = s; for (const b of br) t = t.replace(new RegExp(`(?<![\\p{L}])${esc(b)}(?![\\p{L}])`, "giu"), " "); return t.replace(/\s+/g, " ").trim(); };
  const out = [];
  for (const nm of [...(page.names || []), ...titleParts(page.title)]) {
    for (const part of titleParts(nm)) {
      const t = strip(part);
      if (!t || /[?!.]$/.test(t) || t.split(/\s+/).length > 5 || br.includes(t.toLowerCase())) continue;
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

/* a name and the routes it fits: its words found in a page's own names or its last path segment */
const slugWords = (path) => words((String(path).split("/").filter((x) => x && !/^\[/.test(x)).pop() || "").replace(/[-_]/g, " "));
function affinity(name, page, brand) {
  const w = words(name);
  if (!w.length) return 0;
  const pool = new Set([...pageNames(page, brand).flatMap(words), ...slugWords(page.path)]);
  return w.filter((x) => pool.has(x)).length;
}
/** the one other page a name fits better than the page it is attached to (null when it fits its own, or none / several) */
export function betterRoute(name, path, pages, brand = [], { all = false } = {}) {
  const cand = pages.filter((p) => p.path !== "/" && !/\[/.test(p.path) && !p.admin && !p.dead);
  const own = path ? cand.find((p) => p.path === path) : null;
  if (own && affinity(name, own, brand) > 0) return null;
  const need = all ? words(name).length : 1;
  const scored = cand.filter((p) => p.path !== path).map((p) => [p, affinity(name, p, brand)]).filter(([, sc]) => sc >= need && sc > 0).sort((a, b) => b[1] - a[1]);
  if (!scored.length || (scored[1] && scored[1][1] === scored[0][1])) return null;
  return scored[0][0];
}
// a page named as a destination in the copy: "download it from My videos", "in your Video Library", "open Settings"
const DEST_RE = /(?<![\p{L}])(?:from|in|on|to|under|via|into|at|open|opens|visit|see|check|use)\s+(?:your\s+|the\s+|our\s+)?((?:My|Your|Our)\s+[a-z][\p{L}'’-]*|[A-Z][\p{L}'’-]*(?:\s+(?:&\s+)?[A-Z][\p{L}'’-]*){0,3})/gu;
export function destinationMentions(text) {
  const t = prose(text);
  const out = [];
  DEST_RE.lastIndex = 0;
  for (let m = DEST_RE.exec(t); m; m = DEST_RE.exec(t)) out.push({ name: m[1].trim(), index: m.index + m[0].length - m[1].length, tail: (t.slice(m.index + m[0].length).match(/^\s+([\p{L}'’-]+)(?:\s+([\p{L}'’-]+))?/u) || []).slice(1).filter(Boolean) });
  return out;
}

/**
 * CT21 (d) — a page's name in the copy: each route's own names (its <h1>, layout title, <title> without the brand, the
 * nav / sidebar label of the links that open it) against the names prose, emails and locale strings give it as a
 * destination ("download it from My videos" while the page calls itself "Video Library").
 */
export function pageNameDrift({ texts = [], links = [], pages = [] }, cc = {}, { brand = [] } = {}) {
  brand = [...brand, ...siteBrand(pages)];
  const eq = (a, b) => { const x = words(a).join(" "); return !!x && x === words(b).join(" "); };
  const cand = pages.filter((p) => p.path !== "/" && !/\[/.test(p.path) && !p.admin);
  const own = new Map(cand.map((p) => [p.path, pageNames(p, brand)]));
  for (const l of links) {
    const dest = l.dest || l.path;
    if (!own.has(dest) || (l.region !== "nav" && l.region !== "footer")) continue;
    const label = destName(l.label);
    if (isGeneric(label, brand) || isCta(label) || betterRoute(label, dest, cand, brand)) continue;
    if (!own.get(dest).some((n) => eq(n, label))) own.get(dest).push(label);
  }
  const brandRe = brand.map((b) => String(b).toLowerCase());
  const byRoute = new Map();
  for (const x of texts) {
    // a label is compared as a label (a, b); here: sentences that send the reader somewhere
    if (!isEnglish(x.locale) || x.kind === "title" || x.kind === "nav" || x.kind === "button" || x.linkLabel) continue;
    for (const m of destinationMentions(x.text)) {
      const n = m.name;
      // codes ("in USD") and a capitalised defined term of a contract ("the Service", "the Platform") are not page names
      if (!/\p{Ll}/u.test(n) || (!/\s/.test(n) && /\bthe\s+$/i.test(prose(x.text).slice(Math.max(0, m.index - 5), m.index)))) continue;
      // "Back to Sign up": the name goes on in lowercase words
      if ([1, 2].some((k) => m.tail.length >= k && [...own.values()].some((names) => names.some((o) => eq(o, `${n} ${m.tail.slice(0, k).join(" ")}`))))) continue;
      if (brandRe.includes(n.toLowerCase()) || legalFamily(n) || new RegExp(`${DOC_SUFFIX}$`).test(n)) continue;
      // the copy may add words to a page's name ("your Account Settings" for "Settings"), not drop or swap them
      const covers = (o) => { const w = words(n); return words(o).every((x) => w.includes(x)) && words(o).length > 0; };
      if ([...own.values()].some((names) => names.some((o) => eq(o, n) || covers(o)))) continue; // a page's own name
      const page = betterRoute(n, null, cand, brand, { all: true });
      if (!page) continue;
      const names = own.get(page.path) || [];
      if (!names.length || names.some(covers)) continue;
      const k = page.path;
      (byRoute.get(k) || byRoute.set(k, new Map()).get(k));
      const m2 = byRoute.get(k);
      (m2.get(n) || m2.set(n, []).get(n)).push({ ...x, quote: q(around(x.text, m.index), 80) });
    }
  }
  const out = [];
  for (const [path, used] of byRoute) {
    const names = own.get(path);
    for (const [n, at] of used) {
      if (matchesAllow(cc.termAllow, n, `name of ${path}`, at[0].where)) continue;
      out.push({
        id: "CT21", rule: "content/label-drift", concept: `name of ${path} in the copy`, dominant: names[0], variant: n,
        variants: [{ value: names[0], count: 1, at: [pages.find((p) => p.path === path)] }, { value: n, count: at.length, at }],
        what: `the copy sends readers to ${path} as "${n}" (${at.length} place${at.length > 1 ? "s" : ""}: ${at.slice(0, 3).map((a) => a.where).join(", ")}${at.length > 3 ? " …" : ""}), but the page calls itself "${names.join('" / "')}"`,
        fix: `one name: write "${names[0]}" in those ${at.length} place(s) — or rename the page (its heading, title, nav / sidebar label) to "${n}" everywhere`,
        report: at,
      });
    }
  }
  return out;
}

/**
 * CT21 — (a) the same destination reached through links with different names ("Help Centre" / "Support" / "FAQ" →
 * /help; content.labelAllow: { "/sign-up": ["Sign up", "Create account"] } accepts a set). Nav, footer and button
 * links count with any label; links in the body only when the label is a short name (calls to action such as
 * "Upload video" are not names). (b) a nav / footer label the page itself does not carry ("Cookie notice" → <h1>
 * "Cookie Policy"). (c) the same action labelled differently ("Buy credits" / "Top up" / "Add credits"): action groups
 * over buttons, and (static) buttons that open the same thing (one onClick target) with different labels.
 */
export function labelDrift({ links = [], pages = [], texts = [], actions = [] }, cc = {}, { brand = [], skipLegal = false } = {}) {
  const out = [];
  const pageBy = new Map(pages.map((p) => [p.path, p]));
  brand = [...brand, ...siteBrand(pages)];
  // (a)
  const byPath = new Map();
  // a link to a redirected path counts where it lands
  const dst = (l) => l.dest || l.path;
  for (const l of links) {
    const label = destName(l.label);
    if (!l.path || dst(l) === "/" || isGeneric(label, brand)) continue;
    if (l.region === "inline") continue;
    if (l.region === "body" && l.kind !== "button" && (isCta(label) || label.split(/\s+/).length > 3)) continue;
    if (l.region === "body" && l.kind === "button" && label.split(/\s+/).length > 3) continue;
    (byPath.get(dst(l)) || byPath.set(dst(l), []).get(dst(l))).push({ ...l, label });
  }
  const allowCfg = cc.labelAllow || {};
  const reportedA = new Set();
  for (const [path, list] of byPath) {
    const cl = clusters(list, Array.isArray(allowCfg[path]) ? [allowCfg[path]] : allowCfg[path] ? Object.values(allowCfg[path]) : []);
    if (cl.length < 2) continue;
    const page = pageBy.get(path);
    const names = page ? pageNames(page, brand) : [];
    // the page's own name wins, then the label most links use
    const own = cl.find((c) => names.some((nm) => c.labels.some((l) => sameName(l, nm))));
    cl.sort((a, b) => (b === own) - (a === own) || b.count - a.count);
    const dom = cl[0];
    for (const c of cl.slice(1)) for (const x of c.at) reportedA.add(`${path}|${x.label}`);
    for (const c of cl.slice(1)) {
      // "My videos" → /dashboard while /dashboard/videos exists: the label is right, the href is wrong
      const bp = page && betterRoute(c.label, path, pages, brand);
      const via = [...new Set(c.at.filter((x) => x.dest && x.dest !== x.path).map((x) => x.path))];
      out.push({
      id: "CT21", rule: "content/label-drift", concept: `links to ${path}`, dominant: dom.label, variant: c.label, variants: cl.map((x) => ({ value: x.label, count: x.count, at: x.at })),
      what: `links to ${path} have ${cl.length} names: ${cl.map((x) => `"${x.label}" ${x.count}× (${x.at.slice(0, 2).map((a) => a.where).join(", ")})`).join(", ")}${own && names[0] ? ` — the page calls itself "${names[0]}"` : ""}`,
      fix: `one page, one name: label every link to ${path} "${dom.label}" (change "${c.labels.join('", "')}" in ${c.at.length} place(s)), or accept the set in content.labelAllow["${path}"]${bp ? ` — "${c.label}" reads as ${bp.path} ("${pageNames(bp, brand)[0] || bp.path}"): if that is where it should go, point the link there` : ""}${via.length ? ` — ${via.join(", ")} redirect${via.length > 1 ? "" : "s"} to ${path}` : ""}`,
      report: c.at,
    });
    }
  }
  // (b) nav / footer label vs the page's <h1> / <title>
  const seen = new Set();
  for (const l of links) {
    if (l.region !== "nav" && l.region !== "footer") continue;
    const label = destName(l.label);
    const page = pageBy.get(dst(l));
    if (!page || isGeneric(label, brand) || dst(l) === "/" || reportedA.has(`${dst(l)}|${label}`)) continue;
    const names = pageNames(page, brand);
    if (!names.length) continue;
    // a menu item whose words name another page better than the one it opens: the href is wrong
    if (!names.some((nm) => sameName(label, nm))) {
      const bp = betterRoute(label, dst(l), pages, brand);
      if (bp && !seen.has(`${dst(l)}|${label}`)) {
        seen.add(`${dst(l)}|${label}`);
        const at = links.filter((x) => dst(x) === dst(l) && destName(x.label) === label && (x.region === "nav" || x.region === "footer"));
        out.push({
          id: "CT21", rule: "content/label-drift", concept: `href of "${label}"`, dominant: bp.path, variant: label, variants: [{ value: label, count: at.length, at }],
          what: `the ${l.region} item "${label}" opens ${dst(l)} ("${names[0]}"), but its words name ${bp.path} ("${pageNames(bp, brand)[0] || bp.path}")`,
          fix: `point it at ${bp.path} — or, if ${dst(l)} is right, rename it "${names[0]}"`,
          report: at,
        });
        continue;
      }
    }
    if (skipLegal && legalFamily(label) && names.some((nm) => legalFamily(nm) === legalFamily(label))) continue; // CT15 names legal documents
    const lw = words(label);
    if (!lw.length || names.some((nm) => sameName(label, nm))) continue;
    // a near miss ("Cookie notice" / "Cookie Policy"), or a title that shares nothing with the label
    const near = names.find((nm) => words(nm).some((x) => lw.includes(x)));
    const titled = page.title ? pageNames({ names: [], title: page.title }, brand).filter((p) => words(p).length && words(p).length <= 4) : [];
    // or a page whose own name is what another link calls a different page ("Docs" → a page that says "Help Center",
    // while "Help Centre" in the nav goes to /help): a marketing <title> or a tagline that shares nothing is not enough
    const eq = (a, b) => { const x = words(a).join(" "); return !!x && x === words(b).join(" "); };
    const clash = !near && names.find((nm) => links.some((o) => o.path !== l.path && o.path && eq(destName(o.label), nm)));
    const named = near || clash || null;
    void titled;
    if (!named) continue;
    const k = `${l.path}|${label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const at = links.filter((x) => dst(x) === dst(l) && destName(x.label) === label && (x.region === "nav" || x.region === "footer"));
    out.push({
      id: "CT21", rule: "content/label-drift", concept: `name of ${l.path}`, dominant: named, variant: label, variants: [{ value: named, count: 1, at: [page] }, { value: label, count: at.length, at }],
      what: `the ${l.region} calls ${l.path} "${label}", the page itself says "${named}" (${page.where})`,
      fix: `one name: rename the ${l.region} link to "${named}" (${new Set(at.map((x) => x.where)).size} place(s)), or the page's heading / title to "${label}"${clash ? ` — and note that another link calls a different page "${clash}"` : ""}`,
      report: at,
    });
  }
  // (e) one nav / footer group, two links that land on the same page ("Docs" /docs → /help next to "Help centre" /help)
  const groupsBy = new Map();
  for (const l of links) {
    if (l.region !== "nav" && l.region !== "footer") continue;
    const g = `${l.file || l.route || ""}|${l.region}`;
    (groupsBy.get(g) || groupsBy.set(g, new Map()).get(g));
    const m = groupsBy.get(g);
    (m.get(dst(l)) || m.set(dst(l), []).get(dst(l))).push(l);
  }
  const dupSeen = new Set();
  for (const [g, m] of groupsBy) for (const [dest, list] of m) {
    const paths = [...new Set(list.map((x) => x.path))];
    if (paths.length < 2) continue;
    const k = `${dest}|${paths.sort().join(",")}`;
    if (dupSeen.has(k)) continue;
    dupSeen.add(k);
    const extra = list.filter((x) => x.path !== dest);
    const region = g.split("|").pop();
    out.push({
      id: "CT21", rule: "content/label-drift", concept: `two ${region} links to ${dest}`, dominant: list.find((x) => x.path === dest)?.label || dest, variant: extra.map((x) => x.label).join(" / "),
      variants: paths.map((p) => ({ value: p, count: list.filter((x) => x.path === p).length, at: list.filter((x) => x.path === p) })),
      what: `the ${region} links to the same page twice under different names: ${list.map((x) => `"${destName(x.label)}" (${x.path}${x.path !== dest ? ` → ${dest}` : ""})`).filter((v, i, a) => a.indexOf(v) === i).join(" and ")}`,
      fix: `one page, one link: remove ${extra.map((x) => `"${destName(x.label)}" (${x.path})`).filter((v, i, a) => a.indexOf(v) === i).join(", ")} from the ${region} (or give it its own page)`,
      report: extra,
    });
  }
  // (d) the page's name in the copy
  out.push(...pageNameDrift({ texts, links, pages }, cc, { brand }));
  // (c) one action, one label
  const ACTIONS = [
    { concept: "buying credits", members: [["buy credits", /\bbuy (?:more )?credits\b/i], ["purchase credits", /\bpurchase (?:more )?credits\b/i], ["add credits", /\badd (?:more )?credits\b/i], ["get credits", /\bget (?:more )?credits\b/i], ["top up", /\btop[- ]?up\b/i], ["recharge", /\brecharge\b/i], ["add funds", /\badd funds\b/i], ["refill", /\brefill\b/i]] },
    { concept: "contacting the team", members: [["contact us", /^contact(?: us)?$/i], ["contact support", /^contact (?:support|the team|our team)$/i], ["get in touch", /^get in touch$/i], ["talk to us", /^talk to (?:us|sales|the team)$/i], ["write to us", /^(?:write|message|email) (?:to )?us$/i]] },
  ];
  // a link's label is also a piece of copy (its text segment): one place, counted once
  const linkAt = new Set(links.flatMap((l) => (l.file ? [-1, 0, 1, 2].map((d) => `${l.file}|${l.line + d}|${normLabel(l.label).toLowerCase()}`) : [`${l.where}|${normLabel(l.label).toLowerCase()}`])));
  // actions are buttons and links in the page body; a nav / footer item names a page (that is (a) and (b))
  const actionTexts = [...texts.filter((x) => x.kind === "button" && isEnglish(x.locale)).map((x) => ({ ...x, label: normLabel(x.text) })).filter((x) => !linkAt.has(x.file ? `${x.file}|${x.line}|${x.label.toLowerCase()}` : `${x.where}|${x.label.toLowerCase()}`)), ...links.filter((l) => l.region === "body" || l.region === "inline" || l.kind === "button").map((l) => ({ ...l, label: normLabel(l.label) }))];
  for (const g of ACTIONS) {
    const used = new Map();
    const seenAt = new Set();
    for (const x of actionTexts) {
      if (!x.label || x.label.split(/\s+/).length > 5) continue;
      const m = g.members.find(([, re]) => re.test(x.label));
      if (!m) continue;
      const k = `${m[0]}|${x.where}`;
      if (seenAt.has(k)) continue;
      seenAt.add(k);
      (used.get(m[0]) || used.set(m[0], []).get(m[0])).push(x);
    }
    if (used.size < 2) continue;
    if (matchesAllow(cc.termAllow, "", g.concept, "") ) continue;
    const vs = [...used].map(([value, at]) => ({ value, count: at.length, at })).sort((a, b) => b.count - a.count);
    for (const v of vs.slice(1)) {
      if (matchesAllow(cc.termAllow, v.value, g.concept, v.at[0].where)) continue;
      out.push({
        id: "CT21", rule: "content/label-drift", concept: g.concept, dominant: vs[0].value, variant: v.value, variants: vs,
        what: `${g.concept} is labelled ${vs.length} ways on buttons / links: ${vs.map((x) => `"${x.value}" ${x.count}× (${x.at.slice(0, 2).map((a) => a.where).join(", ")})`).join(", ")}`,
        fix: `one action, one label: write "${vs[0].value}" instead of "${v.value}" (${v.at.length} place(s)), or allow it in content.termAllow`,
        report: v.at,
      });
    }
  }
  // (c, static) buttons that open the same thing with different labels
  const byKey = new Map();
  for (const a of actions) { const label = normLabel(a.label); if (!label || isGeneric(label) && label.split(/\s+/).length < 2) continue; (byKey.get(a.key) || byKey.set(a.key, []).get(a.key)).push({ ...a, label }); }
  for (const [key, list] of byKey) {
    const cl = clusters(list);
    if (cl.length < 2) continue;
    cl.sort((a, b) => b.count - a.count);
    for (const c of cl.slice(1)) out.push({
      id: "CT21", rule: "content/label-drift", concept: `the action ${key}`, dominant: cl[0].label, variant: c.label, variants: cl.map((x) => ({ value: x.label, count: x.count, at: x.at })),
      what: `buttons that do the same thing (${key}) have ${cl.length} labels: ${cl.map((x) => `"${x.label}" (${x.at.slice(0, 2).map((a) => a.where).join(", ")})`).join(", ")}`,
      fix: `one action, one label: "${cl[0].label}" (change "${c.label}" in ${c.at.length} place(s))`,
      report: c.at,
    });
  }
  return out;
}

/* ───────────────────────── CT22 references to pages that do not exist ───────────────────────── */
const DOC_SUFFIX = "(?:Terms(?: of (?:Service|Use|Sale|Business))?|Terms and Conditions|Policy|Policies|Agreement|Notice|Conditions|Centre|Center|Guide|Guidelines|FAQ|Statement|Charter|Code of Conduct|Rulebook|Handbook)";
const CAP = "(?:[A-Z][\\w'’-]*|AML|KYC|API|EU|UK|US)";
// Title Case words joined by spaces, " / " or of / and / & / for / on, ending in a document noun
export const DOC_NAME = new RegExp(`(?<![\\w'’-])((?:${CAP}(?:\\s*\\/\\s*|\\s+(?:(?:of|and|&|for|on)\\s+)?)){0,5}${DOC_SUFFIX})(?![\\w-])`, "g");
const LEAD = /^(?:our|the|this|these|those|your|its|their|see|read|check|visit|review|under|per|in|by|accept|agree|with|from|a|an|any|all|each|and|or|to|of|for|on|please|also|current|applicable|relevant|separate|full|latest|updated|new|following|said|such|here|changes|change|updates|update|acceptance|amendments?)\s+/i;
const THIRD_PARTY = /\b(Google|Apple|Stripe|PayPal|Microsoft|Meta|Facebook|Instagram|Amazon|AWS|Vercel|Cloudflare|OpenAI|Anthropic|ElevenLabs|YouTube|Twitter|LinkedIn|TikTok|Visa|Mastercard|Telegram|WhatsApp|Discord|Slack|Zoom|GitHub|Supabase|Neon|Resend|Postmark|Twilio|Sentry|Shopify|Ecommpay|Paddle|Revolut|Wise|Klarna|Adyen|Braintree|Checkout\.com|HubSpot|Intercom|Mailchimp|Notion|Figma|Replicate|HeyGen|Deepgram|Mux|Cloudinary|EU|European|UK|ICO|GDPR|CCPA|ISO|PCI(?: DSS)?|W3C|WCAG)\b/;
// words that end like a document but are not one, and adjectives that make a name generic ("this Agreement", "a legal notice")
const NOT_DOC = /^(?:data|call|test|cost|fulfil+ment|distribution|shopping|service|support|contact|command|control|notification|dev|developer|learning|media|press|trust|admin|resource)\s+cent(?:er|re)$|^(?:important|legal|quick|final|public|this|a|the|prior|written|advance|reasonable|formal|short)\s+notice$|^(?:important|special|general|other|these|such)\s+(?:conditions|terms)$|^(?:step[- ]by[- ]step|quick|beginner'?s?|user|setup|getting started)\s+guide$|^(?:legal|binding|entire|written|separate|whole|full|complete|this|that|such|any)\s+(?:agreement|terms|policy|policies|notice|statement)$|^(?:conditions|terms|notice|guide|policy|policies|agreement|statement|center|centre|guidelines|charter|handbook|rulebook)$/i;

/** names of documents / pages in one text: [{ name, index }] ("Specialist Service Terms", "the Refund Policy") */
export function documentNames(text) {
  const t = prose(text);
  const out = [];
  DOC_NAME.lastIndex = 0;
  for (let m = DOC_NAME.exec(t); m; m = DOC_NAME.exec(t)) {
    let name = m[1].replace(/\s+/g, " ").trim();
    let idx = m.index;
    for (let s = name.replace(LEAD, ""); s !== name; s = name.replace(LEAD, "")) { idx += name.length - s.length; name = s; }
    // one word is a name only as "the FAQ" / "our FAQ"; "Policy" alone is a common noun; "Company FAQ" names a kind of content
    if (/\bFAQ$/.test(name) && (/\s/.test(name) || !/\b(?:our|the|see|visit|check)\s+(?:the\s+)?$/i.test(t.slice(Math.max(0, idx - 14), idx)))) continue;
    if (!/\s/.test(name) && name !== "FAQ") continue;
    if (NOT_DOC.test(name) || THIRD_PARTY.test(name)) continue;
    // "Stripe's Services Agreement", "Google's Privacy Policy", "the Privacy Policy of Stripe": another company's document
    const last = (t.slice(Math.max(0, idx - 30), idx).trim().split(/\s+/).pop() || "").replace(/['’]s$/, "");
    if (THIRD_PARTY.test(last) || /^\s+(?:of|by|from)\s+(?:[A-Z]\w+)/.test(t.slice(idx + name.length)) && THIRD_PARTY.test(t.slice(idx + name.length, idx + name.length + 30))) continue;
    out.push({ name, index: idx });
  }
  return out;
}
const docKey = (s) => words(String(s).replace(LEAD, "")).join(" ");

/**
 * CT22 — (a) links to a path that is not a page (static: not an app route, public file or redirect; rendered: the
 * request answers 4xx/5xx — `deadLinks` passed in); (b) a document or page named in the copy ("Specialist Service
 * Terms", "the Help Centre") that no page, heading or link of the site carries. A name of the same legal family as a
 * page the site has ("Terms and Conditions" when /terms says "Terms of Service") exists — CT15 / CT21 rename it.
 * content.knownDocuments lists names that are fine (a document on another site).
 */
export function missingPages({ texts = [], links = [], pages = [], deadLinks = [], deadPages = [] }, cc = {}) {
  const out = [];
  // a page file whose route a redirect always catches: never rendered, so its copy and links are dead too
  for (const d of deadPages) out.push({
    id: "CT22", rule: "content/missing-page", concept: `dead page ${d.path}`, variant: d.path, variants: [{ value: d.path, count: 1, at: [d] }],
    what: `${d.file} is never shown: ${d.rule ? `${d.rule.file}:${d.rule.line} redirects "${d.rule.source}"` : "a redirect catches it"} to ${d.to}`,
    fix: `delete the page (and its links), or remove the redirect if the page should be live`,
    report: [d],
  });
  // links to a redirected path: link where it lands
  const redir = new Map();
  for (const l of links) if (l.redirect && l.redirect.kind === "redirect" && l.path) (redir.get(l.path) || redir.set(l.path, []).get(l.path)).push(l);
  for (const [path, at] of redir) {
    const r = at[0].redirect;
    out.push({
      id: "CT22", rule: "content/missing-page", concept: `link to redirected ${path}`, variant: path, variants: [{ value: path, count: at.length, at }],
      what: `${at.length} link(s) go to ${path}, which redirects to ${r.to}${r.rules?.[0]?.file ? ` (${r.rules[0].file}:${r.rules[0].line})` : ""}: ${at.slice(0, 4).map((a) => `${a.label ? `"${q(a.label, 30)}" ` : ""}${a.where}`).join(", ")}`,
      fix: `link ${r.to} directly (and drop the link if the same list already has one to ${r.to})`,
      report: at,
    });
  }
  // (a)
  const byPath = new Map();
  for (const d of deadLinks) (byPath.get(d.path) || byPath.set(d.path, []).get(d.path)).push(d);
  for (const [path, at] of byPath) out.push({
    id: "CT22", rule: "content/missing-page", concept: `link to ${path}`, variant: path, variants: [{ value: path, count: at.length, at }],
    what: `${at.length} link(s) go to ${path}, which is not a page on this site${at[0].status ? ` (answers ${at[0].status})` : ""}: ${at.slice(0, 4).map((a) => `${a.label ? `"${q(a.label, 30)}" ` : ""}${a.where}`).join(", ")}`,
    fix: `point them at the page that exists (${suggest(path, pages) || "the right route"}) or create ${path}`,
    report: at,
  });
  // (b)
  const known = new Set();
  const families = new Set();
  const addKnown = (s) => { const k = docKey(s); if (k) known.add(k); const fam = legalFamily(normLabel(s)); if (fam) families.add(fam); };
  for (const p of pages) for (const nm of p.names) addKnown(nm);
  for (const l of links) addKnown(normLabel(l.label));
  for (const k of cc.knownDocuments || []) addKnown(k);
  const unknown = new Map();
  for (const x of texts) {
    if (!isEnglish(x.locale) || x.kind === "title") continue;
    for (const d of documentNames(x.text)) {
      // a heading that is only the name labels a block (a section called "Refund Policy"), it does not point anywhere
      if (normLabel(x.text).replace(/^[^\p{L}\p{N}]+/u, "").replace(/[.:]$/, "").replace(/^(?:\d+(?:\.\d+)*\.?|[A-Z]\.|[ivx]+\.)\s+/i, "") === d.name) continue;
      const fam = legalFamily(d.name);
      if (fam && families.has(fam)) continue;
      const k = docKey(d.name);
      // known with or without a leading word ("Help Centre" vs "Acme Help Centre")
      const parts = d.name.split(/\s+/);
      let ok = known.has(k);
      for (let i = 1; !ok && i < parts.length - 0; i++) { const s = docKey(parts.slice(i).join(" ")); if (s && s.split(" ").length >= 2 && known.has(s)) ok = true; }
      if (ok) continue;
      (unknown.get(k) || unknown.set(k, { name: d.name, at: [] }).get(k)).at.push({ ...x, quote: q(around(x.text, d.index), 80) });
    }
  }
  // "Acme Specialist Agreement" and "Specialist Agreement" are one name with the brand in front
  for (const [k, u] of [...unknown]) for (const [k2, u2] of unknown) if (k !== k2 && k.endsWith(` ${k2}`) && unknown.has(k)) { u2.at.push(...u.at); unknown.delete(k); break; }
  for (const [, u] of unknown) out.push({
    id: "CT22", rule: "content/missing-page", concept: `"${u.name}"`, variant: u.name, variants: [{ value: u.name, count: u.at.length, at: u.at }],
    what: `the copy names "${u.name}" but no page, heading or link of the site is called that: ${u.at.slice(0, 3).map((a) => `${a.where} "${a.quote}"`).join("; ")}${u.at.length > 3 ? ` +${u.at.length - 3}` : ""}`,
    fix: `link the name to the page it means and use that page's name${suggestName(u.name, pages, links) ? ` (perhaps "${suggestName(u.name, pages, links)}")` : ""}, or remove the reference, or create the page; content.knownDocuments for a document that lives elsewhere`,
    report: u.at,
  });
  return out;
}
function suggest(path, pages) {
  const last = path.split("/").filter(Boolean).pop() || "";
  const w = words(last.replace(/-/g, " "));
  const hit = pages.find((p) => { const pw = words(p.path.split("/").pop().replace(/-/g, " ")); return w.some((x) => pw.includes(x)); });
  return hit?.path || null;
}
function suggestName(name, pages, links) {
  const DOCWORD = /^(polic(y|ie)|term|agreement|notice|condition|center|guide|guideline|faq|statement|charter|service|use)$/;
  const w = words(name).filter((x) => !DOCWORD.test(x));
  if (!w.length) return null;
  const all = [...pages.flatMap((p) => p.names), ...links.map((l) => normLabel(l.label))];
  let best = null, score = 0;
  for (const nm of all) { if (nm.split(/\s+/).length > 5 || !new RegExp(DOC_SUFFIX).test(nm)) continue; const s = words(nm).filter((x) => w.includes(x)).length; if (s > score && !GENERIC_LABEL.test(nm)) { best = nm; score = s; } }
  return best;
}

/** CT19–CT22 together, in the order a fixer works: names, facts, labels, missing pages */
export function consistencyFindings(site, cc = {}, cfg = {}, opts = {}) {
  const skip = new Set(cc.skip || []);
  const out = [];
  // the admin area is the team's own tool: its words are not the product's (content.consistencyAdmin: true checks it too)
  if (!cc.consistencyAdmin) {
    const pub = (list) => (list || []).filter((x) => !x.admin);
    site = { ...site, texts: pub(site.texts), links: pub(site.links), actions: pub(site.actions), pages: (site.pages || []).filter((p) => !p.admin) };
  }
  if (!skip.has("CT19")) out.push(...termDrift(site.texts || [], cc));
  if (!skip.has("CT20")) out.push(...policyConflicts(site.texts || [], cc, cfg));
  if (!skip.has("CT21")) out.push(...labelDrift(site, cc, opts));
  if (!skip.has("CT22")) out.push(...missingPages(site, cc));
  return out;
}
void isFrench;
