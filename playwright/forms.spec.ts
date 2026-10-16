// FORMS: inputs, validation, the auth lifecycle, feedback after a submit, state freshness (docs/checks-forms.md).
// Ids FM1…FM10; babysitter.config.json → forms.skip turns one off (reason in forms.skipReasons).
// SAFETY: every submit runs inside checks/forms.js sandbox() — non-GET requests are answered in the browser and
// never reach the server; payment and destructive forms are typed into, never submitted. Service workers are
// blocked so they cannot carry a request past the sandbox.
import { test, expect, type Page, type Browser } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as c from "./checks.js";
import * as a from "./acceptance.js";
import * as fm from "./checks/forms.js";
import { loadConfig, loadRoutes, STORAGE, ROOT, storageFor, authTag } from "./project.js";

const cfg = loadConfig();
const acc = a.acceptanceConfig(cfg);
const F = { skip: [] as string[], skipReasons: {} as Record<string, string>, zeroBalanceStorage: null as string | null, zeroBalanceRole: null as string | null, protectedRoute: null as string | null, forgot: null as string | null, ...(cfg.forms || {}) };
const ROUTES = loadRoutes(cfg);
const PUBLIC = ROUTES.filter((r) => !r.auth);
const AUTH = ROUTES.filter((r) => r.auth);
const SIGNED_IN = existsSync(STORAGE);
// a user with no credits: a role from babysitter.config.json → roles (signed in by prepare), or a storage file
const ZERO = F.zeroBalanceRole ? storageFor(F.zeroBalanceRole) : F.zeroBalanceStorage ? resolve(ROOT, F.zeroBalanceStorage) : null;
const STRICT = process.env.STRICT !== "0";
const on = (id: string) => !F.skip.includes(id);
const why = (id: string) => `${id} switched off in babysitter.config.json → forms.skip${F.skipReasons[id] ? `: ${F.skipReasons[id]}` : ""}`;
const SIGN_IN = acc.auth.signIn || PUBLIC.map((r) => r.path).find((p) => /^\/(login|log-in|signin|sign-in)(\/|$)/i.test(p)) || null;
const SIGN_UP = acc.auth.signUp || PUBLIC.map((r) => r.path).find((p) => /^\/(register|signup|sign-up)(\/|$)/i.test(p)) || null;
const AUTH_PAGES = [SIGN_IN, SIGN_UP, F.forgot || PUBLIC.map((r) => r.path).find((p) => /forgot|reset-password|recover/i.test(p))].filter(Boolean) as string[];

type O = { id?: string; what: string; where: string; soft?: boolean; na?: boolean };
const fmt = (list: O[]) => list.map((o) => `  • ${o.what} — ${o.where}`).join("\n");
/** hard findings fail; soft ones fail under STRICT (default) or become warnings; na ones are notes. */
function report(list: O[], label = "forms") {
  const notes = list.filter((o) => o.na);
  if (notes.length) test.info().annotations.push({ type: "not checked", description: fmt(notes) });
  const soft = list.filter((o) => o.soft && !o.na);
  const hard = list.filter((o) => !o.soft && !o.na);
  if (soft.length && !STRICT) test.info().annotations.push({ type: "warning", description: `${label}\n${fmt(soft)}` });
  const fail = STRICT ? [...hard, ...soft] : hard;
  expect(fail, fmt(fail)).toEqual([]);
}
async function open(page: Page, route: string) {
  await c.install(page);
  await page.goto(route, { waitUntil: "load", timeout: 45_000 }).catch(() => page.goto(route, { waitUntil: "domcontentloaded" }));
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(700);
  await fm.lib(page);
}
async function ctxFor(browser: Browser, storage?: string | null) {
  const info = test.info();
  return browser.newContext({ ...info.project.use, serviceWorkers: "block", storageState: storage || undefined, baseURL: info.project.use.baseURL });
}

test.use({ serviceWorkers: "block" });
// forms behave the same at every width: run once, at desktop width (the auth shell is also a layout check: two widths)
const desktopOnce = () => test.skip(!/desktop-1440/.test(test.info().project.name), "forms: runs once, at desktop width");

/* ───────── every page ───────── */
for (const route of ROUTES) {
  test.describe(`forms ${authTag(route)}${route.path}`, () => {
    if (route.auth) test.use({ storageState: storageFor(route.role) });
    const r = route.path;
    test.beforeEach(() => desktopOnce());

    test("FM1 number / amount / phone fields refuse -1, 999999999, abc, 1.5 [numeric-input-validation ×44]", async ({ page }) => {
      test.skip(!on("FM1"), why("FM1"));
      test.setTimeout(240_000);
      await open(page, r);
      report(await fm.numericBounds(page), "FM1");
    });
    test("FM2 contact / profile forms reject gibberish (q, qq, asdf) [form-validation ×35]", async ({ page }) => {
      test.skip(!on("FM2"), why("FM2"));
      test.setTimeout(180_000);
      await open(page, r);
      report(await fm.gibberish(page), "FM2");
    });
    test("FM3/FM4 a failed submit keeps the values and says so; a successful one confirms within 2 s [form-reset-on-error ×26, submit-feedback ×24]", async ({ page }) => {
      test.skip(!on("FM3"), why("FM3"));
      test.setTimeout(240_000);
      await open(page, r);
      report(await fm.submitOutcomes(page), "FM3/FM4");
    });
    if (!AUTH_PAGES.includes(r)) {
      // sign-in / sign-up eyes are acceptance A1; this covers settings, reset and every other page with a password
      test("FM7 every password field (settings, reset, confirm) has its own show/hide eye [pw-toggle ×24]", async ({ page }) => {
        test.skip(!on("FM7"), why("FM7"));
        test.skip(!!acc.auth.passwordless, "acceptance.auth.passwordless");
        await open(page, r);
        report(await fm.passwordEyes(page), "FM7");
      });
    }
    if (route.auth) {
      test("FM5 the header shows a saved name without a reload [stale-ui ×31]", async ({ page }) => {
        test.skip(!on("FM5"), why("FM5"));
        await open(page, r);
        report(await fm.staleAfterSave(page), "FM5");
      });
      test("FM6 an action the balance cannot pay for says so before the click [late-insufficient-credits ×24]", async ({ browser }) => {
        test.skip(!on("FM6"), why("FM6"));
        const ctx = await ctxFor(browser, ZERO && existsSync(ZERO) ? ZERO : storageFor(route.role));
        const page = await ctx.newPage();
        await open(page, r);
        report(await fm.creditsUpFront(page), "FM6");
        await ctx.close();
      });
      test("FM10 the account email is read-only unless it is changed through verification [email-change ×30]", async ({ page }) => {
        test.skip(!on("FM10"), why("FM10"));
        await open(page, r);
        report(await fm.settingsEmail(page), "FM10");
      });
    }
  });
}

