// 5.5.0 — rhythm and alignment checks that the Praxis, Parallel and Compass cards were filed for (misses/*.md, issue
// rounds of 2026-10-16…21). Each function measures rendered glyphs (Range rects) and boxes, never class names:
//   2.5  a money / credits range split across lines at its dash (Compass 34ebhu, rqgkrl, 9rkp6z, ct4lge, 69q0rj);
//        a heading with a forced break whose segment wraps, or 3+ unbalanced lines (Parallel c7p1wg);
//        the brand name in the home link on one line (Kindred spdonv)
//   2.6  one short slot wraps in a row of equal cards (Praxis ysspcg); buttons stacked on a phone share one width
//        (Parallel 2jsnme); vertical dividers left on a stacked strip (Praxis qgevme)
//   2.7  a timeline marker / a badge level with its label (Praxis 1r8w0p, Parallel m0oxf9); the side nav and the content
//        start on one line (Praxis dbrs0h); fields in one row share a top (Compass spixep); a heading lined up with a
//        list's decorative rule, not its text (Compass zk611j, soft)
//   2.11 glyphs of two texts overlap, anywhere on the page (Compass akf9f4, 2qp6hw, 3ypscy)
//   2.12 one slot of repeated rows wraps / sits higher (Praxis tjm4fx); a key–value row breaks its list's pattern
//        (Compass 69q0rj, x2okne, k25bx0, 25x6e8)
//   2.17 one content width per page (Parallel 1xtxc4)
//   2.21 text squeezed into one-word lines (Compass akf9f4, 2qp6hw, 3ypscy, 25x6e8)
//   2.22 two-column blocks share one alignment rule (Compass 1wq9va, 76glyk, uiv7nb, 2ghvum, tp3fvq, khokf3)
//   2.23 even rhythm in a list or a row of options (Compass xfm2up, iiy7tk)
//   6.5  section headings of one look share one alignment on a page (Parallel k6c1vm)
// Findings follow ../checks.js ({ what, where, selector, human }); needs checks.install(page).

const HELPERS = () => {
  if (window.__bsR) return;
  const W = window;
  const vis = (el) => !!el && W.__uiVisible(el);
  const cs = (el) => getComputedStyle(el);
  const painted = (el) => { const s = cs(el); return W.__uiRGBA(s.backgroundColor)[3] > 0.05 || s.backgroundImage !== "none" || ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== "none" && W.__uiRGBA(s[`border${k}Color`])[3] > 0.05); };
  const bg = (el) => W.__uiRGBA(cs(el).backgroundColor)[3] > 0.05 || cs(el).backgroundImage !== "none";
  const sig = (el) => `${el.tagName}|${(el.getAttribute("class") || "").trim().split(/\s+/).filter((c) => !/^(active|selected|current|is-|data-)/.test(c)).sort().join(".")}`;
  const SKIP = "script, style, noscript, template, svg, [aria-hidden=true], .sr-only";
  const textNodes = (root) => {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && n.parentElement && !n.parentElement.closest(SKIP) ? 1 : 2) });
    for (let n = w.nextNode(); n; n = w.nextNode()) if (vis(n.parentElement)) out.push(n);
    return out;
  };
  const rectsOf = (node, start = 0, end = node.nodeValue.length) => { const r = document.createRange(); r.setStart(node, start); r.setEnd(node, end); return Array.from(r.getClientRects()).filter((x) => x.width > 0.5 && x.height > 0.5); };
  // line boxes of the glyphs: rects grouped by their vertical centre (a line = rects within 3px of each other)
  const linesOf = (rects) => {
    const lines = [];
    for (const r of [...rects].sort((a, b) => a.top - b.top || a.left - b.left)) {
      const c = (r.top + r.bottom) / 2;
      const l = lines.find((x) => Math.abs(x.c - c) <= Math.max(3, r.height * 0.3));
      if (l) { l.left = Math.min(l.left, r.left); l.right = Math.max(l.right, r.right); l.top = Math.min(l.top, r.top); l.bottom = Math.max(l.bottom, r.bottom); l.n++; }
      else lines.push({ c, top: r.top, bottom: r.bottom, left: r.left, right: r.right, n: 1 });
    }
    return lines.sort((a, b) => a.top - b.top);
  };
  const inkRects = (el) => textNodes(el).flatMap((n) => rectsOf(n));
  const lineCount = (el) => linesOf(inkRects(el)).length;
  const firstInk = (el) => { for (const n of textNodes(el)) { const r = rectsOf(n)[0]; if (r) return r; } return null; };
  const words = (el) => (el.innerText || "").trim().split(/\s+/).filter(Boolean).length;
  const f = (el, what) => ({ what, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  const kids = (el) => Array.from(el.children).filter((k) => vis(k) && !["absolute", "fixed"].includes(cs(k).position));
  const sib = (el) => kids(el);
  /** runs of ≥ min consecutive visible siblings with one class signature */
  const runs = (parent, min = 3) => {
    const out = []; let cur = [];
    for (const k of kids(parent)) { if (cur.length && sig(cur[0]) === sig(k)) cur.push(k); else { if (cur.length >= min) out.push(cur); cur = [k]; } }
    if (cur.length >= min) out.push(cur);
    return out;
  };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
  const mode = (a) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1])[0]; };
  const fixedLayer = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (/fixed|sticky/.test(cs(e).position)) return true; return false; };
  window.__bsR = { vis, cs, painted, bg, sig, textNodes, rectsOf, linesOf, inkRects, lineCount, firstInk, words, f, kids, sib, runs, median, mode, fixedLayer };
};
const ensure = (page) => page.evaluate(HELPERS);

/* ─────────────── 2.5 ─────────────── */

