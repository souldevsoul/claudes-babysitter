// Which languages does the product speak, and how does a check switch to one?
//
// Praxis (2026-10) was checked in English only: six cards were AZ/KK layout breaks (a header profile block, a
// dialog button, a CTA past the screen edge) that the very checks that passed in English would have failed. The
// language lives in different places per product — a /az URL prefix (next-intl), a NEXT_LOCALE cookie, a
// localStorage key set by a switcher (Praxis "praxis-locale"), a ?lang= parameter, another domain — so prepare.mjs
// finds the codes (this file reads the repo; the browser reads <link hreflang> and the language switcher) and records
// HOW each one is switched on in .babysitter/locales.json. The specs then open every page in every locale that way.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// codes the language-switcher probe recognises by name as well as by code
export const LANGUAGE_NAMES = {
  en: ["english", "eng"], ru: ["русский", "рус"], az: ["azərbaycan", "azərbaycanca", "azerbaijani", "aze"], kk: ["қазақ", "қазақша", "kazakh", "қаз", "kaz"],
  uk: ["українська", "укр"], be: ["беларуская"], uz: ["o'zbek", "oʻzbekcha", "uzbek", "ўзбек"], ky: ["кыргызча", "kyrgyz"], tg: ["тоҷикӣ"], ka: ["ქართული", "georgian"],
  hy: ["հայերեն", "armenian"], tr: ["türkçe", "turkish"], de: ["deutsch", "german"], fr: ["français", "francais", "french"], es: ["español", "espanol", "spanish"],
  it: ["italiano", "italian"], pt: ["português", "portugues", "portuguese"], pl: ["polski", "polish"], nl: ["nederlands", "dutch"], ro: ["română", "romana"],
  cs: ["čeština", "czech"], sk: ["slovenčina"], hu: ["magyar"], sv: ["svenska"], fi: ["suomi"], da: ["dansk"], no: ["norsk"], et: ["eesti"], lv: ["latviešu"], lt: ["lietuvių"],
  el: ["ελληνικά"], bg: ["български"], sr: ["српски", "srpski"], hr: ["hrvatski"], he: ["עברית"], ar: ["العربية"], fa: ["فارسی"], hi: ["हिन्दी"],
  zh: ["中文", "简体中文", "繁體中文"], ja: ["日本語"], ko: ["한국어"], vi: ["tiếng việt"], th: ["ไทย"], id: ["bahasa indonesia"], ms: ["bahasa melayu"],
};
const CODE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
export const isLocaleCode = (s) => CODE_RE.test(String(s || "")) && (String(s).split("-")[0].toLowerCase() in LANGUAGE_NAMES);
const base = (s) => String(s || "").split("-")[0].toLowerCase();

const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
function walk(dir, depth, out = []) {
  if (depth < 0 || !existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (/^(node_modules|\.next|\.git|dist|build|out|coverage|\.babysitter|tools|test-results)$/.test(f)) continue;
    const p = join(dir, f);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, depth - 1, out); else out.push(p);
  }
  return out;
}

/**
 * Locales the source declares: next.config i18n.locales, next-intl / i18next / react-intl configs
 * (`locales: ["en", "az"]`), a `type Locale = "kk" | "en" | "az"`, message files (messages/az.json, locales/az/*.json,
 * translations/az.json), and an app/[locale] segment (→ the URL carries the language). Also the localStorage key and
 * the cookie the code uses for the language, when it names them. Nothing found → { codes: [] }.
 * @returns {{ codes: string[], default: string|null, prefix: boolean, storageKey: string|null, cookie: string|null, from: string[] }}
 */
