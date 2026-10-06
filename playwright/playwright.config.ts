// node playwright/prepare.mjs && npx playwright test -c playwright/playwright.config.ts
import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, ROOT } from "./project.js";

const cfg = loadConfig();
const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const schemes = cfg.colorSchemes?.length ? cfg.colorSchemes : (["light"] as const);
// the product's own journeys (e2e/*.spec.ts, scaffolded by `babysitter init`) run in the same pass
const productE2E = resolve(ROOT, process.env.BABYSITTER_E2E_DIR || cfg.e2eDir || "e2e");
const hasProductE2E = existsSync(productE2E) && readdirSync(productE2E).some((f) => /\.spec\.(t|j)s$/.test(f));

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  fullyParallel: true,
  workers: Number(process.env.WORKERS || 4),
  // results land in the product, not inside the tool (node_modules / tools/ in package and vendor mode)
  outputDir: resolve(ROOT, ".babysitter/test-results"),
  reporter: [["list"], ["html", { open: "never", outputFolder: resolve(ROOT, ".babysitter/playwright-report") }], ["json", { outputFile: resolve(ROOT, ".babysitter/report.json") }]],
  use: {
    baseURL: process.env.BASE_URL || cfg.baseURL || "http://localhost:3000",
    channel: process.env.PW_CHANNEL || "chrome",
    screenshot: "only-on-failure",
  },
  projects: [
    ...schemes.flatMap((scheme) =>
      viewports.map((v) => ({
        name: schemes.length > 1 ? `${v.name}-${scheme}` : v.name,
        use: { viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, isMobile: v.width < 768, hasTouch: v.width < 768, colorScheme: scheme },
      })),
    ),
    ...(hasProductE2E ? [{ name: "product", testDir: productE2E, use: { viewport: { width: 1440, height: 900 } } }] : []),
  ],
});
