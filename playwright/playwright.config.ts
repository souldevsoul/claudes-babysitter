// node playwright/prepare.mjs && npx playwright test -c playwright/playwright.config.ts
import { defineConfig } from "@playwright/test";
import { loadConfig } from "./project";

const cfg = loadConfig();
const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const schemes = cfg.colorSchemes?.length ? cfg.colorSchemes : (["light"] as const);

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  fullyParallel: true,
  workers: Number(process.env.WORKERS || 4),
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }], ["json", { outputFile: "../.babysitter/report.json" }]],
  use: {
    baseURL: process.env.BASE_URL || cfg.baseURL || "http://localhost:3000",
    channel: process.env.PW_CHANNEL || "chrome",
    screenshot: "only-on-failure",
  },
  projects: schemes.flatMap((scheme) =>
    viewports.map((v) => ({
      name: schemes.length > 1 ? `${v.name}-${scheme}` : v.name,
      use: { viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, isMobile: v.width < 768, hasTouch: v.width < 768, colorScheme: scheme },
    })),
  ),
});
