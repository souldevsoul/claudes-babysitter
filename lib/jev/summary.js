// What the text pass prints, and the lines it adds to the `babysitter e2e` summary.
const s = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : `${Math.round(ms / 1000)} s`);

/** The lines for the e2e run summary (and `babysitter text`). */
export function textLines(r, { saved = null } = {}) {
  const L = [];
  if (!r) return L;
  const det = r.findings.filter((f) => !f.jev || f.jev.agrees).length;
  const jev = r.findings.filter((f) => f.jev && !f.jev.agrees);
  L.push(`Text pass: ${r.pages} page(s) read once (${r.loads} load(s)) in ${s(r.ms)} — ${det} rule finding(s)${r.jev.on ? `, ${jev.length} Jev finding(s), ${r.unsure.length} unsure` : ""}`);
  if (r.jev.on) {
    const j = r.jev;
    L.push(`  Jev: ${j.calls} call(s) (${j.cached} cached${j.failed ? `, ${j.failed} FAILED` : ""}), ${j.questions} question(s), ${j.claims} claim(s) compared · $${j.costUsd.toFixed(4)} of a $${j.budgetUsd} budget · threshold ${j.min}`);
    if (j.budgetHit) L.push("  ⚠ Jev budget spent before the pass finished: part of the copy was NOT read by Jev (raise jev.budget, or re-run: answers are cached)");
    if (j.deadlineHit) L.push("  ⚠ Jev deadline reached: part of the copy was NOT read by Jev (re-run: answers are cached)");
    if (j.unread?.length) L.push(`  ⚠ not read by Jev (failed calls): ${j.unread.slice(0, 8).join(", ")}${j.unread.length > 8 ? ` +${j.unread.length - 8}` : ""}`);
    const dis = r.findings.filter((f) => f.jev?.level === "disagrees");
    if (dis.length) {
      L.push(`Babysitter passed/skipped, Jev disagrees (${dis.length}) — a copy rule found nothing (or is switched off) where Jev is ≥ 0.8 sure it fails:`);
      for (const f of dis.slice(0, 10)) L.push(`  ! ${f.items[0].where} ${f.jev.disagrees}: "${String(f.jev.quote).slice(0, 100)}"`);
    }
  } else L.push(`  ${r.jev.note}`);
  if (saved) L.push(`  Copy read once instead of per check × viewport × state: ~${s(saved.ms)} of browser time saved (${saved.tests} content test(s) and ${saved.loads} page load(s) not repeated)`);
  if (r.unsure.length) {
    L.push(`Unsure, check by hand (${r.unsure.length}) — Jev between 0.5 and ${r.jev.min}, never failing the run:`);
    for (const u of r.unsure.slice(0, 15)) L.push(`  ? ${u.key} ${u.rule} (${u.p.toFixed(2)}): "${String(u.quote || u.what).slice(0, 110)}"${u.other ? ` ⟷ "${String(u.other.quote).slice(0, 80)}" (${u.other.key})` : ""}`);
    if (r.unsure.length > 15) L.push(`  ? … ${r.unsure.length - 15} more in .babysitter/text-pass.json`);
  }
  return L;
}

export function textSummary(r) {
  const bar = "━".repeat(64);
  const L = [bar, "Claude's Babysitter — text pass", bar, ...textLines(r)];
  const byRule = new Map();
  for (const f of r.findings) { const k = f.rule || f.test; byRule.set(k, (byRule.get(k) || 0) + 1); }
  if (r.findings.length) {
    L.push(`Findings (${r.findings.length}) by rule:`);
    for (const [k, n] of [...byRule].sort((a, b) => b[1] - a[1]).slice(0, 30)) L.push(`  ✗ ${k}: ${n}`);
    L.push("", "babysitter fix-plan lists them with both places quoted and the files to change.");
  } else L.push("", "Clean.");
  L.push(bar);
  return L.join("\n");
}
