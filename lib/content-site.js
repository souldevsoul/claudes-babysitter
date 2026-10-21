// The product's copy as one site, read from the source (no browser): every text with its language and place, every
// internal link with its label (translation keys followed to the default language), the pages (app routes) with the
// names they carry (<h1>, metadata title, the title a layout component gets), buttons that open the same thing, and
// the paths a link may point to. lib/content-consistency.js runs CT19–CT22 over it; `babysitter content` and
// `babysitter check` report each place to change as file:line. Docs: docs/checks-content.md.
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse as parseTs } from "@typescript-eslint/typescript-estree";
import { messageFileInfo, parseMessages, isJsxFile, jsxSegments, keyKind, repoFileList } from "./content-lint.js";
import { templateOf } from "./route-map.js";
import { resolveImport, aliasesOf } from "./components.js";
import { contentConfig, isFrench } from "./content-rules.js";
import { consistencyFindings, termGroups, termUses, policyFacts, amountCurrencies, documentNames, normLabel } from "./content-consistency.js";

const SKIP_PATH = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.git|\.babysitter|tools\/claudes-babysitter|vendor|public)\//;
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e|playwright|cypress|spec|fixtures?|mocks?|__mocks__|stories|storybook|scripts|prisma|seeds?|migrations|docs)\/|\.(test|spec|stories|e2e)\.[jt]sx?$|(^|\/)(seed|fixtures?)\.[jt]s$/i;
// server code, API routes, jobs and integrations print to logs and bots, not to the page
const SERVER_PATH = /(^|\/)(api|server|services?|jobs?|workers?|cron|webhooks?|automation|db|database|drizzle|emails?|templates|migrations)\/|(^|\/)(route|middleware|instrumentation[\w-]*)\.[jt]s$|\.server\.[jt]sx?$|(^|\/)(next|tailwind|postcss|vite|vitest|playwright|eslint|commitlint|lint-staged|checkly|drizzle)\.config\./i;
const COPY_TS = /(^|\/)(content|copy|constants?|data|legal|faq|marketing|site|config|i18n|navigation|nav|menu|footer|header|pages?|app|components?|features?)\//i;
const ADMIN = /(^|\/)\(?(admin|backoffice|back-office|internal|staff|ops)\)?\//i, ADMIN_KEY = /^(admin|backoffice)/i, ADMIN_ROUTE = /^\/(admin|backoffice|internal|staff)(\/|$)/i;
const LOCALE_SEG = /^\[(?:locale|lang|lng|language)\]$/;

/** "/[locale]/(unauth)/terms" → "/terms"; app route groups were already dropped by templateOf */
export const stripLocale = (tpl) => { const s = tpl.split("/").filter(Boolean); if (s.length && LOCALE_SEG.test(s[0])) s.shift(); return "/" + s.join("/"); };
const tplRe = (t) => new RegExp("^" + t.replace(/[.+^$()|\\]/g, "\\$&").replace(/\/\[\[\.\.\.\w+\]\]/g, "(?:/.*)?").replace(/\[\.\.\.\w+\]/g, ".+").replace(/\[\w+\]/g, "[^/]+") + "/?$");
const LOCALE_CODE = /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/;

/* ───────── small AST helpers ───────── */
const nameOf = (n) => { const x = n?.openingElement?.name; if (!x) return ""; if (x.type === "JSXIdentifier") return x.name; if (x.type === "JSXMemberExpression") return x.property.name; return ""; };
const attr = (el, name) => el.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === name);
const calleeName = (c) => { if (!c) return ""; if (c.type === "Identifier") return c.name; if (c.type === "MemberExpression") return `${calleeName(c.object)}.${c.property?.name || ""}`; return ""; };
const strOf = (node) => {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && !node.expressions.length) return node.quasis[0].value.cooked;
  if (node.type === "JSXExpressionContainer") return strOf(node.expression);
  return null;
};
/** an href as a site path: "/terms", `/${locale}/terms` → "/terms"; external, mailto, #, dynamic → null */
function hrefPath(node) {
  let raw = strOf(node);
  if (raw == null) {
    const e = node?.type === "JSXExpressionContainer" ? node.expression : node;
    if (e?.type === "TemplateLiteral" && e.expressions.length === 1 && e.quasis[0].value.cooked === "/" && /locale|lang|lng/i.test(calleeName(e.expressions[0]) || e.expressions[0].name || "")) raw = e.quasis[1].value.cooked || "/";
    else if (e?.type === "ObjectExpression") { const p = e.properties.find((x) => x.key?.name === "pathname"); raw = p ? strOf(p.value) : null; }
  }
  if (raw == null || !raw.startsWith("/") || raw.startsWith("//")) return null;
  // images, fonts and feeds are assets, not pages a reader is sent to
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|json|xml|txt|webmanifest|css|js)(\?|#|$)/i.test(raw)) return null;
  let p = raw.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const segs = p.split("/").filter(Boolean);
  if (segs.length && LOCALE_CODE.test(segs[0]) && segs[0].length === 2 && !["go", "my", "me", "up", "to", "us", "ai", "id"].includes(segs[0])) p = "/" + segs.slice(1).join("/");
  return p;
}
function walk(node, fn, parent = null, key = null) {
  if (!node || typeof node.type !== "string") return;
  if (fn(node, parent, key) === false) return;
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "parent" || k === "__p") continue;
    const v = node[k];
    if (Array.isArray(v)) for (const x of v) { if (x && typeof x.type === "string") { x.__p = node; walk(x, fn, node, k); } }
    else if (v && typeof v.type === "string") { v.__p = node; walk(v, fn, node, k); }
  }
}
const ancestors = function* (n) { for (let p = n.__p; p; p = p.__p) yield p; };