/** 2.5 — a money / credits range ("€44.54–€98", "125–180 cr") whose glyphs sit on two lines. */
export async function rangeSplit(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    const CUR = "[€$£₼₸₽¥₹]";
    const AMT = `(?:${CUR}\\s?\\d[\\d.,\\u00a0\\u202f]*\\d|${CUR}\\s?\\d|\\d[\\d.,\\u00a0\\u202f]*\\d|\\d)`;
    const UNIT = `(?:\\s?(?:${CUR}|cr\\b|credits?\\b|kr\\b|kredit\\p{L}*|кредит\\p{L}*|\\/\\s?h(?:r|our)?\\b))`;
    const RE = new RegExp(`${AMT}${UNIT}?\\s?[–—-]\\s?${AMT}${UNIT}?`, "gu");
    const HAS = new RegExp(`${CUR}|\\b(cr|credits?|kr)\\b|kredit|кредит|\\/\\s?h`, "iu");
    const seen = new Set();
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.closest("script, style, noscript, template, svg, [aria-hidden=true]") || !R.vis(el)) continue;
      if ((el.textContent || "").length > 400) continue;
      // the element's text, with a separator between texts of different blocks / flex items ("$60–$95" + "600–950"
      // in two cells is not the range "$60–$95600")
      const nodes = []; let t = "";
      const blockOf = (n) => { for (let e = n.parentElement; e && e !== el.parentElement; e = e.parentElement) if (!/^(inline|contents)$/.test(R.cs(e).display)) return e; return el; };
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(), prev = null; n; n = w.nextNode()) { if (prev && blockOf(prev) !== blockOf(n)) t += "\u0000"; nodes.push({ n, at: t.length }); t += n.nodeValue; prev = n; }
      if (!/\d\s?[–—-]\s?\D?\d|\d\s?[–—-]\s?[€$£₼₸₽]/.test(t)) continue;
      for (const m of t.matchAll(RE)) {
        if (!HAS.test(m[0]) || /^\d{4}\s?[–—-]\s?\d{4}$/.test(m[0].trim())) continue;
        // the smallest element that holds the whole range
        if (Array.from(el.children).some((c) => (c.textContent || "").includes(m[0]))) continue;
        const rects = [];
        for (const { n, at } of nodes) {
          const a = at, b = at + n.nodeValue.length;
          const s0 = Math.max(m.index, a), e = Math.min(m.index + m[0].length, b);
          if (s0 < e && R.vis(n.parentElement)) rects.push(...R.rectsOf(n, s0 - a, e - a));
        }
        const lines = R.linesOf(rects);
        const key = `${m[0]}|${Math.round(rects[0]?.top || 0)}`;
        if (lines.length > 1 && !seen.has(key)) {
          seen.add(key);
          out.push(R.f(el, `range split across lines: "${m[0].replace(/\s+/g, " ")}" breaks after "${(() => { const first = rects.filter((r) => Math.abs((r.top + r.bottom) / 2 - lines[0].c) < 3); return first.length ? m[0].slice(0, Math.max(1, Math.round(m[0].length * (first.reduce((s, r) => s + r.width, 0) / rects.reduce((s, r) => s + r.width, 0))))) : m[0]; })()}" at ${innerWidth}px — keep a range on one line (white-space: nowrap on the range, or a no-break space / U+2060 around the dash) [2.5]`));
        }
      }
    }
    return out;
  });
}

/** 2.5 — a heading with a forced break (<br>, a block span) whose segment wraps into a one-word / short line; or 3+ lines that text-wrap: balance would even out (phones). */
export async function headingBalance(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    for (const h of Array.from(document.querySelectorAll("h1, h2, h3"))) {
      if (!R.vis(h) || h.closest("nav, header [role=menu]")) continue;
      const wordRects = [];
      for (const n of R.textNodes(h)) for (const m of n.nodeValue.matchAll(/\S+/g)) { const r = R.rectsOf(n, m.index, m.index + m[0].length); if (r[0]) wordRects.push({ ...r[0].toJSON(), w: m[0] }); }
      if (wordRects.length < 3) continue;
      const lines = R.linesOf(wordRects).map((l) => ({ ...l, words: wordRects.filter((r) => Math.abs((r.top + r.bottom) / 2 - l.c) <= Math.max(3, (r.bottom - r.top) * 0.3)).length }));
      if (lines.length < 2) continue;
      const forced = Array.from(h.querySelectorAll("br")).filter((b) => R.cs(b).display !== "none").length + Array.from(h.querySelectorAll("span, em, strong, b, i")).filter((s) => R.vis(s) && R.cs(s).display === "block").length;
      const widths = lines.map((l) => l.right - l.left), max = Math.max(...widths);
      const segments = forced ? (Array.from(h.querySelectorAll("span, em, strong, b, i")).some((s) => R.cs(s).display === "block") ? Math.max(2, Array.from(h.querySelectorAll("span, em, strong, b, i")).filter((s) => R.vis(s) && R.cs(s).display === "block").length) : forced + 1) : 1;
      if (forced && lines.length > segments) {
        const bad = lines.find((l, i) => l.words === 1 || (l.right - l.left) < 0.35 * max);
        if (bad) { out.push(R.f(h, `heading "${(h.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60)}" has a forced line break and still wraps: ${lines.length} lines, one of ${bad.words} word${bad.words > 1 ? "s" : ""} — drop the <br> below the breakpoint where it fits (hidden on phones), or let text-wrap: balance place the breaks [2.5]`)); continue; }
      }
      const tw = R.cs(h).textWrap || R.cs(h).textWrapStyle || "";
      if (!forced && lines.length >= 3 && !/balance|pretty/.test(tw)) {
        const ratio = Math.min(...widths) / max;
        if (ratio >= 0.4) continue;
        const c = h.cloneNode(true);
        const s = R.cs(h);
        c.style.cssText = `position:absolute;left:-10000px;top:0;width:${h.getBoundingClientRect().width}px;font:${s.font};letter-spacing:${s.letterSpacing};text-transform:${s.textTransform};text-wrap:balance;margin:0;padding:${s.padding}`;
        h.parentElement.appendChild(c);
        const cl = R.linesOf(R.inkRects(c));
        const cw = cl.map((l) => l.right - l.left);
        const cratio = cw.length ? Math.min(...cw) / Math.max(...cw) : 0;
        c.remove();
        if (cl.length === lines.length && cratio >= 0.6) out.push(R.f(h, `heading "${(h.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60)}" breaks into ${lines.length} unbalanced lines (shortest ${Math.round(ratio * 100)}% of the longest) — text-wrap: balance on headings evens them out [2.5]`));
      }
    }
    return out;
  });
}

