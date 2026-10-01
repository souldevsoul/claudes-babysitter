// Project settings for the runtime checks: babysitter.config.json (+ routes discovered by prepare.mjs).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Route = { path: string; auth: boolean };
export type ProjectConfig = {
  baseURL?: string;
  routes?: string[];
  allow?: { rails?: boolean; emoji?: boolean; negativeMargins?: boolean; lightWeights?: boolean; palette?: boolean };
  colorSchemes?: ("light" | "dark")[];
  consistency?: { buttonRadii?: number; buttonFonts?: number; buttonHeights?: number; cardRadii?: number; cardStyles?: number; inputHeights?: number; inputRadii?: number };
  login?: { url: string; emailSelector?: string; passwordSelector?: string; submitSelector?: string; successUrl?: string };
  crawl?: { maxPages?: number; exclude?: string[] };
};

const root = process.env.BABYSITTER_ROOT || process.cwd();
export const STATE_DIR = resolve(root, ".babysitter");
export const STORAGE = resolve(STATE_DIR, "storage.json");

export function loadConfig(): ProjectConfig {
  const p = process.env.BABYSITTER_CONFIG || resolve(root, "babysitter.config.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
}

/** Routes: env ROUTES wins, then the crawl result, then config.routes, then "/". */
export function loadRoutes(cfg = loadConfig()): Route[] {
  if (process.env.ROUTES) return process.env.ROUTES.split(",").map((s) => s.trim()).filter(Boolean).map((path) => ({ path, auth: existsSync(STORAGE) }));
  const crawled = resolve(STATE_DIR, "routes.json");
  if (existsSync(crawled)) return JSON.parse(readFileSync(crawled, "utf8"));
  return (cfg.routes || ["/"]).map((path) => ({ path, auth: false }));
}
