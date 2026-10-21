// 5.5.0 — boxes, icons, the header and the brand (the miss loop over Praxis, Parallel, Kindred and Compass cards,
// misses/*.md). Each function names the card it comes from. Findings follow ../checks.js: { what, where, selector,
// human }. Needs checks.install(page) first.
//   2.14 cellSpill            text runs out of its table cell into the next one (Praxis izrv19, Cookie Policy table)
//   2.14 iconClipped          an icon cut by a box that clips, or squeezed by flex (Kindred x099su, "Active Orders" rocket)
//   2.18 roundedScroller      a rounded box that scrolls itself: a desktop scrollbar draws over its corners (Kindred 5k8emt)
//   2.19 emptyScroller        an empty state that scrolls (Praxis prmi5d, "No messages yet")
//   2.20 sidewaysScroll       a panel that scrolls sideways although nothing in it is wider (Kindred 1zetde, vaul drawer)
//   2.24 iconGap              an icon glued to its label (Kindred dq793h, "Under review")
//   1.20 headerFaces          the header's word controls in two typefaces (Praxis f8e3xf, m0n604)
//   1.20 popularPlacements    one placement of the "Most popular" badge across pages (Kindred fqsn52) — collector
//   1.21 pageAccent           one accent hue per site (Compass u5brwv, 9ln1xx) — collector
//   1.22 siblingParts         a card of a row lacks a part the others have (Compass 01s1e1) — soft
//   3.5  desktopHeaderNav     a desktop header that is only a logo and a burger (Kindred sxnm89, 62i3ff)
//   3.10 burgerRepeatsNav     a burger beside the full nav that opens the same links (Compass 6d0aki)
//   6.5  headingSignals       an h1 in capitals while the site's are not; one accent style in headings (Kindred
//                             9ha0j4, Compass 5dudz9) — collector
//   6.9  innerFocusRing       focus drawn on the input inside a framed field (Compass h59hxv)
//   1.6  hoverEdge            hover draws an uneven edge / moves the card (Kindred 1rto89)
//   1.11 brandMark            footer logo = header logo, favicon = the mark, manifest = the brand (Kindred kytm39, bmlrc4)
//   B5   customAmountTile     the top-up dialog's custom amount is a tile like the packages (Kindred c25ux3)

/* ───────── 2.14 a table cell's text runs into the next cell (Praxis izrv19) ───────── */
export const cellSpill = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  const rng = document.createRange();
  const cells = Array.from(document.querySelectorAll("td, th, [role=cell], [role=gridcell], [role=columnheader]")).slice(0, 1500);
  for (const cell of cells) {
    if (!W.__uiVisible(cell)) continue;
    const next = cell.nextElementSibling;
    if (!next || !W.__uiVisible(next)) continue;
    const cr = cell.getBoundingClientRect();
    // a scroller or an ellipsis in the cell: the cell handles its overflow on purpose
    let skip = false;
    for (const e of [cell, ...cell.querySelectorAll("*")]) { const cs = getComputedStyle(e); if (/auto|scroll/.test(cs.overflowX) || cs.textOverflow === "ellipsis" || /hidden|clip/.test(cs.overflowX)) { skip = true; break; } }
    if (skip) continue;
    let right = -Infinity, text = "";
    const w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim() || !W.__uiVisible(n.parentElement)) continue;
      rng.selectNodeContents(n);
      for (const r of rng.getClientRects()) if (r.width > 0 && r.right > right) { right = r.right; text = n.nodeValue.trim(); }
    }
    const rtl = getComputedStyle(cell).direction === "rtl";
    if (rtl || right === -Infinity) continue;
    const nr = next.getBoundingClientRect();
    const over = right - cr.right;
    if (over > 2 && right > nr.left + 1)
      out.push({ what: `"${text.slice(0, 40)}" runs ${Math.round(over)}px out of its cell into the next column — let it break (overflow-wrap:anywhere, <wbr> after "_" / "-") or give the column room [2.14]`, where: W.__uiDescribe(cell), selector: W.__uiSelector(cell), human: W.__uiHuman(cell) });
  }
  return out;
});

/* ───────── 2.14 an icon is shown in full (Kindred x099su) ───────── */
export const iconClipped = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  const icons = Array.from(document.querySelectorAll("svg, img")).filter((el) => !el.parentElement?.closest("svg")).slice(0, 800);
  for (const el of icons) {
    // icons are often aria-hidden (lucide): what counts is that they are painted; a squeezed one can be 0px wide
    { const cs0 = getComputedStyle(el); const r0 = el.getBoundingClientRect(); if (cs0.display === "none" || cs0.visibility === "hidden" || r0.height < 4 || el.closest("[hidden]") || (r0.width >= 1 && !W.__uiPainted(el))) continue; }
    const r = el.getBoundingClientRect();
    // a squeezed icon can be 0px wide: its height says it is an icon
    if (r.width > 64 || r.height > 64 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (el.tagName === "IMG" && /cover|contain/.test(cs.objectFit)) continue;
    // (b) squeezed: a declared width the layout did not give it (a flex item without shrink-0 beside a long label)
    const declared = parseFloat(el.getAttribute("width") || "");
    const vb = el.tagName.toLowerCase() === "svg" ? (el.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number) : null;
    const parentFlex = /flex/.test(getComputedStyle(el.parentElement || document.body).display);
    if (parentFlex && parseFloat(cs.flexShrink) > 0) {
      const vbAspect = vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? vb[2] / vb[3] : null;
      const squeezedW = Number.isFinite(declared) && declared > 0 && r.width < declared - 1;
      const squeezedA = vbAspect && Math.abs(r.width / r.height - vbAspect) / vbAspect > 0.1 && r.width < r.height;
      if (squeezedW || squeezedA) {
        out.push({ what: `icon squeezed to ${Math.round(r.width)}×${Math.round(r.height)}px${squeezedW ? ` (declared ${declared}px)` : ""} by the flex row beside it — give it shrink-0 (flex-shrink: 0) [2.14]`, where: W.__uiDescribe(el.parentElement || el), selector: W.__uiSelector(el), human: W.__uiHuman(el.parentElement || el) });
        continue;
      }
    }
    // (a) cut by an ancestor that clips (not a scroller), while partly visible
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (!/hidden|clip/.test(as.overflowX) && !/hidden|clip/.test(as.overflowY)) continue;
      if (/auto|scroll/.test(as.overflowX + as.overflowY)) break;
      const b = a.getBoundingClientRect();
      // a round mask (an avatar) cuts its picture on purpose
      if (parseFloat(as.borderTopLeftRadius) >= Math.min(b.width, b.height) / 2 - 1) break;
      const cut = Math.max(b.left - r.left, r.right - b.right, b.top - r.top, r.bottom - b.bottom);
      const vis = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)) * Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
      if (cut >= 1 && vis >= 0.3 * r.width * r.height)
        out.push({ what: `icon cut by ${Math.round(cut)}px by a box that clips (${W.__uiDescribe(a).slice(0, 60)}) — give the icon room or let the box show it [2.14]`, where: W.__uiDescribe(el.parentElement || el), selector: W.__uiSelector(el), human: W.__uiHuman(el.parentElement || el) });
      break;
    }
  }
  return out;
});

