// FM16 every role has its own door (lib/role-auth.js + playwright/checks/role-auth.js) on fixture pages in
// test/fixtures/role-auth: the Guildhall case (an "Apply as a specialist" door onto the customer sign-in, word for
// word) fails; a specialist sign-in with its own heading, lead, panel and "New here?" passes; a page that looks
// different but sends "New here?" to the customer sign-up and never names the role fails on exactly those two.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import { roleAuthConfig, entryRegex, entryRole, similarity, compareAuthSurfaces, customerAdvertisesRole, namesRole } from "../lib/role-auth.js";
import { roleDoors, roleEntries, authSurface } from "../playwright/checks/role-auth.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "role-auth");
const BASE = "http://bs.test/";
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${String(e.message).split("\n").join("\n    ")}`); }
}
const show = (l) => JSON.stringify(l.map((f) => `${f.soft ? "~" : ""}${f.what.slice(0, 160)}`), null, 1);

/* ───── pure ───── */
await test("the door words: Apply as / Become a / Work with us / For specialists / Engineer portal — not a coupon's Apply", () => {
  const re = entryRegex();
  for (const t of ["Apply as a specialist", "Become an engineer", "Work with us", "For assistants", "Engineer portal", "Join as a reviewer", "Join our crew", "Are you a tutor?", "Sign up as a partner", "Apply"])
    assert.ok(re.test(t), t);
  for (const t of ["Apply coupon", "Get started", "Sign in", "Pricing", "Join now", "Open your hall", "Apply filters"])
    assert.ok(!re.test(t), t);
});
await test("the role of a door: from its words, its link, the page it reached; a customer noun is the customer", () => {
  assert.equal(entryRole({ text: "Apply as a specialist" }), "specialist");
  assert.equal(entryRole({ text: "Become one of our engineers" }), "engineer");
  assert.equal(entryRole({ text: "For assistants" }), "assistant");
  assert.equal(entryRole({ text: "Work with us", href: "/signin?role=specialist" }), "specialist");
  assert.equal(entryRole({ text: "Work with us", href: "/careers", landing: "Become a Guildhall specialist" }), "specialist");
  assert.equal(entryRole({ text: "Join as a customer" }), "customer");
  assert.equal(entryRole({ text: "Work with us", href: "/team" }), null);
});
await test("config: role names from roles[] (not admin), extra entry words, thresholds", () => {
  const rc = roleAuthConfig({ roles: [{ name: "admin" }, { name: "scout" }], forms: { roleAuth: { entryText: ["\\bscout hub\\b"], maxSimilarity: 0.7 } } });
  assert.ok(rc.roleWords.includes("scout") && !rc.roleWords.includes("admin"));
  assert.ok(rc.entryRe.test("Scout hub") && rc.entryRe.test("For scouts"));
  assert.equal(rc.maxSimilarity, 0.7);
});
await test("similarity: the same page is 1, a role page with its own words is far below 0.8", () => {
  assert.equal(similarity("Welcome back. Sign in to your hall", "Welcome back. Sign in to your hall"), 1);
  assert.ok(similarity("Welcome back Sign in to your hall Email Password", "Specialist sign-in Manage your schedule and payouts Email Password") < 0.5);
  assert.equal(similarity("", ""), 0);
  assert.ok(namesRole("Specialists sign in", "specialist") && !namesRole("Special offer", "specialist"));
});
const cust = { path: "/signin", title: "Sign in · Guildhall", heading: "Welcome back", lead: "Sign in to your hall to see your bookings.", eyebrow: "", aside: "Book trusted specialists for every job around the house. Pay only when the work is done and you are happy with it.", body: "Book trusted specialists for every job around the house. Pay only when the work is done and you are happy with it. Welcome back Sign in to your hall to see your bookings. Email Password Sign in New here? Open your hall", kind: "signIn", switchLink: { text: "Open your hall", href: "/signup" } };
await test("compare: the Guildhall door — same words, no role named, customer panel, customer sign-up link, same title", () => {
  const out = compareAuthSurfaces(cust, { ...cust, path: "/signin?role=specialist" }, { role: "specialist", entry: { text: "Apply as a specialist", from: "/" } });
  assert.equal(out.length, 5, show(out));
  assert.ok(/is the customer sign-in page \/signin again: 100%/.test(out[0].what), show(out));
  assert.ok(out.some((f) => /neither the heading/.test(f.what)) && out.some((f) => /customer side panel/.test(f.what)) && out.some((f) => /"Open your hall" leads to \/signup/.test(f.what)) && out.some((f) => f.soft && /<title>/.test(f.what)), show(out));
});
await test("compare: the specialist's own sign-in passes", () => {
  const role = { path: "/specialists/signin", title: "Specialist sign-in · Guildhall", heading: "Specialist sign-in", lead: "Manage your schedule, quotes and payouts.", eyebrow: "For specialists", aside: "Choose the jobs you take and set your own rates. Payouts land in your account every Friday.", body: "Choose the jobs you take and set your own rates. Payouts land in your account every Friday. For specialists Specialist sign-in Manage your schedule, quotes and payouts. Email Password Sign in Not a specialist yet? Apply to join", kind: "signIn", switchLink: { text: "Apply to join", href: "/specialists/apply" } };
  assert.deepEqual(compareAuthSurfaces(cust, role, { role: "specialist" }), []);
});
await test("customer side: a customer sign-in whose 'New here?' is the specialist application is a (soft) finding", () => {
  const out = customerAdvertisesRole({ ...cust, switchLink: { text: "Apply as a specialist", href: "/apply" } });
  assert.ok(out.length === 1 && out[0].soft, show(out));
  assert.deepEqual(customerAdvertisesRole(cust), []);
});

/* ───── in the browser ───── */
const browser = await chromium.launch({ channel: "chrome" });
const ctx0 = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.host !== "bs.test") return route.fulfill({ status: 404, body: "" });
    const file = join(FIX, u.pathname.replace(/^\//, ""));
    if (u.pathname !== "/" && existsSync(file)) return route.fulfill({ status: 200, contentType: "text/html", body: readFileSync(file) });
    return route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>Not found</title><h1>Not found</h1>" });
  });
  return ctx;
};
const open = async (path) => { const ctx = await ctx0(); const page = await ctx.newPage(); await page.goto(new URL(path.replace(/^\//, ""), BASE).href); return page; };
try {
  await test("reading a page: heading, lead, side panel, switch link, kind", async () => {
    const page = await open("customer-signin.html");
    const s = await authSurface(page);
    await page.context().close();
    assert.equal(s.heading, "Welcome back");
    assert.equal(s.lead, "Sign in to your hall to see your bookings.");
    assert.ok(/twelve thousand households/.test(s.aside), s.aside);
    assert.ok(s.isAuth && s.kind === "signIn" && s.switchLink?.text === "Open your hall", JSON.stringify(s.switchLink));
    const g = await open("role-signin-good.html");
    const sg = await authSurface(g);
    await g.context().close();
    assert.equal(sg.eyebrow, "For specialists");
  });
  await test("doors on a page: Apply as a specialist, Work with us — not a coupon's Apply, not Get started", async () => {
    const page = await open("home.html");
    const e = await roleEntries(page, roleAuthConfig({}).entryRe.source);
    await page.context().close();
    assert.deepEqual(e.map((x) => x.text).sort(), ["Apply as a specialist", "Join as a customer", "Work with us"]);
  });
  await test("Guildhall: the specialist door is the customer sign-in; Work with us → a landing → a page that sends New here to the customer sign-up", async () => {
    const r = await roleDoors(open, { customer: { signIn: "/customer-signin.html" }, pages: ["/home.html"], rc: roleAuthConfig({}) });
    const same = r.findings.filter((f) => /role-signin-same/.test(f.where));
    assert.ok(same.some((f) => /"Apply as a specialist" \(on \/home\.html\) → \/role-signin-same\.html\?role=specialist is the customer sign-in page/.test(f.what)), show(r.findings));
    assert.ok(same.some((f) => /customer side panel/.test(f.what)) && same.some((f) => /neither the heading/.test(f.what)), show(same));
    const half = r.findings.filter((f) => /role-signin-half/.test(f.where));
    assert.ok(half.some((f) => /"Open your hall" leads to \/signup/.test(f.what)) && half.some((f) => /neither the heading/.test(f.what)), show(half));
    assert.ok(!half.some((f) => /is the customer sign-in/.test(f.what) || /side panel/.test(f.what)), `its own words and panel: ${show(half)}`);
    assert.equal(r.checked, 2, "the customer's own 'Join as a customer' is not a role door");
  });
  await test("the specialist's own sign-in passes end to end", async () => {
    const r = await roleDoors(open, { customer: { signIn: "/customer-signin.html" }, pages: ["/home-good.html"], rc: roleAuthConfig({}) });
    assert.equal(r.checked, 1);
    assert.deepEqual(r.findings, [], show(r.findings));
  });
  await test("routes named in the config are compared even with no link to them", async () => {
    const r = await roleDoors(open, { customer: { signIn: "/customer-signin.html" }, pages: [], rc: roleAuthConfig({ forms: { roleAuth: { routes: [{ role: "specialist", signIn: "/role-signin-same.html" }] } } }) });
    assert.ok(r.checked === 1 && r.findings.length >= 3, show(r.findings));
  });
} finally {
  await browser.close();
}
if (failed) { console.log(`role-auth: ${failed} failed`); process.exit(1); }
console.log("role-auth: ok");
