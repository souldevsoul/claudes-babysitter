// Types for playwright/fixtures.js — what a product's e2e/babysitter.ts re-exports, so a strict TypeScript project
// compiles its own specs (no TS7016 "could not find a declaration file").
import type { Page, TestType, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from "@playwright/test";
export { expect } from "@playwright/test";

/** a route of the crawl (.babysitter/routes.json) or babysitter.config.json → routes */
export interface BabysitterRoute { path: string; auth?: boolean; role?: string; [key: string]: unknown }

/** babysitter.config.json, as loaded */
export declare const cfg: Record<string, any>;
/** the owner decisions of business acceptance (babysitter.config.json → acceptance, with defaults) */
export declare const acc: Record<string, any>;
export declare const routes: BabysitterRoute[];
/** true when `babysitter prepare` saved signed-in storage */
export declare const signedIn: boolean;
/** path of the signed-in storage state */
export declare const STORAGE: string;
/** the page helpers the built-in checks use (install, revealLazy, gotoStable …) */
export declare const checks: Record<string, (...args: any[]) => any>;
/** the business acceptance checks (footer, cookies, money …) */
export declare const acceptance: Record<string, any>;

/** Open a route the way every check does: helpers installed, network idle, fonts and lazy sections settled. */
export declare function open(page: Page, route: string): Promise<void>;

/** `test` with one extra fixture: `user`, a page already signed in (skipped without signed-in storage). */
export declare const test: TestType<PlaywrightTestArgs & PlaywrightTestOptions & { user: Page }, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;
