#!/usr/bin/env node
// Logs in (optional) and crawls the site so the spec covers every page — public and signed-in.
//   BASE_URL=https://app LOGIN_EMAIL=… LOGIN_PASSWORD=… node playwright/prepare.mjs
// A site with no password form (an emailed code, a magic link, Steam…) takes a session instead:
//   SESSION_COOKIES='[{"name":"authjs.session-token","value":"…"}]'  (or name=value for one cookie)
// with "authRoutes" in babysitter.config.json as the signed-in pages to start the crawl from.
// Writes .babysitter/storage.json (session) and .babysitter/routes.json ([{path, auth}]).
// Credentials come only from env; nothing secret is written to the config file.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.env.BABYSITTER_ROOT || process.cwd();
const cfgPath = process.env.BABYSITTER_CONFIG || resolve(root, "babysitter.config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
const base = process.env.BASE_URL || cfg.baseURL;
if (!base) { console.error("BASE_URL (or baseURL in babysitter.config.json) is required"); process.exit(2); }
const dir = resolve(root, ".babysitter");
mkdirSync(dir, { recursive: true });
const storage = resolve(dir, "storage.json");
if (existsSync(storage)) rmSync(storage);

const maxPages = Number(process.env.MAX_PAGES || cfg.crawl?.maxPages || 25);
const exclude = [/\/api\//, /log-?out|sign-?out|delete|unsubscribe|\/cdn-cgi\//i, /\.(pdf|zip|png|jpe?g|webp|svg|xml|txt|ics|csv)$/i, ...(cfg.crawl?.exclude || []).map((r) => new RegExp(r))];
// collapse ids so /orders/123 and /orders/456 are one template
const template = (p) => p.split("/").map((s) => (/^\d+$|^[0-9a-f]{8,}$|^[0-9a-f-]{20,}$|^c[a-z0-9]{20,}$/i.test(s) ? ":id" : s)).join("/");

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });

async function crawl(context, seeds, auth) {
  const page = await context.newPage();
  const queue = [...seeds];
  const seen = new Map();
  while (queue.length && seen.size < maxPages) {
    const path = queue.shift();
    const key = template(path);
    if (seen.has(key) || exclude.some((r) => r.test(path))) continue;
    const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    if (!res || res.status() >= 400) { seen.set(key, null); continue; }
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const landed = new URL(page.url());
    if (landed.origin !== new URL(base).origin) { seen.set(key, null); continue; }
    const finalPath = landed.pathname;
    // a signed-out visit that bounces to the login page is not a public page
    if (!auth && cfg.login && finalPath === new URL(cfg.login.url, base).pathname && path !== finalPath) { seen.set(key, null); continue; }
    seen.set(key, finalPath);
    const links = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    for (const h of links) {
      try {
        const u = new URL(h);
        if (u.origin === new URL(base).origin && !seen.has(template(u.pathname))) queue.push(u.pathname);
      } catch {}
    }
  }
  await page.close();
  return [...new Set([...seen.values()].filter(Boolean))];
}

const seeds = cfg.routes || ["/"];
const anon = await browser.newContext();
const publicRoutes = await crawl(anon, seeds, false);
await anon.close();
let authRoutes = [];

// A session handed in (passwordless sites): set the cookies, prove they sign in, crawl from cfg.authRoutes.
function sessionCookies(raw) {
  const list = raw.trim().startsWith("[") ? JSON.parse(raw) : [{ name: raw.slice(0, raw.indexOf("=")), value: raw.slice(raw.indexOf("=") + 1) }];
  return list.map((c) => ({ name: c.name, value: c.value, url: base, ...(c.secure ? { secure: true } : {}) }));
}

if (process.env.SESSION_COOKIES) {
  const seedsIn = cfg.authRoutes?.length ? cfg.authRoutes : ["/"];
  const ctx = await browser.newContext();
  await ctx.addCookies(sessionCookies(process.env.SESSION_COOKIES));
  const page = await ctx.newPage();
  const first = new URL(seedsIn[0], base).href;
  await page.goto(first, { waitUntil: "domcontentloaded" }).catch(() => {});
  const at = new URL(page.url()).pathname;
  if ((cfg.login?.url && at === new URL(cfg.login.url, base).pathname) || /log-?in|sign-?in/i.test(at)) {
    console.error(`SESSION_COOKIES do not sign in: ${seedsIn[0]} went to ${page.url()} (expired, wrong secret, or wrong cookie name)`);
    process.exit(1);
  }
  await page.close();
  await ctx.storageState({ path: storage });
  authRoutes = (await crawl(ctx, seedsIn, true)).filter((p) => !publicRoutes.includes(p));
  await ctx.close();
} else if (cfg.login && process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const loginUrl = new URL(cfg.login.url, base).href;
  await page.goto(loginUrl, { waitUntil: "networkidle" }).catch(() => page.goto(loginUrl));
  await page.fill(cfg.login.emailSelector || 'input[type=email], input[name=email], input[name=username]', process.env.LOGIN_EMAIL);
  await page.fill(cfg.login.passwordSelector || "input[type=password]", process.env.LOGIN_PASSWORD);
  await page.click(cfg.login.submitSelector || 'button[type=submit], form button:not([type=button])');
  await page.waitForURL((u) => u.href !== loginUrl && !/login|sign-?in/i.test(u.pathname), { timeout: 20000 }).catch(() => {});
  if (/login|sign-?in/i.test(new URL(page.url()).pathname)) {
    console.error(`login failed: still on ${page.url()}`);
    process.exit(1);
  }
  const landing = new URL(page.url()).pathname;
  await ctx.storageState({ path: storage });
  authRoutes = (await crawl(ctx, [landing, ...(cfg.authRoutes || [])], true)).filter((p) => !publicRoutes.includes(p));
  await ctx.close();
}

await browser.close();
const routes = [...publicRoutes.map((path) => ({ path, auth: false })), ...authRoutes.map((path) => ({ path, auth: true }))];
writeFileSync(resolve(dir, "routes.json"), JSON.stringify(routes, null, 2));
console.log(`claudes-babysitter: ${publicRoutes.length} public + ${authRoutes.length} signed-in pages → .babysitter/routes.json`);