/* ───────── translation keys → default-language text ───────── */
function messageIndex(repo, files, cc) {
  const msgs = files.map(messageFileInfo).filter(Boolean);
  const byLocale = new Map();
  for (const m of msgs) (byLocale.get(m.locale) || byLocale.set(m.locale, []).get(m.locale)).push(m);
  const def = cc.defaultLocale && byLocale.has(cc.defaultLocale) ? cc.defaultLocale : [...byLocale.keys()].find((l) => /^en\b/i.test(l)) || [...byLocale.keys()][0];
  const map = new Map();
  const leaves = [];
  for (const m of msgs) {
    let ls = [];
    try { ls = parseMessages(m.file, readFileSync(join(repo, m.file), "utf8")); } catch { continue; }
    for (const l of ls) {
      leaves.push({ ...l, file: m.file, locale: m.locale });
      if (m.locale !== def) continue;
      map.set(l.key, l);
      // locales/en/common.json → "common:key" / "common.key"
      const ns = basename(m.file).replace(/\.\w+$/, "");
      if (!/^[a-z]{2}(?:[-_]\w+)?$/.test(ns)) { map.set(`${ns}.${l.key}`, l); map.set(`${ns}:${l.key}`, l); }
    }
  }
  return { map, leaves, def: def || "en", locales: [...byLocale.keys()] };
}
function resolveKey(idx, key, namespaces) {
  if (!key) return null;
  for (const ns of namespaces) { const l = idx.map.get(`${ns}.${key}`); if (l) return l; }
  const l = idx.map.get(key);
  if (l) return l;
  if (!namespaces.length) return null;
  const tails = [...idx.map.keys()].filter((k) => k.endsWith(`.${key}`));
  return tails.length === 1 ? idx.map.get(tails[0]) : null;
}

