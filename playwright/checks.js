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
  const txt = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
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
window.__uiContrast = (el) => {
  const layers = []; let overImage = false; let opacity = 1;
  for (let e = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    opacity *= Number(cs.opacity);
    const bg = window.__uiRGBA(cs.backgroundColor);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') overImage = true;
    if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; }
  }
  let base = [255, 255, 255, 1];
  for (let i = layers.length - 1; i >= 0; i--) base = __mix(layers[i], base);
  const fg = window.__uiRGBA(getComputedStyle(el).color);
  const text = __mix([fg[0], fg[1], fg[2], fg[3] * opacity], base);
  const L1 = __lum(text), L2 = __lum(base);
  return { ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), overImage, opacity };
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
        if (out.length > 15)
            break;
    }
    return out;
});
/** 1.1 — no native select / date / file / checkbox / radio rendered. */
export const nativeControls = (page) => page.evaluate(() => Array.from(document.querySelectorAll('select, input[type=date], input[type=datetime-local], input[type=month], input[type=time], input[type=file], input[type=checkbox], input[type=radio]'))
    .filter((el) => window.__uiVisible(el))
    .map((el) => ({ what: `native <${el.tagName.toLowerCase()}${el.type ? ` type=${el.type}` : ""}>`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) })));
/** 6.4 — text ≥12px, weight ≥400, not translucent. */
export const illegibleText = (page, allowLightWeights = false) => page.evaluate((allowLightWeights) => {
    const out = [];
    const eye = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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
        if (opacity < 0.95)
            bad.push(`opacity ${opacity.toFixed(2)} on text`);
        if (ratio < (large ? 3 : 4.5)) {
            if (clipText || overImage)
                eye.push({ what: `contrast ${clipText ? "of gradient-filled text" : "over image/gradient"} cannot be measured (${ratio.toFixed(2)}:1 vs solid) — check by eye`, where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
            else
                bad.push(`contrast ${ratio.toFixed(2)}:1`);
        }
        if (bad.length)
            out.push({ what: bad.join(", "), where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) });
        if (out.length > 40)
            break;
    }
    return { hard: out, eye: eye.slice(0, 20) };
}, allowLightWeights);
/** 1.12 — no emoji in visible text. */
export const emoji = (page) => page.evaluate(() => {
    const re = /\p{Extended_Pictographic}/u;
    const ok = new Set(["©", "®", "™"]);
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent || "";
        const ch = [...t].find((c) => re.test(c) && !ok.has(c));
        if (ch && n.parentElement && window.__uiVisible(n.parentElement))
            out.push({ what: `emoji ${ch}`, where: window.__uiDescribe(n.parentElement), selector: window.__uiSelector(n.parentElement), human: window.__uiHuman(n.parentElement) });
    }
    return out.slice(0, 20);
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
    const links = Array.from(document.querySelectorAll("header a[href], nav a[href]")).filter((a) => window.__uiVisible(a) && !isLogo(a));
    const match = links.filter((a) => { try {
        const u = new URL(a.href);
        return u.origin === location.origin && ((u.pathname.replace(/\/$/, "") || "/") === path) && !u.hash;
    }
    catch {
        return false;
    } });
    if (!match.length)
        return { applicable: false, ok: true, where: "" };
    return { applicable: true, ok: match.some((a) => a.getAttribute("aria-current") === "page"), where: match.map((a) => window.__uiDescribe(a)).join(" | ") };
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
        .filter((el) => window.__uiVisible(el) && el.children.length === 0 && (el.textContent || "").trim().length > 1)
        .slice(0, 400);
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
        if (out.length > 10)
            break;
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
    .slice(0, 10)
    .map((el) => ({ what: "underlined text that is not a link", where: window.__uiDescribe(el), selector: window.__uiSelector(el), human: window.__uiHuman(el) })));