export function repoLocales(root) {
  const res = { codes: [], default: null, prefix: false, storageKey: null, cookie: null, from: [] };
  if (!root || !existsSync(join(root, "package.json"))) return res;
  const files = walk(root, 6).map((f) => f.slice(root.length + 1));
  const add = (codes, from) => { let n = 0; for (const c of codes) if (isLocaleCode(c) && !res.codes.includes(c)) { res.codes.push(c); n++; } if (n) res.from.push(from); };
  // app/[locale] or pages/[locale]: the language is in the URL
  if (files.some((f) => /(^|\/)(app|pages)\/\[(locale|lang|lng|language)\]\//.test(f))) { res.prefix = true; res.from.push("app/[locale]"); }
  for (const f of files) {
    if (!/\.(t|j)sx?$|\.mjs$|\.cjs$/.test(f) || /\.(test|spec)\./.test(f)) continue;
    if (!/(^|\/)(next\.config|i18n|middleware|routing|request|i18next|intl|locale|locales|lang|context|config|settings)[^/]*$|(^|\/)(i18n|locales|intl)\//.test(f)) continue;
    const src = read(join(root, f));
    if (!/locale|lang|i18n|intl/i.test(src)) continue;
    for (const m of src.matchAll(/\blocales\s*:\s*\[([^\]]*)\]/g)) add([...m[1].matchAll(/["'`]([A-Za-z-]{2,8})["'`]/g)].map((x) => x[1]), `${f} locales`);
    for (const m of src.matchAll(/type\s+(?:Locale|Lang|Language|AppLocale)\s*=\s*([^;\n]+)/g)) add([...m[1].matchAll(/["'`]([A-Za-z-]{2,8})["'`]/g)].map((x) => x[1]), `${f} type Locale`);
    const d = src.match(/\bdefaultLocale\s*:\s*["'`]([A-Za-z-]{2,8})["'`]/) || src.match(/\b(?:DEFAULT_LOCALE|defaultLocale|DEFAULT_LANG|fallbackLng)\s*[:=]\s*["'`]([A-Za-z-]{2,8})["'`]/);
    if (d && !res.default && isLocaleCode(d[1])) res.default = d[1];
    const sk = src.match(/localStorage\.(?:getItem|setItem)\(\s*([A-Z_]+|["'`][^"'`]+["'`])/);
    if (sk && /locale|lang|i18n/i.test(src) && !res.storageKey) {
      let k = sk[1];
      if (/^[A-Z_]+$/.test(k)) { const v = src.match(new RegExp(`\\b${k}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`)); k = v ? v[1] : null; } else k = k.slice(1, -1);
      if (k) res.storageKey = k;
    }
    const ck = src.match(/["'`](NEXT_LOCALE|[\w-]*(?:locale|lang)[\w-]*)["'`]\s*(?:,|\))[^\n]{0,40}cookie|cookies?\(\)\s*\.(?:get|set)\(\s*["'`]([\w-]*(?:locale|lang)[\w-]*)["'`]/i);
    if (ck && !res.cookie) res.cookie = ck[1] || ck[2];
    if (!res.cookie && /NEXT_LOCALE/.test(src)) res.cookie = "NEXT_LOCALE";
  }
  // message files: messages/az.json, locales/az/common.json, translations/az.json, i18n/az.json
  for (const f of files) {
    const m = f.match(/(?:^|\/)(?:messages|locales|translations|i18n|lang|langs|dictionaries|dict)\/([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)(?:\.json|\.ts|\.js|\/[^/]+\.json)$/);
    if (m) add([m[1]], `${f.split("/").slice(0, -1).join("/")}/*`);
  }
  if (!res.default && res.codes.includes("en")) res.default = "en";
  if (!res.default && res.codes.length) res.default = res.codes[0];
  return res;
}

/** A route path in locale `loc` ({ code, prefix?, defaultPrefix?, query? }); `def` is the default locale's record. */
export function localize(path, loc, def = null) {
  if (!loc || loc.default) return path;
  const [pathname, search = ""] = path.split("?");
  let pn = pathname;
  // the default locale's own prefix (always-prefixed sites: /en/pricing) is replaced, not stacked
  if (def?.prefix && (pn === def.prefix || pn.startsWith(def.prefix + "/"))) pn = pn.slice(def.prefix.length) || "/";
  if (loc.prefix) pn = `${loc.prefix}${pn === "/" ? "" : pn}` || "/";
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(loc.query || {})) params.set(k, v);
  const q = params.toString();
  return `${pn}${q ? `?${q}` : ""}`;
}

/** Is `path` a page of another (non-default) locale under a URL prefix? Such crawled pages are covered by the locale runs. */
export function inOtherLocale(path, locales) {
  return (locales?.locales || []).some((l) => !l.default && l.prefix && (path === l.prefix || path.startsWith(l.prefix + "/")));
}

/**
 * The locales a run covers: env LOCALES ("en,az,kk" — codes from the detected / configured list, or "default" for the
 * default only) narrows .babysitter/locales.json; babysitter.config.json → locales ({ default, list, prefix, cookie,
 * storageKey, query } or false) is the fallback when nothing was detected, or switches the matrix off.
 */
export function selectLocales(detected, cfgLocales, env = process.env.LOCALES) {
  if (cfgLocales === false) return { default: detected?.default || null, locales: (detected?.locales || []).filter((l) => l.default), off: "babysitter.config.json → locales: false" };
  let d = detected && detected.locales?.length ? detected : null;
  if (!d && cfgLocales && Array.isArray(cfgLocales.list) && cfgLocales.list.length) {
    const def = cfgLocales.default || cfgLocales.list[0];
    d = {
      default: def,
      locales: cfgLocales.list.map((code) => ({
        code, default: code === def,
        ...(code !== def && cfgLocales.prefix !== false && (cfgLocales.prefix || !cfgLocales.cookie && !cfgLocales.storageKey && !cfgLocales.query) ? { prefix: `/${code}` } : {}),
        ...(code !== def && cfgLocales.cookie ? { cookies: [{ name: cfgLocales.cookie, value: code }] } : {}),
        ...(code !== def && cfgLocales.storageKey ? { storage: [{ key: cfgLocales.storageKey, value: code }] } : {}),
        ...(code !== def && cfgLocales.query ? { query: { [cfgLocales.query]: code } } : {}),
        how: "babysitter.config.json → locales",
      })),
    };
  }
  if (!d) return { default: null, locales: [] };
  if (env) {
    const want = env.split(",").map((s) => s.trim()).filter(Boolean);
    if (want.includes("default")) return { ...d, locales: d.locales.filter((l) => l.default) };
    return { ...d, locales: d.locales.filter((l) => l.default || want.includes(l.code) || want.includes(base(l.code))) };
  }
  return d;
}
export { base as baseLang };
