// node playwright/prepare.mjs && npx playwright test -c playwright/playwright.config.js
// Everything runs by default: the UI checks (babysitter.spec.js), business acceptance (acceptance.spec.js), the
// locale / state / scroll runs (run.spec.js) and the product's own e2e/*.spec.ts. Viewports: 360, 390, 768, 1280, 1440
// (project.js → viewports; `--quick` / BABYSITTER_PROFILE=quick = 390 + 1440).
import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import { resolve } from "node:path";
import { loadConfig, ROOT, viewports } from "./project.js";
import { classifySpecs, testMatchFor } from "../lib/product-specs.js";
const cfg = loadConfig();
const schemes = cfg.colorSchemes?.length ? cfg.colorSchemes : ["light"];
// the product's own journeys (e2e/*.spec.ts, scaffolded by `babysitter init`) run in the same pass
const productE2E = resolve(ROOT, process.env.BABYSITTER_E2E_DIR || cfg.e2eDir || "e2e");
// ONLY THE SPECS THAT ARE OURS.
// A product that runs Playwright itself keeps its own specs in e2e/ against its own copy of
// @playwright/test. Loading those into this project pulled a second copy of the runner into
// the same process: Playwright stopped with "Requiring @playwright/test second time" and every
// suite came out NOT RUN — the product's tests did not run either, so nothing was gained by
// taking them. The project now matches exactly the files that import ./babysitter; the rest are
// named in the summary (lib/product-specs.js → describeSpecs) so they are left out loudly.
const productSpecs = classifySpecs(productE2E);
const hasProductE2E = productSpecs.ours.length > 0;
// workers scale with the machine: one Chrome per ~2.5 GB of RAM, leaving two cores free; WORKERS overrides
const workers = Number(process.env.WORKERS || Math.max(2, Math.min(8, availableParallelism() - 2, Math.floor(totalmem() / 2.5e9))));
export default defineConfig({
    testDir: ".",
    // a page checked in several states / languages takes longer; the state and locale tests set their own budgets
    timeout: Number(process.env.TEST_TIMEOUT || 120_000),
    fullyParallel: true,
    workers,
    // results land in the product, not inside the tool (node_modules / tools/ in package and vendor mode)
    outputDir: resolve(ROOT, ".babysitter/test-results"),
    reporter: [["list"], ["html", { open: "never", outputFolder: resolve(ROOT, ".babysitter/playwright-report") }], ["json", { outputFile: resolve(ROOT, ".babysitter/report.json") }]],
    use: {
        baseURL: process.env.BASE_URL || cfg.baseURL || "http://localhost:3000",
        channel: process.env.PW_CHANNEL || "chrome",
        // express: a screenshot of whatever page the last check of a page test left open says nothing about the check
        // that failed (playwright/express.js)
        screenshot: process.env.BABYSITTER_EXPRESS === "1" ? "off" : "only-on-failure",
    },
    projects: [
        ...schemes.flatMap((scheme) => viewports(cfg).map((v) => ({
            name: schemes.length > 1 ? `${v.name}-${scheme}` : v.name,
            use: { viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, isMobile: v.width < 768, hasTouch: v.width < 768, colorScheme: scheme },
        }))),
        ...(hasProductE2E ? [{ name: "product", testDir: productE2E, testMatch: testMatchFor(productSpecs.ours), use: { viewport: { width: 1440, height: 900 } } }] : []),
    ],
});
