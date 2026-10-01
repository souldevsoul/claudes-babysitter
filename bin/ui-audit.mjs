#!/usr/bin/env node
// Repo-level audits that a per-file linter cannot do.
//   node bin/ui-audit.mjs [repoDir] [--only components|theme] [--files a.tsx,b.tsx] [--json]
//
// components (1.16, P05 P46 P47) — reuse instead of re-creation:
//   • look-alike names: PricingCard2, ButtonNew, CardV2, HeroButtonAlt next to an existing base
//   • the same component name defined in several files
//   • a local *Button/*Card/*Badge/*Dialog/*Input/*Select that does not use the kit's component
//   • near-duplicate markup: two files whose class vocabularies overlap ≥ 75%
//   • new shared components must be exported, used, and not duplicate the role of an existing shared
//     component (StatCard next to StatTile) — a heuristic instead of an allowlist
// theme (anti-sameness) — the kit must be themed for this product, not shipped with shadcn defaults:
//   • primary colour, radius, font and button variants compared with the shadcn/ui defaults
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, basename, resolve } from "node:path";
import { parse as parseTs } from "@typescript-eslint/typescript-estree";
import { roleKey } from "../lib/roles.js";
import { componentGraph } from "../lib/components.js";
import { stockTheme, themeFiles, repoFiles as gitFilesForTheme } from "../lib/theme.js";

const args = process.argv.slice(2);
const repo = resolve(args.find((a) => !a.startsWith("--") && !/^[a-z]+$/.test(a)) || ".");
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const only = flag("only");
const json = args.includes("--json");
const limitFiles = flag("files") ? new Set(flag("files").split(",").map((f) => resolve(repo, f))) : null;
const cfgPath = join(repo, "babysitter.config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};

const SKIP = /node_modules|\.next|dist|build|\.git|coverage|\.turbo|\.vercel|playwright-report/;
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (SKIP.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx|tsx)$/.test(f) && !/\.(test|spec|stories)\./.test(f)) out.push(p);
  }
  return out;
}
const srcRoot = existsSync(join(repo, "src")) ? join(repo, "src") : repo;
const auditExclude = (cfg.audit?.exclude || []).map((r) => new RegExp(r));
const files = walk(srcRoot).filter((f) => !auditExclude.some((r) => r.test(relative(repo, f))));
const rel = (p) => relative(repo, p);
const isKit = (p) => /\/components\/ui\//.test(p);
const findings = [];
const add = (kind, file, msg, rule) => { if (!limitFiles || limitFiles.has(file)) findings.push({ kind, file: rel(file), msg, rule }); };

