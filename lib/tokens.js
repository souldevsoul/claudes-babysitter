// What counts as a hard-coded design value. Shared by the ESLint rules, the Stylelint rules and the
// CSS-in-JS check, so every route into the codebase is judged by the same definition.

/** Tailwind palette hues (bg-blue-600, text-zinc-900/80 …). */
export const PALETTE = /^(bg|text|border(-[trblxy])?|ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|shadow|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)(\/\S+)?$/;

/** Arbitrary Tailwind values that bypass the theme. `[var(--token)]` is a token and allowed. */
export const ARBITRARY = [
  [/^(bg|text|border(-[trblxy])?|ring|outline|fill|stroke|from|via|to|decoration|caret|accent|divide|placeholder|shadow)-\[(#|rgb|hsl|oklch|oklab|lab|color)/, "colour"],
  [/^rounded(-[trblxyse]{1,2})?-\[(?!var\()/, "radius"],
  [/^shadow-\[(?!var\()/, "shadow"],
  [/^text-\[\d+(\.\d+)?(px|rem|em)\]$/, "font size"],
  [/^(leading|tracking)-\[(?!var\()/, "line-height/tracking"],
  [/^font-\[(?!var\()/, "font"],
  [/^-?(m|p|gap|space)[xytrbl]?-\[(?!var\()/, "spacing"],
  [/^-?z-\[/, "z-index"],
];
export const base = (t) => t.split(":").pop().replace(/^!/, "");
export const arbitraryKind = (tok) => { const b = base(tok); const hit = ARBITRARY.find(([re]) => re.test(b)); return hit ? hit[1] : null; };
export const isPalette = (tok) => PALETTE.test(base(tok));
export const tinyText = (tok) => { const m = base(tok).match(/^text-\[(\d+(?:\.\d+)?)(px|rem)\]$/); return m ? (m[2] === "px" ? +m[1] < 12 : +m[1] < 0.75) : false; };

/** A string that looks like a Tailwind class list (≥1 token with a known utility shape). */
const UTIL = /^(!?[\w-]+:)*-?(bg|text|border|rounded|shadow|ring|p[xytrbl]?|m[xytrbl]?|gap|space|w|h|min-w|min-h|max-w|max-h|flex|grid|col|row|items|justify|font|leading|tracking|z|opacity|from|via|to|inline|block|hidden|absolute|relative|fixed|sticky|top|left|right|bottom|inset|overflow|transition|duration|ease)(-|$)/;
export function isClassList(s) {
  const toks = String(s).trim().split(/\s+/).filter(Boolean);
  if (!toks.length || /[{};]/.test(s)) return false;
  const util = toks.filter((t) => UTIL.test(t)).length;
  return util >= 1 && util / toks.length >= 0.5;
}

/* CSS values */
export const COLOR_LIT = /#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb|color)\(/i;
export const LEN_LIT = /(^|[\s(,])-?\d*\.?\d+(px|rem|em)\b/;
/** Replace tokens (CSS vars, SCSS/Less vars, JS interpolations, colour functions of tokens) by VAR. */
export function tokenise(value) {
  let v = String(value).replace(/var\((?:[^()]|\([^()]*\))*\)/g, "VAR").replace(/[$@][\w-]+/g, "VAR").replace(/__EXPR\d+__/g, "VAR");
  for (let i = 0; i < 3; i++) v = v.replace(/[\w-]+\((?:[^()]*?)VAR(?:[^()]*?)\)/g, "VAR");
  return v;
}
export const CSS_CHECKS = [
  [/^(color|background|background-color|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule-color)$/, (v) => COLOR_LIT.test(v) && "literal colour"],
  [/^border(-(top|bottom)-(left|right))?-radius$/, (v) => LEN_LIT.test(v) && !/^(0|50%|9999px|999px|100%)$/.test(v.trim()) && "literal radius"],
  [/^box-shadow$/, (v) => (COLOR_LIT.test(v) || LEN_LIT.test(v)) && v.trim() !== "none" && "literal shadow"],
  [/^font-size$/, (v) => LEN_LIT.test(v) && !/clamp\(|min\(|max\(/.test(v) && "literal font size"],
  [/^font-family$/, (v) => !/VAR/.test(v) && !/^(inherit|initial|unset)$/.test(v.trim()) && "literal font family"],
  [/^(padding|margin)(-(top|right|bottom|left|inline|block))?$|^gap$/, (v) => /(^|\s)-?\d*\.?\d+(px|rem)\b/.test(v) && !/^0(px)?$/.test(v.trim()) && "literal spacing", { strictOnly: true }],
];
/** Problems for one CSS declaration. `strict` adds spacing (used for CSS-in-JS, where no layer/scale exists). */
export function cssValueProblems(prop, value, { strict = false } = {}) {
  const p = prop.toLowerCase();
  if (p.startsWith("--")) return [];
  const v = tokenise(value);
  const out = [];
  for (const [re, test, o] of CSS_CHECKS) {
    if (o && o.strictOnly && !strict) continue;
    if (!re.test(p)) continue;
    const why = test(v);
    if (why) out.push(why);
  }
  return out;
}
