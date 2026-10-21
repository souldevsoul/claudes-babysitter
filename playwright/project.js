// Project settings for the runtime checks: babysitter.config.json (+ routes discovered by prepare.mjs).
// Plain JavaScript so a product's own e2e specs (through fixtures.js) and Node scripts can load it.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectLocales, localize } from "../lib/locales.js";

/** @typedef {{ path: string, auth: boolean, role?: string, template?: string }} Route */

const root = process.env.BABYSITTER_ROOT || process.cwd();
export const ROOT = root;
export const STATE_DIR = resolve(root, ".babysitter");
export const STORAGE = resolve(STATE_DIR, "storage.json");

/**
 * Signed-in storage of a role (babysitter.config.json → roles, see prepare.mjs). The default role (LOGIN_EMAIL /
 * SESSION_COOKIES) keeps .babysitter/storage.json; every other role has .babysitter/storage-<name>.json.
 * @param {string} [role]
 */
export function storageFor(role) {
  if (!role || role === "user") return defaultStorage();
  return resolve(STATE_DIR, `storage-${String(role).replace(/[^\w-]/g, "_")}.json`);
}

/**
 * The default signed-in storage: storage.json, else (a project with roles only — no LOGIN_EMAIL) the first configured
 * role's storage that exists. 5.5.0 (Compass, issue #5): M1 and A1/A3/A6 opened storage.json, which prepare never
 * writes there, and crashed with ENOENT; A4 then looked for Sign out on a signed-out page.
 */
export function defaultStorage() {
  if (existsSync(STORAGE)) return STORAGE;
  let roles = [];
  try { roles = (loadConfig().roles || []).map((r) => r?.name).filter(Boolean); } catch {}
  for (const name of roles) {
    const f = resolve(STATE_DIR, `storage-${String(name).replace(/[^\w-]/g, "_")}.json`);
    if (existsSync(f)) return f;
  }
  return STORAGE;
}

/** babysitter.config.json of the product (env BABYSITTER_CONFIG overrides the path). */
export function loadConfig() {
  const p = process.env.BABYSITTER_CONFIG || resolve(root, "babysitter.config.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

/** Routes: env ROUTES wins, then the crawl result, then config.routes, then "/". @returns {Route[]} */
export function loadRoutes(cfg = loadConfig()) {
  if (process.env.ROUTES) return process.env.ROUTES.split(",").map((s) => s.trim()).filter(Boolean).map((path) => ({ path, auth: existsSync(STORAGE) }));
  const crawled = resolve(STATE_DIR, "routes.json");
  if (existsSync(crawled)) return JSON.parse(readFileSync(crawled, "utf8"));
  return (cfg.routes || ["/"]).map((path) => ({ path, auth: false }));
}

/**
 * Languages to check (prepare.mjs → .babysitter/locales.json, narrowed by env LOCALES, falling back to
 * babysitter.config.json → locales). { default, locales: [{ code, default?, prefix?, query?, origin?, cookies?, storage?,
 * verified? }] }. Unverified locales are listed in `unverified` (and in the run summary), not opened.
 */
export function loadLocales(cfg = loadConfig()) {
  const p = resolve(STATE_DIR, "locales.json");
  let detected = null;
  if (existsSync(p)) { try { detected = JSON.parse(readFileSync(p, "utf8")); } catch {} }
  const sel = selectLocales(detected, cfg.locales);
  const usable = (sel.locales || []).filter((l) => l.default || l.verified !== false);
  return { ...sel, locales: usable, unverified: (sel.locales || []).filter((l) => !l.default && l.verified === false) };
}

/** Switches a browser context to a locale the way prepare recorded it: cookies now, localStorage before every page. */
export async function applyLocale(context, loc, baseURL) {
  if (!loc || loc.default) return;
  if (loc.cookies?.length) await context.addCookies(loc.cookies.map((c) => ({ name: c.name, value: c.value, url: loc.origin || baseURL })));
  if (loc.storage?.length)
    await context.addInitScript((items) => { for (const { key, value } of items) { try { if (localStorage.getItem(key) !== value) localStorage.setItem(key, value); } catch {} } }, loc.storage);
}
export { localize };

/**
 * Viewports. Default: 360 (the narrowest phone in the testers' cards), 390, 768, 1280, 1440 — layout and overflow are
 * checked at every one. `--quick` (BABYSITTER_PROFILE=quick) runs 390 + 1440 only; babysitter.config.json → viewports
 * ([360, 1440] or [{ name, width, height }]) or env VIEWPORTS=360,1280 pick others.
 */
export const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 780 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
export function viewports(cfg = loadConfig(), env = process.env) {
  const all = viewportsAll(cfg, env);
  // 5.5.0 (Compass, issue #5): a run narrowed with --project (mobile-390 + desktop-1440, as the --quick profile and
  // sharded runs do) still picked the "narrowest" viewport from the full list — 360, not in the run — so the states at
  // phone width never ran. `babysitter e2e` / `test-ui` pass the selected projects in BABYSITTER_PROJECTS.
  const sel = String(env.BABYSITTER_PROJECTS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!sel.length) return all;
  const picked = all.filter((v) => sel.some((p) => p === v.name || p.startsWith(`${v.name}-`) || globMatch(p, v.name)));
  return picked.length ? picked : all;
}
const globMatch = (pat, name) => /[*?]/.test(pat) && new RegExp(`^${pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i").test(name);
function viewportsAll(cfg, env) {
  const named = (w) => VIEWPORTS.find((v) => v.width === Number(w)) || { name: `${Number(w) < 768 ? "mobile" : Number(w) < 1024 ? "tablet" : Number(w) < 1400 ? "laptop" : "desktop"}-${w}`, width: Number(w), height: Number(w) < 768 ? 800 : 900 };
  if (env.VIEWPORTS) return env.VIEWPORTS.split(",").map((s) => s.trim()).filter(Boolean).map(named);
  if ((env.BABYSITTER_PROFILE || cfg.profile) === "quick") return VIEWPORTS.filter((v) => v.width === 390 || v.width === 1440);
  if (Array.isArray(cfg.viewports) && cfg.viewports.length) return cfg.viewports.map((v) => (typeof v === "object" ? v : named(v)));
  return VIEWPORTS;
}

/** "[signed-in] " / "[signed-in: specialist] " / "" — describe titles must differ per role, or Playwright refuses duplicates. */
export const authTag = (route) => (route.auth ? `[signed-in${route.role && route.role !== "user" ? `: ${route.role}` : ""}] ` : "");
