// 5.6.3: CT1 reads product-status negation in any word order and every shipped language; `check --changed` measures a
// copy change against the whole site; seven false alarms of a review product. Every case here fails on 5.6.2.
// Fixtures are neutral: "Acme" is the product, the phrases come from a fine-tuning product and a review product.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import * as R from "../lib/content-rules.js";
import { notYet, LEXICON, CT1_LOCALES } from "../lib/not-yet.js";
import { lintContent, lintFileText, detectDateFormat } from "../lib/content-lint.js";
import { pathLabelJsx } from "../lib/copy-rules.js";
import { termDrift } from "../lib/content-consistency.js";
import { summarize } from "../lib/run-summary.js";

const here = dirname(fileURLToPath(import.meta.url));
const CHECK = join(here, "..", "bin", "ui-check.mjs");
let failed = 0, n = 0;
async function t(name, fn) { try { await fn(); n++; } catch (e) { failed++; console.error(`✗ ${name}\n  ${e.message.split("\n").join("\n  ")}`); } }
const lint = (text, kind = "body", ctx = {}, extra = {}) => R.lintSegment({ text, kind, ...extra }, R.CONTENT_DEFAULTS, ctx);
const ids = (l, rule) => l.filter((x) => x.rule === rule);
const fires = (text, rule = "content/unfinished", kind, ctx, extra) => assert.ok(ids(lint(text, kind, ctx, extra), rule).length, `"${text}" should fire ${rule}`);
const quiet = (text, rule = "content/unfinished", kind, ctx, extra) => { const l = ids(lint(text, kind, ctx, extra), rule); assert.ok(!l.length, `"${text}" should NOT fire ${rule}: ${l.map((x) => x.what).join(" | ")}`); };
const repo = (files) => {
  const d = mkdtempSync(join(tmpdir(), "bs563-"));
  for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); }
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: d });
  return d;
};
const page = (body) => `export default function P() {\n  return (\n    <main>\n${body}\n    </main>\n  );\n}\n`;

