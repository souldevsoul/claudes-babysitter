// 5.2.1 — three checks from the cards Nexus showed once souldevsoul/nexus#1 listed every card (misses/*-2026-10-20.md):
//   2.15 shadowClipped        a card's shadow cut off by a box that clips (Praxis /dashboard: "under the task and quick
//                             actions boxes the shadow suddenly cuts out");
//   2.16 stuckScrollPastScreen a sticky / fixed panel whose scroll box ends below the screen while the panel is pinned
//                             (Praxis /specialists: the skill-area list's last item can never be shown);
//   6.13 colourOnlyLinks      a link inside a sentence told from the text around it by colour alone, and the two
//                             colours are closer than 3:1 (WCAG 1.4.1, F73) (Praxis cookie banner "Cookie Policy").
// Findings follow ../checks.js: { what, where, selector, human }. Needs checks.install(page) first.

/**
 * 2.15 — a box shadow is drawn on some sides of a card and cut off on another by an ancestor that clips (overflow
 * hidden / clip, or an auto axis that does not scroll — overflow-x: hidden turns overflow-y into auto). Reported when
 * the shadow is visible on at least one side (half its reach or more) and more than half of its reach is cut on
 * another: a shadow cut on every side is simply invisible, not a hard edge. Hard when the cut part reaches 12px or
 * more (a shadow-lg and up); a smaller cut goes to `eye`. Scrollers that really scroll are left alone: their
 * content is meant to pass under the edge. Grouped by look-alike (a grid of cards is one finding).
 */
export const shadowClipped = (page) => page.evaluate(() => {
  const W = window;
  const hard = [], eye = [];
  const split = (s) => { const out = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { out.push(cur); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur); return out; };
  // reach of the outer shadows per side: offset + spread + blur (the blur fades over its whole radius; half of it is
  // where the eye still sees the edge, so the reach counted is offset + spread + blur / 2)
  const reach = (bs) => {
    const r = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!bs || bs === "none") return null;
    for (const part of split(bs)) {
      if (/\binset\b/.test(part)) continue;
      const color = (part.match(/(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}/i) || ["rgba(0,0,0,1)"])[0];
      const a = W.__uiRGBA(color)[3];
      if (a < 0.06) continue;
      const n = part.replace(color, "").match(/-?\d+(\.\d+)?px/g)?.map(parseFloat) || [];
      const [x = 0, y = 0, blur = 0, spread = 0] = n;
      const base = spread + blur / 2;
      r.right = Math.max(r.right, base + x); r.left = Math.max(r.left, base - x);
      r.bottom = Math.max(r.bottom, base + y); r.top = Math.max(r.top, base - y);
    }
    return Object.values(r).some((v) => v >= 4) ? r : null;
  };
  const clips = (cs, el, axis) => {
    const o = axis === "x" ? cs.overflowX : cs.overflowY;
    if (o === "hidden" || o === "clip") return true;
    if (o === "auto" || o === "scroll") return axis === "x" ? el.scrollWidth <= el.clientWidth + 1 : el.scrollHeight <= el.clientHeight + 1;
    return false;
  };
  const groups = new Map();
  const els = [...document.querySelectorAll("body *")].filter((el) => { const cs = getComputedStyle(el); return cs.boxShadow && cs.boxShadow !== "none"; });
  for (const el of els.slice(0, 600)) {
    if (!W.__uiVisible(el) || el.closest("svg")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) continue;
    const ext = reach(getComputedStyle(el).boxShadow);
    if (!ext) continue;
    const room = { top: Infinity, right: Infinity, bottom: Infinity, left: Infinity };
    let clipper = null;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const cx = clips(cs, a, "x"), cy = clips(cs, a, "y");
      if (!cx && !cy) continue;
      const b = a.getBoundingClientRect();
      const bl = b.left + parseFloat(cs.borderLeftWidth), br = b.right - parseFloat(cs.borderRightWidth);
      const bt = b.top + parseFloat(cs.borderTopWidth), bb = b.bottom - parseFloat(cs.borderBottomWidth);
      // the card must sit inside the box (a slide parked outside it is not on screen at all)
      if (r.right <= bl || r.left >= br || r.bottom <= bt || r.top >= bb) { clipper = null; break; }
      const before = { ...room };
      if (cx) { room.left = Math.min(room.left, r.left - bl); room.right = Math.min(room.right, br - r.right); }
      if (cy) { room.top = Math.min(room.top, r.top - bt); room.bottom = Math.min(room.bottom, bb - r.bottom); }
      if (!clipper && Object.keys(room).some((s) => room[s] !== before[s] && room[s] < ext[s] / 2)) clipper = a;
    }
    if (!clipper) continue;
    const sides = Object.keys(ext).filter((s) => ext[s] >= 4);
    const cut = sides.filter((s) => room[s] < ext[s] / 2).map((s) => ({ side: s, px: Math.round(ext[s] - Math.max(0, room[s])) }));
    const shown = sides.filter((s) => room[s] >= ext[s] / 2);
    if (!cut.length || !shown.length) continue;
    const worst = Math.max(...cut.map((c) => c.px));
    const list = worst >= 12 ? hard : eye;
    const sig = [list === hard, el.tagName, typeof el.className === "string" ? el.className : "", cut.map((c) => c.side).join()].join("|");
    const g = groups.get(sig);
    if (g) { g.count++; continue; }
    const f = { what: `its shadow is cut off at the ${cut.map((c) => `${c.side} (${c.px}px of it)`).join(", ")} by ${W.__uiDescribe(clipper).split(" > ").slice(-1)[0]}, which clips (overflow hidden) — while it shows on the ${shown.join(", ")}. Give the clipping box room for the shadow (padding), drop its overflow-hidden, or use a shadow that fits`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) };
    groups.set(sig, { count: 1, f, list });
  }
  for (const { count, f, list } of groups.values()) list.push(count > 1 ? { ...f, what: `${f.what} (and ${count - 1} more like it)` } : f);
  return { hard, eye };
});

