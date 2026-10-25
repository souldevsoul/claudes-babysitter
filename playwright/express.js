// Express run mode (`babysitter e2e --express`): one page load serves every check of a route.
//
// The normal run opens the page again for every check (a fresh browser context per Playwright test). In express mode a
// spec's per-route describe (describeRoute) becomes ONE Playwright test per route × project that runs every check of the
// describe in turn against one loaded page, and records each check's verdict exactly as its own test would have:
// title, describe path, project, status, error messages, annotations (skip reasons, "not tested", "check by eye" …).
// lib/express-results.js turns that record back into one result per check, so the run summary, findings.json,
// fix-plan, --last-failed and the Stop hook see the same findings as in a normal run.
//
// What keeps the checks from affecting each other:
//   • the page a check gets is the one its own open() would have produced: the spec's open function is wrapped
//     (opener) and served from the shared page only when that page is still pristine — same route, same open function
//     and arguments, nothing done to it since;
//   • a check that acts on the page — click, hover, keyboard, typing, focus, navigation, viewport, cookies, init
//     scripts, routes … (every Page / Locator / ElementHandle / Mouse / Keyboard / BrowserContext call that is not a
//     plain read) — marks the page dirty; so does any difference after the check in a fingerprint of the page (DOM and
//     attributes, form values, scroll positions, focus, selection, storage, cookies, stylesheets, running transitions,
//     images, fonts). The next check then gets a fresh context and a fresh load, exactly as in its own test;
//   • the attributes the checks stamp on elements to find them again (data-bs-*, data-bsf*, data-ui-*) are put back
//     as they were after every check; listeners a check added are removed; contexts it opened are closed;
//   • read-only checks run first, the ones known (or learned in the last run) to act on the page last;
//   • a check that touches the page before opening it (it needs a fresh page of its own) is run again on its own
//     fresh page and says so in its annotations — never skipped.
// The result cache (lib/express-cache.js) reuses a pass or a skip only when the render hash of the pristine page and
// every input of the check are unchanged; failures are never reused.
import { test as base, expect as baseExpect } from "@playwright/test";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";
import { isSelected } from "../lib/route-selection.js";
import * as X from "../lib/express-cache.js";
import { STATE_DIR, ROOT } from "./project.js";

export const EXPRESS = process.env.BABYSITTER_EXPRESS === "1";
import { CONTAINER_TITLE } from "../lib/express-title.js";
export { CONTAINER_TITLE };
const CACHE = EXPRESS && process.env.BABYSITTER_EXPRESS_CACHE !== "0";
const DEBUG = !!process.env.BABYSITTER_EXPRESS_DEBUG;
const SELF = fileURLToPath(import.meta.url);

/* ───────── ordering: read-only checks first, the ones that act on the page last ───────── */
// A hint only (the dirty tracking above decides when the page is reloaded); the last run's observations
// (.babysitter/express-profile.json) override it.
const FIRST = [/^2\.13 CLS/, /^3\.8 page loads scrolled to top/, /^modal open on arrival/];
const ACTS = [
  /^1\.4 button label stays readable on hover/, /^1\.18 tick boxes/, /^1\.2\/5\.2 /, /^6\.12 /, /^3\.5 the open mobile menu/, /^1\.9 keyboard focus/,
  /^6\.9 a focused field/, /^4\.6 cookie settings/, /^4\.8 /, /^6\.10 /, /^H1 /, /^H2 /, /^2\.5 no word broken/, /^1\.6 /, /^1\.2 dropdowns/, /^money:/,
  /^3\.6 /, /^2\.10 one menu/, /^FM\d/, /^states/, /^3\.8 in-app/, /^4\.5\/J1\/D4/, /^J2 /, /^i18n /, /^CT11/, /^M2 /, /^3\.5 the current nav item/,
];
// never cached: sampled over time (motion, layout shift), or measured against something outside the page (DNS, other
// pages, sign-in) — besides what a run sees at runtime (network during the check, another page, another context)
const UNCACHEABLE = [/^6\.12 /, /^2\.13 CLS/, /^CT9\/CT10/, /^states/, /^3\.8 in-app/, /^4\.5\/J1\/D4/, /^J2 /];

let PROFILE;
const profile = () => {
  if (PROFILE !== undefined) return PROFILE;
  try { PROFILE = JSON.parse(readFileSync(resolve(STATE_DIR, "express-profile.json"), "utf8")).rules || {}; } catch { PROFILE = {}; }
  return PROFILE;
};
const ruleKey = (file, title) => `${file}|${title}`;
function phaseOf(file, rule) {
  const p = profile()[ruleKey(file, rule.title)];
  if (p?.own) return 3;
  if (p && typeof p.dirty === "number") return p.dirty >= 0.5 ? 2 : 1;
  if (FIRST.some((r) => r.test(rule.title))) return 0;
  return ACTS.some((r) => r.test(rule.title)) ? 2 : 1;
}

/* ───────── the shims the specs import (normal mode: Playwright's own test / expect) ───────── */
const als = new AsyncLocalStorage();
const cur = () => { const c = als.getStore(); return c && !c.finalized ? c : null; };
let collecting = null; // { node } while a describeRoute body runs
class SkipSignal { constructor(description) { this.description = description; } }
class CachedSignal { constructor(entry) { this.entry = entry; } }

const callerFile = () => {
  for (const line of String(new Error().stack).split("\n").slice(2)) {
    const m = line.match(/\(?((?:file:\/\/)?\/[^():]+\.[cm]?[jt]s):\d+:\d+\)?$/);
    if (!m) continue;
    const f = m[1].startsWith("file://") ? fileURLToPath(m[1]) : m[1];
    if (f !== SELF && !/node_modules/.test(f)) return f;
  }
  return "";
};

