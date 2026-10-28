// 5.7.2 — what the relaygpu signed-in run (2026-10-28) showed was wrong.
//
// 1. fix-plan pointed at the wrong file whenever a check printed a CSS value: it searches the repo for
//    every quoted run of the message, and "normal" / "default" are not on the page.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { quotedCopy, quotedRuns, isMeasuredValue } from "../lib/quoted-copy.js";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ───────── 1. a CSS value is not page copy ───────── */

test("1.19's \"normal\" is a measured value, not copy to search for", () => {
  const msg = 'html — dark page but color-scheme is "normal" — scrollbars, autofill and native pickers render light [1.19]';
  assert.deepEqual(quotedCopy(msg), [], "nothing in this message is page copy");
});

test("H2's \"default\" is a measured value, not copy to search for", () => {
  const msg = 'button "OK" — clickable button shows cursor "default", not the hand [H2, BQA 3]';
  // "OK" is below the 4-char floor, "default" is the cursor: nothing here is worth searching for
  assert.deepEqual(quotedCopy(msg), []);
});

test("a short label does not make the scanner invent a phrase", () => {
  // 5.7.1's regex paired "OK"'s closing quote with "default"'s opening one
  const msg = 'button "OK" — clickable button shows cursor "default", not the hand';
  assert.deepEqual(quotedRuns(msg), ["OK", "default"]);
  assert.ok(!quotedCopy(msg).some((q) => /clickable button shows/.test(q)), "no fabricated phrase");
});

test("a short label next to real copy keeps the copy", () => {
  const msg = 'button "OK" hides "Relaygpu uses essential cookies only" in one frame';
  assert.deepEqual(quotedCopy(msg), ["Relaygpu uses essential cookies only"]);
});

test("real page copy still comes through", () => {
  const msg = 'p — text 11px, under the 12px minimum: "Any amount from $1 to $20,000 per top-up", contrast 3.20:1 [6.4]';
  assert.deepEqual(quotedCopy(msg), ["Any amount from $1 to $20,000 per top-up"]);
});

test("a one-word heading is copy, a one-word CSS keyword is not", () => {
  assert.deepEqual(quotedCopy('orphan: the heading\'s last line is the single word "Refund" at 390px'), ["Refund"]);
  assert.deepEqual(quotedCopy('the panel is "hidden" at this width'), []);
});

test("numbers, colours, ratios and CSS functions are values", () => {
  for (const v of ["12px", "#5d5f5f", "1.96:1", "rgba(255,255,255,0.35)", "oklch(0.5 0.1 200)", "var(--fg)", "400", "1.5rem"])
    assert.equal(isMeasuredValue(v), true, `${v} should be a value`);
  for (const c of ["Create account", "Sign in", "Refund", "Manage cookies"])
    assert.equal(isMeasuredValue(c), false, `${c} should be copy`);
});

test("duplicates collapse and order is kept", () => {
  assert.deepEqual(quotedCopy('"Deploy" then "Deploy" then "Billing"'), ["Deploy", "Billing"]);
});

/* ───────── 2. end to end: fix-plan does not send the reader to an unrelated file ───────── */

test("fix-plan: a 1.19 finding gets no bogus source pointer", () => {
  const repo = mkdtempSync(join(tmpdir(), "bs-572-"));
  try {
    mkdirSync(join(repo, "src/lib"), { recursive: true });
    mkdirSync(join(repo, "src/app"), { recursive: true });
    writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "t" }));
    // the decoy: an unrelated file that contains the word "normal", exactly as relaygpu's blog.ts did
    writeFileSync(join(repo, "src/lib/blog.ts"), 'export const posts = [{ body: "every request after that runs at normal (warm) latency" }];\n');
    writeFileSync(join(repo, "src/app/page.tsx"), "export default function Page() { return <main>Home</main>; }\n");
    mkdirSync(join(repo, ".babysitter"), { recursive: true });
    writeFileSync(join(repo, ".babysitter/findings.json"), JSON.stringify({
      findings: [{
        suite: "ui", route: "/", rule: "1.19", test: "1.19 native parts follow the theme",
        status: "failed",
        items: [{ what: 'dark page but color-scheme is "normal" — set color-scheme: dark on :root [1.19]', where: "html" }],
      }],
    }));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });

    // fix-plan exits non-zero when there are problems to fix — that is the normal path here
    try { execFileSync("node", [join(TOOL, "bin/fix-plan.mjs")], { cwd: repo, encoding: "utf8" }); } catch { /* exit 1 = findings */ }
    const plan = readFileSync(join(repo, ".babysitter/fix-plan.md"), "utf8");

    assert.ok(!/blog\.ts/.test(plan), `fix-plan must not point at blog.ts:\n${plan}`);
    assert.ok(!/text "normal"/.test(plan), `fix-plan must not quote "normal" as page copy:\n${plan}`);
    assert.ok(/1\.19/.test(plan), "the finding itself is still reported");
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