/* ───────── 2.18 a rounded box that scrolls itself (Kindred 5k8emt) ───────── */
// Headless Chromium draws 0px overlay scrollbars, so 5.1 (which needs a scrollbar track) never fired there; a person on
// Windows / Linux / a mouse-driven Mac sees a 15–17px track painted across the right-hand corner arcs.
export const roundedScroller = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 4000)) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowY)) continue;
    if (el.scrollHeight <= el.clientHeight + 1 || !W.__uiVisible(el)) continue;
    if (cs.scrollbarWidth === "none") continue;
    const rad = Math.max(parseFloat(cs.borderTopRightRadius) || 0, parseFloat(cs.borderBottomRightRadius) || 0);
    if (rad < 8) continue;
    out.push({ what: `a ${Math.round(rad)}px-rounded box scrolls itself: a desktop scrollbar draws across its right corners — keep the radius on an outer box that clips (overflow: hidden) and scroll an inner one [2.18]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  }
  return out;
});

/* ───────── 2.19 an empty box does not scroll (Praxis prmi5d) ───────── */
const EMPTY_RE = /\b(no (messages|items|results|tasks|activity|orders|notifications|files|comments|conversations|reviews)( yet)?|nothing (here|yet|to show)|(it'?s|is) empty|empty)\b|пока (нет|пусто)|hələ (yoxdur|heç nə)|әзірге (жоқ|бос)/i;
export const emptyScroller = (page) => page.evaluate((EMPTY) => {
  const W = window;
  const out = [];
  const re = new RegExp(EMPTY, "i");
  for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 4000)) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowY) || el === document.scrollingElement) continue;
    const by = el.scrollHeight - el.clientHeight;
    if (by <= 1 || !W.__uiVisible(el)) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 160 || !re.test(t)) continue;
    // a list with items is not empty
    const items = el.querySelectorAll("li, article, [role=listitem], [role=article]").length;
    if (items >= 2) continue;
    out.push({ what: `the empty state "${t.slice(0, 50)}" scrolls by ${Math.round(by)}px — size the placeholder to the box (height: 100%, no fixed height + padding) [2.19]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  }
  return out;
}, EMPTY_RE.source);

/* ───────── 2.20 a panel does not scroll sideways over nothing (Kindred 1zetde) ───────── */
export const sidewaysScroll = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 4000)) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowX)) continue;
    if (el.scrollWidth <= el.clientWidth + 1 || !W.__uiVisible(el)) continue;
    const box = el.getBoundingClientRect();
    const limit = box.left + parseFloat(cs.borderLeftWidth) + el.clientWidth + 1;
    let inflow = -Infinity, culprit = null, culpritRight = -Infinity;
    for (const d of Array.from(el.querySelectorAll("*")).slice(0, 1500)) {
      // inside a nested box that clips or scrolls: that box handles it
      let nested = false;
      for (let p = d.parentElement; p && p !== el; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.overflowX !== "visible") { nested = true; break; } }
      if (nested) continue;
      const ds = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const abs = /absolute|fixed/.test(ds.position);
      if (abs) { if (r.right > culpritRight) { culpritRight = r.right; culprit = d; } continue; }
      let inAbs = false;
      for (let p = d.parentElement; p && p !== el; p = p.parentElement) if (/absolute|fixed/.test(getComputedStyle(p).position)) { inAbs = true; break; }
      if (!inAbs) inflow = Math.max(inflow, r.right);
    }
    if (inflow > limit) continue; // real content is wider: a scroller with a reason (a table, chips, a carousel)
    const pseudo = ["::before", "::after"].find((p) => { const ps = getComputedStyle(el, p); return ps.content !== "none" && /absolute|fixed/.test(ps.position); });
    const who = culprit && culpritRight > limit ? `an absolute ${W.__uiDescribe(culprit).slice(0, 50)}` : pseudo ? `its ${pseudo} (position: absolute)` : "a pseudo-element or an absolute filler";
    out.push({ what: `the panel scrolls sideways by ${el.scrollWidth - el.clientWidth}px although nothing in it is wider — the scroll comes from ${who}; set overflow-x: hidden (or clip) on the panel [2.20]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  }
  return out;
});

/* ───────── 2.24 an icon and its label have a gap (Kindred dq793h) ───────── */
export const iconGap = (page) => page.evaluate(() => {
  const W = window;
  const hard = [], soft = [];
  const rng = document.createRange();
  for (const icon of Array.from(document.querySelectorAll("svg, img")).filter((el) => !el.parentElement?.closest("svg")).slice(0, 800)) {
    if (!W.__uiPainted(icon) || icon.closest("[hidden]")) continue; // aria-hidden icons are painted too
    const ir = icon.getBoundingClientRect();
    if (ir.width > 24 || ir.height > 24 || ir.width < 6) continue;
    // the text beside it: a text run in the icon's container (up to 3 levels), not inside the icon
    let best = null;
    for (let box = icon.parentElement, d = 0; box && d < 3 && !best; box = box.parentElement, d++) {
      const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.nodeValue.trim() || icon.contains(n) || !W.__uiVisible(n.parentElement)) continue;
        rng.selectNodeContents(n);
        for (const r of rng.getClientRects()) {
          if (r.width < 2) continue;
          const ov = Math.min(r.bottom, ir.bottom) - Math.max(r.top, ir.top);
          if (ov < 0.5 * Math.min(r.height, ir.height)) continue;
          const gap = r.left >= ir.left ? r.left - ir.right : ir.left - r.right;
          if (gap < -2 || gap > 40) continue;
          if (!best || gap < best.gap) best = { gap, text: n.nodeValue.trim(), size: parseFloat(getComputedStyle(n.parentElement).fontSize) || 16 };
        }
      }
    }
    if (!best) continue;
    const f = { what: `the icon touches "${best.text.slice(0, 30)}" (${Math.max(0, Math.round(best.gap * 10) / 10)}px apart) — put a gap of 4–8px between them (gap-1.5 / gap-2 on the row) [2.24]`, where: W.__uiDescribe(icon.parentElement || icon), selector: W.__uiSelector(icon), human: W.__uiHuman(icon.parentElement || icon) };
    if (best.gap < 3) hard.push(f);
    else if (best.gap < 4 || best.gap < 0.25 * best.size) soft.push(f);
  }
  return { hard, soft };
});

/* ───────── 1.20 the header's word controls share one typeface (Praxis f8e3xf, m0n604) ───────── */
export const headerFaces = (page) => page.evaluate(() => {
  const W = window;
  const header = Array.from(document.querySelectorAll("header, [role=banner]")).find((h) => W.__uiVisible(h) && h.getBoundingClientRect().top < 120);
  if (!header) return [];
  const fam = (el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
  const groups = new Map();
  const ctrls = Array.from(header.querySelectorAll("a, button, [role=combobox]")).filter((el) => W.__uiVisible(el));
  const logo = ctrls.find((a) => a.tagName === "A" && (() => { try { const u = new URL(a.href, location.href); return u.pathname === "/" && u.origin === location.origin; } catch { return false; } })());
  for (const el of ctrls) {
    if (el === logo || (logo && logo.contains(el))) continue;
    if (el.parentElement?.closest("a, button") && ctrls.includes(el.parentElement.closest("a, button"))) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if ((t.match(/\p{L}/gu) || []).length < 4) continue;
    if (/^[A-Z]{2,4}([\s·|/,]+[A-Z]{2,4})*$/.test(t)) continue; // codes: EN · AZ, USD
    // the text's own element (a span inside the button) decides the face
    let face = el;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.trim()) { face = n.parentElement; break; }
    const f = fam(face);
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push({ el, t });
  }
  if (groups.size < 2) return [];
  const list = [...groups].sort((a, b) => b[1].length - a[1].length);
  const [main] = list;
  return list.slice(1).map(([f, items]) => ({ what: `the header's controls use two typefaces: ${main[0]} (${main[1].map((x) => `"${x.t.slice(0, 20)}"`).slice(0, 5).join(", ")}) and ${f} (${items.map((x) => `"${x.t.slice(0, 20)}"`).slice(0, 5).join(", ")}) — one face for every word control of the header [1.20]`, where: W.__uiDescribe(items[0].el), selector: W.__uiSelector(items[0].el), human: W.__uiHuman(items[0].el) }));
});

