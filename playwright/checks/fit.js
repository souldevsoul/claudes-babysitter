// 2.14 — text is shown in full (5.2.0, the miss loop). The layout checks before it measured boxes, not words:
//   2.1  (horizontalOverflow) passes anything a clipping ancestor cuts off — and body { overflow-x: hidden } (or clip)
//        is such an ancestor, so a label running off the screen edge was "decorative bleed";
//   2.10 (escapesBox) measures controls only — a price, a timeline label or a status line is not a control;
//   N6   (clippedControls) looks for an ellipsis in buttons, links, comboboxes and tabs — not in a list option.
// Praxis and Parallel testers found every one of those at 360 px (az / kk labels, the price in a task header, the
// status timeline, a language option "Azərbaycan…", a drawer whose content was cut off at its bottom).
//
// textCutOff measures the glyphs (Range rects) of every visible text run and reports, grouped by look-alike:
//   cut   — the text straddles the edge of the screen (left / right), or of an ancestor that clips it (overflow
//           hidden / clip; a scroller is not a clip: its content can be reached) — part of it cannot be read;
//           inside a fixed layer (a sheet, a drawer, the open mobile menu) the bottom of the screen clips too;
//   spill — the text runs out of the painted box it sits in (a button, a badge, a card: fill, four borders or a
//           shadow) by more than a few px: a three-line label in a fixed-height 44 px button;
//   ellipsis — a list option, a menu item, a tab, a label or a short (≤ 24 characters) text truncated with "…".
// Not reported, on purpose: text fully outside the clip (a closed accordion, the next carousel slide, an off-canvas
// drawer — nothing of it is on screen), carousels / marquees (their track runs a box-width past the clip, or moves),
// -webkit-line-clamp and ellipsis on longer text (deliberate truncation of a title), a horizontal scroller's content,
// screen-reader-only text. Faint decorative text (alpha ≤ 0.25, a watermark word) is returned under `eye`, never dropped.
// Findings follow ../checks.js: { what, where, selector, human }. Needs checks.install(page) first.

