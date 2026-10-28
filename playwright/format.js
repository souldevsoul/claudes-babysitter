// The bullet list a failing check prints ("  • what — where"), read back by lib/run-summary.js bullets() into
// findings.json, fix-plan and triage. 5.7.1: one item, one line — a quoted heading with line breaks in it
// ("~/admin/billing\n\nBilling ledger") split an item in two, and its first line ('"~/ADMIN/BILLING') became the whole
// finding in fix-plan and triage.
export const one = (x) => String(x ?? "").replace(/\s+/g, " ").trim();
export const fmt = (list) => list.map((o) => `  • ${one(o.what)} — ${one(o.where)}`).join("\n");