/** 2.5 — the brand name in a link to the home page renders on one line, at every width. */
export async function brandOneLine(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    const home = Array.from(document.querySelectorAll("a[href]")).filter((a) => { try { const u = new URL(a.href); return u.origin === location.origin && /^\/([a-z]{2}(-[A-Za-z]{2})?\/?)?$/.test(u.pathname) && a.closest("header, nav, aside, footer, [role=banner], [role=navigation]"); } catch { return false; } });
    for (const a of home) {
      if (!R.vis(a)) continue;
      for (const n of R.textNodes(a)) {
        const t = n.nodeValue.trim();
        if (!t || t.split(/\s+/).length > 3 || t.length > 32) continue;
        const lines = R.linesOf(R.rectsOf(n));
        if (lines.length > 1) { out.push(R.f(n.parentElement, `the brand name "${t}" wraps onto ${lines.length} lines at ${innerWidth}px — keep the wordmark on one line (white-space: nowrap; flex-shrink: 0 on it) [2.5]`)); break; }
      }
    }
    return out;
  });
}

/* ─────────────── 2.6 ─────────────── */

/** 2.6 / 2.12 — in a row of equal cards or repeated rows, a short slot wraps while the others fit one line; in rows, a slot sits higher / lower than in the others. */
export async function slotWraps(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, hard = [];
    const short = (t) => { const s = t.trim(); return s && (s.split(/\s+/).length <= 3 || s.length <= 24 || (/\d/.test(s) && s.length <= 32)) && s.length <= 40; };
    const done = new Set();
    for (const parent of [document.body, ...document.querySelectorAll("body *")]) {
      if (parent.children.length < 3 || !R.vis(parent) || parent.closest("nav, header, footer, table, [role=menu], [role=listbox], select")) continue;
      for (const items of R.runs(parent, 3)) {
        const boxes = items.map((x) => x.getBoundingClientRect());
        const inRow = boxes.every((b) => Math.abs(b.top - boxes[0].top) < 4);
        const stacked = !inRow && boxes.every((b, i) => i === 0 || (b.top >= boxes[i - 1].bottom - 2 && Math.abs(b.left - boxes[0].left) < 4));
        if (!inRow && !stacked) continue;
        // slots: leaf-ish elements with own text, keyed by their path of child indexes
        const slots = new Map();
        items.forEach((it, idx) => {
          const walk = (el, path) => {
            const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim());
            if (own && R.vis(el)) { const k = path.join("/"); if (!slots.has(k)) slots.set(k, []); slots.get(k)[idx] = el; }
            Array.from(el.children).forEach((c, i) => { if (!/^(SVG|SCRIPT|STYLE)$/i.test(c.tagName)) walk(c, [...path, `${c.tagName}${i}`]); });
          };
          walk(it, []);
        });
        for (const [k, els] of slots) {
          const present = els.filter(Boolean);
          if (present.length < 3 || present.length < items.length) continue;
          if (!present.every((e) => short(e.innerText || ""))) continue;
          const n = present.map((e) => R.lineCount(e));
          const ones = n.filter((x) => x === 1).length;
          const wrapped = present.filter((e, i) => n[i] >= 2);
          if (wrapped.length && ones >= 2 && ones > present.length / 2) {
            const e = wrapped[0];
            const key = `w|${R.sig(e)}|${k}`;
            if (done.has(key)) continue;
            done.add(key);
            hard.push(R.f(e, `"${(e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)}" wraps to ${n[present.indexOf(e)]} lines while ${ones} of its ${present.length} siblings (${present.filter((x, i) => n[i] === 1).slice(0, 3).map((x) => `"${(x.innerText || "").trim().slice(0, 20)}"`).join(", ")}) fit one line — give the slot room for its longest label (a wider column, white-space: nowrap, a shorter word) [${inRow ? "2.6" : "2.12"}]`));
            continue;
          }
          if (stacked && boxes.every((b) => b.height <= 80) && items.every((it) => /flex|grid/.test(R.cs(it).display))) {
            const off = present.map((e, i) => e.getBoundingClientRect().top - boxes[items.indexOf(items.find((it) => it.contains(e)))].top);
            const med = R.median(off);
            const odd = present.filter((e, i) => Math.abs(off[i] - med) > 6);
            if (odd.length && odd.length <= present.length / 3) {
              const e = odd[0];
              const key = `t|${R.sig(e)}|${k}`;
              if (done.has(key)) continue;
              done.add(key);
              hard.push(R.f(e, `"${(e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)}" starts ${Math.round(Math.abs(off[present.indexOf(e)] - med))}px ${off[present.indexOf(e)] < med ? "above" : "below"} where the same slot starts in the other rows — one row, one top for each column [2.12]`));
            }
          }
        }
      }
    }
    return hard;
  });
}

/** 2.6 — buttons stacked on a phone share one width (or all fill the row). */
export async function stackedWidths(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    if (innerWidth > 480) return out;
    const isBtn = (e) => R.vis(e) && (e.innerText || "").trim().length > 1 && e.getBoundingClientRect().width >= 48 && R.painted(e);
    const parents = new Set(Array.from(document.querySelectorAll("a, button, [role=button]")).filter(isBtn).map((b) => b.parentElement));
    for (const p of parents) {
      if (!p || p.closest("nav, [role=menu], [role=toolbar], [role=tablist]")) continue;
      const btns = Array.from(p.children).filter((e) => e.matches("a, button, [role=button]") && isBtn(e));
      if (btns.length < 2) continue;
      const bs = btns.map((b) => b.getBoundingClientRect());
      for (let i = 1; i < btns.length; i++) {
        const a = bs[i - 1], b = bs[i];
        const xo = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (xo < 0.5 * Math.min(a.width, b.width) || b.top < a.bottom - 1) continue;
        const pc = p.getBoundingClientRect(), ps = R.cs(p);
        const inner = pc.width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
        if (Math.abs(a.width - b.width) > 8 && !(a.width >= 0.98 * inner && b.width >= 0.98 * inner)) {
          out.push(R.f(btns[i], `stacked buttons of different widths at ${innerWidth}px: "${(btns[i - 1].innerText || "").trim().slice(0, 24)}" ${Math.round(a.width)}px over "${(btns[i].innerText || "").trim().slice(0, 24)}" ${Math.round(b.width)}px — give stacked buttons one width (align-items: stretch / w-full) [2.6]`));
          break;
        }
      }
    }
    return out;
  });
}

