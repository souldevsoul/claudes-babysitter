// FM16 — every role has its own door: the in-page reading (lib/role-auth.js decides). Plain JavaScript, self-contained
// page.evaluate functions: they need nothing from checks.install, so a fixture page can be read as it is.
import { compareAuthSurfaces, customerAdvertisesRole, entryRole, target } from "../../lib/role-auth.js";

/**
 * Every same-origin link on the page that is a door into the supply side: its text (or aria-label) matches `entrySrc`,
 * or it matches one of `selectors`. Hidden links count too — a mobile menu holds the same doors. One per target.
 */
export const roleEntries = (page, entrySrc, selectors = []) => page.evaluate(({ entrySrc, selectors }) => {
  const re = new RegExp(entrySrc, "i");
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const picked = new Set(selectors.flatMap((s) => { try { return Array.from(document.querySelectorAll(s)); } catch { return []; } }));
  const out = new Map();
  for (const a of document.querySelectorAll("a[href]")) {
    let u;
    try { u = new URL(a.href); } catch { continue; }
    if (u.origin !== location.origin || /^(mailto|tel):/.test(a.getAttribute("href"))) continue;
    if (u.pathname === location.pathname && u.search === location.search) continue; // an anchor on this page
    const text = clean(a.innerText || a.textContent) || clean(a.getAttribute("aria-label"));
    if (!picked.has(a) && !re.test(`${text} ${clean(a.getAttribute("aria-label"))}`)) continue;
    const key = u.pathname + u.search;
    if (!out.has(key)) out.set(key, { text: text.slice(0, 80), href: u.href });
  }
  return [...out.values()];
}, { entrySrc, selectors });

/**
 * What a visitor reads on an auth page: <title>, heading, the lead under it, the badge / eyebrow above it, the side
 * panel beside the form, the main text (header, nav and footer left out), the "New here?" / "Already have an account?"
 * link, and whether it is a sign-in, a sign-up or not an auth page at all.
 */