/* ───────── 3.5 a desktop header shows its navigation (Kindred sxnm89, 62i3ff) ───────── */
export const desktopHeaderNav = (page) => page.evaluate(() => {
  const W = window;
  if (innerWidth < 1024) return [];
  if (/\/(log-?in|sign-?in|sign-?up|register|join|forgot|reset)/i.test(location.pathname)) return [];
  const header = Array.from(document.querySelectorAll("header, [role=banner]")).find((h) => W.__uiVisible(h) && h.getBoundingClientRect().top < 120);
  if (!header) return [];
  const AUTH = /log-?in|sign-?(in|up)|register|join|logout|account|profile|cart|checkout/i;
  const dest = (a) => { try { const u = new URL(a.getAttribute("href") || "", location.href); if (u.origin !== location.origin || u.pathname === "/" || AUTH.test(u.pathname)) return null; return u.pathname; } catch { return null; } };
  const visible = new Set(Array.from(header.querySelectorAll("a[href]")).filter((a) => W.__uiVisible(a)).map(dest).filter(Boolean));
  if (visible.size) return [];
  const toggle = Array.from(header.querySelectorAll("button, [role=button]")).find((b) => W.__uiVisible(b) && (b.hasAttribute("aria-expanded") || b.hasAttribute("aria-controls") || /menu|navigation|nav/i.test(b.getAttribute("aria-label") || "")) && !/account|user|profile|avatar|currency|language/i.test(b.getAttribute("aria-label") || ""));
  const panel = toggle && toggle.getAttribute("aria-controls") ? document.getElementById(toggle.getAttribute("aria-controls")) : null;
  const hidden = new Set(Array.from((panel || document.createElement("div")).querySelectorAll("a[href]")).map(dest).filter(Boolean));
  const footer = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).pop();
  const inFooter = new Set(Array.from(footer ? footer.querySelectorAll("a[href]") : []).map(dest).filter(Boolean));
  const all = new Set([...hidden, ...inFooter]);
  if (all.size < 3) return [];
  const names = [...(hidden.size ? hidden : inFooter)].slice(0, 5).join(", ");
  return [{ what: `at ${innerWidth}px the header shows no navigation — only the logo${toggle ? " and a menu button" : ""}; ${names} are hidden${toggle ? " behind the toggle" : ""}. Show the main links in the desktop header (or layout.desktopNav: "menu" with the reason in allowReasons) [3.5]`, where: W.__uiDescribe(header), selector: W.__uiSelector(header), human: W.__uiHuman(header) }];
});

