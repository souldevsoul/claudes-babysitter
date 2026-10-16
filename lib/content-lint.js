// Static content linter: the copy rules of lib/content-rules.js over the product's source, no browser.
//   - i18n message files (json / ts / js / yaml under messages/, locales/, lib/i18n/, public/locales/, i18n/,
//     translations/, dictionaries/ …): every value, every locale; key parity between locales; English left in a
//     non-English locale; the same date in every locale; the same "Last updated" date across one document.
//   - JSX copy: text children, string attributes (title, placeholder, aria-label, alt, label), literal children.
//   - email addresses anywhere in the product's source: preview / reserved hosts always; MX over DNS when online.
// Used by `babysitter content` (bin/content-lint.mjs) and wired into `babysitter check` (bin/ui-check.mjs).
// Each problem: { file, line, rule, id, message, soft? }.
import { readFileSync, existsSync } from "node:fs";
import { join, relative, basename, extname, dirname } from "node:path";
import { execSync } from "node:child_process";
import { parse as parseTs } from "@typescript-eslint/typescript-estree";
import {
  contentConfig, lintSegment, englishIn, stripNoise, findEmails, emailDomainProblem, findDates, LAST_UPDATED_RE, ruleId,
} from "./content-rules.js";

/* ───────────── which files ───────────── */
const I18N_DIRS = new Set(["messages", "locales", "locale", "i18n", "lang", "langs", "translations", "dictionaries", "dictionary", "intl"]);
// ISO 639-1 (+ a few 639-2 in common use)
const LANGS = new Set("aa ab af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu fil haw yue".split(" "));
export const isLocaleCode = (s) => { const m = /^([a-z]{2,3})(?:[-_]([A-Za-z]{2}|[A-Za-z]{4}|\d{3}))?$/.exec(s || ""); return !!m && LANGS.has(m[1]); };
const SKIP_PATH = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.git|\.babysitter|tools\/claudes-babysitter|vendor)\//;
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e|playwright|cypress|spec|fixtures?|mocks?|__mocks__|stories|storybook|scripts|prisma|seeds?|migrations|docs)\/|\.(test|spec|stories|e2e)\.[jt]sx?$|(^|\/)(seed|fixtures?)\.[jt]s$/i;

