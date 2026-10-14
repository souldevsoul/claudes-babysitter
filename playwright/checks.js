// Plain JavaScript on purpose: bin/micro-check.mjs imports it directly, and Node < 22.6 cannot load .ts.
/** Short CSS-ish path for messages. */
const describeFn = `
window.__uiDescribe = (el) => {
  const parts = [];
  for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
    let s = e.tagName.toLowerCase();
    if (e.id) { s += '#' + e.id; parts.unshift(s); break; }
    const cls = (e.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    parts.unshift(s);
  }
  // text of the element without <style>/<script>: a Radix layer read as "[data-radix-select-viewport]{scrollbar-w…"
  let txt = '';
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && n.parentElement.closest('style, script, noscript, template') ? 2 : 1 });
  for (let n = w.nextNode(); n && txt.length < 80; n = w.nextNode()) txt += n.nodeValue + ' ';
  txt = txt.trim().replace(/\\s+/g, ' ').slice(0, 40);
  return parts.join(' > ') + (txt ? ' "' + txt + '"' : '');
};
// Resolve any CSS colour (rgb/hsl/lab/oklab/color()) to RGBA through canvas.
window.__uiRGBA = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  return (c) => {
    if (cache.has(c)) return cache.get(c);
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    const v = [d[0], d[1], d[2], a]; // getImageData is already un-premultiplied
    cache.set(c, v); return v;
  };
})();
const __mix = (top, bottom) => { const a = top[3]; return [0,1,2].map(i => top[i] * a + bottom[i] * (1 - a)).concat(1); };
const __lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
// Effective contrast of an element's text: background layers composited bottom-up (alpha blended, never ignored),
// text colour alpha × ancestor opacity blended on top. overImage=true when a gradient/image sits underneath.
// A photo or gradient often sits on an absolutely positioned SIBLING layer (hero banners), not on an ancestor:
// such a layer under the text's centre also counts as an image, else the page colour is taken as the backdrop
// (ferrous market banner, 2026-10: light heading over a dark photo reported as 1.13:1).
window.__uiImageBehind = (el, sib) => {
  const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const covers = (n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left <= cx && b.right >= cx && b.top <= cy && b.bottom >= cy; };
  const pos = getComputedStyle(sib).position;
  if ((pos !== 'absolute' && pos !== 'fixed') || !covers(sib) || !window.__uiVisible(sib)) return false;
  const nodes = [sib, ...Array.from(sib.querySelectorAll('*')).slice(0, 60)];
  return nodes.some((n) => {
    if (!covers(n)) return false;
    if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(n.tagName)) return true;
    const bi = getComputedStyle(n).backgroundImage;
    return !!bi && bi !== 'none';
  });
};
// Group opacity is composited exactly: an ancestor with opacity 0.5 fades its own fill AND the text inside it over
// whatever is behind it. The background behind the text and the text pixel are both affine in the colour behind
// the current element (result = a·X + c); each ancestor (fill, then group opacity) transforms that map, up to the page.
window.__uiContrast = (el) => {
  let overImage = false; let opacity = 1;
  const fg = window.__uiRGBA(getComputedStyle(el).color);
  // B: background right behind the glyphs, T: the glyph pixel; both as functions of the colour under the current layer
  let B = { a: 1, c: [0, 0, 0] };
  let T = { a: 1 - fg[3], c: [fg[0] * fg[3], fg[1] * fg[3], fg[2] * fg[3]] };
  const step = (m, bg, op) => ({ a: op * m.a * (1 - bg[3]) + (1 - op), c: [0, 1, 2].map((i) => op * (m.a * bg[3] * bg[i] + m.c[i])) });
  for (let e = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    const op = Number(cs.opacity);
    opacity *= op;
    // an image/gradient on a layer the text can still see through counts; one under an opaque fill does not
    if (B.a > 0.01 && cs.backgroundImage && cs.backgroundImage !== 'none') overImage = true;
    B = step(B, window.__uiRGBA(cs.backgroundColor), op);
    T = step(T, window.__uiRGBA(cs.backgroundColor), op);
    if (!overImage && B.a > 0.01 && e.parentElement) for (const s of e.parentElement.children) if (s !== e && window.__uiImageBehind(el, s)) { overImage = true; break; }
    if (B.a < 0.001 && T.a < 0.001) break;
  }
  const at = (m) => [0, 1, 2].map((i) => m.a * 255 + m.c[i]);
  const base = at(B), text = at(T);
  const L1 = __lum(text), L2 = __lum(base);
  return { ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), overImage, opacity, fg: [fg[0], fg[1], fg[2], fg[3] * opacity] };
};
const __ratio = (a, b) => { const x = __lum(a), y = __lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
window.__uiRatio = __ratio;
// A link or button dressed as a button (a CTA): button-sized, padded, filled or boxed, a short label, no card content.
// loose: any height (a CTA whose label wraps on a phone is still a CTA, not a card).
window.__uiButtonLike = (el, loose) => {
  if (!el.matches('a[href], button, [role=button], input[type=submit], input[type=button]')) return false;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if ((!loose && (r.height < 24 || r.height > 80)) || parseFloat(cs.paddingLeft) < 8) return false;
  if ((el.textContent || '').trim().length > 40 || el.querySelector('h1, h2, h3, h4, h5, h6, p, img, picture, video, ul, ol, table')) return false;
  let parentBg = '255,255,255';
  for (let p = el.parentElement; p; p = p.parentElement) { const c = window.__uiRGBA(getComputedStyle(p).backgroundColor); if (c[3] > 0.5) { parentBg = c.slice(0, 3).join(); break; } }
  const bg = window.__uiRGBA(cs.backgroundColor);
  const filled = (bg[3] > 0.08 && bg.slice(0, 3).join() !== parentBg) || /gradient/.test(cs.backgroundImage);
  const boxed = ['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(cs['border' + s + 'Width']) > 0 && window.__uiRGBA(cs['border' + s + 'Color'])[3] > 0.15);
  return filled || boxed;
};
// Fixed or sticky layers (cookie banner, toasts, sticky bars) float over the page: they are not part of its grid.
window.__uiOverlay = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
// A tile that is mostly a picture (logo wall, gallery): its fill is a frame for the image, not a card look.
window.__uiMediaTile = (el) => {
  const r = el.getBoundingClientRect(); const area = r.width * r.height; if (!area) return false;
  const cs = getComputedStyle(el);
  if (/url\\(/.test(cs.backgroundImage) && (el.innerText || '').trim().length < 60) return true;
  let media = 0;
  for (const m of el.querySelectorAll('img, video, canvas, svg')) {
    if (m.tagName.toLowerCase() === 'svg' && m.parentElement && m.parentElement.closest('svg')) continue;
    if (!window.__uiVisible(m)) continue;
    const b = m.getBoundingClientRect();
    const w = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)), h = Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
    media += w * h;
  }
  return media / area >= 0.4 && (el.innerText || '').trim().length < 80;
};
// Decode a PNG (base64) into ImageData without a network request (a Blob is not subject to the page's img-src CSP).
window.__uiDecode = async (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([u], { type: 'image/png' }));
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
  return cx.getImageData(0, 0, cv.width, cv.height);
};
// A CSS selector that matches exactly this element (for Babysitter Studio overlays).
window.__uiSelector = (el) => {
  if (!el || el.nodeType !== 1) return null;
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  if (el.id && document.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
  const parts = [];
  for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
    if (e.id && document.querySelectorAll('#' + esc(e.id)).length === 1) { parts.unshift('#' + esc(e.id)); break; }
    let part = e.tagName.toLowerCase();
    const sib = e.parentElement ? Array.from(e.parentElement.children).filter((c) => c.tagName === e.tagName) : [];
    if (sib.length > 1) part += ':nth-of-type(' + (sib.indexOf(e) + 1) + ')';
    parts.unshift(part);
    const sel = parts.join(' > ');
    if (document.querySelectorAll(sel).length === 1 && e.parentElement) {
      // anchor at body for a stable selector
      let full = sel; let up = e.parentElement; const chain = [];
      for (; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
        let pp = up.tagName.toLowerCase(); const ss = up.parentElement ? Array.from(up.parentElement.children).filter((c) => c.tagName === up.tagName) : [];
        if (ss.length > 1) pp += ':nth-of-type(' + (ss.indexOf(up) + 1) + ')'; chain.unshift(pp);
      }
      full = ['body', ...chain, ...parts].join(' > ');
      return document.querySelectorAll(full).length === 1 ? full : sel;
    }
  }
  return parts.join(' > ');
};
// What a person would call this element, for Babysitter Studio: { kind, name, place }.
window.__uiHuman = (el) => {
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName.toLowerCase(), role = el.getAttribute('role') || '', type = (el.getAttribute('type') || '').toLowerCase();
  const kind =
    tag === 'input' && (type === 'checkbox' || type === 'radio') ? type :
    tag === 'select' || role === 'combobox' || role === 'listbox' || el.getAttribute('aria-haspopup') === 'listbox' ? 'dropdown' :
    tag === 'input' || tag === 'textarea' ? 'field' :
    tag === 'button' || role === 'button' ? 'button' :
    tag === 'a' ? 'link' :
    /^h[1-6]$/.test(tag) ? 'heading' :
    tag === 'img' || tag === 'svg' ? 'image' :
    tag === 'table' ? 'table' :
    tag === 'label' ? 'label' :
    el.children.length === 0 || ['p', 'span', 'li', 'small', 'strong', 'em', 'dt', 'dd', 'td', 'th'].includes(tag) ? 'text' : 'block';
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  let name = clean(el.getAttribute('aria-label'));
  if (!name && el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) name = clean(l.textContent); }
  if (!name && el.closest('label')) name = clean(el.closest('label').textContent);
  if (!name) name = clean(el.getAttribute('placeholder')) || clean(el.getAttribute('alt')) || clean(el.getAttribute('title'));
  if (!name) name = clean(el.innerText || el.textContent);
  if (name.length > 48) name = name.slice(0, 45).replace(/\\s+\\S*$/, '') + '…';
  let place = null;
  const land = el.closest('header, footer, nav, aside, [role=dialog], dialog, form');
  if (land) {
    const t = land.tagName.toLowerCase(), r = land.getAttribute('role');
    place = r === 'dialog' || t === 'dialog' ? { area: 'dialog' } : t === 'form' ? { area: 'form', title: clean((land.querySelector('h1,h2,h3,legend') || {}).textContent) } : { area: t };
  }
  if (!place || place.area === 'form' && !place.title) {
    // the section it sits in, named by the nearest heading above it
    let sec = el.closest('section, article, main > div'), title = '';
    for (let s = sec; s && !title; s = s.parentElement && s.parentElement.closest('section, article')) title = clean((s.querySelector('h1, h2, h3') || {}).textContent);
    if (title) place = { area: 'section', title: title.length > 40 ? title.slice(0, 37) + '…' : title };
  }
  return { kind, name, place };
};
window.__uiVisible = (el) => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  // the visually-hidden pattern (sr-only, react-dropzone, Radix's form <select>): a 1px box, clipped away
  if (r.width <= 1 && r.height <= 1) return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
  if (/rect\\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\\)/.test(cs.clip) || /inset\\(50%\\)|circle\\(0/.test(cs.clipPath)) return false;
  if (el.closest('[aria-hidden="true"], .sr-only, [hidden]')) return false;
  return true;
};`;
export async function install(page) {
    await page.addInitScript(describeFn);
    // CLS observer must exist before first paint (2.13).
    await page.addInitScript(() => {
        window.__cls = 0;
        try {
            new PerformanceObserver((list) => {
                for (const e of list.getEntries())
                    if (!e.hadRecentInput)
                        window.__cls += e.value;
            }).observe({ type: "layout-shift", buffered: true });
        }
        catch { }
    });
}
/**
 * Class-based themes (shadcn `.dark`, data-theme) ignore prefers-color-scheme. When the run emulates dark,
 * switch the page the way a theme toggle would — AFTER hydration (doing it earlier makes React report a
 * mismatch) — so the dark tokens are what gets measured.
 */
export const applyColorScheme = (page) => page.evaluate(() => {
    if (!matchMedia("(prefers-color-scheme: dark)").matches)
        return false;
    const h = document.documentElement;
    h.classList.add("dark");
    h.setAttribute("data-theme", "dark");
    h.style.colorScheme = "dark";
    return true;
});
/** 2.1 — no horizontal page scroll; 2.10 — nothing sticks out of the viewport. */
export const horizontalOverflow = (page) => page.evaluate(() => {
    const out = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1)
        out.push({ what: `page scrollWidth ${doc.scrollWidth} > viewport ${doc.clientWidth}`, where: "html" });
    const vw = doc.clientWidth;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (!window.__uiVisible(el))
            continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
            // ignore content inside an intentional clip (overflow hidden/auto ancestor smaller than viewport)
            let clipped = false;
            for (let p = el.parentElement; p; p = p.parentElement) {
                const ox = getComputedStyle(p).overflowX;
                if (ox === "visible")
                    continue;
                // body/html with overflow-x hidden/clip: the page cannot scroll sideways, the bleed is decorative
                if (p === document.body || p === document.documentElement) {
                    clipped = true;
                    break;
                }
                const pr = p.getBoundingClientRect();
                if (pr.right <= vw + 1 && pr.left >= -1) {
                    clipped = true;
                    break;
                }
            }
            if (!clipped)
                out.push({ what: `extends to x=${Math.round(r.left)}..${Math.round(r.right)} (viewport ${vw})`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
        }
    }
    // one wide container drags all its descendants past the edge: list 15, count the rest out loud (never drop them)
    if (out.length > 16)
        return [...out.slice(0, 15), { what: `+${out.length - 15} more elements extend past the viewport (not listed one by one)`, where: "page" }];
    return out;
});
/**
 * 2.10 — a control stays inside the card it sits in, and no container cuts it off.
 *
 * horizontalOverflow measures against the viewport only, and passes anything a clipping ancestor cuts off as
 * decorative bleed. A button wider than its card is neither: Praxis (2026-10) had "See all example profiles" 73 px
 * past its hero card at 1440 — still on screen, so not reported — and 200 px past it at 390, where the hero's
 * overflow:hidden clipped it and the check called that bleed. Relaygpu's contact form let a long topic push its
 * dropdown 43 px past the card on a phone.
 *
 * For every control: the nearest ancestor that paints a box (a fill, all four borders, or a shadow) narrower than the
 * viewport is its card, and the control must fit inside it; an ancestor that clips must not cut it. Skipped as
 * deliberate: anything absolutely/fixed placed between the control and the box (a close button hung on a corner, a
 * skip link), scrollers, inactive carousel slides (aria-hidden, or a clipper whose content runs a slide or more past
 * it). Controls that look alike (same tag, classes and overflow) are reported once with a count.
 */
export const escapesBox = (page) => page.evaluate(() => {
    const W = window;
    const out = [];
    const vw = document.documentElement.clientWidth;
    const clear = (c) => !c || c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
    const paints = (el) => {
        const cs = getComputedStyle(el);
        if (!clear(cs.backgroundColor) || cs.backgroundImage !== "none" || cs.boxShadow !== "none")
            return true;
        return ["Top", "Right", "Bottom", "Left"].every((s) => parseFloat(cs[`border${s}Width`]) > 0 && !clear(cs[`border${s}Color`]));
    };
    const CONTROL = 'a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=combobox], [role=switch], [role=tab], [role=link]';
    const groups = new Map();
    for (const el of Array.from(document.querySelectorAll(CONTROL))) {
        if (!W.__uiVisible(el) || el.closest('[aria-hidden="true"], [inert]'))
            continue;
        if (el.parentElement && el.parentElement.closest(CONTROL))
            continue; // the outer control is the one measured
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4)
            continue;
        let finding = null;
        for (let child = el, a = el.parentElement; a && a !== document.body && a !== document.documentElement; child = a, a = a.parentElement) {
            // placed on purpose: whatever hangs off a box by absolute/fixed position is not escaping it
            if (/^(absolute|fixed)$/.test(getComputedStyle(child).position))
                break;
            const cs = getComputedStyle(a);
            if (/(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflowY))
                break; // a scroller: its content is meant to run past it
            const q = a.getBoundingClientRect();
            const past = Math.round(Math.max(r.right - q.right, q.left - r.left, r.bottom - q.bottom, q.top - r.top));
            const clips = /(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflowY);
            if (clips && past > 1) {
                // a carousel's viewport: its track runs a slide or more past it, and the slide outside it is not cut by mistake
                if (a.scrollWidth - a.clientWidth >= r.width || a.scrollHeight - a.clientHeight >= r.height)
                    break;
                finding = { what: `is cut off by its container: ${past}px of it is clipped (${Math.round(r.width)}px wide in a ${Math.round(q.width)}px box) [2.10, P16]`, box: a };
                break;
            }
            if (paints(a) && q.width < vw - 2) {
                if (past > 2)
                    finding = { what: `sticks out of its card by ${past}px (${Math.round(r.width)}px wide in a ${Math.round(q.width)}px card) [2.10, P16]`, box: a };
                break; // the card it sits in fits it
            }
        }
        if (!finding)
            continue;
        const sig = [el.tagName, typeof el.className === "string" ? el.className : "", finding.what.replace(/\d+px/g, "")].join("|");
        const g = groups.get(sig);
        if (g) {
            g.count++;
            continue;
        }
        groups.set(sig, { count: 1, f: { what: finding.what, where: `${W.__uiDescribe(el)} in ${W.__uiDescribe(finding.box)}`, selector: W.__uiSelector(el), human: W.__uiHuman(el) } });
    }
    for (const { count, f } of groups.values())
        out.push(count > 1 ? { ...f, where: `${f.where} (and ${count - 1} more like it)` } : f);
    return out;
});
/**
 * 1.1 — no native select / date / file / checkbox / radio rendered. A select, checkbox or radio with
 * `appearance: none` is drawn by the product (a kit tick box keeps the real input for forms and the keyboard), so it
 * is not the operating system's control; date and file inputs open system pickers whatever they look like.
 */