/* ───────── 3.10 a burger beside the visible nav adds something (Compass 6d0aki) ───────── */
export async function burgerRepeatsNav(page) {
  const prep = await page.evaluate(() => {
    const W = window;
    const header = Array.from(document.querySelectorAll("header, [role=banner]")).find((h) => W.__uiVisible(h) && h.getBoundingClientRect().top < 120);
    if (!header) return null;
    const path = (a) => { try { const u = new URL(a.getAttribute("href") || "", location.href); return u.origin === location.origin && u.pathname !== "/" ? u.pathname : null; } catch { return null; } };
    const shown = [...new Set(Array.from(header.querySelectorAll("a[href]")).filter((a) => W.__uiVisible(a)).map(path).filter(Boolean))];
    if (shown.length < 2) return null;
    const t = Array.from(header.querySelectorAll("button, [role=button]")).find((b) => W.__uiVisible(b) && (b.hasAttribute("aria-expanded") || /menu|navigation/i.test(b.getAttribute("aria-label") || "")) && !/account|user|profile|avatar|currency|language|search|theme|cart/i.test(`${b.getAttribute("aria-label") || ""} ${b.innerText || ""}`));
    if (!t) return null;
    t.setAttribute("data-bs-burger", "");
    window.__bsBefore = new Set(Array.from(document.querySelectorAll("a[href]")).filter((a) => W.__uiVisible(a)));
    return { shown };
  }).catch(() => null);
  if (!prep) return [];
  await page.locator("[data-bs-burger]").first().click({ timeout: 2000 }).catch(() => { });
  await page.waitForTimeout(500);
  const res = await page.evaluate((shown) => {
    const W = window;
    const path = (a) => { try { const u = new URL(a.getAttribute("href") || "", location.href); return u.origin === location.origin ? u.pathname : `ext:${u.href}`; } catch { return null; } };
    const fresh = Array.from(document.querySelectorAll("a[href]")).filter((a) => W.__uiVisible(a) && !window.__bsBefore.has(a)).map(path).filter((p) => p && p !== "/");
    const set = [...new Set(fresh)];
    if (set.length < 2) return null;
    const same = set.filter((p) => shown.includes(p));
    const b = document.querySelector("[data-bs-burger]");
    return same.length / set.length >= 0.8 && set.length - same.length <= 0 ? { set, where: W.__uiDescribe(b), selector: W.__uiSelector(b), human: W.__uiHuman(b) } : null;
  }, prep.shown).catch(() => null);
  await page.keyboard.press("Escape").catch(() => { });
  await page.waitForTimeout(200);
  if (!res) return [];
  return [{ what: `the menu button opens the same ${res.set.length} links the header already shows (${res.set.slice(0, 5).join(", ")}) — hide the toggle at the widths where the nav is visible [3.10]`, where: res.where, selector: res.selector, human: res.human }];
}

/* ───────── 6.9 one focus ring on a framed field (Compass h59hxv) ───────── */
export async function innerFocusRing(page, { max = 8 } = {}) {
  const n = await page.evaluate((max) => {
    const W = window;
    document.querySelectorAll("[data-bs-fr]").forEach((e) => e.removeAttribute("data-bs-fr"));
    const vis = (c) => W.__uiRGBA(c)[3] > 0.3;
    let i = 0;
    for (const inp of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea'))) {
      if (i >= max || !W.__uiVisible(inp)) continue;
      const cs = getComputedStyle(inp);
      const own = ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && vis(cs[`border${s}Color`]));
      if (own) continue;
      const ir = inp.getBoundingClientRect();
      for (let p = inp.parentElement, d = 0; p && d < 3; p = p.parentElement, d++) {
        const ps = getComputedStyle(p);
        const framed = ["Top", "Right", "Bottom", "Left"].every((s) => parseFloat(ps[`border${s}Width`]) >= 1 && vis(ps[`border${s}Color`]));
        if (!framed) continue;
        const pr = p.getBoundingClientRect();
        if (ir.left - pr.left >= 4 || pr.right - ir.right >= 4 || ir.top - pr.top >= 4) { inp.setAttribute("data-bs-fr", String(i++)); }
        break;
      }
    }
    return i;
  }, max).catch(() => 0);
  const out = [];
  const look = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { o: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && window.__uiRGBA(cs.outlineColor)[3] > 0.1 ? `${cs.outlineWidth} ${cs.outlineColor}` : "", s: cs.boxShadow === "none" ? "" : cs.boxShadow, b: ["Top", "Right", "Bottom", "Left"].map((x) => `${cs[`border${x}Width`]} ${cs[`border${x}Color`]}`).join() }; }, sel).catch(() => null);
  for (let i = 0; i < n; i++) {
    const sel = `[data-bs-fr="${i}"]`;
    const rest = await look(sel);
    await page.locator(sel).focus({ timeout: 1500 }).catch(() => { });
    await page.waitForTimeout(250);
    const now = await look(sel);
    await page.locator(sel).blur().catch(() => { });
    if (!rest || !now) continue;
    if ((now.o && now.o !== rest.o) || (now.s && now.s !== rest.s) || now.b !== rest.b) {
      const where = await page.evaluate((sel) => { const e = document.querySelector(sel); return { where: window.__uiDescribe(e), selector: window.__uiSelector(e), human: window.__uiHuman(e), label: (e.getAttribute("placeholder") || e.getAttribute("aria-label") || e.name || "").slice(0, 40) }; }, sel);
      out.push({ what: `focus draws a second ring inside the field${where.label ? ` "${where.label}"` : ""}: the input inside the framed box gets the ring — move the focus style to the frame (:focus-within) and keep the inner input plain [6.9]`, where: where.where, selector: where.selector, human: where.human });
    }
  }
  return out;
}