/** A message file and its locale: { file, locale, group } or null. */
export function messageFileInfo(file) {
  if (SKIP_PATH.test(file) || !/\.(json|ya?ml|[cm]?[jt]s)$/.test(file) || /\.d\.ts$/.test(file)) return null;
  const parts = file.split("/");
  const dirs = parts.slice(0, -1);
  if (!dirs.some((d) => I18N_DIRS.has(d.toLowerCase())) || /(^|\/)app\/api\//.test(file) || TEST_PATH.test(file)) return null;
  const stem = basename(file).replace(/\.(json|ya?ml|[cm]?[jt]s)$/, "");
  if (isLocaleCode(stem)) return { file, locale: stem.replace("_", "-"), group: [...dirs, `*${extname(file)}`].join("/") };
  for (let i = dirs.length - 1; i >= 0; i--) if (isLocaleCode(dirs[i]) && dirs.slice(0, i).some((d) => I18N_DIRS.has(d.toLowerCase()))) {
    const g = [...dirs]; g[i] = "*";
    return { file, locale: dirs[i].replace("_", "-"), group: [...g, basename(file)].join("/") };
  }
  return null;
}
export const isJsxFile = (f) => /\.(jsx|tsx)$/.test(f) && !SKIP_PATH.test(f) && !TEST_PATH.test(f);
const isEmailTemplate = (f) => /(^|\/)(emails?|email-templates|mail|mails|mailer|notifications)\/|email[\w-]*\.(tsx?|jsx?|html|hbs|mjml)$/i.test(f);
// where an address in plain source is user-facing: product code and content, not tests / seeds / tool config
const CONTACT_LOCAL = /^(support|help|helpdesk|hello|hi|contact|contacts|info|privacy|legal|billing|dpo|gdpr|security|abuse|team|office|sales|press|media|careers|jobs|care|service|customerservice|feedback|complaints?|compliance|aml|kyc|refunds?|payments?|accounts?|noreply|no-reply|notifications?|mail|enquiries|inquiries|partners?|business)$/i;
const isEmailSource = (f) => !SKIP_PATH.test(f) && !TEST_PATH.test(f) && !/(^|\/)[^/]*(test|mock|fake|seed|demo|fixture|sample)[^/]*$|\.config(\.[\w-]+)*\.[cm]?[jt]s$|(^|\/)\.?[\w-]*rc(\.[cm]?[jt]s|\.json)?$/i.test(f) && /\.(tsx?|jsx?|mjs|cjs|json|ya?ml|html|hbs|mjml|mdx?|txt)$/.test(f)
  && !/(^|\/)(package(-lock)?\.json|tsconfig[\w.-]*\.json|\.env[\w.-]*|README[\w.-]*|CHANGELOG[\w.-]*|CLAUDE\.md|AGENTS[\w.-]*\.md|LICENSE[\w.-]*|PLAN\.md|[A-Z_]+\.md|babysitter\.config\.json|components\.json|vercel\.json|next\.config\.\w+)$/i.test(f);

export function repoFileList(repo) {
  try { return execSync("git ls-files --cached --others --exclude-standard", { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean); }
  catch { return []; }
}

/* ───────────── parsers with line numbers ───────────── */
/** JSON → [{ key: "a.b.c", value, line }] for every string leaf (arrays index as a.0). */
export function parseJsonLeaves(text) {
  let i = 0, line = 1;
  const out = [];
  const ws = () => { for (; i < text.length; i++) { const c = text[i]; if (c === "\n") line++; else if (c !== " " && c !== "\t" && c !== "\r") break; } };
  const str = () => {
    let s = ""; i++;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === "\\") { const n = text[++i]; s += n === "n" ? "\n" : n === "t" ? "\t" : n === "u" ? String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16)) : n; if (n === "u") i += 4; continue; }
      if (c === '"') { i++; return s; }
      if (c === "\n") line++;
      s += c;
    }
    throw new Error("unterminated string");
  };
  const val = (path) => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++; ws();
      if (text[i] === "}") { i++; return; }
      for (;;) {
        ws(); const k = str(); ws(); if (text[i] !== ":") throw new Error(`expected : at line ${line}`); i++;
        val(path ? `${path}.${k}` : k); ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return; }
        throw new Error(`expected , or } at line ${line}`);
      }
    }
    if (c === "[") {
      i++; ws(); let n = 0;
      if (text[i] === "]") { i++; return; }
      for (;;) { val(`${path}.${n++}`); ws(); if (text[i] === ",") { i++; continue; } if (text[i] === "]") { i++; return; } throw new Error(`expected , or ] at line ${line}`); }
    }
    if (c === '"') { const l = line; const s = str(); out.push({ key: path, value: s, line: l }); return; }
    const m = /^(-?\d[\d.eE+-]*|true|false|null)/.exec(text.slice(i, i + 40));
    if (!m) throw new Error(`unexpected "${c}" at line ${line}`);
    i += m[0].length;
  };
  val("");
  return out;
}