function node(parent, title) { return { parent, title, uses: [], hooks: [], after: [], skips: [] }; }
const chain = (n) => { const out = []; for (let x = n; x; x = x.parent) out.unshift(x); return out; };

function shimTest(title, a, b) {
  if (collecting) {
    const details = typeof a === "object" && a ? a : null;
    collecting.rules.push({ title, fn: typeof a === "function" ? a : b, details, node: collecting.node, titles: [...chain(collecting.node).slice(1).map((n) => n.title), title], index: collecting.rules.length });
    return;
  }
  return base(title, a, b);
}
const describe = (title, a, b) => {
  if (!collecting) return base.describe(title, a, b);
  const fn = typeof a === "function" ? a : b;
  const prev = collecting.node;
  collecting.node = node(prev, title);
  try { fn(); } finally { collecting.node = prev; }
};
describe.configure = (...a) => (collecting ? undefined : base.describe.configure(...a));
describe.skip = (title, a, b) => {
  if (!collecting) return base.describe.skip(title, a, b);
  const fn = typeof a === "function" ? a : b;
  const prev = collecting.node;
  collecting.node = node(prev, title);
  collecting.node.skips.push({ cond: true, description: undefined });
  try { fn(); } finally { collecting.node = prev; }
};
for (const k of ["serial", "parallel", "only", "fixme"]) describe[k] = (...a) => (collecting ? describe(...a) : base.describe[k](...a));
shimTest.describe = describe;
shimTest.skip = (...args) => {
  const c = cur();
  if (c) {
    if (!args.length || (typeof args[0] !== "function" && args[0])) throw new SkipSignal(args.length > 1 ? args[1] : undefined);
    return;
  }
  if (collecting) {
    if (typeof args[0] === "string" && typeof args[1] === "function") { shimTest(args[0], () => { throw new SkipSignal(undefined); }); return; }
    collecting.node.skips.push({ cond: args.length ? args[0] : true, description: args[1] });
    return;
  }
  return base.skip(...args);
};
shimTest.fixme = (...args) => (cur() || collecting ? shimTest.skip(...args) : base.fixme(...args));
shimTest.slow = (...args) => { const c = cur(); if (c) { if (!args.length || args[0]) c.info.setTimeout(c.rec.timeout * 3); return; } return base.slow(...args); };
shimTest.info = () => cur()?.info ?? base.info();
shimTest.setTimeout = (ms) => { const c = cur(); if (c) return c.info.setTimeout(ms); return base.setTimeout(ms); };
shimTest.use = (o) => (collecting ? void collecting.node.uses.push(o) : base.use(o));
shimTest.beforeEach = (fn) => (collecting ? void collecting.node.hooks.push(fn) : base.beforeEach(fn));
shimTest.afterEach = (fn) => (collecting ? void collecting.node.after.push(fn) : base.afterEach(fn));
shimTest.beforeAll = (...a) => { if (collecting) throw new Error("express: beforeAll inside a per-route describe is not supported"); return base.beforeAll(...a); };
shimTest.afterAll = (...a) => { if (collecting) throw new Error("express: afterAll inside a per-route describe is not supported"); return base.afterAll(...a); };
shimTest.step = (...a) => base.step(...a);
shimTest.extend = (...a) => base.extend(...a);

// expect.soft inside a check records the failure on that check (Playwright's would record it on the page's test)
const softMatchers = (m, c) => new Proxy(m, {
  get(t, p) {
    const v = t[p];
    if (p === "not" || p === "resolves" || p === "rejects") return softMatchers(v, c);
    if (typeof v !== "function") return v;
    return (...args) => {
      try {
        const r = v.apply(t, args);
        if (r && typeof r.then === "function") return r.catch((e) => { c.rec.softErrors.push(e); });
        return r;
      } catch (e) { c.rec.softErrors.push(e); }
    };
  },
});
const shimExpect = new Proxy(baseExpect, {
  get(t, p) {
    if (p === "soft") return (actual, msg) => { const c = cur(); return c ? softMatchers(baseExpect(actual, msg), c) : baseExpect.soft(actual, msg); };
    return t[p];
  },
});

// Live bindings: outside the express page code the specs get Playwright's own test / expect (their tests keep their
// own file and line); while a per-route describe is collected, and while a page test runs its checks, the shims.
export let test = base;
export let expect = baseExpect;
const withShims = (fn) => { test = shimTest; expect = shimExpect; try { return fn(); } finally { test = base; expect = baseExpect; } };
const withShimsAsync = async (fn) => { test = shimTest; expect = shimExpect; try { return await fn(); } finally { test = base; expect = baseExpect; } };

/**
 * The describe of one route's checks. Normal mode: test.describe (after the --changed route selection). Express: the
 * checks are collected and run by one test per project against one loaded page.
 */
export function describeRoute(route, title, fn) {
  if (!isSelected(route)) return;
  if (!EXPRESS) return base.describe(title, fn);
  if (collecting) throw new Error("express: describeRoute inside describeRoute");
  const group = { route, title, rules: [], node: node(null, title), file: callerFile() };
  collecting = group;
  try { withShims(fn); } finally { collecting = null; }
  if (!group.rules.length) return;
  base.describe(title, () => {
    const uses = Object.assign({}, ...group.node.uses);
    if (Object.keys(uses).length) base.use(uses);
    // the context options a check's own `page` would have had (config, project, file-level and describe-level use)
    base(CONTAINER_TITLE, async ({ browser, request, acceptDownloads, bypassCSP, colorScheme, deviceScaleFactor, extraHTTPHeaders, geolocation, hasTouch, httpCredentials, ignoreHTTPSErrors, isMobile, javaScriptEnabled, locale, offline, permissions, proxy, storageState, timezoneId, userAgent, viewport, baseURL, serviceWorkers, contextOptions }, info) => {
      const opts = { ...(contextOptions || {}) };
      for (const [k, v] of Object.entries({ acceptDownloads, bypassCSP, colorScheme, deviceScaleFactor, extraHTTPHeaders, geolocation, hasTouch, httpCredentials, ignoreHTTPSErrors, isMobile, javaScriptEnabled, locale, offline, permissions, proxy, storageState, timezoneId, userAgent, viewport, baseURL, serviceWorkers })) if (v !== undefined) opts[k] = v;
      return withShimsAsync(() => runContainer(group, { browser, request, opts }, info));
    });
  });
}

