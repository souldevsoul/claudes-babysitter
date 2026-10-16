// Copy rules shared by the rendered-page checks (playwright/checks/content.js) and the static linter
// (lib/content-lint.js). Pure functions over one piece of user-facing text: no DOM, no files, no network.
// Docs: docs/checks-content.md. Every finding: { rule, id, what, fix, match }.
//
// A "segment" is one piece of copy with what it is:
//   { text, kind: "heading" | "button" | "nav" | "title" | "body" | "placeholder", locale? }
// kind decides the rules that apply (no trailing period in headings/buttons/nav; test data allowed in a placeholder).

/** Defaults for babysitter.config.json → content. Every one is overridable per product. */
export const CONTENT_DEFAULTS = {
  // the date format users see; the studio rule is DD.MM.YYYY
  dateFormat: "DD.MM.YYYY",
  // studio rule: no em dash "—" and no "--" in user copy. "allow" turns the rule off; allowDash lists regexes of copy where it is fine
  dashes: "forbid",
  allowDash: [],
  // phrases (regex sources) that are fine on this product even though a rule matches them
  allowPhrases: [],
  // preferred term → variants that must not be used: { "Terms of Service": ["Terms & Conditions", "T&C"] }
  glossary: {},
  // words kept as they are in every language (brand, product names): never "untranslated"
  brandTerms: [],
  defaultLocale: null,
  // rendered locales: [{ code: "az", prefix: "/az" } | { code, cookie: { NEXT_LOCALE: "az" } } | { code, localStorage: { key: "az" } }]
  locales: [],
  // rule ids to switch off (write the reason in content.skipReasons)
  skip: [],
};

export function contentConfig(cfg = {}) {
  const c = cfg.content || {};
  return { ...CONTENT_DEFAULTS, ...c, glossary: { ...(c.glossary || {}) } };
}

const RULE_IDS = {
  "content/unfinished": "CT1", "content/test-data": "CT2", "content/raw-error": "CT3", "content/trailing-period": "CT4",
  "content/dash": "CT5", "content/date-format": "CT6", "content/last-updated": "CT7", "content/grammar": "CT8",
  "content/email-domain": "CT9", "content/mailto": "CT10", "content/untranslated": "CT11", "content/key-as-text": "CT12",
  "content/lang-attr": "CT13", "content/missing-key": "CT14", "content/legal-naming": "CT15", "content/copyright-line": "CT16",
  "content/glossary": "CT17", "content/numeric-fact": "CT18",
};
export const ruleId = (rule) => RULE_IDS[rule] || rule;
const f = (rule, what, fix, match) => ({ rule, id: ruleId(rule), what, fix, match });
const q = (s, n = 90) => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/* ───────────── unfinished / defensive copy (CT1) ───────────── */
// Build notes, not-yet copy, self-justification and template markers that reached production copy.
// Sources: BQA 5 (~35 cards on 14 projects) + the 18 near-misses of the Praxis study (2026-10-14).
export const UNFINISHED = [
  /\bnot (yet )?live( yet)?\b/i, /\blive yet\b/i, /\bopens? at launch\b/i, /\b(at|after|before) (the )?launch\b/i, /\bswitched off\b/i,
  /\b(is|are|isn't|aren't|is not|are not) (not )?(yet )?available yet\b/i, /\bnot available yet\b/i, /\bnot (yet )?available on the platform( yet)?\b/i,
  /\b(isn't|is not|aren't|are not|not) working yet\b/i, /\b(has|have)n't launched( yet)?\b/i, /\b(has|have) not (yet )?launched\b/i, /\bnot launched yet\b/i,
  /\bcoming soon\b/i, /\bwe (do not|don't) (promise|guarantee a reply)\b/i, /\bthere is nothing else\b/i, /\bnothing on our side\b/i,
  /(?<!for )\bexample profiles?\b/i, /\bplaceholder\b/i, /\blorem\b/i, /\bipsum\b/i, /\bTBD\b/, /\bTODO\b/, /\bFIXME\b/, /\bTBA\b/,
  /#[A-Za-z][\w-]*#/, /\{\{\s*[\w.]+\s*\}\}/, /\bthis (build|deployment|preview)\b/i, /\bin this preview\b/i, /\bno mailbox is connected\b/i, /\bMX record\b/i,
  /\bwe would rather\b/i, /\bwe'd rather say\b/i, /\bis not a promise\b/i, /\brather than pretend\b/i, /\bto be honest\b/i, /\bwe (do not|don't) pretend\b/i, /\bplainly:/i,
  /\b(does|do) not review (the )?deliverables\b/i, /\bfor demo purposes\b/i, /\bdemo (data|content|account)\b/i, /\bsample (data|text|content)\b/i,
  // ru / az / kk
  /(?<![\p{L}])(скоро|пока не(до)?ступн\p{L}*|в разработке|заглушк\p{L}*|не работает пока|пока не работает)(?![\p{L}])/iu,
  /(?<![\p{L}])не обещаем(?![\p{L}])|не гарантируем ответ/iu,
  /(?<![\p{L}])tezliklə(?![\p{L}])|hələ (mövcud|əlçatan|mümkün|aktiv) deyil|hələlik (mövcud|əlçatan|mümkün) deyil|hələ işləmir|söz vermirik|başqa heç nə yoxdur/iu,
  /жақында (қолжетімді|іске қосылады|ашылады)|әзірге (қолжетімсіз|қолжетімді емес|жұмыс істемейді|іске қосылмаған)|уәде бермейміз|басқа ештеңе жоқ/i,
];