/* ───────────── components ───────────── */
if (!only || only === "components") {
  // component definitions, exports, imports and uses come from the AST (lib/components.js), not regexes
  const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  // the graph needs .ts/.js too: barrels (index.ts) and re-exports live there
  const graphFiles = gitFilesForTheme(repo).filter((f) => /\.(t|j)sx?$/.test(f) && !/(^|\/)(node_modules|\.next|dist|build|tools\/claudes-babysitter)\//.test(f) && !/\.d\.ts$/.test(f));
  const graph = componentGraph(repo, graphFiles.length ? graphFiles : files.map(rel));
  const defs = new Map(); // name -> [abs file]
  for (const d of graph.defs) defs.set(d.name, [...(defs.get(d.name) || []), join(repo, d.file)]);
  const SUFFIX = /^(.+?)(\d+|V\d+|New|Old|Alt|Copy|Temp|Tmp|Legacy|Custom|Fancy|Modern|Simple|Updated|Final)$/;
  for (const [name, fs] of defs) {
    const m = name.match(SUFFIX);
    if (m && defs.has(m[1])) for (const f of fs) add("components", f, `${name} looks like a copy of ${m[1]} (${rel(defs.get(m[1])[0])}). Extend ${m[1]} with a variant/prop instead of a second component.`, "1.16 P47");
    const uniq = [...new Set(fs)];
    if (uniq.length > 1 && !/^(Page|Layout|Loading|Error|NotFound|Template|Default|Icon|Logo|Providers?)$/.test(name))
      for (const f of uniq) add("components", f, `${name} is defined in ${uniq.length} files (${uniq.map(rel).join(", ")}). Keep one shared component.`, "1.16 P47");
  }
  // local re-implementations of kit roles
  const ROLES = { Button: "Button", Btn: "Button", Card: "Card", Badge: "Badge", Pill: "Badge", Chip: "Badge", Tag: "Badge", Modal: "Dialog", Dialog: "Dialog", Input: "Input", Select: "Select", Dropdown: "Select", Checkbox: "Checkbox", Toggle: "Switch" };
  const kitNames = new Set(files.filter(isKit).flatMap((f) => [...(src.get(f).matchAll(/export\s+(?:const|function)\s+([A-Z]\w*)|export\s*\{([^}]+)\}/g))].flatMap((m) => (m[1] ? [m[1]] : m[2].split(",").map((x) => x.trim().split(/\s+as\s+/).pop())))));
  for (const [name, fs] of defs) {
    const role = Object.keys(ROLES).find((r) => name.endsWith(r) && name !== r);
    if (!role) continue;
    const kitComp = ROLES[role];
    if (!kitNames.has(kitComp)) continue;
    for (const f of fs) {
      if (isKit(f)) continue;
      const s = src.get(f);
      if (!new RegExp(`<${kitComp}[\\s>.]`).test(s)) add("components", f, `${name} renders its own ${role.toLowerCase()} instead of the kit's <${kitComp}>. Build it from <${kitComp}> (add a variant if the look is new).`, "1.16 P46");
    }
  }
  // near-duplicate markup
  const vocab = new Map();
  for (const f of files) {
    if (isKit(f)) continue;
    const toks = new Set([...src.get(f).matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{\s*cn\(([^)]*)\))/g)].flatMap((m) => (m[1] || m[2] || m[3] || "").replace(/["'`,]/g, " ").split(/\s+/)).filter((t) => t && !t.includes("$")));
    if (toks.size >= 40) vocab.set(f, toks);
  }
  const list = [...vocab.entries()];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [fa, a] = list[i], [fb, b] = list[j];
      let inter = 0; for (const t of a) if (b.has(t)) inter++;
      const jac = inter / (a.size + b.size - inter);
      if (jac >= 0.75) add("components", fb, `markup is ${Math.round(jac * 100)}% the same as ${rel(fa)} — extract the shared block into one component.`, "1.16 P47");
    }
  // repeated anonymous markup: the same JSX block (structure + classes) written in several files is a
  // component nobody extracted; the same structure with drifted classes is the same block styled differently
  const blocks = new Map(); // structure key -> [{file, line, classes:Set, exact}]
  const attrClasses = (el) => {
    const a = el.openingElement.attributes.find((x) => x.type === "JSXAttribute" && x.name && x.name.name === "className");
    if (!a || !a.value) return "";
    if (a.value.type === "Literal") return String(a.value.value);
    const out = [];
    const v = (n) => { if (!n) return; if (n.type === "Literal" && typeof n.value === "string") out.push(n.value); else if (n.type === "TemplateLiteral") n.quasis.forEach((q) => out.push(q.value.cooked || "")); else if (n.type === "CallExpression") n.arguments.forEach(v); else if (n.type === "JSXExpressionContainer") v(n.expression); else if (n.type === "ConditionalExpression") { v(n.consequent); v(n.alternate); } else if (n.type === "LogicalExpression") v(n.right); };
    v(a.value);
    return out.join(" ");
  };
  const tagName = (el) => { const n = el.openingElement.name; return n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? `${n.object.name}.${n.property.name}` : "?"; };
  const shape = (el) => {
    // structure only: tags nested, no text/props → identical for the "same block, different styling" case
    let count = 1, classed = 0, struct = tagName(el), classes = [];
    const own = attrClasses(el).split(/\s+/).filter(Boolean);
    if (own.length) { classed++; classes.push(...own.map((c) => `0:${c}`)); }
    const kids = (el.children || []).filter((c) => c.type === "JSXElement");
    const parts = [];
    kids.forEach((k, i) => { const r = shape(k); count += r.count; classed += r.classed; parts.push(r.struct); classes.push(...r.classes.map((c) => `${i + 1}.${c}`)); });
    if (parts.length) struct += `(${parts.join(",")})`;
    return { count, classed, struct, classes };
  };
  for (const f of files) {
    if (isKit(f)) continue;
    let ast;
    try { ast = parseTs(src.get(f), { jsx: true, loc: true, range: false, comment: false }); } catch { continue; }
    const walkAst = (n, inside) => {
      if (!n || typeof n !== "object") return;
      if (n.type === "JSXElement") {
        const r = shape(n);
        // a block worth extracting: ≥5 elements, ≥4 of them styled, ≥10 class tokens
        if (!inside && r.count >= 5 && r.classed >= 4 && r.classes.length >= 10) {
          const list = blocks.get(r.struct) || [];
          list.push({ file: f, line: n.loc.start.line, classes: new Set(r.classes) });
          blocks.set(r.struct, list);
          inside = true; // report outermost block only
        }
      }
      for (const k of Object.keys(n)) { if (k === "parent" || k === "loc") continue; const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walkAst(x, inside)); else if (v && typeof v.type === "string") walkAst(v, inside); }
    };
    walkAst(ast, false);
  }
  const jac = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i); };
  for (const [, list] of blocks) {
    const files_ = [...new Set(list.map((x) => x.file))];
    if (files_.length < 2) continue;
    const first = list[0];
    for (const other of list.slice(1)) {
      if (other.file === first.file) continue;
      const j = jac(first.classes, other.classes);
      if (j >= 0.9) add("components", other.file, `L${other.line}: this markup block is a copy of ${rel(first.file)}:${first.line}. Extract one component and use it in both places.`, "1.16 P47");
      else if (j >= 0.4) add("components", other.file, `L${other.line}: same block as ${rel(first.file)}:${first.line} but styled differently (${Math.round(j * 100)}% of classes match). One role, one component, one look.`, "1.16 P46 P47");
    }
  }

  // shared components (components/**): exported, used somewhere, not a second component for one role
  const sharedDirs = cfg.sharedDirs || ["components", "layout", "layouts", "shared", "ui", "widgets", "features"];
  const SHARED = (f) => new RegExp(`(^|/)(${sharedDirs.join("|")})/`).test(f);
  const shared = graph.defs.filter((d) => SHARED(d.file) && d.exported);
  // orphans to a fixpoint: a component used only by orphans is dead too (GlassCube used only by a dead HeroSection)
  const dead = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of shared) {
      const key = `${d.file}#${d.name}`;
      if (dead.has(key) || graph.usedInOwnFile(d)) continue;
      // a user file whose exported shared components are all dead does not keep anything alive
      const deadFile = (u) => { const ex = shared.filter((x) => x.file === u); return ex.length > 0 && ex.every((x) => dead.has(`${x.file}#${x.name}`)); };
      const users = graph.usedBy(d).filter((u) => !deadFile(u));
      if (!users.length) { dead.add(key); changed = true; }
    }
  }
  for (const d of shared) {
    const abs = join(repo, d.file);
    if (dead.has(`${d.file}#${d.name}`)) {
      const via = graph.usedBy(d);
      add("components", abs, `${d.name} is a shared component that nothing imports${via.length ? ` (only ${via.map((v) => v.split("/").pop()).join(", ")}, which is unused itself)` : ""}. Use it where it is needed (or delete it) — an unused component is a second way to draw something.`, "1.16");
    }
    const key = roleKey(d.name);
    const twin = shared.find((o) => o !== d && roleKey(o.name) === key && o.name !== d.name && (limitFiles || o.file < d.file || (o.file === d.file && o.name < d.name)));
    if (twin && key) add("components", abs, `${d.name} duplicates the role of ${twin.name} (${twin.file}): both are "${key}". Extend ${twin.name} with a variant instead of adding a second component for the same role.`, "1.16 P46 P47");
  }
  // placement: a component other files import must live in a shared folder, not inside a page/route file
  for (const d of graph.defs) {
    if (SHARED(d.file) || !d.exported || /Provider$/.test(d.name) || /(^|\/)(lib|hooks|utils|providers?|contexts?|store|test|tests|e2e|unit|stories)\//.test(d.file)) continue;
    // colocated use (a page and its own form next to it) is fine; imported from another route/folder is not
    const home = d.file.split("/").slice(0, -1).join("/") + "/";
    const users = graph.usedBy(d).filter((u) => !/\.(test|spec|stories)\./.test(u) && !u.startsWith(home));
    if (users.length) add("components", join(repo, d.file), `${d.name} is defined in ${d.file} but imported by ${users.join(", ")}. A component used in more than one place lives in components/ (kit pieces in components/ui/), not inside a page.`, "1.16 P47");
  }
}

