// Lints the bad/good CSS fixtures and asserts the expected rule hits.
import stylelint from "stylelint";
import config from "./config.js";
import { readFile } from "node:fs/promises";

const lint = async (file) => {
  const code = await readFile(new URL(`../../fixtures/${file}`, import.meta.url), "utf8");
  const { results } = await stylelint.lint({ code, config, codeFilename: file });
  return results[0].warnings.map((w) => w.rule);
};

const bad = await lint("bad.css");
const good = await lint("good.css");
const expected = ["ui/require-layer", "ui/z-index-scale", "ui/token-values", "ui/apply-values", "declaration-property-value-disallowed-list", "declaration-no-important", "color-named"];
const missing = expected.filter((r) => !bad.includes(r));
if (missing.length) { console.error("bad.css did not trigger:", missing, "got:", bad); process.exit(1); }
if (good.length) { console.error("good.css should be clean, got:", good); process.exit(1); }
console.log(`stylelint claudes-babysitter: bad.css → ${bad.length} warnings (${[...new Set(bad)].length} rules), good.css → clean`);