const UNFINISHED_STATIC = UNFINISHED.filter((r) => !/\\{\\{/.test(r.source));

/* ───────────── test data (CT2) ───────────── */
export const TEST_DATA = [
  /\btest ?(user|company|account|customer|client|specialist|name|order|project)\b/i, /\btest (\w+ ){1,2}account\b/i, /\btest ?\d+\b/i,
  /\bnew (company|address|user|project|item) \d+\b/i, /\b(john|jane) doe\b/i, /\basdf\w*/i, /\bqwerty\w*/i, /\bfoo ?bar\b/i,
  /[\w.+-]+@example\.(com|org|net)\b/i, /\b0{6,}\b/, /\b1234567890?\b/,
];

/* ───────────── raw errors in UI (CT3) ───────────── */
export const RAW_ERROR = [
  /\[object Object\]/, /\bNaN\b/, /\bundefined\b/, /(?<![\w-])null(?! (and|or) void)\b(?!\s*[-–]\s*\w)/, /\bInvalid Date\b/,
  /^\s*Error:/, /\b(TypeError|ReferenceError|SyntaxError|RangeError|AxiosError|FetchError|AbortError|ZodError)\b/,
  /\bPrisma\w*(Error|Exception)\b|\bInvalid `prisma\.|\bP20\d\d\b/, /\bat \w[\w.$<>]* \(.*:\d+:\d+\)/, /\bCredentialsSignin\b|\bOAuthAccountNotLinked\b|\bAccessDenied\b|\berror=Configuration\b/,
  /\bECONNREFUSED\b|\bETIMEDOUT\b|\bENOTFOUND\b/, /\bInternal Server Error\b/i, /^\s*error\s*500\s*$|\b(error|status|code) 500\b|\b500 (internal|server|error)\b/i,
  /\bUnexpected token\b|\bis not a function\b|\bCannot read propert(y|ies) of\b/,
];
// what i18n values may legitimately say: "Error: …" as a message prefix is the app's own copy there
const RAW_ERROR_STATIC = RAW_ERROR.filter((r) => !/Error:|500/.test(r.source) && !/null/.test(r.source));

/* ───────────── dates (CT6 / CT7) ───────────── */
const MONTHS = {
  en: ["jan(uary)?", "feb(ruary)?", "mar(ch)?", "apr(il)?", "may", "june?", "july?", "aug(ust)?", "sep(t(ember)?)?", "oct(ober)?", "nov(ember)?", "dec(ember)?"],
  ru: ["январ[яь]", "феврал[яь]", "марта?", "апрел[яь]", "ма[яй]", "июн[яь]", "июл[яь]", "августа?", "сентябр[яь]", "октябр[яь]", "ноябр[яь]", "декабр[яь]"],
  az: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"],
  kk: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"],
};
// non-capturing inside, so the date patterns' group numbers stay put
const MONTH_ALT = Object.values(MONTHS).flat().join("|").replace(/\((?!\?)/g, "(?:");
const monthIndex = (name) => {
  const n = name.toLowerCase().replace(/\.$/, "");
  for (const list of Object.values(MONTHS)) { const i = list.findIndex((p) => new RegExp(`^(${p})$`, "i").test(n)); if (i >= 0) return i + 1; }
  return 0;
};
const YEAR = "(?:19|20)\\d\\d";
// Unicode-aware word edges: \b does not work next to Cyrillic letters
const L = "(?<![\\p{L}\\d])", R = "(?![\\p{L}\\d])";
const DATE_PATTERNS = [
  { kind: "Month D, YYYY", re: new RegExp(`${L}(${MONTH_ALT})\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (${YEAR})${R}`, "giu"), parse: (m) => [m[3], monthIndex(m[1]), m[2]] },
  { kind: "D Month YYYY", re: new RegExp(`${L}(\\d{1,2})(?:st|nd|rd|th)?\\.? (?:of )?(${MONTH_ALT})\\.?,? (${YEAR})(?: ?(?:г\\.?|года|ж\\.?|жыл\\w*|il))?${R}`, "giu"), parse: (m) => [m[3], monthIndex(m[2]), m[1]] },
  { kind: "Month YYYY", re: new RegExp(`${L}(${MONTH_ALT})\\.?,? (${YEAR})${R}`, "giu"), parse: (m) => [m[2], monthIndex(m[1]), null] },
  { kind: "ISO date", re: new RegExp(`${L}(${YEAR})-(\\d\\d)-(\\d\\d)(?:[T ]\\d\\d:\\d\\d(?::\\d\\d(?:\\.\\d+)?)?(?:Z|[+-]\\d\\d:?\\d\\d)?)?${R}`, "gu"), parse: (m) => [m[1], m[2], m[3]] },
  { kind: "numeric date", re: new RegExp(`${L}(\\d{1,2})([./-])(\\d{1,2})\\2(${YEAR}|\\d\\d)${R}`, "gu"), parse: (m) => (Number(m[1]) > 12 || (m[2] !== "/" && Number(m[3]) <= 12) ? [m[4], m[3], m[1]] : [m[4], m[1], m[3]]) },
];

/** The accepted format as a regex: DD.MM.YYYY, D.M.YYYY, DD/MM/YYYY, YYYY-MM-DD, MMMM D, YYYY … */
export function formatRegex(fmt = "DD.MM.YYYY") {
  const esc = fmt.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const src = esc.replace(/YYYY|MMMM|MMM|MM|M|DD|D/g, (t) => ({ YYYY: YEAR, MMMM: `(?:${MONTH_ALT})`, MMM: `(?:${MONTH_ALT})\\.?`, MM: "(?:0[1-9]|1[0-2])", M: "(?:[1-9]|1[0-2])", DD: "(?:0[1-9]|[12]\\d|3[01])", D: "(?:[1-9]|[12]\\d|3[01])" })[t]);
  return new RegExp(`^${src}$`, "iu");
}

/** Every date-like string in a text: { text, kind, iso (YYYY-MM-DD or YYYY-MM), index }. Overlaps resolved longest first. */
export function findDates(text) {
  const hits = [];
  for (const p of DATE_PATTERNS) {
    p.re.lastIndex = 0;
    for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
      const [y, mo, d] = p.parse(m);
      const yy = String(y).length === 2 ? `20${y}` : String(y);
      const mm = Number(mo), dd = d == null ? null : Number(d);
      if (!mm || mm > 12 || (dd != null && (dd < 1 || dd > 31))) continue;
      if (p.kind === "numeric date" && String(y).length === 2 && m[2] === ".") continue; // 1.2.26 reads as a version
      hits.push({ text: m[0], kind: p.kind, index: m.index, end: m.index + m[0].length, iso: `${yy}-${String(mm).padStart(2, "0")}${dd == null ? "" : "-" + String(dd).padStart(2, "0")}` });
    }
  }
  hits.sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const out = [];
  for (const h of hits) if (!out.some((o) => h.index < o.end && h.end > o.index)) out.push(h);
  return out;
}

// the label opens the line ("Last updated: …", "Effective from …"); "we update the Last updated date" is prose
const labelAtStart = (t) => { const m = String(t).match(LAST_UPDATED_RE); return m && (m.index <= 3 || t.length <= 60) ? m : null; };
export const LAST_UPDATED_RE = /(last (updated|modified|revised|reviewed)|updated( on)?:|date of last (update|revision)|effective (date|from|as of|since)|valid from|son (yenilənmə|dəyişiklik)|qüvvəyə minmə tarixi|последнее обновление|последние изменения|обновлено|дата вступления|соңғы (жаңарту|жаңартылған|өзгеріс)|күшіне ен)/i;
const lastUpdatedKind = (t) => (/effective|valid from|qüvvəyə|вступления|күшіне/i.test(t) ? "effective" : "updated");

/** CT6 — dates in the configured format; CT7 — a "Last updated" line carries a date. */
export function dateFindings(seg, cfg = CONTENT_DEFAULTS) {
  const out = [];
  const accept = formatRegex(cfg.dateFormat || "DD.MM.YYYY");
  for (const d of findDates(seg.text)) {
    if (accept.test(d.text)) continue;
    out.push(f("content/date-format", `date "${d.text}" is not in the site's format ${cfg.dateFormat || "DD.MM.YYYY"} (${d.kind})`, `write it as ${example(cfg.dateFormat || "DD.MM.YYYY", d.iso)} — one date format everywhere`, d.text));
  }
  const lu = labelAtStart(seg.text);
  // a message file / JSX keeps the label and the date apart ("Last updated: {date}"): only a rendered page can tell
  if (lu && !seg.static && seg.text.length < 200 && !findDates(seg.text).length && !seg.followedByDate)
    out.push(f("content/last-updated", `"${q(seg.text, 60)}" has no date`, `put the date right after it, as ${example(cfg.dateFormat || "DD.MM.YYYY", "2026-10-01")}`, lu[0]));
  return out;
}
export function example(fmt, iso) {
  const [y, m, d = "01"] = iso.split("-");
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return fmt.replace(/YYYY|MMMM|MMM|MM|M|DD|D/g, (t) => ({ YYYY: y, MMMM: names[m - 1], MMM: names[m - 1].slice(0, 3), MM: m, M: String(Number(m)), DD: d, D: String(Number(d)) })[t]);
}

/** "Last updated" lines of one document: { kind, iso, text } — for "the same document shows the same date everywhere". */
export function lastUpdatedDates(segments) {
  const out = [];
  segments.forEach((s, i) => {
    const m = labelAtStart(s.text);
    if (!m || s.text.length > 240) return;
    let ds = findDates(s.text.slice(m.index));
    if (!ds.length && segments[i + 1] && segments[i + 1].text.length < 60) ds = findDates(segments[i + 1].text); // "Last updated" / "01.10.2026" in two spans
    if (ds.length) out.push({ kind: lastUpdatedKind(m[0]), iso: ds[0].iso, text: q(s.text, 80), seg: s });
  });
  return out;
}

/* ───────────── punctuation (CT4 / CT5) ───────────── */
const ABBR_END = /\b(inc|ltd|llc|co|corp|etc|st|jr|sr|vs|no|approx|dept|est|p\.?l\.?c|s\.?a|b\.?v|sp\. z o\.o|o\.o|u\.s|e\.g|i\.e)\.$/i;
/** CT4 — no trailing period in h1–h3, button labels, nav items, titles. */
export function trailingPeriod(seg) {
  if (!["heading", "button", "nav", "title"].includes(seg.kind)) return [];
  const t = seg.text.trim();
  // "Vusal A." — a name with its initial
  if (!/[^.]\.$/.test(t) || /\.\.\.$|…$/.test(t) || ABBR_END.test(t) || /(^|\s)\p{Lu}\.$/u.test(t) || t.length > 160) return [];
  return [f("content/trailing-period", `${seg.kind === "heading" ? "heading" : seg.kind === "nav" ? "nav item" : seg.kind === "title" ? "page title" : "button label"} "${q(t, 70)}" ends with a period`, "drop the final period — headings, buttons and menu items never end with one", ".")];
}
/** CT5 — no em dash "—" and no "--" in user copy (studio rule). */
export function dashes(seg, cfg = CONTENT_DEFAULTS) {
  if (cfg.dashes === "allow") return [];
  const m = seg.text.match(/—|(?<![-<!])--(?![->])/);
  if (!m) return [];
  if ((cfg.allowDash || []).some((r) => new RegExp(r, "i").test(seg.text))) return [];
  const lone = seg.text.trim() === m[0];
  return [f("content/dash", lone ? `"${m[0]}" shown as an empty value` : `"${m[0]}" in copy: "${q(around(seg.text, m.index), 70)}"`,
    lone ? 'write what it means ("Not set", "None") or leave the cell empty' : 'rewrite without the dash: a comma, a colon, a full stop or brackets (studio rule: no "—" in user copy)', m[0])];
}
const around = (t, i, r = 30) => (i > r ? "…" : "") + t.slice(Math.max(0, i - r), i + r) + (i + r < t.length ? "…" : "");

/* ───────────── grammar tokens (CT8) ───────────── */
const NOT_PLURAL = /(ss|us|is|ics|ous|news|series|species|plus|yes|this|its|has|was|does|less|always|perhaps|towards|afterwards|whereas|minus|status|bonus|campus|canvas|gas|bus|lens|chaos|atlas|alias|analysis|basis|crisis|thesis|axis|kudos|pros|cons|sales|terms|lots|tens|plans)$/i;
const COUNTABLE = "item|credit|profile|service|day|hour|minute|month|year|user|task|result|review|order|project|file|specialist|page|step|seat|member|message|notification|week|second|request|offer|job|expert|product|post|comment|reply|point|match|ticket|session|lesson|report|invoice|payment|transaction|booking|listing|vote|star|rating|photo|image|video|document|word|character|attempt|time";
const SINGULAR_AFTER = new RegExp(`(?<![\\d.,/:#-])\\b(0|[2-9]|[1-9]\\d+) (${COUNTABLE})(?=\\s*($|[.,;:!?)]|\\s(left|ago|remaining|found|selected|total|available|per|in|on|and|or|from|to|of|max|min)\\b))`, "i");
const ONE_PLURAL = /(?<![\d.,/:#$€£-])\b1 ([A-Za-z]{2,}[sS])\b/;
/** CT8 — number + noun agreement, double spaces, a space before punctuation, unmatched quotes and brackets. */
export function grammar(seg) {
  const out = [];
  const t = seg.text;
  const one = t.match(ONE_PLURAL);
  if (one && !NOT_PLURAL.test(one[1]) && !/^(1 (of|in|out|per|minus|plus|x)\b)/i.test(one[0]))
    out.push(f("content/grammar", `"${q(around(t, one.index, 24), 60)}": "1 ${one[1]}" — one of something is singular`, `use a plural rule (ICU {count, plural, one {# ${one[1].replace(/ies$/i, "y").replace(/s$/i, "")}} other {# ${one[1]}}}) instead of a fixed word`, one[0]));
  const sing = t.match(SINGULAR_AFTER);
  if (sing) out.push(f("content/grammar", `"${q(around(t, sing.index, 24), 60)}": "${sing[0]}" — needs the plural`, "use a plural rule (ICU plural / Intl.PluralRules) for the noun after a count", sing[0]));
  const dbl = t.match(/\S( {2,})\S/);
  if (dbl && !seg.collapsed) out.push(f("content/grammar", `double space in "${q(around(t, dbl.index, 24), 60)}"`, "one space between words", "  "));
  const sp = t.match(/[\p{L}\d] ([,.;:!?])(?=\s|$)(?!\.)/u);
  if (sp && !/ \.\w/.test(t.slice(sp.index, sp.index + 4))) out.push(f("content/grammar", `space before "${sp[1]}" in "${q(around(t, sp.index, 24), 60)}"`, "no space before a comma, full stop, colon or question mark", ` ${sp[1]}`));
  for (const [o, c, name] of [["“", "”", "curly quotes"], ["«", "»", "guillemets"], ["(", ")", "brackets"]]) {
    const a = t.split(o).length - 1, b = t.split(c).length - 1;
    if (a !== b && !(o === "(" && /\b\d+\)|\b[a-z]\)\s/.test(t))) out.push(f("content/grammar", `unmatched ${name} (${a} "${o}", ${b} "${c}") in "${q(t, 60)}"`, "close what you open", o));
  }
  const straight = (t.replace(/\b\d+(\.\d+)?"/g, "").match(/"/g) || []).length;
  if (straight % 2) out.push(f("content/grammar", `odd number of straight quotes in "${q(t, 60)}"`, "close the quote (and prefer “ ” / « » in copy)", '"'));
  return out;
}

/* ───────────── emails (CT9) ───────────── */
export const EMAIL_RE = /(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])/g;
export const findEmails = (text) => [...new Set((String(text).match(EMAIL_RE) || []).map((e) => e.replace(/\.$/, "")).filter((e) => !/\.(png|jpe?g|webp|avif|svg|gif|ico)$/i.test(e)))];
/** Domains that can never receive mail for the product: preview hosts, local and reserved names. */
export const UNDELIVERABLE_HOST = /(^|\.)(vercel\.app|netlify\.app|pages\.dev|herokuapp\.com|onrender\.com|railway\.app|up\.railway\.app|fly\.dev|vercel\.dev|ngrok\.io|ngrok-free\.app|github\.io|web\.app|firebaseapp\.com|localhost|local|test|invalid|example|example\.(com|org|net))$/i;
export function emailDomainProblem(email) {
  const host = email.split("@")[1]?.toLowerCase() || "";
  if (UNDELIVERABLE_HOST.test(host)) return `${email} is on ${host.match(UNDELIVERABLE_HOST)[0].replace(/^\./, "")} — a preview / reserved host that has no mailbox; mail to it bounces`;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return `${email} is on a bare IP address`;
  return null;
}

