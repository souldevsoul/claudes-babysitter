// Copy checks on rendered pages (CT1–CT22, docs/checks-content.md). The browser only collects the copy — one
// segment per block of text, with what it is (heading, button, nav item, body) — and the rules of
// lib/content-rules.js run here in Node, the same rules `babysitter content` runs over the source.
// Plain JavaScript on purpose (see ../checks.js). Needs checks.install(page) first (__uiVisible, __uiDescribe …).
// Finding: { what, where, selector?, human?, id }.
import { resolve } from "node:path";
import {
  contentConfig, lintSegment, readsLocale, CT1_LOCALES, findDates, lastUpdatedDates, LAST_UPDATED_RE, findEmails, emailDomainProblem, untranslatedReason, untranslatedWhat,
  looksLikeKey, isRtl, LEGAL_FAMILIES, legalFamily, normName, AUTO_VARIANTS, numericFacts, factConflicts, ruleId,
} from "../../lib/content-rules.js";
import { checkEmails } from "../../lib/email-dns.js";
import { consistencyFindings, normLabel, listOrders, labelLanguages } from "../../lib/content-consistency.js";

export { contentConfig };

/** In the page: every visible block of text, the page's emails, footer legal links, © line, <html lang/dir>. */
export const collectCopy = (page) => page.evaluate(() => {
  const els = [];
  window.__contentEls = els;
  const vis = new Map();
  const visible = (el) => { if (!vis.has(el)) vis.set(el, window.__uiVisible(el)); return vis.get(el); };
  const disp = new Map();
  // each menu item / link in a nav, and each button, is its own piece of copy even when it is display:inline
  const ITEM = "nav a, header a, footer a, [role=navigation] a, [role=menu] [role=menuitem], button, [role=button], [role=tab]";
  const blocky = (el) => { if (!disp.has(el)) { const d = getComputedStyle(el).display; disp.set(el, !(d === "inline" || d === "contents") || el.matches(ITEM)); } return disp.get(el); };
  const blockOf = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (blocky(e)) return e; return document.body; };
  const SKIP = "script, style, noscript, template, pre, textarea, svg, [contenteditable=true], [data-babysitter-ignore]";
  // inline code (`/newbot`, `chat:write`) stands in the sentence as a value: "send {x}." is not "send ."
  const CODE = "code, kbd, samp";
  const recs = new Map();
  // text nodes, and <br> as the space a reader sees ("Every designer.<br>Identity verified.")
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 ? (n.tagName === "BR" ? 1 : 3) : n.parentElement && !n.parentElement.closest(SKIP) ? 1 : 2) });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === 1) { const r = recs.get(blockOf(n.parentElement)); if (r) r.parts.push(" "); continue; }
    const p = n.parentElement;
    const b = blockOf(p);
    if (!n.nodeValue.trim()) { const r = recs.get(b); if (r) r.parts.push(" "); continue; }
    if (!visible(p)) continue;
    const code = p.closest(CODE);
    if (code && b.contains(code) && b !== code) { const r = recs.get(b) || (recs.set(b, { el: b, parts: [] }), recs.get(b)); if (r.lastCode !== code) r.parts.push("{x}"); r.lastCode = code; continue; }
    if (code) continue;
    let r = recs.get(b);
    if (!r) { r = { el: b, parts: [] }; recs.set(b, r); }
    // 5.7.1: A GAP A READER SEES IS A SPACE.
    // Two inline elements side by side with no whitespace between them in the markup
    // (<span>ACME</span><span style="margin-left:8px">TERMS</span>) have no text node between
    // them either, so the parts joined to "ACMETERMS" — and every copy rule and every Jev line
    // then read one invented word. The glyph boxes are measured instead of the markup: a gap on
    // the same line of a fifth of the font size or more is the space it looks like. Markup with
    // no gap (Hello <b>world</b>s, letter-spacing) still joins, because nothing separates it.
    const rng = document.createRange();
    rng.selectNodeContents(n);
    const box = rng.getBoundingClientRect();
    const prev = r.lastBox;
    if (prev && box.width && prev.width) {
      const sameLine = Math.abs(box.top - prev.top) <= Math.max(2, box.height * 0.3);
      const gap = box.left - prev.right;
      const fs = parseFloat(getComputedStyle(p).fontSize) || 16;
      if (sameLine && gap >= fs * 0.2) r.parts.push(" ");
    }
    r.lastBox = box;
    r.parts.push(n.nodeValue);
  }
  const segs = [];
  for (const r of recs.values()) {
    const pre = /pre/.test(getComputedStyle(r.el).whiteSpace);
    const raw = r.parts.join("");
    const text = pre ? raw.trim() : raw.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const el = r.el, tag = el.tagName.toLowerCase();
    const btn = el.closest("button, [role=button], [role=tab], [role=menuitem], [role=option]");
    const link = el.closest("a[href]") || (tag !== "a" && el.querySelector(":scope > a[href]"));
    // a heading split into blocks (<span class="block">) ends where its last line ends: only that part is "the heading's end"
    const h = /^h[1-3]$/.test(tag) ? el : el.closest("h1, h2, h3");
    let headingEnd = !!h;
    if (h && h !== el) { const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); let last = null; for (let x = w.nextNode(); x; x = w.nextNode()) if (x.nodeValue.trim()) last = x; headingEnd = !!last && el.contains(last); }
    const kind = h ? (headingEnd ? "heading" : "body")
      : btn && (btn === el || (btn.innerText || "").trim().length <= 60) ? "button"
        : link && el.closest("nav, [role=navigation], header") && text.length <= 40 ? "nav" : "body";
    const i = els.push(el) - 1;
    // a language set on the element or a section (<span lang="en">), not the page's own; translate=no keeps it as is
    const tagged = el.closest("[lang]");
    const ownLang = el.closest("[translate=no], .notranslate") ? "zxx" : tagged && tagged !== document.documentElement ? tagged.getAttribute("lang") || "" : "";
    // 5.5.0 (Compass, issue #5): what a user wrote (a brief, a chat message) is shown back as they wrote it — not copy
    // to translate. [data-user-content] marks it; chat logs, quotes and text kept with its line breaks (pre-wrap) count.
    const user = !!el.closest("[data-user-content], [data-ugc], [role=log], blockquote, q") || (pre && !/^h[1-6]$/.test(tag) && !btn && text.length > 20);
    // a record (a table row, a list row, a card): a person's name in it is data; so is the text of a row that shows an email
    const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
    let row = el.closest("tr, [role=row], li, [role=listitem], article, dd");
    // or the card around it: the nearest painted box (background, border or shadow) within 4 levels, of short text
    const paintedBox = (e) => { const c = getComputedStyle(e); return window.__uiRGBA(c.backgroundColor)[3] > 0.05 || c.boxShadow !== "none" || ["Top", "Right", "Bottom", "Left"].every((x) => parseFloat(c[`border${x}Width`]) > 0); };
    if (!row) for (let e = el.parentElement, k = 0; e && e !== document.body && !/^(MAIN|SECTION|BODY)$/.test(e.tagName) && k < 4; e = e.parentElement, k++) { if ((e.innerText || "").length > 400) break; if (paintedBox(e)) { row = e; break; } }
    const record = !!row || /^h[2-6]$/.test(tag) && !!el.closest("[class*=card i], [class*=profile i]");
    const rowEmail = !!row && EMAIL.test(row.innerText || "");
    const control = !!el.closest("button, a[href], [role=button], [role=tab], [role=menuitem], label, th, select, option, input");
    segs.push({ i, text, kind, user, collapsed: !pre, dialog: !!el.closest("[role=dialog], [role=alertdialog], dialog"), footer: !!el.closest("footer, [role=contentinfo]"), table: !!el.closest("table, [role=grid], [role=table], [role=row]"), ownLang, record, rowEmail, control });
  }
  // emails in text: linked by a mailto with the same address?
  const emails = [];
  const ER = /(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\w-])/g;
  const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && !n.parentElement.closest("script, style, noscript, template") && /@/.test(n.nodeValue) ? 1 : 2) });
  for (let n = tw2.nextNode(); n; n = tw2.nextNode()) {
    const p = n.parentElement;
    if (!visible(p)) continue;
    for (const m of n.nodeValue.match(ER) || []) {
      const email = m.replace(/\.$/, "");
      if (/\.(png|jpe?g|webp|avif|svg|gif|ico)$/i.test(email)) continue;
      const a = p.closest("a[href]");
      const href = a ? a.getAttribute("href") || "" : "";
      const addr = /^mailto:/i.test(href) ? decodeURIComponent(href.slice(7).split("?")[0]).trim() : null;
      const i = els.push(p) - 1;
      const at = n.nodeValue.indexOf(m);
      const before = ((p.closest("p, li, td, div") || p).innerText || "").split(email)[0].slice(-60);
      // an address in an example ("Tell the agent 'Schedule a call with john@company.com'", "e.g. you@…") is not a contact
      const example = /['"‘“«]\s*[^'"’”»]*$/.test(before) || /\b(e\.g\.|for example|such as|like)\s*$/i.test(before) || !!p.closest("code, kbd, samp");
      void at;
      emails.push({ i, email, href: a ? href : null, addr, example, table: !!p.closest("table, [role=grid], [role=table], [role=row]"), form: !!p.closest("form, [role=dialog] form, input, select") });
    }
  }
  const mailto = Array.from(document.querySelectorAll('a[href^="mailto:" i]')).map((a) => {
    const i = els.push(a) - 1;
    return { i, addr: decodeURIComponent((a.getAttribute("href") || "").slice(7).split("?")[0]).trim(), text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(), visible: visible(a) };
  });
  // footer: legal links and the © line (the same rules as acceptance F1/F2)
  const f = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter((x) => visible(x)).pop();
  let legal = [], copyright = null;
  if (f) {
    legal = Array.from(f.querySelectorAll("a[href]")).filter((a) => visible(a)).map((a) => {
      const i = els.push(a) - 1;
      let path = ""; try { path = new URL(a.href, location.href).pathname.replace(/\/$/, "") || "/"; } catch {}
      return { i, text: (a.innerText || "").replace(/\s+/g, " ").trim(), href: a.getAttribute("href"), path, internal: (() => { try { return new URL(a.href, location.href).origin === location.origin; } catch { return false; } })() };
    });
    const c = Array.from(f.querySelectorAll("*")).filter((e) => e.children.length < 6 && /©|\(c\)\s*\d{4}|copyright/i.test(e.textContent || "") && visible(e)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (c) copyright = { i: els.push(c) - 1, text: (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim() };
  }
  // innerText glues two inline spans with a visible gap between them ("ACMETERMS OF SERVICE"):
  // the heading is read the same way the copy is, so one invented word cannot reach a rule
  // through one path after being fixed on the other.
  const gapped = (el) => {
    let out = "", last = null;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) { out += " "; last = null; continue; }
      const rng = document.createRange(); rng.selectNodeContents(n);
      const box = rng.getBoundingClientRect();
      if (last && box.width && last.width && Math.abs(box.top - last.top) <= Math.max(2, box.height * 0.3)) {
        const fs = parseFloat(getComputedStyle(n.parentElement).fontSize) || 16;
        if (box.left - last.right >= fs * 0.2) out += " ";
      }
      out += n.nodeValue; last = box;
    }
    return out.replace(/\s+/g, " ").trim();
  };
  const h1 = Array.from(document.querySelectorAll("h1")).filter((x) => visible(x)).map(gapped);
  const brand = [document.querySelector('meta[property="og:site_name"]')?.getAttribute("content"), ...Array.from(document.querySelectorAll('header a[href="/"] img[alt], header [aria-label*=home i], header a[href="/"]')).map((x) => x.getAttribute("alt") || x.getAttribute("aria-label") || (x.innerText || "").trim())].filter(Boolean);
  const alternates = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map((l) => ({ code: l.getAttribute("hreflang"), href: l.href }));
  // every internal link with the name a reader sees (CT21 / CT22): a card link is named by its heading, a link inside a
  // sentence is "inline" (a word of the sentence, not the page's name)
  const links = [];
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    if (links.length >= 400 || !visible(a)) continue;
    let u; try { u = new URL(a.href, location.href); } catch { continue; }
    if (u.origin !== location.origin || /^(mailto|tel|javascript):/i.test(a.getAttribute("href") || "")) continue;
    const raw = (a.getAttribute("href") || "").trim();
    if (!raw || raw.startsWith("#")) continue;
    const block = a.querySelector("h1, h2, h3, h4, p, div, li, ul, img, figure");
    let label = block ? ((a.querySelector("h1, h2, h3, h4, strong, [class*=title i]")?.innerText) || "") : (a.innerText || "");
    label = label.replace(/\s+/g, " ").trim() || (block ? "" : a.getAttribute("aria-label") || "");
    const par = a.parentElement;
    const inline = !!par && !par.matches("nav, li, header, footer, [role=navigation], [role=menu]") && (par.innerText || "").replace(/\s+/g, " ").trim().length > (a.innerText || "").trim().length + 12 && getComputedStyle(a).display === "inline";
    const region = a.closest("footer, [role=contentinfo]") ? "footer" : a.closest("nav, header, [role=navigation], [role=menu]") ? "nav" : inline ? "inline" : "body";
    const kind = /\b(btn|button)\b/i.test(a.className || "") || a.getAttribute("role") === "button" ? "button" : "link";
    links.push({ i: els.push(a) - 1, path: u.pathname.replace(/\/$/, "") || "/", label, region, kind });
  }
  // 5.5.0 (Praxis 992bgb): does the page itself (not its footer) show payment marks?
  const marks = Array.from(document.querySelectorAll("img, svg, [role=img], [aria-label], [title]")).some((x) => !x.closest("footer, [role=contentinfo]") && window.__uiVisible(x) && /visa|master ?card|maestro|amex|american express/i.test([x.getAttribute("alt"), x.getAttribute("aria-label"), x.getAttribute("title"), x.getAttribute("src"), x.querySelector?.("title")?.textContent].join(" ")));
  return { segs, emails, mailto, legal, copyright, h1, title: document.title || "", lang: document.documentElement.getAttribute("lang") || "", dir: document.documentElement.getAttribute("dir") || "", brand, alternates, path: location.pathname, links, marks };
});

