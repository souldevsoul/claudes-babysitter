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
    // Both sides must show the same moment of everything that moves on its own — live counters, a "matrix
    // rain", a price ticker — or the difference map lights up motion instead of change. So time and chance
    // are the same for both: a fixed clock (Date, timers, requestAnimationFrame) paused at the same instant,
    // and a seeded Math.random.
    await ctx.addInitScript(() => {
      let s = 0x2f6b9a1d;
      Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    });
    const page = await ctx.newPage();
    const T0 = new Date("2026-01-01T12:00:00Z").getTime();
    await page.clock.install({ time: T0 });
    // paused BEFORE the page loads: every timer the page sets up (a blinking cursor toggled by setInterval,
    // a rotating headline) starts at the same virtual instant on both sides, however long hydration took in
    // real time — so advancing the clock by the same amount leaves both in the same phase
    await page.clock.pauseAt(T0 + 1000);
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(400);                 // real time for fonts and lazy images
    // the same virtual minute on both sides, jumped over (each due timer fires once) rather than stepped
    // through frame by frame: a page with endless animation loops (Lenis, GSAP) took 35 s to step through
    await page.clock.fastForward(60_000);
    await page.evaluate((y) => window.scrollTo(0, y), scrollY); // layout may have shifted while loading
    await page.waitForTimeout(150);
    await page.clock.runFor(1500);                  // reveal animations at this position finish (virtually)
    // both sides must be caught in the same frame of every animation, or the difference map lights up motion
    // instead of change: endless ones (a ticker, a blinking cursor) are parked at t = 0, finite ones (fade-ins,
    // transitions) jump to their end state — rewinding those would hide what they reveal
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try { if (a.effect && a.effect.getComputedTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } catch {}
      }
    }).catch(() => {});
    await page.addStyleTag({ content: "*,*::before,*::after{animation-play-state:paused!important;caret-color:transparent!important}" }).catch(() => {});
    await page.waitForTimeout(150);
    return await page.screenshot({ type: "png" });
  } finally { await ctx.close().catch(() => {}); }
}