export const authSurface = (page) => page.evaluate(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden], [aria-hidden=true]");
  };
  const chrome = (el) => !!el.closest("header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]");
  const text = (el) => clean(el?.innerText || el?.textContent || "");
  const pw = Array.from(document.querySelectorAll("input[type=password]")).filter(vis);
  const email = Array.from(document.querySelectorAll("input[type=email], input[autocomplete~=email], input[autocomplete~=username], input[name*=email i]")).filter(vis);
  const field = pw[0] || email[0] || null;
  const form = field?.closest("form, [role=form]") || field?.parentElement || null;
  // the heading: the page's h1, else the heading nearest above the form
  const heads = Array.from(document.querySelectorAll("h1, h2, h3, [role=heading]")).filter((h) => vis(h) && !chrome(h));
  const above = (h) => form && (h.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING || form.contains(h));
  const h1 = heads.find((h) => h.tagName === "H1" && (!form || above(h) || !heads.some((x) => x !== h && above(x)))) || heads.filter(above).pop() || heads[0] || null;
  // the lead: the first short paragraph after the heading, before the fields
  let lead = "";
  if (h1) {
    let n = h1.nextElementSibling;
    for (let i = 0; n && i < 4 && !lead; i++, n = n.nextElementSibling) {
      if (n.querySelector?.("input, button, form") || /^(INPUT|BUTTON|FORM)$/.test(n.tagName)) break;
      const t = text(n);
      if (t.length >= 12 && t.length <= 400 && vis(n)) lead = t;
    }
    if (!lead) {
      const p = Array.from((h1.parentElement || document).querySelectorAll("p")).find((x) => vis(x) && !x.contains(form) && (h1.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) && text(x).length >= 12);
      if (p) lead = text(p).slice(0, 400);
    }
  }
  // the badge / eyebrow: a short label right above the heading, or a badge-like element in the heading's column
  let eyebrow = "";
  if (h1) {
    const prev = h1.previousElementSibling;
    if (prev && vis(prev) && !prev.querySelector("input, form") && text(prev).length > 1 && text(prev).length <= 40 && !prev.querySelector("a[href='/'], img, svg")) eyebrow = text(prev);
    if (!eyebrow) {
      const b = Array.from((h1.parentElement?.parentElement || document).querySelectorAll("[class*=eyebrow i], [class*=badge i], [class*=kicker i], [class*=overline i], [class*=pill i], [class*=tag i]")).find((e) => vis(e) && !chrome(e) && text(e).length <= 40);
      if (b) eyebrow = text(b);
    }
  }
  // the side panel: an <aside> / complementary region, else the biggest block beside the form's column
  let aside = "";
  const marked = Array.from(document.querySelectorAll("aside, [role=complementary]")).filter((e) => vis(e) && !chrome(e) && (!form || !e.contains(form)));
  if (marked.length) aside = marked.map(text).join("\n");
  else if (form) {
    let col = form;
    for (let i = 0; i < 6 && col.parentElement && col.parentElement !== document.body && !aside; i++) {
      const parent = col.parentElement;
      const sibs = Array.from(parent.children).filter((s) => s !== col && vis(s) && !chrome(s) && !s.contains(form) && !s.matches("script, style"));
      const best = sibs.map((s) => ({ s, t: s.innerText || "" })).filter((x) => clean(x.t).length >= 40).sort((a, b) => b.t.length - a.t.length)[0];
      if (best) {
        const rc = col.getBoundingClientRect();
        const rb = best.s.getBoundingClientRect();
        if (rb.right <= rc.left + 4 || rb.left >= rc.right - 4) aside = (best.s.innerText || "").trim(); // beside, not above
      }
      col = parent;
    }
  }
  // the main text: everything a visitor reads, without the site chrome
  const root = document.querySelector("main") || document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll("header, nav, footer, [role=banner], [role=navigation], [role=contentinfo], script, style, noscript, [hidden], [aria-hidden=true]").forEach((e) => e.remove());
  const body = clean(clone.textContent);
  // the switch link: "New here? Create an account" on a sign-in, "Already have an account? Sign in" on a sign-up
  const UP = /new here|don'?t have an account|no account( yet)?|create (an |your )?account|sign ?up|register|join\b|open your|get started|apply|become/i;
  const IN = /already (have|registered|a member)|have an account|sign ?in|log ?in/i;
  const links = Array.from(document.querySelectorAll("a[href]")).filter((a) => vis(a) && !chrome(a) && !/forgot|reset|terms|privacy|cookie/i.test(text(a)));
  const ctx = (a) => `${text(a)} ${text(a.parentElement).slice(0, 120)}`;
  const kind = pw.length >= 2 || pw.some((p) => /new-password/.test(p.getAttribute("autocomplete") || "")) || /sign-?up|register|create|apply|join|onboard/i.test(location.pathname + " " + text(h1)) && !/sign[- ]?in|log[- ]?in/i.test(text(h1)) ? "signUp" : "signIn";
  const sw = (kind === "signUp" ? links.find((a) => IN.test(ctx(a))) : links.find((a) => UP.test(ctx(a)) && !IN.test(text(a)))) || null;
  const authWords = /sign ?in|log ?in|sign ?up|register|create (an |your )?account|apply|join|magic link|continue with|welcome back|application/i;
  const isAuth = !!pw.length || (!!email.length && authWords.test(`${location.pathname} ${text(h1)} ${document.title}`));
  return {
    path: location.pathname + location.search,
    url: location.href,
    title: clean(document.title),
    heading: text(h1).slice(0, 200),
    lead,
    eyebrow,
    aside: aside.slice(0, 4000),
    body: body.slice(0, 8000),
    kind,
    isAuth,
    switchLink: sw ? { text: text(sw).slice(0, 80), href: sw.href } : null,
  };
});

/** On a page that is not an auth page (a "Become a specialist" landing), the link on to the role's application. */
export const nextHop = (page, role) => page.evaluate((role) => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const chrome = (el) => !!el.closest("header, nav, footer, [role=banner], [role=navigation], [role=contentinfo]");
  const GO = /apply|sign ?up|register|get started|join|create (an |your )?account|sign ?in|log ?in|start (your )?application/i;
  const links = Array.from(document.querySelectorAll("a[href]")).filter((a) => { try { return new URL(a.href).origin === location.origin && !chrome(a) && GO.test(clean(a.innerText || a.textContent)); } catch { return false; } });
  const named = role ? links.find((a) => new RegExp(role, "i").test(`${a.innerText} ${a.getAttribute("href")}`)) : null;
  const a = named || links[0];
  return a ? { text: clean(a.innerText || a.textContent).slice(0, 80), href: a.href } : null;
}, role);