/** Wraps a spec's open(page, …): in express mode served from the shared page while it is pristine. */
export const opener = (key, fn) => (EXPRESS ? pageOpener(key, fn) : fn);
/** Wraps an open function that makes its own context (run.spec openIn(browser, …) → { ctx, page, … }). */
export const contextOpener = (key, fn) => (EXPRESS ? ctxOpener(key, fn) : fn);

/* ───────── the page proxies: every call that is not a read marks the shared page dirty ───────── */
const READ = {
  page: ["evaluate", "evaluateHandle", "$", "$$", "$eval", "$$eval", "locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByAltText", "getByTitle", "getByTestId", "frameLocator", "url", "title", "content", "viewportSize", "waitForTimeout", "waitForLoadState", "waitForFunction", "waitForSelector", "waitForEvent", "waitForResponse", "waitForRequest", "waitForURL", "screenshot", "isClosed", "mainFrame", "frames", "frame", "context", "isVisible", "isHidden", "isEnabled", "isDisabled", "isEditable", "isChecked", "textContent", "innerText", "innerHTML", "getAttribute", "inputValue", "workers", "video", "opener", "consoleMessages", "pageErrors", "requests", "toString"],
  frame: ["evaluate", "evaluateHandle", "$", "$$", "$eval", "$$eval", "locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByAltText", "getByTitle", "getByTestId", "frameLocator", "url", "title", "content", "waitForTimeout", "waitForLoadState", "waitForFunction", "waitForSelector", "waitForURL", "isDetached", "name", "childFrames", "parentFrame", "page", "frameElement", "isVisible", "isHidden", "isEnabled", "isDisabled", "isEditable", "isChecked", "textContent", "innerText", "innerHTML", "getAttribute", "inputValue", "toString"],
  locator: ["count", "all", "allInnerTexts", "allTextContents", "boundingBox", "first", "last", "nth", "filter", "locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByAltText", "getByTitle", "getByTestId", "and", "or", "isVisible", "isHidden", "isEnabled", "isDisabled", "isEditable", "isChecked", "textContent", "innerText", "innerHTML", "getAttribute", "inputValue", "evaluate", "evaluateAll", "evaluateHandle", "elementHandle", "elementHandles", "waitFor", "screenshot", "page", "contentFrame", "frameLocator", "ariaSnapshot", "owner", "describe", "toString"],
  handle: ["boundingBox", "getAttribute", "innerText", "textContent", "innerHTML", "inputValue", "isVisible", "isHidden", "isEnabled", "isDisabled", "isEditable", "isChecked", "evaluate", "evaluateHandle", "$", "$$", "$eval", "$$eval", "contentFrame", "ownerFrame", "asElement", "dispose", "jsonValue", "getProperty", "getProperties", "screenshot", "waitForElementState", "waitForSelector", "toString"],
  context: ["cookies", "pages", "browser", "storageState", "serviceWorkers", "backgroundPages", "waitForEvent", "toString"],
  input: [],
};
for (const k of Object.keys(READ)) READ[k] = new Set(READ[k]);
const LISTEN = new Set(["on", "once", "addListener", "prependListener"]);
const UNLISTEN = new Set(["off", "removeListener", "removeAllListeners"]);
const TARGET = new WeakMap(); // proxy → real object

const kindOf = (x) => {
  if (!x || typeof x !== "object") return null;
  if (typeof x.mainFrame === "function" && typeof x.goto === "function") return "page";
  if (typeof x.newPage === "function" && typeof x.cookies === "function") return "context";
  if (typeof x.childFrames === "function") return "frame";
  if (typeof x.first === "function" && typeof x.nth === "function" && typeof x.filter === "function") return "locator";
  if (typeof x.first === "function" && typeof x.owner === "function") return "locator"; // FrameLocator
  if (typeof x.asElement === "function" && typeof x.jsonValue === "function") return "handle";
  return null;
};

