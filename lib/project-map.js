// .babysitter/project-map.json — one shared index of the product's source, built by a fast static pre-pass:
//   per file: its hash, the copy it holds (JSX text, labels, headings, buttons with line numbers; message files with
//   their keys) and the UI it uses (kit components vs native <select> / checkbox / radio / number inputs, dialogs,
//   menus, toggles, animation hints: motion props, transition / animate classes, @keyframes);
//   per route: its page file, the layouts above it, every file its page imports (the import graph of
//   lib/affected-routes.js), and the copy and UI of those files.
// The rendered text pass (babysitter text) merges what the browser read into it (`rendered: true` per route): the
// rendered copy is the truth for copy — source text misses translations, conditional blocks and data.
// Structure stays deterministic (what is a native select, is there an animation): the map only pre-sorts; visible
// motion is still measured in the browser (6.12). fix-plan reads it for the places a finding's text lives.
// Incremental: a file whose hash is unchanged since the last map reuses its extraction.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, posix } from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { importGraph } from "./affected-routes.js";
import { templateOf } from "./route-map.js";
import { jsxSegments, parseMessages, messageFileInfo } from "./content-lint.js";
import { parse as parseTs } from "@typescript-eslint/typescript-estree";

// prose in data: FAQ arrays, plan tables, blog posts kept in .ts — string literals that read as copy
const CSSY = /^[\w:/[\]().#%-]+(\s+[\w:/[\]().#%-]+)*$/;
const looksLikeCopy = (t) => /\p{L}{2,}\s+\p{L}{2,}\s+\p{L}{2,}/u.test(t) && !(CSSY.test(t) && !/[A-Z]/.test(t[0]) && !/[.!?:]$/.test(t)) && !/^(https?:|\/|\.\/|@\/|[a-z-]+\/)/.test(t) && !/[{};]|=>|\bfunction\b/.test(t);
const SKIP_KEY = /^(className|class|href|src|key|id|type|variant|size|as|rel|target|style|role|method|path|icon|color|tone|slug|url|route|test|data-\w+)$/;
export function dataStrings(text, file) {
  let ast;
  try { ast = parseTs(text, { loc: true, jsx: /\.(tsx|jsx)$/.test(file), range: false }); } catch { return []; }
  const out = [];
  const visit = (n, parentKey, inJsx) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration" || (n.type === "ExportNamedDeclaration" && n.source)) return;
    if (n.type === "JSXElement" || n.type === "JSXFragment") inJsx = true; // jsxSegments reads JSX text
    if (n.type === "JSXAttribute") return;
    if (n.type === "CallExpression" && n.callee?.type === "Identifier" && /^(cn|clsx|cva|twMerge|require|t)$/.test(n.callee.name)) return;
    if ((n.type === "Literal" && typeof n.value === "string") || (n.type === "TemplateLiteral" && n.quasis.length === 1)) {
      const v = n.type === "Literal" ? n.value : n.quasis[0].value.cooked || "";
      if (!inJsx && !SKIP_KEY.test(parentKey || "") && looksLikeCopy(v.trim())) out.push({ text: v.trim(), kind: /^(title|heading|name|label|question)$/i.test(parentKey || "") ? "heading" : /^(cta|button|action)/i.test(parentKey || "") ? "button" : "body", line: n.loc.start.line, data: parentKey || true });
      return;
    }
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "parent") continue;
      const v = n[k];
      const key = n.type === "Property" && k === "value" ? (n.key?.name ?? n.key?.value) : parentKey;
      if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && visit(x, n.type === "Property" ? key : parentKey, inJsx));
      else if (v && typeof v.type === "string") visit(v, n.type === "Property" && k === "value" ? key : n.type === "Property" ? "__key" : parentKey, inJsx);
    }
  };
  visit(ast, null, false);
  return out.filter((x) => x.data !== "__key");
}

const SRC = /\.(tsx|jsx|ts|js|mjs|vue|svelte|astro)$/;
const SKIP = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.babysitter|tools\/claudes-babysitter|test|tests|__tests__|e2e|scripts|docs)\//;
const MSG = /(^|\/)(messages|locales|translations|i18n|lang)\/.*\.(json|ya?ml|ts|js)$/;

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const files = (repo) => { try { return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 }).split("\n").filter(Boolean); } catch { return []; } };

