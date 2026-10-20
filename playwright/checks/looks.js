// 1.20 — one look per role, site-wide (5.2.0, the miss loop). Parallel testers: "the buttons on How It Works differ
// from the buttons on every other page" (square, thin grey outline, upper case), "tag corners are square on the task
// page and round on /request", "square corners left in the Example profiles block". Why the older checks passed:
//   1.17 (one shape language) compares each piece with the site's MEDIAN radius as "rounded vs square" only — a 4px
//        button on one page and pills everywhere else are both "rounded"; a status badge with a dot (two children)
//        was not collected as a badge at all;
//   1.3/1.16 counts distinct radii of FILLED buttons and of cards, with room for 2–3 variants and no tags — an
//        outlined button, an upper-case one, a tag could differ page by page without a word.
// collectRoleLooks reads, per page, the rendered look of each piece by role — button (filled / outlined), tag (badge,
// chip, status pill), card, input — and roleLookOutliers compares them ACROSS pages: for every role the look most
// pages use is the site's; a page whose pieces of that role look different is reported with the pages it differs from.
//   hard — square corners on one page, round ones (rounded or pill) on the others;
//   soft — rounded vs pill, a button / chip in UPPER CASE here and normal case there, or a radius more than 4px apart.
// Pieces that are part of a frame (attached: some corners square, some round) are left out. Needs checks.install(page).