/** 2.6 — a divide-x strip that stacks keeps its vertical rules: they separate nothing. */
export async function stackedDividers(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    for (const p of [document.body, ...document.querySelectorAll("body *")]) {
      if (p.children.length < 3 || !R.vis(p)) continue;
      const ks = R.kids(p);
      if (ks.length < 3) continue;
      const side = (e, s) => { const c = R.cs(e); return parseFloat(c[`border${s}Width`]) > 0 && c[`border${s}Style`] !== "none" && R.cs(e)[`border${s}Color`]; };
      const pattern = (s, skip) => { const rest = ks.filter((_, i) => i !== skip); return !side(ks[skip], s) && rest.every((e) => side(e, s)) && new Set(rest.map((e) => `${R.cs(e)[`border${s}Width`]}|${side(e, s)}`)).size === 1; };
      const left = pattern("Left", 0), right = pattern("Right", ks.length - 1);
      if (!left && !right) continue;
      const bs = ks.map((k) => k.getBoundingClientRect());
      const stacked = bs.every((b, i) => i === 0 || (Math.abs(b.left - bs[0].left) <= 2 && b.top >= bs[i - 1].bottom - 1));
      if (stacked) out.push(R.f(p, `vertical dividers (border-${left ? "left" : "right"}) on a strip that stacks at ${innerWidth}px — they separate nothing; switch to horizontal rules when it stacks (flex-col divide-y sm:flex-row sm:divide-y-0 sm:divide-x) [2.6]`));
    }
    return out;
  });
}

/* ─────────────── 2.7 ─────────────── */

/** 2.7 — a decorative marker (timeline dot) level with the label it marks; a badge level with its one-line label. */
export async function markerBadgeLevel(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    const done = new Set();
    // (a) markers in repeated list items
    for (const p of Array.from(document.querySelectorAll("ol, ul, [role=list], div, section"))) {
      for (const items of R.runs(p, 3)) {
        const offs = [];
        let mk0 = null;
        for (const it of items) {
          const mk = Array.from(it.querySelectorAll("*")).find((e) => { const b = e.getBoundingClientRect(); const s = R.cs(e); return b.width >= 4 && b.width <= 24 && Math.abs(b.width - b.height) <= 2 && !(e.innerText || "").trim() && e.children.length === 0 && (parseFloat(s.borderTopLeftRadius) >= b.width / 2 - 1 || /50%/.test(s.borderTopLeftRadius)) && R.painted(e) && R.cs(e).display !== "none"; });
          if (!mk) { offs.push(null); continue; }
          const lab = R.textNodes(it).find((n) => !mk.contains(n));
          const r = lab && R.rectsOf(lab)[0];
          if (!r) { offs.push(null); continue; }
          const m = mk.getBoundingClientRect();
          const mc = (m.top + m.bottom) / 2, lc = (r.top + r.bottom) / 2;
          // a dot on the top edge of the item's card is a connector into the card, not a marker of the label
          const card = Array.from(it.querySelectorAll("*")).find((e) => e !== mk && !e.contains(mk) && R.painted(e) && e.getBoundingClientRect().height > 24);
          if (card && Math.abs(mc - card.getBoundingClientRect().top) <= 2) { offs.push(0); continue; }
          offs.push(Math.abs(mc - lc) > Math.max(4, (r.bottom - r.top) / 2) ? mc - lc : 0);
          mk0 ||= mk;
        }
        const bad = offs.filter((x) => x);
        if (bad.length >= 2 && bad.length >= offs.filter((x) => x !== null).length / 2 && mk0 && !done.has(p)) {
          done.add(p);
          out.push(R.f(mk0, `the list markers sit ${Math.round(Math.abs(R.median(bad)))}px ${R.median(bad) < 0 ? "above" : "below"} the first line of the label they mark (${bad.length} of ${items.length} items) — centre each marker on its label's first line [2.7]`));
        }
      }
    }
    // (b) a badge beside a one-line label in a row that does not centre them
    for (const row of Array.from(document.querySelectorAll("body *"))) {
      const s = R.cs(row);
      if (!/flex/.test(s.display) || /column/.test(s.flexDirection) || /center|baseline/.test(s.alignItems) || !R.vis(row)) continue;
      const ks = R.kids(row).filter((k) => (k.innerText || "").trim());
      if (ks.length !== 2) continue;
      const [a, b] = ks;
      const isBadge = (e) => { const t = (e.innerText || "").trim(); return t.split(/\s+/).length <= 3 && t.length <= 24 && (R.painted(e) || R.cs(e).textTransform === "uppercase") && R.lineCount(e) === 1 && !/center|baseline/.test(R.cs(e).alignSelf); };
      const badge = isBadge(b) ? b : isBadge(a) ? a : null;
      const label = badge === b ? a : b;
      if (!badge || R.lineCount(label) !== 1 || label.querySelector("input, select, textarea, button")) continue;
      const fa = R.cs(label), fb = R.cs(badge);
      if (fa.fontSize === fb.fontSize && fa.lineHeight === fb.lineHeight && !R.painted(badge)) continue;
      const la = R.firstInk(label), lb = R.firstInk(badge);
      if (!la || !lb) continue;
      const d = (la.top + la.bottom) / 2 - (lb.top + lb.bottom) / 2;
      if (Math.abs(d) > 2) out.push(R.f(badge, `"${(badge.innerText || "").trim()}" sits ${Math.round(Math.abs(d))}px ${d > 0 ? "above" : "below"} the line of "${(label.innerText || "").trim().slice(0, 30)}" — centre the row (items-center) or align on the baseline (items-baseline) [2.7]`));
    }
    return out;
  });
}

