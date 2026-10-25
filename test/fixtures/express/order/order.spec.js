// Express order / reset fixture: checks that act on the page (click, hover, keyboard, a style set from script, a stamp
// attribute, a scroll, a cookie, a viewport change) are declared BEFORE the read-only checks that would see what they
// did. In a normal run every check has its own fresh page; in express mode the later checks must still see the
// pristine page. Plus: test.skip inside a check, expect.soft, a check that runs out of time, a check that touches the
// page before opening it (it gets its own fresh page), and test.info() annotations.
import { test, expect, describeRoute, opener } from "../../../../playwright/express.js";

const open = opener("order", async (page, path) => {
  await page.goto(path);
  await page.waitForTimeout(100);
});
const state = (page) => page.evaluate(() => ({
  boxes: document.querySelectorAll(".box").length,
  color: getComputedStyle(document.querySelector("#t")).color,
  hovered: !!document.querySelector("#h:hover"),
  focused: document.activeElement?.id || "",
  stamps: document.querySelectorAll("[data-bs-mark]").length,
  scroll: scrollY,
  cookie: document.cookie,
  width: innerWidth,
  open: document.querySelector("#menu").hidden === false,
}));
const PRISTINE = { boxes: 1, color: "rgb(17, 17, 17)", hovered: false, focused: "", stamps: 0, scroll: 0, cookie: "", width: 1440, open: false };

for (const route of [{ path: "/order", auth: false }]) {
  describeRoute(route, route.path, () => {
    test("click adds a box", async ({ page }) => { await open(page, route.path); await page.click("#add"); expect((await state(page)).boxes).toBe(2); });
    test("read after click", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("hover", async ({ page }) => { await open(page, route.path); await page.hover("#h"); expect((await state(page)).hovered).toBe(true); });
    test("read after hover", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("style from a script", async ({ page }) => { await open(page, route.path); await page.evaluate(() => { document.querySelector("#t").style.color = "red"; }); });
    test("read after style", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("stamp attributes", async ({ page }) => { await open(page, route.path); await page.evaluate(() => document.querySelectorAll("p").forEach((p) => p.setAttribute("data-bs-mark", "1"))); });
    test("read after stamps", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("scroll from a script", async ({ page }) => { await open(page, route.path); await page.evaluate(() => scrollTo(0, 900)); });
    test("read after scroll", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("keyboard focus", async ({ page }) => { await open(page, route.path); await page.keyboard.press("Tab"); });
    test("read after focus", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("cookie from a script", async ({ page }) => { await open(page, route.path); await page.evaluate(() => { document.cookie = "x=1; path=/"; }); });
    test("read after cookie", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("menu opened from a script", async ({ page }) => { await open(page, route.path); await page.evaluate(() => { document.querySelector("#menu").hidden = false; }); });
    test("read after menu", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("viewport", async ({ page }) => { await open(page, route.path); await page.setViewportSize({ width: 360, height: 700 }); });
    test("read after viewport", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("a locator click", async ({ page }) => { await open(page, route.path); await page.locator("#add").first().click(); });
    test("read after locator click", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("touches the page before opening it", async ({ page }) => {
      await page.addInitScript(() => { window.__early = 1; });
      await open(page, route.path);
      expect(await page.evaluate(() => window.__early)).toBe(1);
    });
    test("read after early touch", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("skips at runtime", async ({ page }) => { await open(page, route.path); test.skip(true, "nothing to check here"); });
    test("soft and hard failures", async ({ page }) => {
      await open(page, route.path);
      test.info().annotations.push({ type: "not tested", description: "/order: one thing not tested" });
      expect.soft([{ what: "soft one", where: "#t" }], "soft label\n  • soft one — #t").toEqual([]);
      expect([{ what: "hard one", where: "#h" }], "  • hard one — #h").toEqual([]);
    });
    test("runs out of time", async ({ page }) => { test.setTimeout(1500); await open(page, route.path); await page.waitForTimeout(4000); });
    test("read after timeout", async ({ page }) => { await open(page, route.path); expect(await state(page)).toEqual(PRISTINE); });
    test("fails on purpose with a list", async ({ page }) => {
      await open(page, route.path);
      const list = [{ what: "a box sticks out", where: "#t" }];
      expect(list, list.map((o) => `  • ${o.what} — ${o.where}`).join("\n")).toEqual([]);
    });
  });
}