/* ───────── 1.22 sibling cards have the same parts (Compass 01s1e1) — soft ───────── */
export const siblingParts = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  const seen = new Set();
  for (const parent of Array.from(document.querySelectorAll("main *, [role=main] *")).slice(0, 4000)) {
    if (seen.has(parent)) continue;
    const kids = Array.from(parent.children).filter((k) => W.__uiVisible(k));
    if (kids.length < 4) continue;
    const sig = (e) => `${e.tagName}.${(e.getAttribute("class") || "").trim()}`;
    const byS = new Map();
    for (const k of kids) { const s = sig(k); if (!byS.has(s)) byS.set(s, []); byS.get(s).push(k); }
    for (const [, cards] of byS) {
      if (cards.length < 4) continue;
      const r0 = cards[0].getBoundingClientRect();
      if (r0.width < 120 || r0.height < 60) continue;
      // cards: a painted box of their own, not the rows of a list / table / definition list (Compass ledger rows)
      const cs0 = getComputedStyle(cards[0]);
      const paintsBox = ["Top", "Right", "Bottom", "Left"].every((s) => parseFloat(cs0[`border${s}Width`]) > 0) || cs0.boxShadow !== "none" || W.__uiRGBA(cs0.backgroundColor)[3] > 0.05;
      if (!paintsBox || /^(LI|TR|DT|DD)$/.test(cards[0].tagName) && cards[0].parentElement.closest("ol, dl, table") || parent.tagName === "DL") continue;
      seen.add(parent);
      const slots = cards.map((c) => new Set(Array.from(c.querySelectorAll("*")).filter((e) => W.__uiVisible(e) && e.children.length === 0 && (e.textContent || "").trim()).map((e) => `${e.tagName}.${(e.getAttribute("class") || "").trim()}`)));
      const count = new Map();
      for (const s of slots) for (const x of s) count.set(x, (count.get(x) || 0) + 1);
      for (const [slot, n] of count) {
        if (n === cards.length || n < 0.75 * cards.length || cards.length - n !== 1) continue;
        const miss = cards[slots.findIndex((s) => !s.has(slot))];
        const name = ((miss.querySelector("h1, h2, h3, h4, strong, b") || miss).innerText || "").trim().split("\n")[0].slice(0, 40);
        out.push({ what: `"${name}" lacks a part the other ${n} cards of its row have (${slot.split(".")[0].toLowerCase()}${slot.includes(".") && slot.split(".")[1] ? `.${slot.split(".").slice(1).join(".").split(" ")[0]}` : ""}) — give every card the same parts, or show why this one differs [1.22]`, where: W.__uiDescribe(miss), selector: W.__uiSelector(miss), human: W.__uiHuman(miss) });
      }
    }
  }
  return out.slice(0, 10);
});

/* ───────── collectors for the site-wide comparisons (1.20 popular badge, 1.21 accent, 6.5 h1 case / accent) ───────── */
const POPULAR = /^(most popular|popular|recommended|best value|best deal|top pick|ən populyar|populyar|tövsiyə olunur|ең танымал|танымал|популярн\w*|самый популярный|рекомендуем\w*|выгодн\w*)$/i;
export const siteSignals = (page, route = "") => page.evaluate(({ route, POP }) => {
  const W = window;
  const re = new RegExp(POP, "i");
  const out = { route, popular: [], accent: null, h1: null, accents: [] };
  const painted = (cs) => W.__uiRGBA(cs.backgroundColor)[3] > 0.05 || ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && W.__uiRGBA(cs[`border${s}Color`])[3] > 0.1) || cs.boxShadow !== "none";
  // 1.20 "Most popular": where the badge sits on its card
  for (const el of Array.from(document.querySelectorAll("span, div, p, small, strong, b, em, mark")).slice(0, 5000)) {
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 24 || !re.test(t) || !W.__uiVisible(el)) continue;
    if (Array.from(el.children).some((k) => re.test((k.innerText || "").trim()))) continue; // the innermost
    const cs = getComputedStyle(el);
    if (!painted(cs) || el.closest("button, a, [role=tab], [role=option], label > input")) continue;
    const br = el.getBoundingClientRect();
    let card = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const r = p.getBoundingClientRect(); if (painted(getComputedStyle(p)) && r.width > br.width + 40 && r.height > br.height + 30) { card = p; break; } }
    if (!card) continue;
    const cr = card.getBoundingClientRect();
    const cst = getComputedStyle(card);
    const inner = cr.top + (parseFloat(cst.borderTopWidth) || 0);
    const place = br.top < cr.top + 1 && br.bottom > cr.top - 1 ? "straddle" : br.top >= inner && br.top - inner <= 24 ? "inside-top" : br.top > inner + 24 && br.bottom <= cr.bottom ? "inside-flow" : "outside";
    out.popular.push({ place, offset: Math.round(br.top - cr.top), text: t, dialog: !!el.closest("[role=dialog], dialog"), where: W.__uiDescribe(el) });
  }
  // 1.21 the accent: the hue of the largest chromatic fill on buttons, button-links and badges
  const hues = new Map();
  const hsl = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; if (d < 1e-6) return { h: 0, s: 0, l }; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s, l }; };
  for (const el of Array.from(document.querySelectorAll("button, a, [role=button], [class*=badge i], [class*=pill i], [class*=chip i]")).slice(0, 1500)) {
    if (!W.__uiVisible(el)) continue;
    const t = `${el.innerText || ""} ${el.getAttribute("class") || ""}`;
    if (/delete|danger|destructive|error|remove|success|warning/i.test(t)) continue;
    const c = W.__uiRGBA(getComputedStyle(el).backgroundColor);
    if (c[3] < 0.5) continue;
    const { h, s, l } = hsl(c);
    if (s < 0.25 || l < 0.12 || l > 0.92) continue;
    const r = el.getBoundingClientRect();
    const a = r.width * r.height;
    if (a < 400) continue;
    const bin = `${Math.round(h / 10) * 10 % 360}|${Math.round(l * 5)}`;
    const e = hues.get(bin) || { a: 0, rgb: c.slice(0, 3).map(Math.round) };
    e.a += a;
    hues.set(bin, e);
  }
  const top = [...hues.values()].sort((x, y) => y.a - x.a)[0];
  if (top) out.accent = top.rgb;
  // 6.5 h1 case
  const h1 = Array.from(document.querySelectorAll("h1")).find((h) => W.__uiVisible(h));
  if (h1) {
    const raw = (h1.textContent || "").replace(/\s+/g, " ").trim();
    // two words or more, six letters or more: "ABOUT US" counts, "FAQ" / "AI" do not
    const words = raw.split(" ").filter((w) => (w.match(/\p{L}/gu) || []).length >= 2);
    if (words.length >= 2 && (raw.match(/\p{L}/gu) || []).length >= 6) {
      const css = getComputedStyle(h1).textTransform === "uppercase";
      const str = raw === raw.toUpperCase() && raw !== raw.toLowerCase();
      out.h1 = { text: raw.slice(0, 60), upper: css || str, fromCss: css, where: W.__uiDescribe(h1) };
    }
  }
  // 6.5 the accented part of a heading (a child in another colour or style)
  for (const h of Array.from(document.querySelectorAll("h1, h2, h3")).filter((h) => W.__uiVisible(h)).slice(0, 30)) {
    const hs = getComputedStyle(h);
    if (h.querySelector("button, [role=button], [aria-expanded]") || h.closest("button, [role=button]")) continue; // an accordion trigger
    const kid = Array.from(h.querySelectorAll("em, i, span, strong, b, mark")).find((k) => { const ks = getComputedStyle(k); return ((k.textContent || "").match(/\p{L}/gu) || []).length >= 3 && !k.closest("[aria-hidden=true]") && (ks.color !== hs.color || ks.fontStyle !== hs.fontStyle || ks.fontFamily !== hs.fontFamily); });
    if (!kid) continue;
    const full = (h.textContent || "").trim(), part = (kid.textContent || "").trim();
    const pos = full.endsWith(part) ? "end" : full.startsWith(part) ? "start" : "mid";
    out.accents.push({ italic: getComputedStyle(kid).fontStyle === "italic", pos, text: full.slice(0, 50) });
  }
  return out;
}, { route, POP: POPULAR.source });