/** 2.7 — in an app shell (side nav beside the content), the nav's first line and the content's first line start level. Returns { hard, shell } — shell.contentTop for the site-wide comparison. */
export async function shellTops(page) {
  await ensure(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const R = window.__bsR, hard = [];
    let shell = null;
    for (const c of Array.from(document.querySelectorAll("body *"))) {
      const s = R.cs(c);
      if (!/grid|flex/.test(s.display) || /column/.test(s.flexDirection) || !R.vis(c)) continue;
      const ks = R.kids(c);
      if (ks.length < 2 || ks.length > 3) continue;
      const nav = ks.find((k) => (k.matches("nav, aside") || k.querySelector(":scope > nav, :scope > aside, :scope > div > nav")) && k.querySelectorAll("a[href]").length >= 3);
      const main = ks.find((k) => k !== nav && k.getBoundingClientRect().width > 0.4 * c.getBoundingClientRect().width);
      if (!nav || !main || nav.getBoundingClientRect().width > 0.4 * c.getBoundingClientRect().width) continue;
      // under the site header (not the full-height app frame with the logo on top), and no logo in the nav column
      if (c.getBoundingClientRect().top + scrollY < 40 || nav.querySelector("img, svg") && nav.querySelector("a[href='/']")) continue;
      const a = R.firstInk(nav), b = R.firstInk(main);
      if (!a || !b) continue;
      const d = b.top - a.top;
      shell = { contentTop: Math.round(b.top + scrollY), navTop: Math.round(a.top + scrollY), where: window.__uiDescribe(c) };
      if (Math.abs(d) >= 4 && Math.abs(d) <= 96) hard.push(R.f(main, `the content starts ${Math.round(Math.abs(d))}px ${d > 0 ? "below" : "above"} the side nav's first line ("${(nav.innerText || "").trim().split("\n")[0].slice(0, 24)}" vs "${(main.innerText || "").trim().split("\n")[0].slice(0, 24)}") — start both columns on one line [2.7]`));
      break;
    }
    return { hard, shell };
  });
}
/** 2.7 site-wide — the content of every page with the same shell starts at one height. [{ route, shell }] → findings */
export function shellTopsAcross(list) {
  const with_ = list.filter((x) => x.shell);
  if (with_.length < 2) return [];
  const m = new Map(); for (const x of with_) m.set(x.shell.contentTop, (m.get(x.shell.contentTop) || 0) + 1);
  const top = [...m].sort((a, b) => b[1] - a[1])[0][0];
  return with_.filter((x) => Math.abs(x.shell.contentTop - top) > 4).map((x) => ({ what: `the page content starts at ${x.shell.contentTop}px on ${x.route} and at ${top}px on the other account pages — one shell, one content top [2.7]`, where: `${x.route} ${x.shell.where}` }));
}

/** 2.7 — fields that share a row share a top; (soft) a heading lined up with a list's decorative rule instead of its text. */
export async function fieldTops(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, hard = [], soft = [];
    const FIELDS = "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), select, textarea, button[role=combobox]";
    const name = (e) => (e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.name || "field").trim().split("\n")[0].slice(0, 30);
    const seen = new Set();
    // the cells of one form row (a grid / flex row whose children each hold one field): their fields share a top
    for (const row of Array.from(document.querySelectorAll("form *, [role=form] *, fieldset *"))) {
      const s = R.cs(row);
      if (!/grid|flex/.test(s.display) || /column/.test(s.flexDirection) || !R.vis(row)) continue;
      const cells = R.kids(row).map((k) => ({ k, b: k.getBoundingClientRect(), f: (k.matches(FIELDS) ? [k] : Array.from(k.querySelectorAll(FIELDS))).filter((e) => R.vis(e) && e.getBoundingClientRect().width > 40) })).filter((x) => x.f.length === 1 && !x.k.querySelector("input[type=checkbox], input[type=radio]"));
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        if (Math.abs(a.b.top - b.b.top) > 4 || Math.max(a.b.left, b.b.left) < Math.min(a.b.right, b.b.right) - 1) continue;
        const fa = a.f[0].getBoundingClientRect(), fb = b.f[0].getBoundingClientRect();
        const dy = fb.top - fa.top;
        const lower = dy > 0 ? b.f[0] : a.f[0], upper = lower === b.f[0] ? a.f[0] : b.f[0];
        if (Math.abs(dy) > 2 && !seen.has(lower)) { seen.add(lower); hard.push(R.f(lower, `"${name(lower)}" sits ${Math.round(Math.abs(dy))}px lower than "${name(upper)}" in the same row — fields of one row share a top (move the hint under the field, or reserve the same space above both) [2.7]`)); }
      }
    }
    // (b) a caption whose left edge is the list's rule, while the items' text starts 12–24px further in
    for (const list of Array.from(document.querySelectorAll("ul, ol, [role=list], div"))) {
      const items = R.kids(list);
      if (items.length < 2 || !R.vis(list)) continue;
      const bl = items.map((it) => parseFloat(R.cs(it).borderLeftWidth) || 0);
      if (!bl.every((x) => x > 0)) continue;
      const prev = list.previousElementSibling;
      if (!prev || !R.vis(prev) || !(prev.innerText || "").trim()) continue;
      const pi = R.firstInk(prev), ii = R.firstInk(items[0]);
      const lb = items[0].getBoundingClientRect().left;
      if (!pi || !ii) continue;
      const inset = ii.left - lb;
      if (Math.abs(pi.left - lb) <= 2 && inset >= 12 && inset <= 24) soft.push(R.f(prev, `"${(prev.innerText || "").trim().slice(0, 30)}" lines up with the list's left rule, not with the text of its items (${Math.round(inset)}px further in) — align the heading with the text [2.7]`));
    }
    return { hard, soft };
  });
}

/* ─────────────── 2.11 / 2.21 ─────────────── */

/** 2.11 — the glyphs of two different texts overlap (whole page, not only the viewport; fixed / sticky layers, faint and hidden text left out). */
export async function textOverlap(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    const runs = [];
    const alpha = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(R.cs(e).opacity); return o * window.__uiRGBA(R.cs(el).color)[3]; };
    const clipBox = (el) => { let box = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = R.cs(e); if (s.overflowX !== "visible" || s.overflowY !== "visible") { const r = e.getBoundingClientRect(); box = { left: Math.max(box.left, r.left), top: Math.max(box.top, r.top), right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom) }; } } return box; };
    for (const n of R.textNodes(document.body)) {
      const el = n.parentElement;
      if (el.closest("[role=dialog], dialog, [role=tooltip], [role=listbox], [role=menu]") || R.fixedLayer(el) || alpha(el) <= 0.25 || /transparent/.test(R.cs(el).webkitTextFillColor || "")) continue;
      const cb = clipBox(el);
      for (const r of R.rectsOf(n)) {
        const x = { left: Math.max(r.left, cb.left), top: Math.max(r.top, cb.top), right: Math.min(r.right, cb.right), bottom: Math.min(r.bottom, cb.bottom) };
        if (x.right - x.left < 2 || x.bottom - x.top < 2 || (x.right - x.left) * (x.bottom - x.top) < 0.5 * r.width * r.height) continue;
        // the glyph box, not the line box: trim the half-leading
        const fs = parseFloat(R.cs(el).fontSize) || 14, pad = Math.max(0, (x.bottom - x.top - fs) / 2);
        runs.push({ el, n, l: x.left, r: x.right, t: x.top + pad, b: x.bottom - pad });
      }
    }
    const grid = new Map();
    const cell = (y) => Math.floor((y + scrollY) / 80);
    runs.forEach((x, i) => { for (let c = cell(x.t); c <= cell(x.b); c++) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(i); } });
    const seen = new Set();
    for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = runs[list[i]], b = runs[list[j]];
      if (a.el === b.el || a.n === b.n || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (w < 2 || h < 2) continue;
      const key = [a.el, b.el].map((e) => window.__uiSelector(e)).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(R.f(b.el, `"${a.n.nodeValue.trim().slice(0, 30)}" and "${b.n.nodeValue.trim().slice(0, 30)}" are drawn over each other (${Math.round(w)}×${Math.round(h)}px) at ${innerWidth}px — give each text its own space (no absolute positioning over text; let the row wrap) [2.11]`));
      if (out.length >= 12) return out;
    }
    return out;
  });
}