export const collectRoleLooks = (page, route = "") => page.evaluate((route) => {
  const W = window;
  const out = [];
  const clear = (c) => W.__uiRGBA(c)[3] < 0.06;
  const parentBg = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = W.__uiRGBA(getComputedStyle(p).backgroundColor); if (c[3] > 0.5) return c.slice(0, 3).join(); } return "255,255,255"; };
  const filledOf = (el, cs) => !clear(cs.backgroundColor) && W.__uiRGBA(cs.backgroundColor).slice(0, 3).join() !== parentBg(el) || /gradient/.test(cs.backgroundImage);
  const edges = (cs) => ["Top", "Right", "Bottom", "Left"].filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && !clear(cs[`border${s}Color`])).length;
  const corners = (el, cs, r) => {
    const half = Math.min(r.width, r.height) / 2;
    const c = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((k) => Math.min(parseFloat(cs[k]) || 0, half));
    const max = Math.max(...c), min = Math.min(...c);
    if (max >= 2 && min < 1) return null; // attached (a segment of a group, a tab on a panel): the frame is the shape
    return { radius: Math.round(max), family: max < 1 ? "square" : max >= half - 1 ? "pill" : "rounded" };
  };
  const upper = (el, cs) => { const t = (el.innerText || "").trim(); return cs.textTransform === "uppercase" || (t.replace(/[^\p{L}]/gu, "").length >= 3 && t === t.toUpperCase() && t !== t.toLowerCase()); };
  const seen = new Set();
  const push = (el, role, extra = {}) => {
    if (seen.has(el)) return;
    seen.add(el);
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const k = corners(el, cs, r);
    if (!k) return;
    out.push({ role, ...k, route, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el), ...extra });
  };
  const skip = (el) => el.closest("[data-babysitter-ignore], [aria-hidden=true], [inert], [data-radix-popper-content-wrapper], [role=dialog] [role=tablist]") || W.__uiOverlay(el) && !el.closest("main");
  // buttons: a CTA, a form button, a dialog action, a link dressed as one — not nav / footer links, not chips
  const CHIP = "[aria-pressed], [aria-selected], [aria-checked], [role=tab], [role=radio], [role=option], [role=switch], [role=checkbox], [role=menuitem], [data-state=on], [data-state=off]";
  for (const el of Array.from(document.querySelectorAll("button, a, [role=button], input[type=submit], input[type=button]"))) {
    if (!W.__uiVisible(el) || skip(el) || !((el.textContent || "").trim() || el.value)) continue;
    if (el.closest("nav, [role=navigation], footer, [role=contentinfo], [role=tablist], [role=radiogroup], [role=toolbar]") || el.matches(CHIP)) continue;
    // a dropdown trigger (rows per page "10") is a field-like control, not a button look
    if (el.matches("[aria-haspopup]:not([aria-haspopup=false]), [role=combobox], [aria-expanded]")) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const filled = filledOf(el, cs), outlined = edges(cs) >= 4;
    if (!(filled || outlined) || r.height < 28 || r.height > 72 || parseFloat(cs.paddingLeft) < 8) continue;
    if (el.matches("a") && !W.__uiButtonLike(el)) continue;
    // three or more look-alikes side by side (skill links, filter chips in a list): chips, not buttons
    const sibs = (el.closest("li") || el).parentElement ? Array.from((el.closest("li") || el).parentElement.children).filter((k) => W.__uiVisible(k)) : [];
    const rowOf = sibs.filter((k) => { const x = k.matches("a, button") ? k : k.querySelector("a, button"); return x && x.className === el.className; });
    if (rowOf.length >= 3 && new Set(rowOf.map((k) => Math.round(k.getBoundingClientRect().top))).size < rowOf.length) { push(el, "chip", { upper: upper(el, cs) }); continue; }
    push(el, filled ? "button (filled)" : "button (outlined)", { upper: upper(el, cs) });
  }
  // tags: badges, status pills, chips — small painted boxes with a short label (a dot or an icon inside is fine)
  for (const el of Array.from(document.querySelectorAll("main span, main div, main a, main button, main li, main p, body > div span, body > div div"))) {
    if (seen.has(el) || !W.__uiVisible(el) || skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 16 || r.height > 36 || r.width > 240 || r.width < 20) continue;
    const t = (el.innerText || "").trim();
    if (!t || t.length > 30 || el.children.length > 3 || el.querySelector("button, a, input, img")) continue;
    const cs = getComputedStyle(el);
    if (!(filledOf(el, cs) || edges(cs) >= 3) || parseFloat(cs.paddingLeft) < 4) continue;
    if (!/inline|flex/.test(cs.display) && !el.matches(CHIP)) continue;
    // not a CTA (those are buttons above) and not a whole row
    if (W.__uiButtonLike(el) && r.height >= 28 && !el.matches(CHIP)) continue;
    // a chip you press (a filter, a topic) and a badge you read (a status) are two roles with their own looks
    push(el, el.matches("button, a, [role=button], " + CHIP) ? "chip" : "badge", { upper: upper(el, cs) });
  }
  // cards: framed boxes of content
  for (const el of Array.from(document.querySelectorAll("main *, body > div *"))) {
    if (seen.has(el) || !W.__uiVisible(el) || skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 180 || r.height < 100 || r.width > innerWidth * 0.9) continue;
    if (el.matches("input, textarea, select, button, [role=combobox]") || W.__uiButtonLike(el, true) || W.__uiMediaTile(el)) continue;
    const cs = getComputedStyle(el);
    if (!(edges(cs) >= 4 || cs.boxShadow !== "none") || parseFloat(cs.paddingTop) < 12) continue;
    push(el, "card");
  }
  // text fields (an underline-only field has no corners to compare)
  for (const el of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=submit]):not([type=button]), textarea, [role=combobox]'))) {
    if (!W.__uiVisible(el) || skip(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (edges(cs) < 3 && !filledOf(el, cs)) continue;
    // a compact pill trigger (rows per page "10") is a chip, not a field
    if (el.matches("button, [role=combobox]:not(input)") && parseFloat(cs.borderTopLeftRadius) >= r.height / 2 - 1 && r.height <= 36) continue;
    push(el, "input", { multiline: el.tagName === "TEXTAREA" });
  }
  return out;
}, route);

/**
 * Compares the looks of every role across pages. Returns { hard, soft }: one finding per role and page that does not
 * look like the rest of the site, naming the site's look, the pages that use it, and an example on the odd page.
 */