/** Site-wide judgement over siteSignals() of every page: { hard, soft }. */
export function siteSignalFindings(list) {
  const hard = [], soft = [];
  // 1.20 one placement of the popular badge
  const pops = list.flatMap((p) => p.popular.map((x) => ({ ...x, route: p.route })));
  const places = new Map();
  for (const x of pops) { if (!places.has(x.place)) places.set(x.place, []); places.get(x.place).push(x); }
  if (places.size > 1) {
    const ranked = [...places].sort((a, b) => b[1].length - a[1].length || (a[0] === "straddle" ? -1 : b[0] === "straddle" ? 1 : 0));
    const [main] = ranked;
    for (const [place, xs] of ranked.slice(1)) hard.push({ what: `the "${xs[0].text}" badge sits ${place} its card here (${xs[0].offset}px from the card top) and ${main[0]} on ${[...new Set(main[1].map((y) => y.route))].join(", ")} — one placement for the badge across the site [1.20]`, where: `${xs.map((y) => `${y.route}${y.dialog ? " (dialog)" : ""}`).join(", ")} ${xs[0].where}` });
  }
  // 1.21 one accent colour (ΔE in CIELAB: brass #b08d57 and Forge orange #f46f00 are 10° of hue apart but ΔE ≈ 45)
  const acc = list.filter((p) => Array.isArray(p.accent));
  if (acc.length >= 3) {
    const lab = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [R, G, B] = [f(r), f(g), f(b)]; const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883; const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))]; };
    const dE = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
    const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    // the site's accent: the colour that most pages share (within ΔE 20)
    const dom = acc.map((p) => ({ p, n: acc.filter((q) => dE(q.accent, p.accent) < 20).length })).sort((a, b) => b.n - a.n)[0].p.accent;
    const odd = acc.filter((p) => dE(p.accent, dom) >= 30);
    if (odd.length && odd.length < acc.length / 2)
      hard.push({ what: `${odd.length} page(s) use another accent colour (${[...new Set(odd.map((p) => hex(p.accent)))].join(", ")}) than the rest of the site (${hex(dom)}) — a second identity left in the theme; one accent on every page [1.21]`, where: odd.map((p) => p.route).join(", ") });
  }
  // 6.5 an h1 in capitals while the site's h1s are mixed case
  const h1s = list.filter((p) => p.h1);
  if (h1s.length >= 3) {
    const mixed = h1s.filter((p) => !p.h1.upper);
    const upper = h1s.filter((p) => p.h1.upper);
    if (upper.length && mixed.length / h1s.length >= 0.6)
      for (const p of upper) hard.push({ what: `the h1 "${p.h1.text}" is set in capitals${p.h1.fromCss ? " (text-transform: uppercase)" : " (typed in capitals)"} while ${mixed.length} of ${h1s.length} pages write their h1 in normal case — one case for page titles [6.5]`, where: `${p.route} ${p.h1.where}` });
  }
  // 6.5 one accent style in headings (soft)
  const accs = list.flatMap((p) => p.accents.map((a) => ({ ...a, route: p.route })));
  const ital = accs.filter((a) => a.italic), up = accs.filter((a) => !a.italic);
  if (ital.length && up.length) {
    const minor = ital.length <= up.length ? ital : up;
    soft.push({ what: `the accented word of a heading is ${minor === ital ? "italic" : "upright"} here and ${minor === ital ? "upright" : "italic"} on the other pages — one accent style in headings [6.5]`, where: minor.slice(0, 4).map((a) => `${a.route} "${a.text}"`).join("; ") });
  }
  return { hard, soft };
}