/** The subset of YAML i18n files use: nested maps, scalars (plain / quoted), | and > blocks, comments. */
export function parseYamlLeaves(text) {
  const out = [], stack = []; // { indent, key }
  const lines = text.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    if (/^\s*(#|$)/.test(raw) || /^---|^\.\.\./.test(raw)) continue;
    const m = /^(\s*)(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^:#][^:]*?))\s*:(?:\s+(.*))?$/.exec(raw);
    if (!m) continue;
    const indent = m[1].length, key = m[2] ?? m[3] ?? m[4].trim();
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const path = [...stack.map((s) => s.key), key].join(".");
    let v = (m[5] ?? "").replace(/\s+#.*$/, "");
    if (!v) { stack.push({ indent, key }); continue; }
    if (/^[|>][+-]?$/.test(v)) {
      const block = [];
      let j = n + 1, bi = null;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) { block.push(""); continue; }
        const ind = l.match(/^\s*/)[0].length;
        if (ind <= indent) break;
        bi ??= ind; block.push(l.slice(bi));
      }
      out.push({ key: path, value: v[0] === ">" ? block.join(" ").replace(/\s+/g, " ").trim() : block.join("\n").trim(), line: n + 1 });
      n = j - 1;
      continue;
    }
    if (/^"/.test(v)) v = v.replace(/^"|"$/g, "").replace(/\\"/g, '"').replace(/\\n/g, "\n");
    else if (/^'/.test(v)) v = v.replace(/^'|'$/g, "").replace(/''/g, "'");
    if (/^(true|false|null|~|-?\d[\d.]*)$/.test(v)) continue;
    out.push({ key: path, value: v, line: n + 1 });
  }
  return out;
}

const unwrap = (n) => { while (n && /^(TSAsExpression|TSSatisfiesExpression|TSTypeAssertion|TSNonNullExpression|ParenthesizedExpression)$/.test(n.type)) n = n.expression; if (n && n.type === "CallExpression" && n.arguments[0]?.type === "ObjectExpression") return n.arguments[0]; return n; };
const propName = (p) => (p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null);
/** JS/TS message module → leaves of the exported (or largest) object literal. */
export function parseTsLeaves(text, file = "x.ts") {
  let ast;
  try { ast = parseTs(text, { loc: true, jsx: /x$/.test(file), range: false }); } catch { return []; }
  const roots = [];
  for (const st of ast.body) {
    if (st.type === "ExportDefaultDeclaration") roots.push(unwrap(st.declaration));
    const decl = st.type === "ExportNamedDeclaration" ? st.declaration : st;
    if (decl?.type === "VariableDeclaration") for (const d of decl.declarations) roots.push(unwrap(d.init));
    if (st.type === "ExpressionStatement" && st.expression.type === "AssignmentExpression") roots.push(unwrap(st.expression.right));
  }
  const objs = roots.filter((r) => r?.type === "ObjectExpression");
  if (!objs.length) return [];
  const out = [];
  const walk = (node, path) => {
    node = unwrap(node);
    if (!node) return;
    if (node.type === "ObjectExpression") { for (const p of node.properties) if (p.type === "Property") { const k = propName(p); if (k != null) walk(p.value, path ? `${path}.${k}` : k); } }
    else if (node.type === "ArrayExpression") node.elements.forEach((e, i) => e && walk(e, `${path}.${i}`));
    else if (node.type === "Literal" && typeof node.value === "string") out.push({ key: path, value: node.value, line: node.loc.start.line });
    else if (node.type === "TemplateLiteral") out.push({ key: path, value: node.quasis.map((x) => x.value.cooked ?? "").join("{x}"), line: node.loc.start.line });
  };
  const size = (o) => JSON.stringify(o.loc);
  // export default wins; otherwise the largest object literal in the file
  const def = ast.body.find((s) => s.type === "ExportDefaultDeclaration");
  const root = def && unwrap(def.declaration)?.type === "ObjectExpression" ? unwrap(def.declaration) : objs.sort((a, b) => (b.loc.end.line - b.loc.start.line) - (a.loc.end.line - a.loc.start.line))[0];
  void size;
  walk(root, "");
  return out;
}

export function parseMessages(file, text) {
  if (/\.json$/.test(file)) return parseJsonLeaves(text);
  if (/\.ya?ml$/.test(file)) return parseYamlLeaves(text);
  return parseTsLeaves(text, file);
}

/* ───────────── JSX copy ───────────── */
const INLINE = new Set(["a", "strong", "em", "b", "i", "span", "small", "sup", "sub", "mark", "u", "s", "abbr", "time", "Link", "NextLink", "Trans", "br", "wbr", "bdi", "q", "cite", "kbd"]);
const HEADING = /^(h1|h2|h3|DialogTitle|AlertDialogTitle|SheetTitle|DrawerTitle|CardTitle|PageTitle|SectionTitle|Heading|Title)$/;
const BUTTON = /^(button|Button|\w+Button|SubmitButton|DropdownMenuItem|MenuItem|Tab|TabsTrigger)$/;
const CODE = /^(code|pre|kbd|samp|script|style|Code|CodeBlock|Pre|Highlight|SyntaxHighlighter)$/;
const ATTRS = { title: "body", placeholder: "placeholder", "aria-label": "body", alt: "body", label: "body", description: "body", heading: "heading", subtitle: "body", caption: "body", tooltip: "body", helperText: "body", emptyText: "body", confirmText: "button", cancelText: "button", submitLabel: "button", buttonText: "button" };
// inline unless its class makes it a block (<span className="block">)
const isInline = (n) => {
  if (!INLINE.has(nameOf(n)) || CODE.test(nameOf(n))) return false;
  const c = n.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "className");
  const v = c?.value?.type === "Literal" ? String(c.value.value) : "";
  return !/(^|\s)(block|flex|grid|table|list-item)(\s|$)/.test(v);
};
const nameOf = (n) => { const x = n?.openingElement?.name; if (!x) return ""; if (x.type === "JSXIdentifier") return x.name; if (x.type === "JSXMemberExpression") return x.property.name; return ""; };
const jsxText = (raw) => {
  if (!/\n/.test(raw)) return raw;
  const lines = raw.split(/\r?\n/).map((l, i, a) => (i === 0 ? l.replace(/\s+$/, "") : i === a.length - 1 ? l.replace(/^\s+/, "") : l.trim()));
  return lines.filter(Boolean).join(" ");
};
/** Every piece of JSX copy in a file: [{ text, kind, line, attr? }]. Inline children join into one segment. */
export function jsxSegments(text, file = "x.tsx") {
  let ast;
  try { ast = parseTs(text, { loc: true, jsx: true, range: false }); } catch { return []; }
  const out = [];
  const visit = (node, ctx) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "JSXElement") {
      const name = nameOf(node);
      if (CODE.test(name)) return;
      for (const a of node.openingElement.attributes) {
        if (a.type !== "JSXAttribute" || !a.value) continue;
        const an = typeof a.name.name === "string" ? a.name.name : "";
        const kind = ATTRS[an];
        if (!kind) continue;
        const v = a.value.type === "Literal" ? a.value.value : a.value.type === "JSXExpressionContainer" && a.value.expression.type === "Literal" ? a.value.expression.value : a.value.type === "JSXExpressionContainer" && a.value.expression.type === "TemplateLiteral" && !a.value.expression.expressions.length ? a.value.expression.quasis[0].value.cooked : null;
        if (typeof v === "string" && v.trim()) out.push({ text: v, kind: an === "aria-label" && BUTTON.test(name) ? "body" : kind, line: a.loc.start.line, attr: an, collapsed: false });
      }
      const inNav = ctx.nav || name === "nav" || /^(Nav|Navbar|NavigationMenu\w*|Sidebar\w*|Menu)$/.test(name);
      const kind = HEADING.test(name) ? "heading" : BUTTON.test(name) ? "button" : ctx.kind;
      if (!isInline(node)) {
        // a block: its inline content is one segment
        const parts = [];
        let line = null;
        const collect = (n) => {
          for (const ch of n.children || []) {
            if (ch.type === "JSXText") { const t = jsxText(ch.value); if (t.trim()) { parts.push(t); line ??= ch.loc.start.line + (ch.value.match(/^\s*\n/) ? ch.value.match(/^\s*/)[0].split("\n").length - 1 : 0); } }
            else if (ch.type === "JSXExpressionContainer") {
              const e = ch.expression;
              if (e.type === "Literal" && typeof e.value === "string") { parts.push(e.value); line ??= e.loc.start.line; }
              else if (e.type === "TemplateLiteral") { parts.push(e.quasis.map((x) => x.value.cooked ?? "").join("{x}")); line ??= e.loc.start.line; }
              else if (e.type === "JSXEmptyExpression") continue;
              else if (e.type === "ConditionalExpression" || e.type === "LogicalExpression") {
                for (const br of [e.consequent, e.alternate, e.right]) if (br?.type === "Literal" && typeof br.value === "string" && br.value.trim()) out.push({ text: br.value, kind: inNav && /^(a|Link)$/.test(name) ? "nav" : kind || "body", line: br.loc.start.line });
                parts.push("{x}");
              } else parts.push("{x}");
            } else if (ch.type === "JSXElement" && isInline(ch)) { if (nameOf(ch) === "br") parts.push(" "); else collect(ch); }
            else if (ch.type === "JSXFragment") collect(ch);
            // a component renders something in place (a link, a value); an HTML block breaks the line
            else if (ch.type === "JSXElement") parts.push(/^[A-Z]/.test(nameOf(ch)) ? "{x}" : " ");
          }
        };
        collect(node);
        const t = parts.join("").replace(/\s+/g, " ").trim();
        if (t && t.replace(/\{x\}/g, "").trim() && line) {
          const isNavLink = inNav && (/^(a|Link|NextLink|li)$/.test(name) || (node.children || []).some((c) => c.type === "JSXElement" && /^(a|Link|NextLink)$/.test(nameOf(c))));
          out.push({ text: t, kind: isNavLink && !kind ? "nav" : kind || "body", line });
        }
      }
      // a block inside a button / heading (a description <p> in a button card) is plain copy
      const inner = kind === "button" ? null : kind;
      for (const ch of node.children || []) {
        if (ch.type === "JSXElement" && isInline(ch)) { visitInside(ch, { ...ctx, nav: inNav, kind }); continue; }
        visit(ch, { ...ctx, nav: inNav, kind: ch.type === "JSXElement" && HEADING.test(nameOf(ch)) ? "heading" : inner });
      }
      return;
    }
    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "parent") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && visit(x, ctx));
      else if (v && typeof v.type === "string") visit(v, ctx);
    }
  };
  // inside an inline element: its text is already in the parent's segment; still visit its attributes and nested blocks
  const visitInside = (node, ctx) => {
    for (const a of node.openingElement.attributes) if (a.type === "JSXAttribute" && a.value && ATTRS[a.name.name] && a.value.type === "Literal" && String(a.value.value).trim()) out.push({ text: a.value.value, kind: ATTRS[a.name.name], line: a.loc.start.line, attr: a.name.name, collapsed: false });
    for (const ch of node.children || []) {
      if (ch.type === "JSXElement" && isInline(ch)) visitInside(ch, ctx);
      else if (ch.type === "JSXElement") visit(ch, ctx);
      else if (ch.type === "JSXExpressionContainer") visit(ch.expression, ctx);
    }
  };
  visit(ast, { kind: null, nav: false });
  return out;
}

