// Custom Stylelint rules for ui-architecture-guidelines.md (sections 5 and 6).
import stylelint from "stylelint";
import { cssValueProblems, arbitraryKind, isPalette, tinyText } from "../../lib/tokens.js";
const { createPlugin, utils } = stylelint;
const NS = "ui";

const inside = (node, names) => { for (let p = node.parent; p; p = p.parent) if (p.type === "atrule" && names.includes(p.name)) return p; return null; };
const tokenBlock = (rule) => rule && rule.nodes && rule.nodes.every((n) => n.type === "comment" || (n.type === "decl" && n.prop.startsWith("--")));

/** 6.1 — every rule lives inside @layer; global unlayered CSS beats Tailwind. */
const requireLayerName = `${NS}/require-layer`;
const requireLayerMessages = utils.ruleMessages(requireLayerName, {
  rejected: (sel) => `"${sel}" is outside @layer. Unlayered CSS overrides every utility and component variant. Wrap it in @layer base/components. [6.1, P04 P22 P23]`,
});
const requireLayer = createPlugin(requireLayerName, (enabled) => (root, result) => {
  if (!enabled) return;
  root.walkRules((rule) => {
    if (inside(rule, ["layer", "theme", "keyframes", "utility"])) return;
    if (tokenBlock(rule)) return; // :root / .dark token blocks
    utils.report({ ruleName: requireLayerName, result, node: rule, message: requireLayerMessages.rejected(rule.selector) });
  });
});
requireLayer.ruleName = requireLayerName;
requireLayer.messages = requireLayerMessages;

/** 5.3 — z-index only from the scale (var(--z-*)), 0, 1, -1 or auto. */
const zName = `${NS}/z-index-scale`;
const zMessages = utils.ruleMessages(zName, {
  rejected: (v) => `z-index: ${v} is ad hoc. Use var(--z-dropdown|sticky|overlay|modal|toast) from the z-index scale. [5.3, P14 P19 P22]`,
});
const zIndexScale = createPlugin(zName, (enabled) => (root, result) => {
  if (!enabled) return;
  root.walkDecls("z-index", (decl) => {
    const v = decl.value.trim();
    if (/^var\(--z-/.test(v) || ["0", "-1", "auto", "1"].includes(v)) return;
    utils.report({ ruleName: zName, result, node: decl, message: zMessages.rejected(v) });
  });
});
zIndexScale.ruleName = zName;
zIndexScale.messages = zMessages;

/**
 * 6.3 / 6.5 / 1.16 — component CSS takes its visual values from tokens. Literal colours, radii, shadows,
 * font sizes and font families are allowed only where tokens are defined (custom properties, :root,
 * @theme) or in files listed as theme files. Same definition as ESLint and CSS-in-JS (lib/tokens.js).
 */
const tvName = `${NS}/token-values`;
const tvMessages = utils.ruleMessages(tvName, {
  rejected: (prop, v, why) => `${prop}: ${v} — ${why}. Define a token (custom property / @theme) and use var(--…), so every component draws the same value. [6.5, P33 P46]`,
});
const tokenValues = createPlugin(tvName, (enabled, opts = {}) => (root, result) => {
  if (!enabled) return;
  const file = (root.source && root.source.input.file) || "";
  if ((opts.themeFiles || []).some((g) => new RegExp(g).test(file))) return;
  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) return; // token definition
    if (inside(decl, ["theme", "keyframes", "font-face"])) return;
    if (decl.parent && decl.parent.type === "rule" && /^(:root|html|\.dark|\[data-theme[^\]]*\])$/.test(decl.parent.selector.trim())) return;
    for (const why of cssValueProblems(decl.prop, decl.value)) utils.report({ ruleName: tvName, result, node: decl, message: tvMessages.rejected(decl.prop, decl.value, why) });
  });
});
tokenValues.ruleName = tvName;
tokenValues.messages = tvMessages;

/**
 * 6.5 — @apply takes theme utilities only. Arbitrary values (rounded-[13px], bg-[#fef3c7], text-[11px],
 * shadow-[…]) and raw palette hues are rejected; [var(--token)] is a token and passes.
 */
const applyName = `${NS}/apply-values`;
const applyMessages = utils.ruleMessages(applyName, {
  rejected: (tok, why) => `@apply ${tok} — ${why}. @apply may only use theme utilities (bg-primary, rounded-lg, text-sm) or [var(--token)]. [6.5, P33 P46]`,
});
const applyValues = createPlugin(applyName, (enabled) => (root, result) => {
  if (!enabled) return;
  root.walkAtRules("apply", (at) => {
    for (const tok of at.params.replace(/!important/g, "").split(/\s+/).filter(Boolean)) {
      const why = tinyText(tok) ? "font size below 12px" : arbitraryKind(tok) ? `arbitrary ${arbitraryKind(tok)}` : isPalette(tok) ? "raw palette colour" : null;
      if (why) utils.report({ ruleName: applyName, result, node: at, message: applyMessages.rejected(tok, why) });
    }
  });
});
applyValues.ruleName = applyName;
applyValues.messages = applyMessages;

export default [requireLayer, zIndexScale, tokenValues, applyValues];
