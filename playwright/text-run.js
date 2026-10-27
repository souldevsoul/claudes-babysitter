// The browser half of `babysitter text`: one browser, one load per route × locale × role at desktop width, the copy read
// once (text-collect.js), and the site-wide copy rules of content.spec run over the records of those loads — no second
// crawl per site-wide test.
import { chromium, request as pwRequest } from "@playwright/test";
import * as c from "./checks.js";
import * as k from "./checks/content.js";
import * as cp from "./checks/copy.js";
import { readPage } from "./text-collect.js";
import { titleFindings, slugFindings, nearCopies, readCopyRegistry, recordCopy } from "../lib/copy-rules.js";
import { resolveStage } from "../lib/stage.js";
import { translationKeys } from "../lib/content-lint.js";
import { loadRoutes, loadLocales, applyLocale as applyDetected, localize, storageFor, STATE_DIR, ROOT } from "./project.js";
import { existsSync, readFileSync } from "node:fs";
import { routeKey } from "../lib/route-selection.js";

export const TEXT_VIEWPORT = { width: 1440, height: 900 };

/** The site-wide copy rules (content.spec "content site-wide") over records by locale. */
export async function siteWide(byLocale, { cfg, defaultLocale, locales, base, on, request }) {
  const out = [], soft = [];
  const push = (list, test) => out.push(...list.map((x) => ({ ...x, test, route: null })));
  const all = byLocale.get(defaultLocale || "default") || [];
  if (on("CT15") || on("CT16")) {
    const list = [...k.namingFindings(all, cfg)];
    for (const loc of locales) list.push(...k.namingFindings(byLocale.get(loc.code) || [], cfg).map((o) => ({ ...o, what: `[${loc.code}] ${o.what}` })));
    push(list, "CT15/CT16 one name per legal document, one © line");
  }
  if (on("CT17")) soft.push(...k.variantFindings(all).map((x) => ({ ...x, test: "CT17 the same thing named two ways" })));
  if (on("CT18")) soft.push(...k.factFindings(all, { exclude: on("CT20") ? ["refund", "storage"] : [] }).map((x) => ({ ...x, test: "CT18 numbers that disagree" })));
  const redirects = new Map();
  const dead = [];
  if (request && (on("CT21") || on("CT22"))) {
    const paths = [...new Set(all.flatMap((r) => (r.links || []).map((l) => l.path)))].filter((p) => !/log-?out|sign-?out|\/api\//i.test(p)).slice(0, 150);
    for (const p of paths) {
      const res = await request.get(p, { maxRedirects: 0, failOnStatusCode: false }).catch(() => null);
      const loc = res && res.status() >= 300 && res.status() < 400 ? res.headers()["location"] : null;
      if (!loc) continue;
      try {
        const u = new URL(loc, "http://x" + p);
        const to = u.pathname.replace(/\/$/, "") || "/";
        if (to !== p && !/^\/(en|fr|de|es|az|kk|ru)(\/|$)/.test(to.replace(p, "")) && !/(sign-?in|log-?in|signin|login|auth)(\/|$)/i.test(to)) redirects.set(p, to);
      } catch { }
    }
    // CT22 (a) dead links — D1 reports them in a full run; the text pass reports them when it runs alone
    if (on("CT22") && process.env.BABYSITTER_TEXT_DEAD !== "0") {
      const crawled = new Set([...byLocale.values()].flat().map((r) => r.route.replace(/\/$/, "") || "/"));
      const targets = new Map();
      for (const r of all) for (const l of r.links || []) if (!crawled.has(l.path) && !targets.has(l.path) && !/log-?out|sign-?out|\/api\//i.test(l.path)) targets.set(l.path, { path: l.path, label: l.label, where: `${r.route} ${l.region}` });
      for (const t of [...targets.values()].slice(0, 80)) { const res = await request.get(t.path, { maxRedirects: 5, failOnStatusCode: false }).catch(() => null); if (!res || res.status() >= 400) dead.push({ ...t, status: res ? res.status() : "no response" }); }
    }
  }
  const consistency = ["CT19", "CT20", "CT21", "CT22"].some(on) ? k.consistencyRendered(byLocale, cfg, { defaultLocale, deadLinks: dead, redirects }) : [];
  soft.push(...consistency.filter((x) => x.soft).map((x) => ({ ...x, test: "CT31 one list in two orders" })));
  push([...(on("CT7") ? k.localeDateFindings(byLocale) : []), ...consistency.filter((x) => !x.soft)], "CT17–CT22 one name, one fact, one label per concept; CT7 one date");
  const list = [];
  if (on("CT26")) list.push(...slugFindings(all));
  if (on("CT28")) list.push(...cp.siteCaseFindings(all, cfg));
  if (on("6.15")) {
    list.push(...titleFindings(all, { brands: [cfg.name].filter(Boolean) }));
    for (const loc of locales) list.push(...titleFindings(byLocale.get(loc.code) || [], { brands: [cfg.name].filter(Boolean) }).map((o) => ({ ...o, what: `[${loc.code}] ${o.what}` })));
  }
  const self = cfg.name || new URL(base || "http://x").hostname;
  const mine = all.filter((r) => !r.auth).flatMap((r) => (r.h1 || []).slice(0, 1).map((text) => ({ route: r.route, text })));
  if (on("CT24")) list.push(...nearCopies(mine, readCopyRegistry(), self));
  if (process.env.BABYSITTER_COPY_RECORD !== "0") recordCopy(self, mine);
  push(list, "CT24/CT26/CT28/6.15 headlines, slugs, heading case, titles");
  return { hard: out, soft };
}

/**
 * Read every route once per locale × role. @returns {{ pages, det, soft, siteDet, loads, notReached, status, ms }}
 */
// 5.7.1 (--changed): `reuse` is the last run's text-pages.json and `only` the route keys the change reaches; every other
// route × locale × role is taken from the last read (its page model, copy findings and record) instead of loaded again.
// The site-wide rules and Jev's cross-page comparison still run over every page — fresh and reused alike.
export async function readSite({ cfg, log = () => {}, routes = loadRoutes(cfg), headless = true, reuse = null, only = null } = {}) {
  const cc = k.contentConfig(cfg);
  const on = (id) => !(cc.skip || []).includes(id);
  const detected = (() => { try { return loadLocales(cfg); } catch { return { locales: [] }; } })();
  const DEF = (detected.locales || []).find((l) => l.default) || null;
  const locales = cc.locales?.length ? cc.locales : (detected.locales || []).filter((l) => !l.default).map((l) => ({ ...l, detected: true }));
  const defaultLocale = cc.defaultLocale || detected.default || DEF?.code || null;
  const stage = (() => { try { return resolveStage(cfg, `${STATE_DIR}/stage.json`)?.stage || null; } catch { return null; } })();
  let keys = null;
  try { const s = translationKeys(ROOT); keys = s.size ? s : null; } catch { }
  const base = process.env.BASE_URL || cfg.baseURL || "http://localhost:3000";
  const own = k.ownEmails(cfg);
  const dns = process.env.BABYSITTER_DNS !== "0";
  const dnsCache = k.dnsCache(STATE_DIR);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome", headless });
  const request = await pwRequest.newContext({ baseURL: base });
  const pages = [], det = [], soft = [], byLocale = new Map(), status = {};
  let loads = 0, reused = 0;
  const cached = (route, loc) => {
    if (!reuse || !only || only.has(routeKey(route))) return null;
    const lc = loc?.code || null;
    const model = (reuse.pages || []).find((p) => p.route === route.path && !!p.auth === !!route.auth && (p.role || null) === (route.auth ? route.role || "user" : null) && (p.locale || null) === lc);
    const code = loc?.code || defaultLocale || "default";
    const record = (reuse.records?.[code] || []).find((r) => r.route === route.path && !!r.auth === !!route.auth && (r.role || null) === (route.auth ? route.role || "user" : null));
    return model && record ? { model, record, key: keyOf(route, lc) } : null;
  };
  const t0 = Date.now();
  async function open(route, loc) {
    const ctx = await browser.newContext({ viewport: TEXT_VIEWPORT, deviceScaleFactor: 1, baseURL: base, storageState: route?.auth && existsSync(storageFor(route.role)) ? storageFor(route.role) : undefined });
    const page = await ctx.newPage();
    await c.install(page);
    let path = route.path;
    if (loc?.detected) { await applyDetected(ctx, loc, base); path = localize(route.path, loc, DEF); }
    else path = await k.applyLocale(page, loc, route.path, base);
    const resp = await c.gotoStable(page, path).catch((e) => ({ error: e }));
    loads++;
    if (resp?.error) { await ctx.close(); return { error: resp.error }; }
    status[route.path] = resp?.status?.() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => { });
    await page.waitForTimeout(700);
    await c.revealLazy(page);
    await c.dismissArrivalModal(page);
    return { ctx, page };
  }
  try {
    for (const loc of [null, ...locales]) {
      const code = loc?.code || defaultLocale || "default";
      const recs = [];
      const dialogSeen = new Map();
      for (const route of routes) {
        const hit = cached(route, loc);
        if (hit) {
          reused++;
          recs.push(hit.record);
          pages.push(hit.model);
          for (const f of reuse.det || []) if (f.key === hit.key) det.push(f);
          for (const f of reuse.soft || []) if (f.route === route.path && f.key === hit.key) soft.push(f);
          continue;
        }
        const o = await open(route, loc);
        if (o.error) { log(`text pass: ${route.path}${loc ? ` [${loc.code}]` : ""} could not be opened: ${String(o.error.message).split("\n")[0]}`); continue; }
        // CT11 compares a page in another language with the same page in the default language: that record is in hand
        const defRec = loc ? (byLocale.get(defaultLocale || "default") || []).find((r) => r.route === route.path && r.auth === !!route.auth) : null;
        const r = await readPage(o.page, { route: route.path, cfg, locale: loc?.code || null, defaultLocale, keys, stage, own, dns, dnsCache, defaults: on("CT11") && defRec ? defRec.copy : null, auth: route.auth, role: route.role, dialogSeen: dialogSeen.get(route.role || "") || dialogSeen.set(route.role || "", new Set()).get(route.role || "") });
        await o.ctx.close();
        r.record.auth = !!route.auth;
        r.record.role = route.auth ? route.role || "user" : null;
        r.record.copy = { segs: r.copy.segs.map((s) => ({ text: s.text })), title: r.copy.title, lang: r.copy.lang };
        recs.push(r.record);
        r.model.template = route.template || null;
        pages.push(r.model);
        for (const f of r.det.hard) det.push({ ...f, route: route.path, auth: !!route.auth, role: route.auth ? route.role || "user" : null, locale: loc?.code || null, key: keyOf(route, loc?.code), quote: quoteOf(f.what) });
        for (const f of r.det.soft) soft.push({ ...f, route: route.path, key: keyOf(route, loc?.code) });
      }
      // legal pages the footer links to but the crawl did not reach (as content.spec)
      const seen = new Set(recs.map((x) => x.route.replace(/\/$/, "") || "/"));
      const bare = (p) => (loc?.code ? p.replace(new RegExp(`^/${loc.code}(?=/|$)`, "i"), "") || "/" : p);
      for (const p of [...new Set(recs.flatMap((x) => x.legal.map((l) => bare(l.path))))].filter((p) => !seen.has(p))) {
        const prev = only && reuse ? (reuse.records?.[code] || []).find((r) => r.route === p && !r.auth) : null;
        if (prev && !only.has(routeKey({ path: p, auth: false }))) { recs.push(prev); reused++; continue; }
        const o = await open({ path: p, auth: false }, loc);
        if (o.error) continue;
        const r = await readPage(o.page, { route: p, cfg, locale: loc?.code || null, defaultLocale, keys, stage, own, dns, dnsCache });
        await o.ctx.close();
        recs.push(r.record);
      }
      byLocale.set(code, recs);
    }
    const sw = await siteWide(byLocale, { cfg, defaultLocale, locales, base, on, request });
    soft.push(...sw.soft);
    const notReached = [...new Set(routes.filter((r) => r.template && /\[/.test(r.template) && !pages.some((p) => p.template === r.template)).map((r) => r.template))];
    return { pages, det, soft, siteDet: sw.hard.map((f) => ({ ...f, quote: quoteOf(f.what), key: "(site)" })), loads, reused, notReached, status, records: Object.fromEntries(byLocale), ms: Date.now() - t0 };
  } finally {
    await request.dispose().catch(() => { });
    await browser.close().catch(() => { });
  }
}

const keyOf = (route, loc) => `${route.auth ? `[${route.role || "user"}] ` : ""}${route.path}${loc ? ` (${loc})` : ""}`;
/** The first quoted text of a finding's message (what Jev's line is compared with). */
export const quoteOf = (what) => (String(what).match(/"([^"]{3,200})"/) || [, ""])[1];
void readFileSync;
