// Content-level rules: emoji as icons, images without reserved space.
import { meta, elementName, getAttr, classTokens, base, resolveConst, resolveMember } from "../util.js";

const EMOJI = /\p{Extended_Pictographic}/u;
const ALLOWED = new Set(["©", "®", "™", "↔", "↕", "↩", "↪", "‼", "⁉", "ℹ"]);

/** 1.12 — icons come from the icon set, never emoji. */
export const noEmoji = {
  meta: meta("No emoji in UI text — use the icon set", "1.12", "P40", {
    messages: { emoji: 'Emoji "{{ch}}" in UI. Emoji render differently on every OS; use an icon from the icon set (lucide-react). [1.12, P40]' },
  }),
  create(context) {
    const check = (node, text) => {
      for (const ch of text) {
        if (EMOJI.test(ch) && !ALLOWED.has(ch)) {
          context.report({ node, messageId: "emoji", data: { ch } });
          return;
        }
      }
    };
    return {
      JSXText(node) { check(node, node.value); },
      JSXExpressionContainer(node) {
        const e = node.expression;
        if (e.type === "Literal" && typeof e.value === "string") check(node, e.value);
        if (e.type === "TemplateLiteral") e.quasis.forEach((q) => check(node, q.value.cooked || ""));
      },
      JSXAttribute(node) {
        if (!node.name || !["title", "placeholder", "aria-label", "alt", "label"].includes(node.name.name)) return;
        const v = node.value;
        if (v && v.type === "Literal" && typeof v.value === "string") check(node, v.value);
      },
    };
  },
};

/** 2.13 — images reserve their box (no CLS). */
export const imgDimensions = {
  meta: meta("Images reserve space: width/height or an aspect/size class", "2.13", "P43", {
    messages: { dims: "<img> without width/height or an aspect-*/size class shifts the layout when it loads. Use next/image or set width+height. [2.13, P43]" },
  }),
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (elementName(node) !== "img") return;
        if (node.attributes.some((a) => a.type === "JSXSpreadAttribute")) return;
        if (getAttr(node, "width") && getAttr(node, "height")) return;
        const toks = classTokens(getAttr(node, "className"), context).map(base);
        const sized = toks.some((t) => /^aspect-/.test(t) || /^size-/.test(t)) ||
          (toks.some((t) => /^h-/.test(t)) && toks.some((t) => /^w-/.test(t))) ||
          toks.some((t) => t === "absolute" || t === "inset-0" || t === "fixed");
        if (!sized) context.report({ node, messageId: "dims" });
      },
    };
  },
};

/**
 * 1.15 / 6.5 / 5.3 — inline style may only carry dynamic geometry and CSS variables.
 * Colour, type, spacing, radius, shadow and z-index in style={{}} bypass every token and lint rule.
 */
const STYLE_ALLOWED = new Set([
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "top", "left", "right", "bottom", "inset",
  "transform", "translate", "rotate", "scale", "transformOrigin", "gridTemplateColumns", "gridTemplateRows", "gridColumn",
  "gridRow", "gridArea", "aspectRatio", "backgroundImage", "backgroundPosition", "objectPosition", "animationDelay",
  "animationDuration", "transitionDelay", "flexBasis", "order", "clipPath", "strokeDasharray", "strokeDashoffset", "display", "visibility", "pointerEvents", "cursor",
]);
export const noInlineStyle = {
  meta: meta("Inline style carries only dynamic geometry and CSS variables", "1.15 / 6.5 / 5.3", "P04 P22 P33 P46", {
    messages: {
      prop: 'Inline style "{{prop}}" sets a visual value outside the theme{{via}}. Use a token class, or pass a dynamic value as a CSS variable (style["--progress"]) read by a class. [6.5, P33 P46]',
      opaque: "Inline style{{via}} cannot be checked statically. Use classes, or an object literal with CSS variables. [6.5]",
    },
  }),
  create(context) {
    // checks a style object, following const references and ...spreads (style={base}, {{...base, color}})
    const checkStyle = (node, expr, via, seen = new Set()) => {
      if (!expr) return;
      if (expr.type === "Identifier" || expr.type === "MemberExpression") {
        const target = expr.type === "Identifier" ? resolveConst(context, expr) : resolveMember(context, expr);
        if (target && !seen.has(target)) { seen.add(target); return checkStyle(node, target, via || ` (via ${context.sourceCode.getText(expr)})`, seen); }
        return context.report({ node, messageId: "opaque", data: { via: via || ` from ${context.sourceCode.getText(expr)}` } });
      }
      if (expr.type === "CallExpression" || expr.type === "ConditionalExpression" || expr.type === "LogicalExpression") return context.report({ node, messageId: "opaque", data: { via: via || "" } });
      if (expr.type !== "ObjectExpression") return;
      for (const p of expr.properties) {
        if (p.type === "SpreadElement") { checkStyle(node, p.argument, ` (via ...${context.sourceCode.getText(p.argument)})`, seen); continue; }
        if (p.type !== "Property") continue;
        const key = p.key.type === "Identifier" ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null;
        if (!key || key.startsWith("--") || STYLE_ALLOWED.has(key)) continue;
        // a theme token is fine: style={{ color: "var(--brand)" }}
        if (p.value.type === "Literal" && typeof p.value.value === "string" && /^var\(--[\w-]+\)$/.test(p.value.value.trim())) continue;
        context.report({ node: p, messageId: "prop", data: { prop: key, via: via || "" } });
      }
    };
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "style" || !node.value || node.value.type !== "JSXExpressionContainer") return;
        checkStyle(node, node.value.expression, "");
      },
      // <div {...{ style: {...} }} /> and <div {...props} /> where props is a const object with style
      JSXSpreadAttribute(node) {
        let obj = node.argument;
        if (obj.type === "Identifier") obj = resolveConst(context, obj);
        if (!obj || obj.type !== "ObjectExpression") return;
        const style = obj.properties.find((p) => p.type === "Property" && ((p.key.name || p.key.value) === "style"));
        if (style) checkStyle(style, style.value, " (via a spread props object)");
      },
    };
  },
};
