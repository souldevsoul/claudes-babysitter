// AST checks for the routes a generator uses to get around the class-string rules.
import postcss from "postcss";
import postcssScss from "postcss-scss";
import { meta, fileMatches, DEFAULT_THEME_PATHS } from "../util.js";
import { cssValueProblems } from "../../../lib/tokens.js";

/**
 * 6.5 / 1.16 — Tailwind classes assembled at runtime (`bg-${tone}-600`, `rounded-${size}`): the compiler
 * cannot see them (so they may not exist in the CSS at all) and no rule can check their value.
 */
const UTIL_PREFIX = /(?:^|\s)(?:!?[\w-]+:)*-?(bg|text|border(?:-[trblxy])?|rounded(?:-[trblxyse]{1,2})?|shadow|ring|outline|fill|stroke|from|via|to|p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|w|h|min-w|min-h|max-w|max-h|font|leading|tracking|z|opacity|decoration|divide|placeholder|accent|caret|grid-cols|col-span|row-span|top|left|right|bottom|inset)-$/;
export const noDynamicClasses = {
  meta: meta("No Tailwind classes built from interpolation", "6.5 / 1.16", "P33 P46", {
    messages: { bad: "`{{fragment}}${…}` builds a Tailwind class at runtime: the compiler cannot generate it and its value bypasses the theme. Map each case to a full class name (a variant in the kit, or a lookup object of complete classes). [6.5]" },
  }),
  create(context) {
    return {
      TemplateLiteral(node) {
        if (!node.expressions.length || (node.parent && node.parent.type === "TaggedTemplateExpression")) return;
        node.quasis.forEach((q, i) => {
          if (i >= node.expressions.length) return;
          const m = (q.value.cooked || "").match(UTIL_PREFIX);
          if (m) context.report({ node, messageId: "bad", data: { fragment: m[0].trim() } });
        });
      },
    };
  },
};

/**
 * 6.5 / 1.16 — CSS-in-JS (styled-components, emotion: styled.x`…`, styled(X)`…`, css`…`,
 * createGlobalStyle`…`, styled.x({ … })). The CSS is parsed (PostCSS AST) and every declaration is judged
 * by the same token rules as a stylesheet: literal colours, radii, shadows, font sizes/families, spacing.
 */
const isStyledTag = (t) => {
  if (!t) return false;
  if (t.type === "Identifier") return /^(css|createGlobalStyle|injectGlobal|keyframes)$/.test(t.name);
  if (t.type === "MemberExpression") { // styled.div, styled.div.attrs(...) handled via CallExpression
    let o = t.object; while (o && o.type === "MemberExpression") o = o.object;
    if (o && o.type === "CallExpression") return isStyledTag(o.callee);
    return o && o.type === "Identifier" && o.name === "styled";
  }
  if (t.type === "CallExpression") return (t.callee.type === "Identifier" && t.callee.name === "styled") || isStyledTag(t.callee); // styled(Button), styled.div.attrs({})
  return false;
};
const kebab = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
export const noCssInJsLiterals = {
  meta: meta("CSS-in-JS uses theme tokens, never literal values", "6.3 / 6.5 / 1.16", "P04 P33 P46", {
    schema: [{ type: "object", properties: { themePaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: { bad: "{{prop}}: {{value}} — {{why}} in CSS-in-JS. Use the theme token (var(--token) or the theme object) so it matches the rest of the product. [6.5, P33 P46]" },
  }),
  create(context) {
    const opts = context.options[0] || {};
    if (fileMatches(context.filename, opts.themePaths || DEFAULT_THEME_PATHS)) return {};
    const report = (node, prop, value) => {
      for (const why of cssValueProblems(prop, value, { strict: true })) context.report({ node, messageId: "bad", data: { prop, value: String(value).slice(0, 60), why } });
    };
    const checkObject = (obj) => {
      for (const p of obj.properties || []) {
        if (p.type !== "Property") continue;
        const k = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null;
        if (!k) continue;
        if (p.value.type === "ObjectExpression") { checkObject(p.value); continue; } // "&:hover": { … }
        const v = p.value.type === "Literal" ? p.value.value : p.value.type === "TemplateLiteral" && !p.value.expressions.length ? p.value.quasis[0].value.cooked : null;
        if (v !== null && v !== undefined) report(p, kebab(k), typeof v === "number" && !/opacity|z-index|font-weight|line-height|flex/.test(kebab(k)) ? `${v}px` : String(v));
      }
    };
    return {
      TaggedTemplateExpression(node) {
        if (!isStyledTag(node.tag)) return;
        const css = node.quasi.quasis.map((q, i) => (q.value.cooked || "") + (i < node.quasi.expressions.length ? `__EXPR${i}__` : "")).join("");
        let root;
        try { root = postcssScss.parse(`.x{${css}}`); } catch { try { root = postcss.parse(`.x{${css}}`); } catch { return; } }
        root.walkDecls((d) => report(node, d.prop, d.value));
      },
      CallExpression(node) {
        if (isStyledTag(node.callee) && node.arguments[0] && node.arguments[0].type === "ObjectExpression") checkObject(node.arguments[0]);
      },
    };
  },
};