/* ───────────── kinds of i18n keys ───────────── */
export function keyKind(key) {
  const last = key.split(".").filter((p) => !/^\d+$/.test(p)).pop() || "";
  if (/placeholder|example|sample|hint|format$/i.test(last)) return "placeholder";
  if (/^(title|heading|headline|h1|h2|h3|pageTitle|sectionTitle|\w+Title|\w+Heading)$/.test(last) && !/^(meta|seo|og|description)/i.test(last)) return "heading";
  if (/(button|btn|cta|submit|Action)$/i.test(last) || /(^|\.)(buttons|actions|ctas)\./i.test(key)) return "button";
  if (/(^|\.)(nav|navigation|menu|tabs|navbar|sidebar)\./i.test(key) && !/description|desc|subtitle|text$/i.test(last)) return "nav";
  return "body";
}

/* ───────────── the linter ───────────── */
const lineAt = (text, idx) => text.slice(0, idx).split("\n").length;
const P = (file, line, x, extra = {}) => ({ file, line, rule: x.rule, id: x.id || ruleId(x.rule), message: `${x.what}. Fix: ${x.fix} [${x.id || ruleId(x.rule)}]`, ...extra });

/**
 * Lint a repository's copy. Options:
 *   files: limit to these repo-relative paths (changed mode) — key parity / locale comparisons still read the
 *          whole group of a changed message file; dns: true → MX lookups (async); cfg: babysitter.config.json
 * @returns {Promise<{ problems: object[], soft: object[], info: object[], stats: object }>}
 */
