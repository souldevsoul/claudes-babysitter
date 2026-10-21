// husky manages the git hooks of many products: core.hooksPath points at its stubs (v9: .husky/_/<name>, which run
// .husky/<name>; v4–8: .husky with _/husky.sh), and the commands live in .husky/<name>. The wiring check must read
// those scripts (no false "NOT WIRED"), and install-hooks / init must append the babysitter lines there — once —
// instead of editing a stub husky regenerates.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { wiringStatus, huskyScriptsDir, hookScript } from "../lib/wiring.js";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, n = 0;
async function t(name, fn) { try { await fn(); n++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`); } }
const H = `#!/usr/bin/env sh
n=$(basename "$0")
s=$(dirname "$(dirname "$0")")/$n
[ ! -f "$s" ] && exit 0
[ "\${HUSKY-}" = "0" ] && exit 0
export PATH="node_modules/.bin:$PATH"
sh -e "$s" "$@"
`;
function repo(version) {
  const d = mkdtempSync(join(tmpdir(), `bs-husky${version}-`));
  execSync("git init -q && git config user.email t@t && git config user.name t", { cwd: d });
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "p", private: true, devDependencies: { husky: version === 9 ? "^9.1.0" : "^8.0.0" } }));
  if (version === 9) {
    mkdirSync(join(d, ".husky/_"), { recursive: true });
    writeFileSync(join(d, ".husky/_/h"), H);
    for (const name of ["pre-commit", "post-merge", "post-rewrite", "commit-msg"]) { writeFileSync(join(d, `.husky/_/${name}`), '#!/usr/bin/env sh\n. "$(dirname "$0")/h"'); chmodSync(join(d, `.husky/_/${name}`), 0o755); }
    execSync("git config core.hooksPath .husky/_", { cwd: d });
  } else {
    mkdirSync(join(d, ".husky/_"), { recursive: true });
    writeFileSync(join(d, ".husky/_/husky.sh"), "#!/usr/bin/env sh\n");
    execSync("git config core.hooksPath .husky", { cwd: d });
  }
  writeFileSync(join(d, ".husky/pre-commit"), version === 9 ? "echo team-hook\n" : '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\necho team-hook\n');
  chmodSync(join(d, ".husky/pre-commit"), 0o755);
  return d;
}
const installHooks = (d) => spawnSync(process.execPath, [join(here, "../bin/install-hooks.mjs"), d, "--force", "--verbose"], { encoding: "utf8", env: { ...process.env, CI: "" } });
const gitHooks = (s) => s.missing.map((m) => m.piece).filter((p) => /^git /.test(p));

for (const v of [9, 8]) {
  await t(`husky v${v}: the scripts directory is .husky; before install the git pieces are missing, after it they are present`, () => {
    const d = repo(v);
    assert.ok(huskyScriptsDir(d).endsWith(".husky"), huskyScriptsDir(d));
    assert.ok(hookScript(d, "pre-commit").endsWith(".husky/pre-commit"));
    assert.equal(gitHooks(wiringStatus(d)).length, 3, JSON.stringify(wiringStatus(d).missing));
    const stub = v === 9 ? readFileSync(join(d, ".husky/_/pre-commit"), "utf8") : null;
    const r = installHooks(d);
    assert.equal(r.status, 0, r.stderr);
    const pre = readFileSync(join(d, ".husky/pre-commit"), "utf8");
    assert.match(pre, /^echo team-hook/m, "the team's own command stays");
    assert.match(pre, /claudes-babysitter pre-commit gate[\s\S]*hook-pre-commit\.mjs/);
    assert.match(readFileSync(join(d, ".husky/post-merge"), "utf8"), /after-merge\.mjs/);
    assert.match(readFileSync(join(d, ".husky/post-rewrite"), "utf8"), /after-merge\.mjs/);
    if (stub !== null) assert.equal(readFileSync(join(d, ".husky/_/pre-commit"), "utf8"), stub, "the husky stub is not edited");
    assert.deepEqual(gitHooks(wiringStatus(d)), [], "no false NOT WIRED");
    // idempotent
    installHooks(d);
    assert.equal(readFileSync(join(d, ".husky/pre-commit"), "utf8"), pre);
    // a commit runs the husky stub, the team's command and our block (babysitter is not installed here: it lets the commit through)
    if (v === 9) {
      writeFileSync(join(d, "a.txt"), "x");
      execSync("git add -A", { cwd: d });
      const c = spawnSync("git", ["commit", "-qm", "x"], { cwd: d, encoding: "utf8" });
      assert.equal(c.status, 0, `${c.stdout}${c.stderr}`);
      assert.match(c.stdout + c.stderr, /team-hook/, "the team's command ran through the stub");
    }
    rmSync(d, { recursive: true, force: true });
  });
}
await t("a line the team already added to .husky/pre-commit counts, and is not added twice", () => {
  const d = repo(9);
  writeFileSync(join(d, ".husky/pre-commit"), 'npx --no lint-staged\n\n# claudes-babysitter pre-commit gate\n[ -f node_modules/claudes-babysitter/bin/hook-pre-commit.mjs ] && node node_modules/claudes-babysitter/bin/hook-pre-commit.mjs "$@"\n');
  const before = readFileSync(join(d, ".husky/pre-commit"), "utf8");
  installHooks(d);
  assert.equal(readFileSync(join(d, ".husky/pre-commit"), "utf8"), before);
  assert.ok(!gitHooks(wiringStatus(d)).includes("git pre-commit gate"));
  rmSync(d, { recursive: true, force: true });
});
await t("without husky nothing changes: .git/hooks gets the gate as before", () => {
  const d = mkdtempSync(join(tmpdir(), "bs-nohusky-"));
  execSync("git init -q", { cwd: d });
  writeFileSync(join(d, "package.json"), "{}");
  assert.equal(huskyScriptsDir(d), null);
  installHooks(d);
  assert.ok(existsSync(join(d, ".git/hooks/pre-commit")) && /hook-pre-commit\.mjs/.test(readFileSync(join(d, ".git/hooks/pre-commit"), "utf8")));
  assert.deepEqual(gitHooks(wiringStatus(d)), []);
  rmSync(d, { recursive: true, force: true });
});
console.log(failed ? `husky: ${failed} failed, ${n} passed` : `husky: ${n} passed`);
if (failed) process.exit(1);
