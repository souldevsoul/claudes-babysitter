// Project settings for the runtime checks: babysitter.config.json (+ routes discovered by prepare.mjs).
// Plain JavaScript so a product's own e2e specs (through fixtures.js) and Node scripts can load it.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  if (!role || role === "user") return STORAGE;
  return resolve(STATE_DIR, `storage-${String(role).replace(/[^\w-]/g, "_")}.json`);
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