export async function lintContent(repo, { files = null, dns = false, cfg = null, fetchImpl, cache } = {}) {
  cfg = cfg ?? (existsSync(join(repo, "babysitter.config.json")) ? JSON.parse(readFileSync(join(repo, "babysitter.config.json"), "utf8")) : {});
  const cc = contentConfig(cfg);
  const ignore = (cfg.ignore || []).map((r) => new RegExp(r));
  const all = repoFileList(repo).filter((f) => !ignore.some((r) => r.test(f)) && existsSync(join(repo, f)));
  const want = files ? new Set(files) : null;
  const problems = [], soft = [], info = [];
  const read = (f) => { try { return readFileSync(join(repo, f), "utf8"); } catch { return ""; } };
  const skip = new Set(cc.skip || []);
  const push = (p, list = problems) => { if (!skip.has(p.id) && !skip.has(p.rule)) list.push(p); };

  /* i18n */
  const msgs = all.map(messageFileInfo).filter(Boolean);
  const groups = new Map();
  for (const m of msgs) (groups.get(m.group) || groups.set(m.group, []).get(m.group)).push(m);
  const keySet = new Set();
  const stats = { messageFiles: msgs.length, groups: groups.size, jsxFiles: 0, strings: 0, emails: 0 };
  for (const [group, list] of groups) {
    const touched = !want || list.some((m) => want.has(m.file));
    if (!touched) continue;
    for (const m of list) {
      try { m.leaves = parseMessages(m.file, read(m.file)); }
      catch (e) { m.leaves = []; push({ file: m.file, line: 1, rule: "content/parse", id: "CT0", message: `could not read this message file: ${e.message}` }); }
      m.map = new Map(m.leaves.map((l) => [l.key, l]));
    }
    const locales = list.map((m) => m.locale);
    const def = list.find((m) => m.locale === cc.defaultLocale) || list.find((m) => /^en\b/.test(m.locale)) || [...list].sort((a, b) => b.leaves.length - a.leaves.length)[0];
    // brand words: Latin words kept as-is inside translations that otherwise differ (PRAXIS, Visa, Telegram …)
    const brandCount = new Map();
    for (const m of list) if (m !== def) for (const l of m.leaves) {
      const d = def.map.get(l.key);
      if (!d || d.value === l.value) continue;
      const dw = new Set(d.value.match(/[A-Za-z][A-Za-z0-9+.-]+/g) || []);
      for (const w of new Set(l.value.match(/[A-Za-z][A-Za-z0-9+.-]+/g) || [])) if (dw.has(w)) brandCount.set(w, (brandCount.get(w) || 0) + 1);
    }
    const brand = [...(cc.brandTerms || []), ...[...brandCount].filter(([, n]) => n >= 3).map(([w]) => w)].sort((a, b) => b.length - a.length);
    for (const m of list) {
      const lintThis = !want || want.has(m.file);
      for (const l of m.leaves) {
        keySet.add(l.key);
        stats.strings++;
        if (!lintThis) continue;
        const seg = { text: l.value, kind: keyKind(l.key), locale: m.locale };
        for (const x of lintSegment(seg, cc, { static: true, example: seg.kind === "placeholder" })) push(P(m.file, l.line, { ...x, what: `${l.key}: ${x.what}` }));
        if (m !== def) {
          const d = def.map.get(l.key);
          const en = englishIn(l.value, m.locale, brand);
          if (d && d.value === l.value && (en || (stripNoise(l.value).match(/[A-Za-z]{3,}/g) || []).filter((w) => !brand.includes(w)).length >= 2))
            push(P(m.file, l.line, { rule: "content/untranslated", what: `${l.key} in ${m.locale} is the ${def.locale} text unchanged: "${l.value.slice(0, 70)}"`, fix: `translate it into ${m.locale} (or add the words to content.brandTerms if they stay as they are)` }));
          else if (en) push(P(m.file, l.line, { rule: "content/untranslated", what: `${l.key} in ${m.locale} contains English: "${en}"`, fix: `translate the English part into ${m.locale}` }));
          if (!l.value.trim() && d?.value.trim()) push(P(m.file, l.line, { rule: "content/missing-key", what: `${l.key} is empty in ${m.locale}`, fix: `write the ${m.locale} text` }));
          // the same date in every locale
          if (d) {
            const a = findDates(d.value).map((x) => x.iso), b = findDates(l.value).map((x) => x.iso);
            if (a.length && b.length && a.join() !== b.join()) push(P(m.file, l.line, { rule: "content/last-updated", what: `${l.key}: ${m.locale} says ${b.join(", ")}, ${def.locale} says ${a.join(", ")}`, fix: "the same document carries the same date in every language" }));
          }
        }
      }
      // one document, one "Last updated" date: keys under the same parent
      if (lintThis) {
        const byDoc = new Map();
        for (const l of m.leaves) {
          if (!LAST_UPDATED_RE.test(l.value) && !/(lastUpdated|updatedAt|updated|effectiveDate|effective)$/i.test(l.key)) continue;
          const ds = findDates(l.value);
          if (!ds.length) continue;
          const doc = l.key.split(".").slice(0, -1).join(".").replace(/\.(meta|header|hero|intro)$/, "");
          (byDoc.get(doc) || byDoc.set(doc, []).get(doc)).push({ l, iso: ds[0].iso, kind: /effective|qüvvəyə|вступ|күшіне/i.test(l.value + l.key) ? "effective" : "updated" });
        }
        for (const [doc, ds] of byDoc) for (const kind of ["updated", "effective"]) {
          const k = ds.filter((d) => d.kind === kind);
          const isos = [...new Set(k.map((d) => d.iso))];
          if (isos.length > 1) push(P(m.file, k[1].l.line, { rule: "content/last-updated", what: `${doc || "this file"}: "${kind === "updated" ? "last updated" : "effective"}" dates differ (${k.map((d) => `${d.l.key} = ${d.iso}`).join(", ")})`, fix: "one document shows one date everywhere" }));
        }
      }
    }
    // key parity (plural suffixes are per language)
    const norm = (k) => k.replace(/_(zero|one|two|few|many|other)$/, "").replace(/\.(zero|one|two|few|many|other)$/, "");
    const keysOf = new Map(list.map((m) => [m, new Set(m.leaves.map((l) => norm(l.key)))]));
    const reported = new Set();
    for (const m of [def, ...list.filter((x) => x !== def)]) {
      for (const l of m.leaves) {
        const k = norm(l.key);
        if (reported.has(k)) continue;
        const missing = list.filter((o) => !keysOf.get(o).has(k)).map((o) => o.locale);
        if (!missing.length) continue;
        reported.add(k);
        if (want && !want.has(m.file) && !list.some((o) => missing.includes(o.locale) && want.has(o.file))) continue;
        push(P(m.file, l.line, { rule: "content/missing-key", what: `${l.key} exists in ${m.locale} but is missing in ${missing.join(", ")} (${group})`, fix: `add it to ${missing.join(", ")} — a missing key shows the raw key or the ${def.locale} text to those users` }));
      }
    }
    void locales;
  }

  /* JSX */
  const lastUpdatedByFile = [];
  for (const file of all.filter(isJsxFile)) {
    if (want && !want.has(file)) continue;
    const text = read(file);
    if (text.length > 1_500_000) continue;
    stats.jsxFiles++;
    const segs = jsxSegments(text, file);
    for (const s of segs) {
      stats.strings++;
      if (/^\{x\}$/.test(s.text.trim())) continue;
      for (const x of lintSegment(s, cc, { static: true, example: s.kind === "placeholder" })) push(P(file, s.line, x));
    }
    const lu = segs.filter((s) => LAST_UPDATED_RE.test(s.text) && findDates(s.text).length).map((s) => ({ s, iso: findDates(s.text)[0].iso }));
    const isos = [...new Set(lu.map((x) => x.iso))];
    if (isos.length > 1) push(P(file, lu[1].s.line, { rule: "content/last-updated", what: `this page shows ${isos.length} different "last updated" dates (${lu.map((x) => `L${x.s.line} ${x.iso}`).join(", ")})`, fix: "one document shows one date everywhere" }));
    lastUpdatedByFile.push(...lu);
  }

  /* emails anywhere in user-facing source */
  const found = new Map(); // email → [{ file, line }]
  for (const file of all.filter(isEmailSource)) {
    if (want && !want.has(file)) continue;
    const text = read(file);
    if (text.length > 3_000_000 || text.includes("\u0000")) continue;
    for (const m of text.matchAll(/(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])/g)) {
      const email = m[0];
      const line = lineAt(text, m.index);
      const lineText = text.split("\n")[line - 1] || "";
      // input hints and docs examples: placeholder="you@example.com", // e.g. name@company.com
      if (/placeholder|example|e\.g\.|sample|hint|@example\.|test@|noreply@|no-reply@|\bmock/i.test(lineText) && /example\.|placeholder|e\.g\./i.test(lineText)) continue;
      if (/\.(png|jpe?g|webp|svg|gif)$/i.test(email)) continue; // image@2x.png
      // plain code (not JSX, not a message file, not an email template) holds QA lists and internal addresses;
      // there only a contact address (support@, hello@ …) is one the site prints
      const copyFile = /\.(jsx|tsx|html|hbs|mjml|mdx?|txt)$/.test(file) || isEmailTemplate(file) || !!messageFileInfo(file);
      if (!copyFile && !CONTACT_LOCAL.test(email.split("@")[0])) continue;
      (found.get(email) || found.set(email, []).get(email)).push({ file, line, template: isEmailTemplate(file) });
    }
  }
  stats.emails = found.size;
  for (const [email, where] of found) {
    const bad = emailDomainProblem(email);
    if (bad) for (const w of where) push(P(w.file, w.line, { rule: "content/email-domain", what: bad, fix: "use an address on a domain with a working mailbox (MX record), e.g. support@<your domain>" }));
  }
  if (dns) {
    const { checkEmails } = await import("./email-dns.js");
    const list = [...found.keys()].filter((e) => !emailDomainProblem(e));
    const res = await checkEmails(list, { cache: cache ?? join(repo, ".babysitter/dns-cache.json"), fetchImpl });
    for (const [email, r] of res) {
      if (r?.ok === false) for (const w of found.get(email)) push(P(w.file, w.line, { rule: "content/email-domain", what: `${email}: ${r.reason}`, fix: "set up mail for the domain (MX record) or show an address that receives mail" }));
      else if (r?.ok === null) info.push({ file: found.get(email)[0].file, message: `${email}: ${r.reason}` });
    }
  }
  return { problems, soft, info, stats, keys: keySet };
}

