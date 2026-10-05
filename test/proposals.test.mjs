// Proposals never touch the original until approved. Real git repos, real files.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import * as P from "../lib/proposals.js";

let n = 0;
const ok = (m) => { n++; console.log("  ✓", m); };
const repos = [];
const read = (repo, f) => (existsSync(join(repo, f)) ? readFileSync(join(repo, f), "utf8") : null);
const write = (repo, f, c) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), c); };
const status = (repo) => execSync("git status --porcelain", { cwd: repo, encoding: "utf8" }).trim();
const show = (repo, sha, f) => { try { return execSync(`git show ${sha}:${f}`, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "prop-")); repos.push(repo);
  write(repo, "src/form.tsx", "<input className=\"border border-gray-300\" />\n<select id=\"c\" />\n");
  write(repo, "src/styles.css", ":root{--edge:#d1d5dc}\n");
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: repo });
  write(repo, "src/wip.tsx", "// the developer's own uncommitted work\n"); // untracked: part of the original
  return repo;
}

try {
  const repo = makeRepo();
  const head = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
  const before = status(repo);

  // 1. start → edit → save: the files are back to the original, the fix is kept as a proposal
  P.start(repo);
  write(repo, "src/form.tsx", "<input className=\"border border-field-edge\" />\n<select id=\"c\" />\n");
  write(repo, "src/styles.css", ":root{--edge:#d1d5dc;--field-edge:#8a919e}\n");
  const a = P.save(repo, { title: "Field edges", for: "control boundary" });
  assert.equal(read(repo, "src/form.tsx"), "<input className=\"border border-gray-300\" />\n<select id=\"c\" />\n", "original back on disk");
  assert.equal(read(repo, "src/styles.css"), ":root{--edge:#d1d5dc}\n");
  assert.equal(read(repo, "src/wip.tsx"), "// the developer's own uncommitted work\n", "uncommitted work untouched");
  assert.equal(status(repo), before, "git status as before");
  assert.deepEqual(a.files.sort(), ["src/form.tsx", "src/styles.css"]);
  ok("propose save: the edits become a proposal, the files go back to the original (uncommitted work kept)");

  // a second proposal (adds a file), depending on the first
  write(repo, "src/form.tsx", "<input className=\"border border-gray-300\" />\n<Select id=\"c\" />\n");
  write(repo, "src/ui/select.tsx", "export const Select = () => <button className=\"border-field-edge\" />;\n");
  const b = P.save(repo, { title: "Kit Select", for: "native control", requires: [a.id] });
  assert.equal(read(repo, "src/ui/select.tsx"), null, "a file the proposal adds is not on disk");
  assert.equal(status(repo), before);
  ok("a proposal that adds a file leaves no trace on disk");

  // 2. the After side: one commit with every pending proposal, nothing on disk changes, no ref moves
  const c1 = P.proposalCommit(repo);
  assert.deepEqual(c1.applied, [a.id, b.id]); assert.deepEqual(c1.failed, []);
  assert.match(show(repo, c1.sha, "src/form.tsx"), /border-field-edge[\s\S]*<Select/);
  assert.match(show(repo, c1.sha, "src/ui/select.tsx"), /Select/);
  assert.equal(show(repo, c1.sha, "src/wip.tsx"), "// the developer's own uncommitted work\n", "built on the working tree, not HEAD");
  assert.equal(execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim(), head);
  assert.equal(status(repo), before);
  ok("proposalCommit: the working tree + pending proposals as a commit; disk, index and HEAD untouched");

  // 3. matching findings to proposals
  const found = P.assign([{ check: "control boundary [1.9]", what: "input barely visible", selector: "input" }, { check: "native control [1.1]", what: "native <select>", selector: "#c" }, { check: "contrast [6.4]", what: "contrast 3:1" }], P.list(repo));
  assert.deepEqual(found.map((f) => f.proposal), [a.id, b.id, undefined]);
  ok("findings are matched to proposals by their `for` pattern");

  // 4. reject → out of the After side; approve applies what it requires first
  P.setStatus(repo, b.id, "rejected");
  assert.deepEqual(P.proposalCommit(repo).applied, [a.id]);
  P.setStatus(repo, b.id, "pending");
  const done = P.approve(repo, b.id);
  assert.deepEqual(done, [a.id, b.id], "the required proposal is applied first");
  assert.match(read(repo, "src/form.tsx"), /border-field-edge[\s\S]*<Select/);
  assert.match(read(repo, "src/ui/select.tsx"), /Select/);
  assert.equal(P.get(repo, a.id).status, "approved");
  assert.deepEqual(P.proposalCommit(repo).applied, [], "nothing pending");
  ok("approve applies the patch (and what it requires) to the original files; rejected ones leave the After side");

  // 5. a proposal that no longer applies: conflict, the files stay as they are
  P.start(repo);
  write(repo, "src/styles.css", ":root{--edge:#000;--field-edge:#8a919e}\n");
  const c = P.save(repo, { title: "Darker edge", for: "x" });
  write(repo, "src/styles.css", ":root{--edge:#111;--field-edge:#8a919e}\n"); // someone changed the same line
  const snap = read(repo, "src/styles.css");
  assert.throws(() => P.approve(repo, c.id), /does not apply/);
  assert.equal(read(repo, "src/styles.css"), snap, "nothing half-applied");
  assert.equal(P.get(repo, c.id).status, "conflict");
  assert.deepEqual(P.proposalCommit(repo).failed.map((f) => f.id), [], "conflict is not pending");
  ok("a proposal that no longer applies is marked conflict and changes nothing");

  // 6. a requirement that was rejected blocks the approval
  P.start(repo);
  write(repo, "src/a.css", "a{}\n"); const r1 = P.save(repo, { title: "Token", for: "t" });
  write(repo, "src/b.css", "b{}\n"); const r2 = P.save(repo, { title: "Uses token", for: "u", requires: [r1.id] });
  P.setStatus(repo, r1.id, "rejected");
  assert.throws(() => P.approve(repo, r2.id), /needs "Token", which was rejected/);
  assert.equal(read(repo, "src/b.css"), null);
  ok("a proposal whose requirement was rejected cannot be approved");

  // 8. the After side carries a code-only proposal that a visual one stands on (a shared hook), and only then
  {
    const r = makeRepo(); P.start(r);
    write(r, "src/usePresence.ts", "export const usePresence = () => 1;\n");
    P.save(r, { id: "hook", title: "hook", kind: "code" });
    write(r, "src/form.tsx", "import { usePresence } from './usePresence';\n<input className=\"border border-gray-300\" />\n<select id=\"c\" />\n");
    P.save(r, { id: "uses", title: "uses the hook", requires: ["hook"] });
    write(r, "src/other.css", "a{}\n");
    P.save(r, { id: "lone-code", title: "unrelated code-only", kind: "code" });
    const c = P.proposalCommit(r);
    assert.deepEqual(c.applied.sort(), ["hook", "uses"], "the required code-only fix comes along; an unrelated one does not");
    assert.ok(show(r, c.sha, "src/usePresence.ts"));
    assert.equal(show(r, c.sha, "src/other.css"), null);
    ok("proposalCommit: a visual fix brings the code-only fix it requires (the After site builds), unrelated code-only fixes stay out");
  }

  // 9. a tracked file that matches .gitignore stays in the trees (baseline, After): it is part of the site
  {
    const r = makeRepo();
    write(r, "public/hero.png", "PNG");
    write(r, ".gitignore", "public/*.png\n");
    execSync("git add -f public/hero.png .gitignore && git -c user.email=t@t -c user.name=t commit -qm img", { cwd: r });
    P.start(r);
    write(r, "src/styles.css", ":root{--edge:#8a919e}\n");
    P.save(r, { id: "edge", title: "edge" });
    const c = P.proposalCommit(r);
    assert.equal(show(r, c.sha, "public/hero.png"), "PNG", "the tracked-but-ignored image is on the After side");
    assert.equal(show(r, P.baseline(r), "public/hero.png"), "PNG", "and in the baseline");
    write(r, "public/new.png", "x"); // untracked + ignored: still out
    assert.equal(show(r, P.workingTree(r), "public/new.png"), null);
    ok("tracked files that match .gitignore stay in the baseline and the After site; untracked ignored files stay out");
  }

  // 7. save without start / without edits
  const fresh = makeRepo();
  assert.throws(() => P.save(fresh, { title: "x" }), /no baseline/);
  P.start(fresh);
  assert.throws(() => P.save(fresh, { title: "x" }), /nothing changed/);
  ok("save refuses without a baseline or without edits");
} finally {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
}
console.log(`proposals: ${n} cases passed`);