/** UI a file uses, from its source (pre-sorting only; the browser checks decide). */
export function uiHints(text) {
  const has = (re) => (text.match(re) || []).length;
  return {
    nativeSelect: has(/<select\b/g), nativeCheckbox: has(/<input\b[^>]*type=["'{]*checkbox/g), nativeRadio: has(/<input\b[^>]*type=["'{]*radio/g), nativeNumber: has(/<input\b[^>]*type=["'{]*number/g),
    kitSelect: has(/<(Select|SelectTrigger|Combobox|Listbox)\b/g), kitCheckbox: has(/<(Checkbox|Switch|Toggle|RadioGroup)\b/g),
    dialogs: has(/<(Dialog|AlertDialog|Sheet|Drawer|Modal|dialog)\b/g), menus: has(/<(DropdownMenu|Menu|Popover|NavigationMenu|ContextMenu)\b/g), accordions: has(/<(Accordion|Collapsible|details)\b/g),
    motion: has(/<motion\.|\b(initial|animate|whileInView|whileHover|exit)=\{/g), transitions: has(/\b(transition-|animate-|duration-\d)/g), keyframes: has(/@keyframes\b/g),
  };
}

/** Copy of one file: [{ text, kind, line, key? }]. */
export function fileCopy(file, text) {
  if (MSG.test(file) && messageFileInfo(file)) {
    try { return parseMessages(file, text).map((l) => ({ text: l.value ?? l.text, key: l.key, line: l.line || 0, kind: "message", locale: messageFileInfo(file)?.locale || null })).filter((x) => typeof x.text === "string" && x.text.trim()); } catch { return []; }
  }
  const jsx = /\.(tsx|jsx)$/.test(file) ? jsxSegments(text, file).map((s) => ({ text: s.text, kind: s.kind, line: s.line, ...(s.attr ? { attr: s.attr } : {}) })) : [];
  const data = /\.(tsx|jsx|ts|js|mjs)$/.test(file) ? dataStrings(text, file) : [];
  return [...jsx, ...data].sort((a, b) => a.line - b.line);
}

/**
 * Build (or refresh) the map. @returns {{ map, stats: { files, reused, parsed, ms } }}
 */
export function buildProjectMap(repo, { previous = null, out = join(repo, ".babysitter/project-map.json"), write = true } = {}) {
  const t0 = Date.now();
  const prev = previous ?? (existsSync(out) ? (() => { try { return JSON.parse(readFileSync(out, "utf8")); } catch { return null; } })() : null);
  const all = files(repo).filter((f) => !SKIP.test(f));
  const src = all.filter((f) => SRC.test(f) || MSG.test(f) || /\.(css|scss)$/.test(f));
  const fileMap = {};
  let reused = 0, parsed = 0;
  for (const f of src) {
    let text;
    try { text = readFileSync(join(repo, f), "utf8"); } catch { continue; }
    const hash = sha(text);
    const old = prev?.files?.[f];
    if (old && old.hash === hash) { fileMap[f] = old; reused++; continue; }
    parsed++;
    fileMap[f] = { hash, copy: fileCopy(f, text), ui: /\.(css|scss)$/.test(f) ? { keyframes: (text.match(/@keyframes\b/g) || []).length } : uiHints(text) };
  }
  // forward edges from the importers map
  const g = importGraph(repo, src.filter((f) => SRC.test(f) || /\.(css|scss)$/.test(f)));
  const deps = new Map();
  for (const [t, by] of g.importers) for (const f of by) { if (!deps.has(f)) deps.set(f, new Set()); deps.get(f).add(t); }
  const closure = (start) => { const seen = new Set([start]), q = [start]; while (q.length) { const x = q.shift(); for (const d of deps.get(x) || []) if (!seen.has(d)) { seen.add(d); q.push(d); } } return seen; };
  const routes = {};
  for (const f of src) {
    const t = templateOf(f);
    if (t === null || !/(^|\/)page\.(tsx|jsx|ts|js|mdx)$|^pages\//.test(f)) continue;
    // the layouts above the page render around it
    const layouts = [];
    for (let d = posix.dirname(f); d && d !== "."; d = posix.dirname(d)) for (const ext of ["tsx", "jsx", "ts", "js"]) { const l = `${d}/layout.${ext}`; if (fileMap[l]) layouts.push(l); }
    const used = new Set([...closure(f), ...layouts.flatMap((l) => [...closure(l)])]);
    const list = [...used].filter((x) => fileMap[x]).sort();
    const ui = {};
    for (const x of list) for (const [k, v] of Object.entries(fileMap[x].ui || {})) ui[k] = (ui[k] || 0) + v;
    routes[t] = { page: f, layouts, files: list, ui, strings: list.reduce((n, x) => n + (fileMap[x].copy?.length || 0), 0) };
  }
  // message files are used by every route that reads translations: listed once
  const messages = Object.keys(fileMap).filter((f) => MSG.test(f));
  const map = { version: 1, at: new Date().toISOString(), repo: posix.basename(repo), files: fileMap, routes, messages, rendered: prev?.rendered || {} };
  if (write) { mkdirSync(join(repo, ".babysitter"), { recursive: true }); writeFileSync(out, JSON.stringify(map)); }
  return { map, stats: { files: src.length, reused, parsed, routes: Object.keys(routes).length, ms: Date.now() - t0 } };
}

/** Merge the text pass's rendered pages into the map (rendered: true per route). */
export function mergeRendered(map, pages) {
  map.rendered ||= {};
  for (const p of pages) {
    const k = `${p.auth ? `[${p.role || "user"}] ` : ""}${p.route}${p.locale ? ` (${p.locale})` : ""}`;
    map.rendered[k] = { rendered: true, route: p.route, template: p.template || null, locale: p.locale || null, role: p.role || null, lines: p.lines.map((l) => ({ text: l.text, kind: l.kind, section: l.section, region: l.region })) };
  }
  return map;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
/**
 * Every source place whose copy contains `quote` (or a long enough part of it): [{ file, line, key?, text }].
 * A message key is followed to the components that render it.
 */
export function placesOf(map, quote, { max = 8 } = {}) {
  const q = norm(quote).replace(/\{x\}/g, "").trim();
  if (q.length < 6) return [];
  const probes = [q, q.slice(0, 60), q.length > 80 ? q.slice(-50) : null].filter((x) => x && x.length >= 6);
  const out = [];
  for (const [f, e] of Object.entries(map.files || {})) {
    for (const c of e.copy || []) {
      const t = norm(c.text).replace(/\{x\}/g, "");
      if (!t || t.length < 4) continue;
      if (probes.some((p) => t.includes(p) || (t.length >= 20 && p.includes(t)))) {
        out.push({ file: f, line: c.line || 0, ...(c.key ? { key: c.key } : {}), text: c.text.slice(0, 200) });
        if (c.key) for (const [g, ge] of Object.entries(map.files)) if (/\.(tsx|jsx|ts|js)$/.test(g) && ge.keysUsed?.includes(c.key)) out.push({ file: g, line: 0, renders: c.key });
      }
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Page models from the source (no browser): per route, the copy of its page, the components it imports and its
 * layouts, in file order. Header / footer / nav files are their regions (the chrome split finds them on every page).
 * The rendered read stays the truth: source text misses translations resolved at runtime, conditional blocks and data.
 */
export function pagesFromSource(map, { templates = null } = {}) {
  const pages = [];
  const regionOf = (f) => (/footer/i.test(f) ? "footer" : /(header|navbar|nav|menu|sidebar)/i.test(f) ? "nav" : /cookie|consent|dialog|modal|sheet/i.test(f) ? "dialog" : "main");
  for (const [tpl, r] of Object.entries(map.routes || {})) {
    if (templates && !templates.includes(tpl)) continue;
    const order = [r.page, ...r.files.filter((f) => f !== r.page && !r.layouts.includes(f)), ...r.layouts];
    const lines = [];
    const seen = new Set();
    for (const f of order) {
      let section = "";
      for (const c of map.files[f]?.copy || []) {
        const text = String(c.text || "").replace(/\s+/g, " ").trim();
        if (!text || text.replace(/\{x\}/g, "").trim().length < 2) continue;
        if (c.kind === "heading") section = text.slice(0, 120);
        const k = `${f}|${text}`;
        if (seen.has(k)) continue;
        seen.add(k);
        lines.push({ text, kind: c.kind === "placeholder" ? "body" : c.kind || "body", region: regionOf(f), section: c.kind === "heading" ? "" : section, li: false, file: f, line: c.line || 0 });
      }
    }
    const h1 = lines.find((l) => l.kind === "heading")?.text || "";
    pages.push({ route: tpl, template: tpl, locale: null, auth: /^\/(dashboard|account|settings|billing|app|admin|runs|history|wallet|deploy|endpoints?)(\/|$)/.test(tpl), role: null, title: h1, h1, lines, links: [], controls: lines.filter((l) => l.kind === "button").map((l) => ({ label: l.text })), source: true });
  }
  return pages;
}