// root: scope to part of the page (an open dialog). <select> always counts: appearance:none only restyles
// the closed box, its open list is still drawn by the OS (TrueLogos /contact, 2026-10). A checkbox/radio
// with appearance:none is drawn by the site and does not count.
const NATIVE_SEL = 'select, input[type=date], input[type=datetime-local], input[type=month], input[type=week], input[type=time], input[type=file], input[type=checkbox], input[type=radio], input[type=range], input[type=color]';
export const nativeControls = (page, root = null) => page.evaluate(({ sel, root }) => {
    const scopes = root ? Array.from(document.querySelectorAll(root)) : [document];
    return scopes.flatMap((sc) => Array.from(sc.querySelectorAll(sel)))
        .filter((el) => window.__uiVisible(el))
        .filter((el) => !(el.matches("input[type=checkbox], input[type=radio], input[type=range]") && getComputedStyle(el).appearance === "none"))
        .map((el) => ({
        what: `native <${el.tagName.toLowerCase()}${el.tagName === "INPUT" ? ` type=${el.type}` : ""}>${root ? " inside an open dialog/popover" : ""}`,
        where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el),
    }));
}, { sel: NATIVE_SEL, root });
/** 6.4 — text ≥12px, weight ≥400, not translucent. */
// root: a selector to scope the check to one part of the page (the open mobile menu panel)
export const illegibleText = (page, allowLightWeights = false, root = null) => page.evaluate(({ allowLightWeights, root }) => {
    const out = [];
    const eye = [];
    const scope = root ? document.querySelector(root) : document.body;
    if (!scope)
        return { hard: out, eye };
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || seen.has(el) || !(n.textContent || "").trim())
            continue;
        seen.add(el);
        if (!window.__uiVisible(el) || el.closest("svg, script, style, noscript"))
            continue;
        if (el.closest('[disabled], [aria-disabled="true"]'))
            continue; // disabled state has its own rule (1.17)
        const cs = getComputedStyle(el);
        const size = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const { ratio, overImage, opacity } = window.__uiContrast(el);
        // gradient-filled text (background-clip: text) or text over an image/gradient cannot be measured
        // from colours alone — report it for a human look, never fail on it
        let clipText = false;
        for (let p = el; p && !clipText; p = p.parentElement) {
            const pc = getComputedStyle(p);
            clipText = pc.backgroundClip === "text" || pc.webkitBackgroundClip === "text";
        }
        const bad = [];
        if (size < 12)
            bad.push(`${size}px`);
        // 6.4: body/nav text — weight ≥400 below 16px, ≥300 from 16px; display type ≥24px free. Projects may opt out (allow.lightWeights).
        if (!allowLightWeights && size < 24 && (weight < 300 || (weight < 400 && size < 16)))
            bad.push(`weight ${weight} at ${size}px`);
        // fully transparent through an ancestor (a reveal-on-scroll block not yet revealed, a closed tooltip):
        // nobody can read it, so there is no contrast to judge — visibility is not this check's question
        if (opacity < 0.01)
            continue;
        // translucency is judged by what it does to legibility: the ratio below already has the opacity of the text
        // and of every ancestor composited in (an opacity-80 caption at 9:1 is fine; one at 3.9:1 fails on contrast)
        // an endlessly pulsing opacity (a blinking "_" caret, animate-pulse) was sampled mid-pulse, so the ratio is
        // wherever the cycle happened to be (facet headings, 2026-10): a 1–2 character caret is decoration; longer
        // pulsing text goes to the eye list instead of failing on a random frame
        let pulsing = false;
        for (let p = el, i = 0; p && i < 3 && !pulsing; p = p.parentElement, i++)
            pulsing = (p.getAnimations ? p.getAnimations() : []).some((an) => an.effect && an.effect.getTiming && an.effect.getTiming().iterations === Infinity
                && an.effect.getKeyframes().some((k) => "opacity" in k));
        if (pulsing && ratio < (large ? 3 : 4.5)) {
            if ((n.textContent || "").trim().length > 2)
                eye.push({ what: `contrast ${ratio.toFixed(2)}:1 measured mid-pulse (endless opacity animation) — check the brightest frame by eye`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
        }
        else if (ratio < (large ? 3 : 4.5)) {
            if (clipText || overImage)
                eye.push({ what: `contrast ${clipText ? "of gradient-filled text" : "over image/gradient"} cannot be measured (${ratio.toFixed(2)}:1 vs solid) — check by eye`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
            else
                bad.push(`contrast ${ratio.toFixed(2)}:1${opacity < 0.95 ? ` (opacity ${opacity.toFixed(2)} included)` : ""}`);
        }
        if (bad.length)
            out.push({ what: bad.join(", "), where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
    }
    // every finding is reported: a dense page with 60 faint captions has 60 findings, not the first 40
    return { hard: out, eye };
}, { allowLightWeights, root });
/** 1.12 — no emoji in visible text. */
// An emoji is on the page whether or not a reveal has faded it in yet, and an aria-hidden "icon" span is exactly
// how emoji-as-icons are written: only display:none / visibility:hidden / no box / [hidden] / sr-only clips hide it.
// (truelogos.pro, 2026-10: emoji chips in aria-hidden spans inside whileInView reveals that replay were missed.)
export const emoji = (page) => page.evaluate(() => {
    const re = /\p{Extended_Pictographic}/u;
    const ok = new Set(["©", "®", "™"]);
    const out = [];
    const present = (el) => {
        if (el.closest("[hidden], .sr-only, script, style, noscript, template"))
            return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden")
            return false;
        const r = el.getBoundingClientRect(); // 0×0 under a display:none ancestor
        return !(r.width <= 1 && r.height <= 1);
    };
    const first = (t) => [...(t || "")].find((c) => re.test(c) && !ok.has(c));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const ch = first(n.textContent);
        if (ch && n.parentElement && present(n.parentElement))
            out.push({ what: `emoji ${ch}`, where: window.__uiDescribe(n.parentElement), selector: window.__uiSelector(n.parentElement), human: window.__uiHuman(n.parentElement) });
    }
    // CSS-generated ones: content: "🔥" on ::before / ::after
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
        for (const pseudo of ["::before", "::after"]) {
            const c = getComputedStyle(el, pseudo).content;
            const ch = c && c !== "none" && c !== "normal" ? first(c) : null;
            if (ch && present(el))
                out.push({ what: `emoji ${ch} (CSS ${pseudo})`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
        }
    }
    return out;
});
/** 6.10 — raster images delivered at ≥2× their rendered size (≥1.5× tolerated). Run with deviceScaleFactor 2 so srcset picks the retina candidate. */
export const lowResImages = (page) => page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((img) => img.complete && img.naturalWidth > 0 && window.__uiVisible(img) && !/\.svg(\?|$)/i.test(img.currentSrc || img.src));
    const out = [];
    for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.width < 48)
            continue;
        // naturalWidth is density-corrected when srcset uses w-descriptors — load the file to get real pixels
        const src = img.currentSrc || img.src;
        const real = await new Promise((res) => {
            const i = new Image();
            i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
            i.onerror = () => res({ w: img.naturalWidth, h: img.naturalHeight });
            i.src = src;
        });
        const fit = getComputedStyle(img).objectFit;
        const kx = real.w / r.width, ky = real.h / r.height;
        // cover/fill crop or stretch → limited by the smaller factor; contain → by the larger
        const ratio = fit === "contain" || fit === "scale-down" ? Math.max(kx, ky) : Math.min(kx, ky);
        if (ratio < 1.5)
            out.push({ what: `${real.w}×${real.h}px file shown at ${Math.round(r.width)}×${Math.round(r.height)} CSS px (${ratio.toFixed(2)}×)`, where: src.slice(0, 110) });
    }
    return out;
});
/** 3.3 — exactly one h1. */
export const h1Count = (page) => page.evaluate(() => Array.from(document.querySelectorAll("h1")).filter((h) => window.__uiVisible(h)).length);
/** 3.5 — the nav link for the current route carries aria-current="page". */
export const activeNav = (page) => page.evaluate(() => {
    const path = location.pathname.replace(/\/$/, "") || "/";
    // the brand/logo link points to "/" but is not a nav item; a "/" link counts only inside <nav>
    const isLogo = (a) => !!a.querySelector("img, svg") || /logo|brand/i.test(a.className + " " + (a.getAttribute("aria-label") || "")) || (new URL(a.href).pathname === "/" && !a.closest("nav"));
    const toHere = (a) => { try {
        const u = new URL(a.href);
        return u.origin === location.origin && ((u.pathname.replace(/\/$/, "") || "/") === path) && !u.hash;
    }
    catch {
        return false;
    } };
    const all = Array.from(document.querySelectorAll("header a[href], nav a[href]")).filter((a) => !isLogo(a) && toHere(a));
    let match = all.filter((a) => window.__uiVisible(a));
    // on a narrow screen the nav sits in a closed menu: aria-current is an attribute, it is checked there all the same
    // (before, a hidden nav made this test skip as "no nav link points to this route")
    if (!match.length)
        match = all;
    if (!match.length)
        return { applicable: false, ok: true, where: "" };
    return { applicable: true, ok: match.some((a) => a.getAttribute("aria-current") === "page"), where: match.map((a) => window.__uiDescribe(a)).join(" | ") };
});
/**
 * 3.5 — every width has navigation. On a narrow screen the header links are often hidden (`hidden md:flex`); then a
 * visible menu button must open them (aria-expanded / aria-controls / aria-haspopup, a "menu" label, a burger icon).
 * Hidden links with no such button leave the page with no way to the other sections on that width.
 */
export const navReachable = (page) => page.evaluate(() => {
    const W = window;
    if (Math.min(innerWidth, screen.width) >= 768)
        return [];
    const here = location.pathname.replace(/\/$/, "") || "/";
    const dest = (a) => { try {
        const u = new URL(a.href, location.href);
        return u.origin === location.origin ? (u.pathname.replace(/\/$/, "") || "/") : u.href;
    }
    catch {
        return null;
    } };
    const isLogo = (a) => (dest(a) === "/" && !!a.querySelector("img, svg")) || /logo|brand/i.test(a.className + " " + (a.getAttribute("aria-label") || ""));
    const links = Array.from(document.querySelectorAll("header a[href], nav a[href], [role=navigation] a[href]"))
        .filter((a) => !a.closest("footer, [role=contentinfo]") && !isLogo(a) && dest(a) && !/^(mailto|tel):/.test(a.getAttribute("href") || ""));
    const shown = new Set(links.filter((a) => W.__uiVisible(a)).map(dest));
    const hidden = new Map();
    for (const a of links)
        if (!W.__uiVisible(a) && !shown.has(dest(a)) && dest(a) !== here && !hidden.has(dest(a)))
            hidden.set(dest(a), (a.textContent || a.getAttribute("aria-label") || dest(a)).trim().replace(/\s+/g, " "));
    if (hidden.size < 2)
        return [];
    const toggle = Array.from(document.querySelectorAll("button, [role=button], summary, label[for], a[href^='#'], [aria-expanded], [aria-controls], [aria-haspopup]")).find((el) => {
        if (!W.__uiVisible(el) || el.closest("footer"))
            return false;
        if (el.matches("[aria-expanded], [aria-controls], [aria-haspopup]:not([aria-haspopup=false])"))
            return true;
        const label = [el.getAttribute("aria-label"), el.getAttribute("title"), el.textContent, typeof el.className === "string" ? el.className : "", el.id].join(" ");
        if (/menu|navigation|\bnav\b|burger|drawer|меню|навигац/i.test(label))
            return true;
        // an icon-only button in the header (three bars)
        return !!el.closest("header, [role=banner]") && !!el.querySelector("svg, img") && !(el.textContent || "").trim();
    });
    if (toggle)
        return [];
    const names = [...hidden.values()];
    return [{ what: `${names.length} nav links are hidden at ${innerWidth}px (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", …" : ""}) and there is no visible menu button — this width has no navigation [3.5, P10]`, where: "header / nav" }];
});
/** 3.8 — a fresh navigation lands at the top. */
export const scrollY = (page) => page.evaluate(() => window.scrollY);
/** 2.9 — header nav items stay on one line. */
export const wrappedNavItems = (page) => page.evaluate(() => {
    const lines = (el) => {
        // count visual lines of the text itself (not element height — padding/icons fake a "wrap")
        const tops = [];
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (!(n.textContent || "").trim())
                continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            const lh = parseFloat(getComputedStyle(n.parentElement).fontSize) * 0.6;
            for (const rc of Array.from(r.getClientRects()))
                if (rc.width > 0 && !tops.some((t) => Math.abs(t - rc.top) < lh))
                    tops.push(rc.top);
        }
        return tops.length;
    };
    return Array.from(document.querySelectorAll("header a, header button, nav a"))
        .filter((el) => window.__uiVisible(el) && (el.textContent || "").trim().length > 0 && lines(el) > 1)
        .map((el) => ({ what: "nav item wraps onto two lines", where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) }));
});
/** 2.12 — text blocks must not overlap each other (sampled). */
export const overlappingText = (page) => page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,li,a,button,label,span"))
        .filter((el) => window.__uiVisible(el) && el.children.length === 0 && (el.textContent || "").trim().length > 1);
    const out = [];
    for (const el of els) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cy < 0 || cy > innerHeight || cx < 0 || cx > innerWidth)
            continue;
        const top = document.elementFromPoint(cx, cy);
        if (!top || el.contains(top) || top.contains(el))
            continue;
        const cs = getComputedStyle(top);
        const covering = (top.textContent || "").trim().length > 0 && cs.pointerEvents !== "none" && Number(cs.opacity) > 0.1 && cs.backgroundColor !== "rgba(0, 0, 0, 0)";
        // fixed/sticky layers (header, cookie banner, toasts) are judged by their own checks (3.6, 4.6)
        let layered = false;
        for (let p = top; p; p = p.parentElement) {
            const pos = getComputedStyle(p).position;
            if (pos === "fixed" || pos === "sticky") {
                layered = true;
                break;
            }
        }
        if (covering && !layered && !top.closest("header, [role=dialog]"))
            out.push({ what: "text covered by another element", where: `${window.__uiDescribe(el)} under ${window.__uiDescribe(top)}` });
    }
    return out;
});
/** 4.6 — cookie banner must not cover navigation or the menu button. */
export const cookieCovers = (page) => page.evaluate(() => {
    const banner = Array.from(document.querySelectorAll('[class*=cookie i], [id*=cookie i], [aria-label*=cookie i], [class*=consent i], [id*=consent i]'))
        .find((el) => window.__uiVisible(el) && ["fixed", "sticky"].includes(getComputedStyle(el).position));
    if (!banner)
        return [];
    const targets = Array.from(document.querySelectorAll('header a, header button, nav a, [aria-label*=menu i]')).filter((el) => window.__uiVisible(el) && !banner.contains(el));
    return targets
        .filter((el) => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && banner.contains(t); })
        .map((el) => ({ what: "covered by cookie banner", where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) }));
});
/** 6.9 — underline is a link affordance only. */
export const fakeLinks = (page) => page.evaluate(() => Array.from(document.querySelectorAll("body *"))
    .filter((el) => window.__uiVisible(el) && el.children.length === 0 && (el.textContent || "").trim())
    .filter((el) => getComputedStyle(el).textDecorationLine.includes("underline") && !el.closest("a, button, [role=button], [role=link], abbr, summary, label"))
    .map((el) => ({ what: "underlined text that is not a link", where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) })));
/** 2.13 — cumulative layout shift. */
export const cls = (page) => page.evaluate(() => window.__cls);
/** Focus indicator visible when tabbing (1.9): focused styles must differ from the unfocused ones. */
export async function focusVisible(page, presses = 8) {
    const out = [];
    await page.mouse.click(1, 1).catch(() => { });
    // Styles are compared after transitions settle: a kit button with `transition-all` draws its focus ring over
    // 150-300 ms, and a same-frame comparison read the ring's starting value as "no focus style".
    // The probed element can leave the page between samples (a component re-renders on focus/blur, a banner
    // closes): every step tolerates a missing probe and the element is skipped instead of crashing the check.
    const look = () => page.evaluate(() => {
        const el = document.querySelector("[data-ui-focus-probe]");
        if (!el || !el.isConnected)
            return null;
        const pick = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.color, cs.borderColor, cs.textDecorationLine, cs.transform].join("|");
        return pick(getComputedStyle(el)) + pick(getComputedStyle(el, "::after")) + pick(getComputedStyle(el, "::before"));
    });
    for (let i = 0; i < presses; i++) {
        await page.keyboard.press("Tab");
        const where = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || !(el instanceof Element) || el === document.body || !window.__uiVisible(el))
                return null;
            el.setAttribute("data-ui-focus-probe", "1");
            return window.__uiDescribe(el);
        });
        if (!where)
            continue;
        await settle(page, 800);
        const focused = await look();
        await page.evaluate(() => document.querySelector("[data-ui-focus-probe]")?.blur());
        await settle(page, 800);
        const plain = await look();
        // focus goes back where Tab left it, so the next Tab continues the order
        await page.evaluate(() => { const el = document.querySelector("[data-ui-focus-probe]"); if (!el) return; el.removeAttribute("data-ui-focus-probe"); el.focus({ preventScroll: true }); });
        if (focused === null || plain === null)
            continue;
        if (focused === plain && !out.some((o) => o.where === where))
            out.push({ what: "focused element looks identical to unfocused", where });
    }
    return out;
}
/** 1.11 — the logo link hugs the logo: its box is no wider than its content (mark + wordmark) plus padding. */
export const logoLink = (page) => page.evaluate(() => {
    const out = [];
    for (const a of Array.from(document.querySelectorAll("header a[href], footer a[href]"))) {
        if (!a.querySelector("img, svg") || !window.__uiVisible(a))
            continue;
        const u = new URL(a.href, location.href);
        if (u.pathname !== "/" || u.origin !== location.origin)
            continue;
        const r = document.createRange();
        r.selectNodeContents(a);
        const content = r.getBoundingClientRect();
        const box = a.getBoundingClientRect();
        if (box.width > content.width + 32 || box.height > content.height + 32)
            out.push({ what: `logo link box ${Math.round(box.width)}×${Math.round(box.height)} around ${Math.round(content.width)}×${Math.round(content.height)} content`, where: window.__uiDescribe(a), selector: window.__uiSelector(a), human: window.__uiHuman(a) });
    }
    return out;
});
/* ───────────────────────── rows: 2.6 / 2.12 / 1.7 (P27 P48 P55) ───────────────────────── */
/**
 * Groups of sibling "cards" laid out in one row (grid/flex children with similar width and the same top).
 * For each row: equal heights (2.6), CTAs on one line (P27), prices on one line (P27), no double seams (P55).
 */