/* ───────── 1.6 hover draws an even edge and does not move the card (Kindred 1rto89) ───────── */
const edgesFn = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const A = (c) => window.__uiRGBA(c)[3];
  const side = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const [k, s] of [["top", "Top"], ["right", "Right"], ["bottom", "Bottom"], ["left", "Left"]]) if (A(cs[`border${s}Color`]) > 0.1 && cs[`border${s}Style`] !== "none") side[k] += parseFloat(cs[`border${s}Width`]) || 0;
  if (cs.outlineStyle !== "none" && A(cs.outlineColor) > 0.1) for (const k in side) side[k] += parseFloat(cs.outlineWidth) || 0;
  if (cs.boxShadow && cs.boxShadow !== "none") for (const m of cs.boxShadow.matchAll(/(?:^|,)\s*(?:(?:rgba?|hsla?|oklch|lab)\([^)]*\)\s*)?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/g)) { const [x, y, blur, spread] = m.slice(1).map(Number); if (!x && !y && !blur && spread > 0) for (const k in side) side[k] += spread; }
  // a thin pseudo-element bar along one side (an accent stripe)
  for (const p of ["::before", "::after"]) {
    const ps = getComputedStyle(el, p);
    if (ps.content === "none" || ps.display === "none" || !/absolute/.test(ps.position) || Number(ps.opacity) === 0) continue;
    if (A(ps.backgroundColor) < 0.1) continue;
    const h = parseFloat(ps.height), w = parseFloat(ps.width);
    if (h > 0 && h <= 6 && w >= 0.9 * r.width) { const top = parseFloat(ps.top); side[Number.isFinite(top) && top < r.height / 2 ? "top" : "bottom"] += h; }
    else if (w > 0 && w <= 6 && h >= 0.9 * r.height) { const left = parseFloat(ps.left); side[Number.isFinite(left) && left < r.width / 2 ? "left" : "right"] += w; }
  }
  return { side, x: r.left, y: r.top };
};
export async function hoverEdge(page, { max = 10 } = {}) {
  const n = await page.evaluate((max) => {
    const W = window;
    document.querySelectorAll("[data-bs-he]").forEach((e) => e.removeAttribute("data-bs-he"));
    let i = 0;
    for (const el of Array.from(document.querySelectorAll("a[href], [role=link], [role=button], button"))) {
      if (i >= max || !W.__uiVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 60) continue;
      const cs = getComputedStyle(el);
      const border = ["Top", "Right", "Bottom", "Left"].every((s) => parseFloat(cs[`border${s}Width`]) > 0);
      if (!border && cs.boxShadow === "none") continue;
      el.setAttribute("data-bs-he", String(i++));
    }
    return i;
  }, max).catch(() => 0);
  const hard = [], soft = [];
  for (let i = 0; i < n; i++) {
    const sel = `[data-bs-he="${i}"]`;
    const loc = page.locator(sel);
    await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
    await page.mouse.move(1, 1);
    await page.waitForTimeout(150);
    const rest = await page.evaluate(edgesFn, sel).catch(() => null);
    await loc.hover({ timeout: 1500 }).catch(() => { });
    await page.waitForTimeout(400);
    const now = await page.evaluate(edgesFn, sel).catch(() => null);
    await page.mouse.move(1, 1);
    if (!rest || !now) continue;
    const spread = (s) => Math.max(...Object.values(s)) - Math.min(...Object.values(s));
    const where = await page.evaluate((sel) => { const e = document.querySelector(sel); return { where: window.__uiDescribe(e), selector: window.__uiSelector(e), human: window.__uiHuman(e) }; }, sel).catch(() => ({ where: sel }));
    if (spread(rest.side) < 0.5 && spread(now.side) >= 1) {
      const s = now.side;
      hard.push({ ...where, what: `hover draws an uneven edge: top ${Math.round(s.top * 10) / 10}px, right ${Math.round(s.right * 10) / 10}px, bottom ${Math.round(s.bottom * 10) / 10}px, left ${Math.round(s.left * 10) / 10}px (even at rest) — one ring on all sides (outline / ring), no one-sided bar [1.6]` });
    }
    const moved = Math.hypot(now.x - rest.x, now.y - rest.y);
    if (moved >= 2) soft.push({ ...where, what: `hover moves the card by ${Math.round(moved)}px (transform) — the pointer slips off its target; show hover with colour / ring instead [1.6]` });
  }
  // one finding per look-alike (a grid of cards that all lift is one cause)
  const group = (list) => { const m = new Map(); for (const f of list) { const k = `${f.what}|${String(f.where).replace(/"[^"]*"$/, "").replace(/li(\.[\w:-]+)?/g, "li")}`; if (!m.has(k)) m.set(k, { ...f, n: 0 }); m.get(k).n++; } return [...m.values()].map(({ n, ...f }) => (n > 1 ? { ...f, what: `${f.what} (and ${n - 1} more like it)` } : f)); };
  return { hard: group(hard), soft: group(soft) };
}