export const textCutOff = (page) => page.evaluate(() => {
  const W = window;
  const hard = [], eye = [];
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const clear = (c) => !c || c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
  const paints = (el, cs) => !clear(cs.backgroundColor) || (cs.backgroundImage !== "none" && !/url\(/.test(cs.backgroundImage)) || cs.boxShadow !== "none" || ["Top", "Right", "Bottom", "Left"].every((s) => parseFloat(cs[`border${s}Width`]) > 0 && !clear(cs[`border${s}Color`]));
  const moving = (el) => { try { return el.getAnimations({ subtree: true }).some((a) => a.playState === "running" && /transform|translate|left|margin/i.test(JSON.stringify(a.effect?.getKeyframes?.() || []))); } catch { return false; } };
  const rng = document.createRange();
  const groups = new Map();
  const add = (list, el, what, kind) => {
    const sig = [kind, el.tagName, typeof el.className === "string" ? el.className : "", what.replace(/-?\d+(\.\d+)?px/g, "#")].join("|");
    const g = groups.get(sig);
    if (g) { g.count++; return; }
    const f = { what, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) };
    groups.set(sig, { count: 1, f, list });
  };
  const OPTION = "[role=option], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=tab], label, legend, dt, th";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && n.parentElement.closest("script, style, noscript, template, svg, code, pre, textarea, select, option, [contenteditable=true]") ? 2 : 1 });
  const done = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const raw = n.nodeValue || "";
    const s = raw.search(/\S/);
    if (s < 0) continue;
    const el = n.parentElement;
    if (!el || !W.__uiVisible(el) || el.closest("[inert], .sr-only, [data-babysitter-ignore]")) continue;
    const e = raw.length - (raw.length - raw.trimEnd().length);
    rng.setStart(n, s); rng.setEnd(n, e);
    const rects = Array.from(rng.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) continue;
    const U = { l: Math.min(...rects.map((r) => r.left)), r: Math.max(...rects.map((r) => r.right)), t: Math.min(...rects.map((r) => r.top)), b: Math.max(...rects.map((r) => r.bottom)) };
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    const shown = text.length > 40 ? `${text.slice(0, 37)}…` : text;
    // faint decorative text (a watermark word) goes to the eye list
    const col = W.__uiRGBA(cs.color);
    let op = 1; for (let p = el; p && p.nodeType === 1; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
    const faint = col[3] * op <= 0.25;
    const report = (what, kind) => add(faint ? eye : hard, el, what, kind);
    if (done.has(el)) continue;
    // a line clamp (on the element or a box above it) truncates on purpose
    let clamped = false;
    for (let p = el; p && p !== document.body && !clamped; p = p.parentElement) clamped = parseFloat(getComputedStyle(p).webkitLineClamp || "0") > 0;
    if (clamped) continue;

    /* ellipsis — the element (or the one it sits in, up to the option) truncates its text */
    let trunc = null;
    for (let p = el, d = 0; p && d < 3 && p !== document.body; p = p.parentElement, d++) {
      const ps = getComputedStyle(p);
      if (ps.textOverflow === "ellipsis" && p.scrollWidth > p.clientWidth + 1) { trunc = p; break; }
    }
    if (trunc) {
      const full = (trunc.textContent || "").replace(/\s+/g, " ").trim();
      const optionLike = trunc.closest(OPTION) || trunc.closest("[role=listbox], [role=menu], [role=tablist]");
      if (optionLike || full.length <= 24) { done.add(el); report(`text is truncated with an ellipsis: "${full.slice(0, 40)}" shows as "${full.slice(0, Math.max(3, Math.round(full.length * trunc.clientWidth / Math.max(1, trunc.scrollWidth)) - 1))}…" — ${optionLike ? "a list option, menu item or tab" : "a short label"} must be readable in full: let it wrap (no truncate / text-overflow: ellipsis) or give the list its longest option's width [2.14, P16]`, "ellipsis"); }
      continue; // deliberate truncation of a longer title: not "cut off"
    }

    /* cut — by the screen edge (left / right; the bottom too inside a fixed layer), or by a clipping ancestor */
    let cut = null, fixedLayer = null, scrolled = false, hidden = false;
    // per axis: overflow-x: hidden computes overflow-y to auto — a box that clips sideways and scrolls up and down
    let reachX = false, reachY = false; // a scroller on that axis lets the reader reach what is past its edge
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.position === "fixed") { fixedLayer = a; }
      if (a === el) continue;
      if (a === document.body) break;
      const sx = /(auto|scroll)/.test(as.overflowX) && a.scrollWidth > a.clientWidth + 1, sy = /(auto|scroll)/.test(as.overflowY) && a.scrollHeight > a.clientHeight + 1;
      const cx = /(hidden|clip)/.test(as.overflowX), cy = /(hidden|clip)/.test(as.overflowY);
      if (!cx && !cy && !sx && !sy) continue;
      if (parseFloat(as.webkitLineClamp || as.lineClamp || "0") > 0 || /-webkit-box/.test(as.display)) break; // a line clamp: deliberate
      const q = a.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) { hidden = true; break; } // a collapsed panel (accordion closed, height animating from 0)
      const ql = q.left + parseFloat(as.borderLeftWidth), qr = q.right - parseFloat(as.borderRightWidth), qt = q.top + parseFloat(as.borderTopWidth), qb = q.bottom - parseFloat(as.borderBottomWidth);
      const overX = Math.max(U.r - qr, ql - U.l), overY = Math.max(U.b - qb, qt - U.t);
      const inX = U.r > ql + 1 && U.l < qr - 1, inY = U.b > qt + 1 && U.t < qb - 1;
      if (sx && overX > 2) reachX = true;
      if (sy && overY > 2) reachY = true;
      // below the bottom of a tall panel pinned to the screen (a drawer, a sheet, the open menu) that does not scroll:
      // unreachable, not "closed" — a closed accordion or the next slide is not a screen-tall fixed box
      if (cy && !inY && inX && U.t >= qb - 1 && q.height >= vh * 0.5 && !reachY && (fixedLayer || /^(fixed|sticky)$/.test(as.position) || a.closest("[role=dialog], [role=alertdialog], dialog"))) {
        cut = { box: a, x: false, past: Math.round(U.b - qb), side: "bottom", below: true };
        break;
      }
      if ((cx && !inX) || (cy && !inY)) { hidden = true; break; } // nothing of it is shown in this box: hidden on purpose (closed, next slide)
      if ((sx && !inX) || (sy && !inY)) { scrolled = true; break; } // scrolled out of view inside a scroller: reachable
      const pastX = cx && !reachX ? overX : 0, pastY = cy && !reachY ? overY : 0;
      if (pastX > 2 || pastY > Math.max(3, fs * 0.3)) {
        // a carousel / marquee track: it runs a box-width past its clip, or moves — the slide outside is not cut by mistake
        if (pastX > 2 && a.scrollWidth - a.clientWidth >= Math.min(q.width * 0.5, 200) && !(pastY > 2)) { hidden = true; break; }
        if (moving(a)) { hidden = true; break; }
        cut = { box: a, x: pastX > 2, past: Math.round(Math.max(pastX, pastY)), side: pastX > 2 ? (U.r - qr > ql - U.l ? "right" : "left") : U.b - qb > qt - U.t ? "bottom" : "top" };
        break;
      }
    }
    if (reachX && reachY) scrolled = true;
    if (hidden) continue;
    if (!cut && !scrolled) {
      const pastR = U.r - vw, pastL = -U.l;
      const onScreen = U.r > 1 && U.l < vw - 1;
      if (onScreen && !reachX && (pastR > 2 || pastL > 2) && !moving(el.parentElement || el))
        cut = { box: null, x: true, past: Math.round(Math.max(pastR, pastL)), side: pastR > pastL ? "right" : "left" };
      else if (fixedLayer && !reachY && U.t < vh - 1 && U.b > vh + Math.max(3, fs * 0.3) && !(fixedLayer.scrollHeight > fixedLayer.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(fixedLayer).overflowY)))
        cut = { box: "screen-bottom", x: false, past: Math.round(U.b - vh), side: "bottom" };
    }
    if (cut) {
      done.add(el);
      const boxName = cut.box === null ? "the screen edge" : cut.box === "screen-bottom" ? "the bottom of the screen, inside a fixed panel that does not scroll" : `its container ${W.__uiDescribe(cut.box).split(" \"")[0]} (overflow ${getComputedStyle(cut.box).overflowX}/${getComputedStyle(cut.box).overflowY})`;
      const fix = cut.box === null
        ? "let it wrap (min-w-0 / max-w-full on the row, no nowrap or shrink-0 on a long label) or stack the row on phones"
        : cut.box === "screen-bottom" ? "let the panel scroll (overflow-y: auto with a height the screen can hold, min-h-0 on the scroll area)"
          : cut.x ? "let it wrap inside the box (min-w-0, flex-wrap) or give the box room — do not clip text"
            : "let the box grow with its content, or scroll it (overflow-y: auto, min-h-0 on the scroll area) — do not clip text";
      report(cut.below ? `text is hidden below the bottom of ${boxName}, which does not scroll: "${shown}" — ${fix} [2.14, P16]` : `text is cut off at its ${cut.side}: "${shown}" runs ${cut.past}px past ${boxName} at ${vw}px — ${fix} [2.14, P16]`, "cut");
      continue;
    }
    if (scrolled) continue;

    /* spill — out of the painted box it sits in (button, badge, card) */
    if (reachX || reachY) continue; // inside a scroller that scrolls: what is past its box is reachable
    for (let child = el, a = el; a && a !== document.body; child = a, a = a.parentElement) {
      if (a !== el && /^(absolute|fixed)$/.test(getComputedStyle(child).position)) break; // hung on the box on purpose
      const as = getComputedStyle(a);
      // a box that clips or scrolls is judged by the "cut" rules above, a line clamp is deliberate
      if (a !== el && (as.overflowX !== "visible" || as.overflowY !== "visible" || parseFloat(as.webkitLineClamp || "0") > 0)) break;
      if (!paints(a, as)) continue;
      const q = a.getBoundingClientRect();
      if (q.width >= vw - 2 || q.height >= vh * 0.9) break; // a page band, not a box
      const tolY = Math.max(3, fs * 0.2);
      const pastX = Math.max(U.r - q.right, q.left - U.l), pastY = Math.max(U.b - q.bottom, q.top - U.t);
      if (pastX > 2 || pastY > tolY) {
        done.add(el);
        const kind = a.matches("button, a, [role=button]") ? "button" : q.height <= 40 ? "badge" : "card";
        report(`text spills out of its ${kind}: "${shown}" runs ${Math.round(Math.max(pastX, pastY))}px past the ${kind}'s ${pastX > 2 ? (U.r - q.right > q.left - U.l ? "right" : "left") : U.b - q.bottom > q.top - U.t ? "bottom" : "top"} edge (${Math.round(q.width)}×${Math.round(q.height)}px) at ${vw}px — let the ${kind} grow with its label (min-height instead of a fixed height, no nowrap), or wrap the text inside it [2.14, P16]`, "spill");
      }
      break;
    }
  }
  for (const { count, f, list } of groups.values()) list.push(count > 1 ? { ...f, where: `${f.where} (and ${count - 1} more like it)` } : f);
  return { hard, eye };
});

