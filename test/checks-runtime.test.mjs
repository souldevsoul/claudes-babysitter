// playwright/checks.js runs inside the page, so a scoping slip only shows up in a browser.
// rowAlignment crashed with "at is not defined" on any page with bordered rows stacked flush (Volt, 2026-10).
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import * as checks from "../playwright/checks.js";

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  await checks.install(page); // init scripts: must precede the navigation
  const html = `<div id="list" style="display:flex;flex-direction:column;width:400px">
    <div style="border:1px solid #333;height:70px">one</div>
    <div style="border:1px solid #333;height:70px">two</div>
    <div style="border:1px solid #333;height:70px">three</div></div>`;
  await page.goto("data:text/html," + encodeURIComponent(html));
  const out = await checks.rowAlignment(page);
  const seam = out.find((f) => /double border between stacked rows/.test(f.what));
  assert.ok(seam, "stacked double border is reported");
  assert.ok(seam.selector, "finding carries the container selector");
  console.log("checks-runtime: ok");
} finally {
  await browser.close();
}