class Shared {
  constructor(browser, info, group, opts) {
    this.opts = opts;
    this.browser = browser;
    this.info = info;
    this.group = group;
    this.slot = null; // { ctx, page, kind: "blank"|"page"|"context", sig, ret, dirty, fp, renderHash, bodies }
    this.loads = 0;
    this.resets = [];
    this.pagePx = this.dynamicProxy(() => this.slot?.page, "page");
    this.ctxPx = this.dynamicProxy(() => this.slot?.ctx, "context");
    this.browserPx = this.browserProxy();
    this.wrapped = new WeakMap();
  }
  options(rule) {
    // nested test.use inside the describe (none in the tool's specs) goes over the page test's own options
    const nested = chain(rule?.node || this.group.node).slice(1).flatMap((n) => n.uses);
    return Object.assign({}, this.opts, ...nested);
  }
  async newSlot(kind, rule) {
    await this.closeSlot();
    const ctx = await this.browser.newContext(this.options(rule));
    const slot = { ctx, page: null, kind, sig: null, dirty: false, bodies: [], collecting: true, opts: JSON.stringify(this.options(rule)) };
    this.watch(slot);
    slot.page = await ctx.newPage();
    this.slot = slot;
    return slot;
  }
  watch(slot) {
    slot.ctx.on("request", (req) => {
      const c = cur();
      if (!c || c.inOpener || this.slot !== slot) return;
      const h = req.headers();
      if (h["next-router-prefetch"] || /prefetch/i.test(h["purpose"] || "") || /prefetch/i.test(h["sec-purpose"] || "")) return;
      c.flags.network = (c.flags.network || 0) + 1;
    });
    slot.ctx.on("page", () => { const c = cur(); if (c && !c.inOpener) c.flags.newPage = true; });
    if (CACHE && !slot.bodiesWatched) watchBodies(slot.ctx, slot);
  }
  async closeSlot() {
    const s = this.slot;
    this.slot = null;
    if (s) await Promise.race([s.ctx.close().catch(() => { }), new Promise((r) => setTimeout(r, 10_000))]);
  }
  /** a fresh context with an untouched about:blank page — what a check gets as its `page` fixture in a normal run */
  async fresh(rule, why) {
    if (this.slot && this.slot.kind === "blank" && !this.slot.dirty && this.slot.opts === JSON.stringify(this.options(rule))) return this.slot;
    if (why) this.resets.push(why);
    return this.newSlot("blank", rule);
  }
  markDirty(why) { if (this.slot && !this.slot.dirty) { this.slot.dirty = why || true; } }
  isPage(p) { return p === this.pagePx; }
  isBrowser(b) { return b === this.browserPx; }

  dynamicProxy(get, kind) {
    const self = this;
    const px = new Proxy({}, {
      get(_, p) {
        const real = get();
        if (!real) return undefined;
        const c = cur();
        if (kind === "page" && c && !c.opened && !c.own && !c.inOpener) {
          // the check touches the page before opening it: it needs a fresh page of its own (run again, see runRule)
          c.retry = c.retry || `page.${String(p)} before open`;
          self.markDirty("touched before open");
        }
        return self.member(real, kind, p, c);
      },
      set(_, p, v) { const real = get(); if (real) real[p] = v; return true; },
      has(_, p) { const real = get(); return !!real && p in real; },
      getPrototypeOf() { const real = get(); return real ? Object.getPrototypeOf(real) : Object.prototype; },
    });
    // Playwright gets the real object as an argument, never a proxy
    this.realOf = this.realOf || new Map();
    this.realOf.set(px, get);
    return px;
  }
  unwrapArg(a, depth = 0) {
    if (!a || (typeof a !== "object" && typeof a !== "function")) return a;
    if (this.realOf?.has(a)) return this.realOf.get(a)();
    if (TARGET.has(a)) return TARGET.get(a);
    if (depth < 2 && Array.isArray(a)) return a.map((x) => this.unwrapArg(x, depth + 1));
    if (depth < 2 && Object.getPrototypeOf(a) === Object.prototype) return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, this.unwrapArg(v, depth + 1)]));
    return a;
  }
  member(real, kind, p, c) {
    const v = real[p];
    if (kind === "page" && (p === "keyboard" || p === "mouse" || p === "touchscreen" || p === "clock")) return this.wrap(v, "input");
    if (kind === "page" && p === "request") { if (c) c.flags.request = true; return v; }
    if (kind === "context" && p === "request") { if (c) c.flags.request = true; return v; }
    if (typeof v !== "function") return v;
    const self = this;
    // a method call on the real object (not fn.apply): Playwright names its errors after the frame that called it
    if (LISTEN.has(p)) return (evt, fn) => { if (c) c.listeners.push([real, evt, fn]); return real[p](evt, fn); };
    if (UNLISTEN.has(p)) return (...a) => real[p](...a);
    if (kind === "page" && p === "context") return () => self.ctxPx;
    if ((kind === "locator" || kind === "frame") && p === "page") return () => self.pagePx;
    // run.spec closes the context its open function made: the shared one stays for the next check
    if (kind === "context" && p === "close") return async () => { if (self.slot?.kind !== "context") self.markDirty("context closed"); };
    if (kind === "page" && p === "close") return async () => { self.markDirty("page closed"); };
    const read = READ[kind]?.has(p);
    return (...args) => {
      if (!read && !(c && c.inOpener)) { self.markDirty(`${kind}.${String(p)}`); if (c) c.flags.acted = `${kind}.${String(p)}`; }
      const out = real[p](...args.map((a) => self.unwrapArg(a)));
      return self.wrapOut(out);
    };
  }
  wrapOut(out) {
    if (out && typeof out.then === "function") return out.then((x) => this.wrapOut(x));
    if (Array.isArray(out)) return out.map((x) => this.wrapOut(x));
    const k = kindOf(out);
    if (!k) return out;
    if (k === "page") return out === this.slot?.page ? this.pagePx : this.wrap(out, "page");
    if (k === "context") return out === this.slot?.ctx ? this.ctxPx : this.wrap(out, "context");
    return this.wrap(out, k);
  }
  wrap(obj, kind) {
    if (!obj || typeof obj !== "object") return obj;
    if (this.wrapped.has(obj)) return this.wrapped.get(obj);
    const self = this;
    const px = new Proxy(obj, { get(t, p) { return self.member(t, kind, p, cur()); } });
    TARGET.set(px, obj);
    this.wrapped.set(obj, px);
    return px;
  }
  browserProxy() {
    const self = this;
    const px = new Proxy(this.browser, {
      get(t, p) {
        const v = t[p];
        if (typeof v !== "function") return v;
        if (p === "newContext" || p === "newPage") return async (...a) => {
          const c = cur();
          const out = await t[p](...a);
          if (c) { c.flags.ownContext = true; c.contexts.push(p === "newPage" ? out.context() : out); }
          return out;
        };
        return v.bind(t);
      },
    });
    TARGET.set(px, this.browser);
    return px;
  }

  /* fingerprints */
  async baseline() {
    const s = this.slot;
    await s.page.evaluate(STAMP_BASELINE).catch(() => { });
    s.fp = await this.fingerprint();
    s.dirty = false;
    if (CACHE) {
      const dom = await s.page.evaluate(RENDER_HASH).catch(() => null);
      const bodies = (await Promise.all(s.bodies)).sort();
      s.renderHash = dom ? X.sha([dom, ...bodies].join("\n")) : null;
    }
    s.collecting = false;
    s.bodies = [];
  }
  async fingerprint() {
    const s = this.slot;
    const inPage = await s.page.evaluate(FINGERPRINT).catch((e) => ({ error: String(e?.message || e).slice(0, 120) }));
    const cookies = await s.ctx.cookies().then((l) => X.sha(JSON.stringify(l.map((x) => [x.name, x.value, x.domain, x.path]).sort())), () => "?");
    return { ...inPage, url: s.page.url(), cookies, viewport: JSON.stringify(s.page.viewportSize()) };
  }
  /** after a check: put stamps and scroll back, then compare with the pristine page */
  async settle(c) {
    for (const [obj, evt, fn] of c.listeners) { try { obj.off ? obj.off(evt, fn) : obj.removeListener(evt, fn); } catch { } }
    for (const ctx of c.contexts) await Promise.race([ctx.close().catch(() => { }), new Promise((r) => setTimeout(r, 10_000))]);
    const s = this.slot;
    if (!s || s.kind === "blank" || s.dirty) return;
    if (s.page.isClosed()) { s.dirty = "page closed"; return; }
    // the open did not finish (it threw or ran out of time before the pristine print): the page is not known to be
    // pristine, so the next check gets a fresh one
    if (!s.fp) { s.dirty = "no pristine print"; return; }
    await s.page.evaluate(STAMP_RESTORE).catch(() => { });
    let now = await this.fingerprint();
    if (now.scroll !== s.fp.scroll && now.dom === s.fp.dom) {
      // scrolled and left there: scroll back the way revealLazy left the page, then look again
      await s.page.evaluate(SCROLL_RESTORE).catch(() => { });
      await s.page.waitForTimeout(300);
      await s.page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => { const t = a.effect?.getComputedTiming?.(); return a.playState === "running" && t && Number.isFinite(t.endTime); }).map((a) => a.finished.catch(() => { }))), new Promise((r) => setTimeout(r, 3000))])).catch(() => { });
      now = await this.fingerprint();
    }
    const diff = Object.keys(s.fp).filter((k) => s.fp[k] !== now[k]);
    if (diff.length) s.dirty = `changed: ${diff.join(", ")}`;
  }
}