/**
 * The per-string rules of one file's text (no cross-file rules: key parity, translations, DNS). `check --changed`
 * runs it on the base version too, so a line that only changed for another reason does not own older debt.
 */
export function lintFileText(file, text, cfg = {}) {
  const cc = contentConfig(cfg);
  const out = [];
  const skip = new Set(cc.skip || []);
  const push = (p) => { if (!skip.has(p.id) && !skip.has(p.rule)) out.push(p); };
  const info = messageFileInfo(file);
  if (info) {
    let leaves = [];
    try { leaves = parseMessages(file, text); } catch { return out; }
    for (const l of leaves) {
      const seg = { text: l.value, kind: keyKind(l.key), locale: info.locale };
      for (const x of lintSegment(seg, cc, { static: true, example: seg.kind === "placeholder" })) push(P(file, l.line, { ...x, what: `${l.key}: ${x.what}` }));
    }
  } else if (isJsxFile(file)) {
    for (const sg of jsxSegments(text, file)) if (!/^\{x\}$/.test(sg.text.trim())) for (const x of lintSegment(sg, cc, { static: true, example: sg.kind === "placeholder" })) push(P(file, sg.line, x));
  }
  return out;
}

/** All translation keys of a repository (for "key printed instead of its text" on rendered pages). */
export function translationKeys(repo) {
  const keys = new Set();
  for (const m of repoFileList(repo).map(messageFileInfo).filter(Boolean)) {
    try { for (const l of parseMessages(m.file, readFileSync(join(repo, m.file), "utf8"))) { keys.add(l.key); const ns = l.key.split("."); if (ns.length > 1) keys.add(ns.slice(1).join(".")); } } catch {}
  }
  return keys;
}
void relative; void dirname;