/* ═════ Gap 1: CT1 product-status negation ═════ */
await t("CT1 not-yet copy phrased any way round fires (the phrases a fine-tuning product shipped)", () => {
  for (const s of [
    "Email delivery is not enabled on Acme yet, so no code was sent to you@acme.test",
    "Acme sends no email yet, so a reset link can't reach you.",
    "Email delivery is not configured yet, so we cannot notify you by email about a new sign-in.",
    "Acme has no support mailbox yet, so this form is the way to reach us.",
    "No base model open on this tier yet",
    "Full fine-tune is not open yet.",
    "We do not currently collect identity documents.",
    "Card payments are not available for now.",
  ]) fires(s);
  fires("What we don't do yet", undefined, "heading");
  fires("not open yet", undefined, "body");
  fires("Base model 8B · not open yet");
});
await t("CT1 'temporarily unavailable' is page copy everywhere but the payment dialog, the pay button and its error", () => {
  fires("Card top-up is temporarily unavailable. Please try again later.");
  fires("We accept Visa and Mastercard; card top-up is temporarily unavailable.");
  fires("Card Top-Up Is Temporarily Unavailable", undefined, "heading");
  quiet("Card top-up is temporarily unavailable. Please try again later.", undefined, "body", { payUi: true });
  quiet("Top-up temporarily unavailable", undefined, "button");
  quiet("Card top-up is temporarily unavailable.", undefined, "body", {}, { dialog: true });
  assert.ok(R.payUiFile("src/components/topup-modal.tsx") && R.payUiFile("components/CheckoutDialog.tsx") && R.payUiFile("components/pay-button.tsx"));
  assert.ok(!R.payUiFile("src/app/payment-policy/page.tsx") && !R.payUiFile("src/app/terms/page.tsx") && !R.payUiFile("src/app/pricing/page.tsx"));
  assert.ok(R.payUiKey("billing.topUpDialog.unavailable") && !R.payUiKey("legal.payment.body") && !R.payUiKey("faq.topup.answer"));
});
await t("CT1 empty states, the reader's own state, a process still running, transient errors and 'yet' as 'but' stay quiet", () => {
  for (const s of ["No runs yet.", "No messages yet.", "No activity yet", "No billing events yet.", "Nothing here yet", "There are no invoices yet.",
    "Weights aren't ready for this run yet", "This base model cannot be deployed yet.", "Your payment hasn't been confirmed yet.",
    "Today's rate isn't available yet, try again in a minute.", "The export isn't available yet. Refresh the page in a moment.",
    "You haven't added a dataset yet.", "Don't have an account yet? Sign up", "Not a member yet?", "Haven't received the code yet? Resend it",
    "Simple, yet powerful.", "Fast and yet careful", "Not yet", "We help you launch in minutes."]) quiet(s);
});
await t("CT1 reads every shipped language: one not-yet phrase fires, one empty state stays quiet", () => {
  const cases = {
    ru: ["Отправка писем пока не подключена.", "Пока нет запусков"],
    uk: ["Надсилання листів ще не підключено.", "Поки що немає запусків"],
    bg: ["Изпращането на имейли все още не е включено.", "Все още няма съобщения"],
    kk: ["Электрондық пошта әлі қосылмаған.", "Әзірге хабарлама жоқ"],
    ky: ["Кат жөнөтүү азырынча иштебейт.", "Азырынча билдирүүлөр жок"],
    az: ["E-poçt göndərilməsi hələ qoşulmayıb.", "Hələ mesaj yoxdur"],
    fr: ["Les paiements par carte ne sont pas encore activés.", "Aucun message pour l'instant"],
    de: ["Der E-Mail-Versand ist noch nicht eingerichtet.", "Noch keine Läufe"],
    es: ["El envío de correos todavía no está activado.", "Todavía no hay ejecuciones"],
    pt: ["O envio de e-mails ainda não está ativado.", "Ainda não há execuções"],
    it: ["L'invio delle email non è ancora attivo.", "Ancora nessun messaggio"],
    sk: ["Odosielanie e-mailov zatiaľ nie je zapnuté.", "Zatiaľ žiadne správy"],
    sl: ["Pošiljanje e-pošte še ni omogočeno.", "Še ni zagonov"],
    el: ["Η αποστολή email δεν είναι ακόμα ενεργοποιημένη.", "Δεν υπάρχουν μηνύματα ακόμα"],
    ar: ["إرسال البريد غير مفعل بعد.", "لا توجد رسائل بعد"],
    ja: ["メール送信はまだ有効になっていません。", "まだ実行はありません"],
  };
  for (const [loc, [pos, empty]] of Object.entries(cases)) {
    assert.ok(notYet(pos, { locale: loc }), `${loc}: "${pos}" should fire`);
    assert.ok(notYet(pos), `${loc}: "${pos}" should fire with the locale unknown (read by its letters / words)`);
    assert.equal(notYet(empty, { locale: loc }), null, `${loc}: "${empty}" is an empty state`);
    fires(pos, "content/unfinished", "body", {}, { locale: loc });
  }
  for (const [loc, s] of Object.entries({ ru: "Оплата временно недоступна.", fr: "Le paiement est temporairement indisponible.", de: "Die Zahlung ist vorübergehend nicht verfügbar.", es: "El pago está temporalmente no disponible.", pt: "O pagamento está temporariamente indisponível.", it: "Il pagamento è temporaneamente non disponibile.", uk: "Оплата тимчасово недоступна." }))
    assert.equal(notYet(s, { locale: loc })?.kind, "temporarily", `${loc}: ${s}`);
  assert.deepEqual(Object.keys(cases).sort(), CT1_LOCALES.filter((l) => l !== "en").sort(), "a test for every lexicon");
  assert.ok(Object.values(LEXICON).every((lx) => lx.neg && lx.when && lx.temp && lx.empty && lx.status && lx.you && lx.process));
});