/** 2.13 — cumulative layout shift. */
export const cls = (page) => page.evaluate(() => window.__cls);
/** Focus indicator visible when tabbing (1.9): focused styles must differ from the unfocused ones. */
export async function focusVisible(page, presses = 8) {
    const out = [];
    await page.mouse.click(1, 1).catch(() => { });
    for (let i = 0; i < presses; i++) {
        await page.keyboard.press("Tab");
        const r = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body || !window.__uiVisible(el))
                return null;
            const snap = () => {
                const pick = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.color, cs.borderColor, cs.textDecorationLine, cs.transform].join("|");
                return pick(getComputedStyle(el)) + pick(getComputedStyle(el, "::after")) + pick(getComputedStyle(el, "::before"));
            };
            const focused = snap();
            el.blur();
            const plain = snap();
            el.focus({ preventScroll: true });
            return focused === plain ? window.__uiDescribe(el) : null;
        });
        if (r && !out.some((o) => o.where === r))
            out.push({ what: "focused element looks identical to unfocused", where: r });
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
    for (const c of containers) {
        const kids = Array.from(c.children).filter((k) => W.__uiVisible(k) && k.getBoundingClientRect().width >= 140 && k.getBoundingClientRect().height >= 60);
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
            // peers must share one look: radius + padding always; fill/border/shadow may differ on ONE card (featured)
            if (cardish) {
                const st = row.map((k) => {
                    const cs = getComputedStyle(k);
                    return {
                        shape: `radius ${cs.borderTopLeftRadius} / padding ${cs.paddingTop} ${cs.paddingLeft}`,
                        skin: `bg ${W.__uiRGBA(cs.backgroundColor).map((x) => Math.round(x * 100) / 100).join(",")} / border ${cs.borderTopWidth} ${cs.borderTopColor} / shadow ${cs.boxShadow === "none" ? "none" : "yes"}`,
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
                    out.push({ what: "double border between stacked rows [1.7, P55]", where, ...at });
                    seen.add(where);
                }
                break;
            }
        }
        if (out.length > 20)
            break;
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
        if (out.length > 10)
            break;
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
        .slice(0, 10)
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
        .map((el) => {
        const cs = getComputedStyle(el);
        const bg = surface(el);
        const fill = mix(W.__uiRGBA(cs.backgroundColor), bg);
        const bw = parseFloat(cs.borderBottomWidth);
        const border = mix(W.__uiRGBA(cs.borderBottomColor), fill);
        const borderOk = bw > 0 && ratio(border, bg) >= 3;
        const fillOk = ratio(fill, bg) >= 1.25;
        if (borderOk || fillOk) return null;
        // the lightest edge that passes: the same colour moved toward the text side only as far as 3:1 needs —
        // a much darker edge passes too, but reads harsh (the fix should not overshoot)
        const target = lum(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
        const start = bw > 0 ? border : fill;
        let lo = 0, hi = 1;
        for (let k = 0; k < 24; k++) { const t = (lo + hi) / 2; const c = start.map((v, i) => v + (target[i] - v) * t); if (ratio(c, bg) >= 3.05) hi = t; else lo = t; }
        const hex = "#" + start.map((v, i) => Math.round(v + (target[i] - v) * hi).toString(16).padStart(2, "0")).join("");
        return { what: `input barely visible at rest (border ${bw ? ratio(border, bg).toFixed(2) + ":1" : "none"}, fill ${ratio(fill, bg).toFixed(2)}:1; lightest passing edge ${hex}) [1.9, P09]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) };
    })
        .filter(Boolean)
        .slice(0, 10);
});
/** 1.4 — hovering a button keeps its label readable (P06). */
export async function hoverContrast(page, max = 12) {
    const out = [];
    const handles = await page.$$("button, a[role=button], [class*=btn], [data-slot=button]");
    let n = 0;
    for (const h of handles) {
        if (n >= max)
            break;
        const ok = await h.evaluate((el) => el.getRootNode() === document && window.__uiVisible(el) && (el.textContent || "").trim().length > 0 && el.getBoundingClientRect().top < innerHeight * 3).catch(() => false);
        if (!ok)
            continue;
        n++;
        await h.scrollIntoViewIfNeeded().catch(() => { });
        await h.hover({ timeout: 1500 }).catch(() => { });
        await page.waitForTimeout(250); // let colour transitions finish
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
            return c.ratio < 3 ? { what: `label contrast on hover ${c.ratio.toFixed(2)}:1 [1.4, P06]`, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) } : null;
        }).catch(() => null);
        if (r)
            out.push(r);
    }
    await page.mouse.move(0, 0);
    return out;
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
        if (page.url() !== url) {
            await page.goBack().catch(() => { });
            continue;
        }
        const after = await headerRect(page);
        if (before && after && before !== after)
            out.push({ what: `opening it moves the header (${before} → ${after}) [5.3/5.4, P22]`, where: info.where });
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
                    const entry = { moved, where: W.__uiDescribe(l), selector: W.__uiSelector(l), human: W.__uiHuman(l) };
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
            out.push({ what: `closes without motion — it vanishes in one frame (give it an exit animation that mirrors the enter one) [6.12, P59]`, where: `${layer.where} (trigger: ${info.where})`, selector: info.selector, human: info.human, layer: layer.selector });
        if (!gone.length)
            await page.mouse.click(2, 2).catch(() => { });
        await page.waitForTimeout(150);
    }
    return out;
}
/** 4.6 — cookie settings replace the banner (never two "Accept" buttons), the panel fits and scrolls (P19 P18). */
export async function cookieFlow(page) {
    const out = [];
    const manage = page.locator('[class*=cookie i] button, [id*=cookie i] button, [class*=consent i] button, [id*=consent i] button, [class*=cookie i] a, [class*=consent i] a')
        .filter({ hasText: /manage|settings|preferences|customi[sz]e|options|настро|параметр/i }).first();
    if (!(await manage.isVisible().catch(() => false)))
        return out;
    await manage.click().catch(() => { });
    await page.waitForTimeout(400);
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
    for (const el of Array.from(document.querySelectorAll("button, a, [role=button]"))) {
        if (!W.__uiVisible(el) || !(el.textContent || "").trim())
            continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const bg = W.__uiRGBA(cs.backgroundColor);
        const filled = bg[3] > 0.5 && bg.join() !== parentBg(el);
        const outlined = parseFloat(cs.borderTopWidth) > 0 && W.__uiRGBA(cs.borderTopColor)[3] > 0.2;
        // only things that look like buttons: filled or outlined, padded, button-sized
        if (!(filled || outlined) || r.height < 28 || r.height > 72 || parseFloat(cs.paddingLeft) < 8)
            continue;
        if (el.closest("nav") && !filled)
            continue;
        const variant = filled ? `filled ${W.__uiRGBA(cs.backgroundColor).slice(0, 3).map((x) => Math.round(x / 8)).join(",")}` : "outlined";
        sigs.push({ kind: "button", filled, variant, radius: Math.min(Math.round(parseFloat(cs.borderTopLeftRadius)), 999), height: Math.round(r.height), font: font(cs), size: Math.round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight), route, where: W.__uiDescribe(el), selector: W.__uiSelector(el), human: W.__uiHuman(el) });
    }
    for (const el of Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, [role=combobox]'))) {
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
        const border = parseFloat(cs.borderTopWidth) > 0 && W.__uiRGBA(cs.borderTopColor)[3] > 0.05;
        const shadow = cs.boxShadow !== "none";
        if (!(border || shadow) || parseFloat(cs.paddingTop) < 12)
            continue;
        const skin = `r${Math.round(parseFloat(cs.borderTopLeftRadius))} bg(${W.__uiRGBA(cs.backgroundColor).map((x) => Math.round(x * 20) / 20).join(",")}) b${cs.borderTopWidth} ${shadow ? "shadow" : "flat"} p${cs.paddingTop}`;
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
        if (out.length > 30)
            break;
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
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(700); // reveal transitions finish
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
        if (offenders.length >= 20)
            break;
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