/* ───────────── untranslated / mixed language (CT11) ───────────── */
const EN_STOP = new Set("the and your you with for this that from will can not our are have has which when what been were they their there into than about would should could please here more only after before cannot don't won't isn't aren't we're you're it's".split(" "));
const CYRILLIC_LOCALES = /^(ru|kk|uk|be|bg|sr|mk|ky|tg|mn|tt|ba)\b/i, ARABIC_LOCALES = /^(ar|fa|ur|ps|ug|he|yi)\b/i;
export const isRtl = (code) => /^(ar|fa|ur|ps|ug|he|yi|dv|ku)\b/i.test(code || "");
export const stripNoise = (t, brand = []) => {
  // identifiers (cookie names "__Host-authjs.csrf-token", keys, file names) are not language
  let s = String(t).replace(/https?:\/\/\S+|www\.\S+/g, " ").replace(/\S*(__|[A-Za-z0-9]_[A-Za-z0-9]|[a-z]\.[a-z])\S*/g, " ").replace(EMAIL_RE, " ").replace(/\{[^{}]*\}|\{\{[^}]*\}\}|%\w|<[^>]+>/g, " ");
  for (const b of brand) if (b) s = s.replace(new RegExp(`(?<![\\p{L}])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu"), " ");
  return s;
};
/**
 * English left in a non-English locale. Signals: two or more English function words (the, and, your…) in three or
 * more Latin words; for a Cyrillic / Arabic-script locale also a run of Latin-only words with no native letters.
 * Brand words, ALLCAPS acronyms, emails, URLs and {placeholders} do not count.
 */
export function englishIn(text, locale, brand = []) {
  if (!locale || /^en\b/i.test(locale)) return null;
  const s = stripNoise(text, brand);
  const words = (s.match(/[A-Za-z][A-Za-z'’]+/g) || []).filter((w) => !/^[A-Z0-9]{2,}$/.test(w) && !/[a-z][A-Z]/.test(w));
  if (words.length < 3) return null;
  const stops = new Set(words.map((w) => w.toLowerCase().replace(/’/g, "'")).filter((w) => EN_STOP.has(w)));
  const native = CYRILLIC_LOCALES.test(locale) ? /[\u0400-\u04FF]/ : ARABIC_LOCALES.test(locale) ? /[\u0590-\u06FF\u0750-\u077F]/ : null;
  if (stops.size >= 2) return words.slice(0, 8).join(" ");
  // Latin-only copy in a Cyrillic / Arabic-script locale: lowercase words (and the first word) — a row of capitalised
  // names ("Visa Mastercard Apple Pay") is brands, not a sentence
  if (native && !native.test(s) && words.filter((w, i) => w.length >= 3 && (i === 0 || /^[a-z]/.test(w))).length >= 3) return words.slice(0, 8).join(" ");
  return null;
}
/** A translation key printed instead of its text: "home.title", "common.viewAll", "auth.errors.invalid_email". */
export function looksLikeKey(text, keys = null) {
  const t = String(text).trim();
  if (keys && keys.has(t)) return true;
  if (!/^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){1,5}$/.test(t)) return false;
  const last = t.split(".").pop();
  if (/^(com|net|org|io|app|pro|dev|ai|co|uk|de|ru|kz|az|me|tv|xyz|info|biz|eu|us|shop|store|boutique|space|site|online|tech|cloud|js|ts|tsx|jsx|css|json|html|pdf|png|jpe?g|svg|webp|gif|zip|csv|txt|md|mp4|mp3)$/i.test(last)) return false;
  return t.split(".").length >= 3 || /[A-Z_]/.test(t) || /^(common|home|nav|footer|header|auth|errors?|pages?|legal|dashboard|settings|form|buttons?|labels?|messages?|meta|seo|actions?|landing|pricing|account|profile|admin|onboarding|cookies?|modal|dialog)\./.test(t);
}

/* ───────────── legal names (CT15) and glossary (CT17) ───────────── */
// the families of names a legal document goes by; the footer's name is the canonical one
export const LEGAL_FAMILIES = {
  terms: /\b(Terms of (Service|Use)|Terms (and|&) Conditions|General Terms|User Agreement|Terms)\b/g,
  privacy: /\b(Privacy (Policy|Notice|Statement)|Data Protection Policy)\b/g,
  cookies: /\b(Cookies? (Policy|Notice|Statement))\b/g,
  refund: /\b(Refund( (and|&) (Cancellation|Return))? Policy|Return(s)? Policy|Refunds Policy)\b/g,
  cancellation: /\b(Cancellation Policy)\b/g,
  aml: /\b(AML( (and|&|\/) KYC)?( Policy)?|Anti[- ]Money Laundering( Policy)?)\b/g,
  license: /\b(Licen[cs]e Agreement|Deliverables and Licen[cs]e|End[- ]User Licen[cs]e Agreement|EULA)\b/g,
  shipping: /\b(Shipping( (and|&) Delivery)? Policy|Delivery Policy)\b/g,
  payments: /\b(Payments? Policy)\b/g,
  acceptable: /\b(Acceptable Use Policy)\b/g,
};
export function legalFamily(name) {
  for (const [k, re] of Object.entries(LEGAL_FAMILIES)) { re.lastIndex = 0; const m = re.exec(name); if (m && m[0].length >= name.trim().length - 2) return k; }
  return null;
}
// footer links carry arrows ("Privacy Policy →"); they are decoration, not the name
export const normName = (s) => String(s || "").replace(/[\s\u2190-\u21FF\u2794-\u27BF›»↗→]+$/u, "").replace(/\s+/g, " ").replace(/&/g, "and").replace(/[’']/g, "'").trim().toLowerCase();

/** CT17 — one term per concept: configured variants, plus the auth-verb pairs every product mixes up. */
export function glossaryFindings(seg, glossary = {}) {
  const out = [];
  for (const [term, variants] of Object.entries(glossary || {}))
    for (const v of variants || []) {
      const m = seg.text.match(new RegExp(`(?<![\\p{L}])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu"));
      if (m) out.push(f("content/glossary", `"${m[0]}" — this product calls it "${term}"`, `write "${term}" (babysitter.config.json → content.glossary)`, m[0]));
    }
  return out;
}
export const AUTO_VARIANTS = [
  { concept: "sign in", forms: [/\bsign[- ]?in\b/i, /\blog[- ]?in\b/i] },
  { concept: "sign up", forms: [/\bsign[- ]?up\b/i, /\bregister\b/i] },
  { concept: "sign out", forms: [/\bsign[- ]?out\b/i, /\blog[- ]?out\b/i] },
  { concept: "email", forms: [/\bemail\b/i, /\be-mail\b/i] },
];