/* ───────── which strings in code are copy ───────── */
const NOT_COPY_PROP = /^(className|class|classes|href|src|srcSet|id|key|type|variant|size|icon|color|path|url|slug|value|method|role|name|ref|as|target|rel|style|tone|status|mode|kind|format|pattern|regex|query|endpoint|route|action|sort|field|column|accessorKey|dataKey|testId|data-\w+|aria-\w+|locale|lang|code|currency|unit|image|img|logo|avatar|font|width|height|align|position|side|placement|theme|layout|event|tag|tags|category|categories|provider|model|voice|voiceId|env|secret|token|hash|metaKey|keywords)$/i;
const SKIP_CALLEE = /^(console\.\w+|logger\.\w+|log|debug|require|import|fetch|t|t\.rich|t\.raw|t\.markup|i18n\.t|useTranslations|getTranslations|useTranslation|cn|clsx|cva|twMerge|twJoin|classNames|tv|styled\.\w+|z\.\w+|path\.\w+|URL|new URL|setTimeout|addEventListener|removeEventListener|querySelector\w*|getElementById|matchMedia|localStorage\.\w+|sessionStorage\.\w+|document\.\w+|window\.\w+|router\.\w+|redirect|permanentRedirect|notFound|revalidatePath|revalidateTag|cookies|headers|Symbol|RegExp|Intl\.\w+|toLocaleString|toLocaleDateString|format|dayjs|moment|captureException|track|gtag|posthog\.\w+|sendTelegram\w*|alert)$/;
const looksLikeCopy = (s) => {
  const t = String(s).trim();
  if (t.length < 12 || !/\s/.test(t) || !/[a-zà-ÿ]/.test(t)) return false;
  const words = t.match(/\p{L}{2,}/gu) || [];
  if (words.length < 3) return false;
  // a class list, a selector, a path or an identifier list is not copy
  if (/(^|\s)(?:[a-z]+:)?-?(?:flex|grid|px|py|mx|my|text|bg|w|h|rounded|border|items|justify|gap|font|leading|tracking|shadow|ring|hover|focus|md|lg|sm|xl|min|max|inset|top|left|right|bottom|z|opacity|transition|duration|ease)(?:-|:|$)/.test(t) && !/[.!?,]\s/.test(t)) return false;
  if (/^[\w./:@#-]+(\s+[\w./:@#-]+)*$/.test(t) && !/[A-Z]/.test(t) && !/\s(?:the|a|an|to|of|and|your|you|we|our|is|are|for|in|on|with|le|la|les|de|et|vous|votre|nous)\s/i.test(` ${t} `)) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/i.test(t) || /=>|\|\||&&|\(\)/.test(t)) return false;
  return true;
};
const kindOfProp = (k) => (/^(title|heading|headline|h1|h2|pageTitle)$/i.test(k) ? "heading" : /^(label|cta|ctaLabel|button|buttonText|submitLabel|action)$/i.test(k) ? "button" : "body");
// language of a hard-coded string: English unless it reads as French / German / Spanish (Cyrillic → ru)
const STOPS = {
  fr: /\b(le|la|les|des|du|une|et|est|vous|votre|vos|nous|pour|avec|dans|sur|pas|qui|que|ce|cette|sont|être|aux)\b/gi,
  de: /\b(der|die|das|und|ist|sie|ihr|ihre|wir|für|mit|nicht|ein|eine|auf|zu|den|dem|werden)\b/gi,
  es: /\b(el|los|las|y|es|usted|su|sus|nosotros|para|con|en|no|una|que|del|al|son)\b/gi,
  en: /\b(the|and|is|you|your|we|our|for|with|in|on|not|a|an|to|of|are|be|this|that|it)\b/gi,
};
export function guessLocale(text, fallback = "en") {
  const t = String(text);
  if (/[Ѐ-ӿ]{3}/.test(t)) return "ru";
  const c = Object.fromEntries(Object.entries(STOPS).map(([k, re]) => [k, (t.match(re) || []).length]));
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 && best[0] !== "en" && best[1] > c.en ? best[0] : fallback;
}

/* ───────── one file ───────── */
/**
 * Read one source file: links, actions, prose literals, page names, h1s, imports. `idx` resolves t("key").
 * @returns {{ links, actions, texts, names, h1, imports }}
 */
export function readSourceFile(file, text, idx, defLocale = "en") {
  const res = { links: [], actions: [], texts: [], names: [], h1: [], imports: [] };
  let ast;
  try { ast = parseTs(text, { loc: true, jsx: /\.[jt]sx$/.test(file) || /\.js$/.test(file), range: false }); } catch { return res; }
  const namespaces = [];
  const region0 = /footer/i.test(file) ? "footer" : /(^|\/)(nav\w*|header|menu|sidebar|navbar|topbar|site-?header)[\w.-]*$|\/(nav|navigation|header|menu)\//i.test(file) ? "nav" : "body";
  const where = (n) => `${file}:${n.loc.start.line}`;
  // t("key") → the default-language text; t(link.key) on a link object → its key property
  const tText = (call, keyOverride = null) => {
    const k = keyOverride ?? strOf(call.arguments[0]);
    const l = resolveKey(idx, k, namespaces);
    return l ? l.value : null;
  };
  const isT = (c) => c?.type === "CallExpression" && /^(t|t\.rich|t\.raw|t\.markup|i18n\.t|translate|intl\.formatMessage)$/.test(calleeName(c.callee));
  /** the text a reader sees inside an element: text, literals, t() calls, nested inline elements */
  const BLOCK = /^(div|p|h[1-6]|ul|ol|li|section|article|header|footer|figure|img|Card\w*)$/;
  const findEl = (n, test) => { for (const ch of n.children || []) { if (ch.type === "JSXElement") { if (test(nameOf(ch))) return ch; const x = findEl(ch, test); if (x) return x; } } return null; };
  const labelOf = (el, objKey = null) => {
    // a card link (a heading and a description inside) is named by its heading
    if (findEl(el, (nm) => BLOCK.test(nm))) {
      const h = findEl(el, (nm) => /^(h[1-6]|strong|CardTitle|\w*Title)$/.test(nm));
      return h ? labelOf(h, objKey) : "";
    }
    const parts = [];
    let partial = false;
    const visit = (n) => {
      for (const ch of n.children || []) {
        if (ch.type === "JSXText") parts.push(ch.value);
        else if (ch.type === "JSXExpressionContainer") {
          const e = ch.expression;
          const s = strOf(e);
          if (s != null) parts.push(s);
          else if (isT(e)) {
            const arg = e.arguments[0];
            // t(link.key) / t(item.labelKey) inside a .map over link objects
            const viaObj = arg?.type === "MemberExpression" && objKey?.key ? objKey.key : null;
            const v = tText(e, viaObj);
            if (v != null) parts.push(v);
          } else if (e?.type === "MemberExpression" && /^(label|name|title|text)$/.test(e.property?.name || "") && objKey?.label) parts.push(objKey.label);
          else if (e && e.type !== "JSXEmptyExpression" && !(e.type === "JSXElement")) partial = true; // {count} credits: the reader sees a value we do not know
        } else if (ch.type === "JSXElement") visit(ch);
      }
    };
    visit(el);
    const t = parts.join(" ").replace(/\s+/g, " ").trim();
    if (partial) return "";
    if (t) return t;
    const al = attr(el, "aria-label") || attr(el, "title");
    return al ? strOf(al.value) || "" : "";
  };
  const regionOf = (n) => {
    for (const a of ancestors(n)) {
      if (a.type !== "JSXElement") continue;
      const nm = nameOf(a);
      if (/^(footer|Footer\w*|SiteFooter)$/.test(nm)) return "footer";
      if (/^(nav|header|Nav\w*|Navbar|Header|SiteHeader|NavigationMenu\w*|Sidebar\w*|Menu|DropdownMenu\w*|Sheet\w*)$/.test(nm)) return "nav";
    }
    return region0;
  };
  // link objects ({ key: "terms", href: "/terms" }) by the array they sit in, for t(link.key) in the .map that renders them
  const linkObjs = [];
  walk(ast, (node, parent, key) => {
    if (node.type === "ImportDeclaration") { res.imports.push({ spec: node.source.value, names: node.specifiers.map((s) => s.local.name) }); return false; }
    if (node.type === "CallExpression") {
      const cn = calleeName(node.callee);
      if (/^(useTranslations|getTranslations|useTranslation|getTranslator|createTranslator)$/.test(cn)) {
        const a = node.arguments[0];
        const ns = strOf(a) ?? (a?.type === "ObjectExpression" ? strOf(a.properties.find((p) => p.key?.name === "namespace")?.value) : null);
        if (ns) namespaces.push(ns);
      }
      if (/^(router\.(push|replace|prefetch)|redirect|permanentRedirect|navigate)$/.test(cn)) {
        const p = hrefPath(node.arguments[0]);
        if (p) res.links.push({ path: p, label: "", region: "body", where: where(node), file, line: node.loc.start.line, nav: true });
      }
    }
    if (node.type === "ObjectExpression") {
      const props = new Map(node.properties.filter((p) => p.type === "Property").map((p) => [p.key?.name ?? p.key?.value, p]));
      const hrefP = props.get("href") || props.get("path") || props.get("url") || props.get("to");
      const path = hrefP ? hrefPath(hrefP.value) : null;
      if (path) {
        const labP = props.get("label") || props.get("name") || props.get("title") || props.get("text");
        const keyP = props.get("key") || props.get("labelKey") || props.get("titleKey") || props.get("i18nKey") || props.get("tKey") || props.get("messageKey") || props.get("nameKey");
        let label = labP ? strOf(labP.value) : null;
        if (label == null && labP && isT(labP.value)) label = tText(labP.value);
        const k = keyP ? strOf(keyP.value) : null;
        if (label == null && k) label = resolveKey(idx, k, namespaces)?.value ?? null;
        const o = { path, label: label || "", region: region0, where: where(node), file, line: node.loc.start.line, key: k, obj: true };
        linkObjs.push(o);
      }
    }
    if (node.type === "JSXElement") {
      const nm = nameOf(node);
      const href = attr(node, "href");
      if (href && (/^(a|Link|NextLink|\w*Link)$/.test(nm) || /Button$/.test(nm))) {
        const path = hrefPath(href.value);
        const dynamic = !path && href.value?.type === "JSXExpressionContainer" && href.value.expression?.type === "MemberExpression";
        // a link inside a sentence ("see the full <Link>roster</Link>") is a word of the sentence, not the page's name
        const inline = node.__p?.type === "JSXElement" && (node.__p.children || []).some((c) => c.type === "JSXText" && /\p{L}{2,}/u.test(c.value));
        if (path) res.links.push({ path, label: labelOf(node), region: inline ? "inline" : regionOf(node), where: where(node), file, line: node.loc.start.line, kind: /Button$/.test(nm) ? "button" : "link" });
        else if (dynamic) {
          // href={link.href} inside a .map over link objects: one link per object, labelled through t(link.key)
          const pending = { node, region: regionOf(node) };
          res.__dyn = [...(res.__dyn || []), pending];
        }
      }
      if (nm === "h1") { const t = labelOf(node); if (t) res.h1.push({ text: t, line: node.loc.start.line }); }
      // a layout component that gets the page's title: <PolicyLayout title="Refund Policy">, <PageHeader heading=…>
      for (const an of ["title", "heading", "pageTitle"]) {
        const a = attr(node, an);
        if (a && /^[A-Z]/.test(nm) && /(Layout|Page|Legal|Doc|Document|Policy|PageHero|PageHeader|Heading|Shell|Article)/.test(nm)) {
          let v = strOf(a.value);
          if (v == null && a.value?.type === "JSXExpressionContainer" && isT(a.value.expression)) v = tText(a.value.expression);
          if (v) res.names.push({ text: v, line: a.loc.start.line, prop: true });
        }
      }
      // the same action behind two labels: onClick={() => setBuyOpen(true)} / onClick={openBuyCredits}
      const oc = attr(node, "onClick");
      if (oc?.value?.type === "JSXExpressionContainer") {
        let e = oc.value.expression, call = null;
        if (e.type === "ArrowFunctionExpression" || e.type === "FunctionExpression") { const b = e.body.type === "BlockStatement" ? (e.body.body.length === 1 ? e.body.body[0].expression : null) : e.body; if (b?.type === "CallExpression") call = b; }
        const cn = call ? calleeName(call.callee) : e.type === "Identifier" ? e.name : "";
        if (cn && /open|show|toggle|launch|start|dialog|modal|drawer|sheet|set\w*(open|show|visible|modal|dialog|drawer|sheet)/i.test(cn) && !/^set\w*(false)$/i.test(cn)) {
          const args = call ? call.arguments.map((a) => (a.type === "Literal" ? JSON.stringify(a.value) : "")).join(",") : "";
          if (call && call.arguments[0]?.type === "Literal" && call.arguments[0].value === false) { /* closing */ }
          else {
            const label = labelOf(node);
            const local = /^set[A-Z]/.test(cn) || !/^[a-z]+[A-Z]/.test(cn);
            if (label) res.actions.push({ key: `${local ? `${file} ` : ""}${cn}(${args})`, label, where: where(node), file, line: node.loc.start.line });
          }
        }
      }
    }
    // prose in code: copy constants, link and FAQ objects, legal sections built as data
    if ((node.type === "Literal" && typeof node.value === "string") || (node.type === "TemplateLiteral" && node.expressions.length <= 3)) {
      if (!parent || parent.type === "JSXAttribute" || parent.type === "JSXExpressionContainer" || parent.type === "ImportDeclaration" || parent.type === "ExportAllDeclaration" || parent.type === "ExportNamedDeclaration" || parent.type === "TSLiteralType" || parent.type === "SwitchCase" || parent.type === "BinaryExpression" || parent.type === "MemberExpression" || parent.type === "TaggedTemplateExpression") return;
      if (parent.type === "Property" && key === "key") return;
      if (parent.type === "Property" && NOT_COPY_PROP.test(parent.key?.name ?? String(parent.key?.value ?? ""))) return;
      if ((parent.type === "CallExpression" || parent.type === "NewExpression") && (SKIP_CALLEE.test(calleeName(parent.callee)) || /Error$/.test(calleeName(parent.callee)))) return;
      if (parent.type === "ThrowStatement") return;
      // {ok ? "Saved" : "Saving…"} in JSX children: jsxSegments has it already
      if ((parent.type === "ConditionalExpression" || parent.type === "LogicalExpression") && parent.__p?.type === "JSXExpressionContainer") return;
      for (const a of ancestors(node)) {
        if ((a.type === "CallExpression" || a.type === "NewExpression") && (/^(console\.\w+|logger\.\w+|fetch|sendTelegram\w*|track|captureException)$/.test(calleeName(a.callee)) || /Error$/.test(calleeName(a.callee)))) return;
        if (a.type === "ThrowStatement") return;
      }
      const v = node.type === "Literal" ? node.value : node.quasis.map((x) => x.value.cooked ?? "").join("{x}");
      if (!looksLikeCopy(v)) return;
      const pk = parent.type === "Property" ? (parent.key?.name ?? String(parent.key?.value ?? "")) : "";
      // copy kept for the admin area (seo titles of /admin pages …)
      const admin = [...ancestors(node)].some((a) => a.type === "Property" && /admin|backoffice/i.test(String(a.key?.name ?? a.key?.value ?? "")));
      res.texts.push({ text: v, kind: kindOfProp(pk), locale: guessLocale(v, defLocale), where: where(node), file, line: node.loc.start.line, literal: true, ...(admin ? { admin: true } : {}) });
    }
    // export const metadata = { title: "…" } / generateMetadata() { return { title: t("…") } }
    if (node.type === "Property" && (node.key?.name === "title" || node.key?.value === "title")) {
      const inMeta = [...ancestors(node)].some((a) => (a.type === "VariableDeclarator" && a.id?.name === "metadata") || (a.type === "FunctionDeclaration" && /^generateMetadata$/.test(a.id?.name || "")) || (a.type === "ExportNamedDeclaration" && a.declaration?.declarations?.[0]?.id?.name === "metadata"));
      if (inMeta) {
        let v = strOf(node.value);
        if (v == null && isT(node.value)) v = tText(node.value);
        if (v == null && node.value?.type === "ObjectExpression") v = strOf(node.value.properties.find((p) => ["default", "absolute"].includes(p.key?.name))?.value);
        if (v) res.names.push({ text: v, line: node.loc.start.line, meta: true });
      }
    }
  });
  // href={link.href} inside items.map(link => …): each link object of the file, labelled by the element's text pattern
  for (const d of res.__dyn || []) {
    for (const o of linkObjs) {
      const label = o.label || (o.key ? labelOf(d.node, { key: o.key, label: o.label }) : "") || labelOf(d.node, { label: o.label, key: o.key });
      res.links.push({ ...o, label: label || o.label, region: d.region !== "body" ? d.region : o.region });
    }
  }
  // link objects never rendered through a dynamic href in this file (exported nav config): still links
  if (!(res.__dyn || []).length) for (const o of linkObjs) res.links.push(o);
  delete res.__dyn;
  for (const l of res.links) l.label = normLabel(l.label).replace(/\{x\}/g, "").trim();
  return res;
}

/* ───────── the whole repository ───────── */
/**
 * @returns {{ texts, links, pages, actions, routes: { exists(path), count }, defLocale }}
 */
export function buildSite(repo, { cfg = {}, files: all = null } = {}) {
  const cc = contentConfig(cfg);
  const ignore = (cfg.ignore || []).map((r) => new RegExp(r));
  const ign = [...ignore, ...((cc.consistencyIgnore || []).map((r) => new RegExp(r)))];
  all = (all || repoFileList(repo)).filter((f) => !ign.some((r) => r.test(f)) && existsSync(join(repo, f)));
  const idx = messageIndex(repo, all, cc);
  const defLocale = idx.def || cc.defaultLocale || "en";
  const texts = [], links = [], actions = [];
  // message files: every value of every locale
  for (const l of idx.leaves) texts.push({ text: l.value, kind: keyKind(l.key), locale: l.locale, where: `${l.file}:${l.line} (${l.key})`, file: l.file, line: l.line, key: l.key });
  const read = (f) => { try { return readFileSync(join(repo, f), "utf8"); } catch { return ""; } };
  const src = all.filter((f) => /\.(tsx|jsx|ts|js|mjs)$/.test(f) && !/\.d\.ts$/.test(f) && !SKIP_PATH.test(f) && !TEST_PATH.test(f) && !messageFileInfo(f));
  const perFile = new Map();
  for (const f of src) {
    const jsx = isJsxFile(f);
    const copyTs = !jsx && COPY_TS.test(f) && !SERVER_PATH.test(f);
    const page = templateOf(f) !== null;
    if (!jsx && !copyTs && !page) continue;
    if (SERVER_PATH.test(f) && !page) continue;
    const text = read(f);
    if (text.length > 1_500_000) continue;
    const r = readSourceFile(f, text, idx, defLocale);
    perFile.set(f, r);
    links.push(...r.links);
    // labels kept in link objects (nav / footer config) are copy the reader sees: CT19 counts their words too
    for (const l of r.links) if (l.obj && l.label) texts.push({ text: l.label, kind: "nav", locale: guessLocale(l.label, defLocale), where: l.where, file: l.file, line: l.line, linkLabel: true });
    actions.push(...r.actions);
    texts.push(...r.texts);
    if (jsx) for (const s of jsxSegments(text, f)) {
      if (!s.text.replace(/\{x\}/g, "").trim()) continue;
      texts.push({ text: s.text, kind: s.kind, locale: guessLocale(s.text, defLocale), where: `${f}:${s.line}`, file: f, line: s.line });
    }
  }
  // pages and the names they go by (their own <h1> / title props, or those of the component they render)
  const aliases = aliasesOf(repo);
  const pages = [];
  const templates = [];
  for (const f of all) {
    const t = templateOf(f);
    if (t === null || !/\.(t|j)sx?$/.test(f)) continue;
    const path = stripLocale(t);
    templates.push(path);
    const r = perFile.get(f);
    if (!r) continue;
    const names = [...r.names.map((x) => x.text), ...r.h1.map((x) => x.text)];
    // one level down: the client component the page renders
    if (!r.h1.length) for (const im of r.imports) {
      const target = resolveImport(repo, f, im.spec, aliases);
      const tr = target && perFile.get(target);
      if (tr && !/(^|\/)(ui|layout)\//.test(target) && !/Layout|Footer|Navbar|Header/.test(target)) names.push(...tr.h1.map((x) => x.text));
    }
    const title = r.names.find((x) => x.meta)?.text || "";
    pages.push({ path, names: [...new Set(names.map((x) => normLabel(x).replace(/\{x\}/g, "").trim()).filter(Boolean))], title, where: `${f}:${(r.h1[0] || r.names[0])?.line || 1}`, file: f });
  }
  // what a link may point at: app / pages routes, route handlers, public files, redirects and rewrites
  const handlers = all.map((f) => f.match(/(?:^|\/)app\/(.*?)\/?route\.(t|j)s$/)?.[1]).filter((x) => x != null).map((b) => stripLocale("/" + b.split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/")));
  const special = all.flatMap((f) => { const m = f.match(/(?:^|\/)app\/(sitemap|robots|manifest|icon|apple-icon|opengraph-image|favicon)\.\w+$/); return m ? [{ sitemap: "/sitemap.xml", robots: "/robots.txt", manifest: "/manifest.webmanifest", favicon: "/favicon.ico" }[m[1]] || `/${m[1]}`] : []; });
  const publicFiles = new Set(all.filter((f) => /^(?:src\/)?public\//.test(f)).map((f) => "/" + f.replace(/^(?:src\/)?public\//, "")));
  const redirects = [];
  for (const f of all.filter((x) => /(^|\/)next\.config\.\w+$|(^|\/)vercel\.json$|(^|\/)middleware\.[jt]s$/.test(x))) {
    for (const m of read(f).matchAll(/["']?source["']?\s*:\s*["'`]([^"'`]+)["'`]/g)) redirects.push(m[1]);
    // middleware that maps paths: '/old' → … ; only literal paths count
  }
  const pats = [...templates, ...handlers, ...special].map((t) => tplRe(t));
  const redirectRes = redirects.map((s) => tplRe(s.replace(/:(\w+)\*/g, "[[...$1]]").replace(/:(\w+)/g, "[$1]").replace(/\(\.\*\)/g, "[[...x]]")));
  const routes = {
    count: templates.length,
    exists: (p) => pats.some((re) => re.test(p)) || publicFiles.has(p) || redirectRes.some((re) => re.test(p)) || /^\/(api|_next|_vercel|static|assets)\//.test(p + "/"),
  };
  const isAdmin = (x) => ADMIN.test(x.file || "") || ADMIN_KEY.test(x.key || "") || (x.path && ADMIN_ROUTE.test(x.path));
  for (const list of [texts, links, actions]) for (const x of list) if (isAdmin(x)) x.admin = true;
  for (const p of pages) if (ADMIN_ROUTE.test(p.path)) p.admin = true;
  return { texts, links, pages, actions, routes, defLocale, perFile };
}

/** static dead links (CT22 a): links whose path no route, file or redirect serves */
export function staticDeadLinks(site) {
  if (!site.routes.count) return [];
  return site.links.filter((l) => !site.routes.exists(l.path)).map((l) => ({ ...l }));
}

/** CT19–CT22 over the repository: { groups, problems } — problems are the places to change, file:line */
export function consistencyProblems(repo, { cfg = {}, files = null, site = null } = {}) {
  const cc = contentConfig(cfg);
  site = site || buildSite(repo, { cfg });
  const groups = consistencyFindings({ ...site, deadLinks: staticDeadLinks(site) }, cc, cfg);
  const want = files ? new Set(files) : null;
  const problems = [];
  for (const g of groups) {
    const seen = new Set();
    for (const at of g.report || []) {
      if (!at.file || (want && !want.has(at.file))) continue;
      const k = `${at.file}:${at.line}`;
      if (seen.has(k)) continue;
      seen.add(k);
      problems.push({
        file: at.file, line: at.line, rule: g.rule, id: g.id, baseKey: baseKeyOf(g, at),
        message: `${shortWhat(g, at)}. Fix: ${g.fix} [${g.id}]`,
        group: { concept: g.concept, dominant: g.dominant, variant: g.variant },
      });
    }
  }
  return { groups, problems, site };
}
const baseKeyOf = (g, at) => g.id === "CT21" && at.path ? `CT21|${at.path}|${normLabel(at.label)}` : g.id === "CT22" ? `CT22|${g.variant}` : g.id === "CT20" && at.currency ? `CT20|${g.concept}|${at.currency}` : `${g.id}|${g.concept}|${g.variant}`;
function shortWhat(g, at) {
  const others = (g.variants || []).filter((v) => v.value !== g.variant).map((v) => `"${v.value}" ${v.count}×`).join(", ");
  if (g.id === "CT19") return `${g.concept}: "${at.match || g.variant}" here — the site mostly says "${g.dominant}"${g.tie ? " (no clear majority)" : ""} (${others})`;
  if (g.id === "CT20") return g.concept === "prices in currencies" ? `a price in ${g.variant} here ("${at.quote}") — ${g.what}` : `${g.concept}: "${g.variant}" here ("${at.quote}") — elsewhere ${others}`;
  if (g.id === "CT21") {
    const label = at.label || at.text || g.variant;
    if (g.concept.startsWith("name of ")) return `this ${at.region || "link"} calls ${g.concept.slice(8)} "${normLabel(label)}", the page itself says "${g.dominant}"`;
    if (g.concept.startsWith("links to ")) return `"${normLabel(label)}" here — other ${g.concept} say ${others}`;
    return `${g.concept}: "${normLabel(label)}" here — elsewhere ${others}`;
  }
  return g.what;
}

/**
 * The marks of one file's text alone, with the keys the cross-file problems carry (`baseKey`): `check --changed` counts
 * them at the base version, so a line that only changed for another reason does not own older drift.
 */
export function siteMarksOfText(file, text, cfg = {}) {
  const cc = contentConfig(cfg);
  const out = [];
  const texts = [];
  const info = messageFileInfo(file);
  let links = [];
  if (info) { try { for (const l of parseMessages(file, text)) texts.push({ text: l.value, locale: info.locale }); } catch {} }
  else if (/\.(tsx|jsx|ts|js|mjs)$/.test(file)) {
    const r = readSourceFile(file, text, { map: new Map() }, "en");
    links = r.links;
    texts.push(...r.texts);
    if (isJsxFile(file)) for (const s of jsxSegments(text, file)) texts.push({ text: s.text, locale: guessLocale(s.text, "en") });
  }
  for (const g of termGroups(cc)) for (const x of texts) if ((String(x.locale || "en").split(/[-_]/)[0]) === g.locale) for (const u of termUses(g, x.text)) out.push({ rule: "content/term-drift", baseKey: `CT19|${g.concept}|${u.term}` });
  for (const x of texts) {
    for (const f of policyFacts(x.text)) out.push({ rule: "content/policy-conflict", baseKey: `CT20|${f.fact}|${f.set ? [...new Set(f.set)].sort().join(", ") : f.value}` });
    for (const a of amountCurrencies(x.text)) out.push({ rule: "content/policy-conflict", baseKey: `CT20|prices in currencies|${a.currency}` });
    for (const d of documentNames(x.text)) out.push({ rule: "content/missing-page", baseKey: `CT22|${d.name}` });
  }
  for (const l of links) { out.push({ rule: "content/label-drift", baseKey: `CT21|${l.path}|${normLabel(l.label)}` }); out.push({ rule: "content/missing-page", baseKey: `CT22|${l.path}` }); }
  return out;
}
void isFrench;
