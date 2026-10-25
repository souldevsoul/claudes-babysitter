// Express cache fixture: one page, three checks — one passes on the unchanged page, one always fails, one reads the
// DOM. The test (test/express-cache.test.mjs) changes the page's CSS, its DOM and the config between runs.
import { test, expect, describeRoute, opener } from "../../../../playwright/express.js";

const open = opener("cache", async (page, path) => { await page.goto(path); });
describeRoute({ path: "/", auth: false }, "/", () => {
  test("text colour is the theme's", async ({ page }) => {
    await open(page, "/");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("p")).color)).toBe("rgb(17, 17, 17)");
  });
  test("always fails", async ({ page }) => {
    await open(page, "/");
    expect(["a defect"], "  • a defect — p").toEqual([]);
  });
  test("one paragraph", async ({ page }) => {
    await open(page, "/");
    expect(await page.locator("p").count()).toBe(1);
  });
});
