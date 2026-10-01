#!/usr/bin/env node
// babysitter  [...args]
//   init [repo] [--link|--vendor] [--ci] [--url https://preview] [--dry-run] [--no-install] [--force]
//   check [...]      → bin/ui-check.mjs
//   audit [...]      → bin/ui-audit.mjs
//   fingerprint [repo…] [--register]  → theme fingerprint + look-alike products from the registry
//   micro-check      → rendered contrast / row / overflow check on a running dev server
//   prepare          → playwright/prepare.mjs (login + crawl)
//   test-ui [...]    → playwright test with the bundled config
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const node = (file, args) => process.exit(spawnSync(process.execPath, [join(root, file), ...args], { stdio: "inherit" }).status ?? 1);
switch (cmd) {
  case "init": node("bin/ui-init.mjs", rest); break;
  case "check": node("bin/ui-check.mjs", rest); break;
  case "audit": node("bin/ui-audit.mjs", rest); break;
  case "fingerprint": node("bin/fingerprint.mjs", rest); break;
  case "micro-check": node("bin/micro-check.mjs", rest); break;
  case "prepare": node("playwright/prepare.mjs", rest); break;
  case "test-ui": process.exit(spawnSync("npx", ["playwright", "test", "-c", join(root, "playwright/playwright.config.ts"), ...rest], { stdio: "inherit", cwd: process.cwd() }).status ?? 1);
  default:
    console.log("usage: babysitter |check|audit|prepare|test-ui> [...]\n  init [repo] [--link|--vendor] [--ci] [--url URL] [--dry-run] [--no-install] [--force]");
    process.exit(cmd ? 2 : 0);
}
