// Time Travel must never lose the developer's work. Real git repos, real files, real kills.
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, chmodSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot, apply, restore, recover } from "../lib/time-travel.js";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "time-travel.js");
let n = 0;
const ok = (m) => { n++; console.log("  ✓", m); };
const read = (repo, p) => (existsSync(join(repo, p)) ? readFileSync(join(repo, p), "utf8") : null);

const HEAD = { "src/app/page.tsx": "export default () => <h1>old</h1>;\n", "src/old.css": ".a{color:red}\n", "src/run.mjs": "#!/usr/bin/env node\nconsole.log(1)\n", "package.json": '{"name":"t"}\n' };
const AFTER = { "src/app/page.tsx": "export default () => <h1>new</h1>;\n", "src/app/new.tsx": "export const N = () => <p>new file</p>;\n", "src/old.css": null, "src/run.mjs": "#!/usr/bin/env node\nconsole.log(2)\n", "package.json": '{"name":"t","version":"2"}\n' };

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "tt-"));
  for (const [p, c] of Object.entries(HEAD)) { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), c); }
  chmodSync(join(repo, "src/run.mjs"), 0o755);
  writeFileSync(join(repo, ".gitignore"), ".babysitter/\n");
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: repo });
  for (const [p, c] of Object.entries(AFTER)) { if (c === null) rmSync(join(repo, p)); else { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), c); } }
  return repo;
}
const isAfter = (repo) => Object.entries(AFTER).every(([p, c]) => read(repo, p) === c) && (statSync(join(repo, "src/run.mjs")).mode & 0o777) === 0o755;
const noJournal = (repo) => !existsSync(join(repo, ".babysitter/time-travel"));
const child = (repo, body) => spawn(process.execPath, ["--input-type=module", "-e", `import { snapshot, apply, guard } from ${JSON.stringify(LIB)}; const tt = snapshot(${JSON.stringify(repo)}); ${body}`], { stdio: ["ignore", "pipe", "pipe"] });
const line = (p) => new Promise((r) => p.stdout.once("data", r));
const exit = (p) => new Promise((r) => p.on("exit", (code, sig) => r({ code, sig })));

const repos = [];
try {
  // 1. snapshot + both directions
  let repo = makeRepo(); repos.push(repo);
  const tt = snapshot(repo);
  assert.deepEqual(tt.journal.files.map((f) => f.path).sort(), ["src/app/new.tsx", "src/app/page.tsx", "src/old.css", "src/run.mjs"]);
  assert.deepEqual(tt.journal.skipped, ["package.json"]);
  apply(tt, "BEFORE");
  assert.equal(read(repo, "src/app/page.tsx"), HEAD["src/app/page.tsx"]);
  assert.equal(read(repo, "src/app/new.tsx"), null, "untracked new file removed for BEFORE");
  assert.equal(read(repo, "src/old.css"), HEAD["src/old.css"], "deleted file is back for BEFORE");
  assert.equal(statSync(join(repo, "src/run.mjs")).mode & 0o777, 0o755, "mode kept");
  assert.equal(read(repo, "package.json"), AFTER["package.json"], "config files are never swapped");
  assert.equal(execSync("git status --porcelain", { cwd: repo, encoding: "utf8" }).trim(), "M package.json", "BEFORE on disk == HEAD for the swapped files");
  apply(tt, "AFTER"); assert.ok(isAfter(repo));
  apply(tt, "BEFORE"); restore(tt);
  assert.ok(isAfter(repo) && noJournal(repo));
  ok("snapshot → BEFORE (HEAD, incl. added/deleted files, modes, config untouched) → AFTER → restore");

  // 2. a file edited after the snapshot: BEFORE refuses and writes nothing
  repo = makeRepo(); repos.push(repo);
  const t2 = snapshot(repo);
  writeFileSync(join(repo, "src/app/page.tsx"), "// formatter touched it\n");
  assert.throws(() => apply(t2, "BEFORE"), /changed on disk since the review started — nothing swapped: src\/app\/page\.tsx/);
  assert.equal(read(repo, "src/app/new.tsx"), AFTER["src/app/new.tsx"], "all-or-nothing: no other file swapped");
  restore(t2);
  assert.equal(read(repo, "src/app/page.tsx"), "// formatter touched it\n", "restore never reverts a live edit made while AFTER was on disk");
  ok("a file changed after the snapshot → BEFORE refused, nothing written; restore leaves the edit alone");

  // 3. edits made while BEFORE was on disk are kept as conflict copies; AFTER comes back
  repo = makeRepo(); repos.push(repo);
  const t3 = snapshot(repo);
  apply(t3, "BEFORE");
  writeFileSync(join(repo, "src/app/page.tsx"), "// edited the HEAD version by mistake\n");
  const r3 = apply(t3, "AFTER");
  assert.ok(isAfter(repo));
  assert.equal(r3.conflicts.length, 1);
  assert.equal(readFileSync(join(repo, r3.conflicts[0]), "utf8"), "// edited the HEAD version by mistake\n");
  restore(t3);
  ok("an edit made on the BEFORE version → AFTER restored, the edit kept in .babysitter/time-travel-conflicts/");

  // 4. SIGKILL while BEFORE is on disk → the next hook's recover() puts AFTER back
  repo = makeRepo(); repos.push(repo);
  let p = child(repo, `apply(tt, "BEFORE"); console.log("before"); setInterval(() => {}, 1000);`);
  await line(p);
  assert.equal(read(repo, "src/app/page.tsx"), HEAD["src/app/page.tsx"]);
  assert.equal(recover(repo).busy, p.pid, "a live owner's swap is left alone");
  assert.equal(snapshot(repo), null, "and no second review stacks on top of it");
  p.kill("SIGKILL"); await exit(p);
  const r4 = recover(repo);
  assert.ok(r4.restored && isAfter(repo) && noJournal(repo));
  ok("SIGKILL mid-review → recover() (run by every hook) restores AFTER from the journal");

  // 5. SIGTERM / SIGINT → the guard restores before the process dies
  for (const sig of ["SIGTERM", "SIGINT"]) {
    repo = makeRepo(); repos.push(repo);
    p = child(repo, `guard(tt, () => {}); apply(tt, "BEFORE"); console.log("before"); setInterval(() => {}, 1000);`);
    await line(p);
    p.kill(sig);
    const e = await exit(p);
    assert.equal(e.code, sig === "SIGINT" ? 130 : 143);
    assert.ok(isAfter(repo) && noJournal(repo), sig);
  }
  // 6. an exception escapes → the exit handler restores
  repo = makeRepo(); repos.push(repo);
  p = child(repo, `guard(tt, () => {}); apply(tt, "BEFORE"); throw new Error("boom");`);
  await exit(p);
  assert.ok(isAfter(repo) && noJournal(repo));
  ok("SIGTERM, SIGINT and an uncaught exception → AFTER restored before the process exits");

  // 7. nothing to compare
  repo = mkdtempSync(join(tmpdir(), "tt-")); repos.push(repo);
  execSync("git init -q", { cwd: repo });
  assert.equal(snapshot(repo), null, "no commits yet");
  ok("no HEAD or no changed UI files → Time Travel is simply off");
} finally {
  for (const r of repos) rmSync(r, { recursive: true, force: true });
}
console.log(`time-travel: ${n} cases passed`);
