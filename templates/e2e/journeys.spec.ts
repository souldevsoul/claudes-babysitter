// Product journeys: the paths this product promises its users, clicked through like a user would.
// This file belongs to the project. Whoever builds a user-facing feature (person or AI generator) adds a test
// for it here, in the same change. Business acceptance runs from Claude's Babysitter and needs nothing here:
// footer, cookies, currency, sign-in, 2FA, dead links, one shape and palette.
//
//   npm run test:e2e                       prepare (login + crawl) + UI checks + acceptance + this file
//   npm run test:e2e -- --only product     just this folder
//   BASE_URL=http://localhost:3000 LOGIN_EMAIL=… LOGIN_PASSWORD=… npm run test:e2e
//
// `user` is a page that is already signed in (storage from `babysitter prepare`).
// `open(page, path)` waits for fonts, hydration and lazy sections like every built-in check does.
import { test, expect, open, routes } from "./babysitter";

test("home: one headline and a way to start", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main a, main button").filter({ hasText: /get started|sign up|start|try|book|buy|create/i }).first()).toBeVisible();
});

test("signed in: the first account page loads without errors", async ({ user }) => {
  const errors: string[] = [];
  user.on("pageerror", (e) => errors.push(e.message));
  const first = routes.find((r) => r.auth)?.path ?? "/dashboard";
  await open(user, first);
  await expect(user.locator("main")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

// Add one test per feature, for example:
//   test("top-up: a custom amount previews credits in the chosen currency", async ({ user }) => { … });
//   test("orders: a new order appears in the list without a reload", async ({ user }) => { … });
// Assert what the user sees (text, counts, the URL), not implementation details.