/** 2.21 — a paragraph squeezed into one or two words per line beside empty room. */
export async function squeezedText(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    for (const el of Array.from(document.querySelectorAll("p, li, dd, td, blockquote, figcaption, div, span"))) {
      if (!R.vis(el) || /pre/.test(R.cs(el).whiteSpace) || !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim().split(/\s+/).length >= 3)) continue;
      const wc = R.words(el);
      if (wc < 10) continue;
      const lines = R.lineCount(el);
      if (lines < 4 || wc / lines >= 2.2) continue;
      let anc = el.parentElement;
      while (anc && anc !== document.body && !(R.painted(anc) || /flex|grid/.test(R.cs(anc).display))) anc = anc.parentElement;
      if (!anc) continue;
      const a = anc.getBoundingClientRect(), s = R.cs(anc);
      const inner = a.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      const w = el.getBoundingClientRect().width;
      const row = R.kids(anc).filter((k) => { const b = k.getBoundingClientRect(), e = el.getBoundingClientRect(); return Math.min(b.bottom, e.bottom) - Math.max(b.top, e.top) > 0; });
      const used = row.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0);
      if (w < 0.35 * inner || (inner - used) >= 0.4 * inner) out.push(R.f(el, `text squeezed to ${(wc / lines).toFixed(1)} words per line (${lines} lines, ${Math.round(w)}px wide in a ${Math.round(inner)}px box) at ${innerWidth}px — let it take the box's width (min-width: 0, flex-basis, its own row on phones) [2.21]`));
    }
    return out;
  });
}

/* ─────────────── 2.12 key–value rows ─────────────── */

/** 2.12 — in a stack of label · value rows, one row breaks the pattern: its value ends elsewhere, it lacks the leader the others have, or its label wraps. */
export async function keyValueRows(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    for (const p of [document.body, ...document.querySelectorAll("body *")]) {
      const rows = R.kids(p).filter((r) => /flex|grid/.test(R.cs(r).display) && !/column/.test(R.cs(r).flexDirection));
      if (rows.length < 3 || rows.length !== R.kids(p).length || p.closest("nav, header, footer, table, form, [role=menu]")) continue;
      const sigs = rows.map(R.sig);
      if (Math.max(...[...new Set(sigs)].map((s) => sigs.filter((x) => x === s).length)) < 2) continue;
      const parts = rows.map((r) => {
        const ks = R.kids(r);
        if (ks.length < 2 || ks.length > 4) return null;
        const label = ks[0], value = ks[ks.length - 1];
        const lt = (label.innerText || "").trim(), vt = (value.innerText || "").trim();
        if (!lt || !vt || vt.length > 48 || lt.length > 48) return null;
        const vi = R.inkRects(value), li = R.inkRects(label);
        if (!vi.length || !li.length) return null;
        const rb = r.getBoundingClientRect(), rs = R.cs(r);
        return { r, label, value, flush: Math.abs(Math.max(...vi.map((x) => x.right)) - (rb.right - parseFloat(rs.paddingRight))) <= 3, right: Math.max(...vi.map((x) => x.right)), leader: ks.length > 2 && ks.slice(1, -1).some((k) => !(k.innerText || "").trim()), lines: R.linesOf(li).length, lt };
      });
      if (parts.some((x) => !x)) continue;
      const bs = rows.map((r) => r.getBoundingClientRect());
      if (!bs.every((b, i) => i === 0 || (b.top >= bs[i - 1].bottom - 2 && Math.abs(b.left - bs[0].left) < 4))) continue;
      const medR = R.median(parts.map((x) => x.right));
      const leaders = parts.filter((x) => x.leader).length;
      const oneLine = parts.filter((x) => x.lines === 1).length;
      for (const x of parts) {
        const why = [];
        if (Math.abs(x.right - medR) > 6 && parts.filter((y) => y.flush).length > parts.length / 2) why.push(`its value ends at ${Math.round(x.right)}px, the others at ${Math.round(medR)}px`);
        if (!x.leader && leaders >= 2 && leaders > parts.length / 2) why.push("it has no leader line like the others");
        if (x.lines > 1 && oneLine >= 2 && oneLine > parts.length / 2) why.push(`its label wraps to ${x.lines} lines`);
        if (why.length) { out.push(R.f(x.r, `row "${x.lt.slice(0, 30)}" breaks the pattern of its ${parts.length - 1} siblings: ${why.join("; ")} — one row component for every row of the list [2.12]`)); break; }
      }
    }
    return out;
  });
}

/* ─────────────── 2.17 / 2.22 / 2.23 / 6.5 ─────────────── */

/** 2.17 — one content width per page: a rounded / framed band wider than the content column of the other sections (desktop). */
export async function contentWidths(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    if (innerWidth < 1024) return out;
    let root = document.querySelector("main") || document.body;
    while (R.kids(root).length === 1) root = R.kids(root)[0];
    const sections = R.kids(root).filter((s) => s.getBoundingClientRect().height > 40);
    if (sections.length < 3) return out;
    const vw = document.documentElement.clientWidth;
    const container = (s) => {
      let best = null;
      const walk = (e, d) => {
        if (d > 4) return;
        const b = e.getBoundingClientRect(), l = b.left, r = vw - b.right;
        if (b.width > 0.5 * vw && b.width < vw - 2 && l > 8 && Math.abs(l - r) <= 4 && (!best || b.width > best)) best = b.width;
        for (const k of R.kids(e)) walk(k, d + 1);
      };
      walk(s, 0);
      return best;
    };
    const widths = sections.map(container).filter(Boolean);
    if (widths.length < 2) return out;
    const med = R.median(widths);
    for (const s of sections) {
      const boxes = [s, ...Array.from(s.querySelectorAll("*"))].slice(0, 400).filter((e) => { const b = e.getBoundingClientRect(); return R.vis(e) && b.width > 0.5 * vw && (R.bg(e) || R.painted(e)) && parseFloat(R.cs(e).borderTopLeftRadius) > 0; });
      for (const e of boxes) {
        const w = e.getBoundingClientRect().width;
        if (w > med * 1.08 && w > med + 64) { out.push(R.f(e, `this band is ${Math.round(w)}px wide; the content of the other sections is ${Math.round(med)}px — put it in the same container as the rest of the page [2.17]`)); break; }
      }
    }
    return out;
  });
}

