// lib/route-map.js: a changed component reaches the pages that render it; dynamic segments get a real URL
// from sampleParams or the crawl, or are reported as not reachable (the plinth miss, 2026-10).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import assert from "node:assert/strict";
import { pagesReached, concreteRoute, templateOf } from "../lib/route-map.js";

const d = mkdtempSync(join(tmpdir(), "bs-rm-"));
const files = {
  "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./*"]}}}',
  "app/layout.tsx": "export default function L({children}){return children}",
  "app/page.tsx": 'import { Hero } from "@/components/hero"; export default function P(){return <Hero/>}',
  "app/[game]/gallery/page.tsx": 'import { Controls } from "@/components/gallery"; export default function G(){return <Controls/>}',
  "app/(shop)/[game]/item/[id]/page.tsx": "export default function I(){return null}",
  "app/docs/[[...slug]]/page.tsx": "export default function D(){return null}",
  "components/gallery/index.ts": 'export { Controls } from "./controls";',
  "components/gallery/controls.tsx": 'import { Select } from "../ui/select"; export function Controls(){return <Select/>}',
  "components/ui/select.tsx": "export function Select(){return <select/>}",
  "components/hero.tsx": "export function Hero(){return null}",
};
for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); }
const all = Object.keys(files);
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}\n`, e.message); process.exitCode = 1; } };

t("templates drop route groups and keep dynamic segments", () => {
  assert.equal(templateOf("app/(shop)/[game]/item/[id]/page.tsx"), "/[game]/item/[id]");
  assert.equal(templateOf("app/page.tsx"), "/");
  assert.equal(templateOf("components/x.tsx"), null);
});
t("a kit component reaches the page through a feature component and a barrel", () => {
  const r = pagesReached(d, ["components/ui/select.tsx"], all);
  assert.deepEqual(r.templates, ["/[game]/gallery"]);
  assert.equal(r.layoutWide, false);
});
t("a layout change is layout-wide", () => assert.equal(pagesReached(d, ["app/layout.tsx"], all).layoutWide, true));
t("dynamic segment from sampleParams", () => assert.equal(concreteRoute("/[game]/gallery", { sampleParams: { game: "tf2" } }), "/tf2/gallery"));
t("dynamic segment from the crawl", () => assert.equal(concreteRoute("/[game]/item/[id]", { crawled: ["/", "/tf2/gallery", "/tf2/item/abc"] }), "/tf2/item/abc"));
t("unknown value is null (reported, not skipped)", () => assert.equal(concreteRoute("/[game]/gallery", { crawled: ["/", "/about"] }), null));
t("optional catch-all matches its bare prefix", () => assert.equal(concreteRoute("/docs/[[...slug]]", { crawled: ["/docs"] }), "/docs"));
rmSync(d, { recursive: true, force: true });
if (!process.exitCode) console.log(`route-map: ${n} cases passed`);
