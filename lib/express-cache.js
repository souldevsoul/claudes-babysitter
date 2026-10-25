// The express result cache (.babysitter/express-cache/). A verdict is reused only when everything the checks see is
// the same as in the run that produced it: the rendered DOM, every stylesheet, the scripts the page loaded, image sizes
// and fonts (hashed in the page, see playwright/express.js renderHash), plus the viewport, colour scheme, locale, role,
// the tool's version, the check code and the config. Only passes and skips are stored: a failure is never reused, and
// a check that went to the network, another page or another browser context while it ran is never stored at all.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");

let CODE = null;
/** One hash of the check code: every .js / .mjs file of playwright/ and lib/ (a fix to a check invalidates its verdicts). */
export function codeHash(root = TOOL) {
  if (CODE && root === TOOL) return CODE;
  const h = createHash("sha256");
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) { if (f !== "node_modules") walk(p); continue; }
      if (/\.(m?js|cjs|json)$/.test(f)) h.update(relative(root, p)).update("\0").update(readFileSync(p)).update("\0");
    }
  };
  for (const d of ["playwright", "lib"]) if (existsSync(join(root, d))) walk(join(root, d));
  const v = h.digest("hex");
  if (root === TOOL) CODE = v;
  return v;
}

export function toolVersion(root = TOOL) {
  try { return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version || "0"; } catch { return "0"; }
}

/** Env that changes what a check reports (STRICT=0 turns soft failures into warnings, --only changes B1/CT22 …). */
export const ENV_KEYS = ["STRICT", "BABYSITTER_ONLY", "BABYSITTER_PROFILE", "VIEWPORTS", "BABYSITTER_PROJECTS", "LOCALES", "BABYSITTER_DNS", "BASE_URL"];

/** Config + detected languages + the env above: one hash. */
export function configHash(stateDir, configFile, env = process.env) {
  const parts = [];
  for (const f of [configFile, join(stateDir, "locales.json"), join(stateDir, "stage.json")]) {
    try { parts.push(readFileSync(f, "utf8")); } catch { parts.push(""); }
  }
  for (const k of ENV_KEYS) parts.push(`${k}=${env[k] ?? ""}`);
  return sha(parts.join("\0"));
}

export const cacheDir = (stateDir) => join(stateDir, "express-cache");
const fileOf = (stateDir, containerId) => join(cacheDir(stateDir), `${sha(containerId).slice(0, 32)}.json`);

/** { rules: { [title]: { hash, status, annotations, at } } } for one page container, {} when none. */
export function readEntry(stateDir, containerId) {
  try {
    const j = JSON.parse(readFileSync(fileOf(stateDir, containerId), "utf8"));
    return j && j.id === containerId ? j : { id: containerId, rules: {} };
  } catch { return { id: containerId, rules: {} }; }
}

/**
 * Stores this run's verdicts. `results`: [{ title, status, hash|null, cacheable, annotations }]. Passed / skipped and
 * cacheable → stored under the render hash they were measured on; anything else removes the rule's entry.
 */
export function writeEntry(stateDir, containerId, results) {
  const cur = readEntry(stateDir, containerId);
  for (const r of results) {
    if (r.cached) continue; // reused: the stored entry stays as it is
    if ((r.status === "passed" || r.status === "skipped") && r.cacheable && r.hash) cur.rules[r.title] = { hash: r.hash, status: r.status, annotations: r.annotations || [], at: new Date().toISOString() };
    else delete cur.rules[r.title];
  }
  mkdirSync(cacheDir(stateDir), { recursive: true });
  const f = fileOf(stateDir, containerId);
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ id: containerId, rules: cur.rules }));
  renameSync(tmp, f);
}

/** A stored verdict for `title` measured on exactly `hash`, or null. Failures are never stored, so never returned. */
export function lookup(entry, title, hash) {
  const e = entry?.rules?.[title];
  if (!e || !hash || e.hash !== hash) return null;
  if (e.status !== "passed" && e.status !== "skipped") return null;
  return e;
}
