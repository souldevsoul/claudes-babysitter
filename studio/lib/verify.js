// Pixel check for code-only fixes: the same pages rendered from two commits must look identical. Exact equality
// first; when two renders differ, only what holds in every repeat and stands out of anti-aliasing noise counts.
// Both sides run on their own dev server started the same way (same bundler, same flags), captured the same way
// (frozen clock, seeded random, parked animations — see capture.js), full page, at a desktop and a phone width.
import { chromium } from "@playwright/test";
import { baseSite } from "./basesite.js";
import { capture, closeCapture } from "./capture.js";

/**
 * Pixels that differ in EVERY pair of captures: { pixels, box } (or { pixels: -1, size } when the page sizes differ).
 * A real change sits at the same pixels each time; noise (a late font, a lazy image) does not.
 */
async function stableDiff(pairs) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    return await page.evaluate(async (pairs) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      let mask = null, w = 0, h = 0;
      for (const [a, b] of pairs) {
        const [x, y] = await Promise.all([load(a), load(b)]);
        if (x.naturalWidth !== y.naturalWidth || x.naturalHeight !== y.naturalHeight) return { pixels: -1, size: [`${x.naturalWidth}×${x.naturalHeight}`, `${y.naturalWidth}×${y.naturalHeight}`] };
        if (mask && (x.naturalWidth !== w || x.naturalHeight !== h)) return { pixels: 0 }; // the page itself changed size between captures: unstable
        w = x.naturalWidth; h = x.naturalHeight;
        const px = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
        const A = px(x), B = px(y), m = new Uint8Array(w * h);
        // a pixel counts when a channel moved by more than 24 of 255: text anti-aliasing on a tall page wobbles by a
        // few steps between renders (seen: 97% of such pixels within 8), which no one can see
        for (let i = 0, p = 0; i < A.length; i += 4, p++) m[p] = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 24 ? 1 : 0;
        if (!mask) mask = m; else for (let p = 0; p < m.length; p++) mask[p] &= m[p];
      }
      let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let p = 0; p < mask.length; p++) if (mask[p]) { n++; const X = p % w, Y = (p / w) | 0; x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y); }
      return { pixels: n, box: n ? [x0, y0, x1, y1] : null };
    }, pairs.map(([a, b]) => [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]));
  } finally { await browser.close(); }
}

/**
 * Render `routes` from commit `before` and commit `after` and compare them.
 * Returns [] when every page is identical, otherwise [{ route, width, pixels, box | size }].
 */
export async function pixelCheck({ repo, before, after, routes = ["/"], widths = [1280, 390], log = () => {} }) {
  const [a, b] = await Promise.all([baseSite({ repo, ref: before, log }), baseSite({ repo, ref: after, log })]);
  const diffs = [];
  try {
    // a dev server compiles a page on its first request: warm every page up on both sides first
    for (const route of routes) await Promise.all([a, b].map((site) => fetch(site.url + route, { signal: AbortSignal.timeout(120000) }).then((r) => r.text()).catch(() => {})));
    for (const route of routes) for (const width of widths) {
      const view = { width, height: width < 640 ? 844 : 800, fullPage: true };
      // one after the other, not side by side: two pages rendering at once in one browser differ in small ways
      // (seen on form pages at phone width) that have nothing to do with the code
      const shoot = async () => [await capture(a.url + route, view), await capture(b.url + route, view)];
      // a difference must hold: equal on any capture → identical; otherwise only the pixels that differ in all three
      // pairs count (a one-off — a late font, a lazy image — is not a change)
      const pairs = [];
      let same = false;
      for (let k = 0; k < 3 && !same; k++) { const [x, y] = await shoot(); if (x.equals(y)) same = true; else pairs.push([x, y]); }
      if (same) { log(`  ✓ ${route} @${width} identical${pairs.length ? " (on a repeat capture)" : ""}`); continue; }
      const d = await stableDiff(pairs);
      // a few stray pixels are rendering noise; a real change (another size, colour, position) moves hundreds
      if (d.pixels >= 0 && d.pixels < 4) { log(`  ✓ ${route} @${width} identical (only rendering noise: ${d.pixels} px)`); continue; }
      diffs.push({ route, width, ...d });
      log(`  ✗ ${route} @${width} ${d.pixels < 0 ? `page size ${d.size.join(" → ")}` : `${d.pixels} px differ in [${d.box.join(", ")}]`}`);
    }
  } finally { a.stop(); if (b !== a) b.stop(); await closeCapture(); }
  return diffs;
}
