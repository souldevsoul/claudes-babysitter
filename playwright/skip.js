// 5.7.0: every skip says what kind of skip it is, so the run summary can report it without guessing from its text.
// A skip's annotation is { type: "skip", description: "<kind>: <rule>: <reason>" }; the kinds:
//   scope    — by design: the rule runs at one width / once per run / on pointer screens only (one count line)
//   config   — switched off in babysitter.config.json (skip + skipReasons, allow.*, an owner decision)
//   setup    — something the run needs is missing (a login, a role's storage, the stage, prepare's files): the run
//              is partial and the summary says how to fix it
//   decision — Babysitter itself decided the rule does not apply (no claim, no credits, too few pages / pieces /
//              tokens, no element found): every one is listed in the summary, so a human can disagree, and the run
//              is not "Clean." until the owner approves it (babysitter.config.json → acceptance.notApplicable)
// A check that passes because a precondition was missing (no header found, too few pages to compare) notes the same
// decision on the running test without skipping it: noteDecision() / an in-page `window.__bsNA` read by decided().
import { test as base } from "@playwright/test";
import { because, parseSkip } from "../lib/skip-kinds.js";

export { because, parseSkip };
export const KINDS = ["scope", "config", "setup", "decision"];
export const scope = (rule, reason) => because("scope", rule, reason);
export const config = (rule, reason) => because("config", rule, reason);
export const setup = (rule, reason) => because("setup", rule, reason);
export const decision = (rule, reason) => because("decision", rule, reason);

/** test.skip(cond, …) with a kind: skipBecause(test, !sells, { kind: "decision", rule: "M2", reason: "…" }). */
export function skipBecause(t, cond, { kind, rule, reason }) {
  return t.skip(cond, because(kind, rule, reason));
}

/** The running test's info (an express page check's own, when it runs inside an express page test), or null. */
function info() {
  try { return globalThis.__bsTestInfo?.() ?? base.info(); } catch { return null; }
}

/** A check that ends as passed because a precondition was missing: a "decision" annotation on the running test. */
export function noteDecision(rule, reason) {
  const i = info();
  if (i) i.annotations.push({ type: "decision", description: `${rule}: ${reason}` });
}

/** A check that could not measure (an element went away, the sign-in did not go through): a "not tested" note. */
export function noteNotTested(rule, reason) {
  const i = info();
  if (i) i.annotations.push({ type: "not tested", description: `${rule}: ${reason}` });
}

/**
 * The result of a page.evaluate check whose in-page code set `window.__bsNA = { rule, reason }` before an early return:
 * noted as a decision. The flag is cleared, so the next check starts clean.
 */
export async function decided(page, promise) {
  const out = await promise;
  const na = await page.evaluate(() => { const x = window.__bsNA; window.__bsNA = undefined; return x || null; }).catch(() => null);
  if (na?.rule) noteDecision(na.rule, na.reason);
  return out;
}
