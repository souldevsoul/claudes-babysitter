#!/usr/bin/env node
// Logs in (optional, per role) and crawls the site so the specs cover every page — public, signed-in, every role,
// one real instance of every dynamic route, in every language.
//   BASE_URL=https://app LOGIN_EMAIL=… LOGIN_PASSWORD=… node playwright/prepare.mjs
// A site with no password form (an emailed code, a magic link, Steam…) takes a session instead:
//   SESSION_COOKIES='[{"name":"authjs.session-token","value":"…"}]'  (or name=value for one cookie)
// with "authRoutes" in babysitter.config.json as the signed-in pages to start the crawl from.
// More roles (a buyer and a specialist see different pages): babysitter.config.json →
//   "roles": [{ "name": "specialist", "env": { "LOGIN_EMAIL": "SPECIALIST_EMAIL", "LOGIN_PASSWORD": "SPECIALIST_PASSWORD" } },
//             { "name": "admin", "env": { "SESSION_COOKIES": "ADMIN_SESSION" }, "authRoutes": ["/admin"] }]
// — the values name environment variables; or env BABYSITTER_ROLES='[{"name":"specialist","LOGIN_EMAIL":"…","LOGIN_PASSWORD":"…"}]'.
// Writes .babysitter/storage.json (default role), .babysitter/storage-<role>.json, .babysitter/routes.json
// ([{path, auth, role?, template?}]), .babysitter/locales.json (languages and how to switch them) and
// .babysitter/crawl.json (what was found and what was NOT reached: dynamic routes without an instance, roles that
// could not sign in, the page cap). Credentials come only from env; nothing secret is written to the config file.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { dismissConsent } from "./consent.mjs";
import { detectLocales } from "./locales.mjs";
import { repoLocales, inOtherLocale } from "../lib/locales.js";
import { templateOf } from "../lib/route-map.js";