/* ───────────── numeric facts (CT18) ───────────── */
const FACT_KEYS = [
  { key: "refund", re: /\brefund\w*|money[- ]back|возврат\w*|geri qaytar\w*|қайтар\w*/i },
  { key: "fee", re: /\b(fee|commission|service charge|take rate|комисси\w*|komissiya\w*)\b/i },
  { key: "response time", re: /\b(respond|response|reply|replies|answer|get back|support)\b/i },
  { key: "trial", re: /\b(free trial|trial)\b/i },
  { key: "cancel", re: /\bcancel\w*\b/i },
  { key: "payout", re: /\b(payout|withdraw\w*|paid out)\b/i },
  { key: "delivery", re: /\b(deliver\w*|turnaround|ready in)\b/i },
  { key: "limit", re: /\b(limit|max(imum)?|min(imum)?|up to|at least)\b/i },
  { key: "credit price", re: /\bcredits?\b/i },
  { key: "dispute", re: /\b(dispute|chargeback|complain\w*)\b/i },
  { key: "storage", re: /\b(store|stored|retain\w*|kept|delete\w*)\b/i },
];
const UNITS = [
  { unit: "%", re: /(\d+(?:[.,]\d+)?)\s?%/g },
  { unit: "days", re: /(\d+)(?:\s|-)?(business |working |calendar )?days?\b/gi },
  { unit: "hours", re: /(\d+)(?:\s|-)?(hours?|hrs?|h)\b/gi },
  { unit: "minutes", re: /(\d+)(?:\s|-)?(minutes?|mins?)\b/gi },
  { unit: "months", re: /(\d+)(?:\s|-)?months?\b/gi },
  { unit: "credit=$", re: /(\d+(?:[.,]\d+)?)\s?credits?\s?(?:=|for|per|costs?)\s?[$€£]\s?(\d+(?:[.,]\d+)?)/gi },
  { unit: "$=credit", re: /[$€£]\s?(\d+(?:[.,]\d+)?)\s?(?:=|for|buys|gets)\s?(\d+(?:[.,]\d+)?)\s?credits?/gi },
];
/** Facts in one text: { key, unit, value, quote }. The keyword must sit within ~8 words of the number. */
export function numericFacts(text) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    if (sentence.length > 400) continue;
    for (const u of UNITS) {
      u.re.lastIndex = 0;
      for (let m = u.re.exec(sentence); m; m = u.re.exec(sentence)) {
        const win = sentence.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
        const value = u.unit === "credit=$" || u.unit === "$=credit" ? `${m[1]}:${m[2]}` : `${m[1]}${m[2] && u.unit === "days" ? " " + m[2].trim() : ""}`;
        for (const k of FACT_KEYS) {
          if ((u.unit === "credit=$" || u.unit === "$=credit") && k.key !== "credit price") continue;
          if (k.key === "credit price" && !(u.unit === "credit=$" || u.unit === "$=credit")) continue;
          if (k.key === "limit" && u.unit !== "%") continue;
          if (!k.re.test(win)) continue;
          out.push({ key: k.key, unit: u.unit, value, quote: q(sentence, 140) });
          break;
        }
      }
    }
  }
  return out;
}
/** Conflicts: the same keyword + unit with different values, in different places. Soft: a human decides. */
export function factConflicts(facts) {
  const by = new Map();
  for (const x of facts) { const k = `${x.key}|${x.unit}`; (by.get(k) || by.set(k, []).get(k)).push(x); }
  const out = [];
  for (const [k, list] of by) {
    const values = [...new Set(list.map((x) => x.value))];
    if (values.length < 2) continue;
    const a = list.find((x) => x.value === values[0]), b = list.find((x) => x.value === values[1]);
    if (a.where === b.where && a.quote === b.quote) continue;
    out.push(f("content/numeric-fact", `${k.split("|")[0]} (${k.split("|")[1]}): ${values.join(" vs ")} — "${a.quote}" (${a.where}) vs "${b.quote}" (${b.where})${values.length > 2 ? ` and ${values.length - 2} more value(s)` : ""}`, "check which is true and say the same thing everywhere", values.join(" vs ")));
  }
  return out;
}