/**
 * 2.16 — a pinned panel (position sticky with a `top`, or fixed) holds a scroll box whose content overflows, and the
 * scroll box ends below the bottom of the screen while the panel is pinned: what is at its end cannot be brought into
 * view (scrolling the box moves it under the fold; scrolling the page keeps the panel where it is). A sticky panel
 * counts only when its container is taller than the panel (otherwise it never sticks).
 */
export const stuckScrollPastScreen = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  const vh = innerHeight;
  const seen = new Set();
  for (const panel of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(panel);
    if (cs.position !== "sticky" && cs.position !== "fixed") continue;
    if (!W.__uiPainted(panel) || [...seen].some((s) => s.contains(panel))) continue;
    const pr = panel.getBoundingClientRect();
    if (pr.height < 80 || pr.width < 80) continue;
    let pinnedTop;
    if (cs.position === "fixed") pinnedTop = pr.top;
    else {
      if (cs.top === "auto") continue;
      const holder = panel.parentElement;
      if (!holder || holder.getBoundingClientRect().height < pr.height + 40) continue;
      pinnedTop = parseFloat(cs.top) || 0;
    }
    const boxes = [panel, ...panel.querySelectorAll("*")].filter((b) => { const s = getComputedStyle(b); return /^(auto|scroll)$/.test(s.overflowY) && b.scrollHeight > b.clientHeight + 4 && b.clientHeight >= 40 && W.__uiPainted(b); });
    for (const box of boxes) {
      const br = box.getBoundingClientRect();
      const bottom = pinnedTop + (br.bottom - pr.top);
      if (bottom <= vh + 8) continue;
      seen.add(panel);
      out.push({ what: `the scroll box in this ${cs.position} panel ends ${Math.round(bottom - vh)}px below the bottom of the screen while the panel is pinned (top ${Math.round(pinnedTop)}px, ${Math.round(br.height)}px tall in a ${vh}px window): its last items can never be shown. Cap it to the screen (max-height: calc(100dvh - ${Math.round(pinnedTop + (br.top - pr.top))}px - a margin) or let the panel scroll as a whole`, where: W.__uiDescribe(box), selector: W.__uiSelector(box), human: W.__uiHuman(box) });
      break;
    }
  }
  return out;
});

