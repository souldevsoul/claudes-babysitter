// `e2e --changed` route mapper (lib/affected-routes.js): a changed file → the routes whose page imports it, through
// tsconfig paths aliases, re-export barrels, relative imports, next/dynamic import(), a nested layout (its subtree);
// global inputs (global CSS, the UI kit, root / group layouts, header, middleware, package.json, config) and any file
// the graph cannot place → every route; message files → the routes using the namespaces whose keys changed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { affectedRoutes, explainSelection, resolveSpec, aliases } from "../lib/affected-routes.js";

const repo = mkdtempSync(join(tmpdir(), "bs-affected-"));
const w = (f, s) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), s); };
const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
w("package.json", '{"name":"shop","dependencies":{"next":"15"}}');
w("tsconfig.json", `{
  // comments are fine
  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], "@ui/*": ["./src/components/ui/*"], "~lib": ["./src/lib/index.ts"] } },
}`);
w("src/app/layout.tsx", 'import "./globals.css";\nimport { Header } from "@/components/header";\nexport default function L({ children }) { return <html><body><Header />{children}</body></html>; }\n');
w("src/app/globals.css", "body{margin:0}\n");
w("src/components/header.tsx", 'export function Header() { return <header>shop</header>; }\n');
w("src/app/(marketing)/page.tsx", 'import { Hero } from "@/components/hero";\nimport { useTranslations } from "next-intl";\nexport default function P() { const t = useTranslations("Home"); return <Hero title={t("title")} />; }\n');
w("src/components/hero.tsx", 'import { Badge } from "./hero-badge";\nexport function Hero({ title }) { return <h1>{title}<Badge /></h1>; }\n');
w("src/components/hero-badge.tsx", "export function Badge() { return <span>new</span>; }\n");
w("src/components/index.ts", 'export * from "./price-card";\nexport { Hero } from "./hero";\n');
w("src/components/price-card.tsx", 'import { money } from "../lib/format";\nimport { Button } from "@ui/button";\nexport function PriceCard() { return <div>{money(1)}<Button /></div>; }\n');
w("src/components/ui/button.tsx", "export function Button() { return <button />; }\n");
w("src/lib/format.ts", "export const money = (n) => `$${n}`;\n");
w("src/lib/index.ts", 'export * from "./format";\n');
w("src/lib/db.ts", "export const db = {};\n");
w("src/app/pricing/page.tsx", 'import { PriceCard } from "@/components";\nimport { useTranslations } from "next-intl";\nexport default function P() { const t = useTranslations("Pricing"); return <PriceCard label={t("x")} />; }\n');
w("src/app/dashboard/layout.tsx", "export default function L({ children }) { return <section>{children}</section>; }\n");
w("src/app/dashboard/page.tsx", "export default function P() { return <p>dash</p>; }\n");
w("src/app/dashboard/settings/page.tsx", 'import { money } from "~lib";\nexport default function P() { return <p>{money(2)}</p>; }\n');
w("src/app/blog/[slug]/page.tsx", 'import dynamic from "next/dynamic";\nconst Chart = dynamic(() => import("@/components/chart"));\nexport default function P() { return <Chart />; }\n');
w("src/components/chart.tsx", "export default function Chart() { return <svg />; }\n");
w("src/components/dead.tsx", "export function Dead() { return null; }\n");
w("src/app/api/orders/route.ts", 'import { db } from "@/lib/db";\nexport async function GET() { return Response.json(db); }\n');
w("src/app/help/page.tsx", "export default async function P({ params }) { const m = await import(`../../content/${params.topic}.mdx`); return <m.default />; }\n");
w("src/content/billing.mdx", "# Billing\n");
w("pages/legacy.tsx", "export default function P() { return <p>old</p>; }\n");
w("messages/en.json", JSON.stringify({ Home: { title: "Shop" }, Pricing: { x: "Plans" } }, null, 2));
w("README.md", "# shop\n");
w("data/plans.yaml", "a: 1\n");
git("init", "-q", "-b", "main");
git("add", "-A");
execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
const base = git("rev-parse", "HEAD").trim();
const routes = ["/", "/pricing", "/dashboard", "/dashboard/settings", "/blog/hello", "/help", "/legacy", "/only-crawled"].map((path) => ({ path, auth: path.startsWith("/dashboard"), ...(path.startsWith("/dashboard") ? { role: "admin" } : {}) }));
const sel = (changed) => affectedRoutes(repo, { base, changed, routes });
const paths = (r) => r.routes.map((x) => x.path).sort();
let failed = 0;
const t = (name, fn) => { try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n${e.stack || e}`); } };
const ALWAYS = "/only-crawled"; // no page file maps to it: always checked

t("aliases: tsconfig paths with comments and trailing commas, wildcard and exact entries, baseUrl", () => {
  const al = aliases(repo);
  assert.equal(resolveSpec(repo, "src/app/pricing/page.tsx", "@/components", al), "src/components/index.ts");
  assert.equal(resolveSpec(repo, "src/x.tsx", "@ui/button", al), "src/components/ui/button.tsx");
  assert.equal(resolveSpec(repo, "src/x.tsx", "~lib", al), "src/lib/index.ts");
  assert.equal(resolveSpec(repo, "src/x.tsx", "src/lib/db", al), "src/lib/db.ts", "baseUrl");
});
t("a component two imports below a page selects that page's route only", () => {
  const r = sel(["src/components/hero-badge.tsx"]);
  assert.equal(r.all, false);
  // hero is re-exported by the components barrel, which /pricing imports: the barrel pulls it into /pricing too
  assert.deepEqual(paths(r), ["/", "/pricing", ALWAYS].sort());
  assert.match(r.routes.find((x) => x.path === "/").why, /hero-badge\.tsx → src\/components\/hero\.tsx → src\/app\/\(marketing\)\/page\.tsx/);
});
t("re-export barrel: a component behind `export * from` reaches the page that imports the barrel", () => {
  assert.deepEqual(paths(sel(["src/components/price-card.tsx"])), ["/pricing", ALWAYS].sort());
});
t("an alias to a file (~lib) and a relative import both lead up to their pages", () => {
  assert.deepEqual(paths(sel(["src/lib/format.ts"])), ["/dashboard/settings", "/pricing", ALWAYS].sort());
});
t("next/dynamic import() is followed", () => assert.deepEqual(paths(sel(["src/components/chart.tsx"])), ["/blog/hello", ALWAYS].sort()));
t("import() with a template path: a file under its folder reaches the page", () => assert.deepEqual(paths(sel(["src/content/billing.mdx"])), ["/help", ALWAYS].sort()));
t("a nested layout selects its subtree, with every role", () => {
  const r = sel(["src/app/dashboard/layout.tsx"]);
  assert.deepEqual(paths(r), ["/dashboard", "/dashboard/settings", ALWAYS].sort());
  assert.ok(r.routes.every((x) => x.path === ALWAYS || x.role === "admin"));
});
t("a pages/ router page selects its route", () => assert.deepEqual(paths(sel(["pages/legacy.tsx"])), ["/legacy", ALWAYS].sort()));
t("a file no page imports selects nothing (but a crawled route with no page file is still checked)", () => assert.deepEqual(paths(sel(["src/components/dead.tsx"])), [ALWAYS]));
t("docs and tests do not render: nothing selected", () => assert.deepEqual(paths(sel(["README.md", "src/components/hero.test.tsx"])), [ALWAYS]));
for (const [file, why] of [
  ["src/app/globals.css", /global CSS/], ["src/components/ui/button.tsx", /UI kit/], ["src/app/layout.tsx", /root \/ group layout/],
  ["src/components/header.tsx", /header \/ footer \/ navigation/], ["src/middleware.ts", /middleware/], ["package.json", /dependencies/],
  ["package-lock.json", /dependencies/], ["next.config.mjs", /next\.config/], ["babysitter.config.json", /babysitter\.config/], ["tailwind.config.ts", /tailwind/],
  ["src/lib/db.ts", /API route/], ["data/plans.yaml", /cannot place|not in the import graph/], ["src/styles/tokens.ts", /theme \/ tokens/],
]) t(`global widening: ${file} → every route`, () => { const r = sel([file]); assert.equal(r.all, true, explainSelection(r)); assert.equal(r.routes.length, routes.length); assert.match(r.why.join("\n"), why); });
t("a group layout (app/(marketing)/layout) widens to every route", () => { w("src/app/(marketing)/layout.tsx", "export default function L({children}){return children}\n"); assert.equal(sel(["src/app/(marketing)/layout.tsx"]).all, true); });
t("a deleted source file → every route", () => assert.equal(sel(["src/components/gone.tsx"]).all, true));
t("messages: a changed key selects the routes using its namespace; an unknown namespace → every route", () => {
  w("messages/en.json", JSON.stringify({ Home: { title: "Shop" }, Pricing: { x: "Our plans" } }, null, 2));
  assert.deepEqual(paths(sel(["messages/en.json"])), ["/pricing", ALWAYS].sort());
  w("messages/en.json", JSON.stringify({ Home: { title: "Shop" }, Pricing: { x: "Plans" }, Footer: { y: "new" } }, null, 2));
  const r = sel(["messages/en.json"]);
  assert.equal(r.all, true, explainSelection(r));
  assert.match(r.why.join("\n"), /Footer/);
  w("messages/en.json", JSON.stringify({ Home: { title: "Shop" }, Pricing: { x: "Plans" } }, null, 2));
  assert.deepEqual(paths(sel(["messages/en.json"])), [ALWAYS], "no key changed");
});
t("the default diff: committed since base + uncommitted + untracked", () => {
  w("src/components/hero-badge.tsx", "export function Badge() { return <span>newer</span>; }\n");
  const r = affectedRoutes(repo, { base, routes });
  assert.ok(r.files.some((f) => f.file === "src/components/hero-badge.tsx"), JSON.stringify(r.files));
  assert.ok(r.files.some((f) => f.file === "src/app/(marketing)/layout.tsx"), "untracked file");
});
t("explainSelection names every route and why", () => {
  const s = explainSelection(sel(["src/components/chart.tsx"]));
  assert.match(s, /\/blog\/hello ← src\/components\/chart\.tsx → src\/app\/blog\/\[slug\]\/page\.tsx/);
  assert.match(s, /\/only-crawled ← no page file maps to this route/);
});
rmSync(repo, { recursive: true, force: true });
if (failed) process.exit(1);
console.log("affected routes: ok");
