// Component graph of a repo, from the AST (typescript-estree): which components are defined where, which
// are exported, who imports them (incl. barrels, import(), next/dynamic) and who actually renders/calls them.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";

const EXT = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
// PascalCase with at least one lower-case letter: Button, StatTile — not GET/POST route handlers or CONSTANTS
const isComponentName = (n) => /^[A-Z][A-Za-z0-9]*$/.test(n || "") && /[a-z]/.test(n);

function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== "string") return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (k === "parent" || k === "loc" || k === "range") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && walk(x, fn, node));
    else if (v && typeof v.type === "string") walk(v, fn, node);
  }
}

/** Resolve an import specifier to a repo-relative file, or null for packages. */
export function resolveImport(repo, fromFile, spec, aliases) {
  let base = null;
  for (const [prefix, target] of aliases) if (spec === prefix.replace(/\/$/, "") || spec.startsWith(prefix)) { base = join(target, spec.slice(prefix.length)); break; }
  if (!base && spec.startsWith(".")) base = join(dirname(fromFile), spec);
  if (!base) return null;
  base = normalize(base);
  if (existsSync(join(repo, base)) && /\.[jt]sx?$/.test(base)) return base;
  for (const e of EXT) if (existsSync(join(repo, base + e))) return base + e;
  return null;
}

