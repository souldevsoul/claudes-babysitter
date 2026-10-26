// 5.7.0: what kind of skip a test result is, for the run summary, findings.json, fix-plan and the Stop hook.
// A skip annotation reads "<kind>: <rule>: <reason>" (playwright/skip.js writes it); a skip of an older or a product's
// own spec has no kind and is classified from its text here — a text that says nothing known is a decision, so no
// skip is ever left out of the report.
//   scope    by design (one width, once per run, pointer screens only) — one count line
//   config   switched off in babysitter.config.json
//   setup    the run needs something it does not have — the run is partial
//   decision Babysitter decided the rule does not apply — listed one by one until the owner approves it
export const because = (kind, rule, reason) => `${kind}: ${rule}: ${reason}`;

/** "decision: M2: the product shows no credits" → { kind, rule, reason }; null for a description of another shape. */
export function parseSkip(description = "") {
  const m = String(description || "").match(/^(scope|config|setup|decision): ([^:\n]+?): ([\s\S]*)$/);
  return m ? { kind: m[1], rule: m[2].trim(), reason: m[3].trim() } : null;
}

const CONFIG_RE = /switched off|babysitter\.config|allow\.|acceptance\.\w+: (false|off)|\.passwordless/;
const SCOPE_RE = /runs? (once|at)|one mobile and one desktop|screens only|once per run|desktop widths?|on touch|narrowest and widest|no check of this page matches the filter/i;
const SETUP_RE = /\bneeds\b|no signed-in storage|run (`?babysitter )?prepare|stage unknown|LOGIN_EMAIL|SESSION_COOKIES|test account/i;

/** The first word of a test title is its rule id ("M2 the signed-in header …" → "M2"). */
export const ruleOfTitle = (title = "") => (String(title).match(/^([A-Z]{0,3}\d+(?:\.\d+)?[a-z]?(?:[/–-][A-Z]{0,3}\d+(?:\.\d+)?)*|2FA|[A-Z]{1,3}\d*)\b/) || [, String(title).split(" ")[0] || "?"])[1];

/**
 * One skipped test result → { kind, rule, reason }. kind "product" for the product's own e2e (its skips are its own).
 * @param {{ title: string, project?: string, annotations?: { type: string, description?: string }[] }} r
 */
export function classifySkip(r) {
  const a = (r.annotations || []).find((x) => x.type === "skip" || x.type === "fixme");
  const desc = String(a?.description || "").trim();
  const p = parseSkip(desc);
  if (p) return { ...p, rule: p.rule === "*" || !p.rule ? ruleOfTitle(r.title) : p.rule };
  const rule = ruleOfTitle(r.title);
  const reason = desc.split("\n")[0];
  if (r.project === "product") return { kind: "product", rule, reason: reason || "skipped" };
  if (!desc) return { kind: "decision", rule, reason: "skipped with no reason given" };
  if (CONFIG_RE.test(desc)) return { kind: "config", rule, reason: reason.slice(0, 110), legacy: true };
  if (SCOPE_RE.test(desc)) return { kind: "scope", rule, reason };
  if (SETUP_RE.test(desc)) return { kind: "setup", rule, reason };
  return { kind: "decision", rule, reason };
}

/** A "decision" annotation on a test that ran ("3.5: no header bar found …") → { rule, reason }. */
export function parseNote(description = "", title = "") {
  const m = String(description).match(/^([^:\n]{1,24}): ([\s\S]+)$/);
  return m ? { rule: m[1].trim(), reason: m[2].trim() } : { rule: ruleOfTitle(title), reason: String(description).trim() };
}

/**
 * The owner's approvals: babysitter.config.json → acceptance.notApplicable (also forms. / content. / top-level
 * notApplicable): { "<rule>": "<reason>" } for every route, or { "<rule> <route>": "<reason>" } for one.
 */
export function approvals(cfg = {}) {
  return { ...(cfg.notApplicable || {}), ...(cfg.content?.notApplicable || {}), ...(cfg.forms?.notApplicable || {}), ...(cfg.acceptance?.notApplicable || {}) };
}
/** The approval that covers a decision on `route`, or null. A rule "FM3/FM4" is covered by "FM3/FM4", "FM3" or "FM4". */
export function approvalFor(map, rule, route = null) {
  const ids = [rule, ...String(rule).split("/")];
  for (const id of ids) {
    if (route && map[`${id} ${route}`] != null) return String(map[`${id} ${route}`]);
    if (map[id] != null) return String(map[id]);
  }
  return null;
}
