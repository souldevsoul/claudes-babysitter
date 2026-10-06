// What a product's own e2e specs import (e2e/babysitter.ts re-exports this file):
//   import { test, expect, open, acc } from "./babysitter";
// One copy of @playwright/test (the one next to Claude's Babysitter), the project's babysitter.config.json,
// signed-in storage from `babysitter prepare`, and the same page helpers the built-in checks use.
import { test as base, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import * as checks from "./checks.js";
import * as acceptance from "./acceptance.js";
import { loadConfig, loadRoutes, STORAGE } from "./project.js";

export const cfg = loadConfig();
export const acc = acceptance.acceptanceConfig(cfg);
export const routes = loadRoutes(cfg);
export const signedIn = existsSync(STORAGE);
export { expect, checks, acceptance, STORAGE };

/** Open a route the way every check does: helpers installed, network idle, fonts and lazy sections settled. */
export async function open(page, route) {
    await checks.install(page);
    await page.goto(route, { waitUntil: "networkidle" }).catch(() => page.goto(route, { waitUntil: "load" }));
    await page.waitForTimeout(600);
    if (await checks.applyColorScheme(page))
        await page.waitForTimeout(300);
    await checks.revealLazy(page);
}

/**
 * `test` with one extra fixture: `user` — a page already signed in (storage from `babysitter prepare`).
 * Tests that ask for `user` are skipped when there is no signed-in storage.
 */
export const test = base.extend({
    user: async ({ browser }, use, info) => {
        info.skip(!signedIn, "no signed-in storage — run `babysitter prepare` with LOGIN_EMAIL / LOGIN_PASSWORD");
        const ctx = await browser.newContext({ ...info.project.use, storageState: STORAGE });
        const page = await ctx.newPage();
        await checks.install(page);
        await use(page);
        await ctx.close();
    },
});