export function aliasesOf(repo) {
  const out = [];
  for (const f of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const raw = readFileSync(join(repo, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/,\s*([}\]])/g, "$1");
      const paths = JSON.parse(raw).compilerOptions?.paths || {};
      for (const [k, v] of Object.entries(paths)) out.push([k.replace(/\*$/, ""), (v[0] || "").replace(/^\.\//, "").replace(/\*$/, "")]);
    } catch {}
  }
  if (!out.length) out.push(["@/", existsSync(join(repo, "src")) ? "src/" : ""]);
  return out;
}

/**
 * @returns {{ defs: Array<{name,file,exported,line}>, usedBy: (def) => string[], usedInOwnFile: (def) => boolean, importers: Map }}
 */
export function componentGraph(repo, files) {
  const aliases = aliasesOf(repo);
  const info = new Map(); // file -> { defs, imports: [{source, names: Map(local->imported)|'*'}], reexports: [{source, names: Map(exported->imported)}], used: Map(name->count), exportsLocal: Set }
  for (const f of files) {
    let ast;
    try { ast = parse(readFileSync(join(repo, f), "utf8"), { jsx: true, loc: true }); } catch { continue; }
    const rec = { defs: [], imports: [], reexports: [], used: new Map(), exported: new Set(), defaultExport: null };
    const bump = (n) => rec.used.set(n, (rec.used.get(n) || 0) + 1);
    for (const st of ast.body) {
      const decl = st.type === "ExportNamedDeclaration" || st.type === "ExportDefaultDeclaration" ? st.declaration : st;
      const exported = st.type !== "ImportDeclaration" && st !== decl;
      if (decl && decl.type === "FunctionDeclaration" && isComponentName(decl.id?.name)) {
        rec.defs.push({ name: decl.id.name, line: decl.loc.start.line, node: decl });
        if (exported) rec.exported.add(decl.id.name);
        if (st.type === "ExportDefaultDeclaration") rec.defaultExport = decl.id.name;
      }
      if (decl && decl.type === "VariableDeclaration") for (const d of decl.declarations) {
        const init = d.init;
        const fnLike = init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression" ||
          (init.type === "CallExpression" && /forwardRef|memo|styled|dynamic/.test((init.callee.property?.name || init.callee.name || "")) ) ||
          (init.type === "TaggedTemplateExpression"));
        if (d.id.type === "Identifier" && isComponentName(d.id.name) && fnLike) {
          rec.defs.push({ name: d.id.name, line: d.loc.start.line, node: d });
          if (exported) rec.exported.add(d.id.name);
        }
      }
      if (st.type === "ExportDefaultDeclaration" && st.declaration?.type === "Identifier") { rec.defaultExport = st.declaration.name; rec.exported.add(st.declaration.name); }
      if (st.type === "ExportNamedDeclaration" && !st.declaration) {
        if (st.source) rec.reexports.push({ source: st.source.value, names: new Map(st.specifiers.map((s) => [s.exported.name ?? s.exported.value, s.local.name ?? s.local.value])) });
        else for (const s of st.specifiers) rec.exported.add(s.local.name);
      }
      if (st.type === "ExportAllDeclaration" && st.source) rec.reexports.push({ source: st.source.value, names: "*" });
      if (st.type === "ImportDeclaration") {
        const names = new Map();
        for (const s of st.specifiers) names.set(s.local.name, s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportNamespaceSpecifier" ? "*" : (s.imported.name ?? s.imported.value));
        rec.imports.push({ source: st.source.value, names });
      }
    }
    walk(ast, (n, p) => {
      if (n.type === "JSXOpeningElement") { let x = n.name; while (x.type === "JSXMemberExpression") x = x.object; if (x.type === "JSXIdentifier") bump(x.name); }
      if (n.type === "CallExpression" && n.callee.type === "Identifier") bump(n.callee.name);
      // `<X.Y>` via namespace, and identifiers passed around (component props, maps, memo(X))
      // passed somewhere that can render it (a prop, an argument, an array/object value, a return) counts;
      // a bare mention (`void X;`, `X;`, `export { X }`) does not
      if (n.type === "Identifier" && p && isComponentName(n.name) && ["JSXExpressionContainer", "CallExpression", "ArrayExpression", "ReturnStatement", "ConditionalExpression", "LogicalExpression", "AssignmentExpression", "ArrowFunctionExpression"].includes(p.type) && !(p.type === "CallExpression" && p.callee === n)) bump("ref:" + n.name);
      if (n.type === "Property" && n.value && n.value.type === "Identifier" && isComponentName(n.value.name) && n.value !== n.key) bump("ref:" + n.value.name);
      // import("…") / dynamic(() => import("…").then(m => m.X))
      if (n.type === "ImportExpression" && n.source.type === "Literal") {
        const then = p && p.type === "MemberExpression" && p.property?.name === "then";
        rec.imports.push({ source: n.source.value, names: new Map([["__dynamic__", "*"]]), dynamic: true });
      }
    });
    info.set(f, rec);
  }
  // module → files that pull names from it (through barrels too)
  const pulls = new Map(); // targetFile -> [{ by, name(imported), local }]
  const addPull = (target, by, name, local) => { if (!pulls.has(target)) pulls.set(target, []); pulls.get(target).push({ by, name, local }); };
  const followBarrel = (file, name, by, local, depth = 0) => {
    const rec = info.get(file);
    if (!rec || depth > 5) return;
    addPull(file, by, name, local);
    for (const r of rec.reexports) {
      const tgt = resolveImport(repo, file, r.source, aliases);
      if (!tgt) continue;
      if (r.names === "*") followBarrel(tgt, name, by, local, depth + 1);
      else if (name === "*") for (const imp of r.names.values()) followBarrel(tgt, imp, by, local, depth + 1);
      else if (r.names.has(name)) followBarrel(tgt, r.names.get(name), by, local, depth + 1);
    }
  };
  for (const [f, rec] of info) for (const imp of rec.imports) {
    const tgt = resolveImport(repo, f, imp.source, aliases);
    if (!tgt) continue;
    for (const [local, name] of imp.names) followBarrel(tgt, name, f, local);
  }
  const defs = [];
  for (const [f, rec] of info) if (/\.(t|j)sx$/.test(f)) for (const d of rec.defs) defs.push({ name: d.name, file: f, line: d.line, exported: rec.exported.has(d.name) || rec.defaultExport === d.name });
  const usedBy = (def) => {
    const out = new Set();
    for (const p of pulls.get(def.file) || []) {
      if (p.by === def.file) continue;
      const matches = p.name === def.name || (p.name === "default" && info.get(def.file)?.defaultExport === def.name) || p.name === "*";
      if (!matches) continue;
      const u = info.get(p.by);
      if (!u) continue;
      if (p.local === "__dynamic__" || u.used.get(p.local) || u.used.get("ref:" + p.local) || p.name === "*") out.add(p.by);
    }
    return [...out].filter((g) => !/\/index\.[jt]sx?$/.test(g) || (info.get(g)?.used.size || 0) > 0);
  };
  const usedInOwnFile = (def) => {
    const rec = info.get(def.file);
    // rendered (<X>) or called (X()) inside its own file; a bare mention (displayName, export default X) is not a use
    return !!rec && (rec.used.get(def.name) || 0) > 0;
  };
  return { defs, usedBy, usedInOwnFile, info };
}