/* ───────── site-wide ───────── */
test.describe("forms site-wide", () => {
  test.beforeEach(() => desktopOnce());

  test("FM7 'Forgot password?' leads to a working reset with a neutral confirmation [forgot-pw ×29]", async ({ browser }) => {
    test.skip(!on("FM7"), why("FM7"));
    test.skip(!SIGN_IN || !!acc.auth.passwordless, SIGN_IN ? "acceptance.auth.passwordless" : "no sign-in page (acceptance.auth.signIn / config.login.url)");
    const ctx = await ctxFor(browser);
    const page = await ctx.newPage();
    await c.install(page);
    report(await fm.forgotPassword(page, SIGN_IN!), "FM7");
    await ctx.close();
  });

  test("FM8 sign-in / sign-up / reset: logo links home, 'Back to home', no full nav or footer [auth-minimal-layout ×31]", async ({ browser }) => {
    test.skip(!on("FM8"), why("FM8"));
    test.skip(!AUTH_PAGES.length, "no sign-in / sign-up page found");
    const out: O[] = [];
    for (const p of AUTH_PAGES) {
      const ctx = await ctxFor(browser);
      const page = await ctx.newPage();
      await open(page, p);
      out.push(...(await fm.authShell(page)).map((o: O) => ({ ...o, where: `${p}: ${o.where}` })));
      await ctx.close();
    }
    report(out, "FM8");
  });

  test("FM9 no other page flashes before an auth redirect (signed out → protected page, signed in → sign-in) [loading-state ×25]", async ({ browser }) => {
    test.skip(!on("FM9"), why("FM9"));
    const out: O[] = [];
    const notes: string[] = [];
    const prot = F.protectedRoute || AUTH[0]?.path || "/dashboard";
    {
      const ctx = await ctxFor(browser);
      const page = await ctx.newPage();
      const res = await fm.redirectFlash(page, prot);
      if (!res.redirected) notes.push(`${prot} did not redirect a signed-out visitor`);
      out.push(...res.findings);
      await ctx.close();
    }
    if (SIGNED_IN && SIGN_IN) {
      const ctx = await ctxFor(browser, STORAGE);
      const page = await ctx.newPage();
      const res = await fm.redirectFlash(page, SIGN_IN);
      out.push(...res.findings);
      await ctx.close();
    }
    if (notes.length) test.info().annotations.push({ type: "not checked", description: notes.join("\n") });
    report(out, "FM9");
  });

  test.describe("signed in", () => {
    test.skip(!SIGNED_IN, "no signed-in storage — run `babysitter prepare` with LOGIN_EMAIL / LOGIN_PASSWORD");
    test.use({ storageState: STORAGE });
    const settings = () => [...new Set([acc.auth.settings, ...AUTH.map((r) => r.path).filter((p) => /setting|security|account|profile|password/i.test(p))].filter(Boolean) as string[])];

    test("FM7 change password rejects the current password as the new one, and asks twice [pw-change ×29]", async ({ page }) => {
      test.skip(!on("FM7"), why("FM7"));
      const out: O[] = [];
      let found = false;
      for (const p of settings()) {
        await open(page, p);
        if (!(await fm.openPasswordChange(page))) continue; // a form on the page, or behind a "Change password" button
        found = true;
        out.push(...(await fm.passwordEyes(page))); // the dialog's fields are not on the page at load
        out.push(...(await fm.changePasswordSame(page)));
      }
      if (!found) out.push({ id: "FM7", soft: true, what: `no settings page has a change-password form (current + new password) (looked at ${settings().join(", ") || "none — set acceptance.auth.settings"}) [FM7, pw-change]`, where: "settings" });
      report(out, "FM7");
    });

    test("FM10 settings offer 'Export my data' [GDPR, soft]", async ({ page }) => {
      test.skip(!on("FM10"), why("FM10"));
      let found = false;
      for (const p of settings()) { await open(page, p); if (await a.hasControl(page, fm.DATA_EXPORT_RE.source)) { found = true; break; } }
      report(found ? [] : [{ id: "FM10", soft: true, what: `no settings page offers "Export my data" (looked at ${settings().join(", ") || "none"}) — GDPR data portability; next to "Delete account" (A9) [FM10]`, where: "settings" }], "FM10");
    });
  });
});