export const rowAlignment = (page) => page.evaluate(() => {
    const W = window;
    const out = [];
    const isCardish = (el) => {
        const cs = getComputedStyle(el);
        const border = ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(cs[`border${s}Width`]) > 0);
        const shadow = cs.boxShadow && cs.boxShadow !== "none";
        const bg = W.__uiRGBA(cs.backgroundColor)[3] > 0.02 || (cs.backgroundImage && cs.backgroundImage !== "none" && !/url\(/.test(cs.backgroundImage));
        return border || shadow || bg;
    };
    const PRICE = /([$€£¥₽]\s?\d|\d[\d,. ]*\s?(€|\$|£|₽|credits?\b|\/\s?(mo|month|yr|year)))/i;
    const firstMatch = (root, test) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        for (let n = w.nextNode(); n; n = w.nextNode())
            if (W.__uiVisible(n) && test(n))
                return n;
        return null;
    };
    const lastMatch = (root, test) => {
        const all = Array.from(root.querySelectorAll("*")).filter((n) => W.__uiVisible(n) && test(n));
        return all[all.length - 1] || null;
    };
    const isCta = (e) => (e.matches("a[href], button, [role=button]") && e.getBoundingClientRect().height >= 28 && (e.textContent || "").trim().length > 0);
    const isPrice = (e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && PRICE.test(n.textContent || "")) && parseFloat(getComputedStyle(e).fontSize) >= 18;
    const spread = (xs) => Math.max(...xs) - Math.min(...xs);
    const containers = Array.from(document.querySelectorAll("body *")).filter((el) => {
        const d = getComputedStyle(el).display;
        return (d.includes("grid") || d.includes("flex")) && W.__uiVisible(el);
    });
    const seen = new Set();
    // a child that is on screen for real: mostly inside the viewport horizontally (not a carousel slide parked off to
    // the side) and showing something (a panel whose content is all hidden at this width is an empty frame)
    const onScreen = (k) => {
        const r = k.getBoundingClientRect();
        const vis = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
        if (vis < r.width * 0.5)
            return false;
        if ((k.innerText || "").trim())
            return true;
        return Array.from(k.querySelectorAll("img, svg, video, canvas, picture, input, button")).some((m) => W.__uiVisible(m));
    };
    // page-level layout: a split screen (marketing panel + form in a min-h-screen flex), a form beside a sticky
    // summary — panels of the page, not a row of cards
    const fields = (k) => k.querySelectorAll("input:not([type=hidden]), textarea, select, [role=combobox]").length;
    const layoutRow = (row) => {
        if (row.length > 3)
            return false;
        const rects = row.map((k) => k.getBoundingClientRect());
        const span = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
        if (span < innerWidth * 0.6)
            return false;
        // a sticky panel (the aside itself or the box inside it) is a sidebar
        const sticky = (k) => [k, ...Array.from(k.children), ...Array.from(k.children).flatMap((x) => Array.from(x.children))].some((n) => getComputedStyle(n).position === "sticky");
        if (row.some(sticky))
            return true;
        // screen-tall panels side by side; tall pricing cards (each with a price) stay a row of offers
        if (rects.every((r) => r.width >= innerWidth * 0.3) && rects.some((r) => r.height >= innerHeight * 0.9) && !row.every((k) => firstMatch(k, isPrice)))
            return true;
        const f = row.map(fields);
        return f.some((n) => n >= 2) && f.some((n) => n === 0);
    };
    for (const c of containers) {
        const kids = Array.from(c.children).filter((k) => W.__uiVisible(k) && k.getBoundingClientRect().width >= 140 && k.getBoundingClientRect().height >= 60
            // floating layers and CTA buttons are not cards
            && !W.__uiOverlay(k) && !W.__uiButtonLike(k, true) && onScreen(k));
        if (kids.length < 2)
            continue;
        // group into visual rows by top edge
        const rows = [];
        for (const k of kids) {
            const t = k.getBoundingClientRect().top;
            const row = rows.find((r) => Math.abs(r[0].getBoundingClientRect().top - t) <= 4);
            row ? row.push(k) : rows.push([k]);
        }
        for (const row of rows) {
            if (row.length < 2)
                continue;
            const rects = row.map((k) => k.getBoundingClientRect());
            const widths = rects.map((r) => r.width);
            if (Math.max(...widths) / Math.min(...widths) > 1.3)
                continue; // not a row of peers
            if (layoutRow(row))
                continue; // page panels, not cards
            const where = W.__uiDescribe(c);
            // the row itself gets the frame in Studio (and a Before/After for its fix)
            const at = { selector: W.__uiSelector(c), human: W.__uiHuman(c) };
            if (seen.has(where))
                continue;
            const cardish = row.every(isCardish);
            const ctas = row.map((k) => lastMatch(k, isCta));
            const prices = row.map((k) => firstMatch(k, isPrice));
            // offer cards (each has a CTA or a price) must match heights; bento/masonry/editorial tiles may not
            const offers = row.every((_, i) => ctas[i] || prices[i]);
            if (cardish && offers && spread(rects.map((r) => r.height)) > 2) {
                out.push({ what: `offer cards in one row have different heights (${rects.map((r) => Math.round(r.height)).join("/")}px) [2.6, P27]`, where, ...at });
                seen.add(where);
            }
            // peers must share one look: radius + padding always; filled-or-clear/border/shadow may differ on ONE card
            // (featured). The fill's hue is not a look: per-item colours (category tiles, a logo wall) are content.
            // Tiles that are mostly a picture frame it, so their box is not compared.
            if (cardish && !row.some((k) => W.__uiMediaTile(k))) {
                const st = row.map((k) => {
                    const cs = getComputedStyle(k);
                    const bw = ["Top", "Right", "Bottom", "Left"].map((s) => (W.__uiRGBA(cs[`border${s}Color`])[3] > 0.05 ? cs[`border${s}Width`] : "0px")).join(" ");
                    return {
                        shape: `radius ${cs.borderTopLeftRadius} / padding ${cs.paddingTop} ${cs.paddingLeft}`,
                        skin: `${W.__uiRGBA(cs.backgroundColor)[3] > 0.02 || /gradient/.test(cs.backgroundImage) ? "filled" : "clear"} / border ${bw} / shadow ${cs.boxShadow === "none" ? "none" : "yes"}`,
                    };
                });
                const shapes = new Set(st.map((x) => x.shape));
                const skins = new Map();
                st.forEach((x) => skins.set(x.skin, (skins.get(x.skin) || 0) + 1));
                const minority = [...skins.values()].sort((a, b) => b - a).slice(1).reduce((a, b) => a + b, 0);
                if (shapes.size > 1 || minority > 1) {
                    out.push({ what: `cards in one row are styled differently [1.16, P46 P47]: ${shapes.size > 1 ? [...shapes].join(" | ") : [...skins.keys()].join(" | ")}`, where, ...at });
                    seen.add(where);
                }
            }
            if (ctas.every(Boolean)) {
                const tops = ctas.map((e) => e.getBoundingClientRect().top);
                if (spread(tops) > 3) {
                    out.push({ what: `CTAs in one row sit at different heights (Δ${Math.round(spread(tops))}px) [2.6, P27]`, where, ...at });
                    seen.add(where);
                }
            }
            if (prices.every(Boolean)) {
                const tops = prices.map((e) => e.getBoundingClientRect().top);
                if (spread(tops) > 3) {
                    out.push({ what: `prices in one row sit at different heights (Δ${Math.round(spread(tops))}px) [2.6, P27]`, where, ...at });
                    seen.add(where);
                }
            }
            // double seams: touching neighbours both drawing a border on the shared edge
            const sorted = row.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            for (let i = 1; i < sorted.length; i++) {
                const a = sorted[i - 1], b = sorted[i];
                const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
                if (Math.abs(rb.left - ra.right) <= 1 && parseFloat(getComputedStyle(a).borderRightWidth) > 0 && parseFloat(getComputedStyle(b).borderLeftWidth) > 0) {
                    out.push({ what: "double border between touching neighbours [1.7, P55]", where, ...at });
                    seen.add(where);
                    break;
                }
            }
        }
        // vertical stacks: touching rows both drawing the shared border (P55)
        const stack = kids.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        for (let i = 1; i < stack.length; i++) {
            const a = stack[i - 1], b = stack[i];
            const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            if (Math.abs(rb.top - ra.bottom) <= 1 && Math.abs(ra.left - rb.left) <= 2 && parseFloat(getComputedStyle(a).borderBottomWidth) > 0 && parseFloat(getComputedStyle(b).borderTopWidth) > 0) {
                const where = W.__uiDescribe(c);
                if (!seen.has(where)) {
                    out.push({ what: "double border between stacked rows [1.7, P55]", where, selector: W.__uiSelector(c), human: W.__uiHuman(c) });
                    seen.add(where);
                }
                break;
            }
        }
    }
    return out;
});
/** 2.12 — repeated rows (label/value, price lists): each column keeps one position across rows (P48). */
export const repeatedRowColumns = (page) => page.evaluate(() => {
    const W = window;
    const out = [];
    for (const list of Array.from(document.querySelectorAll("body *"))) {
        const rows = Array.from(list.children).filter((r) => { const d = getComputedStyle(r).display; return W.__uiVisible(r) && (d.includes("flex") || d.includes("grid")); });
        if (rows.length < 3)
            continue;
        const cols = rows.map((r) => Array.from(r.children).filter((k) => W.__uiVisible(k)));
        const n = cols[0].length;
        if (n < 2 || !cols.every((c) => c.length === n))
            continue;
        const rr = rows.map((r) => r.getBoundingClientRect());
        if (Math.max(...rr.map((r) => r.width)) - Math.min(...rr.map((r) => r.width)) > 2)
            continue;
        if (Math.max(...rr.map((r) => r.left)) - Math.min(...rr.map((r) => r.left)) > 2)
            continue;
        // rows must be stacked vertically
        if (new Set(rr.map((r) => Math.round(r.top))).size < rows.length)
            continue;
        for (let i = 1; i < n; i++) {
            const rects = cols.map((c) => c[i].getBoundingClientRect());
            const sp = (xs) => Math.max(...xs) - Math.min(...xs);
            const ok = [rects.map((r) => r.left), rects.map((r) => r.right), rects.map((r) => r.left + r.width / 2)].some((xs) => sp(xs) <= 3);
            if (!ok) {
                out.push({ what: `column ${i + 1} shifts between rows (Δ${Math.round(sp(rects.map((r) => r.left)))}px) [2.12, P48]`, where: W.__uiDescribe(list), selector: W.__uiSelector(list), human: W.__uiHuman(list) });
                break;
            }
        }
    }
    return out;
});
/** 5.1 — never radius + visible scrollbar on the same element (P21). */
export const scrollbarRadius = (page) => page.evaluate(() => {
    const W = window;
    return Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
        if (!W.__uiVisible(el))
            return false;
        const cs = getComputedStyle(el);
        const scrolls = (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1);
        const bar = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) > 0 ||
            el.offsetHeight - el.clientHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth) > 0;
        return scrolls && bar && parseFloat(cs.borderTopRightRadius) > 0;
    })
        .map((el) => ({ what: "scroll container has rounded corners — the scrollbar cuts the radius [5.1, P21]", where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) }));
});
/** 1.9 — inputs visible at rest: border ≥3:1 against the surface, or a distinct fill (P09). */
export const inputVisibility = (page) => page.evaluate(() => {
    const W = window;
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const surface = (el) => { for (let p = el.parentElement; p; p = p.parentElement) {
        const c = W.__uiRGBA(getComputedStyle(p).backgroundColor);
        if (c[3] >= 0.99)
            return c;
    } return [255, 255, 255, 1]; };
    const mix = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3]));
    return Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [role=combobox]'))
        .filter((el) => W.__uiVisible(el) && el.getBoundingClientRect().width > 40)
        // a dropdown trigger in the header / nav / footer outside any form is a nav control (currency, language),
        // drawn like the links beside it — 1.9 is about form fields, it does not ask a nav pill for a field edge
        .filter((el) => !(el.matches("[role=combobox]:not(input)") && !el.closest("form") && el.closest("header, nav, footer, [role=navigation], [role=banner], [role=contentinfo]")))
        .map((el) => {
        const cs = getComputedStyle(el);
        const bg = surface(el);
        const fill = mix(W.__uiRGBA(cs.backgroundColor), bg);
        const bw = parseFloat(cs.borderBottomWidth);
        const border = mix(W.__uiRGBA(cs.borderBottomColor), fill);
        const borderOk = bw > 0 && ratio(border, bg) >= 3;
        const fillOk = ratio(fill, bg) >= 1.25;
        if (borderOk || fillOk) return null;
        // the edge is often drawn by a wrapper (div.border-4 around a bare input, an icon + input "field" box with
        // focus-within): an ancestor that hugs the input (a few px taller, a little wider for an icon or a button)
        // and holds no other text field is the field's visible boundary
        const ir = el.getBoundingClientRect();
        for (let p = el.parentElement, i = 0; p && p !== document.body && i < 4; p = p.parentElement, i++) {
            const pr = p.getBoundingClientRect();
            // 32: a py-3 + border-2 field box is 28px taller than its bare input (forge hourly rate, 2026-10)
            if (pr.height - ir.height > 32 || pr.width - ir.width > Math.max(96, ir.width * 0.5))
                break;
            if (p.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select").length > 1)
                break;
            const pcs = getComputedStyle(p);
            const pbg = surface(p);
            const pfill = mix(W.__uiRGBA(pcs.backgroundColor), pbg);
            const edge = ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(pcs[`border${s}Width`]) > 0 && ratio(mix(W.__uiRGBA(pcs[`border${s}Color`]), pfill), pbg) >= 3);
            if (edge || ratio(pfill, pbg) >= 1.25)
                return null;
        }
        // the lightest edge that passes: the same colour moved toward the text side only as far as 3:1 needs —
        // a much darker edge passes too, but reads harsh (the fix should not overshoot)
        const target = lum(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
        const start = bw > 0 ? border : fill;
        let lo = 0, hi = 1;
        for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; const c = start.map((v, i) => v + (target[i] - v) * t); if (ratio(c, bg) >= 3.05) hi = t; else lo = t; }
        const hex = "#" + start.map((v, i) => Math.round(v + (target[i] - v) * hi).toString(16).padStart(2, "0")).join("");
        return { what: `input barely visible at rest (border ${bw ? ratio(border, bg).toFixed(2) + ":1" : "none"}, fill ${ratio(fill, bg).toFixed(2)}:1; lightest passing edge ${hex}) [1.9, P09]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) };
    })
        .filter(Boolean);
});
/** 1.4 — hovering a button keeps its label readable (P06). */
export async function hoverContrast(page, max = 12) {
    return (await hoverContrastDetailed(page, max)).hard;
}
/**
 * 1.4 with the cases colours alone cannot settle: a label over a gradient or a picture, or over a translucent pill
 * whose backdrop is a sibling layer (a dark hero), not an ancestor. When the colour arithmetic says < 3:1, the
 * label is hidden for one frame, the pixels behind it are captured and the label colour is measured against them
 * (the worst 10% of them decide). Only when the pixels cannot be read does an image/gradient case go to `eye`
 * ("check by eye") instead of failing. Disabled controls are exempt (WCAG 1.4.3).
 */
export async function hoverContrastDetailed(page, max = 12) {
    const hard = [], eye = [];
    const handles = await page.$$("button, a[role=button], [role=button], [class*=btn], [data-slot=button]");
    let n = 0;
    for (const h of handles) {
        if (n >= max)
            break;
        const ok = await h.evaluate((el) => el.getRootNode() === document && window.__uiVisible(el) && (el.textContent || "").trim().length > 0 && el.getBoundingClientRect().top < innerHeight * 3
            && !el.matches(":disabled") && !el.closest('[disabled], [aria-disabled="true"], [inert]')).catch(() => false);
        if (!ok)
            continue;
        n++;
        // centred, so a fixed header or cookie banner is not sitting on it (it would take the hover and the pixels)
        await h.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })).catch(() => { });
        await uncover(h);
        await h.hover({ timeout: 1500 }).catch(() => { });
        await page.waitForTimeout(100);
        await settle(page, 1000); // let colour transitions finish (some run 500 ms)
        const r = await h.evaluate((el) => {
            const W = window;
            let t = el;
            const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = w.nextNode(); n; n = w.nextNode())
                if ((n.textContent || "").trim()) {
                    t = n.parentElement;
                    break;
                }
            const c = W.__uiContrast(t);
            return c.ratio < 3 ? { ratio: c.ratio, overImage: c.overImage, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) } : null;
        }).catch(() => null);
        if (!r)
            continue;
        const px = await pixelContrast(page, h).catch(() => null);
        const at = { where: r.where, selector: r.selector, human: r.human };
        if (px != null) {
            if (px < 3)
                hard.push({ what: `label contrast on hover ${px.toFixed(2)}:1 against the pixels behind it [1.4, P06]`, ...at });
        }
        else if (r.overImage)
            eye.push({ what: `label on hover sits over an image/gradient (${r.ratio.toFixed(2)}:1 vs solid) — check by eye [1.4, P06]`, ...at });
        else
            hard.push({ what: `label contrast on hover ${r.ratio.toFixed(2)}:1 [1.4, P06]`, ...at });
    }
    await recover(page);
    await page.mouse.move(0, 0);
    return { hard, eye };
}
/**
 * Fixed/sticky layers (a cookie banner over half a phone screen, a sticky header) that sit on top of an element are
 * hidden while it is hovered and captured — otherwise they take the hover and their pixels are measured instead.
 * `recover` shows them again.
 */
async function uncover(handle) {
    await handle.evaluate((el) => {
        if (!document.getElementById("bs-hide-style")) {
            const st = document.createElement("style");
            st.id = "bs-hide-style";
            st.textContent = "[data-bs-hide] { visibility: hidden !important; }";
            document.head.appendChild(st);
        }
        const r = el.getBoundingClientRect();
        for (const [fx, fy] of [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
            for (let i = 0; i < 5; i++) {
                const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
                if (!top || el.contains(top) || top.contains(el))
                    break;
                let layer = null;
                for (let e = top; e && e !== document.body; e = e.parentElement) {
                    const pos = getComputedStyle(e).position;
                    if ((pos === "fixed" || pos === "sticky") && !e.contains(el))
                        layer = e;
                }
                if (!layer)
                    break;
                layer.setAttribute("data-bs-hide", "");
            }
        }
    }).catch(() => { });
}
const recover = (page) => page.evaluate(() => { for (const e of document.querySelectorAll("[data-bs-hide]")) e.removeAttribute("data-bs-hide"); document.getElementById("bs-hide-style")?.remove(); }).catch(() => { });
/**
 * Contrast of an element's text against what is actually painted behind it: the text is made transparent for a
 * frame, the area under the glyphs is captured, and the text colour (its alpha and opacity included) is composited
 * over each pixel. Returns the 10th-percentile ratio (the darkest/lightest part the text crosses, not one stray
 * anti-aliased pixel), or null when nothing could be captured.
 */
async function pixelContrast(page, handle) {
    const box = await handle.evaluate((el) => {
        const W = window;
        let t = el;
        const rects = [];
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (!(n.textContent || "").trim())
                continue;
            if (t === el)
                t = n.parentElement;
            const rg = document.createRange();
            rg.selectNodeContents(n);
            rects.push(...Array.from(rg.getClientRects()).filter((x) => x.width > 0 && x.height > 0));
        }
        if (!rects.length)
            return null;
        const L = Math.max(0, Math.min(...rects.map((x) => x.left))), T = Math.max(0, Math.min(...rects.map((x) => x.top)));
        const R = Math.min(innerWidth, Math.max(...rects.map((x) => x.right))), B = Math.min(innerHeight, Math.max(...rects.map((x) => x.bottom)));
        if (R - L < 2 || B - T < 2)
            return null;
        // the pixels say something about this label only where it is on top: a fixed cookie banner or header over it
        // would be measured instead (truelogos, 2026-10: "1.00:1" was the banner's white panel)
        const mine = (x, y) => { const top = document.elementFromPoint(x, y); return !!top && (el.contains(top) || top.contains(el)); };
        for (const x of rects)
            for (const [fx, fy] of [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5]])
                if (!mine(x.left + x.width * fx, x.top + x.height * fy))
                    return null;
        const fg = W.__uiContrast(t).fg;
        el.setAttribute("data-bs-px", "");
        const st = document.createElement("style");
        st.id = "bs-px-style";
        st.textContent = "[data-bs-px], [data-bs-px] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; transition: none !important; }";
        document.head.appendChild(st);
        return { x: L, y: T, width: R - L, height: B - T, fg };
    });
    if (!box)
        return null;
    let png;
    try {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height }, scale: "css" });
    }
    finally {
        await page.evaluate(() => { document.getElementById("bs-px-style")?.remove(); document.querySelector("[data-bs-px]")?.removeAttribute("data-bs-px"); }).catch(() => { });
    }
    return page.evaluate(async ({ b64, fg }) => {
        const img = await window.__uiDecode(b64);
        const d = img.data, ratios = [];
        for (let i = 0; i < d.length; i += 4) {
            const P = [d[i], d[i + 1], d[i + 2]];
            const T = [0, 1, 2].map((k) => fg[k] * fg[3] + P[k] * (1 - fg[3]));
            ratios.push(window.__uiRatio(T, P));
        }
        if (!ratios.length)
            return null;
        ratios.sort((a, b) => a - b);
        return ratios[Math.floor(ratios.length * 0.1)];
    }, { b64: png.toString("base64"), fg: box.fg });
}
/**
 * Waits until the finite animations and transitions running on the page have finished (at most `cap` ms), so an
 * overlay is measured where it lands and a hover colour where it settles: a sheet still sliding in is not "off-screen",
 * a label mid-transition is not "unreadable". Endless ones (spinners, marquees) are not waited for.
 */
async function settle(page, cap = 1500) {
    await page.evaluate((cap) => Promise.race([
        Promise.all(document.getAnimations()
            .filter((a) => { const t = a.effect?.getComputedTiming?.(); return a.playState === "running" && t && Number.isFinite(t.endTime); })
            .map((a) => a.finished.catch(() => { }))),
        new Promise((r) => setTimeout(r, cap)),
    ]), cap).catch(() => { });
}
/* ───────────────────────── interactive states: P02 P18 P19 P22 ───────────────────────── */
const openPopups = (page) => page.evaluate(() => {
    const W = window;
    return Array.from(document.querySelectorAll('[role=listbox], [role=menu], [role=dialog], [role=alertdialog], [data-radix-popper-content-wrapper], [data-state=open][role]'))
        .filter((el) => W.__uiVisible(el))
        .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const scrollable = [el, ...Array.from(el.querySelectorAll("*"))].some((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1);
        const clipped = r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1;
        const overflowing = el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== "visible" && !scrollable;
        return { where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el), role: el.getAttribute("role") || "popper", clipped, overflowing, rect: [r.top, r.bottom, r.left, r.right].map(Math.round) };
    });
});
const headerRect = (page) => page.evaluate(() => { const h = document.querySelector("header"); if (!h)
    return null; const r = h.getBoundingClientRect(); return [r.top, r.left, r.width].map(Math.round).join(","); });
/** Opens every dropdown/menu/dialog trigger on the page and checks the open state. */
export async function interactiveStates(page, max = 8) {
    const out = [];
    const triggers = await page.$$('[aria-haspopup]:not([aria-haspopup=false]), [role=combobox], button[aria-expanded=false]');
    let n = 0;
    for (const t of triggers) {
        if (n >= max)
            break;
        const info = await t.evaluate((el) => ({ vis: window.__uiVisible(el), link: el.matches("a[href]"), where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) })).catch(() => null);
        if (!info || !info.vis || info.link)
            continue;
        n++;
        const url = page.url();
        const before = await headerRect(page);
        await t.click({ timeout: 2000 }).catch(() => { });
        await page.waitForTimeout(350);
        await settle(page);
        if (page.url() !== url) {
            await page.goBack().catch(() => { });
            continue;
        }
        const after = await headerRect(page);
        if (before && after && before !== after)
            out.push({ what: `opening it moves the header (${before} → ${after}) [5.3/5.4, P22]`, where: info.where });
        // 1.1 inside what just opened: a dialog's form is not in the DOM at load, so the page-level
        // native-control check never sees it (TrueLogos "Cancel this project?" <select>, 2026-10).
        for (const n of await nativeControls(page, '[role=dialog], [role=alertdialog], [data-radix-popper-content-wrapper]'))
            out.push({ what: `${n.what} [1.1, P01]`, where: n.where });
        for (const p of await openPopups(page)) {
            if (p.clipped)
                out.push({ what: `open ${p.role} goes off-screen (top/bottom/left/right ${p.rect.join("/")}) [1.2, P02]`, where: p.where });
            if (p.overflowing)
                out.push({ what: `open ${p.role} clips its content without scrolling [5.2, P18]`, where: p.where });
        }
        const hx = await horizontalOverflow(page);
        if (hx.length)
            out.push({ what: `opening it causes horizontal overflow: ${hx[0].what} [2.1]`, where: info.where });
        await page.keyboard.press("Escape").catch(() => { });
        await page.waitForTimeout(200);
    }
    return out;
}
/* ───────────────────────── overlay motion: 6.12 P59 ───────────────────────── */
/**
 * 6.12 — every overlay (dropdown, menu, popover, dialog, sheet) opens AND closes with motion, however it is built:
 * a headless-UI part, or a hand-made `{open && <div className="absolute …">}`. Measured, not guessed: the page
 * records the layers that appear on click and disappear on Escape / outside click, frame by frame, and any CSS
 * animation, transition, Web Animation or per-frame opacity/transform/size change on the layer counts as motion.
 * Triggers: anything that says it opens something (aria-haspopup / aria-expanded / combobox / data-state) and
 * buttons that look like one (a short label + a trailing chevron icon). Submit buttons are never clicked.
 */
export async function overlayMotion(page, max = 10) {
    const out = [];
    await page.evaluate(() => {
        const W = window;
        if (W.__bsOverlayProbe)
            return;
        // positioned (absolute/fixed) visible boxes of some size — a popup is always one of these
        const positioned = () => {
            const set = new Set();
            for (const el of document.body.querySelectorAll("*")) {
                if (el.closest("[data-babysitter], babysitter-studio"))
                    continue;
                const cs = getComputedStyle(el);
                if ((cs.position !== "absolute" && cs.position !== "fixed") || cs.display === "none" || cs.visibility === "hidden")
                    continue;
                const r = el.getBoundingClientRect();
                if (r.width * r.height < 1500 || r.bottom < 0 || r.top > innerHeight)
                    continue;
                set.add(el);
            }
            return set;
        };
        // the element and what it rides on: a panel inside a cookie banner that slides away as a whole moves too
        const chain = (el) => { const out = []; for (let n = el.parentElement, i = 0; n && n !== document.body && i < 8; n = n.parentElement, i++) out.push(n); return out; };
        const look = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return [cs.opacity, cs.transform, cs.scale, cs.translate, cs.clipPath, Math.round(r.height), Math.round(r.width), ...chain(el).map((n) => { const c = getComputedStyle(n); return c.opacity + c.transform + c.translate; })].join("|"); };
        const running = (a) => a.playState === "running" || a.playState === "pending";
        const animated = (el) => { try { return el.getAnimations({ subtree: true }).some(running) || chain(el).some((n) => n.getAnimations().some(running)); } catch { return false; } };
        // checkVisibility also sees content-visibility:hidden (a closed <details> keeps its box but is not shown)
        const shown = (el) => (typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) : getComputedStyle(el).visibility !== "hidden");
        const alive = (el) => { if (!el.isConnected) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && shown(el) && r.width * r.height > 0; };
        const P = (W.__bsOverlayProbe = { events: [], run: null, last: null });
        for (const t of ["animationstart", "transitionstart", "transitionrun"])
            document.addEventListener(t, (e) => P.events.push({ t: performance.now(), el: e.target }), true);
        // Motion that fires no CSS events, recorded as it starts — not sampled, so a busy machine that skips frames
        // cannot miss it: Web Animations (framer-motion, element.animate) and JS that rewrites style= every frame (GSAP)
        const origAnimate = Element.prototype.animate;
        Element.prototype.animate = function (...args) { P.events.push({ t: performance.now(), el: this }); return origAnimate.apply(this, args); };
        const styleWrites = new Map(); // element → count of style= rewrites in the current window
        new MutationObserver((list) => { for (const m of list) { const n = (styleWrites.get(m.target) || 0) + 1; styleWrites.set(m.target, n); if (n === 3) P.events.push({ t: performance.now(), el: m.target }); } })
            .observe(document.documentElement, { attributes: true, attributeFilter: ["style"], subtree: true });
        /** Watch what appears (phase "open": positioned boxes that were not there before the click — the outermost
         *  of them) or how the opened one leaves (phase "close") over the next ~500 ms, frame by frame. */
        // what is visible near the trigger: a disclosure (accordion item, "show more", <details>) expands in place,
        // not as a positioned layer — its panel is a new visible box next to the trigger, or the aria-controls target
        const visibleNear = (trigger) => {
            const set = new Set();
            const box = trigger && (trigger.closest("li, section, article, [data-state], details") || (trigger.parentElement && trigger.parentElement.parentElement));
            if (!box) return set;
            for (const el of box.querySelectorAll("*")) { if (el === trigger || trigger.contains(el)) continue; const r = el.getBoundingClientRect(); if (r.width * r.height >= 600 && shown(el)) set.add(el); }
            return set;
        };
        // when the person acted (Escape, a click) and when the watched layer actually left the page — both taken from
        // events and mutation records, not frames: an instant close removes it within a few ms of the action; an exit
        // animation keeps it on the page for 100 ms or more, however few frames a busy machine paints meanwhile
        for (const t of ["keydown", "pointerdown", "click"]) document.addEventListener(t, () => { P.tAction = performance.now(); }, true);
        new MutationObserver(() => { const r = P.run; if (r && r.phase === "close" && P.last && r.tGone == null && !alive(P.last)) r.tGone = performance.now(); })
            .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class", "data-state", "open"] });
        P.arm = (phase, trigger = null) => {
            styleWrites.clear();
            P.tAction = null;
            const before = phase === "open" ? positioned() : null;
            const near = phase === "open" ? visibleNear(trigger) : null;
            const controls = phase === "open" && trigger && trigger.getAttribute("aria-controls");
            const target = controls ? document.getElementById(controls.split(/\s+/)[0]) : null;
            const targetWasShown = !!(target && alive(target) && target.getBoundingClientRect().height > 1);
            const t0 = performance.now();
            const run = (P.run = { phase, done: false, gone: [], seen: [], tGone: null });
            const watched = new Map(); // layer → looks per frame
            if (phase === "close" && P.last)
                watched.set(P.last, [look(P.last)]);
            const step = () => {
                if (phase === "open") {
                    // an overlay carries something to read or use; a glow, a grain layer or a pill that scrolled into view does not
                    const meaningful = (el) => (el.innerText || "").trim().length > 0 || !!el.querySelector("a, button, input, select, textarea, [role=option], [role=menuitem], [tabindex]") || /^(dialog|alertdialog|menu|listbox)$/.test(el.getAttribute("role") || "");
                    const fresh = [...positioned()].filter((el) => !before.has(el) && meaningful(el));
                    for (const l of fresh.filter((el) => !fresh.some((o) => o !== el && o.contains(el))))
                        if (![...watched.keys()].some((w) => w.contains(l)))
                            watched.set(l, []);
                    // only a trigger that says it expands something (aria-expanded, <summary>) owns an in-place panel —
                    // a "Continue" that reveals a validation message is not a disclosure
                    if (!fresh.length && trigger && (trigger.hasAttribute("aria-expanded") || trigger.matches("summary"))) {
                        // nothing floated up: look for the panel that expanded in place
                        const t = controls ? document.getElementById(controls.split(/\s+/)[0]) : null;
                        if (t && !targetWasShown && alive(t) && t.getBoundingClientRect().height > 1) { if (!watched.has(t)) watched.set(t, []); }
                        else if (!t) {
                            const now = [...visibleNear(trigger)].filter((el) => !near.has(el) && !(el.closest && el.closest("[data-babysitter]")));
                            for (const l of now.filter((el) => !now.some((o) => o !== el && o.contains(el))))
                                if (![...watched.keys()].some((w) => w.contains(l) || l.contains(w))) watched.set(l, []);
                        }
                    }
                }
                for (const [l, looks] of watched)
                    looks.push(alive(l) ? look(l) + (animated(l) ? "|anim" : "") : "gone");
                if (performance.now() - t0 < 520)
                    return requestAnimationFrame(step);
                run.done = true;
                for (const [l, looks] of watched) {
                    const lingered = phase === "close" && l === P.last && P.tAction != null && run.tGone != null && run.tGone - P.tAction >= 70;
                    const moved = lingered || looks.some((x) => x.endsWith("|anim")) || new Set(looks.filter((x) => x !== "gone").map((x) => x.replace(/\|anim$/, ""))).size > 1
                        || P.events.some((e) => e.t >= t0 && e.el instanceof Node && (l.contains(e.el) || e.el.contains(l)));
                    const ended = looks[looks.length - 1];
                    // a Radix Select list: before 2.3 it unmounts the moment it closes, so its exit classes never play —
                    // the message names the upgrade instead of "add an exit animation" (forge/cipher/facet, 2026-10)
                    const radixSelect = !!(l.querySelector && (l.matches("[data-radix-select-viewport]") || l.querySelector("[data-radix-select-viewport]")));
                    const entry = { moved, radixSelect, where: W.__uiDescribe(l), selector: W.__uiSelector(l), human: W.__uiHuman(l) };
                    if (phase === "open" && ended !== "gone") {
                        run.seen.push(entry);
                        if (!P.last) P.last = l;
                    }
                    if (phase === "close" && ended === "gone")
                        run.gone.push(entry);
                }
            };
            requestAnimationFrame(step);
        };
    });
    const handles = await page.$$('[aria-haspopup]:not([aria-haspopup=false]), [aria-expanded], [aria-controls], [role=combobox], button[data-state], button:has(> svg:last-child), [role=button]:has(> svg:last-child), button[aria-label]:has(svg), summary');
    const done = new Set();
    let n = 0;
    const wait = () => page.waitForFunction(() => window.__bsOverlayProbe.run && window.__bsOverlayProbe.run.done, null, { timeout: 4000 }).catch(() => { });
    for (const h of handles) {
        if (n >= max)
            break;
        const info = await h.evaluate((el) => {
            const W = window;
            const text = (el.textContent || "").trim();
            const says = el.matches('[aria-haspopup]:not([aria-haspopup=false]), [aria-expanded], [aria-controls], [role=combobox], [data-state], summary')
                || /menu|navigation|options|more|filter|sort|currency|language|меню|ещё|фильтр|сорт|валют|язык/i.test(el.getAttribute("aria-label") || "");
            const ok = el.getRootNode() === document && W.__uiVisible(el) && !el.matches("a[href], [type=submit], [disabled], [aria-disabled=true], [data-next-mark], #next-logo") && !el.closest("nextjs-portal, [data-nextjs-toast], [data-babysitter]") && !el.closest("form button[type=submit]")
                && (says || (text.length > 0 && text.length <= 24)) && !/delete|remove|sign ?out|log ?out|удал|выйти|accept|allow|agree|reject|essential/i.test(text)
                && el.getBoundingClientRect().top < innerHeight * 2;
            return ok ? { selector: W.__uiSelector(el), where: W.__uiDescribe(el), human: W.__uiHuman(el), expanded: el.getAttribute("aria-expanded") } : null;
        }).catch(() => null);
        if (!info || done.has(info.selector) || info.expanded === "true")
            continue;
        done.add(info.selector);
        const url = page.url();
        await h.scrollIntoViewIfNeeded().catch(() => { });
        await h.evaluate((el) => { window.__bsOverlayProbe.last = null; window.__bsOverlayProbe.arm("open", el); });
        await h.click({ timeout: 2000 }).catch(() => { });
        await wait();
        if (page.url() !== url) {
            await page.goBack().catch(() => { });
            continue;
        }
        const opened = await page.evaluate(() => window.__bsOverlayProbe.run.seen);
        if (!opened.length)
            continue;
        n++;
        const layer = opened[0];
        if (!layer.moved)
            out.push({ what: `opens without motion — it appears in one frame (give it an enter animation: opacity + a small scale/slide, 120–200 ms) [6.12, P59]`, where: `${layer.where} (trigger: ${info.where})`, selector: info.selector, human: info.human, layer: layer.selector });
        // close it the way people do: Escape, then (if it is still open) a click on the trigger again
        await page.evaluate(() => window.__bsOverlayProbe.arm("close"));
        await page.keyboard.press("Escape").catch(() => { });
        await wait();
        let gone = await page.evaluate(() => window.__bsOverlayProbe.run.gone);
        if (!gone.length) {
            await page.evaluate(() => window.__bsOverlayProbe.arm("close"));
            await h.click({ timeout: 2000 }).catch(() => { });
            await wait();
            gone = await page.evaluate(() => window.__bsOverlayProbe.run.gone);
        }
        const g = gone.find((x) => x.selector === layer.selector) || gone[0];
        if (g && !g.moved)
            out.push({ what: g.radixSelect ? `Radix Select list closes in one frame — its exit classes never play before @radix-ui/react-select 2.3: update it [6.12, P59]` : `closes without motion — it vanishes in one frame (give it an exit animation that mirrors the enter one) [6.12, P59]`, where: `${layer.where} (trigger: ${info.where})`, selector: info.selector, human: info.human, layer: layer.selector });
        if (!gone.length)
            await page.mouse.click(2, 2).catch(() => { });
        await page.waitForTimeout(150);
    }
    return out;
}
/** 4.6 — cookie settings replace the banner (never two "Accept" buttons), the panel fits and scrolls (P19 P18). */
/**
 * The cookie banner, marked with data-bs-cookie. Found by class or id, by an accessible name (Mise, 2026-10:
 * `<div role="region" aria-label="Cookie consent" class="presence …">` has neither "cookie" nor "consent" in a class
 * or id, so the settings panel was never opened and its broken switches never seen), or as a fixed/sticky box that
 * talks about cookies.
 */
const markCookieBanner = (page) => page.evaluate(() => {
    const W = window;
    for (const el of Array.from(document.querySelectorAll("[data-bs-cookie]")))
        el.removeAttribute("data-bs-cookie");
    const named = (el) => {
        const label = el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
        return /cookie|consent|куки|cookies/i.test(label);
    };
    const byName = Array.from(document.querySelectorAll('[class*=cookie i], [id*=cookie i], [class*=consent i], [id*=consent i], [aria-label], [aria-labelledby]'))
        .filter((el) => W.__uiVisible(el) && (/cookie|consent/i.test(`${typeof el.className === "string" ? el.className : ""} ${el.id}`) || named(el)));
    const byText = Array.from(document.querySelectorAll("body *")).filter((el) => {
        const cs = getComputedStyle(el);
        return /^(fixed|sticky)$/.test(cs.position) && W.__uiVisible(el) && /cookie|куки/i.test(el.textContent || "") && el.querySelector("button, a, [role=button]");
    });
    const found = [...byName, ...byText];
    for (const el of found)
        el.setAttribute("data-bs-cookie", "");
    return found.length;
});
export async function cookieFlow(page) {
    const out = [];
    if (!(await markCookieBanner(page).catch(() => 0)))
        return out;
    const manage = page.locator("[data-bs-cookie] button, [data-bs-cookie] a, [data-bs-cookie] [role=button]")
        .filter({ hasText: /manage|settings|preferences|customi[sz]e|options|настро|параметр/i }).first();
    if (!(await manage.isVisible().catch(() => false)))
        return out;
    await manage.click().catch(() => { });
    await page.waitForTimeout(400);
    await settle(page, 800);
    // the panel's switches are only in the page while it is open, so they are measured here, disabled ones included
    // ("Necessary — always on" is disabled, and was the one drawn past its track)
    for (const f of await toggleGeometry(page))
        out.push({ ...f, what: `${f.what} — in the cookie settings panel` });
    // the panel's tick boxes and pickers: a banner that expands in place is no role=dialog, so the dialog-scoped
    // native-control sweep (1.1) never looked inside it — forge's analytics/marketing boxes were OS checkboxes
    await markCookieBanner(page).catch(() => 0);
    const seenNative = new Set();
    for (const n of await nativeControls(page, "[data-bs-cookie], [role=dialog], [role=alertdialog]")) {
        if (seenNative.has(n.selector))
            continue;
        seenNative.add(n.selector);
        out.push({ ...n, what: `${n.what.replace(" inside an open dialog/popover", "")} in the cookie settings panel — use the kit control [1.1, P01]` });
    }
    const accepts = await page.evaluate(() => Array.from(document.querySelectorAll("button, a")).filter((b) => window.__uiVisible(b) && /^(accept( all)?|allow all|agree|принять( все)?)$/i.test((b.textContent || "").trim())).length);
    if (accepts > 1)
        out.push({ what: `${accepts} "Accept" buttons visible after opening cookie settings — banner and panel are shown together [4.6, P19]`, where: "cookie banner + settings" });
    for (const p of await openPopups(page)) {
        if (p.clipped)
            out.push({ what: "cookie settings panel goes off-screen [4.6/5.2, P18]", where: p.where });
        if (p.overflowing)
            out.push({ what: "cookie settings panel clips content without scrolling [5.2, P18]", where: p.where });
    }
    return out;
}
/**
 * 1.18 — a switch's thumb sits inside its track, on the side its state says: left when off, right when on (mirrored
 * for rtl). checkedState only asks whether toggling changes something, and a thumb that slides from the wrong place
 * to past the edge still changes something. Mise (2026-10): the thumb was absolute with no left offset, so it started
 * at the centre of its <button> track — "off" drew it in the right half (reading as on), "on" drew it 20 px past the
 * track's right edge. Disabled switches are measured too: nothing is toggled here.
 *
 * The thumb is the largest roughly-square visible element inside the switch, smaller than the track. Switches drawn
 * entirely with ::before/::after, or as a sr-only input with a sibling box, are not measured.
 */
export const toggleGeometry = (page) => page.evaluate(() => {
    const W = window;
    const out = [];
    const seen = new Set();
    for (const sw of Array.from(document.querySelectorAll("[role=switch]"))) {
        if (!W.__uiVisible(sw))
            continue;
        const t = sw.getBoundingClientRect();
        if (t.width < 16 || t.height < 8)
            continue;
        let thumb = null, area = 0;
        for (const n of Array.from(sw.querySelectorAll("*"))) {
            if (!W.__uiVisible(n))
                continue;
            const q = n.getBoundingClientRect();
            if (q.width < 4 || q.height < 4 || q.width > t.width * 0.75 || q.height > t.height + 2)
                continue;
            if (Math.abs(q.width - q.height) > Math.max(2, q.height * 0.3))
                continue; // a label or an icon strip, not a thumb
            if (q.width * q.height > area) {
                thumb = q;
                area = q.width * q.height;
            }
        }
        if (!thumb)
            continue;
        const on = sw.getAttribute("aria-checked") === "true" || sw.getAttribute("data-state") === "checked" || (sw.matches("input") && sw.checked);
        const rtl = getComputedStyle(sw).direction === "rtl";
        const x0 = Math.round(thumb.left - t.left), x1 = Math.round(thumb.right - t.left), w = Math.round(t.width);
        const problems = [];
        if (thumb.left < t.left - 1 || thumb.right > t.right + 1 || thumb.top < t.top - 1 || thumb.bottom > t.bottom + 1)
            problems.push(`its thumb is drawn outside the track (thumb at x ${x0}..${x1}, track 0..${w})`);
        const centre = (thumb.left + thumb.right) / 2 - t.left;
        const onSide = rtl ? centre < t.width / 2 : centre > t.width / 2;
        if (Math.abs(centre - t.width / 2) > 1 && onSide !== on)
            problems.push(`it is ${on ? "on" : "off"} but its thumb sits on the ${on ? "off" : "on"} side (thumb at x ${x0}..${x1}, track 0..${w}), so it reads as ${on ? "off" : "on"}`);
        if (!problems.length)
            continue;
        const sig = `${typeof sw.className === "string" ? sw.className : ""}|${on}|${problems.join()}`;
        if (seen.has(sig))
            continue;
        seen.add(sig);
        for (const what of problems)
            out.push({ what: `switch ${what} [1.18]`, where: W.__uiDescribe(sw), selector: W.__uiSelector(sw), human: W.__uiHuman(sw) });
    }
    return out;
});
/**
 * 1.18 — a tick box, radio or switch looks checked when it is checked. Each one (native, or role=checkbox / switch /
 * radio) is toggled with a DOM click (no focus ring, no hover), captured before and after, and put back. It fails when
 * nothing visible changes, or when only the edge changes colour (Vertex, 2026-10: an `appearance:none` box whose
 * `checked:` styles were never generated — the border went from grey to blue and the box stayed empty).
 * Controls that look alike (same classes) are toggled once and reported together.
 */
export async function checkedState(page) {
    const out = [...await toggleGeometry(page).catch(() => [])];
    await page.mouse.move(0, 0).catch(() => { });
    const handles = await page.$$('input[type=checkbox], input[type=radio], [role=checkbox], [role=switch], [role=radio]');
    const groups = new Map(); // look signature → { handle, count }
    for (const h of handles) {
        const info = await h.evaluate((el) => {
            const W = window;
            if (el.matches(":disabled") || el.closest('[disabled], [aria-disabled="true"], [inert]'))
                return null;
            const native = el.matches("input");
            const checked = native ? el.checked : el.getAttribute("aria-checked") === "true" || el.getAttribute("data-state") === "checked";
            const radio = native ? el.type === "radio" : el.getAttribute("role") === "radio";
            if (radio && checked)
                return null; // a checked radio cannot be unchecked; its unchecked siblings are toggled instead
            const label = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
            const visual = W.__uiVisible(el) ? el : label && W.__uiVisible(label) ? label : null;
            if (!visual)
                return null;
            const cls = (n) => (n && typeof n.className === "string" ? n.className : "");
            return { sig: [el.tagName, el.type || el.getAttribute("role"), cls(el), cls(visual), cls(el.parentElement)].join("|"), where: W.__uiDescribe(visual), selector: W.__uiSelector(el), human: W.__uiHuman(el) };
        }).catch(() => null);
        if (!info)
            continue;
        const g = groups.get(info.sig);
        if (g)
            g.count++;
        else
            groups.set(info.sig, { h, info, count: 1 });
    }
    for (const { h, info, count } of groups.values()) {
        await h.evaluate((el) => (el.matches("input") && !window.__uiVisible(el) && (el.closest("label") || el.parentElement) || el).scrollIntoView({ block: "center", behavior: "instant" })).catch(() => { });
        await recover(page);
        // a cookie banner over the box would be captured twice, unchanged, as "nothing changes"
        await h.evaluate((el) => { const v = window.__uiVisible(el) ? el : el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el; v.setAttribute("data-bs-uncover", ""); }).catch(() => { });
        const target = await page.$("[data-bs-uncover]");
        if (target) {
            await uncover(target);
            await target.evaluate((el) => el.removeAttribute("data-bs-uncover")).catch(() => { });
        }
        const url = page.url();
        // the region to compare, and the styles of everything that can draw the state
        const prep = await h.evaluate((el) => {
            const W = window;
            const native = el.matches("input");
            const label = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
            const own = W.__uiVisible(el);
            const visual = own ? el : label;
            const r = visual.getBoundingClientRect();
            const cs = getComputedStyle(visual);
            // what may change: the control, its label, the siblings a peer-checked: box lives in, and their insides
            const scope = new Set([visual, ...visual.querySelectorAll("*")]);
            if (el.parentElement)
                for (const s of el.parentElement.querySelectorAll("*"))
                    scope.add(s);
            scope.add(el);
            const PROPS = ["backgroundColor", "backgroundImage", "boxShadow", "color", "opacity", "transform", "translate", "scale", "visibility", "display", "fill", "stroke", "content", "width", "height", "maskImage", "webkitMaskImage", "outlineStyle", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"];
            const BORDER = ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor"];
            W.__bsCheckedLook = () => {
                const look = [];
                for (const n of scope) {
                    if (!n.isConnected)
                        continue;
                    for (const pseudo of [null, "::before", "::after"]) {
                        const c = getComputedStyle(n, pseudo);
                        look.push({ other: PROPS.map((p) => c[p]).join("|"), border: BORDER.map((p) => c[p]).join("|") });
                    }
                }
                return { look, html: (visual.innerHTML || "").length + ":" + visual.querySelectorAll("*").length };
            };
            W.__bsCheckedBefore = W.__bsCheckedLook();
            W.__bsCheckedRestore = native && el.type === "radio" ? document.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`) : el.getAttribute("role") === "radio" ? (el.closest("[role=radiogroup]") || document).querySelector("[role=radio][aria-checked=true]") : null;
            const bw = own ? Math.max(...["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[`border${s}Width`]) || 0)) : 0;
            return { x: Math.max(0, r.left - 2), y: Math.max(0, r.top - 2), width: Math.min(innerWidth, r.right + 2) - Math.max(0, r.left - 2), height: Math.min(innerHeight, r.bottom + 2) - Math.max(0, r.top - 2), band: own ? bw + 3 : 0, own };
        }).catch(() => null);
        if (!prep || prep.width < 2 || prep.height < 2)
            continue;
        const shot = () => page.screenshot({ clip: { x: prep.x, y: prep.y, width: prep.width, height: prep.height }, scale: "css" }).then((b) => b.toString("base64"));
        const before = await shot().catch(() => null);
        await h.evaluate((el) => el.click()).catch(() => { });
        await page.waitForTimeout(50);
        await settle(page, 800);
        if (page.url() !== url) {
            await page.goBack().catch(() => { });
            continue;
        }
        const after = await shot().catch(() => null);
        const styles = await page.evaluate(() => {
            const a = window.__bsCheckedBefore, b = window.__bsCheckedLook();
            const other = a.html !== b.html || a.look.length !== b.look.length || a.look.some((x, i) => x.other !== b.look[i].other);
            const border = a.look.some((x, i) => b.look[i] && x.border !== b.look[i].border);
            return { other, border };
        }).catch(() => null);
        // put it back the way it was
        await h.evaluate((el) => {
            const prev = window.__bsCheckedRestore;
            if (prev && prev !== el)
                prev.click();
            else if (el.matches("input[type=radio]"))
                el.checked = false;
            else
                el.click();
        }).catch(() => { });
        await settle(page, 800);
        if (!before || !after || !styles)
            continue;
        // pixels: how many changed, and how many of them inside the edge band of the control's own box
        const px = await page.evaluate(async ({ before, after, band }) => {
            const A = await window.__uiDecode(before), B = await window.__uiDecode(after);
            if (A.width !== B.width || A.height !== B.height)
                return { changed: 1, inner: 1 };
            let changed = 0, inner = 0;
            const w = A.width, h = A.height, edge = band + 2; // +2: the 2px margin captured around the box
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
                    if (d < 24)
                        continue;
                    changed++;
                    if (!band || (x >= edge && y >= edge && x < w - edge && y < h - edge))
                        inner++;
                }
            return { changed, inner };
        }, { before, after, band: prep.band }).catch(() => null);
        if (!px)
            continue;
        const many = count > 1 ? ` (and ${count - 1} more like it)` : "";
        const at = { where: info.where + many, selector: info.selector, human: info.human };
        if (px.changed <= 2)
            out.push({ what: `checking it changes nothing visible — checked and unchecked look the same [1.18]`, ...at });
        else if (prep.own ? px.inner <= 2 : styles.border && !styles.other)
            out.push({ what: `checked state only changes the border colour — the box stays empty (no fill, tick or dot) [1.18]`, ...at });
    }
    await recover(page);
    return out;
}
/** Rendered signatures of buttons, cards and inputs on the current page, for site-wide comparison. */
export const collectSignatures = (page, route) => page.evaluate((route) => {
    const W = window;
    const sigs = [];
    const font = (cs) => cs.fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
    const parentBg = (el) => { for (let p = el.parentElement; p; p = p.parentElement) {
        const c = W.__uiRGBA(getComputedStyle(p).backgroundColor);
        if (c[3] > 0.5)
            return c.join();
    } return "255,255,255,1"; };
    // Real buttons only: a CTA, a form button, a dialog action. Not nav links, footer controls, link-cards, nor the
    // pressed/selected pieces of a control group (filter chips, segmented options, tabs) — those are other roles with
    // their own sizes, and counting them made "button height" report 6-8 variants on a site with two button sizes.
    const CHIP = "[aria-pressed], [aria-selected], [aria-checked], [role=tab], [role=radio], [role=option], [role=switch], [role=checkbox], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [data-state=on], [data-state=off]";
    const chipRow = (el) => {
        // three or more look-alike siblings in one row: a chip/filter/segment group
        const p = el.parentElement;
        if (!p)
            return false;
        const same = Array.from(p.children).filter((k) => k.tagName === el.tagName && k.className === el.className && W.__uiVisible(k));
        return same.length >= 3 && new Set(same.map((k) => Math.round(k.getBoundingClientRect().top))).size < same.length;
    };
    for (const el of Array.from(document.querySelectorAll("button, a, [role=button], input[type=submit], input[type=button]"))) {
        if (!W.__uiVisible(el) || !((el.textContent || "").trim() || el.value))
            continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const bg = W.__uiRGBA(cs.backgroundColor);
        const filled = bg[3] > 0.5 && bg.join() !== parentBg(el);
        const outlined = parseFloat(cs.borderTopWidth) > 0 && W.__uiRGBA(cs.borderTopColor)[3] > 0.2;
        // only things that look like buttons: filled or outlined, padded, button-sized
        if (!(filled || outlined) || r.height < 28 || r.height > 72 || parseFloat(cs.paddingLeft) < 8)
            continue;
        if (el.closest("nav, [role=navigation], footer, [role=contentinfo], [role=tablist], [role=radiogroup], [role=toolbar]") || el.matches(CHIP) || chipRow(el))
            continue;
        // a link counts only when it is dressed as a button (short label, no card content)
        if (el.matches("a") && !W.__uiButtonLike(el))
            continue;
        const variant = filled ? `filled ${W.__uiRGBA(cs.backgroundColor).slice(0, 3).map((x) => Math.round(x / 8)).join(",")}` : "outlined";
        sigs.push({ kind: "button", filled, variant, radius: Math.min(Math.round(parseFloat(cs.borderTopLeftRadius)), 999), height: Math.round(r.height), font: font(cs), size: Math.round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight), route, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
    // text fields only: a range slider, colour well, file picker or input-button is not a field to keep in one height
    for (const el of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, [role=combobox]'))) {
        if (!W.__uiVisible(el))
            continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        sigs.push({ kind: "input", radius: Math.round(parseFloat(cs.borderTopLeftRadius)), height: el.tagName === "TEXTAREA" ? 0 : Math.round(r.height), font: font(cs), size: Math.round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight), route, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
    for (const el of Array.from(document.querySelectorAll("main *, body > div *"))) {
        if (!W.__uiVisible(el))
            continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 180 || r.height < 100 || r.width > innerWidth * 0.9)
            continue;
        // a form control is not a card; a one-sided rule (border-top between sections) is a divider, not a card's edge
        if (el.matches("input, textarea, select, button, [role=combobox]"))
            continue;
        // a CTA link, a fixed/sticky layer (cookie banner, toast) or a picture frame (logo tile) is not a card
        if (W.__uiButtonLike(el, true) || W.__uiOverlay(el) || W.__uiMediaTile(el))
            continue;
        const side = (k) => parseFloat(cs[`border${k}Width`]) > 0 && W.__uiRGBA(cs[`border${k}Color`])[3] > 0.05;
        const border = side("Top") && side("Right") && side("Bottom") && side("Left");
        const shadow = cs.boxShadow !== "none";
        if (!(border || shadow) || parseFloat(cs.paddingTop) < 12)
            continue;
        // filled vs clear is a look; which colour fills it is not (per-item tints are content, not a card variant)
        const fill = W.__uiRGBA(cs.backgroundColor)[3] > 0.05 || /gradient/.test(cs.backgroundImage) ? "filled" : "clear";
        const skin = `r${Math.round(parseFloat(cs.borderTopLeftRadius))} ${fill} b${cs.borderTopWidth} ${shadow ? "shadow" : "flat"} p${cs.paddingTop}`;
        sigs.push({ kind: "card", skin, radius: Math.round(parseFloat(cs.borderTopLeftRadius)), height: 0, font: "", size: 0, weight: 0, route, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
    return sigs;
}, route);
/** Distinct values per property across the whole site, with one example of each. */
export function variety(sigs, kind, prop, filter = () => true) {
    const m = new Map();
    for (const s of sigs.filter((s) => s.kind === kind && filter(s))) {
        const k = String(s[prop]);
        m.set(k, [...(m.get(k) || []), s]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([v, list]) => ({ value: v, count: list.length, example: `${list[0].route} ${list[0].where}` }));
}
/** 2.3 — tables have a mobile representation: below 640px no column may be cut off or hidden behind a sideways scroll (P16). */
export const tableClipping = (page) => page.evaluate(() => {
    const W = window;
    // device width, not innerWidth: an overflowing page makes mobile Chrome widen the layout viewport
    if (Math.min(innerWidth, screen.width) > 640)
        return [];
    const out = [];
    for (const t of Array.from(document.querySelectorAll("table"))) {
        if (!W.__uiVisible(t))
            continue;
        const tr = t.getBoundingClientRect();
        let clip = null;
        for (let p = t.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.overflowX !== "visible" && p.clientWidth + 1 < tr.width) {
                clip = p;
                break;
            }
            if (p === document.body)
                break;
        }
        const vw = Math.min(document.documentElement.clientWidth, screen.width);
        if (clip || tr.right > vw + 1) {
            const visible = clip ? clip.clientWidth : vw - Math.max(0, tr.left);
            const cols = Array.from(t.querySelector("tr")?.children || []);
            const box = clip ? clip.getBoundingClientRect() : { left: 0, right: vw };
            const hidden = cols.filter((c) => { const r = c.getBoundingClientRect(); return r.right > box.right + 1 || r.left < box.left - 1; }).map((c) => (c.textContent || "").trim()).filter(Boolean);
            out.push({ what: `table is ${Math.round(tr.width)}px wide in ${Math.round(visible)}px — columns cut or behind a sideways scroll${hidden.length ? ` (${hidden.join(", ")})` : ""}. Below 640px render each row as a stacked card [2.3, P16]`, where: W.__uiDescribe(t), selector: W.__uiSelector(t), human: W.__uiHuman(t) });
        }
    }
    return out;
});
/**
 * DOM sniper (1.15 / 6.5): every element carrying a `style` attribute whose declarations are not all CSS
 * custom properties (--x). Reads the attribute as rendered, so it catches styles injected by any route —
 * JSX, spreads, imported props, document.write, dangerouslySetInnerHTML, scripts.
 */
/** Framework/library internals that write style attributes the page author never writes. */
// canvas + the wrappers WebGL renderers (three.js / react-three-fiber) size at runtime
export const SNIPER_SKIP = ["script", "style", "noscript", "template", "next-route-announcer", "nextjs-portal", "[data-nextjs-toast]", "img[data-nimg]", "[data-radix-popper-content-wrapper]", "[data-floating-ui-portal]", "[data-sonner-toaster]", "canvas", ":has(> canvas)", ":has(> div > canvas)", "nav > div:has(> ul[data-orientation])", "[data-radix-navigation-menu-viewport]"];
/** Written every frame by animation libraries (framer-motion, motion, GSAP): runtime state, not design tokens. */
export const SNIPER_MOTION_PROPS = ["transform", "opacity", "translate", "scale", "rotate", "will-change", "transform-origin", "visibility", "transition",
    // animation bookkeeping by Radix Presence / framer-motion (suppress the first-mount animation, measure a panel)
    "transition-duration", "transition-property", "transition-delay", "animation-name", "animation-duration", "animation-delay", "animation-fill-mode", "filter",
    // behaviour set by UI libraries, not design: next-themes (color-scheme on <html>), Radix (pointer-events)
    "pointer-events", "color-scheme", "touch-action", "user-select", "-webkit-user-select", "overflow-anchor"];
export const inlineStyles = (page, allowProps = [], skip = [], strict = false) => page.evaluate(({ allowProps, skip, strict }) => {
    const W = window;
    const out = [];
    for (const el of Array.from(document.querySelectorAll("[style]"))) {
        if (skip.some((sel) => { try {
            return el.closest(sel);
        }
        catch {
            return false;
        } }))
            continue;
        // visually-hidden helpers (a11y inputs of Select/Checkbox primitives): ≤1×1, absolutely positioned
        const r = el.getBoundingClientRect();
        const pos = getComputedStyle(el).position;
        if (!strict && (pos === "absolute" || pos === "fixed") && r.width <= 1 && r.height <= 1)
            continue;
        // not rendered right now: a collapsed accordion panel (height 0 under overflow hidden) or a faded-out
        // layer — animation libraries leave their state there. Judged again once it is visible.
        const ecs = getComputedStyle(el);
        if (!strict && (Number(ecs.opacity) === 0 || ((r.height === 0 || r.width === 0) && ecs.overflow !== "visible")))
            continue;
        const decl = (el.getAttribute("style") || "").split(";").map((d) => d.trim()).filter(Boolean);
        // a keyword value (height: auto, left: initial…) sets no design value — animation libraries leave them behind
        const meaningful = decl.filter((d) => !/^\s*[^:]+:\s*(auto|initial|inherit|unset|revert|revert-layer)\s*(!important)?\s*$/i.test(d));
        const props = [...new Set(meaningful.map((d) => d.split(":")[0].trim().toLowerCase()).filter((p) => p && !p.startsWith("--") && !allowProps.includes(p)))];
        if (!props.length)
            continue;
        const tag = el.tagName.toLowerCase();
        out.push({ tag, props, what: `<${tag}> has inline ${props.join(", ")}`, where: W.__uiDescribe ? W.__uiDescribe(el) : tag, selector: W.__uiSelector ? W.__uiSelector(el) : undefined, human: W.__uiHuman ? W.__uiHuman(el) : undefined });
    }
    return out;
}, { allowProps: strict ? allowProps : [...SNIPER_MOTION_PROPS, ...allowProps], skip: strict ? skip : [...SNIPER_SKIP, ...skip], strict });

/**
 * Scroll the whole page once, so reveal-on-scroll content (framer-motion whileInView, IntersectionObserver,
 * lazy sections) renders the way a reader sees it — measured before, it is opacity 0 and reads as 1:1.
 */
export const revealLazy = async (page) => {
    await page.evaluate(async () => {
        const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
        // instant: with `scroll-behavior: smooth` a plain scrollTo animates, and the page was then measured a few
        // pixels short of the top ("page loads scrolled to top" failed now and then)
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 60)); }
        window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.waitForTimeout(300);
    await settle(page, 3000); // reveal transitions finish (staggered reveals run past a fixed 700 ms and were measured half-faded)
};
/**
 * 1.17 — one shape language. Rendered boxes that a person reads as UI pieces (buttons, fields, dropdown
 * triggers, cards, badges, tabs) are measured; the site's shape is the median corner radius of them all
 * (or babysitter.config.json → design.shape). On a rounded site a square-cornered piece is the odd one out
 * (and a pill/rounded piece on a sharp site). Attached groups (some corners square, some round) are fine.
 */
export const collectShapes = (page, route = "") => page.evaluate((route) => {
    const W = window;
    const out = [];
    const parentBg = (el) => { for (let p = el.parentElement; p; p = p.parentElement) {
        const c = W.__uiRGBA(getComputedStyle(p).backgroundColor);
        if (c[3] > 0.5)
            return c.slice(0, 3).join();
    } return "255,255,255"; };
    const boxOf = (el, cs) => {
        const bg = W.__uiRGBA(cs.backgroundColor);
        const filled = bg[3] > 0.08 && bg.slice(0, 3).join() !== parentBg(el);
        const bordered = ["Top", "Right", "Bottom", "Left"].filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && W.__uiRGBA(cs[`border${s}Color`])[3] > 0.15).length >= 3;
        const shadow = cs.boxShadow && cs.boxShadow !== "none";
        return filled || bordered || shadow;
    };
    const seen = new Set();
    const add = (el, kind) => {
        if (seen.has(el) || !W.__uiVisible(el))
            return;
        seen.add(el);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width >= innerWidth * 0.9 || !boxOf(el, cs))
            return;
        if (el.closest("td, th, [role=dialog] [role=tablist], [data-babysitter-ignore]"))
            return;
        const half = Math.min(r.width, r.height) / 2;
        const corners = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((k) => Math.min(parseFloat(cs[k]) || 0, half));
        const max = Math.max(...corners), min = Math.min(...corners);
        out.push({ kind, radius: Math.round(max), attached: max >= 2 && min < 1, pill: max >= half - 1 && half > 0, route, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    };
    for (const el of Array.from(document.querySelectorAll('button, [role=button], input[type=submit], input[type=button]'))) {
        const r = el.getBoundingClientRect();
        if (r.height >= 24 && r.height <= 80 && r.width >= 24)
            add(el, "button");
    }
    for (const el of Array.from(document.querySelectorAll("a"))) {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        if (r.height >= 28 && r.height <= 72 && parseFloat(cs.paddingLeft) >= 8 && (el.textContent || "").trim())
            add(el, "button");
    }
    for (const el of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [role=combobox], [aria-haspopup=listbox]')))
        add(el, "field");
    for (const el of Array.from(document.querySelectorAll("[role=tab]")))
        add(el, "tab");
    for (const el of Array.from(document.querySelectorAll("main *, body > div *"))) {
        const r = el.getBoundingClientRect();
        if (r.width >= 180 && r.height >= 100 && r.width < innerWidth * 0.9) {
            const cs = getComputedStyle(el);
            if (parseFloat(cs.paddingTop) >= 12)
                add(el, "card");
        }
        else if (r.height >= 16 && r.height <= 32 && r.width <= 160 && el.children.length <= 1 && (el.textContent || "").trim().length <= 24 && /^(span|div|p|small|strong)$/i.test(el.tagName)) {
            const cs = getComputedStyle(el);
            if (parseFloat(cs.paddingLeft) >= 4 && cs.display.includes("inline") || cs.display === "flex" && parseFloat(cs.paddingLeft) >= 4)
                add(el, "badge");
        }
    }
    return out;
}, route);
/** The site's shape: "rounded" when the median corner radius of its pieces is ≥ 3px, else "sharp". */
export function siteShape(shapes, configured) {
    if (configured === "rounded" || configured === "sharp")
        return configured;
    const r = shapes.map((s) => s.radius).sort((a, b) => a - b);
    if (r.length < 4)
        return null;
    return r[Math.floor(r.length / 2)] >= 3 ? "rounded" : "sharp";
}
export function shapeOutliers(shapes, shape) {
    if (!shape)
        return [];
    const KIND = { button: "button", field: "field", tab: "tab", card: "card", badge: "badge" };
    return shapes
        .filter((s) => !s.attached && (shape === "rounded" ? s.radius < 1 : s.radius >= 6 && s.kind !== "badge"))
        .map((s) => ({ what: shape === "rounded"
            ? `square-cornered ${KIND[s.kind]} on a rounded site — every piece shares the site's corner radius [1.17]`
            : `${s.pill ? "pill-shaped" : `${s.radius}px-rounded`} ${KIND[s.kind]} on a square-cornered site [1.17]`, where: `${s.route} ${s.where}`.trim(), selector: s.selector, human: s.human }));
}
/**
 * 1.18 — one colour scheme. The palette is every colour the theme declares as a CSS custom property
 * (:root, .dark, [data-theme]); fills, borders and text of buttons, fields, cards, badges, links and headings
 * must come from it (alpha tints of a token count as the token). Gradients and images are skipped.
 * Not applicable when the theme declares fewer than 4 colours.
 */
export const offPalette = (page, extra = [], tolerance = 0.045) => page.evaluate(({ extra, tolerance }) => {
    const W = window;
    const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const oklab = ([r, g, b]) => {
        const [R, G, B] = [r, g, b].map(toLin);
        const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
        return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const STOCK_VAR = /^--(tw-|color-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\d+$|color-(black|white)$)/;
    // collect token colours from every same-origin stylesheet rule that declares custom properties
    const raw = new Set(extra);
    const visit = (rules) => { for (const rule of Array.from(rules || [])) {
        if (rule.cssRules && !rule.style)
            visit(rule.cssRules);
        if (!rule.style)
            continue;
        for (let i = 0; i < rule.style.length; i++) {
            const p = rule.style[i];
            // Tailwind 4 declares its whole stock palette (--color-red-500 …) and internals (--tw-*):
            // those are what a theme is supposed to replace, so they are not the product's palette
            if (p.startsWith("--") && !STOCK_VAR.test(p))
                raw.add(rule.style.getPropertyValue(p).trim());
        }
        if (rule.cssRules)
            visit(rule.cssRules);
    } };
    for (const sh of Array.from(document.styleSheets)) {
        try {
            visit(sh.cssRules);
        }
        catch { }
    }
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const palette = [];
    for (const v of raw) {
        if (!v || v.length > 80 || /var\(|url\(|gradient|calc\(/.test(v))
            continue;
        // bare HSL channels ("222 47% 11%") are shadcn's convention
        const candidates = [v, /^\d/.test(v) && /%/.test(v) ? `hsl(${v})` : null, /^\d/.test(v) && !/%/.test(v) && v.split(/\s+/).length === 3 ? `rgb(${v})` : null].filter(Boolean);
        for (const c of candidates) {
            probe.style.color = "";
            probe.style.color = c;
            if (!probe.style.color)
                continue;
            const rgba = W.__uiRGBA(getComputedStyle(probe).color);
            palette.push(oklab(rgba));
            break;
        }
    }
    probe.remove();
    for (const c of [[255, 255, 255], [0, 0, 0]])
        palette.push(oklab(c));
    if (palette.length < 6)
        return { applicable: false, offenders: [] };
    const off = (css) => {
        const c = W.__uiRGBA(css);
        if (c[3] < 0.08)
            return null;
        const lab = oklab(c);
        const d = Math.min(...palette.map((p) => dist(p, lab)));
        return d > tolerance ? `rgb(${c.slice(0, 3).join(", ")})` : null;
    };
    const offenders = [];
    const seen = new Set();
    const els = Array.from(document.querySelectorAll('button, [role=button], a, input:not([type=hidden]), textarea, select, [role=combobox], [role=tab], h1, h2, h3, h4, label, p, li, span, td, th'));
    for (const el of els) {
        if (!W.__uiVisible(el) || el.closest("svg, picture, video, canvas, [data-babysitter-ignore], iframe"))
            continue;
        const cs = getComputedStyle(el);
        const checks = [];
        if ((el.textContent || "").trim() && Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
            checks.push(["text", cs.color]);
        if (cs.backgroundImage === "none")
            checks.push(["fill", cs.backgroundColor]);
        if (parseFloat(cs.borderTopWidth) > 0)
            checks.push(["border", cs.borderTopColor]);
        for (const [part, css] of checks) {
            const bad = off(css);
            if (!bad)
                continue;
            const key = `${part}:${bad}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            offenders.push({ what: `${part} colour ${bad} is not in the theme palette — use a theme token [1.18]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
        }
    }
    return { applicable: true, offenders, paletteSize: palette.length };
}, { extra, tolerance });
/**
 * 1.19 — native parts follow the theme. A dark site must declare color-scheme: dark (or the browser draws
 * light scrollbars, autofill and picker popups on it), and number fields hide their spinner arrows.
 */
export const nativeSkin = (page) => page.evaluate(() => {
    const W = window;
    const out = [];
    const bg = (() => { for (const el of [document.body, document.documentElement]) {
        const c = W.__uiRGBA(getComputedStyle(el).backgroundColor);
        if (c[3] > 0.5)
            return c;
    } return [255, 255, 255, 1]; })();
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    const scheme = getComputedStyle(document.documentElement).colorScheme || "normal";
    if (lum < 0.35 && !/dark/.test(scheme))
        out.push({ what: `dark page but color-scheme is "${scheme}" — scrollbars, autofill and native pickers render light; set color-scheme: dark on :root [1.19]`, where: "html" });
    let spinnersHidden = false;
    const visit = (rules) => { for (const rule of Array.from(rules || [])) {
        if (rule.selectorText && /inner-spin-button|outer-spin-button/.test(rule.selectorText) && /none/.test(rule.style.cssText))
            spinnersHidden = true;
        if (rule.cssRules)
            visit(rule.cssRules);
    } };
    for (const sh of Array.from(document.styleSheets)) {
        try {
            visit(sh.cssRules);
        }
        catch { }
    }
    for (const el of Array.from(document.querySelectorAll("input[type=number]"))) {
        if (!W.__uiVisible(el))
            continue;
        const ap = getComputedStyle(el).appearance;
        if (!spinnersHidden && !/textfield|none/.test(ap))
            out.push({ what: "number field shows the browser's spinner arrows — hide them (appearance: textfield / ::-webkit-inner-spin-button { appearance: none }) [1.19]", where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
    return out;
});
/* ───────────────────────── dead animation classes: 6.12 P59 ───────────────────────── */
/**
 * 6.12 — `animate-in` promises motion: tailwindcss-animate / tw-animate-css turn it into an `enter` animation. Without
 * the plugin it compiles to nothing and the computed animation-name stays `none` (truelogos.pro cookie banner,
 * 2026-10: `animate-in fade-in slide-in-from-bottom-4 duration-500`, popped in and out in one frame). Every element
 * whose active classes include animate-in / animate-out (plain, motion-safe:, or data-[state=…]: while in that state)
 * and that has no animation is reported. Not judged under prefers-reduced-motion: reduce (motion-reduce: may remove it).
 */
export const deadAnimationClasses = (page) => page.evaluate(() => {
    const W = window;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
        return [];
    const out = [];
    let ruled = null; // does any stylesheet the page can read define .animate-in at all?
    const defined = () => {
        if (ruled !== null)
            return ruled;
        ruled = false;
        const visit = (rules) => { for (const r of Array.from(rules || [])) {
            if (r.selectorText && /\.animate-in\b/.test(r.selectorText))
                ruled = true;
            if (!ruled && r.cssRules)
                visit(r.cssRules);
        } };
        for (const sh of Array.from(document.styleSheets)) {
            try {
                visit(sh.cssRules);
            }
            catch { }
            if (ruled)
                break;
        }
        return ruled;
    };
    for (const el of Array.from(document.querySelectorAll('[class*="animate-in"], [class*="animate-out"]'))) {
        const cls = el.getAttribute("class") || "";
        const active = cls.split(/\s+/).filter((t) => {
            const m = t.match(/^(?:(motion-safe|data-\[state=([\w-]+)\]|data-\[([\w-]+)\]|data-(open|closed)):)?(animate-(?:in|out))$/);
            if (!m)
                return false;
            if (m[2])
                return el.getAttribute("data-state") === m[2];
            if (m[3] || m[4])
                return el.hasAttribute(`data-${m[3] || m[4]}`);
            return true;
        });
        if (!active.length)
            continue;
        const cs = getComputedStyle(el);
        if (cs.animationName !== "none" && cs.animationName !== "")
            continue;
        out.push({ what: `has ${active.join(" ")} but no animation runs (computed animation-name: none)${defined() ? "" : " — no stylesheet defines .animate-in: tailwindcss-animate / tw-animate-css is missing"}; it appears and disappears in one frame [6.12, P59]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
    return out;
});
/* ───────────────────────── overlays that appear by themselves: 6.12 P59 ───────────────────────── */
/**
 * In-page probe, installed before the page's own scripts (addInitScript): from the first frame until the page settles
 * (`windowMs` after load), every fixed layer (and sticky bar at the top/bottom edge) that shows up by itself — a
 * cookie/consent banner, a toast, a promo bar, a chat bubble — is watched frame by frame for ~600 ms from the moment it
 * becomes visible. Motion = a running finite animation/transition (on it, its wrappers, or a child as big as half of
 * it), a CSS animation/transition event, element.animate(), JS rewriting its style= every frame, or a look that changes
 * between frames (opacity, transform, clip, position, size). Layers already on the first frame, parser-inserted before
 * DOMContentLoaded, or re-mounted by hydration in place are part of the page load, not overlays that appear.
 * `armLeave` then watches one of them leave after its dismiss control is clicked.
 */
const selfProbe = (windowMs) => {
    const W = window;
    if (W.__bsSelf)
        return;
    const S = (W.__bsSelf = { tracked: new Map(), events: [], list: [], gone: [], done: false, load: null, dcl: null, leave: null, t0: performance.now() });
    addEventListener("load", () => { S.load = performance.now(); }, { once: true });
    document.addEventListener("DOMContentLoaded", () => { S.dcl = performance.now(); }, { once: true });
    const rec = (e) => S.events.push({ t: performance.now(), el: e.target });
    for (const t of ["animationstart", "transitionrun", "transitionstart"])
        document.addEventListener(t, rec, true);
    const origAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) { S.events.push({ t: performance.now(), el: this }); return origAnimate.apply(this, args); };
    const writes = new Map();
    const dirty = new Set();
    const scanned = new WeakMap();
    const chain = (el) => { const o = []; for (let n = el.parentElement, i = 0; n && n !== document.body && n !== document.documentElement && i < 8; n = n.parentElement, i++) o.push(n); return o; };
    const opac = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
    const shown = (el) => (typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).visibility !== "hidden");
    const meaningful = (el) => (el.innerText || "").trim().length > 0 || !!el.querySelector("a, button, input, select, textarea, [role=button]");
    const alive = (el) => {
        if (!el.isConnected)
            return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || !shown(el))
            return false;
        const r = el.getBoundingClientRect();
        return r.width * r.height >= 1500 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && opac(el) > 0.05 && meaningful(el);
    };
    const look = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return [cs.opacity, cs.transform, cs.translate, cs.scale, cs.clipPath, Math.round(r.top), Math.round(r.left), Math.round(r.height), Math.round(r.width), ...chain(el).map((n) => { const c = getComputedStyle(n); return c.opacity + c.transform + c.translate + c.clipPath; })].join("|"); };
    const bigKids = (el) => { const r = el.getBoundingClientRect(); const a = r.width * r.height; const o = []; for (const k of el.querySelectorAll("*")) { if (o.length >= 12) break; const b = k.getBoundingClientRect(); if (b.width * b.height >= a * 0.5) o.push(k); } return o; };
    const finite = (a) => { try { return Number.isFinite(a.effect.getComputedTiming().endTime); } catch { return true; } };
    const animated = (l, kids) => { try { return [l, ...kids, ...chain(l)].some((n) => n.getAnimations().some((a) => (a.playState === "running" || a.playState === "pending") && finite(a))); } catch { return false; } };
    const related = (l, kids, x) => x === l || kids.includes(x) || chain(l).includes(x);
    const isLayer = (el) => {
        const p = getComputedStyle(el).position;
        if (p !== "fixed" && p !== "sticky")
            return false;
        return !el.closest("header, nav, [role=banner], [role=navigation], nextjs-portal, [data-nextjs-toast], [data-babysitter], babysitter-studio");
    };
    new MutationObserver((list) => {
        for (const m of list) {
            if (m.type === "childList") {
                for (const n of m.addedNodes)
                    if (n.nodeType === 1)
                        dirty.add(n);
            }
            else {
                dirty.add(m.target);
                if (m.attributeName === "style") {
                    const k = (writes.get(m.target) || 0) + 1;
                    writes.set(m.target, k);
                    if (k === 3)
                        S.events.push({ t: performance.now(), el: m.target });
                }
            }
        }
        const L = S.leave;
        if (L && L.tAction != null && L.tGone == null && !alive(L.el))
            L.tGone = performance.now();
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open", "data-state", "aria-hidden"] });
    document.addEventListener("pointerdown", () => { if (S.leave && S.leave.tAction == null) S.leave.tAction = performance.now(); }, true);
    document.addEventListener("click", () => { if (S.leave && S.leave.tAction == null) S.leave.tAction = performance.now(); }, true);
    let frame = 0;
    const step = () => {
        const now = performance.now();
        if (!document.body) {
            requestAnimationFrame(step);
            return;
        }
        if (frame === 0)
            dirty.add(document.body);
        let budget = 6000;
        for (const root of [...dirty]) {
            dirty.delete(root);
            if (root.nodeType !== 1 || !root.isConnected || budget <= 0)
                continue;
            const last = scanned.get(root);
            if (last && now - last < 250 && root !== document.body) {
                dirty.add(root);
                continue;
            }
            scanned.set(root, now);
            const all = [root, ...root.querySelectorAll("*")];
            budget -= all.length;
            for (const el of all)
                if (!S.tracked.has(el) && isLayer(el))
                    S.tracked.set(el, { prev: frame === 0 ? alive(el) : false, kids: [], watch: null });
        }
        for (const [el, st] of S.tracked) {
            const a = alive(el);
            if (a && !st.prev && !st.watch) {
                // part of the page load, or the same box re-mounted by hydration in place
                const r = el.getBoundingClientRect();
                const sig = `${el.tagName}|${el.getAttribute("class") || ""}|${Math.round(r.top)}|${Math.round(r.height)}`;
                const remount = S.gone.some((g) => g.sig === sig && now - g.t < 200);
                const sticky = getComputedStyle(el).position === "sticky";
                const edgeBar = !sticky || r.top <= 1 || r.bottom >= innerHeight - 1;
                if (S.dcl != null && !remount && edgeBar) {
                    st.watch = { t: now, looks: [look(el)], anim: animated(el, (st.kids = bigKids(el))), end: now + 600 };
                    S.list.push(el);
                }
            }
            if (!a && st.prev) {
                const r = el.getBoundingClientRect();
                S.gone.push({ sig: `${el.tagName}|${el.getAttribute("class") || ""}|${Math.round(r.top)}|${Math.round(r.height)}`, t: now });
            }
            if (st.watch && !st.watch.final && now <= st.watch.end) {
                if (a) {
                    st.watch.looks.push(look(el));
                    if (!st.watch.anim)
                        st.watch.anim = animated(el, st.kids);
                }
            }
            else if (st.watch && !st.watch.final) {
                const w = st.watch;
                w.moved = w.anim || new Set(w.looks).size > 1 || S.events.some((e) => e.t >= w.t - 120 && e.t <= w.end && e.el instanceof Element && related(el, st.kids, e.el));
                w.final = true;
            }
            st.prev = a;
        }
        const L = S.leave;
        if (L && !L.done) {
            if (alive(L.el)) {
                if (L.tAction != null) {
                    L.looks.push(look(L.el));
                    if (!L.anim)
                        L.anim = animated(L.el, L.kids);
                }
            }
            else if (L.tAction != null && L.tGone == null)
                L.tGone = now;
            if (L.tAction != null && (now - L.tAction > 1500 || (L.tGone != null && now - L.tGone > 100))) {
                L.moved = L.anim || L.looks.some((x) => x !== L.pre) || S.events.some((e) => e.t >= L.tAction && e.el instanceof Element && related(L.el, L.kids, e.el));
                L.left = L.tGone != null;
                L.done = true;
            }
            if (L.tAction == null && now - L.t0 > 5000)
                L.done = true;
        }
        const pending = [...S.tracked.values()].some((st) => st.watch && !st.watch.final);
        if (!S.done && S.load != null && now - S.load > windowMs && !pending)
            S.done = true;
        if (!S.done && now - S.t0 > windowMs + 20000)
            S.done = true;
        frame++;
        if (!S.done || (L && !L.done))
            requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    S.report = () => {
        const appeared = S.list.filter((el) => S.tracked.get(el).watch && S.tracked.get(el).watch.final);
        // the outermost layer only: a toast inside a toaster root that appeared with it is one finding
        const outer = appeared.filter((el) => !appeared.some((o) => o !== el && o.contains(el)));
        return outer.map((el) => {
            const w = S.tracked.get(el).watch;
            const i = S.list.indexOf(el);
            el.setAttribute("data-bs-self", String(i));
            const dead = ((el.getAttribute("class") || "").match(/(^|\s)(animate-in|fade-in\S*|slide-in-from-\S+|zoom-in\S*)(?=\s|$)/g) || []).map((x) => x.trim());
            return { i, moved: !!w.moved, at: Math.round(w.t - (S.load ?? S.t0)), alive: alive(el), dead: dead.length && getComputedStyle(el).animationName === "none" ? dead.join(" ") : "", where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) };
        });
    };
    S.dismissControl = (i) => {
        const l = S.list[i];
        if (!l || !alive(l))
            return null;
        const label = (e) => [e.getAttribute("aria-label"), e.textContent, e.getAttribute("title"), e.getAttribute("value")].filter(Boolean).join(" ").trim().replace(/\s+/g, " ");
        const score = (e) => {
            const t = label(e);
            if (e.matches("a[href]") && !/^(#|javascript:)/.test(e.getAttribute("href") || ""))
                return 0;
            if (/reject|decline|deny|refuse|necessary only|only necessary|essential only|отклон|только необх/i.test(t))
                return 4;
            if (/close|dismiss|no,? thanks|not now|later|hide|закры|скрыть|^[×✕✖xX]$/.test(t) || /close|dismiss/i.test(t))
                return 3;
            if (/accept|allow|agree|got it|^ok(ay)?\b|understand|continue|принять|соглас|понятно|хорошо/i.test(t))
                return 2;
            return !t && e.querySelector("svg") ? 1 : 0;
        };
        const items = Array.from(l.querySelectorAll("button, [role=button], a[href], input[type=button], input[type=submit]")).filter((e) => W.__uiVisible(e) && !e.matches("[disabled], [aria-disabled=true]"));
        const best = items.map((e) => [e, score(e)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])[0];
        if (!best)
            return null;
        for (const e of document.querySelectorAll("[data-bs-dismiss]"))
            e.removeAttribute("data-bs-dismiss");
        best[0].setAttribute("data-bs-dismiss", "");
        return { label: label(best[0]).slice(0, 40) || "close", where: W.__uiDescribe(best[0]), selector: W.__uiSelector(best[0]), human: W.__uiHuman(best[0]) };
    };
    S.armLeave = (i) => {
        const el = S.list[i];
        writes.clear();
        S.leave = { el, pre: look(el), kids: bigKids(el), looks: [], anim: false, tAction: null, tGone: null, done: false, t0: performance.now() };
        if (S.done)
            requestAnimationFrame(step);
    };
};
/**
 * 6.12 — overlays that appear by themselves (cookie/consent banners, toasts, promo bars, chat bubbles) come in AND go
 * away with motion. Trigger-opened overlays are 6.12's `overlayMotion`; these were never tested (truelogos.pro, 2026-10:
 * the cookie banner popped in after 1 s in one frame and vanished in one frame on Accept/Reject). Loads `route` itself
 * on a fresh page (call it before any navigation; nothing is remembered, so the banner shows), with
 * prefers-reduced-motion: no-preference, samples frames from the start until `windowMs` after load, then clicks each
 * appeared layer's dismiss control (Reject / Close before Accept) and watches it leave.
 */
export async function selfAppearingMotion(page, route, { windowMs = 3000 } = {}) {
    const out = [];
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => { });
    await page.addInitScript(selfProbe, windowMs);
    await page.goto(route, { waitUntil: "load" }).catch(() => { });
    await page.waitForFunction(() => window.__bsSelf && window.__bsSelf.done, null, { timeout: windowMs + 25000 }).catch(() => { });
    const layers = await page.evaluate(() => (window.__bsSelf ? window.__bsSelf.report() : [])).catch(() => []);
    for (const l of layers)
        if (!l.moved)
            out.push({ what: `appears by itself (${l.at} ms after load) in one frame with no motion — no opacity, transform or clip change${l.dead ? `; its classes "${l.dead}" promise an animation but none runs (tailwindcss-animate / tw-animate-css missing)` : ""}. Give it an enter animation (fade + an 8–16px slide, 200–300 ms, motion-reduce:animate-none) [6.12, P59]`, where: l.where, selector: l.selector, human: l.human });
    for (const l of layers) {
        if (!l.alive)
            continue;
        const ctl = await page.evaluate((i) => window.__bsSelf.dismissControl(i), l.i).catch(() => null);
        if (!ctl)
            continue;
        const url = page.url();
        await page.evaluate((i) => window.__bsSelf.armLeave(i), l.i);
        await page.locator("[data-bs-dismiss]").first().click({ timeout: 3000 }).catch(() => { });
        await page.waitForFunction(() => window.__bsSelf.leave && window.__bsSelf.leave.done, null, { timeout: 8000 }).catch(() => { });
        if (page.url() !== url)
            break;
        const r = await page.evaluate(() => { const L = window.__bsSelf.leave; return L && { left: L.left, moved: L.moved, ms: L.tGone != null && L.tAction != null ? Math.round(L.tGone - L.tAction) : null }; }).catch(() => null);
        if (r && r.left && !r.moved)
            out.push({ what: `"${ctl.label}" removes it in one frame (gone ${r.ms ?? 0} ms after the click, no exit motion) — give it an exit that mirrors the enter (fade/slide out, 150–250 ms) [6.12, P59]`, where: `${l.where} (dismissed by ${ctl.where})`, selector: l.selector, human: l.human });
    }
    return out;
}
/* ───────────────────────── the open mobile menu: 3.5 / 6.4 / 1.16 ───────────────────────── */
/**
 * Finds the menu toggle of a narrow layout (header nav links hidden + a button that says it opens them: aria-expanded /
 * aria-controls / a "menu" label / an icon-only header button), opens it and marks the panel that shows the links
 * (`data-bs-menu-panel`). Returns null when there is no such menu (navReachable covers "no way to the links").
 */
async function openMobileMenu(page) {
    const prep = await page.evaluate(() => {
        const W = window;
        if (Math.min(innerWidth, screen.width) >= 1024)
            return null;
        for (const a of ["data-bs-menu-link", "data-bs-menu-toggle", "data-bs-menu-panel", "data-bs-pre", "data-bs-vis"])
            for (const e of document.querySelectorAll(`[${a}]`))
                e.removeAttribute(a);
        const dest = (a) => { try {
            const u = new URL(a.href, location.href);
            return u.origin === location.origin ? (u.pathname.replace(/\/$/, "") || "/") : u.href;
        }
        catch {
            return null;
        } };
        const isLogo = (a) => (dest(a) === "/" && !!a.querySelector("img, svg")) || /logo|brand/i.test(a.className + " " + (a.getAttribute("aria-label") || ""));
        const links = Array.from(document.querySelectorAll("header a[href], nav a[href], [role=navigation] a[href]"))
            .filter((a) => !a.closest("footer, [role=contentinfo]") && !isLogo(a) && dest(a) && !/^(mailto|tel):/.test(a.getAttribute("href") || ""));
        const shown = new Set(links.filter((a) => W.__uiVisible(a)).map(dest));
        const hidden = links.filter((a) => !W.__uiVisible(a) && !shown.has(dest(a)));
        if (new Set(hidden.map(dest)).size < 2)
            return null;
        // the menu may show these links, or its own copies of them (a portal sheet): any link to the same places that
        // is not on screen yet. Links already visible (a "Pricing" CTA in the page) are not the menu.
        const dests = [...new Set(hidden.map(dest))];
        for (const a of document.querySelectorAll("a[href]"))
            if (!a.closest("footer, [role=contentinfo]") && dests.includes(dest(a)) && !W.__uiVisible(a))
                a.setAttribute("data-bs-menu-link", "");
        for (const a of document.querySelectorAll("a[href]"))
            if (W.__uiVisible(a))
                a.setAttribute("data-bs-vis", "");
        const other = /search|cart|basket|\bbag\b|theme|dark mode|light mode|language|\blang\b|currency|account|profile|avatar|notification|cookie|share|play|video|filter|sort/i;
        const cands = Array.from(document.querySelectorAll("button, [role=button], summary, label[for], a[href^='#'], [aria-expanded], [aria-controls]"))
            .filter((el) => W.__uiVisible(el) && !el.closest("footer, [role=contentinfo]") && el.getAttribute("aria-expanded") !== "true" && el.getAttribute("aria-haspopup") !== "listbox");
        const score = (el) => {
            const label = [el.getAttribute("aria-label"), el.getAttribute("title"), el.textContent, typeof el.className === "string" ? el.className : "", el.id].join(" ");
            const says = /menu|navigation|\bnav\b|burger|drawer|меню|навигац/i.test(label);
            if (other.test(label) && !says)
                return 0;
            let s = says ? 3 : 0;
            const ctl = el.getAttribute("aria-controls");
            const t = ctl && document.getElementById(ctl.split(/\s+/)[0]);
            if (t && t.querySelector("[data-bs-menu-link]"))
                s += 3;
            if (el.hasAttribute("aria-expanded"))
                s += 1;
            const inHeader = !!el.closest("header, [role=banner], nav, [role=navigation]");
            if (inHeader)
                s += 1;
            if (inHeader && el.querySelector("svg, img, span") && !(el.textContent || "").trim())
                s += 1;
            if (el.getBoundingClientRect().top > innerHeight)
                s -= 3;
            return s;
        };
        const ranked = cands.map((el) => [el, score(el)]).filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
        ranked.forEach(([el], i) => el.setAttribute("data-bs-menu-toggle", String(i)));
        if (!ranked.length)
            return null;
        const bar = ranked[0][0].closest("header, [role=banner]") || ranked[0][0].parentElement;
        const headerBottom = Math.round(Math.max(0, Math.min(innerHeight * 0.4, bar.getBoundingClientRect().bottom)));
        // fixed layers already on screen (cookie banner, chat bubble, the header itself): not something the menu opened
        for (const el of document.body.querySelectorAll("*"))
            if (getComputedStyle(el).position === "fixed" && W.__uiVisible(el))
                el.setAttribute("data-bs-pre", "");
        return { n: ranked.length, headerBottom, dests };
    });
    if (!prep)
        return null;
    for (let i = 0; i < prep.n; i++) {
        const t = page.locator(`[data-bs-menu-toggle="${i}"]`).first();
        const url = page.url();
        await t.click({ timeout: 2000 }).catch(() => { });
        await page.waitForTimeout(350);
        await settle(page);
        if (page.url() !== url) {
            await page.goBack().catch(() => { });
            return null;
        }
        const panel = await page.evaluate((dests) => {
            const W = window;
            const dest = (a) => { try {
                const u = new URL(a.href, location.href);
                return u.origin === location.origin ? (u.pathname.replace(/\/$/, "") || "/") : u.href;
            }
            catch {
                return null;
            } };
            // links rendered on opening (a portal menu mounts new ones) count too
            for (const a of document.querySelectorAll("a[href]:not([data-bs-vis]):not([data-bs-menu-link])"))
                if (!a.closest("footer, [role=contentinfo]") && dests.includes(dest(a)))
                    a.setAttribute("data-bs-menu-link", "");
            const links = Array.from(document.querySelectorAll("[data-bs-menu-link]")).filter((a) => W.__uiVisible(a));
            if (links.length < 2)
                return null;
            let lca = links[0];
            while (lca && !links.every((a) => lca.contains(a)))
                lca = lca.parentElement;
            if (!lca || lca === document.body || lca === document.documentElement)
                return null;
            const painted = (e) => { const cs = getComputedStyle(e); return W.__uiRGBA(cs.backgroundColor)[3] >= 0.5 || /gradient|url\(/.test(cs.backgroundImage) || (!!cs.backdropFilter && cs.backdropFilter !== "none"); };
            // the panel: the nearest box around the links that draws a surface, floats, or is a dialog — not the header bar
            let panel = null;
            for (let e = lca; e && e !== document.body; e = e.parentElement) {
                if (e.matches("header, [role=banner]"))
                    break;
                const pos = getComputedStyle(e).position;
                if (painted(e) || e.matches("dialog, [role=dialog]") || pos === "fixed" || pos === "absolute") {
                    panel = e;
                    break;
                }
            }
            panel = panel || lca;
            panel.setAttribute("data-bs-menu-panel", "");
            return { where: W.__uiDescribe(panel), selector: W.__uiSelector(panel), human: W.__uiHuman(panel) };
        }, prep.dests);
        if (panel)
            return { ...prep, ...panel, toggle: i };
        await page.keyboard.press("Escape").catch(() => { });
        if ((await t.getAttribute("aria-expanded").catch(() => null)) === "true")
            await t.click({ timeout: 1000 }).catch(() => { });
        await page.waitForTimeout(200);
    }
    return null;
}
async function closeMobileMenu(page, m) {
    await recover(page);
    const open = () => page.evaluate(() => { const p = document.querySelector("[data-bs-menu-panel]"); return !!p && Array.from(p.querySelectorAll("[data-bs-menu-link]")).some((a) => window.__uiVisible(a)); }).catch(() => false);
    await page.keyboard.press("Escape").catch(() => { });
    await page.waitForTimeout(250);
    if (await open()) {
        const t = page.locator(`[data-bs-menu-toggle="${m.toggle}"]`).first();
        if (await t.isVisible().catch(() => false))
            await t.click({ timeout: 1500 }).catch(() => { });
        else
            await page.locator('header [aria-expanded="true"], nav [aria-expanded="true"], header button[aria-label*="close" i]').first().click({ timeout: 1500 }).catch(() => { });
        await page.waitForTimeout(250);
    }
    await settle(page);
    await page.evaluate(() => { for (const a of ["data-bs-menu-link", "data-bs-menu-toggle", "data-bs-menu-panel", "data-bs-pre", "data-bs-vis"]) for (const e of document.querySelectorAll(`[${a}]`)) e.removeAttribute(a); }).catch(() => { });
}
/** In-page: geometry of the open panel — off-screen, tap targets, what covers its items, and whether it covers the page. */
const menuGeometry = (headerBottom) => {
    const W = window;
    const hard = [], soft = [];
    const panel = document.querySelector("[data-bs-menu-panel]");
    if (!panel)
        return { hard, soft };
    const at = (e) => ({ where: W.__uiDescribe(e), selector: W.__uiSelector(e), human: W.__uiHuman(e) });
    const pr = panel.getBoundingClientRect();
    if (pr.right > innerWidth + 1 || pr.left < -1)
        hard.push({ what: `open mobile menu goes off-screen (left/right ${Math.round(pr.left)}/${Math.round(pr.right)}, viewport ${innerWidth}) [1.2, P02]`, ...at(panel) });
    const name = (e) => ((e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)) || e.tagName.toLowerCase();
    const items = Array.from(panel.querySelectorAll("a[href], button, [role=button], [role=menuitem], [role=option], [role=tab], [role=switch], [role=checkbox], summary, input:not([type=hidden]), select, textarea"))
        .filter((e) => W.__uiVisible(e) && !e.closest("[inert]") && !(e.parentElement && e.parentElement.closest("a[href], button, [role=button]")));
    const scrollers = new Map();
    for (const e of items) {
        let r = e.getBoundingClientRect();
        if (r.height < 43.5 || r.width < 43.5)
            soft.push({ what: `open mobile menu: "${name(e)}" is a ${Math.round(r.width)}×${Math.round(r.height)}px tap target — under 44×44 px on a touch screen [3.5, WCAG 2.5.5]`, ...at(e) });
        if (r.bottom > innerHeight || r.top < 0) {
            for (let p = e.parentElement; p && p !== document.body; p = p.parentElement)
                if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && !scrollers.has(p))
                    scrollers.set(p, p.scrollTop);
            e.scrollIntoView({ block: "nearest", behavior: "instant" });
            r = e.getBoundingClientRect();
        }
        for (const [fx, fy] of [[0.5, 0.5], [0.12, 0.5], [0.88, 0.5]]) {
            const x = r.left + r.width * fx, y = r.top + r.height * fy;
            if (y < 0 || y > innerHeight || x < 0 || x > innerWidth)
                continue;
            const t = document.elementFromPoint(x, y);
            if (!t || e.contains(t) || t.contains(e) || panel.contains(t))
                continue;
            let layer = t;
            for (let n = t; n && n !== document.body; n = n.parentElement) {
                const p = getComputedStyle(n).position;
                if (p === "fixed" || p === "sticky")
                    layer = n;
            }
            hard.push({ what: `open mobile menu: "${name(e)}" is covered by ${W.__uiDescribe(layer)} — it cannot be tapped [3.5/4.6, P57]`, ...at(e) });
            break;
        }
    }
    for (const [p, top] of scrollers)
        p.scrollTop = top;
    // does it cover the page coherently: full height, or a backdrop that dims what is around it?
    const bgA = (e) => W.__uiRGBA(getComputedStyle(e).backgroundColor)[3];
    const dims = (e) => { const cs = getComputedStyle(e); return bgA(e) >= 0.1 || (!!cs.backdropFilter && cs.backdropFilter !== "none"); };
    const paints = (e) => { const cs = getComputedStyle(e); return bgA(e) >= 0.1 || cs.backgroundImage !== "none" || /^(IMG|VIDEO|CANVAS|PICTURE|svg)$/i.test(e.tagName) || Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()); };
    const big = (e) => { const r = e.getBoundingClientRect(); return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9; };
    // a backdrop the menu brought with it (pointer-events:none ones are not in elementsFromPoint)
    const backdrops = Array.from(document.body.querySelectorAll("*")).filter((e) => !e.hasAttribute("data-bs-pre") && !panel.contains(e) && getComputedStyle(e).position === "fixed" && W.__uiVisible(e) && dims(e)).map((e) => e.getBoundingClientRect());
    let total = 0, bare = 0, below = 0, sides = 0;
    const cols = 7, rows = 12, top = headerBottom + 4, h = innerHeight - headerBottom - 8;
    if (h > 40)
        for (let yi = 0; yi < rows; yi++)
            for (let xi = 0; xi < cols; xi++) {
                const x = 3 + ((innerWidth - 6) * xi) / (cols - 1), y = top + (h * yi) / (rows - 1);
                let verdict = "page";
                if (backdrops.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom))
                    verdict = "menu";
                else
                    for (const e of document.elementsFromPoint(x, y)) {
                        if (panel.contains(e)) {
                            verdict = "menu";
                            break;
                        }
                        if (e.contains(panel)) {
                            if (dims(e)) {
                                verdict = "menu";
                                break;
                            }
                            continue;
                        }
                        const pre = e.closest("[data-bs-pre]");
                        if (pre && !big(pre) && !pre.contains(panel)) {
                            verdict = "other"; // a cookie banner or chat bubble that was there before: neither menu nor page
                            break;
                        }
                        if (paints(e))
                            break;
                    }
                if (verdict === "other")
                    continue;
                total++;
                if (verdict === "page") {
                    bare++;
                    if (y > pr.bottom)
                        below++;
                    else if (x < pr.left || x > pr.right)
                        sides++;
                }
            }
    if (total && bare / total >= 0.1) {
        const spots = [below ? "below it" : "", sides ? "at its sides" : "", bare - below - sides > 0 ? "around it" : ""].filter(Boolean).join(", ");
        soft.push({ what: `open mobile menu leaves ${Math.round((100 * bare) / total)}% of the screen showing the page undimmed (${spots}) — make the panel full-height, or put a backdrop behind it (bg-black/50, backdrop-blur) so the page reads as "behind" [3.5]`, ...at(panel) });
    }
    return { hard, soft };
};
/** In-page: median colour (every 3rd pixel, by luminance) of a PNG screenshot, as [r, g, b]. Self-contained (serialized). */
const medianColour = async (b64) => {
    const img = await window.__uiDecode(b64);
    const d = img.data, px = [];
    for (let y = 0; y < img.height; y += 3)
        for (let x = 0; x < img.width; x += 3) {
            const i = (y * img.width + x) * 4;
            px.push([d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]);
        }
    if (!px.length)
        return null;
    px.sort((p, q) => p[3] - q[3]);
    return px[Math.floor(px.length / 2)].slice(0, 3);
};
/**
 * Panel surface vs the theme, from pixels: the panel's median colour against the header bar it opens under and the
 * page as a whole. A light panel under a dark header on a dark site (truelogos.pro, 2026-10: a white inset panel on a
 * navy site) does not match; it does when the site itself is light overall (or the panel matches the header).
 */
async function menuSurface(page, m) {
    const box = await page.evaluate(() => {
        const p = document.querySelector("[data-bs-menu-panel]");
        const r = p.getBoundingClientRect();
        const x = Math.max(0, r.left), y = Math.max(0, r.top);
        return { x, y, w: Math.min(innerWidth, r.right) - x, h: Math.min(innerHeight, r.bottom) - y, vw: innerWidth, vh: innerHeight };
    });
    if (box.w < 24 || box.h < 24)
        return null;
    // layers that are neither the menu nor its header (cookie banner, chat bubble) stay out of the pictures
    const hideForeign = (also) => page.evaluate((also) => {
        if (!document.getElementById("bs-hide-style")) {
            const st = document.createElement("style");
            st.id = "bs-hide-style";
            st.textContent = "[data-bs-hide] { visibility: hidden !important; }";
            document.head.appendChild(st);
        }
        const panel = document.querySelector("[data-bs-menu-panel]");
        const toggle = document.querySelector("[data-bs-menu-toggle]");
        for (const e of document.querySelectorAll("[data-bs-pre]"))
            if (!e.contains(panel) && !(toggle && e.contains(toggle)) && !panel.contains(e))
                e.setAttribute("data-bs-hide", "");
        if (also)
            for (const e of document.querySelectorAll(also))
                e.setAttribute("data-bs-hide", "");
    }, also);
    const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    let withPanel, header, full;
    try {
        await hideForeign(null);
        await frame();
        withPanel = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h }, scale: "css" });
        await hideForeign("[data-bs-menu-panel]");
        await frame();
        header = m.headerBottom >= 8 ? await page.screenshot({ clip: { x: 0, y: 0, width: box.vw, height: m.headerBottom }, scale: "css" }) : null;
    }
    finally {
        await recover(page);
    }
    const colours = { panel: await page.evaluate(medianColour, withPanel.toString("base64")).catch(() => null), head: header ? await page.evaluate(medianColour, header.toString("base64")).catch(() => null) : null };
    if (!colours.panel || !colours.head)
        return null;
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (p, q) => { const x = lum(p), y = lum(q); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const tone = (c) => (lum(c) > 0.4 ? "light" : lum(c) < 0.12 ? "dark" : "mid-tone");
    const rHead = ratio(colours.panel, colours.head);
    if (rHead < 3)
        return null;
    // the site as a whole (the whole page, menu and fixed layers hidden): a light panel on a light site is its own surface
    try {
        await hideForeign("[data-bs-menu-panel], header, [role=banner]");
        await frame();
        full = await page.screenshot({ fullPage: true, scale: "css" }).catch(() => null);
    }
    finally {
        await recover(page);
    }
    let site = null;
    if (full)
        site = await page.evaluate(medianColour, full.toString("base64")).catch(() => null);
    if (site && ratio(colours.panel, site) < 3)
        return null;
    return { what: `open mobile menu's surface doesn't match the theme: a ${tone(colours.panel)} panel (${hex(colours.panel)}) opens under a ${tone(colours.head)} header (${hex(colours.head)}, ${rHead.toFixed(1)}:1 apart)${site ? ` on a ${tone(site)} site (${hex(site)})` : ""}. Use the header's / page's surface token for the panel so the menu reads as part of the site [3.5 / 1.16]`, where: m.where, selector: m.selector, human: m.human };
}
/**
 * 3.5 — the open mobile menu, as a person sees it after tapping the burger. Every check above runs with the menu
 * closed, so the open panel's look was never judged (truelogos.pro, 2026-10: a white square-cornered inset panel on a
 * navy site, 32 px buttons next to 44–56 px pill CTAs, page content showing below). Opens the menu and checks:
 *   hard — text in the panel is legible (6.4), nothing covers its items, it fits the screen, no sideways scroll;
 *   soft — 44×44 px tap targets; it covers the page coherently (full height, or a backdrop that dims the rest);
 *          its surface matches the theme (not a light panel under a dark header on a dark site, or the reverse).
 * Closes the menu afterwards. No menu toggle (or a wide screen): { applicable: false }.
 */
export async function mobileMenu(page, allowLightWeights = false) {
    const m = await openMobileMenu(page);
    if (!m)
        return { applicable: false, hard: [], soft: [], eye: [] };
    const hard = [], soft = [];
    let eye = [];
    try {
        const txt = await illegibleText(page, allowLightWeights, "[data-bs-menu-panel]");
        for (const o of txt.hard)
            hard.push({ ...o, what: `open mobile menu: ${o.what} [6.4]` });
        eye = txt.eye;
        const geo = await page.evaluate(menuGeometry, m.headerBottom);
        hard.push(...geo.hard);
        soft.push(...geo.soft);
        const hx = await horizontalOverflow(page);
        if (hx.length)
            hard.push({ what: `opening the mobile menu causes horizontal overflow: ${hx[0].what} [2.1]`, where: hx[0].where, selector: hx[0].selector, human: hx[0].human });
        const surf = await menuSurface(page, m).catch(() => null);
        if (surf)
            soft.push(surf);
    }
    finally {
        await closeMobileMenu(page, m);
    }
    return { applicable: true, hard, soft, eye };
}
/**
 * 3.5 / 1.3 / 1.16 — the open mobile menu speaks the site's language: its buttons match the site's CTA set (height,
 * corner radius, font — from the site-wide signatures `sigs`), and an inset panel's corners match the site's cards
 * (square on a rounded site reads as a foreign box). Soft: a look, not a breakage.
 */
export async function mobileMenuConsistency(page, sigs) {
    const m = await openMobileMenu(page);
    if (!m)
        return { applicable: false, list: [] };
    const buttons = sigs.filter((s) => s.kind === "button");
    const site = {
        heights: [...new Set(buttons.map((s) => s.height))].sort((a, b) => a - b),
        shapes: buttons.map((s) => ({ radius: s.radius, height: s.height })),
        fonts: [...new Set(buttons.map((s) => s.font))],
        cards: sigs.filter((s) => s.kind === "card").map((s) => s.radius).sort((a, b) => a - b),
    };
    try {
        const list = await page.evaluate((site) => {
            const W = window;
            const out = [];
            const panel = document.querySelector("[data-bs-menu-panel]");
            if (!panel)
                return out;
            const at = (e) => ({ where: W.__uiDescribe(e), selector: W.__uiSelector(e), human: W.__uiHuman(e) });
            const shape = (r, h) => (r >= h / 2 - 1 ? "pill" : r <= 2 ? "square" : "rounded");
            const font = (cs) => cs.fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
            const CHIP = "[aria-pressed], [aria-selected], [aria-checked], [role=tab], [role=radio], [role=option], [role=switch], [role=checkbox], [role=menuitemradio], [role=menuitemcheckbox], [data-state=on], [data-state=off]";
            const chipRow = (el) => { const p = el.parentElement; if (!p) return false; const same = Array.from(p.children).filter((k) => k.tagName === el.tagName && k.className === el.className && W.__uiVisible(k)); return same.length >= 3 && new Set(same.map((k) => Math.round(k.getBoundingClientRect().top))).size < same.length; };
            const parentBg = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = W.__uiRGBA(getComputedStyle(p).backgroundColor); if (c[3] > 0.5) return c.join(); } return "255,255,255,1"; };
            if (site.heights.length)
                for (const el of Array.from(panel.querySelectorAll("button, a[href], [role=button], input[type=submit]"))) {
                    // a dropdown trigger (currency, language) is a field-like control, not a CTA
                    if (!W.__uiVisible(el) || !(el.textContent || "").trim() || el.matches(CHIP) || el.closest(CHIP) || chipRow(el) || el.matches('[aria-haspopup]:not([aria-haspopup=false]), [role=combobox]'))
                        continue;
                    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
                    const bg = W.__uiRGBA(cs.backgroundColor);
                    const filled = (bg[3] > 0.5 && bg.join() !== parentBg(el)) || /gradient/.test(cs.backgroundImage);
                    const outlined = parseFloat(cs.borderTopWidth) > 0 && W.__uiRGBA(cs.borderTopColor)[3] > 0.2;
                    if (!(filled || outlined) || r.height < 20 || r.height > 80 || parseFloat(cs.paddingLeft) < 8 || (el.matches("a") && !W.__uiButtonLike(el, true)))
                        continue;
                    const h = Math.round(r.height), rad = Math.min(Math.round(parseFloat(cs.borderTopLeftRadius)), 999), f = font(cs);
                    const diffs = [];
                    const nearest = Math.min(...site.heights.map((x) => Math.abs(x - h)));
                    if (nearest > 4)
                        diffs.push(`height ${h}px (site buttons: ${site.heights.join("/")}px)`);
                    const shapes = new Set(site.shapes.map((s) => shape(s.radius, s.height)));
                    const mine = shape(rad, h);
                    if (!shapes.has(mine))
                        diffs.push(`${mine} corners, ${rad}px (site buttons are ${[...shapes].join("/")})`);
                    else if (mine !== "pill" && Math.min(...site.shapes.filter((s) => shape(s.radius, s.height) === mine).map((s) => Math.abs(s.radius - rad))) > 3)
                        diffs.push(`corner radius ${rad}px (site buttons: ${[...new Set(site.shapes.map((s) => s.radius))].join("/")}px)`);
                    if (site.fonts.length && !site.fonts.includes(f))
                        diffs.push(`font "${f}" (site buttons: ${site.fonts.join(", ")})`);
                    if (diffs.length)
                        out.push({ what: `open mobile menu: button "${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)}" doesn't match the site's buttons — ${diffs.join("; ")}. Use the kit Button with the site's CTA size [1.3 / 1.16, P04 P46]`, ...at(el) });
                }
            // an inset panel's corners vs the site's cards
            if (site.cards.length) {
                const pr = panel.getBoundingClientRect();
                const inset = pr.left > 2 || innerWidth - pr.right > 2 || innerHeight - pr.bottom > 2;
                const cs = getComputedStyle(panel);
                const rad = Math.max(...["TopLeft", "TopRight", "BottomLeft", "BottomRight"].map((k) => parseFloat(cs[`border${k}Radius`]) || 0));
                const med = site.cards[Math.floor(site.cards.length / 2)];
                if (inset && ((rad <= 2 && med >= 8) || (rad >= 8 && med <= 2)))
                    out.push({ what: `open mobile menu panel has ${rad <= 2 ? "square" : "rounded"} corners (${Math.round(rad)}px) while the site's cards are ${med <= 2 ? "square" : "rounded"} (${med}px) — an inset panel in another shape reads as a foreign box. Give it the card radius, or make it a full-screen sheet [1.17]`, ...at(panel) });
            }
            return out;
        }, site);
        return { applicable: true, list };
    }
    finally {
        await closeMobileMenu(page, m);
    }
}
/* ───────────────────────── every interaction animates what it changes: 6.12 P59 ───────────────────────── */
/**
 * In-page probe for `interactionMotion`: records, per click, what the page did over the next ~700 ms — elements that
 * appeared or disappeared (DOM added/removed, hidden/visibility/opacity/display/size flips), the finite animations and
 * transitions that ran (document.getAnimations each frame), CSS animation/transition events, element.animate() calls,
 * JS rewriting style= every frame, and the per-frame look of everything the click touched.
 */
const ixProbe = () => {
    const W = window;
    if (W.__bsIx)
        return;
    const P = (W.__bsIx = { run: null });
    const rec = (e) => { if (P.run && !P.run.done) P.run.events.push(e.target); };
    for (const t of ["animationstart", "transitionrun", "transitionstart"])
        document.addEventListener(t, rec, true);
    const origAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) { if (P.run && !P.run.done) P.run.events.push(this); return origAnimate.apply(this, args); };
    const writes = new Map();
    new MutationObserver((list) => {
        const R = P.run;
        if (!R || R.done)
            return;
        for (const m of list) {
            if (m.type === "childList") {
                for (const n of m.addedNodes)
                    if (n.nodeType === 1)
                        R.added.add(n);
                for (const n of m.removedNodes)
                    if (n.nodeType === 1)
                        R.removed.add(n);
                R.touched.add(m.target);
            }
            else if (m.type === "characterData") {
                if (m.target.parentElement)
                    R.touched.add(m.target.parentElement);
            }
            else {
                R.touched.add(m.target);
                if (m.attributeName === "style") {
                    const k = (writes.get(m.target) || 0) + 1;
                    writes.set(m.target, k);
                    if (k === 3)
                        R.events.push(m.target);
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open", "data-state", "aria-expanded", "aria-hidden", "aria-selected", "aria-pressed", "aria-checked", "inert"] });
    const area = (r) => r.width * r.height;
    const vis = (el) => {
        if (!el.isConnected)
            return false;
        const r = el.getBoundingClientRect();
        if (area(r) < 1)
            return false;
        return typeof el.checkVisibility === "function" ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) : getComputedStyle(el).visibility !== "hidden";
    };
    const skip = (el) => !!el.closest("[data-babysitter], babysitter-studio, nextjs-portal, [data-nextjs-toast], script, style, svg *");
    const snap = () => { const m = new Map(); for (const el of document.body.querySelectorAll("*")) { if (skip(el)) continue; const r = el.getBoundingClientRect(); if (area(r) >= 1 && vis(el)) m.set(el, { a: area(r), h: Math.round(r.height) }); } return m; };
    const chain = (el) => { const o = []; for (let n = el.parentElement, i = 0; n && n !== document.body && n !== document.documentElement && i < 8; n = n.parentElement, i++) o.push(n); return o; };
    const look = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return [cs.opacity, cs.transform, cs.translate, cs.scale, cs.clipPath, Math.round(r.height), Math.round(r.width), Math.round(r.top), ...chain(el).slice(0, 3).map((n) => { const c = getComputedStyle(n); return c.opacity + c.transform + Math.round(n.getBoundingClientRect().height); })].join("|"); };
    const STATE = ["backgroundColor", "borderTopColor", "color", "boxShadow", "backgroundImage", "outlineColor"];
    const finite = (a) => { try { return Number.isFinite(a.effect.getComputedTiming().endTime); } catch { return true; } };
    P.arm = (trigger) => {
        const R = (P.run = { trigger, t0: performance.now(), added: new Set(), removed: new Set(), touched: new Set(), events: [], anims: new Set(), looks: new Map(), done: false, before: snap(), state: (() => { const cs = getComputedStyle(trigger); return STATE.map((k) => cs[k]); })() });
        const step = () => {
            for (const a of document.getAnimations())
                if ((a.playState === "running" || a.playState === "pending") && finite(a) && a.effect && a.effect.target)
                    R.anims.add(a.effect.target);
            const watch = [...R.added, ...R.touched].filter((n) => n.nodeType === 1).slice(0, 200);
            for (const el of watch) {
                if (!R.looks.has(el))
                    R.looks.set(el, []);
                R.looks.get(el).push(vis(el) ? look(el) : "gone");
            }
            if (performance.now() - R.t0 < 700)
                requestAnimationFrame(step);
            else
                R.done = true;
        };
        requestAnimationFrame(step);
    };
    /** What the last click changed: { appeared, disappeared } (outermost, ≥1500 px², not the trigger), each with `moved`. */
    P.result = () => {
        const R = P.run;
        const t = R.trigger;
        const after = new Map();
        // what may have appeared: anything added, or anything under an element whose attributes/children changed
        const keys = new Set([...R.before.keys(), ...[...R.added, ...R.touched].flatMap((n) => (n.nodeType === 1 && n.isConnected && n !== document.body && n !== document.documentElement ? [n, ...n.querySelectorAll("*")] : []))]);
        for (const el of keys)
            if (el.isConnected && !skip(el) && vis(el))
                after.set(el, { a: area(el.getBoundingClientRect()), h: Math.round(el.getBoundingClientRect().height) });
        const mine = (el) => el === t || t.contains(el) || el.contains(t);
        const outer = (list) => list.filter((el) => !list.some((o) => o !== el && o.contains(el)));
        const appeared = outer([...after.keys()].filter((el) => !R.before.has(el) && after.get(el).a >= 1500 && !mine(el)));
        const disappeared = outer([...R.before.keys()].filter((el) => !after.has(el) && R.before.get(el).a >= 1500 && !mine(el)));
        // sizes from before the click when known: a panel that animated out and was then removed has no box any more
        const size = (x) => (R.before.get(x) || after.get(x) || { a: x.isConnected && x.getBoundingClientRect ? area(x.getBoundingClientRect()) : 0 }).a;
        const related = (s, x) => x === s || (x.contains && x.contains(s) && chain(s).includes(x)) || (s.contains(x) && size(x) >= 0.5 * size(s));
        const moved = (s) => [...R.anims].some((x) => related(s, x)) || R.events.some((x) => x instanceof Element && related(s, x))
            || new Set((R.looks.get(s) || []).filter((l) => l !== "gone")).size > 1;
        const desc = (el) => ({ where: W.__uiDescribe(el), selector: W.__uiSelector(el) || "", human: W.__uiHuman(el), positioned: /fixed|absolute/.test(el.isConnected ? getComputedStyle(el).position : ""), radixSelect: !!(el.querySelector && (el.matches("[data-radix-select-viewport]") || el.querySelector("[data-radix-select-viewport]"))) });
        // a control the click removed (a cookie banner's "Got it", a quiz option replaced by the next question) has no
        // computed style any more: every property reads "" and looked changed with no transition — nothing to judge
        const cs = getComputedStyle(t);
        const now = STATE.map((k) => cs[k]);
        const changed = t.isConnected ? STATE.filter((k, i) => now[i] !== R.state[i]) : [];
        let snaps = false;
        if (changed.length && !R.anims.has(t)) {
            const props = cs.transitionProperty.split(",").map((s) => s.trim());
            const durs = cs.transitionDuration.split(",").map((s) => parseFloat(s) || 0);
            const css = { backgroundColor: /^(all|background|background-color)$/, borderTopColor: /^(all|border|border-color|border-top-color)$/, color: /^(all|color)$/, boxShadow: /^(all|box-shadow)$/, backgroundImage: /^(all|background|background-image)$/, outlineColor: /^(all|outline|outline-color)$/ };
            snaps = changed.some((k) => !props.some((p, i) => css[k].test(p) && (durs[i % durs.length] || 0) > 0));
        }
        return { appeared: appeared.map((el) => ({ ...desc(el), moved: moved(el) })), disappeared: disappeared.map((el) => ({ ...desc(el), moved: moved(el) })), state: changed, snaps };
    };
    P.sig = (el) => [el.tagName, el.getAttribute("role") || "", el.getAttribute("type") || "", (el.getAttribute("class") || "").trim().split(/\s+/).sort().join(" ")].join("|");
    const label = (el) => ((el.getAttribute("aria-label") || "") + " " + (el.textContent || "")).trim().replace(/\s+/g, " ").slice(0, 60);
    /** The same control on a reloaded page (selectors with :nth-of-type shift when a cookie banner is gone): same look and label. */
    P.find = (sig, text, ord) => {
        for (const e of document.querySelectorAll("[data-bs-ix]"))
            e.removeAttribute("data-bs-ix");
        const same = Array.from(document.body.querySelectorAll("*")).filter((e) => P.sig(e) === sig);
        const el = same.find((e) => label(e) === text) || same[ord];
        if (el)
            el.setAttribute("data-bs-ix", "");
        return !!el;
    };
    /** Candidates: everything a person can click on this page, one per component look (signature), with why others were not clicked. */
    P.candidates = () => {
        const sel = 'button, a[href], [role=button], [role=tab], [role=switch], [role=menuitem], [role=option], [role=checkbox], [role=radio], summary, [aria-expanded], [aria-controls], [aria-haspopup], [data-state], label[for], [onclick], input[type=checkbox], input[type=radio]';
        const list = new Set(document.querySelectorAll(sel));
        // cursor:pointer things with no interactive element around or inside them (a clickable card or div)
        for (const el of document.body.querySelectorAll("div, span, li, img, article, section, p, h2, h3, h4"))
            if (getComputedStyle(el).cursor === "pointer" && !el.closest(sel) && !el.querySelector(sel) && !(el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer"))
                list.add(el);
        const here = location.href.split("#")[0];
        const groups = new Map();
        const skipped = { navigates: [], submits: [], destructive: [] };
        for (const el of list) {
            if (skip(el) || !vis(el) || el.matches("[disabled], [aria-disabled=true]") || el.closest("[inert], [aria-hidden=true]"))
                continue;
            if (el.matches("a[href]")) {
                const href = el.getAttribute("href") || "";
                let target = "";
                try { target = new URL(el.href, location.href).href.split("#")[0]; } catch { }
                if (!/^(#|javascript:)/.test(href) && target !== here && !el.matches("[aria-expanded], [aria-controls], [aria-haspopup], [role=button], [role=tab]")) {
                    skipped.navigates.push(W.__uiDescribe(el));
                    continue;
                }
            }
            if ((el.matches("button[type=submit], input[type=submit]") || (el.matches("button:not([type])") && el.closest("form"))))
                if (el.closest("form")) {
                    skipped.submits.push(W.__uiDescribe(el));
                    continue;
                }
            const text = ((el.getAttribute("aria-label") || "") + " " + (el.textContent || "")).trim();
            if (/delete|remove|sign ?out|log ?out|unsubscribe|purchase|buy now|checkout|pay now|удал|выйти|оплат/i.test(text)) {
                skipped.destructive.push(W.__uiDescribe(el));
                continue;
            }
            const sig = P.sig(el);
            if (!groups.has(sig))
                groups.set(sig, []);
            groups.get(sig).push(el);
        }
        const active = (el) => el.matches('[aria-selected=true], [aria-pressed=true], [aria-checked=true], [aria-expanded=true], [data-state=active], [data-state=on], [data-state=open], [data-state=checked], [aria-current]') || (el.matches("input") && el.checked);
        const picks = [];
        let lookalikes = 0;
        for (const [sig, els] of groups) {
            const el = els.find((e) => !active(e)) || els[0];
            lookalikes += els.length - 1;
            const all = Array.from(document.body.querySelectorAll("*")).filter((e) => P.sig(e) === sig);
            picks.push({ sig, text: label(el), ord: all.indexOf(el), selector: W.__uiSelector(el), where: W.__uiDescribe(el), human: W.__uiHuman(el), toggle: el.matches("[aria-expanded], [aria-pressed], [role=switch], [role=checkbox], summary, input, label[for]") });
        }
        return { picks, skipped, lookalikes };
    };
};
/**
 * 6.12 — every interactive element animates what it shows, hides or changes, not only the dropdowns and dialogs
 * 6.12's `overlayMotion` opens: tabs, accordions, "show more", toggled sections, chips that reveal content, toasts,
 * popovers, carousels, filters. On the current page (reloaded with `reload()` every `perReload` clicks, after a
 * navigation, so state does not cascade) every visible clickable — one per component look — is clicked with page
 * navigations blocked; what appeared or disappeared in one frame with no opacity / transform / height / clip motion
 * fails, on open and on toggling back. The clicked control's own state change (fill, border, colour) that snaps without
 * a transition is a soft finding. Links to other pages, form submits and destructive actions are not clicked, and
 * everything not clicked is returned with the reason (`notTested`) — never dropped silently.
 * Runs with prefers-reduced-motion: no-preference.
 *
 * Time: every click has a hard budget (`clickBudget`, ms) and the page a deadline (`deadline`, epoch ms). A click that
 * runs over is abandoned, the page is reloaded and the control is listed as not tested; once the deadline passes the
 * remaining controls are listed as "not tested (time budget)" — the findings gathered so far are returned either way.
 * Every Playwright action carries its own timeout (under @playwright/test the default action timeout is none, and one
 * `scrollIntoViewIfNeeded` on an element that never becomes visible hung the whole site-wide test — Vertex, 2026-10).
 */
export async function interactionMotion(page, { reload, max = 30, perReload = 6, clickBudget = 20_000, deadline = Infinity } = {}) {
    const hard = [], soft = [];
    const notTested = [];
    await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => { });
    let reloading = false; // our own reloads pass; a click that would leave the page is stopped
    const blockNav = (route) => (!reloading && route.request().isNavigationRequest() && route.request().frame() === page.mainFrame() ? route.abort() : route.continue()).catch(() => { });
    const closePopup = (p) => p.close().catch(() => { });
    await page.route("**/*", blockNav);
    page.on("popup", closePopup);
    const CANCEL = Symbol("cancelled");
    /** Resolves with `p`, or with `fallback` after `ms` (the promise keeps running; its result is ignored). */
    const within = (p, ms, fallback) => { let t; return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((res) => { t = setTimeout(() => res(fallback), Math.max(0, ms)); })]).finally(() => clearTimeout(t)); };
    const timeLeft = () => deadline - Date.now();
    const overBudget = { reason: "", count: 0, examples: [] };
    const timedOut = [], failedOn = [];
    try {
        await within(page.evaluate(ixProbe), 10_000);
        const cands = await within(page.evaluate(() => window.__bsIx.candidates()), 15_000, null);
        if (!cands) {
            notTested.push({ reason: "time budget: listing the page's controls did not finish within 15 s", count: 1, examples: [] });
            return { hard, soft, notTested };
        }
        const { picks, skipped, lookalikes } = cands;
        const home = page.url();
        if (skipped.navigates.length)
            notTested.push({ reason: "link to another page (navigation is not an in-page change)", count: skipped.navigates.length, examples: skipped.navigates.slice(0, 3) });
        if (skipped.submits.length)
            notTested.push({ reason: "submits a form to the server", count: skipped.submits.length, examples: skipped.submits.slice(0, 3) });
        if (skipped.destructive.length)
            notTested.push({ reason: "destructive or paying action", count: skipped.destructive.length, examples: skipped.destructive.slice(0, 3) });
        if (lookalikes)
            notTested.push({ reason: "look-alike of a control that was clicked (same component, judged once)", count: lookalikes, examples: [] });
        if (picks.length > max)
            notTested.push({ reason: `over the per-page cap of ${max} clicks (babysitter.config.json → motion.maxClicks)`, count: picks.length - max, examples: picks.slice(max, max + 3).map((p) => p.where) });
        /** A fresh copy of the page; false when it did not come back within 30 s (or the deadline). */
        const fresh = async () => {
            reloading = true;
            const ok = await within((async () => {
                if (reload)
                    await reload();
                else
                    await page.goto(home, { waitUntil: "load", timeout: 30_000 });
                return true;
            })(), Math.min(30_000, Math.max(5_000, timeLeft())), false);
            reloading = false;
            await within(page.evaluate(ixProbe), 5_000);
            return ok && page.url().split("#")[0] === home.split("#")[0];
        };
        let since = 0;
        const gone = [];
        /** One control: click, judge, toggle back. Every await goes through `g`, so an abandoned click stops at its next step. */
        const one = async (pick, tok) => {
            const g = async (p) => { const v = await p; if (tok.dead) throw CANCEL; return v; };
            const found = await g(page.evaluate(({ sig, text, ord }) => window.__bsIx.find(sig, text, ord), pick).catch(() => false));
            const h = found ? await g(page.$("[data-bs-ix]").catch(() => null)) : null;
            let ok = h && (await g(h.evaluate((el) => window.__uiVisible(el)).catch(() => false)));
            if (h && !ok) {
                // after a reload, reveal-on-scroll content is still faded out until it is scrolled to
                await g(h.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { }));
                await g(page.waitForTimeout(300));
                await g(settle(page, 2000));
                ok = await g(h.evaluate((el) => window.__uiVisible(el)).catch(() => false));
            }
            if (!ok) {
                gone.push(pick.where);
                return;
            }
            since++;
            await g(h.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { }));
            await g(settle(page, 2000)); // a reveal set off by the scroll is not the click's motion
            await g(uncover(h));
            await g(h.hover({ timeout: 1500 }).catch(() => { }));
            await g(settle(page, 600));
            await g(h.evaluate((el) => window.__bsIx.arm(el)).catch(() => { }));
            await g(h.click({ timeout: 2000 }).catch(() => { }));
            await g(page.waitForFunction(() => window.__bsIx && window.__bsIx.run && window.__bsIx.run.done, null, { timeout: 4000 }).catch(() => { }));
            if (page.url().split("#")[0] !== home.split("#")[0]) {
                notTested.push({ reason: "navigated (client-side routing) when clicked", count: 1, examples: [pick.where] });
                since = perReload; // reload before the next one
                return;
            }
            await g(settle(page, 1200));
            const r = await g(page.evaluate(() => window.__bsIx.result()).catch(() => null));
            if (!r) {
                await g(recover(page));
                return;
            }
            const at = { sig: pick.sig, selector: pick.selector, human: pick.human };
            const name = (list) => list.slice(0, 2).map((x) => x.where).join(" + ");
            if (r.appeared.length && !r.appeared.some((x) => x.moved))
                hard.push({ kind: "open", what: `clicking it shows ${name(r.appeared)} in one frame — no opacity / transform / height / clip motion. Animate it in (fade + 4–8px slide or a height/grid-rows transition, 150–250 ms, motion-reduce:transition-none) [6.12, P59]`, where: pick.where, ...at });
            else if (!r.appeared.length && r.disappeared.length && !r.disappeared.some((x) => x.moved))
                hard.push({ kind: "close", what: `clicking it hides ${name(r.disappeared)} in one frame — no exit motion. Animate it out, mirroring the enter [6.12, P59]`, where: pick.where, ...at });
            if (r.snaps)
                soft.push({ kind: "state", what: `its own state change (${r.state.join(", ").replace(/TopColor/g, "Color")}) snaps in one frame — add transition-colors (150 ms) so the feedback reads as a response [6.12]`, where: pick.where, ...at });
            // toggle back: what it opened must leave with motion too
            if (r.appeared.length) {
                const positioned = r.appeared.some((x) => x.positioned);
                let back = null;
                if (positioned) {
                    await g(h.evaluate((el) => window.__bsIx.arm(el)).catch(() => { }));
                    await g(page.keyboard.press("Escape").catch(() => { }));
                    await g(page.waitForFunction(() => window.__bsIx.run.done, null, { timeout: 4000 }).catch(() => { }));
                    back = await g(page.evaluate(() => window.__bsIx.result()).catch(() => null));
                }
                const still = (res) => !res || !res.disappeared.length;
                if (still(back) && (pick.toggle || !positioned) && (await g(h.evaluate((el) => window.__uiVisible(el)).catch(() => false)))) {
                    await g(h.evaluate((el) => window.__bsIx.arm(el)).catch(() => { }));
                    await g(h.click({ timeout: 2000 }).catch(() => { }));
                    await g(page.waitForFunction(() => window.__bsIx.run.done, null, { timeout: 4000 }).catch(() => { }));
                    await g(settle(page, 1200));
                    back = page.url().split("#")[0] === home.split("#")[0] ? await g(page.evaluate(() => window.__bsIx.result()).catch(() => null)) : null;
                }
                if (back && back.disappeared.length && !back.appeared.length && !back.disappeared.some((x) => x.moved))
                    hard.push({ kind: "close", what: back.disappeared.some((x) => x.radixSelect)
                        ? `toggling it back closes a Radix Select list in one frame — its exit classes never play before @radix-ui/react-select 2.3: update it [6.12, P59]`
                        : `toggling it back hides ${name(back.disappeared)} in one frame — no exit motion. Animate it out, mirroring the enter [6.12, P59]`, where: pick.where, ...at });
            }
            await g(recover(page));
        };
        const todo = picks.slice(0, max);
        for (let i = 0; i < todo.length; i++) {
            const pick = todo[i];
            if (timeLeft() < 3_000) {
                overBudget.reason = "time budget: the page's time ran out before these were clicked (raise motion.pageBudget / the run's timeout)";
                overBudget.count = todo.length - i;
                overBudget.examples = todo.slice(i, i + 3).map((p) => p.where);
                break;
            }
            if (since >= perReload || page.url().split("#")[0] !== home.split("#")[0]) {
                since = 0;
                if (!(await fresh())) {
                    overBudget.reason = "the page did not reload within 30 s, so these were not clicked";
                    overBudget.count = todo.length - i;
                    overBudget.examples = todo.slice(i, i + 3).map((p) => p.where);
                    break;
                }
            }
            const tok = { dead: false };
            const done = await within(one(pick, tok).then(() => true, (e) => (e === CANCEL ? true : String((e && e.message) || e).split("\n")[0])), Math.min(clickBudget, timeLeft()), false);
            if (typeof done === "string") {
                failedOn.push(`${pick.where}: ${done}`);
                since = perReload;
            }
            else if (!done) {
                tok.dead = true; // the abandoned click stops at its next await
                timedOut.push(pick.where);
                since = perReload; // whatever it left half-done, start the next one on a fresh page
            }
        }
        if (gone.length)
            notTested.push({ reason: "not on the page after a reload (rendered differently, or gone for good after an earlier click — e.g. a remembered cookie choice)", count: gone.length, examples: gone.slice(0, 3) });
        if (timedOut.length)
            notTested.push({ reason: `time budget: the click took longer than ${Math.round(clickBudget / 1000)} s and was abandoned (babysitter.config.json → motion.clickBudget)`, count: timedOut.length, examples: timedOut.slice(0, 3) });
        if (failedOn.length)
            notTested.push({ reason: "the check failed on these controls", count: failedOn.length, examples: failedOn.slice(0, 3) });
        if (overBudget.count)
            notTested.push(overBudget);
    }
    finally {
        page.off("popup", closePopup);
        await within(page.unroute("**/*", blockNav), 5_000);
    }
    return { hard, soft, notTested };
}
/**
 * 4.8 — a page the browser translated survives its own controls. Chrome / Edge / Yandex "Translate this page"
 * swaps every text node React rendered for <font><font>…</font></font>; the next time React updates one of those
 * nodes (a button switching to "Pricing your task…") it calls insertBefore/removeChild on a node that is gone and the
 * whole page falls over with "Application error" until a reload (forge /request, cipher /request, 2026-10).
 *
 * The check translates the page the way Google Translate does, then presses its buttons — form submits too, since the
 * crash came from the submitting state. Every request other than GET is aborted for the duration, so nothing is sent
 * or created; empty fields get placeholder values so a submit is not blocked by validation. A crash is a page error
 * from the DOM mismatch, or Next's "Application error" screen.
 */
export async function translationSurvives(page, max = 10) {
    const out = [];
    const errors = [];
    const onErr = (e) => errors.push(String(e && e.message || e));
    page.on("pageerror", onErr);
    const block = (route) => (route.request().method() === "GET" ? route.fallback() : route.abort());
    await page.route("**/*", block);
    const translate = () => page.evaluate(() => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue || "").trim() && t.parentElement && !t.parentElement.closest("script, style, noscript, textarea, font[data-bs-tr]") ? 1 : 2 });
        const nodes = [];
        for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
        for (const t of nodes) {
            const outer = document.createElement("font"), inner = document.createElement("font");
            outer.setAttribute("data-bs-tr", ""); outer.style.verticalAlign = inner.style.verticalAlign = "inherit";
            inner.textContent = t.nodeValue; outer.appendChild(inner); t.parentNode.replaceChild(outer, t);
        }
        document.documentElement.classList.add("translated-ltr");
        return nodes.length;
    }).catch(() => 0);
    const CRASH = /insertBefore|removeChild|not a child of this node|NotFoundError/i;
    const crashed = async () => errors.some((e) => CRASH.test(e)) || /Application error: a client-side exception/i.test(await page.evaluate(() => document.body ? document.body.innerText.slice(0, 400) : "").catch(() => ""));
    try {
        const start = page.url();
        // the buttons, marked once: submits of forms with fields first (the state that crashed), then the rest
        const picks = await page.evaluate((max) => {
            const W = window;
            const list = Array.from(document.querySelectorAll('button, [role=button], input[type=submit]'))
                .filter((b) => W.__uiVisible(b) && !b.disabled && !b.closest("a[href], [data-bs-cookie]") && !/log ?out|sign ?out|delete|remove|выйти|удалить/i.test(b.textContent || ""));
            const submit = (b) => !!b.closest("form") && (b.type === "submit" || (b.tagName === "BUTTON" && !b.getAttribute("type")));
            list.sort((a, b) => Number(submit(b)) - Number(submit(a)));
            return list.slice(0, max).map((b, i) => { b.setAttribute("data-bs-tr-pick", String(i)); return { i, where: W.__uiDescribe(b), submit: submit(b) }; });
        }, max);
        for (const pick of picks) {
            await translate();
            const loc = page.locator(`[data-bs-tr-pick="${pick.i}"]`).first();
            if (!(await loc.isVisible().catch(() => false)))
                continue;
            if (pick.submit)
                await loc.evaluate((b) => {
                    for (const f of Array.from(b.form ? b.form.elements : [])) {
                        if (!(f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) || f.value || f.readOnly || f.disabled) continue;
                        const v = f.type === "email" ? "qa@example.com" : f.type === "number" ? (f.min || "1") : f.type === "tel" ? "2025550143" : f.type === "url" ? "https://example.com" : f.type === "password" ? "Example-pass-123" : /^(text|search|)$/.test(f.type) || f instanceof HTMLTextAreaElement ? "A short example request for a landing page and a logo, two weeks." : "";
                        if (!v) continue;
                        const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f), "value").set;
                        set.call(f, v); f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                }).catch(() => { });
            await loc.click({ timeout: 1500 }).catch(() => { });
            await page.waitForTimeout(500);
            if (await crashed()) {
                out.push({ what: `the page crashes when it is translated by the browser and "${pick.where.split('"')[1] || "this control"}" is pressed (${(errors.find((e) => CRASH.test(e)) || "Application error").slice(0, 90)}) — wrap swapped labels in <span>, mark the control translate="no", or install a removeChild/insertBefore guard before hydration [4.8, P60]`, where: pick.where });
                break;
            }
            if (page.url().split("#")[0] !== start.split("#")[0])
                break; // it navigated: the rest of the page is gone
            await page.keyboard.press("Escape").catch(() => { });
        }
    }
    finally {
        await page.unroute("**/*", block).catch(() => { });
        page.off("pageerror", onErr);
    }
    return out;
}
