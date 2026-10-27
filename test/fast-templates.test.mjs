// 5.7.1 (часть) — выборка шаблонов для --fast. Выделено из fixes-571, чтобы правка уехала со своим
// доказательством; остальные пункты 5.7.1 пока не восстановлены.
// 5.7.1 — what the first run of 5.7.0 on a real product (an app-router site, 52 routes, 3 roles) got wrong. Each case
// fails on 5.7.0 and passes on 5.7.1:
//   1. a product with its own Playwright specs (another @playwright/test copy) under e2e/: they were all loaded into the
//      "product" project, "Requiring @playwright/test second time" stopped the run and every suite was NOT RUN
//   2. --fast sampled 768 on "one route per template" where every page.tsx was a template (52 of 52)
//   3. M2 / the money check decided "sells credits" page by page from the word "credit": a skip and a failure at once
//   4. three counts for one set of findings (Playwright tests, checks, fix-plan "failed tests"), none labelled
//   5. text of neighbouring inline elements glued ("BRANDTERMS OF SERVICE") by textContent / innerText
//   6. error codes, curl lines and code blocks read as copy by the copy rules and Jev
//   7. 6.4 items that said only "11px", one per element
//   +  a quoted heading with line breaks split a finding; "look at" hints from notes and tests; Jev questions that do
//      not fit legal pages
// RUN: node test/fixes-571.test.mjs   (one browser, for the cases that render a page)
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { ...process.env, CI: "", GITHUB_ACTIONS: "", BABYSITTER_NO_VERSION_CHECK: "1" };
let n = 0, failed = 0;
async function t(name, fn) { try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } }
const dirs = [];
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), `bs-571-${p}-`)); dirs.push(d); return d; };
const put = (root, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); } };
const show = (x) => JSON.stringify(x, null, 1);

const { classifySpecs, testMatchFor } = await import("../lib/product-specs.js").catch(() => ({}));
const { summarize } = await import("../lib/run-summary.js");

/* ───────── 1. the product's own Playwright specs ───────── */
await t("2 --fast: templates are layout + page frame from the repo — 28 routes of an app-router site → 7 at 768, each listed", async () => {
  const { pageFamilies } = await import("../lib/page-templates.js");
  const { buildFastPlan, describeFastPlan } = await import("../lib/fast-plan.js");
  const r = tmp("tpl");
  const pass = 'export const metadata = { title: "x" };\nexport default function L({ children }) {\n  return <>{children}</>;\n}\n';
  const page = (imports, body = "<main />") => `${imports}\nexport default function P() {\n  return ${body};\n}\n`;
  const legal = page('import { LegalDocument } from "@/components/legal/legal-document";');
  const hero = page('import { PageHero } from "@/components/page-hero";\nimport { Money } from "@/components/currency";');
  const dash = (extra = "") => page(`import { Breadcrumb, PageHeading } from "@/components/dashboard/chrome";\nimport { Button } from "@/components/ui/button";${extra}`);
  const admin = page('import { AdminPageHeader } from "../_components/page-header";\nimport { prisma } from "@/lib/prisma";');
  const authLayout = 'import { AuthHeader } from "@/components/auth-header";\nexport default function L({ children }) {\n  return (\n    <>\n      <AuthHeader />\n      {children}\n    </>\n  );\n}\n';
  const files = {
    "package.json": "{}",
    "src/app/layout.tsx": 'export default function R({ children }) { return <html><body><Nav />{children}<Footer /></body></html>; }\n',
    "src/app/page.tsx": page('import { Hero } from "@/components/home/rail";'),
    "src/app/blog/[slug]/page.tsx": page('import { getPost } from "@/lib/blog";'),
    "src/app/dashboard/layout.tsx": 'export default async function D({ children }) {\n  const s = await getSession();\n  return <div className="min-h-screen">{children}</div>;\n}\n',
    "src/app/admin/layout.tsx": 'export default async function A({ children }) {\n  return <div className="console"><AdminNav />{children}</div>;\n}\n',
  };
  for (const p of ["terms", "privacy", "cookies", "refund", "aml-policy"]) files[`src/app/${p}/page.tsx`] = legal;
  for (const p of ["about", "pricing", "docs", "faq", "contact"]) files[`src/app/${p}/page.tsx`] = hero;
  for (const p of ["sign-in", "sign-up", "forgot-password"]) { files[`src/app/${p}/page.tsx`] = page('import { Input } from "@/components/ui/input";'); files[`src/app/${p}/layout.tsx`] = authLayout; }
  for (const p of ["", "billing", "deploy", "profile", "requests", "requests/[id]"]) { files[`src/app/dashboard${p ? `/${p}` : ""}/page.tsx`] = dash(); if (p && !p.includes("[")) files[`src/app/dashboard/${p}/layout.tsx`] = pass; }
  for (const p of ["", "users", "users/[id]", "billing"]) files[`src/app/admin${p ? `/${p}` : ""}/page.tsx`] = admin;
  put(r, files);
  spawnSync("git", ["init", "-q"], { cwd: r });
  const fam = pageFamilies(r);
  const routes = [
    { path: "/", auth: false }, ...["terms", "privacy", "cookies", "refund", "aml-policy", "about", "pricing", "docs", "faq", "contact", "sign-in", "sign-up", "forgot-password"].map((p) => ({ path: `/${p}`, auth: false })),
    { path: "/blog/first-post", template: "/blog/[slug]", auth: false },
    ...["", "/billing", "/deploy", "/profile", "/requests"].map((p) => ({ path: `/dashboard${p}`, auth: true })), { path: "/dashboard/requests/r1", template: "/dashboard/requests/[id]", auth: true },
    ...["", "/billing", "/deploy"].map((p) => ({ path: `/dashboard${p}`, auth: true, role: "admin" })),
    ...["", "/users", "/billing"].map((p) => ({ path: `/admin${p}`, auth: true, role: "admin" })), { path: "/admin/users/u1", template: "/admin/users/[id]", auth: true, role: "admin" },
  ];
  assert.equal(routes.length, 28);
  const plan = buildFastPlan(routes, [], { families: fam });
  assert.deepEqual(plan.midRoutes, ["public /", "public /terms", "public /about", "public /sign-in", "public /blog/first-post", "user /dashboard", "admin /admin"], show(plan.templates));
  const line = describeFastPlan(plan);
  assert.match(line, /^768 on 7 of 28 route\(s\), one per page template \(layout \+ page frame, from the repo\): \/ · \/terms \(\+4 like it\) · \/about \(\+4 like it\) · \/sign-in \(\+2 like it\) · \/blog\/first-post · \[user\] \/dashboard \(\+8 like it\) · \[admin\] \/admin \(\+3 like it\)$/, line);
  // the skip reason of a page left out at 768 names the page its template is checked on
  const f = join(r, "plan.json");
  writeFileSync(f, JSON.stringify(plan));
  process.env.BABYSITTER_FAST = "1"; process.env.BABYSITTER_FAST_PLAN = f;
  const { fastSkip } = await import(`../lib/fast-plan.js?x=${Date.now()}`);
  assert.match(fastSkip({ path: "/privacy", auth: false }, "tablet-768"), /7 of 28\); this page's template is checked on \/terms \[by design scope\]/);
  delete process.env.BABYSITTER_FAST; delete process.env.BABYSITTER_FAST_PLAN;
});

/* ───────── 3. one money model ───────── */