/**
 * The whole check for one product: `open(path)` gives a fresh page at `path` (signed out). `customer` is
 * { signIn, signUp } (paths); `pages` the pages whose links are searched for doors; `rc` is roleAuthConfig(cfg).
 * Returns { findings, notes, entries }.
 */
export async function roleDoors(open, { customer, pages, rc }) {
  const findings = [];
  const notes = [];
  const read = async (path) => { const page = await open(path); try { return await authSurface(page); } finally { await page.context().close().catch(() => {}); } };
  const cust = {};
  for (const k of ["signIn", "signUp"]) if (customer[k]) cust[k] = await read(customer[k]).catch(() => null);
  for (const c of Object.values(cust)) if (c?.isAuth) findings.push(...customerAdvertisesRole(c, rc.roleWords));
  const customerTargets = new Set(Object.values(customer).filter(Boolean).map((p) => target(p)));

  // the doors: links on the searched pages, and routes the config names
  const doors = new Map();
  for (const p of pages) {
    const page = await open(p).catch(() => null);
    if (!page) continue;
    for (const e of await roleEntries(page, rc.entryRe.source, rc.entrySelectors).catch(() => [])) {
      const k = target(e.href);
      if (!doors.has(k)) doors.set(k, { ...e, from: p });
    }
    await page.context().close().catch(() => {});
  }
  for (const r of rc.routes) for (const k of ["signIn", "signUp"]) if (r[k]) doors.set(`cfg:${r.role}:${k}`, { text: `${r.role} ${k === "signIn" ? "sign-in" : "sign-up"} (forms.roleAuth.routes)`, href: r[k], from: "babysitter.config.json", role: r.role });

  let checked = 0;
  for (const d of doors.values()) {
    if (checked >= rc.maxEntries) { notes.push(`more than ${rc.maxEntries} role doors — the rest were not opened (forms.roleAuth.maxEntries)`); break; }
    let role = d.role || entryRole(d, rc.roleWords);
    if (role === "customer") continue;
    let surf = await read(target(d.href)).catch(() => null);
    if (!surf) { notes.push(`"${d.text}" → ${target(d.href)} did not open`); continue; }
    if (!surf.isAuth) {
      role = role || entryRole({ landing: `${surf.heading} ${surf.title}` }, rc.roleWords);
      const page = await open(target(d.href)).catch(() => null);
      const hop = page ? await nextHop(page, role).catch(() => null) : null;
      if (page) await page.context().close().catch(() => {});
      if (!hop) { notes.push(`"${d.text}" → ${surf.path} is not a sign-in / sign-up page and links to none — not compared`); continue; }
      const s2 = await read(target(hop.href)).catch(() => null);
      if (!s2?.isAuth) { notes.push(`"${d.text}" → ${surf.path} → "${hop.text}" ${target(hop.href)} is not a sign-in / sign-up page — not compared`); continue; }
      d.text = `${d.text}" → "${hop.text}`;
      surf = s2;
    }
    role = role || entryRole({ landing: `${surf.heading} ${surf.title} ${surf.path}` }, rc.roleWords);
    const base = cust[surf.kind]?.isAuth ? cust[surf.kind] : (cust.signIn?.isAuth ? cust.signIn : cust.signUp);
    if (!base) { notes.push(`no customer sign-in / sign-up page to compare ${surf.path} with`); continue; }
    if (customerTargets.has(target(surf.path)) && !role) continue; // the customer door itself, not a role's
    checked++;
    findings.push(...compareAuthSurfaces(base, surf, { role, entry: { text: d.text, from: d.from }, maxSimilarity: rc.maxSimilarity }));
  }
  return { findings, notes, entries: [...doors.values()], checked };
}