/**
 * The open popup layers (listbox, menu, dialog, Radix popper) that go past the screen: measured in every state a
 * click reaches (run.js measure), not only by the 1.2 trigger sweep that opens the first 8 triggers of a page (the
 * /contact topic list on Praxis was past the 8th). A popup wider than the screen is cut, whatever the page's overflow.
 */
export const popupOffScreen = (page) => page.evaluate(() => {
  const W = window, out = [];
  const vw = document.documentElement.clientWidth;
  for (const el of Array.from(document.querySelectorAll("[role=listbox], [role=menu], [data-radix-popper-content-wrapper] > *, [role=dialog], [role=alertdialog]"))) {
    if (!W.__uiVisible(el) || el.closest("[aria-hidden=true]")) continue;
    const r = el.getBoundingClientRect();
    const past = Math.max(r.right - vw, -r.left);
    if (past > 2 && r.left < vw && r.right > 0)
      out.push({ what: `the open ${el.getAttribute("role") || "popup"} is ${Math.round(r.width)}px wide and runs ${Math.round(past)}px past the screen at ${vw}px — cap it at the room beside its trigger (Radix: max-w-(--radix-select-content-available-width) / --radix-popper-available-width) and let long rows wrap [2.14/1.2, P02]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
  }
  return out;
});