const root = process.env.BABYSITTER_ROOT || process.cwd();
const cfgPath = process.env.BABYSITTER_CONFIG || resolve(root, "babysitter.config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
// 5.5.0 (Kindred, issue #4): init wrote acceptance.auth.signIn but no login.url, and every role was skipped with
// "no login.url" while the run still summed up as normal — the sign-in route init found is the login page too
if (!cfg.login?.url && cfg.acceptance?.auth?.signIn) cfg.login = { ...(cfg.login || {}), url: cfg.acceptance.auth.signIn };
let base = process.env.BASE_URL || cfg.baseURL;
if (!base) { console.error("BASE_URL (or baseURL in babysitter.config.json) is required"); process.exit(2); }
// vertex.boutique → 308 → www.vertex.boutique: every crawled link was "another origin" and the crawl found 0 pages,
// silently. The site's own redirect to its www / apex twin is followed, and said.
try {
  const res = await fetch(base, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  const to = new URL(res.url), from = new URL(base);
  if (to.origin !== from.origin && to.hostname.replace(/^www\./, "") === from.hostname.replace(/^www\./, "")) {
    console.log(`claudes-babysitter: ${from.origin} redirects to ${to.origin} — crawling ${to.origin}`);
    base = to.origin;
  }
} catch {}
const dir = resolve(root, ".babysitter");
mkdirSync(dir, { recursive: true });
const storage = resolve(dir, "storage.json");
for (const f of readdirSync(dir)) if (/^storage(-[\w-]+)?\.json$/.test(f)) rmSync(resolve(dir, f));
const storageFor = (role) => (!role || role === "user" ? storage : resolve(dir, `storage-${String(role).replace(/[^\w-]/g, "_")}.json`));

const maxPages = Number(process.env.MAX_PAGES || cfg.crawl?.maxPages || 40);
const exclude = [/\/api\//, /log-?out|sign-?out|delete|unsubscribe|\/cdn-cgi\//i, /\.(pdf|zip|png|jpe?g|webp|svg|xml|txt|ics|csv)$/i, ...(cfg.crawl?.exclude || []).map((r) => new RegExp(r))];
const log = (m) => console.log(`claudes-babysitter: ${m}`);

// ───────── route templates from the repo: every app router page.tsx → "/tasks/[id]" ─────────
const repoFiles = (() => {
  if (!existsSync(resolve(root, "package.json"))) return [];
  try { return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean); } catch { return []; }
})();
const templates = [...new Set(repoFiles.map((f) => templateOf(f)).filter((t) => t !== null))];
const noLocale = (t) => t.replace(/^\/\[(locale|lang|lng|language)\]/, "") || "/";
const dynamic = templates.filter((t) => /\[/.test(noLocale(t)) && !/\[\[?\.\.\./.test(noLocale(t)));
const tplRe = (t) => new RegExp("^" + t.replace(/^\/\[(locale|lang|lng|language)\]/, "(?:/[a-z]{2}(?:-[A-Za-z]{2,4})?)?").replace(/\/\[\[\.\.\.\w+\]\]/g, "(?:/.*)?").replace(/\[\.\.\.\w+\]/g, ".+").replace(/\[\w+\]/g, "[^/]+") + "/?$");
const tplList = templates.map((t) => ({ t, re: tplRe(t), dyn: /\[/.test(noLocale(t)) })).sort((a, b) => Number(a.dyn) - Number(b.dyn)); // static first: /tasks/new beats /tasks/[id]
const templateFor = (p) => (tplList.find((x) => x.re.test(p)) || {}).t || null;
// without a repo: collapse ids so /orders/123 and /orders/456 are one template
const idKey = (p) => p.split("/").map((s) => (/^\d+$|^[0-9a-f]{8,}$|^[0-9a-f-]{20,}$|^c[a-z0-9]{20,}$/i.test(s) ? ":id" : s)).join("/");
const keyOf = (p) => templateFor(p) || idKey(p);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const crawlReport = { base, roles: [], dynamicTemplates: dynamic, missingDynamic: [], capped: [], clickedRows: [], locales: null };

/**
 * Breadth-first crawl from `seeds`. One page per route template (a /tasks/[id] instance is opened once). Links to a
 * template not seen yet jump the queue, so a dynamic route is reached before the page cap is. On signed-in pages,
 * list rows that navigate by click (no href) are followed once per page — every non-GET request aborted.
 */
async function crawl(context, seeds, auth) {
  const page = await context.newPage();
  const block = (route) => (/^(GET|HEAD|OPTIONS)$/.test(route.request().method()) ? route.fallback() : route.abort());
  await page.route("**/*", block);
  const queue = [...seeds];
  const seen = new Map();
  const visited = () => [...seen.values()].filter(Boolean).length;
  let capped = 0;
  while (queue.length) {
    const path = queue.shift();
    const key = keyOf(path);
    if (seen.has(key) || exclude.some((r) => r.test(path))) continue;
    const isNewDynamic = dynamic.includes(templateFor(path));
    if (visited() >= maxPages && !isNewDynamic) { capped++; continue; }
    const res = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
    if (!res || res.status() >= 400) { seen.set(key, null); continue; }
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const landed = new URL(page.url());
    if (landed.origin !== new URL(base).origin) { seen.set(key, null); continue; }
    const finalPath = landed.pathname;
    // a signed-out visit that bounces to the login page is not a public page
    if (!auth && cfg.login && finalPath === new URL(cfg.login.url, base).pathname && path !== finalPath) { seen.set(key, null); continue; }
    seen.set(key, finalPath);
    if (keyOf(finalPath) !== key) seen.set(keyOf(finalPath), finalPath);
    const links = await page.$$eval("a[href], [data-href], [role=link][href]", (as) => as.map((a) => a.href || new URL(a.getAttribute("data-href"), location.href).href)).catch(() => []);
    const fresh = [], rest = [];
    for (const h of links) {
      try {
        const u = new URL(h);
        if (u.origin !== new URL(base).origin) continue;
        const k = keyOf(u.pathname);
        if (seen.has(k) || queue.includes(u.pathname)) continue;
        (dynamic.includes(templateFor(u.pathname)) || !templates.length && /:id/.test(k) ? fresh : rest).push(u.pathname);
      } catch {}
    }
    queue.unshift(...new Set(fresh));
    queue.push(...new Set(rest));
    // rows that open a detail page by click (router.push), signed in only: one per page
    if (auth) {
      const row = await page.evaluate(() => {
        const cands = Array.from(document.querySelectorAll("tbody tr, [role=row], li, article, [class*=card i], [class*=row i]"))
          .filter((el) => getComputedStyle(el).cursor === "pointer" && !el.querySelector("a[href]") && !el.closest("a[href], header, nav, footer") && el.getBoundingClientRect().height >= 16);
        const el = cands[0];
        if (!el) return null;
        el.setAttribute("data-bs-row", "");
        return (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      }).catch(() => null);
      if (row) {
        const from = page.url();
        await page.locator("[data-bs-row]").first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForURL((u) => u.href !== from, { timeout: 5000 }).catch(() => {});
        const to = new URL(page.url());
        if (to.href !== from && to.origin === new URL(base).origin && !seen.has(keyOf(to.pathname))) { queue.unshift(to.pathname); crawlReport.clickedRows.push(`${new URL(from).pathname} → ${to.pathname} (row "${row}")`); }
      }
    }
  }
  if (capped) crawlReport.capped.push(`${auth ? "signed-in" : "public"}: ${capped} more link(s) not opened (crawl.maxPages ${maxPages})`);
  await page.close();
  return [...new Set([...seen.values()].filter(Boolean))];
}

/* ───────── sign in ───────── */
function sessionCookies(raw) {
  const list = raw.trim().startsWith("[") ? JSON.parse(raw) : [{ name: raw.slice(0, raw.indexOf("=")), value: raw.slice(raw.indexOf("=") + 1) }];
  return list.map((c) => ({ name: c.name, value: c.value, url: base, ...(c.secure ? { secure: true } : {}) }));
}

/** Signs a fresh context in; returns { ctx, landing } or throws with the reason. */
async function signIn(creds, seedsIn) {
  const ctx = await browser.newContext();
  if (creds.SESSION_COOKIES) {
    await ctx.addCookies(sessionCookies(creds.SESSION_COOKIES));
    const page = await ctx.newPage();
    await page.goto(new URL(seedsIn[0] || "/", base).href, { waitUntil: "domcontentloaded" }).catch(() => {});
    const at = new URL(page.url()).pathname;
    await page.close();
    if ((cfg.login?.url && at === new URL(cfg.login.url, base).pathname) || /log-?in|sign-?in/i.test(at)) { await ctx.close(); throw new Error(`SESSION_COOKIES do not sign in: ${seedsIn[0]} went to ${at} (expired, wrong secret, or wrong cookie name)`); }
    return { ctx, landing: seedsIn[0] || "/" };
  }
  const login = { ...(cfg.login || {}), ...(creds.login || {}) };
  if (!login.url) { await ctx.close(); throw new Error("no login.url in babysitter.config.json"); }
  const page = await ctx.newPage();
  const loginUrl = new URL(login.url, base).href;
  await page.goto(loginUrl, { waitUntil: "networkidle" }).catch(() => page.goto(loginUrl));
  // a cookie banner pinned over the form swallowed the submit click (forge, 2026-10): answer it first
  const consent = await dismissConsent(page);
  if (consent) log(`cookie banner answered ("${consent}") before signing in`);
  await page.fill(login.emailSelector || 'input[type=email], input[name=email], input[name=username]', creds.LOGIN_EMAIL);
  const password = page.locator(login.passwordSelector || "input[type=password]").first();
  await password.fill(creds.LOGIN_PASSWORD);
  // the submit of the form that holds the password field — not the banner's "Manage"/"Accept" submits
  const submit = page.locator(login.submitSelector || 'form:has(input[type=password]) button[type=submit], form:has(input[type=password]) button:not([type=button])').first();
  await submit.click({ timeout: 5000 }).catch(async () => {
    log("the sign-in button is covered — submitting with Enter");
    await password.press("Enter");
  });
  await page.waitForURL((u) => u.href !== loginUrl && !/login|sign-?in/i.test(u.pathname), { timeout: 20000 }).catch(() => {});
  if (/login|sign-?in/i.test(new URL(page.url()).pathname)) { await ctx.close(); throw new Error(`login failed: still on ${page.url()}`); }
  const landing = new URL(page.url()).pathname;
  await page.close();
  return { ctx, landing };
}

/** Roles to sign in as: the default one (LOGIN_EMAIL / SESSION_COOKIES) and babysitter.config.json → roles / env BABYSITTER_ROLES. */
function roles() {
  const out = [];
  if (process.env.SESSION_COOKIES) out.push({ name: "user", creds: { SESSION_COOKIES: process.env.SESSION_COOKIES }, seeds: cfg.authRoutes?.length ? cfg.authRoutes : ["/"] });
  else if (cfg.login && process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) out.push({ name: "user", creds: { LOGIN_EMAIL: process.env.LOGIN_EMAIL, LOGIN_PASSWORD: process.env.LOGIN_PASSWORD }, seeds: cfg.authRoutes || [] });
  let extra = [];
  try { extra = [...(cfg.roles || []), ...(process.env.BABYSITTER_ROLES ? JSON.parse(process.env.BABYSITTER_ROLES) : [])]; } catch (e) { console.error(`BABYSITTER_ROLES is not JSON: ${e.message}`); }
  for (const r of extra) {
    if (!r?.name) continue;
    const creds = {};
    const missing = [];
    for (const k of ["LOGIN_EMAIL", "LOGIN_PASSWORD", "SESSION_COOKIES"]) {
      const ref = r.env?.[k] ?? r[k];
      if (ref == null) continue;
      // in the config file a value names an env variable; a literal secret there is refused (it would be committed)
      const fromCfg = (cfg.roles || []).includes(r);
      const v = /^[A-Z][A-Z0-9_]*$/.test(ref) && process.env[ref] !== undefined ? process.env[ref] : fromCfg ? undefined : ref;
      if (v === undefined) missing.push(`${k} (env ${ref})`); else creds[k] = v;
    }
    const ok = creds.SESSION_COOKIES || (creds.LOGIN_EMAIL && creds.LOGIN_PASSWORD);
    out.push({ name: r.name, creds, seeds: r.authRoutes || cfg.authRoutes || [], login: r.login, skip: ok ? null : `no credentials: ${missing.join(", ") || "set env LOGIN_EMAIL/LOGIN_PASSWORD or SESSION_COOKIES names in roles[].env"}` });
  }
  return out;
}

/* ───────── run ───────── */
const seeds = cfg.routes || ["/"];
const anon = await browser.newContext();
let publicRoutes = await crawl(anon, seeds, false);
await anon.close();
const routes = [];
for (const role of roles()) {
  if (role.skip) { crawlReport.roles.push({ name: role.name, ok: false, why: role.skip }); log(`role "${role.name}" not signed in — ${role.skip}`); continue; }
  try {
    const { ctx, landing } = await signIn({ ...role.creds, login: role.login }, role.seeds.length ? role.seeds : ["/"]);
    await ctx.storageState({ path: storageFor(role.name) });
    const found = (await crawl(ctx, [...new Set([landing, ...role.seeds])], true)).filter((p) => !publicRoutes.includes(p));
    await ctx.close();
    for (const path of found) routes.push({ path, auth: true, ...(role.name !== "user" ? { role: role.name } : {}) });
    crawlReport.roles.push({ name: role.name, ok: true, pages: found.length });
  } catch (e) {
    crawlReport.roles.push({ name: role.name, ok: false, why: e.message });
    if (role.name === "user") { console.error(e.message); await browser.close(); process.exit(1); }
    log(`role "${role.name}": ${e.message}`);
  }
}

/* ───────── languages ───────── */
let locales = null;
try {
  locales = await detectLocales(browser, base, { repo: repoLocales(root), cfg: cfg.locales || null, log });
  writeFileSync(resolve(dir, "locales.json"), JSON.stringify(locales, null, 2));
  crawlReport.locales = { default: locales.default, codes: locales.locales.map((l) => `${l.code}${l.default ? " (default)" : l.verified === false ? " (NOT verified)" : ""}`), from: locales.from };
} catch (e) {
  log(`language detection failed: ${e.message.split("\n")[0]} — checks run in the default language only`);
}
await browser.close();

// pages of another language under a URL prefix (/az/pricing) are covered by the locale runs, not as extra routes
const own = (p) => !locales || !inOtherLocale(p, locales);
publicRoutes = publicRoutes.filter(own);
const all = [...publicRoutes.map((path) => ({ path, auth: false })), ...routes.filter((r) => own(r.path))]
  .map((r) => { const t = templateFor(r.path); return t && t !== r.path ? { ...r, template: t } : r; });
const reached = new Set(all.map((r) => templateFor(r.path)).filter(Boolean));
crawlReport.missingDynamic = dynamic.filter((t) => !reached.has(t) && !(cfg.sampleParams && Object.keys(cfg.sampleParams).length));
writeFileSync(resolve(dir, "routes.json"), JSON.stringify(all, null, 2));
if (!all.length) { writeFileSync(resolve(dir, "crawl.json"), JSON.stringify(crawlReport, null, 2)); console.error(`claudes-babysitter: the crawl found NO page on ${base} (every seed failed, answered ≥ 400 or left the site) — nothing would be checked`); process.exit(1); }
// 5.2.0: the stage (live / test) from the Nexus project status, unless babysitter.config.json → stage says it
try {
  const { fetchStage, saveStage } = await import("../lib/stage.js");
  const key = String(process.env.NEXUS_API_KEY || String(process.env.NEXUS_API_KEYS || "").split(",")[0] || "").trim();
  const slug = cfg.nexus?.project || cfg.name;
  if (!cfg.stage && process.env.NEXUS_URL && key && slug) {
    const st = await fetchStage({ url: process.env.NEXUS_URL, key, slug });
    if (st) { saveStage(resolve(dir, "stage.json"), st); crawlReport.stage = `${st.stage} (Nexus ${slug}: ${st.status})`; log(`stage: ${st.stage} (Nexus project ${slug} is ${st.status}) → .babysitter/stage.json`); }
  } else if (cfg.stage) crawlReport.stage = `${cfg.stage} (babysitter.config.json)`;
} catch (e) { log(`stage: Nexus not asked — ${String(e.message || e).split("\n")[0]}`); }
writeFileSync(resolve(dir, "crawl.json"), JSON.stringify(crawlReport, null, 2));
const byRole = crawlReport.roles.filter((r) => r.ok).map((r) => `${r.pages} as ${r.name}`).join(", ");
log(`${publicRoutes.length} public${byRole ? ` + ${byRole}` : ""} pages → .babysitter/routes.json`);
if (crawlReport.locales) log(`languages: ${crawlReport.locales.codes.join(", ")} → .babysitter/locales.json`);
if (crawlReport.missingDynamic.length) log(`⚠ no page found for ${crawlReport.missingDynamic.length} dynamic route(s): ${crawlReport.missingDynamic.join(", ")} — link them from a list, or set sampleParams in babysitter.config.json`);
for (const c of crawlReport.capped) log(`⚠ crawl cap: ${c}`);
for (const r of crawlReport.roles.filter((x) => !x.ok)) log(`⚠ role "${r.name}" not checked: ${r.why}`);
// 5.5.0: sign-in was asked for (roles, LOGIN_EMAIL or SESSION_COOKIES) and not one signed-in page was reached — the
// run would check the public pages only and still look normal. That is a failure, loudly (BABYSITTER_SIGNED_OUT=1
// says a signed-out run is meant).
if (crawlReport.roles.length && !crawlReport.roles.some((r) => r.ok && r.pages > 0) && !/^(1|true|yes)$/i.test(process.env.BABYSITTER_SIGNED_OUT || "")) {
  console.error(`${"!".repeat(64)}\n!! claudes-babysitter: NO SIGNED-IN PAGE WAS REACHED — ${crawlReport.roles.length} role(s) configured, none signed in:\n${crawlReport.roles.map((r) => `!!   ✗ ${r.name}: ${r.ok ? "signed in, but no page beyond the public ones was found (set authRoutes)" : r.why}`).join("\n")}\n!! Dashboards, settings and wallets would not be checked. Fix the credentials / login.url, or set\n!! BABYSITTER_SIGNED_OUT=1 for a run that is meant to stay signed out.\n${"!".repeat(64)}`);
  process.exit(1);
}
