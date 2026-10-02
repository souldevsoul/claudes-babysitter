// Screenshots for Before/After: the same viewport, pixel ratio, scroll position and site state (localStorage,
// cookies) as the reviewer's own window, so the two images line up with what they are looking at.
import { chromium } from "@playwright/test";

let browserP = null;
async function browser() {
  if (!browserP) browserP = chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  return browserP;
}
export async function closeCapture() { if (browserP) { const b = await browserP.catch(() => null); browserP = null; await b?.close().catch(() => {}); } }

/**
 * @param url      full URL on a dev server (the developer's own, or the base site)
 * @param view     { width, height, dpr, scrollY, storage: {k: v}, cookies: "a=1; b=2" }
 * @returns        PNG buffer of the viewport at that scroll position
 */
export async function capture(url, { width = 1280, height = 800, dpr = 1, scrollY = 0, storage = {}, cookies = "" } = {}) {
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: Math.round(width), height: Math.round(height) }, deviceScaleFactor: Math.min(Math.max(dpr || 1, 1), 3) });
  try {
    const origin = new URL(url).origin;
    // the reviewer's site state (cookie banner closed, chosen currency…), set before any script of the page runs
    await ctx.addInitScript((entries) => { try { for (const [k, v] of entries) localStorage.setItem(k, v); } catch {} }, Object.entries(storage || {}).filter(([k]) => !/^babysitter-studio/.test(k)));
    const jar = String(cookies || "").split(/;\s*/).map((c) => c.split("=")).filter(([n]) => n).map(([name, ...v]) => ({ name, value: v.join("="), url: origin }));
    if (jar.length) await ctx.addCookies(jar).catch(() => {});
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => page.goto(url, { waitUntil: "load", timeout: 60000 }));
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(1300); // reveal-on-scroll and late fonts settle at this position
    await page.evaluate((y) => window.scrollTo(0, y), scrollY); // layout may have shifted while loading
    await page.addStyleTag({ content: "*,*::before,*::after{animation-play-state:paused!important;caret-color:transparent!important}" }).catch(() => {});
    await page.waitForTimeout(150);
    return await page.screenshot({ type: "png" });
  } finally { await ctx.close().catch(() => {}); }
}