/* ───────── 1.11 one brand mark: footer = header, favicon = the mark, manifest = the brand (Kindred kytm39, bmlrc4) ───────── */
export async function brandMark(page, { brandTerms = [] } = {}) {
  return page.evaluate(async (brandTerms) => {
    const W = window;
    const hard = [], soft = [], eye = [];
    const homeLink = (root) => root ? Array.from(root.querySelectorAll("a[href]")).find((a) => { try { const u = new URL(a.href, location.href); return u.pathname === "/" && u.origin === location.origin && W.__uiVisible(a) && !W.__uiBackLink(a); } catch { return false; } }) : null;
    const header = Array.from(document.querySelectorAll("header, [role=banner]")).find((h) => W.__uiVisible(h));
    const footer = Array.from(document.querySelectorAll("footer, [role=contentinfo]")).filter((f) => W.__uiVisible(f)).pop();
    const hl = homeLink(header), fl = homeLink(footer);
    const sig = (a) => {
      const svg = a.querySelector("svg"), img = a.querySelector("img");
      const shapes = svg ? Array.from(svg.querySelectorAll("path, circle, rect, polygon, ellipse, line, polyline")).map((s) => s.tagName === "path" ? `p:${(s.getAttribute("d") || "").replace(/\s+/g, " ").trim().slice(0, 200)}` : `${s.tagName}:${["cx", "cy", "r", "x", "y", "width", "height", "points"].map((k) => s.getAttribute(k) || "").join(",")}`) : [];
      return { svg, img, shapes, src: img ? (img.currentSrc || img.src).split("/").pop().split("?")[0] : null, text: (a.innerText || "").trim().toLowerCase() };
    };
    if (hl && fl) {
      const h = sig(hl), f = sig(fl);
      if ((h.svg || h.img) && !(f.svg || f.img)) hard.push({ what: "the footer logo is a different mark from the header's: the header shows the logo image, the footer only text / a drawn stand-in — use the same mark in both [1.11]", where: W.__uiDescribe(fl), selector: W.__uiSelector(fl), human: W.__uiHuman(fl) });
      else if (h.svg && f.svg) {
        const a = new Set(h.shapes), b = new Set(f.shapes);
        const share = [...a].filter((x) => b.has(x)).length / Math.max(1, Math.max(a.size, b.size));
        if (a.size && share < 0.8) hard.push({ what: `the footer logo's drawing differs from the header's (${Math.round(share * 100)}% of the shapes shared) — one mark everywhere [1.11]`, where: W.__uiDescribe(fl), selector: W.__uiSelector(fl), human: W.__uiHuman(fl) });
      } else if (h.img && f.img && h.src !== f.src && !(f.svg || h.svg)) hard.push({ what: `the footer logo (${f.src}) is another file than the header's (${h.src}) — one mark everywhere [1.11]`, where: W.__uiDescribe(fl), selector: W.__uiSelector(fl), human: W.__uiHuman(fl) });
    }
    // the dominant hue of a picture (non-neutral pixels)
    const hueOf = async (src) => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; setTimeout(rej, 4000); });
        const cv = document.createElement("canvas"); cv.width = cv.height = 32;
        const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, 32, 32);
        const d = cx.getImageData(0, 0, 32, 32).data;
        const bins = new Array(36).fill(0);
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]].map((v) => v / 255);
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
          if (dd < 0.2) continue;
          let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; if (h < 0) h += 360;
          bins[Math.floor(h / 10) % 36]++;
        }
        const tot = bins.reduce((a, b) => a + b, 0);
        if (tot < 20) return null;
        return bins.indexOf(Math.max(...bins)) * 10 + 5;
      } catch { return null; }
    };
    const iconLink = Array.from(document.querySelectorAll("link[rel~=icon]")).find((l) => l.href);
    const favSrc = iconLink ? iconLink.href : new URL("/favicon.ico", location.href).href;
    let markSrc = null;
    const hs = hl && (hl.querySelector("svg") || hl.querySelector("img"));
    if (hs && hs.tagName.toLowerCase() === "svg") { const clone = hs.cloneNode(true); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); const cs = getComputedStyle(hs); if (!clone.getAttribute("fill") && cs.fill) clone.setAttribute("fill", cs.fill); markSrc = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(clone.outerHTML); }
    else if (hs) markSrc = hs.currentSrc || hs.src;
    if (markSrc && hs) {
      const [a, b] = [await hueOf(markSrc), await hueOf(favSrc)];
      if (a != null && b != null) {
        const d = Math.abs(a - b) % 360, diff = d > 180 ? 360 - d : d;
        if (diff > 40) hard.push({ what: `the browser-tab icon (${favSrc.split("/").pop()}) is not the site's mark: its colour (hue ${b}°) is not the logo's (hue ${a}°) — make the favicon from the logo [1.11]`, where: "<link rel=icon>" });
      } else eye.push({ what: "favicon vs the header mark: no colour to compare (a monochrome or text logo) — check the tab icon by eye [1.11]", where: "<link rel=icon>" });
    }
    // the web manifest names the brand
    const ml = document.querySelector("link[rel=manifest]");
    const cands = ml ? [ml.href] : ["/site.webmanifest", "/manifest.json", "/manifest.webmanifest"].map((p) => new URL(p, location.href).href);
    let man = null;
    for (const u of cands) { try { const r = await fetch(u); if (r.ok && /json|manifest/.test(r.headers.get("content-type") || "") || (r.ok && u.endsWith("manifest"))) { man = await r.json(); break; } } catch {} }
    if (man && (man.name || man.short_name)) {
      const tok = (s) => String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
      const brand = new Set([...tok(document.querySelector("meta[property='og:site_name']")?.content), ...tok(document.title.split(/[|·—–-]/).pop()), ...tok(hl?.innerText), ...tok(hl?.getAttribute("aria-label")), ...tok(hl?.querySelector("img")?.alt), ...brandTerms.flatMap(tok)]);
      const m = [...tok(man.name), ...tok(man.short_name)];
      if (brand.size && m.length && !m.some((w) => brand.has(w))) hard.push({ what: `the web manifest names the app "${man.name || man.short_name}", not this brand — a phone's home-screen icon would carry another product's name [1.11]`, where: ml ? ml.getAttribute("href") : "manifest" });
    }
    return { hard, soft, eye };
  }, brandTerms);
}

/* ───────── B5 the top-up dialog: the custom amount is a tile like the packages (Kindred c25ux3) ───────── */
export const customAmountTile = (page, { customAmount = true } = {}) => page.evaluate((customAmount) => {
  const W = window;
  const out = [];
  const AMOUNT = /(\d[\d,. ]*\s*(credits?|кредит\w*|kredit\w*))|([$€£₽₸₼]\s?\d)|(\d\s?[$€£₽₸₼])/i;
  for (const d of Array.from(document.querySelectorAll("[role=dialog], dialog[open]")).filter((x) => W.__uiVisible(x))) {
    const look = (el) => { const cs = getComputedStyle(el); return { bw: parseFloat(cs.borderTopWidth) || 0, bs: cs.borderTopStyle, rad: parseFloat(cs.borderTopLeftRadius) || 0, pad: parseFloat(cs.paddingTop) || 0 }; };
    const tiles = Array.from(d.querySelectorAll("button, [role=radio], label")).filter((t) => W.__uiVisible(t) && AMOUNT.test(t.innerText || "") && !t.querySelector("input:not([type=radio]):not([type=hidden])"));
    const groups = new Map();
    for (const t of tiles) { const l = look(t); const k = `${l.bw}|${l.bs}|${Math.round(l.rad)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ t, l }); }
    const pack = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    if (!pack || pack.length < 2) continue;
    const L = pack[0].l;
    const inp = Array.from(d.querySelectorAll("input")).find((i) => W.__uiVisible(i) && (i.type === "number" || /numeric|decimal/.test(i.inputMode || "") || /amount|credit|custom|сумм|məbləğ|сома/i.test(`${i.placeholder} ${i.name} ${i.id} ${i.getAttribute("aria-label") || ""}`)));
    if (!inp) {
      if (customAmount) out.push({ hard: true, what: `the top-up dialog offers ${pack.length} packages and no custom amount — add a "Custom" tile with an amount field among them (or acceptance.customAmount: false) [B5]`, where: W.__uiDescribe(d), selector: W.__uiSelector(d), human: W.__uiHuman(d) });
      continue;
    }
    let match = null, near = null;
    for (let p = inp.parentElement; p && p !== d; p = p.parentElement) {
      const l = look(p);
      const same = Math.abs(l.rad - L.rad) <= 2 && Math.abs(l.pad - L.pad) <= 4 && l.bs === L.bs;
      if (same && l.bw === L.bw) { match = p; break; }
      if (same && l.bw > 0) { near = p; break; }
    }
    if (match) continue;
    const f = { what: near ? `the custom amount tile is drawn like the packages but with a ${look(near).bw}px border (theirs ${L.bw}px) [B5]` : `the custom amount is a field under the packages, not a tile among them — put it in the grid as a "Custom" tile drawn like the ${pack.length} packages (border, radius, padding) [B5]`, where: W.__uiDescribe(inp.parentElement || inp), selector: W.__uiSelector(inp), human: W.__uiHuman(inp.parentElement || inp) };
    out.push({ ...f, hard: !near });
  }
  return out;
}, customAmount);