/** the scripts and stylesheets a load fetched, hashed by content (the cache's render hash includes them) */
function watchBodies(ctx, into) {
  into.bodiesWatched = true;
  ctx.on("response", (res) => {
    if (!into.collecting) return;
    const t = res.request().resourceType();
    if (t === "script" || t === "stylesheet") into.bodies.push(res.body().then((b) => `${t} ${res.url()} ${X.sha(b)}`, () => `${t} ${res.url()} unreadable`));
  });
}

/* in-page helpers (run in the browser) */
const ATTR = "^data-(bs|bsf|ui)(-|$)";
function STAMP_BASELINE() {
  const re = /^data-(bs|bsf|ui)(-|$)/;
  const list = [];
  const walk = (root) => { for (const el of root.querySelectorAll("*")) { for (const a of el.attributes) if (re.test(a.name)) list.push([el, a.name, a.value]); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);
  window.__bsxBaseline = list;
}
function STAMP_RESTORE() {
  const re = /^data-(bs|bsf|ui)(-|$)/;
  const keep = new Map();
  for (const [el, n, v] of window.__bsxBaseline || []) { if (!keep.has(el)) keep.set(el, new Map()); keep.get(el).set(n, v); }
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      const k = keep.get(el);
      for (const a of Array.from(el.attributes)) if (re.test(a.name) && !(k && k.has(a.name))) el.removeAttribute(a.name);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  for (const [el, n, v] of window.__bsxBaseline || []) if (el.getAttribute(n) !== v) el.setAttribute(n, v);
}
function SCROLL_RESTORE() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  for (const el of document.querySelectorAll("*")) if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; }
}
function FINGERPRINT() {
  const H = () => { let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995; return { u(s) { s = String(s); for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 16777619); h2 = Math.imul(h2 ^ ch, 2246822507); } h1 = Math.imul(h1 ^ 7, 16777619); }, d() { return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16); } }; };
  const dom = H(), scroll = H(), form = H(), media = H();
  const walk = (root) => {
    for (const n of root.childNodes) {
      if (n.nodeType === 3) { dom.u(n.data); continue; }
      if (n.nodeType !== 1) continue;
      dom.u(`<${n.tagName}`);
      for (const a of n.attributes) dom.u(` ${a.name}=${a.value}`);
      if (n.scrollTop || n.scrollLeft) scroll.u(`${n.tagName}:${n.scrollTop},${n.scrollLeft}`);
      if (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT") form.u(`${n.value}|${n.checked}|${n.indeterminate}|${n.selectedIndex}`);
      if (n.tagName === "IMG") media.u(`${n.complete}|${n.naturalWidth}x${n.naturalHeight}|${n.currentSrc}`);
      if (n.tagName === "DETAILS") form.u(`d${n.open}`);
      if (n.shadowRoot) walk(n.shadowRoot);
      walk(n);
      dom.u(">");
    }
  };
  walk(document);
  scroll.u(`${scrollX},${scrollY}`);
  const ae = document.activeElement;
  let focus = ae ? `${ae.tagName}#${ae.id}` : "";
  if (ae) { let i = 0; for (let x = ae; x.previousElementSibling; x = x.previousElementSibling) i++; focus += `@${i}`; }
  const css = H();
  for (const sh of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) { try { css.u(`${sh.href}|${sh.disabled}|${sh.cssRules.length}`); } catch { css.u(`${sh.href}|x`); } }
  const store = H();
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); store.u(`${k}=${localStorage.getItem(k)}`); } } catch { }
  try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); store.u(`s:${k}=${sessionStorage.getItem(k)}`); } } catch { }
  store.u(document.cookie);
  let popovers = 0;
  try { popovers = document.querySelectorAll(":popover-open").length; } catch { }
  const transitions = document.getAnimations().filter((a) => a.playState === "running" && a.constructor.name === "CSSTransition").length;
  return {
    dom: dom.d(), scroll: scroll.d(), form: form.d(), media: media.d(), css: css.d(), store: store.d(), focus,
    selection: String(getSelection() || "").slice(0, 200), overlays: `${popovers}|${document.querySelectorAll("dialog[open]").length}|${!!document.fullscreenElement}`,
    transitions: String(transitions), fonts: `${document.fonts.status}|${document.fonts.size}`,
  };
}
// the cache's render hash: the DOM as rendered (generated ids normalised, inline data scripts left out), every
// stylesheet rule's text, image sizes, fonts; the scripts and stylesheets loaded are hashed from the network
function RENDER_HASH() {
  const out = [];
  const ID = /(:r[0-9a-z]+:|«r[0-9a-z]+»|\b_R_[0-9a-zA-Z]+_\b|radix-:?[0-9a-z:]+)/gi;
  const walk = (root) => {
    for (const n of root.childNodes) {
      if (n.nodeType === 3) { out.push(n.data); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      out.push(`<${tag}`);
      for (const a of n.attributes) if (!/^data-(bs|bsf|ui)(-|$)|^nonce$/.test(a.name)) out.push(` ${a.name}=${a.value.replace(ID, "#id")}`);
      if (tag === "IMG") out.push(` [${n.naturalWidth}x${n.naturalHeight} ${n.currentSrc}]`);
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") out.push(` [${n.value}|${n.checked}]`);
      if (tag === "SCRIPT" && !n.src && (/self\.__next_f|__NEXT_DATA__|application\/(ld\+)?json/.test(n.textContent.slice(0, 200) + n.type) || n.id === "__NEXT_DATA__")) { out.push(">"); continue; }
      if (tag === "IFRAME") { try { if (n.contentDocument) walk(n.contentDocument); } catch { out.push(` [cross-origin ${n.src}]`); } }
      if (n.shadowRoot) walk(n.shadowRoot);
      walk(n);
      out.push(">");
    }
  };
  walk(document);
  for (const sh of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) {
    try { for (const r of sh.cssRules) out.push(r.cssText); } catch { out.push(`[sheet ${sh.href}]`); }
  }
  const fonts = [];
  document.fonts.forEach((f) => fonts.push(`${f.family}|${f.weight}|${f.style}|${f.status}`));
  out.push(fonts.sort().join(";"));
  return out.join("\u0001");
}
void ATTR;

/* ───────── openers ───────── */
const argSig = (args) => { try { return JSON.stringify(args); } catch { return String(Math.random()); } };
function pageOpener(key, fn) {
  return async function expressOpen(page, ...args) {
    const c = cur();
    const S = c?.S;
    if (!c || !S || !S.isPage(page)) return fn(page, ...args);
    c.opens++;
    if (c.own || c.opened) {
      // own page, or a second open in the same check: the original open on the same page, as in a normal run
      c.opened = true;
      if (!c.own) { S.markDirty("opened again"); c.flags.reopen = true; }
      c.inOpener = true;
      try { return await fn(S.slot.page, ...args); } finally { c.inOpener = false; }
    }
    c.opened = true;
    const sig = `${key}|${argSig(args)}|${JSON.stringify(S.options(c.rule))}`;
    const s = S.slot;
    if (s && s.kind === "page" && s.sig === sig && !s.dirty) c.served = "shared";
    else {
      const why = !s || s.kind === "blank" ? null : s.sig !== sig ? (s.sig ? "another open" : "first load") : `dirty (${s.dirty})`;
      const slot = await S.fresh(c.rule, why);
      slot.kind = "page";
      slot.sig = sig;
      c.inOpener = true;
      try { slot.ret = await fn(slot.page, ...args); } finally { c.inOpener = false; }
      S.loads++;
      await S.baseline();
      c.served = "loaded";
    }
    await cacheCheck(c);
    return S.slot.ret;
  };
}
function ctxOpener(key, fn) {
  return async function expressOpenIn(browser, ...args) {
    const c = cur();
    const S = c?.S;
    if (!c || !S || !S.isBrowser(browser)) return fn(browser, ...args);
    c.opens++;
    if (c.own) {
      c.opened = true;
      const v = await fn(S.browser, ...args);
      if (v?.ctx) c.contexts.push(v.ctx);
      return v;
    }
    const sig = `ctx:${key}|${argSig(args)}`;
    if (c.opened && c.opens > 1 && !(S.slot && S.slot.sig === sig && !S.slot.dirty)) c.flags.reopen = true;
    c.opened = true;
    const s = S.slot;
    if (s && s.kind === "context" && s.sig === sig && !s.dirty) c.served = c.served || "shared";
    else {
      const why = !s ? null : s.sig !== sig ? (s.sig ? "another open" : "first load") : `dirty (${s.dirty})`;
      if (why) S.resets.push(why);
      await S.closeSlot();
      c.inOpener = true;
      // the open function makes its own context: watch what that context loads from the start
      const pending = { bodies: [], collecting: true };
      const loader = new Proxy(S.browser, { get: (t, p) => (p === "newContext" ? async (...a) => { const ctx = await t.newContext(...a); if (CACHE) watchBodies(ctx, pending); return ctx; } : typeof t[p] === "function" ? t[p].bind(t) : t[p]) });
      let v;
      try { v = await fn(loader, ...args); } finally { c.inOpener = false; }
      const slot = { ctx: v.ctx, page: v.page, kind: "context", sig, dirty: false, bodies: pending.bodies, collecting: true, value: v, opts: "", bodiesWatched: true };
      pending.collecting = true;
      S.watch(slot);
      S.slot = slot;
      S.loads++;
      await S.baseline();
      pending.collecting = false;
      c.served = c.served || "loaded";
    }
    await cacheCheck(c);
    const v = S.slot.value;
    const out = { ...v, ctx: S.ctxPx, page: S.pagePx };
    for (const [k, f] of Object.entries(v)) if (typeof f === "function") out[k] = async (...a) => { S.markDirty(k); c.flags.acted = k; return f(...a); };
    return out;
  };
}

/* ───────── the cache ───────── */
let KEY_PARTS;
const keyParts = () => (KEY_PARTS ??= [X.toolVersion(), X.codeHash(), X.configHash(STATE_DIR, process.env.BABYSITTER_CONFIG || resolve(ROOT, "babysitter.config.json"))].join("|"));
async function cacheCheck(c) {
  if (!CACHE || !c.S.slot?.renderHash || c.opens > 1 || c.own) return;
  const hash = X.sha(`${keyParts()}|${c.containerId}|${c.S.slot.sig}|${c.S.slot.renderHash}`);
  c.hash = hash;
  if (UNCACHEABLE.some((r) => r.test(c.rule.title)) || c.noCacheReuse) return;
  const hit = X.lookup(c.entry, c.rule.title, hash);
  if (hit) { c.cached = hit; throw new CachedSignal(hit); }
}

/* ───────── the page container ───────── */
// the message Playwright reports for an error thrown in a test (filterStackTrace: name + message; inspect otherwise)
const msgOf = (e) => (e instanceof Error ? `${e.name ? `${e.name}: ` : ""}${e.message}` : inspect(e));
const loadJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };

function selectRules(group, info, containerId) {
  const grepTitle = (rule) => ["", info.project.name, ...info.titlePath.slice(0, -1), ...rule.titles.slice(0)].join(" ");
  const re = (s) => { if (!s) return null; const m = s.match(/^\/(.*)\/([gi]*)$/); return m ? new RegExp(m[1], m[2]) : new RegExp(s, "gi"); };
  const g = re(process.env.BABYSITTER_EXPRESS_GREP), gi = re(process.env.BABYSITTER_EXPRESS_GREP_INVERT);
  const test = (r, s) => { r.lastIndex = 0; return r.test(s); };
  let rules = group.rules.filter((r) => (!g || test(g, grepTitle(r))) && (!gi || !test(gi, grepTitle(r))));
  const only = process.env.BABYSITTER_EXPRESS_ONLY ? loadJson(process.env.BABYSITTER_EXPRESS_ONLY, null) : null;
  if (only && only[containerId]) rules = rules.filter((r) => only[containerId].includes(r.title));
  const file = info.titlePath[0];
  return rules.map((r) => ({ ...r, phase: phaseOf(file, r) })).sort((a, b) => a.phase - b.phase || a.index - b.index);
}

function makeInfo(c, real) {
  const rec = c.rec;
  const own = {
    title: c.rule.title,
    titlePath: [...real.titlePath.slice(0, -1), ...c.rule.titles],
    annotations: rec.annotations,
    attachments: rec.attachments,
    get timeout() { return rec.timeout; },
    setTimeout(ms) { rec.timeout = ms; c.onTimeout?.(); },
    skip: (...a) => shimTest.skip(...a),
    fixme: (...a) => shimTest.skip(...a),
    slow: (...a) => shimTest.slow(...a),
    fail: () => { throw new Error("express: test.fail() inside a page check is not supported"); },
    attach: async (name, opts) => { rec.attachments.push(name); return real.attach(`${c.rule.title} — ${name}`, opts); },
    get errors() { return rec.softErrors.map((e) => ({ message: msgOf(e) })); },
    get status() { return rec.softErrors.length ? "failed" : "passed"; },
    expectedStatus: "passed",
    _express: true,
  };
  return new Proxy(own, { get: (t, p) => (p in t ? t[p] : typeof real[p] === "function" ? real[p].bind(real) : real[p]) });
}

