// 5.5.0 (Kindred, issue #4): after `init --vendor` the product's own `tsc --noEmit` and `eslint .` failed — the
// vendored copy (tools/claudes-babysitter) fell under the product's tsconfig `include: ["**/*.ts"]` and its ESLint
// config. init and update now leave the copy out of both, by editing the text of the files (comments, trailing commas
// and the team's formatting stay), and say what they could not edit.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** JSONC → value (line / block comments, trailing commas); null when it is not parseable. */
export function parseJsonc(text) {
  let out = "", i = 0, str = false;
  while (i < text.length) {
    const ch = text[i], nx = text[i + 1];
    if (str) { out += ch; if (ch === "\\") { out += nx ?? ""; i += 2; continue; } if (ch === '"') str = false; i++; continue; }
    if (ch === '"') { str = true; out += ch; i++; continue; }
    if (ch === "/" && nx === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === "/" && nx === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    out += ch; i++;
  }
  try { return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; }
}

/** Position just after the `[` of the top-level "exclude" array, or -1. Skips strings and comments. */
function topLevelArray(text, key) {
  let depth = 0, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === "/" && text[i + 1] === "*") { i = text.indexOf("*/", i + 2); if (i < 0) return -1; i += 2; continue; }
    if (ch === '"') {
      let j = i + 1; while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const name = text.slice(i + 1, j);
      if (depth === 1 && name === key) { const m = /^\s*:\s*\[/.exec(text.slice(j + 1)); if (m) return j + 1 + m[0].length; }
      i = j + 1; continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    i++;
  }
  return -1;
}

/**
 * Adds `entries` to tsconfig's "exclude" (creating it with node_modules — an explicit exclude replaces the default one).
 * Returns { text, added: string[] } — added is empty when nothing had to change or the file is not JSON(C).
 */
export function excludeFromTsconfig(text, entries) {
  const json = parseJsonc(text);
  if (!json || typeof json !== "object") return { text, added: [], unreadable: true };
  const cur = Array.isArray(json.exclude) ? json.exclude.map(String) : null;
  const covered = (e) => cur && cur.some((c) => { const x = c.replace(/\/\*\*(\/\*)?$/, "").replace(/\/$/, ""); return x === e || e.startsWith(`${x}/`); });
  const need = entries.filter((e) => !covered(e));
  if (!need.length) return { text, added: [] };
  if (cur) {
    const at = topLevelArray(text, "exclude");
    if (at < 0) return { text, added: [], unreadable: true };
    const rest = text.slice(at);
    const empty = /^\s*\]/.test(rest);
    const ins = need.map((e) => JSON.stringify(e)).join(", ");
    return { text: `${text.slice(0, at)}${ins}${empty ? "" : ", "}${rest}`, added: need };
  }
  const open = text.indexOf("{");
  if (open < 0) return { text, added: [], unreadable: true };
  const indent = (/\n([ \t]+)"/.exec(text) || [, "  "])[1];
  const list = ["node_modules", ...need].map((e) => JSON.stringify(e)).join(", ");
  const after = text.slice(open + 1);
  const hasKeys = Object.keys(json).length > 0;
  return { text: `${text.slice(0, open + 1)}\n${indent}"exclude": [${list}]${hasKeys ? "," : ""}${after.startsWith("\n") ? "" : "\n"}${after}`, added: need };
}

const MARK = "claudes-babysitter: the vendored copy is linted upstream";

/**
 * Adds an ignore for `glob` to a flat ESLint config's text. Handles `export default [ … ]`, `export default
 * defineConfig([ … ])` / `tseslint.config( … )`, and `const x = [ … ]; export default x;`. Returns { text, done }.
 */
export function ignoreInEslintFlat(text, glob) {
  const dir = glob.replace(/\/\*\*$/, "");
  if (text.includes(MARK) || new RegExp(`["'\`]${dir.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(/\\*\\*)?/?["'\`]`).test(text)) return { text, done: false, already: true };
  const entry = `{ ignores: [${JSON.stringify(glob)}] }, // ${MARK}`;
  const insertAt = (pos) => ({ text: `${text.slice(0, pos)}\n  ${entry}${text.slice(pos)}`, done: true });
  // export default [  |  export default defineConfig([  |  export default tseslint.config(
  let m = /export\s+default\s+(?:[\w$.]+\s*\(\s*)?\[/.exec(text);
  if (m) return insertAt(m.index + m[0].length);
  const name = /export\s+default\s+([\w$]+)\s*;?\s*$/m.exec(text)?.[1];
  if (name) {
    m = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:[\\w$.]+\\s*\\(\\s*)?\\[`).exec(text);
    if (m) return insertAt(m.index + m[0].length);
    m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[\\w$.]+\\s*\\(`).exec(text);
    if (m) return insertAt(m.index + m[0].length);
  }
  m = /export\s+default\s+[\w$.]+\s*\(/.exec(text) || /module\.exports\s*=\s*(?:[\w$.]+\s*\(\s*)?\[/.exec(text);
  if (m) return insertAt(m.index + m[0].length);
  return { text, done: false };
}

/**
 * Leaves `dir` (relative to the repo, e.g. tools/claudes-babysitter) out of the product's tsconfig.json and ESLint
 * config. Returns [{ file, what }] for the report; `manual` entries say what the team has to add by hand.
 */
export function ignoreVendoredCopy(repo, dir, { dry = false } = {}) {
  const out = [];
  const tsPath = join(repo, "tsconfig.json");
  if (existsSync(tsPath)) {
    const r = excludeFromTsconfig(readFileSync(tsPath, "utf8"), [dir]);
    if (r.added.length) { if (!dry) writeFileSync(tsPath, r.text); out.push({ file: tsPath, what: `tsconfig "exclude" += ${r.added.join(", ")} (the product's tsc does not compile the vendored copy)` }); }
    else if (r.unreadable) out.push({ file: tsPath, what: `could not read tsconfig.json — add "${dir}" to its "exclude" by hand`, manual: true });
  }
  const flat = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts"].map((f) => join(repo, f)).find(existsSync);
  if (flat) {
    const r = ignoreInEslintFlat(readFileSync(flat, "utf8"), `${dir}/**`);
    if (r.done) { if (!dry) writeFileSync(flat, r.text); out.push({ file: flat, what: `ESLint ignores += ${dir}/** (the product's eslint does not lint the vendored copy)` }); }
    else if (!r.already) out.push({ file: flat, what: `could not find the config array — add { ignores: ["${dir}/**"] } to it by hand`, manual: true });
  }
  for (const f of [".eslintrc.json", ".eslintrc"]) {
    const p = join(repo, f);
    if (!existsSync(p)) continue;
    const json = parseJsonc(readFileSync(p, "utf8"));
    if (!json) { out.push({ file: p, what: `could not read ${f} — add "${dir}/**" to ignorePatterns by hand`, manual: true }); continue; }
    const cur = [].concat(json.ignorePatterns || []);
    if (cur.some((x) => String(x).replace(/\/\*\*$/, "").replace(/\/$/, "") === dir)) continue;
    json.ignorePatterns = [...cur, `${dir}/**`];
    if (!dry) writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
    out.push({ file: p, what: `ignorePatterns += ${dir}/**` });
  }
  const ei = join(repo, ".eslintignore");
  if (existsSync(ei)) {
    const cur = readFileSync(ei, "utf8");
    if (!cur.split("\n").some((l) => l.trim().replace(/\/\*\*$/, "").replace(/\/$/, "") === dir)) { if (!dry) writeFileSync(ei, `${cur.trimEnd()}\n${dir}/\n`); out.push({ file: ei, what: `+= ${dir}/` }); }
  }
  return out;
}
