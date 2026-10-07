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

  // contrast: a light heading over a dark photo on a sibling layer is not "1.13:1 on the page colour"
  const banner = `<body style="background:#eef1f4;margin:0"><section style="position:relative;height:300px">
    <div style="position:absolute;inset:0;background:linear-gradient(#111,#222)"></div>
    <h1 id="t" style="position:relative;color:#e6edf3;font-size:32px">Team Fortress 2 Market</h1>
    <p id="p" style="color:#e6edf3;font-size:14px;margin-top:400px">plain text on the page colour</p></section></body>`;
  await page.goto("data:text/html," + encodeURIComponent(banner));
  const ill = await checks.illegibleText(page);
  assert.ok(!ill.hard.some((f) => /Team Fortress/.test(f.human || f.where) || f.selector === "#t"), "heading over a sibling photo layer is not a hard failure");
  assert.ok(ill.eye.some((f) => f.selector === "#t"), "it is reported for a look by eye instead");
  assert.ok(ill.hard.some((f) => f.selector === "#p" && /contrast/.test(f.what)), "light text on the light page still fails");
  console.log("checks-runtime: ok");
} finally {
  await browser.close();
}