async function runRule(S, group, rule, real, base0, shared, own) {
  const rec = { titles: rule.titles, title: rule.title, status: "passed", errors: [], softErrors: [], annotations: [], attachments: [], timeout: base0.timeout, start: Date.now() };
  const c = { rule, rec, S, flags: {}, listeners: [], contexts: [], opened: false, opens: 0, own, served: null, finalized: false, inOpener: false, containerId: shared.containerId, entry: shared.entry, noCacheReuse: own };
  c.info = makeInfo(c, real);
  if (own) await S.fresh(rule, "own page");
  const fixtures = new Proxy({ page: S.pagePx, browser: S.browserPx, context: S.ctxPx }, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "request") { c.flags.request = true; return base0.request; }
      return base0[p];
    },
  });
  const run = als.run(c, async () => {
    for (const n of chain(rule.node)) for (const s of n.skips) if (s.cond) throw new SkipSignal(s.description);
    for (const n of chain(rule.node)) for (const h of n.hooks) await h(fixtures, c.info);
    try { await rule.fn(fixtures, c.info); }
    finally { for (const n of chain(rule.node).reverse()) for (const h of n.after) await h(fixtures, c.info); }
  });
  let outcome;
  // the check's own time budget (its test.setTimeout, else the run's --timeout), measured from its start
  const timer = new Promise((res) => {
    const tick = () => {
      real.setTimeout(Math.max(real.timeout, Date.now() - base0.started + Math.max(0, rec.start + rec.timeout - Date.now()) + 60_000));
      if (rec.timeout && Date.now() - rec.start > rec.timeout) return res({ timedOut: true });
      c.timerId = setTimeout(tick, 250);
    };
    c.onTimeout = () => real.setTimeout(Math.max(real.timeout, Date.now() - base0.started + rec.timeout + 60_000));
    tick();
  });
  outcome = await Promise.race([run.then(() => ({ ok: true }), (e) => ({ e })), timer]);
  clearTimeout(c.timerId);
  run.catch(() => { });
  c.finalized = true;
  rec.ms = Date.now() - rec.start;
  if (outcome.timedOut) {
    rec.status = "timedOut";
    rec.errors = [{ message: `Test timeout of ${rec.timeout}ms exceeded.` }];
    for (const ctx of c.contexts) ctx.close().catch(() => { });
    await S.closeSlot();
    // the call the check was waiting on fails as the page goes: Playwright reports it as "<api>: Test timeout of …"
    const late = await Promise.race([run.then(() => null, (e) => e), new Promise((r) => setTimeout(() => r(null), 1500))]);
    const m = late instanceof Error && String(late.message).match(/^([\w.]+): (?:Target page, context or browser has been closed|Test ended)/);
    if (m) rec.errors.push({ message: `Error: ${m[1]}: Test timeout of ${rec.timeout}ms exceeded.` });
    await S.fresh(null, null);
  } else {
    if (outcome.e instanceof SkipSignal) { rec.status = "skipped"; rec.annotations.push({ type: "skip", description: outcome.e.description }); }
    else if (outcome.e && !(outcome.e instanceof CachedSignal)) { rec.status = "failed"; rec.errors.push({ message: msgOf(outcome.e) }); }
    if (rec.softErrors.length) { rec.status = "failed"; rec.errors = [...rec.softErrors.map((e) => ({ message: msgOf(e) })), ...rec.errors]; }
    if (outcome.e instanceof CachedSignal) {
      rec.status = outcome.e.entry.status;
      rec.annotations.splice(0, rec.annotations.length, ...(outcome.e.entry.annotations || []), { type: "express", description: "cached (unchanged render)" });
      rec.cached = true;
    }
    if (own || c.retry) S.markDirty(own ? "own page" : "touched before open");
    await S.settle(c);
  }
  delete rec.softErrors;
  rec.served = own ? "own page" : c.served || (c.opened ? "own context" : "no page");
  rec.dirty = !!(S.slot?.dirty) && rec.served !== "no page";
  rec.retry = c.retry || null;
  rec.flags = c.flags;
  rec.hash = c.hash || null;
  rec.cacheable = !own && !rec.cached && !!c.hash && c.opens === 1 && !c.flags.network && !c.flags.newPage && !c.flags.ownContext && !c.flags.request && !c.flags.reopen && !UNCACHEABLE.some((r) => r.test(rule.title));
  return rec;
}