/* ───────────── theme ───────────── */
// Only for shadcn/ui-based kits (lib/theme.js → stockTheme): the check compares against shadcn's defaults.
if (!only || only === "theme") {
  const st = stockTheme(repo, gitFilesForTheme(repo));
  if (st.applicable) {
    const tf = themeFiles(repo).find((f) => !/tailwind\.config/.test(f)) || "src/app/globals.css";
    const stock = st.signals.filter((x) => x.stock);
    if (st.stock) add("theme", join(repo, tf), `the kit is still the stock shadcn look (${stock.map((c) => c.detail).join("; ")}). Give the product its own primary colour, radius, type pairing and button variants — consistency must not mean sameness.`, "identity");
    else for (const c of stock) add("theme", join(repo, tf), `stock ${c.id}: ${c.detail}. Consider a product-specific value.`, "identity (warning)");
  }
}

if (json) console.log(JSON.stringify(findings, null, 2));
else {
  for (const f of findings) console.log(`${f.file}\n  [${f.kind} ${f.rule}] ${f.msg}`);
  console.log(`\nui-audit: ${findings.filter((f) => !/warning/.test(f.rule)).length} problems, ${findings.filter((f) => /warning/.test(f.rule)).length} warnings in ${files.length} files`);
}
process.exitCode = findings.some((f) => !/warning/.test(f.rule)) ? 1 : 0;
