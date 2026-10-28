// 5.7.1: which of the product's e2e specs the Playwright project "product" loads.
// Only the specs Babysitter knows: the ones that import its helpers (`./babysitter`, scaffolded by `babysitter init`,
// or the tool's playwright/fixtures.js) and load no other copy of @playwright/test. A product with a Playwright setup of
// its own (e2e/tests/*.spec.ts importing the product's @playwright/test) used to be swept in whole: the second copy threw
// "Requiring @playwright/test second time" while the files loaded, and every suite of the run was NOT RUN. Those specs
// are left to the product's own runner and named in the run summary instead.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = /\.(spec|test)\.(m?[tj]sx?)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".babysitter", "test-results", "playwright-report"]);
const PW_IMPORT = /(?:from\s*|require\s*\(\s*|import\s*\(\s*)["'](@playwright\/test|playwright\/test|playwright)["']/;
const SHIM_IMPORT = /(?:from\s*|require\s*\(\s*|import\s*\(\s*)["'](\.{1,2}\/(?:[\w.-]+\/)*babysitter(?:\.[mc]?[tj]s)?|[^"']*claudes-babysitter\/playwright\/fixtures(?:\.js)?|[^"']*\/playwright\/fixtures\.js)["']/;

let toolPw;
const real = (p) => { try { return realpathSync(p); } catch { return p; } };
/** The @playwright/test the tool runs with (its real path), or null. */
function toolPlaywright() {
  if (toolPw !== undefined) return toolPw;
  try { toolPw = real(createRequire(join(TOOL, "package.json")).resolve("@playwright/test")); } catch { toolPw = null; }
  return toolPw;
}
/** True when `file` resolves @playwright/test to the same copy as the tool (or does not find one at all). */
function sameCopy(file) {
  let mine = null;
  try { mine = real(createRequire(file).resolve("@playwright/test")); } catch { return true; }
  return !toolPlaywright() || mine === toolPlaywright();
}

function walk(dir, out = []) {
  let list = [];
  try { list = readdirSync(dir); } catch { return out; }
  for (const name of list) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (SPEC.test(name)) out.push(p);
  }
  return out;
}

/**
 * @param {string} dir the product's e2e folder (babysitter.config.json → e2eDir, default e2e/)
 * @returns {{ dir: string, ours: string[], foreign: { file: string, why: string }[] }} absolute paths in `ours`,
 *   repo-relative-to-dir paths in `foreign`
 */
export function classifySpecs(dir) {
  const abs = resolve(dir);
  const ours = [], foreign = [];
  if (!existsSync(abs)) return { dir: abs, ours, foreign };
  for (const f of walk(abs).sort()) {
    let src = "";
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    const rel = relative(abs, f);
    const shim = SHIM_IMPORT.test(src);
    const pw = PW_IMPORT.test(src);
    if (pw && !sameCopy(f)) foreign.push({ file: rel, why: "imports the product's own @playwright/test (another copy than Babysitter's)" });
    else if (!shim) foreign.push({ file: rel, why: "does not use Babysitter's helpers (./babysitter): a spec of the product's own test setup" });
    else ours.push(f);
  }
  return { dir: abs, ours, foreign };
}

/** Regular expressions for Playwright's testMatch: exactly the files in `ours`. */
export function testMatchFor(ours) {
  return ours.map((f) => new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** True when the repo runs Playwright itself (its own config) or e2e/ already holds specs Babysitter does not own. */
export function hasOwnPlaywright(repo, dir = "e2e") {
  if (readdirSync(repo).some((f) => /^playwright\.config\.(m?[tj]s|cjs)$/.test(f))) return true;
  return classifySpecs(join(repo, dir)).foreign.length > 0;
}

/** One line for the run summary / the start of e2e: what the product project loads and what it leaves out. */
export function describeSpecs(c, root) {
  const at = relative(root, c.dir) || ".";
  const lines = [];
  if (c.foreign.length) {
    const names = c.foreign.map((x) => x.file);
    lines.push(`product: ${c.foreign.length} spec(s) in ${at}/ NOT loaded — ${c.foreign[0].why}${c.foreign.some((x) => x.why !== c.foreign[0].why) ? " (or does not use Babysitter's helpers)" : ""}: ${names.slice(0, 6).join(", ")}${names.length > 6 ? `, … ${names.length - 6} more` : ""}. Run them with the product's own runner (npx playwright test); Babysitter loads only the specs that import ./babysitter.`);
  }
  return lines;
}