await t("CT1 static: page copy, a conditional prop, a lib constant fire; the dialog, an API route, server code, a shared stub constant and comments do not", async () => {
  const d = repo({
    "package.json": "{}",
    "src/app/terms/page.tsx": page(`      <p>We accept Visa and Mastercard; card top-up is temporarily unavailable.</p>\n      {/* not live yet: switch on when the gateway is live */}\n      <p>No runs yet.</p>`),
    "src/app/verify/page.tsx": `export default function V({ sent, email }) {\n  return <Shell title="Confirm" subtitle={sent === false ? \`Email delivery is not enabled on Acme yet, so no code was sent to \${email}.\` : \`We sent a code to \${email}.\`} />;\n}\n`,
    "src/components/topup-modal.tsx": `export function TopUpModal() {\n  // Card top-up is temporarily unavailable: Pay is a stub\n  return <div role="dialog"><p>Card top-up is temporarily unavailable. Please try again later.</p></div>;\n}\n`,
    "src/lib/legal-note.ts": `export const CONTACT_NOTE = "Acme has no support mailbox yet, so this form is the way to reach us.";\n`,
    "src/lib/payments.ts": `export const CARD_TOPUP_MESSAGE = "Card top-up is temporarily unavailable. Please try again later.";\n`,
    "src/lib/run-http.ts": `import { NextResponse } from "next/server";\nexport const T = { MODEL_NOT_OPEN: [409, "This base model is not open for runs yet."] };\n`,
    "src/app/api/runs/route.ts": `export async function GET() { return Response.json({ error: "Streaming is not supported yet; send stream: false." }); }\n`,
    "src/lib/engine/gateway.ts": `export const x = { ok: false, error: "Streaming is not supported yet." };\n`,
  });
  try {
    const r = await lintContent(d, { dns: false, cfg: {} });
    const ct1 = r.problems.filter((p) => p.id === "CT1");
    const at = new Set(ct1.map((p) => p.file));
    assert.ok(at.has("src/app/terms/page.tsx"), "page copy");
    assert.ok(at.has("src/app/verify/page.tsx"), "a conditional prop");
    assert.ok(at.has("src/lib/legal-note.ts"), "a copy constant in lib/");
    for (const f of ["src/components/topup-modal.tsx", "src/lib/payments.ts", "src/lib/run-http.ts", "src/app/api/runs/route.ts", "src/lib/engine/gateway.ts"]) assert.ok(!at.has(f), `${f}: ${ct1.filter((p) => p.file === f).map((p) => p.message).join(" | ")}`);
    assert.equal(ct1.filter((p) => p.file === "src/app/terms/page.tsx").length, 1, "the comment is not copy, the empty state is fine");
    // the base-version linter (check --changed) sees the same strings
    assert.ok(lintFileText("src/lib/legal-note.ts", readFileSync(join(d, "src/lib/legal-note.ts"), "utf8")).some((p) => p.id === "CT1"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

await t("CT1 a language without a lexicon is not read — one soft notice per language, never silence", async () => {
  const d = repo({ "package.json": "{}", "messages/en.json": '{"a":"Hello there, friend"}', "messages/nl.json": '{"a":"Hallo daar, vriend"}', "messages/ru.json": '{"a":"Привет, друг"}' });
  try {
    const r = await lintContent(d, { dns: false, cfg: {} });
    const unread = r.soft.filter((x) => x.unread);
    assert.deepEqual(unread.map((x) => x.unread), ["nl"]);
    assert.match(unread[0].message, /CT1 does not read nl: not-yet copy in it is not checked/);
    assert.equal(r.problems.filter((p) => p.id === "CT1").length, 0, "soft, not blocking");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

/* ═════ seven false alarms of a review product ═════ */
await t("FP CT19 a role with its own qualifier ('tax and payroll specialist') is another role, not a name for 'reviewer'; content.roles says so too", () => {
  const T = (text, i) => ({ text, kind: "body", locale: "en", where: `src/app/p${i}/page.tsx:1`, file: `src/app/p${i}/page.tsx`, line: 1 });
  const rev = Array.from({ length: 6 }, (_, i) => T("A vetted reviewer will walk every flow and is paid per run.", i));
  const spec = [T("A named tax and payroll specialist reads the brief; you are matched with a vetted specialist.", 10), T("The tax and payroll specialists are paid per pack.", 11), T("Hire a tax and payroll specialist for the annual return.", 12)];
  assert.equal(termDrift([...rev, ...spec], {}).filter((g) => g.concept === "role").length, 0);
  const plain = [T("Hire a vetted specialist for the annual return.", 13)];
  assert.equal(termDrift([...rev, ...plain], {}).filter((g) => g.concept === "role").length, 1, "an unqualified other name still drifts");
  assert.equal(termDrift([...rev, ...plain], { roles: ["annual return specialist"] }).filter((g) => g.concept === "role").length, 0, "content.roles");
});
await t("FP CT1 'placeholder' as the product's own concept passes; template residue still fires", () => {
  for (const s of ["Every answer is a placeholder until a reviewer confirms it.", "The pack is signed once every claim is sourced or removed and no placeholder is left.", "Anything the brief does not say is left as a visible placeholder for you to confirm."]) quiet(s);
  for (const s of ["This is a placeholder", "Placeholder text", "placeholder"]) fires(s);
});
await t("FP CT2 the customer's own test account is not test data; 'Signed in as Test User' still is", () => {
  quiet("If a run needs a test account, say so in the brief.", "content/test-data");
  quiet("Any data your test account happened to be showing is deleted.", "content/test-data");
  fires("Signed in as Test User", "content/test-data");
});
await t("FP CT19 refund: a sentence that says 'refund' and 'returns the payment record' are not drift", () => {
  const T = (text, i) => ({ text, kind: "body", locale: "en", where: `p${i}:1`, file: `p${i}`, line: 1 });
  const base = Array.from({ length: 5 }, (_, i) => T("We refund the unused credit within 5 days.", i));
  assert.equal(termDrift([...base, T("A refund returns money to the card that paid for it.", 8), T("A processor takes card payments and returns the payment record to us.", 9)], {}).filter((g) => g.concept === "refund").length, 0);
  assert.equal(termDrift([...base, T("We return your money within 5 days.", 9)], {}).filter((g) => g.concept === "refund").length, 1, "a real other name still drifts");
});
await t("FP CT6 the site's own format is read from its formatter (en-GB long: '20 October 2026')", async () => {
  assert.equal(detectDateFormat(['return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });']), "D MMMM YYYY");
  assert.equal(detectDateFormat(['new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" })']), "MMMM D, YYYY");
  assert.equal(detectDateFormat(['x.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })']), "DD.MM.YYYY");
  assert.equal(detectDateFormat(['a.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })', 'b.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })']), null, "two formats: not guessed");
  const d = repo({ "package.json": "{}", "src/lib/format.ts": 'export const formatDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });\n', "src/app/privacy/page.tsx": page("      <p>Last updated 13 October 2026.</p>") });
  try {
    assert.equal((await lintContent(d, { dns: false, cfg: {} })).problems.filter((p) => p.rule === "content/date-format").length, 0);
    assert.equal((await lintContent(d, { dns: false, cfg: { content: { dateFormat: "DD.MM.YYYY" } } })).problems.filter((p) => p.rule === "content/date-format").length, 1, "an explicit format still decides");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
await t("FP CT8 a code identifier or a scheme after a full stop, a '?' named in a sentence, '1 needs action'", () => {
  quiet("It has two honest moves instead. acknowledge_finding records the decision.", "content/grammar");
  quiet("Attach a note and a screenshot. get_retest_status returns the state.", "content/grammar");
  quiet("The deployed address a run starts from. http or https. Staging is fine.", "content/grammar");
  quiet("Parameters marked ? are optional. Every call returns JSON.", "content/grammar");
  quiet("5 passed, 2 need work, 1 needs action, each with a note.", "content/grammar");
  fires("Payment is charged. browse the full chart.", "content/grammar");
  fires("Is it ready ? Yes.", "content/grammar");
  fires("You have 1 items in the cart.", "content/grammar");
});
await t("FP CT12 the user's own URL as its link label is not a path label; {link.href} still is", () => {
  assert.equal(pathLabelJsx('<a href={project.siteUrl}>{project.siteUrl}</a>\n<a href={project.repoUrl}>{project.repoUrl}</a>').length, 0);
  assert.equal(pathLabelJsx("<Link href={item.href}>{item.href}</Link>").length, 1);
});

/* ═════ Gap 2: check --changed measures a copy change against the whole site ═════ */
const runCheck = (d, ...a) => spawnSync(process.execPath, [CHECK, "--repo", d, "--changed", "HEAD", ...a], { encoding: "utf8" });
await t("check --changed: clean for this change, and says how many copy findings the rest of the site has (never a bare 'clean')", () => {
  const d = repo({ "package.json": "{}", "src/app/a/page.tsx": page("      <p>Our team reads every brief.</p>"), "src/app/b/page.tsx": page("      <p>Acme sends no email yet, so a reset link can't reach you.</p>"), "src/app/c/page.tsx": page("      <p>Full fine-tune is not open yet.</p>") });
  try {
    writeFileSync(join(d, "src/app/a/page.tsx"), page("      <p>Our team reads every brief within a day.</p>"));
    const r = runCheck(d, "--format", "agent");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Claude's Babysitter: clean for this change; 2 copy finding\(s\) elsewhere on the site: run `.*babysitter\.mjs content`/);
    assert.doesNotMatch(r.stdout, /Babysitter: clean\.$/m);
    const j = JSON.parse(runCheck(d, "--format", "json").stdout);
    assert.equal(j.elsewhere.count, 2);
    assert.match(j.elsewhere.command, / content$/);
    // a change that is not copy (a CSS file) runs no site-wide pass
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm a", { cwd: d });
    writeFileSync(join(d, "src/app/x.css"), "@layer components { .a { padding: var(--s-1); } }\n");
    assert.equal(JSON.parse(runCheck(d, "--format", "json").stdout).elsewhere.count, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
await t("check --changed: a site-wide finding the change caused on an unchanged page blocks; one the base already had does not", () => {
  const cfg = JSON.stringify({ content: { termGroups: { plan: ["workspace", "project space"] } } });
  const d = repo({ "package.json": "{}", "babysitter.config.json": cfg,
    "src/app/a/page.tsx": page("      <p>Open your workspace from the menu.</p>"),
    "src/app/b/page.tsx": page("      <p>Every team has a project space, and each project space has an owner.</p>") });
  try {
    // base: "project space" 2× (b), "workspace" 1× (a) — a was the odd one out. Now a says "workspace" three times: the
    // majority flips, and b's "project space" (unchanged) is the odd one out because of this change
    writeFileSync(join(d, "src/app/a/page.tsx"), page("      <p>Open your workspace from the menu. A workspace keeps runs; each workspace has an owner.</p>"));
    const r = JSON.parse(runCheck(d, "--format", "json").stdout);
    const cross = r.problems.filter((p) => p.file === "src/app/b/page.tsx");
    assert.ok(cross.length && cross.every((p) => p.rule === "content/term-drift" && /your change made it differ/.test(p.message)), JSON.stringify(r.problems));
    // the same drift already in the base (b unchanged, a unchanged elsewhere): a change that leaves the terms alone does not own it
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm a", { cwd: d });
    mkdirSync(join(d, "src/app/c"), { recursive: true }); writeFileSync(join(d, "src/app/c/page.tsx"), page("      <p>Read the guide before you start.</p>"));
    const r2 = JSON.parse(runCheck(d, "--format", "json").stdout);
    assert.equal(r2.problems.filter((p) => p.file === "src/app/b/page.tsx").length, 0, JSON.stringify(r2.problems));
    assert.ok(r2.elsewhere.count >= 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
await t("pre-commit hook: a clean commit passes and prints the site's copy notice; the Stop hook gets it as a systemMessage", () => {
  const d = repo({ "package.json": "{}", "src/app/a/page.tsx": page("      <p>Our team reads every brief.</p>"), "src/app/b/page.tsx": page("      <p>Full fine-tune is not open yet.</p>") });
  try {
    writeFileSync(join(d, "src/app/a/page.tsx"), page("      <p>Our team reads every brief within a day.</p>"));
    execSync("git add -A", { cwd: d });
    const pc = spawnSync(process.execPath, [join(here, "..", "bin", "hook-pre-commit.mjs")], { cwd: d, encoding: "utf8", env: { ...process.env, BABYSITTER_DEV_URL: "" } });
    assert.equal(pc.status, 0, pc.stderr);
    assert.match(pc.stderr, /this commit is clean; 1 copy finding\(s\) elsewhere on the site/);
    const st = spawnSync(process.execPath, [join(here, "..", "bin", "hook-stop.mjs")], { cwd: d, input: "{}", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: d, BABYSITTER_DEV_URL: "" } });
    assert.equal(st.status, 0, st.stderr);
    assert.match(JSON.parse(st.stdout).systemMessage, /clean for this change; 1 copy finding\(s\) elsewhere on the site/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
await t("e2e --changed summary: findings carried from routes not opened → 'Clean for this change', not 'Clean.'", () => {
  const root = mkdtempSync(join(tmpdir(), "bs563-sum-"));
  try {
    mkdirSync(join(root, ".babysitter"), { recursive: true });
    const rep = { suites: [{ title: "content.spec.js", file: "content.spec.js", specs: [], suites: [{ title: "content /", specs: [{ title: "CT1–CT8 copy", file: "content.spec.js", tests: [{ projectName: "desktop-1440", status: "expected", results: [{ status: "passed", errors: [] }] }] }] }] }] };
    writeFileSync(join(root, ".babysitter/report.json"), JSON.stringify(rep));
    writeFileSync(join(root, ".babysitter/routes.json"), JSON.stringify([{ path: "/", auth: false }, { path: "/terms", auth: false }]));
    writeFileSync(join(root, ".babysitter/findings.json"), JSON.stringify({ at: "2026-10-25T00:00:00Z", findings: [{ route: "/terms", test: "CT1–CT8 copy", project: "desktop-1440", items: [] }] }));
    const s = summarize({ root, rerun: "x", selection: { all: false, routes: ["public /"], of: 2 } });
    assert.match(s.text, /1 finding\(s\) elsewhere on the site \(routes not opened/);
    assert.doesNotMatch(s.text, /\nClean\./);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log(`content-563: ${n} passed${failed ? `, ${failed} FAILED` : ""}`);
if (failed) process.exit(1);