/**
 * 6.13 — a link inside running text (its block has 20+ letters of its own besides the link) that nothing but colour
 * tells apart: no underline (a visible one), no bottom border, no fill of its own, not bolder (+200), no icon — and its
 * colour is within 3:1 of the text around it. WCAG 1.4.1 (failure F73). Links in a list of links (nav, footer
 * columns), button-like links and links that are the whole block, and links laid out as a box of their own (inline-flex / block: a footer brand name),
 * are not running text and are left alone.
 */
export const colourOnlyLinks = (page) => page.evaluate(() => {
  const W = window;
  const out = [];
  const groups = new Map();
  const letters = (s) => (s.match(/\p{L}/gu) || []).length;
  for (const a of document.querySelectorAll("a[href]")) {
    if (!W.__uiVisible(a) || W.__uiButtonLike(a, true)) continue;
    // a link laid out as a box of its own (inline-flex / block: the footer's brand name, a card link) is not part of a
    // sentence (truelogos, deskhand, proxy footers, 5.3.0 live probe)
    if (getComputedStyle(a).display !== "inline") continue;
    const text = (a.textContent || "").trim();
    if (!letters(text)) continue;
    let block = a.parentElement;
    while (block && block !== document.body && /^(inline|contents)$/.test(getComputedStyle(block).display)) block = block.parentElement;
    if (!block || block === document.body || block.closest("nav, [role=navigation]")) continue;
    const own = (block.textContent || "").replace(/\s+/g, " ").length - (a.textContent || "").replace(/\s+/g, " ").length;
    const otherLinks = [...block.querySelectorAll("a")].filter((x) => x !== a).reduce((n, x) => n + letters(x.textContent || ""), 0);
    if (letters(block.textContent || "") - letters(text) - otherLinks < 20 || own < 20) continue;
    const cs = getComputedStyle(a), ps = getComputedStyle(block);
    const deco = cs.textDecorationLine.includes("underline") && W.__uiRGBA(cs.textDecorationColor)[3] > 0.2;
    const border = parseFloat(cs.borderBottomWidth) >= 1 && W.__uiRGBA(cs.borderBottomColor)[3] > 0.2 && cs.borderBottomStyle !== "none";
    const fill = W.__uiRGBA(cs.backgroundColor)[3] > 0.08 || cs.backgroundImage !== "none";
    const bolder = Number(cs.fontWeight) - Number(ps.fontWeight) >= 200;
    const icon = !!a.querySelector("svg, img");
    const family = cs.fontFamily !== ps.fontFamily;
    if (deco || border || fill || bolder || icon || family) continue;
    // the text around it: the first text node of the block that is not inside a link
    let around = null;
    const tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.trim() && !n.parentElement.closest("a")) { around = n.parentElement; break; }
    if (!around) continue;
    const fg = W.__uiRGBA(cs.color), bg = W.__uiRGBA(getComputedStyle(around).color);
    const ratio = W.__uiRatio(fg, bg);
    if (ratio >= 3) continue;
    const sig = [a.className, block.tagName, cs.color, getComputedStyle(around).color].join("|");
    const g = groups.get(sig);
    if (g) { g.count++; continue; }
    const f = { what: `the link "${text.slice(0, 40)}" sits in a sentence and only its colour marks it as a link — ${ratio.toFixed(2)}:1 against the text around it (WCAG 1.4.1 needs 3:1 plus a cue on hover / focus, or an underline). Underline it (underline-offset is fine)`, where: W.__uiDescribe(a), selector: W.__uiSelector(a), human: W.__uiHuman(a) };
    groups.set(sig, { count: 1, f });
  }
  for (const { count, f } of groups.values()) out.push(count > 1 ? { ...f, what: `${f.what} (and ${count - 1} more like it)` } : f);
  return out;
});
