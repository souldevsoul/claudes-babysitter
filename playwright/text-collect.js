// The text pass reads a page once: the copy content.spec collects (checks/content.js collectCopy), the copy extras
// (checks/copy.js), every deterministic per-page copy rule on that one collection (CT1–CT13, CT25, CT29, CT30, P4 —
// the same functions content.spec runs, on the same data), the record the site-wide rules read (CT7, CT15–CT22, CT24,
// CT26, CT28, 6.15) and a page model for Jev: numbered lines with their section heading and region.
// Plain JavaScript; needs checks.install(page) first.
import * as k from "./checks/content.js";
import * as cp from "./checks/copy.js";
import { lintSegment } from "../lib/content-rules.js";

/** Section heading, region and list membership of every collected element (one round-trip). */
const structure = (page, n) => page.evaluate((count) => {
  const els = window.__contentEls || [];
  const heads = Array.from(document.querySelectorAll("h1, h2, h3, h4, [role=heading]")).filter((h) => window.__uiVisible(h));
  const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const out = [];
  for (let i = 0; i < count; i++) {
    const el = els[i];
    if (!el) { out.push(null); continue; }
    let h = null;
    for (const x of heads) { if (x === el || x.contains(el)) { h = x; break; } if (before(x, el)) h = x; else break; }
    const dialog = el.closest("[role=dialog], dialog, [role=alertdialog]");
    const region = el.closest("footer, [role=contentinfo]") ? "footer" : el.closest("header, nav, [role=navigation]") ? "nav" : dialog ? "dialog" : "main";
    out.push({ section: h && h !== el ? clean(h.innerText) : "", region, li: !!el.closest("li") });
  }
  return out;
}, n);

/**
 * Text a reader reaches with one click, without clicking: closed <details>, hidden="until-found" and collapsed
 * accordion / disclosure panels (aria-expanded=false → aria-controls). Read from the DOM (textContent), each block with
 * its trigger as the section. Nothing on the page changes.
 */
export const collapsedText = (page) => page.evaluate(() => {
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const out = [], seen = new Set();
  const blocks = (root, section) => {
    const parts = Array.from(root.querySelectorAll("p, li, h3, h4, td, dd")).filter((e) => !e.querySelector("p, li"));
    const list = parts.length ? parts : [root];
    for (const e of list) { const t = clean(e.textContent); if (t && t.length > 1 && !seen.has(t)) { seen.add(t); out.push({ text: t.slice(0, 1500), kind: "body", region: "collapsed", section: section.slice(0, 120), li: e.tagName === "LI" }); } }
  };
  for (const d of Array.from(document.querySelectorAll("details:not([open])"))) { const sum = d.querySelector("summary"); const body = d.cloneNode(true); body.querySelector("summary")?.remove(); blocks(body, clean(sum?.textContent)); }
  for (const t of Array.from(document.querySelectorAll('[aria-expanded="false"][aria-controls]'))) {
    if (t.closest("header, nav, [role=navigation], footer")) continue;
    const panel = document.getElementById(t.getAttribute("aria-controls"));
    if (panel && !panel.closest("header, nav")) blocks(panel, clean(t.textContent));
  }
  for (const h of Array.from(document.querySelectorAll('[hidden="until-found"]'))) {
    const trigger = h.id && document.querySelector(`[aria-controls="${h.id}"]`);
    blocks(h, clean(trigger?.textContent || ""));
  }
  return out;
}).catch(() => []);

const OPENER = /^(cookie settings|manage cookies|cookie preferences|privacy settings|settings|details|more details|learn more|add credit|add credits|top up|top-up|buy credits|add funds)$/i;
/**
 * Dialogs a page opens from a button (aria-haspopup=dialog, or a short label such as "Cookie settings", "Add credit"):
 * each opened once, its text read, closed with Escape. Requests that are not GET are aborted meanwhile. Run last: it
 * acts on the page.
 */