export function roleLookOutliers(items, { radiusTolerance = 4 } = {}) {
  const hard = [], soft = [];
  const roles = [...new Set(items.map((x) => x.role))];
  for (const role of roles) {
    const list = items.filter((x) => x.role === role);
    const pages = [...new Set(list.map((x) => x.route))];
    if (pages.length < 2) continue;
    // case is part of a button's and a chip's look; badges (a status in capitals, a category in words) may differ
    const button = /^button|^chip/.test(role);
    // hard: square vs round corners. soft: rounded vs pill, and (buttons, chips) UPPER vs normal case
    const keyOf = (x) => (x.family === "square" ? "square" : "round");
    const fine = (x) => `${x.family}${button ? (x.upper ? " · UPPER CASE" : " · normal case") : ""}`;
    // the site's look: the one most pages use (a page votes for each look it shows), then the most pieces
    const byLook = new Map();
    for (const x of list) { const k = keyOf(x); const e = byLook.get(k) || { pages: new Set(), n: 0, ex: x }; e.pages.add(x.route); e.n++; byLook.set(k, e); }
    const ranked = [...byLook.entries()].sort((a, b) => b[1].pages.size - a[1].pages.size || b[1].n - a[1].n);
    const [siteKey, site] = ranked[0];
    for (const [k, e] of ranked.slice(1)) {
      // a look that is the site's on most of its own pages is still an outlier where it appears: report per page
      for (const route of e.pages) {
        const ex = list.find((x) => x.route === route && keyOf(x) === k);
        const others = [...site.pages].filter((p) => p !== route);
        if (!others.length) continue;
        const n = list.filter((x) => x.route === route && keyOf(x) === k).length;
        hard.push({ what: `${role} looks different on ${route}: ${n} piece(s) are ${k}, while ${others.length} other page(s) (${others.slice(0, 4).join(", ")}${others.length > 4 ? ", …" : ""}) use ${siteKey} — one look per role across the site: use the kit component's variant here [1.20, P04 P46]`, where: `${route} ${ex.where}`, selector: ex.selector, human: ex.human, role, route });
      }
    }
    // the softer differences, the same way: rounded vs pill (not for cards and multi-line fields), case
    {
      const sub = list.filter((x) => keyOf(x) === siteKey && x.family !== "square" && !x.multiline && role !== "card");
      const by = new Map();
      for (const x of sub) { const k = fine(x); const e = by.get(k) || { pages: new Set(), n: 0 }; e.pages.add(x.route); e.n++; by.set(k, e); }
      const rk = [...by.entries()].sort((a, b) => b[1].pages.size - a[1].pages.size || b[1].n - a[1].n);
      if (rk.length > 1) for (const [k, e] of rk.slice(1)) for (const route of e.pages) {
        const others = [...rk[0][1].pages].filter((p) => p !== route);
        const ex = sub.find((x) => x.route === route && fine(x) === k);
        if (others.length) soft.push({ what: `${role} on ${route} is ${k}, the site's is ${rk[0][0]} (${others.slice(0, 4).join(", ")}${others.length > 4 ? ", …" : ""}) [1.20]`, where: `${route} ${ex.where}`, selector: ex.selector, human: ex.human, role, route });
      }
    }
    // same family, different radius between pages (a 6px button here, 16px elsewhere): soft
    // (cards are left out here: a panel and a card are often two radius tokens on purpose; their family still counts)
    const fam = role === "card" ? [] : list.filter((x) => x.family === "rounded" && !x.multiline);
    if (fam.length) {
      const radii = fam.map((x) => x.radius).sort((a, b) => a - b);
      const median = radii[Math.floor(radii.length / 2)];
      const odd = new Map();
      for (const x of fam) if (Math.abs(x.radius - median) > radiusTolerance && !odd.has(x.route)) odd.set(x.route, x);
      for (const [route, x] of odd) if (fam.some((y) => y.route !== route))
        soft.push({ what: `${role} corners on ${route} are ${x.radius}px, the site's are ${median}px — one radius token per role [1.20]`, where: `${route} ${x.where}`, selector: x.selector, human: x.human, role, route });
    }
  }
  return { hard, soft };
}