/** 2.22 — two-column blocks: the right column starts on a line of the left one (the eyebrow, the heading, the first paragraph), the same one in every block. Returns { hard, rules: [{ rule, where }] } for the site-wide comparison. */
export async function twoColumnRule(page) {
  await ensure(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const R = window.__bsR, hard = [], rules = [];
    if (innerWidth < 1024) return { hard, rules };
    const NAMES = ["the eyebrow", "the heading", "the first paragraph", "the next line"];
    for (const b of Array.from(document.querySelectorAll("main *, section, body > div *"))) {
      if (!R.vis(b) || b.closest("header, footer, nav, form, table, [role=dialog]")) continue;
      const ks = R.kids(b);
      if (ks.length !== 2) continue;
      const bw = b.getBoundingClientRect().width;
      const [L0, Rt] = ks.map((k) => k.getBoundingClientRect());
      if (L0.width < 0.25 * bw || Rt.width < 0.25 * bw || Rt.left < L0.right - 2 || Math.min(L0.bottom, Rt.bottom) - Math.max(L0.top, Rt.top) <= 0) continue;
      const [left, right] = ks;
      if (!(left.innerText || "").trim() || (right.innerText || "").trim().length < 3) continue;
      if (/center/.test(R.cs(b).alignItems) || /center/.test(R.cs(right).alignSelf)) continue;
      let col = left; while (R.kids(col).length === 1) col = R.kids(col)[0];
      // box to box, ink to ink: a left item that is a painted box (a card) is placed by its box top, like the right column
      // an unpainted wrapper (a grid of stat cards) is placed by its first painted box down the first-child path, when
      // that box starts above the wrapper's first text
      const boxTop = (k) => {
        let e = k;
        while (e && !R.painted(e)) e = R.kids(e)[0];
        if (!e) return null;
        const top = e.getBoundingClientRect().top, ink = R.firstInk(k);
        return e === k || !ink || top < ink.top ? top : null;
      };
      const anchors = R.kids(col).map((k) => boxTop(k) ?? R.firstInk(k)?.top ?? null).filter((t) => t !== null).slice(0, 4);
      if (anchors.length < 2) continue;
      let rc = right; while (R.kids(rc).length === 1 && !R.painted(rc)) rc = R.kids(rc)[0];
      const firstBox = R.painted(rc) ? rc.getBoundingClientRect().top : (R.kids(rc)[0] && R.painted(R.kids(rc)[0]) ? R.kids(rc)[0].getBoundingClientRect().top : null);
      const ink = R.firstInk(right);
      if (!ink) continue;
      const top = firstBox ?? ink.top;
      const near = anchors.map((a, i) => ({ i, d: top - a })).sort((x, y) => Math.abs(x.d) - Math.abs(y.d))[0];
      const rule = Math.abs(near.d) <= 6 ? near.i : null;
      if (rule !== null) rules.push({ rule, name: NAMES[rule] || `line ${rule + 1}`, where: window.__uiDescribe(b), text: (left.innerText || "").trim().split("\n")[0].slice(0, 30) });
      else if (Math.abs(near.d) > 12) hard.push(R.f(right, `the right column starts ${Math.round(Math.abs(near.d))}px ${near.d < 0 ? "above" : "below"} ${NAMES[near.i] || "a line"} of the left one ("${(left.innerText || "").trim().split("\n")[0].slice(0, 30)}"): it lines up with nothing — start it on the eyebrow or the heading line, the same in every two-column block [2.22]`));
    }
    return { hard, rules };
  });
}
/** 2.22 site-wide / page-wide: more than one rule among the two-column blocks. [{ route, rules }] → findings */
export function twoColumnRulesAcross(list) {
  const all = list.flatMap((x) => x.rules.map((r) => ({ ...r, route: x.route })));
  const by = new Map(); for (const r of all) { if (!by.has(r.rule)) by.set(r.rule, []); by.get(r.rule).push(r); }
  if (by.size < 2) return [];
  const [main] = [...by].sort((a, b) => b[1].length - a[1].length)[0];
  return all.filter((r) => r.rule !== main).map((r) => ({ what: `two-column blocks follow different rules: here the right column starts on ${r.name} ("${r.text}"), in ${by.get(main).length} other block(s) on ${by.get(main)[0].name} (e.g. ${by.get(main)[0].route} "${by.get(main)[0].text}") — one rule for every two-column block [2.22]`, where: `${r.route} ${r.where}` }));
}