export async function dialogText(page, { max = 6, skip = new Set() } = {}) {
  const out = [];
  const block = (route) => (route.request().method() === "GET" ? route.continue() : route.abort());
  await page.route("**/*", block).catch(() => { });
  try {
    const labels = await page.evaluate((src) => {
      const re = new RegExp(src, "i");
      return Array.from(document.querySelectorAll("button, [role=button]")).filter((b) => window.__uiVisible(b) && !b.closest("form") && (b.getAttribute("aria-haspopup") === "dialog" || b.getAttribute("aria-haspopup") === "true" || re.test((b.innerText || "").replace(/\s+/g, " ").trim().replace(/^\[|\]$/g, ""))))
        .map((b) => (b.innerText || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    }, OPENER.source).catch(() => []);
    for (const label of [...new Set(labels)].filter((l) => !skip.has(l.toLowerCase())).slice(0, max)) {
      skip.add(label.toLowerCase());
      const b = page.getByRole("button", { name: label, exact: true }).first();
      if (!(await b.isVisible().catch(() => false))) continue;
      await b.click({ timeout: 3000 }).catch(() => { });
      await page.waitForTimeout(500);
      const lines = await page.evaluate(() => {
        const d = Array.from(document.querySelectorAll("[role=dialog], dialog[open], [role=alertdialog]")).filter((x) => window.__uiVisible(x)).pop();
        if (!d) return [];
        const title = (d.getAttribute("aria-label") || d.querySelector("h1, h2, h3, [class*=title i]")?.textContent || "").replace(/\s+/g, " ").trim();
        const seen = new Set();
        return Array.from(d.querySelectorAll("h1, h2, h3, h4, p, li, label, button, a, td, dt, dd, span")).filter((e) => !e.querySelector("p, li, h2, h3, button, label") && window.__uiVisible(e))
          .map((e) => ({ text: (e.innerText || "").replace(/\s+/g, " ").trim(), kind: /^H\d$/.test(e.tagName) ? "heading" : e.tagName === "BUTTON" ? "button" : "body", li: e.tagName === "LI" }))
          .filter((x) => x.text && !seen.has(x.text) && seen.add(x.text)).map((x) => ({ ...x, region: "dialog", section: title.slice(0, 120) }));
      }).catch(() => []);
      out.push(...lines.map((l) => ({ ...l, section: l.section || label })));
      await page.keyboard.press("Escape").catch(() => { });
      await page.waitForTimeout(300);
    }
  } finally { await page.unroute("**/*", block).catch(() => { }); }
  return out;
}

/**
 * @param {import("@playwright/test").Page} page an opened page (checks.install done, settled)
 * @returns {Promise<{ copy: any, record: any, model: any, det: { hard: any[], soft: any[], info: string[] } }>}
 */
export async function readPage(page, { route, cfg = {}, locale = null, defaultLocale = null, keys = null, stage = null, own = [], dns = false, dnsCache = null, defaults = null, auth = false, role = null, deep = true, dialogSeen = new Set() } = {}) {
  const copy = await k.collectCopy(page);
  const extras = await cp.copyExtrasData(page).catch(() => null);
  const hard = [], soft = [], info = [];
  const tag = (list, test) => list.map((f) => ({ ...f, test }));
  // content.spec "CT1–CT8 copy" (and the locale test's CT1–CT8 half)
  const cf = await k.copyFindings(page, cfg, copy, locale && locale !== defaultLocale ? locale : null, { own: auth ? own : [] });
  hard.push(...tag(cf.hard, "CT1–CT8 copy"));
  soft.push(...tag(cf.soft, "CT1–CT8 copy"));
  // content.spec "CT9/CT10 every email address receives mail and is a mailto link"
  const em = await k.emailFindings(page, { cfg, copy, dns, cache: dnsCache });
  hard.push(...tag(em.hard, "CT9/CT10 email"));
  info.push(...em.info);
  // content.spec "CT12/CT25/CT29/CT30/P4"
  hard.push(...tag(await cp.copyExtrasFindings(page, cfg, { data: extras, siteWide: true, stage }), "CT12/CT25/CT29/CT30/P4"));
  // content.spec "CT12/CT13" (default language) or "CT11–CT13" (another language, against the default page's copy)
  const lang = (await k.languageFindings(page, { cfg, copy, keys, locale: locale || defaultLocale, defaults, defaultLocale })).hard;
  const warnOnly = !Array.isArray(cfg.locales) && cfg.locales?.untranslated === "warn";
  hard.push(...tag(warnOnly ? lang.filter((o) => o.id !== "CT11") : lang, locale && locale !== defaultLocale ? "CT11–CT13 translated" : "CT12/CT13 keys and lang"));
  if (warnOnly) soft.push(...tag(lang.filter((o) => o.id === "CT11"), "CT11 untranslated (warn)"));
  const record = k.pageRecord(route, copy, locale || null);
  record.extras = extras;
  record.slugs = extras?.slugs || [];
  const st = await structure(page, copy.segs.length ? Math.max(...copy.segs.map((s) => s.i)) + 1 : 0).catch(() => []);
  const lines = copy.segs.filter((s) => !s.user).map((s) => ({ text: s.text, kind: s.kind, region: st[s.i]?.region || (s.footer ? "footer" : "main"), section: st[s.i]?.section || "", li: !!st[s.i]?.li }));
  // what one click would show: collapsed answers, then dialogs (last: they act on the page)
  if (deep) {
    const have = new Set(lines.map((l) => l.text));
    for (const l of await collapsedText(page)) if (!have.has(l.text)) { have.add(l.text); lines.push(l); }
    for (const l of await dialogText(page, { skip: dialogSeen })) if (!have.has(l.text)) { have.add(l.text); lines.push(l); }
    // the per-segment copy rules (CT1–CT8) on what the visible read could not see
    const cc = k.contentConfig(cfg);
    for (const l of lines.filter((x) => x.region === "collapsed" || x.region === "dialog"))
      for (const x of lintSegment({ text: l.text, kind: l.kind, collapsed: true, locale: locale || copy.lang || "" }, cc))
        if (!x.soft) hard.push({ id: x.id, what: `${x.what} — fix: ${x.fix} [${x.id}]`, where: `${l.region === "dialog" ? "dialog" : "collapsed section"}${l.section ? ` "${l.section}"` : ""}`, test: "CT1–CT8 copy (collapsed sections and dialogs)" });
  }
  const model = {
    route, locale: locale && locale !== defaultLocale ? locale : null, lang: locale || defaultLocale || null, auth: !!auth, role: auth ? role || "user" : null, title: copy.title, h1: copy.h1[0] || "",
    lines, links: (copy.links || []).map(({ path, label, region }) => ({ path, label, region })),
    controls: (extras?.controls || []).map((c) => ({ label: c.label, href: c.href })),
  };
  return { copy, record, model, det: { hard, soft, info } };
}
