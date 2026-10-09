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

  // a sheet that slides in from the right is measured where it lands, not mid-slide (Vertex mobile menu, 2026-10:
  // at 350 ms it was still 24 px past the edge and was reported "off-screen"; at rest it fits exactly)
  const sheet = `<body style="margin:0"><header style="height:60px"><button id="menu" aria-haspopup="dialog" aria-expanded="false"
      onclick="document.getElementById('s').hidden=false;this.setAttribute('aria-expanded','true')">Menu</button></header>
    <div id="s" role="dialog" aria-label="Menu" hidden style="position:fixed;top:0;bottom:0;right:0;width:300px;background:#fff;border-left:1px solid #000;animation:slide 600ms ease-out">Menu items</div>
    <style>@keyframes slide{from{transform:translateX(100%)}to{transform:none}}</style></body>`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("data:text/html," + encodeURIComponent(sheet));
  const states = await checks.interactiveStates(page);
  assert.ok(!states.some((f) => /goes off-screen/.test(f.what)), `a sheet still sliding in is not "off-screen": ${JSON.stringify(states)}`);
  // …and one that really ends past the edge is still reported
  await page.goto("data:text/html," + encodeURIComponent(sheet.replace("right:0;width:300px", "right:-40px;width:300px")));
  const off = await checks.interactiveStates(page);
  assert.ok(off.some((f) => /goes off-screen/.test(f.what)), "a sheet that rests past the edge is still reported");
  // a kit tick box (real input, appearance:none, drawn by the product) is not a native control; a plain one is
  await page.goto("data:text/html," + encodeURIComponent('<label><input id="kit" type="checkbox" style="appearance:none;width:16px;height:16px;border:1px solid #666"> kit</label><label><input id="os" type="checkbox"> os</label>'));
  const nat = await checks.nativeControls(page);
  assert.ok(!nat.some((f) => f.selector === "#kit"), "a product-drawn tick box is not reported");
  assert.ok(nat.some((f) => f.selector === "#os"), "the system tick box still is");
  // a focus ring that fades in over 300 ms is a visible focus style, not "identical to unfocused"; no style at all still fails
  await page.goto("data:text/html," + encodeURIComponent('<style>button{transition:all .3s}#a:focus-visible{box-shadow:0 0 0 3px #7a5a00}#b:focus{outline:none}</style><button id="a">Ring</button> <button id="b">None</button>'));
  const foc = await checks.focusVisible(page, 2);
  assert.ok(!foc.some((f) => /Ring/.test(f.where)), `a ring drawn through a transition counts: ${JSON.stringify(foc)}`);
  assert.ok(foc.some((f) => /None/.test(f.where)), "a button with no focus style still fails");
  console.log("checks-runtime: ok");
} finally {
  await browser.close();
}