/** 2.23 — the items of one list / one row keep one rhythm: no single gap far larger than the rest, a row's gaps and insets even. */
export async function evenRhythm(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    for (const p of [document.body, ...document.querySelectorAll("body *")]) {
      if (p.children.length < 3 || !R.vis(p)) continue;
      for (const items of R.runs(p, 3)) {
        if (items.some((it) => it.matches("hr, [role=separator]")) || items.some((it) => /^inline$/.test(R.cs(it).display))) continue;
        const bs = items.map((x) => x.getBoundingClientRect());
        const stacked = bs.every((b, i) => i === 0 || (b.top >= bs[i - 1].bottom - 1 && Math.abs(b.left - bs[0].left) < 4));
        const inRow = !stacked && bs.every((b, i) => i === 0 || (Math.abs(b.top - bs[0].top) < 4 && b.left >= bs[i - 1].right - 1));
        if (!stacked && !inRow) continue;
        const gaps = bs.slice(1).map((b, i) => (stacked ? b.top - bs[i].bottom : b.left - bs[i].right));
        const sep = (i) => { const a = R.cs(items[i]), b = R.cs(items[i + 1]); const bt = (s, k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== "none"; return stacked ? bt(a, "Bottom") !== bt(R.cs(items[0]), "Bottom") || bt(b, "Top") !== bt(R.cs(items[1]), "Top") : false; };
        const med = R.median(gaps);
        if (stacked) {
          const i = gaps.findIndex((g, k) => g > 1.6 * Math.max(med, 1) && g - med >= 8 && !sep(k));
          if (i >= 0) out.push(R.f(items[i + 1], `an uneven gap in the list: ${Math.round(gaps[i])}px before "${(items[i + 1].innerText || "").trim().slice(0, 30)}", ${Math.round(med)}px between the other items — one spacing for every item [2.23]`));
          continue;
        }
        if (Math.max(...gaps) - Math.min(...gaps) > 6) { out.push(R.f(p, `the items of this row are spaced unevenly (${gaps.map(Math.round).join(", ")}px) — one gap between all of them (gap / grid columns) [2.23]`)); continue; }
        // a framed row (a dialog, a card) keeps equal insets left and right when it does not fill its frame on purpose
        const frame = p.closest("[role=dialog], dialog") || (R.painted(p) ? p : null);
        if (frame) {
          const fb = frame.getBoundingClientRect(), fs = R.cs(frame);
          const l = bs[0].left - fb.left - (frame === p ? parseFloat(fs.paddingLeft) : 0), r = fb.right - bs[bs.length - 1].right - (frame === p ? parseFloat(fs.paddingRight) : 0);
          const jc = R.cs(p).justifyContent;
          if (Math.abs(l - r) > 12 && !/^(flex-)?start|normal|left/.test(jc)) out.push(R.f(p, `the row sits off centre in its frame: ${Math.round(l)}px on the left, ${Math.round(r)}px on the right — equal insets (or let the items fill the row) [2.23]`));
        }
      }
    }
    return out;
  });
}

/** 6.5 — section headings of one look share one alignment on a page (hero, colour bands, cards and dialogs left out). Desktop. */
export async function headingAlignment(page) {
  await ensure(page);
  return page.evaluate(() => {
    const R = window.__bsR, out = [];
    if (innerWidth < 1024) return out;
    const root = document.querySelector("main") || document.body;
    let first = root; while (R.kids(first).length === 1) first = R.kids(first)[0];
    const hero = R.kids(first)[0];
    const hs = Array.from(root.querySelectorAll("h2")).filter((h) => {
      if (!R.vis(h) || (hero && hero.contains(h)) || h.closest("[role=dialog], dialog, nav, aside, footer, header")) return false;
      for (let e = h.parentElement; e && e !== root; e = e.parentElement) if (R.bg(e) || (R.painted(e) && parseFloat(R.cs(e).borderTopLeftRadius) > 0)) return false;
      // the closing call to action (the last section, or one named cta / closing) is centred by convention
      const sec = h.closest("section") || h.parentElement;
      if (/cta|closing|call-to-action/i.test(`${sec.id} ${h.id} ${sec.getAttribute("class") || ""}`) || (sec === R.kids(first).at(-1) && sec.querySelector("a[href], button") && Array.from(sec.querySelectorAll("a[href], button")).some((b) => R.painted(b)))) return false;
      return true;
    });
    const look = (h) => { const s = R.cs(h); return `${s.fontFamily.split(",")[0]}|${s.fontSize}|${s.fontWeight}|${s.textTransform}`; };
    const groups = new Map(); for (const h of hs) { const k = look(h); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); }
    for (const list of groups.values()) {
      if (list.length < 3) continue;
      const al = list.map((h) => {
        if (R.cs(h).textAlign === "center") return "centre";
        const ink = R.inkRects(h); if (!ink.length) return "start";
        const l = Math.min(...ink.map((r) => r.left)), r = Math.max(...ink.map((r) => r.right));
        const p = h.parentElement.getBoundingClientRect();
        return r - l < 0.9 * p.width && Math.abs((l + r) / 2 - (p.left + p.right) / 2) <= 4 && l - p.left > 16 ? "centre" : "start";
      });
      const [main, n] = R.mode(al);
      if (n < (2 / 3) * list.length) continue;
      list.forEach((h, i) => { if (al[i] !== main) out.push(R.f(h, `section heading "${(h.innerText || "").trim().slice(0, 40)}" is ${al[i] === "centre" ? "centred" : "left-aligned"} while the page's other ${n} section headings of this style are ${main === "centre" ? "centred" : "left-aligned"} — one alignment per heading role on a page [6.5]`)); });
    }
    return out;
  });
}

/**
 * Everything above for one page at its current width: { hard, soft, shell, rules } — layout.spec runs it per route,
 * run.spec per language (the text-dependent ones), moneyFormat's currency loop the range split.
 */
export async function rhythmChecks(page) {
  const hard = [], soft = [];
  const add = (arr) => hard.push(...(arr || []));
  add(await rangeSplit(page).catch(() => []));
  if ((page.viewportSize()?.width ?? 1440) < 768) add(await headingBalance(page).catch(() => []));
  add(await brandOneLine(page).catch(() => []));
  add(await slotWraps(page).catch(() => []));
  add(await stackedWidths(page).catch(() => []));
  add(await stackedDividers(page).catch(() => []));
  add(await markerBadgeLevel(page).catch(() => []));
  const st = await shellTops(page).catch(() => ({ hard: [], shell: null }));
  add(st.hard);
  const ft = await fieldTops(page).catch(() => ({ hard: [], soft: [] }));
  add(ft.hard); soft.push(...ft.soft);
  add(await textOverlap(page).catch(() => []));
  add(await squeezedText(page).catch(() => []));
  add(await keyValueRows(page).catch(() => []));
  add(await contentWidths(page).catch(() => []));
  const tc = await twoColumnRule(page).catch(() => ({ hard: [], rules: [] }));
  add(tc.hard);
  add(await evenRhythm(page).catch(() => []));
  add(await headingAlignment(page).catch(() => []));
  return { hard, soft, shell: st.shell, rules: tc.rules };
}
/** The text-dependent subset (a longer language breaks what fits in English): run.spec's i18n test. */
export async function rhythmText(page) {
  const out = [];
  out.push(...(await rangeSplit(page).catch(() => [])));
  out.push(...(await slotWraps(page).catch(() => [])));
  out.push(...(await squeezedText(page).catch(() => [])));
  out.push(...(await brandOneLine(page).catch(() => [])));
  if ((page.viewportSize()?.width ?? 1440) < 768) out.push(...(await headingBalance(page).catch(() => [])));
  return out;
}