async function runContainer(group, fx, info) {
  const started = Date.now();
  const containerId = `${info.titlePath.slice(0, -1).join(" › ")} @ ${info.project.name}`;
  const base0 = { timeout: info.timeout || 0, started, request: fx.request };
  const rules = selectRules(group, info, containerId);
  if (!rules.length) base.skip(true, "express: no check of this page matches the filter (-g / --last-failed)");
  const S = new Shared(fx.browser, info, group, fx.opts);
  const shared = { containerId, entry: CACHE ? X.readEntry(STATE_DIR, containerId) : null };
  const out = [];
  await S.fresh(null, null);
  try {
    for (const rule of rules) {
      const prof = profile()[ruleKey(info.titlePath[0], rule.title)];
      let rec = await runRule(S, group, rule, info, base0, shared, !!prof?.own);
      if (rec.retry && rec.status !== "timedOut") {
        // it touched the page before opening it: run it again, from the start, on its own fresh page
        const why = rec.retry;
        rec = await runRule(S, group, rule, info, base0, shared, true);
        rec.annotations.push({ type: "express", description: `ran on its own fresh page: it needs one (${why})` });
      }
      if (DEBUG) console.log(`[express] ${rule.title.slice(0, 60)} → ${rec.status} (${rec.served}${rec.cached ? ", cached" : ""}${rec.dirty ? `, left dirty: ${S.slot?.dirty}` : ""}) ${rec.ms}ms`);
      out.push(rec);
    }
  } finally {
    await S.closeSlot();
  }
  const stats = { loads: S.loads, resets: S.resets, rules: out.length, cached: out.filter((r) => r.cached).length, own: out.filter((r) => r.served === "own page").length, ms: Date.now() - started };
  const payload = { version: 1, containerId, file: relative(info.project.testDir, group.file), route: group.route, stats, rules: out.map(({ start, ...r }) => r) };
  await info.attach("express-results.json", { body: Buffer.from(JSON.stringify(payload)), contentType: "application/json" });
  if (CACHE) { try { X.writeEntry(STATE_DIR, containerId, out); } catch { } }
  info.annotations.push({ type: "express", description: `${out.length} checks, ${S.loads} page load(s), ${stats.cached} cached, ${stats.own} on their own page` });
  const bad = out.filter((r) => r.status === "failed" || r.status === "timedOut");
  if (bad.length) {
    const lines = bad.map((r) => `  ✗ ${r.title}\n${String(r.errors[0]?.message || "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(0, 4).map((l) => `      ${l}`).join("\n")}`);
    throw new Error(`express: ${bad.length} of ${out.length} check(s) failed on this page (each is reported as its own result in the run summary and findings.json)\n${lines.join("\n")}`);
  }
}