/** Where each element sits, for the report (one round-trip for all findings of a page). */
async function locate(page, indices) {
  const uniq = [...new Set(indices.filter((i) => i != null))];
  if (!uniq.length) return new Map();
  const rows = await page.evaluate((ids) => ids.map((i) => { const el = window.__contentEls?.[i]; return el ? { i, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) } : { i, where: "page" }; }), uniq).catch(() => []);
  return new Map(rows.map((r) => [r.i, r]));
}
const finding = (x, loc, extra = "") => ({ id: x.id, what: `${x.what}${extra} — fix: ${x.fix} [${x.id}]`, where: loc?.where || "page", selector: loc?.selector, human: loc?.human });

/**
 * CT1–CT8 + CT17 on one page, CT7 "one document, one date". @returns {Promise<{ hard: object[], copy: object }>}
 * `copy` is the collected page (reuse it for emailFindings / languageFindings).
 */
export async function copyFindings(page, cfg = {}, copy = null, locale = null, { own = [] } = {}) {
  const cc = contentConfig(cfg);
  const mine = new Set(own.filter(Boolean).map((e) => String(e).toLowerCase()));
  copy = copy || (await collectCopy(page));
  const out = [];
  const segs = copy.segs;
  segs.forEach((s, n) => {
    const next = segs[n + 1];
    s.followedByDate = !!(next && next.text.length < 60 && findDates(next.text).length);
  });
  const titleSeg = copy.title ? [{ i: null, text: copy.title, kind: "title", collapsed: true }] : [];
  // the language decides some rules (French puts a space before ? ! : ;): the element's own lang, else the page's
  const pageLang = locale || copy.lang || "";
  for (const s of [...segs, ...titleSeg]) {
    const locale = s.ownLang && s.ownLang !== "zxx" ? s.ownLang : pageLang;
    for (const x of lintSegment({ ...s, locale }, cc)) {
      // 5.5.0 (Compass, issue #5): the signed-in test account's own address on its own settings page is not test data
      if (x.id === "CT2" && mine.size && [...mine].some((e) => String(x.match || "").toLowerCase() === e || (s.text.toLowerCase().includes(e) && e.includes(String(x.match || "").toLowerCase())))) continue;
      out.push({ x, i: s.i, seg: s });
    }
  }
  // 5.6.3: a page in a language CT1 has no lexicon for — its not-yet copy is not read; say so instead of passing quietly
  if (pageLang && !readsLocale(pageLang) && segs.length) out.push({ x: { id: "CT1", rule: "content/unfinished", soft: true, what: `CT1 does not read ${String(pageLang).split(/[-_]/)[0]}: not-yet copy on this page is not checked (CT1 reads ${CT1_LOCALES.join(", ")})`, fix: "check the page's copy by hand, or add a lexicon for the language (lib/not-yet.js)" }, i: null });
  // one document, one date (updated vs effective compared separately)
  const lu = lastUpdatedDates(segs);
  for (const kind of ["updated", "effective"]) {
    const list = lu.filter((d) => d.kind === kind);
    const isos = [...new Set(list.map((d) => d.iso))];
    if (isos.length > 1) out.push({ x: { id: ruleId("content/last-updated"), rule: "content/last-updated", what: `this page shows ${isos.length} different "${kind === "updated" ? "last updated" : "effective"}" dates: ${list.map((d) => `"${d.text}"`).join(" vs ")}`, fix: "one document shows one date everywhere" }, i: list[1].seg.i });
  }
  // de-duplicate: the same message on the same element once
  const seen = new Set();
  const uniq = out.filter((o) => { const k = `${o.i}|${o.x.what}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const loc = await locate(page, uniq.map((o) => o.i));
  const all = uniq.map((o) => ({ soft: !!o.x.soft, f: finding(o.x, o.i == null ? { where: "<title>" } : loc.get(o.i)) }));
  // soft: listed for a human (French spacing slips), never failing
  return { hard: all.filter((x) => !x.soft).map((x) => x.f), soft: all.filter((x) => x.soft).map((x) => x.f), copy };
}

/**
 * Every test account's e-mail address: LOGIN_EMAIL and each babysitter.config.json → roles[] LOGIN_EMAIL (its env
 * name resolved), plus BABYSITTER_ROLES literals. On a signed-in page these are the user's own address.
 */
export function ownEmails(cfg = {}, env = process.env) {
  const out = [];
  if (env.LOGIN_EMAIL) out.push(env.LOGIN_EMAIL);
  let extra = [];
  try { extra = env.BABYSITTER_ROLES ? JSON.parse(env.BABYSITTER_ROLES) : []; } catch {}
  for (const r of [...(cfg.roles || []), ...extra]) {
    const ref = r?.env?.LOGIN_EMAIL ?? r?.LOGIN_EMAIL;
    if (!ref) continue;
    const v = /^[A-Z][A-Z0-9_]*$/.test(ref) ? env[ref] : /@/.test(ref) ? ref : undefined;
    if (v) out.push(v);
  }
  return [...new Set(out)];
}

/**
 * CT9 every address can receive mail (preview / reserved hosts, then MX over DNS); CT10 every visible address is a
 * mailto link to that same address. `loginEmail` (the signed-in user's own address) is exempt from CT10.
 * @returns {Promise<{ hard: object[], info: string[] }>}
 */
export async function emailFindings(page, { cfg = {}, copy = null, dns = true, cache = null, loginEmail = process.env.LOGIN_EMAIL, own = null, fetchImpl } = {}) {
  const cc = contentConfig(cfg);
  const skip = new Set(cc.skip || []);
  copy = copy || (await collectCopy(page));
  const out = [], info = [];
  // 5.5.0 (Kindred / Compass, issues #4 #5): role-based projects sign in with roles[].env, not LOGIN_EMAIL — every
  // configured account's address is the signed-in user's own (its settings page shows it as text)
  const mineSet = new Set([loginEmail, ...(own ?? ownEmails(cfg))].filter(Boolean).map((e) => String(e).toLowerCase()));
  const isMe = (e) => mineSet.has(String(e || "").toLowerCase());
  // CT10
  if (!skip.has("CT10")) {
    for (const e of copy.emails) {
      if (isMe(e.email) || e.table || e.form || e.example) continue;
      if (!e.addr) out.push({ i: e.i, x: { id: "CT10", what: `${e.email} is shown as plain text${e.href ? ` inside a link to ${e.href}` : ""}`, fix: `wrap it in <a href="mailto:${e.email}">${e.email}</a> so it opens the mail app` } });
      else if (e.addr.toLowerCase() !== e.email.toLowerCase()) out.push({ i: e.i, x: { id: "CT10", what: `the link says ${e.email} but opens mailto:${e.addr}`, fix: "one address: the text and the mailto: must match" } });
    }
    for (const m of copy.mailto) {
      const shown = findEmails(m.text);
      if (m.visible && shown.length && !shown.some((s) => s.toLowerCase() === m.addr.toLowerCase()) && !copy.emails.some((e) => e.i === m.i))
        out.push({ i: m.i, x: { id: "CT10", what: `the link says ${shown[0]} but opens mailto:${m.addr}`, fix: "one address: the text and the mailto: must match" } });
    }
  }
  // CT9
  if (!skip.has("CT9")) {
    const all = new Map();
    for (const e of copy.emails) if (!isMe(e.email) && !e.example) all.set(e.email.toLowerCase(), all.get(e.email.toLowerCase()) ?? e.i);
    for (const m of copy.mailto) if (m.addr && !isMe(m.addr) && /@/.test(m.addr)) all.set(m.addr.toLowerCase(), all.get(m.addr.toLowerCase()) ?? m.i);
    const rest = [];
    for (const [email, i] of all) {
      const bad = emailDomainProblem(email);
      if (bad) out.push({ i, x: { id: "CT9", what: bad, fix: "show an address on a domain with a working mailbox (MX record), e.g. support@<your domain>" } });
      else rest.push(email);
    }
    if (dns && rest.length) {
      const res = await checkEmails(rest, { cache, fetchImpl });
      for (const [email, r] of res) {
        if (r?.ok === false) out.push({ i: all.get(email), x: { id: "CT9", what: `${email} cannot receive mail: ${r.reason}`, fix: "set up mail for the domain (MX record) or show an address that receives mail" } });
        else if (r?.ok === null) info.push(`${email}: ${r.reason}`);
      }
    }
  }
  const loc = await locate(page, out.map((o) => o.i));
  return { hard: out.map((o) => finding(o.x, loc.get(o.i))), info };
}

const SCRIPT = { cyr: /[Ѐ-ӿ]/g, arab: /[؀-ۿݐ-ݿ]/g, hebr: /[֐-׿]/g, latin: /[A-Za-zÀ-ɏ]/g };
/**
 * CT11 untranslated text on a page in another language — English left in it, or text word for word the same as on the
 * default-language page (`defaults`: that page's collectCopy() or its texts; one check, both heuristics, one finding
 * per string); CT12 translation keys printed as text; CT13 <html lang>/dir match the language shown. `locale`: the
 * language this page is meant to be in (config locale run); without it the page's own lang is trusted for CT11.
 * `keys`: the product's translation keys (lib/content-lint.translationKeys). `defaultLocale`: the default language's code.
 * Strings in babysitter.config.json → locales.keep and content.brandTerms are never "untranslated".
 */
export async function languageFindings(page, { cfg = {}, copy = null, locale = null, keys = null, defaults = null, defaultLocale = null } = {}) {
  const cc = contentConfig(cfg);
  const skip = new Set(cc.skip || []);
  copy = copy || (await collectCopy(page));
  const out = [];
  const lang = (copy.lang || "").toLowerCase();
  const want = (locale || "").toLowerCase();
  // CT13
  if (!skip.has("CT13")) {
    if (!lang) out.push({ i: null, x: { id: "CT13", what: "<html> has no lang attribute", fix: `set <html lang="${want || cc.defaultLocale || "en"}"> — screen readers and the browser's translator read it` } });
    else if (want && lang.split("-")[0] !== want.split("-")[0]) out.push({ i: null, x: { id: "CT13", what: `the page is shown in "${want}" but <html lang="${copy.lang}">`, fix: `set lang="${want}" when the language changes (and dir="${isRtl(want) ? "rtl" : "ltr"}")` } });
    const code = want || lang;
    if (code && isRtl(code) && copy.dir.toLowerCase() !== "rtl") out.push({ i: null, x: { id: "CT13", what: `"${code}" is written right to left but <html dir="${copy.dir || "(none)"}">`, fix: 'set <html dir="rtl"> for this language' } });
    if (code && !isRtl(code) && copy.dir.toLowerCase() === "rtl") out.push({ i: null, x: { id: "CT13", what: `<html dir="rtl"> on a "${code}" page`, fix: 'use dir="ltr" (or none) for left-to-right languages' } });
    // the text itself says which script it is in
    const text = copy.segs.map((s) => s.text).join(" ");
    const count = (re) => (text.match(re) || []).length;
    const cyr = count(SCRIPT.cyr), arab = count(SCRIPT.arab) + count(SCRIPT.hebr), lat = count(SCRIPT.latin);
    if (!want && /^(en|de|fr|es|it|pt|nl|pl|tr|az|uz|ro|sv|fi|da|no|cs|sk|hu|lt|lv|et|id|ms|vi)\b/.test(lang) && cyr > 3 * lat && cyr > 200)
      out.push({ i: null, x: { id: "CT13", what: `the page is written in Cyrillic but <html lang="${copy.lang}">`, fix: "set lang to the language shown (ru, kk, uk …) when it changes" } });
    if (!want && /^(ru|kk|uk|be|bg|sr|ky|tg|mn)\b/.test(lang) && lat > 3 * cyr && lat > 200)
      out.push({ i: null, x: { id: "CT13", what: `the page is written in Latin script but <html lang="${copy.lang}">`, fix: "set lang to the language shown" } });
    if (!want && /^(ar|fa|ur|he)\b/.test(lang) && lat > 3 * arab && lat > 200)
      out.push({ i: null, x: { id: "CT13", what: `the page is written in Latin script but <html lang="${copy.lang}">`, fix: "set lang to the language shown" } });
  }
  // CT12
  if (!skip.has("CT12")) {
    for (const s of copy.segs) {
      const t = s.text.trim();
      if (looksLikeKey(t, keys) || /\bMISSING_MESSAGE\b|missing translation|translation missing|\[missing ".+" translation\]/i.test(t))
        out.push({ i: s.i, x: { id: "CT12", what: `translation key shown instead of its text: "${t.slice(0, 60)}"`, fix: "add the key to every locale's messages (and check the namespace the component asks for)" } });
    }
  }
  // CT11
  const code = want || lang;
  if (!skip.has("CT11") && code && !/^en\b/.test(code)) {
    const brand = [...(cc.brandTerms || []), ...(copy.brand || []).flatMap((b) => String(b).split(/\s+/))].filter((w) => w && w.length > 1);
    // Latin words that sit inside native-language sentences on this page are names (PRAXIS, Visa, Telegram)
    const native = /^(ru|kk|uk|be|bg|sr|mk|ky|tg|mn)\b/.test(code) ? /[Ѐ-ӿ]/ : /^(ar|fa|ur|he)\b/.test(code) ? /[֐-ۿ]/ : null;
    if (native) {
      const n = new Map();
      for (const s of copy.segs) if (native.test(s.text)) for (const w of new Set(s.text.match(/[A-Z][A-Za-z0-9+.-]+/g) || [])) n.set(w, (n.get(w) || 0) + 1);
      for (const [w, c] of n) if (c >= 2) brand.push(w);
    }
    const keep = (cfg.locales && !Array.isArray(cfg.locales) && cfg.locales.keep) || [];
    let def = null;
    if (defaults) {
      def = new Set(Array.isArray(defaults) ? defaults.map((x) => (typeof x === "string" ? x : x.text)) : (defaults.segs || []).map((x) => x.text));
      def.locale = defaultLocale || defaults.lang || cc.defaultLocale || "";
    }
    for (const s of copy.segs) {
      if (s.user) continue;
      const r = untranslatedReason(s.text, code, { brand, defaults: def, keep, ownLang: s.ownLang, legal: cc.legalIdentity, record: s.record, rowEmail: s.rowEmail, control: s.control });
      if (!r) continue;
      out.push({ i: s.i, x: { id: "CT11", what: untranslatedWhat(r, s.text, code), fix: `translate it (the ${code} messages file, or the CMS / database field; locales.keep / content.brandTerms for names that stay as they are)` } });
    }
    // 5.6.1: the browser tab — "Contact Us - Resonate Support" on the French contact page (the page's metadata)
    if (copy.title) {
      // a title is a noun phrase with few function words: the strong signal is the default language's own title, unchanged
      const defTitle = defaults && !Array.isArray(defaults) ? String(defaults.title || "") : "";
      const norm = (t) => String(t).replace(/\s+/g, " ").trim().toLowerCase();
      const words = (t) => (String(t).match(/\p{L}{3,}/gu) || []).filter((w) => !brand.some((b) => b.toLowerCase() === w.toLowerCase()));
      const same = defTitle && norm(defTitle) === norm(copy.title) && words(copy.title).length >= 1 && !keep.includes(copy.title.trim());
      const r = same ? { kind: "same", sample: copy.title } : untranslatedReason(copy.title, code, { brand, defaults: def, keep, legal: cc.legalIdentity });
      if (r) out.push({ i: null, where: "<title>", x: { id: "CT11", what: `the browser tab: ${untranslatedWhat(r, copy.title, code)}`, fix: `translate the page's <title> and description (its metadata / generateMetadata for ${code}; the tab, search results and shared links show it)` } });
    }
  }
  const loc = await locate(page, out.map((o) => o.i).filter((i) => i != null));
  return { hard: out.map((o) => finding(o.x, o.i == null ? { where: o.where || "<html>" } : loc.get(o.i))) };
}

/** A compact record of one page for the site-wide checks. */
export function pageRecord(route, copy, locale = null) {
  return {
    route, locale, title: copy.title, h1: copy.h1, legal: copy.legal.map((l) => ({ ...l, text: l.text.replace(/[\s\u2190-\u21FF\u2794-\u27BF›»↗]+$/u, "") })).filter((l) => l.internal && legalFamily(l.text)).map((l) => ({ text: l.text, path: l.path, family: legalFamily(l.text) })),
    copyright: copy.copyright?.text || null, lastUpdated: lastUpdatedDates(copy.segs).map((d) => ({ kind: d.kind, iso: d.iso, text: d.text })),
    // 5.6.1: user / ownLang ride along, so the site-wide checks leave what a user wrote and text kept as written out
    segs: copy.segs.filter((s) => !s.footer).map((s) => ({ text: s.text, kind: s.kind, ...(s.user ? { user: true } : {}), ...(s.ownLang ? { ownLang: s.ownLang } : {}) })), footerSegs: copy.segs.filter((s) => s.footer).map((s) => s.text),
    lang: copy.lang || "", brand: copy.brand || [], links: (copy.links || []).map(({ path, label, region, kind }) => ({ path, label, region, kind })),
    marks: typeof copy.marks === "boolean" ? copy.marks : undefined,
  };
}

const titleParts = (t) => String(t || "").split(/\s+[|·•–—-]\s+|\s+:\s+/).map((x) => x.trim()).filter(Boolean);
/**
 * CT15 a legal document has one name: footer link = page <h1> = <title> = every mention in the text;
 * CT16 the © line is identical on every page. @param records pageRecord[] (one locale at a time)
 */
export function namingFindings(records, cfg = {}) {
  const cc = contentConfig(cfg);
  const skip = new Set(cc.skip || []);
  const out = [];
  const byPath = new Map(records.map((r) => [r.route.replace(/\/$/, "") || "/", r]));
  // canonical names: the footer of the first page that has legal links
  const canon = new Map();
  for (const r of records) for (const l of r.legal) if (!canon.has(l.family)) canon.set(l.family, l);
  if (!skip.has("CT15")) {
    for (const [family, l] of canon) {
      const page = byPath.get(l.path);
      if (!page) continue;
      const names = [l.text];
      const h1 = page.h1[0];
      if (h1 && normName(h1) !== normName(l.text) && !normName(h1).startsWith(normName(l.text) + " ("))
        out.push({ id: "CT15", what: `the footer calls it "${l.text}", its page heading says "${h1}" — fix: one name everywhere: footer link, <h1>, <title> and every mention [CT15]`, where: `${l.path} <h1>` });
      const tp = titleParts(page.title);
      if (page.title && !tp.some((p) => normName(p) === normName(l.text)))
        out.push({ id: "CT15", what: `the footer calls it "${l.text}", the browser tab says "${page.title}" — fix: put the same name in <title> [CT15]`, where: `${l.path} <title>` });
      // other links in other footers using another name for the same page
      for (const r of records) for (const o of r.legal) if (o.path === l.path && normName(o.text) !== normName(l.text) && !names.includes(o.text)) {
        names.push(o.text);
        out.push({ id: "CT15", what: `the footer on ${r.route} calls ${l.path} "${o.text}", elsewhere it is "${l.text}" — fix: one name [CT15]`, where: `${r.route} footer` });
      }
      void family;
    }
    // mentions in the text
    const reported = new Set();
    for (const r of records) {
      for (const s of r.segs) {
        for (const [family, re] of Object.entries(LEGAL_FAMILIES)) {
          const c = canon.get(family);
          if (!c) continue;
          re.lastIndex = 0;
          for (let m = re.exec(s.text); m; m = re.exec(s.text)) {
            const said = m[0];
            if (!/\s/.test(said) || normName(said) === normName(c.text)) continue; // a bare "Terms" is not a document name
            if (normName(c.text).includes(normName(said)) || (s.kind === "heading" && r.route.replace(/\/$/, "") === c.path)) continue;
            const k = `${r.route}|${said}`;
            if (reported.has(k)) continue;
            reported.add(k);
            out.push({ id: "CT15", what: `"${said}" — the footer calls this document "${c.text}" — fix: use the footer's name in the text too (or rename the footer link) [CT15]`, where: `${r.route} "${s.text.slice(0, 60)}"` });
          }
        }
      }
    }
  }
  if (!skip.has("CT16")) {
    const lines = new Map();
    for (const r of records) if (r.copyright) { const k = r.copyright.replace(/\s+/g, " ").trim(); (lines.get(k) || lines.set(k, []).get(k)).push(r.route); }
    if (lines.size > 1) {
      const variants = [...lines].sort((a, b) => b[1].length - a[1].length);
      for (const [line, routes] of variants.slice(1))
        out.push({ id: "CT16", what: `© line differs: "${line}" here, "${variants[0][0]}" on ${variants[0][1].slice(0, 3).join(", ")}${variants[0][1].length > 3 ? " …" : ""} — fix: one footer component, one © line on every page [CT16]`, where: routes.join(", ") });
    }
  }
  return out;
}

/** CT17 the same concept named two ways across the site (Sign in / Log in …) — for a human to decide (soft). */
export function variantFindings(records) {
  const out = [];
  for (const v of AUTO_VARIANTS) {
    const used = v.forms.map((re) => {
      const where = [];
      for (const r of records) for (const s of r.segs) if (s.kind !== "body" && re.test(s.text)) { where.push(`${r.route} "${s.text.slice(0, 40)}"`); break; }
      return where;
    });
    const forms = used.map((w, i) => ({ w, i })).filter((x) => x.w.length);
    if (forms.length > 1) out.push({ id: "CT17", what: `"${v.concept}" is named two ways in buttons / links / headings: ${forms.map((f) => `${v.forms[f.i].source.replace(/\\b|\[- \]\?/g, " ").replace(/\s+/g, " ").trim()} (${f.w.slice(0, 2).join("; ")})`).join(" vs ")} — pick one [CT17]`, where: "site-wide" });
  }
  return out;
}

/** CT18 the same fact with different numbers on different pages (soft: both quotes for a human). `exclude`: fact keys
 *  another rule reports (CT20 owns refund windows and retention when it runs). */
export function factFindings(records, { exclude = [] } = {}) {
  const facts = [];
  for (const r of records) for (const s of [...r.segs.map((x) => x.text), ...r.footerSegs]) for (const f of numericFacts(s)) if (!exclude.includes(f.key)) facts.push({ ...f, where: r.route });
  return factConflicts(facts).map((x) => ({ id: "CT18", what: `${x.what} — ${x.fix} [CT18]`, where: "site-wide" }));
}

/**
 * The crawl as one site for CT19–CT22 (lib/content-consistency.js): texts with their language and page, the links
 * with the names a reader sees, the pages with their <h1> / <title>. @param records pageRecord[] of one or more languages
 */
export function siteOf(records, defaultLocale = null) {
  const texts = [], links = [], pages = [], seen = new Set();
  for (const r of records) {
    const locale = r.locale || r.lang || defaultLocale || "en";
    const route = r.route.replace(/\/$/, "") || "/";
    for (const s of [...r.segs, ...r.footerSegs.map((t) => ({ text: t, kind: "body" }))]) {
      // 5.6.1: what a user wrote (a script, a chat line, a bio) and text kept as written (translate=no, another lang) is
      // not the site's copy: its words are never one of the site's names for a thing
      if (s.user || s.ownLang === "zxx" || (s.ownLang && String(s.ownLang).toLowerCase().split(/[-_]/)[0] !== String(locale).toLowerCase().split(/[-_]/)[0])) continue;
      texts.push({ text: s.text, kind: s.kind, locale, where: `${route} "${String(s.text).replace(/\s+/g, " ").slice(0, 60)}"`, route });
    }
    if (r.title) texts.push({ text: r.title, kind: "title", locale, where: `${route} <title>`, route });
    for (const l of r.links || []) links.push({ ...l, label: normLabel(l.label), locale, where: `${route} ${l.region}`, route });
    if (!seen.has(`${locale}|${route}`)) { seen.add(`${locale}|${route}`); pages.push({ path: route, names: r.h1 || [], title: r.title || "", where: `${route} <h1>`, locale, marks: r.marks }); }
  }
  return { texts, links, pages };
}

/**
 * CT19–CT22 on the rendered site. `byLocale`: Map(locale → records). Terms (CT19), labels (CT21) and named pages (CT22)
 * are compared per language (5.6.1: French has its own lexicon for CT21 / CT22); facts (CT20) across every language
 * that has one (English, French).
 * `deadLinks`: [{ path, label, where, status }] the run found (CT22 a). Hard findings, one per concept / variant.
 */
export function consistencyRendered(byLocale, cfg = {}, { defaultLocale = null, deadLinks = [], redirects = null } = {}) {
  const cc = contentConfig(cfg);
  const all = [...byLocale.values()].flat();
  const site = siteOf(all, defaultLocale);
  // `redirects`: Map(path → final path) the run measured (a 3xx answer): a link there counts where it lands (CT21) and
  // is a link to a redirected path (CT22)
  if (redirects) for (const l of site.links) { const to = redirects.get(l.path); if (to && to !== l.path) { l.dest = to; l.redirect = { to, kind: "redirect", rules: [] }; } }
  const en = (x) => !x.locale || /^en\b/i.test(x.locale);
  const lexed = (x) => !en(x) && labelLanguages().includes(String(x.locale).toLowerCase().split(/[-_]/)[0]);
  const brand = [...new Set(all.flatMap((r) => r.brand || []))];
  const groups = [
    ...consistencyFindings({ texts: site.texts, links: [], pages: [] }, { ...cc, skip: [...(cc.skip || []), "CT20", "CT21", "CT22", "CT15", "CT23", "CT27", "F5", "M3"] }, cfg),
    // CT20 facts are one pool for every language the site has (5.6.1: "14 days" against "30 jours")
    ...consistencyFindings({ texts: site.texts.filter(en), links: site.links.filter(en), pages: site.pages.filter(en), deadLinks }, { ...cc, skip: [...(cc.skip || []), "CT19"] }, cfg, { brand, skipLegal: true, factsTexts: site.texts }),
    // 5.6.1: CT21 / CT22 in each other language with a lexicon (labels, page names and documents named in its copy)
    ...consistencyFindings({ texts: site.texts.filter(lexed), links: site.links.filter(lexed), pages: site.pages.filter(lexed) }, { ...cc, skip: [...(cc.skip || []), "CT19", "CT20", "CT15", "CT23", "CT27", "F5", "M3"] }, cfg, { brand, skipLegal: true }),
  ];
  // 5.5.0 (Compass ey1511): CT31 one order for one list — soft, a person decides
  if (!(cc.skip || []).includes("CT31")) groups.push(...listOrders(site.texts.filter(en)));
  // one finding per concept (fix-plan's unit: one cause, every page): the variants' fixes side by side
  const by = new Map();
  for (const g of groups) {
    const k = `${g.id}|${g.locale || ""}|${g.concept}`;
    const e = by.get(k);
    if (e) { if (!e.fixes.includes(g.fix)) e.fixes.push(g.fix); } else by.set(k, { g, fixes: [g.fix] });
  }
  return [...by.values()].map(({ g, fixes }) => ({ id: g.id, what: `${g.what} — fix: ${fixes.join("; ")} [${g.id}]`, where: "site-wide", concept: g.concept, ...(g.soft ? { soft: true } : {}) }));
}

/** CT7 the same document shows the same "last updated" date in every language. @param byLocale Map(locale → records) */
export function localeDateFindings(byLocale) {
  const out = [];
  const routes = new Map();
  for (const [loc, recs] of byLocale) for (const r of recs) for (const d of r.lastUpdated) {
    const k = `${r.route}|${d.kind}`;
    (routes.get(k) || routes.set(k, []).get(k)).push({ loc, iso: d.iso, text: d.text });
  }
  for (const [k, list] of routes) {
    const isos = [...new Set(list.map((x) => x.iso))];
    if (isos.length > 1) out.push({ id: "CT7", what: `${k.split("|")[0]}: the "${k.split("|")[1] === "updated" ? "last updated" : "effective"}" date differs by language: ${list.map((x) => `${x.loc} "${x.text}"`).join(" vs ")} — fix: one document, one date in every language [CT7]`, where: k.split("|")[0] });
  }
  return out;
}

/**
 * Open `route` in `locale` (babysitter.config.json → content.locales[]): a path prefix, a cookie or a localStorage
 * entry. Returns the URL path to open. Call before page.goto.
 */
export async function applyLocale(page, loc, route, baseURL) {
  if (!loc) return route;
  if (loc.cookie && baseURL) await page.context().addCookies(Object.entries(loc.cookie).map(([name, value]) => ({ name, value: String(value), url: baseURL })));
  if (loc.localStorage) await page.addInitScript((items) => { try { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, String(v)); } catch {} }, loc.localStorage);
  if (loc.prefix) {
    const p = "/" + String(loc.prefix).replace(/^\/|\/$/g, "");
    return route === "/" ? p : route.startsWith(p + "/") ? route : p + route;
  }
  if (loc.query) return route + (route.includes("?") ? "&" : "?") + loc.query;
  return route;
}

/** Where the DNS answers are cached for a product. */
export const dnsCache = (stateDir) => resolve(stateDir, "dns-cache.json");