/* ───────────── one segment, every phrase rule ───────────── */
const firstMatch = (list, t) => { for (const r of list) { const m = t.match(r); if (m) return m; } return null; };
/**
 * All per-segment rules (CT1–CT8, CT17). `ctx.static` = an i18n / JSX string (not rendered): the rules that need
 * rendering context are adapted (no "Error:" prefix rule, double spaces count).
 */
export function lintSegment(seg, cfg = CONTENT_DEFAULTS, ctx = {}) {
  const t = String(seg.text || "");
  if (!t.trim()) return [];
  const allowed = (m) => (cfg.allowPhrases || []).some((r) => new RegExp(r, "i").test(t)) || false;
  const out = [];
  const skip = new Set(cfg.skip || []);
  const add = (list) => { for (const x of list) if (!skip.has(x.id) && !skip.has(x.rule) && !allowed(x.match)) out.push(x); };
  // {{name}} is an i18n placeholder in a message file; printed on a page it is an unrendered template
  const un = firstMatch(ctx.static ? UNFINISHED_STATIC : UNFINISHED, t);
  // "the rate isn't available yet, try again in a minute" is a transient error, not a missing feature
  const transient = un && /available yet/i.test(un[0]) && /\b(try again|retry|refresh|in a (moment|minute|few))\b|yenidən (cəhd|yoxla)|қайталап көріңіз|попробуйте (ещё|еще|снова)/i.test(t);
  if (un && !transient && !(seg.kind === "placeholder" && /placeholder/i.test(un[0])))
    add([f("content/unfinished", `unfinished / defensive copy in production: "${un[0]}" — "${q(around(t, un.index, 40), 80)}"`, "say what the product does now, or remove the block until it works; no build notes, no apologies, no template markers", un[0])]);
  if (seg.kind !== "placeholder" && !ctx.example) {
    const td = firstMatch(TEST_DATA, t);
    // "enter an address like you@example.com" is a hint, not data
    const hint = td && /@example\./i.test(td[0]) && /\b(like|e\.g\.|for example|such as|for instance|format)\b|məs\.|məsələn|например|мысалы|формат/i.test(t.slice(Math.max(0, td.index - 40), td.index));
    if (td && !hint) add([f("content/test-data", `test data shown to users: "${td[0]}"`, "replace with real content (or hide test records from production listings)", td[0])]);
  }
  const re = firstMatch(ctx.static ? RAW_ERROR_STATIC : RAW_ERROR, t);
  if (re && !(seg.kind === "placeholder")) add([f("content/raw-error", `raw error / programming value in the UI: "${re[0]}" — "${q(around(t, re.index, 30), 70)}"`, "catch it and show a plain message (what happened + what to do); never print error codes, stack traces or undefined/NaN", re[0])]);
  add(trailingPeriod(seg));
  add(dashes(seg, cfg));
  add(dateFindings({ ...seg, static: !!ctx.static }, cfg));
  add(grammar({ ...seg, collapsed: !ctx.static && seg.collapsed !== false }));
  add(glossaryFindings(seg, cfg.glossary));
  return out;
}
