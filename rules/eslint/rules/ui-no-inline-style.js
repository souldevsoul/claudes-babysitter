// ui/no-inline-style (3.3) — the `style` prop is forbidden. The single exception is an object literal whose
// keys are ALL CSS custom properties: style={{ "--progress": value }} hands a dynamic value to a class.
//   1.15 / 6.5 / 5.3 — colour, type, spacing, size, z-index in style bypass every token and every lint rule.
import { meta, resolveConst } from "../util.js";

const keyName = (p) => (p.key.type === "Identifier" && !p.computed ? p.key.name : p.key.type === "Literal" ? String(p.key.value) : null);
// outside JSX a `style` key can belong to anything (docx, charts, e-mail builders) — there only CSS visual keys count
const VISUAL_CSS = /^(color|background(Color|Image)?|border(Top|Right|Bottom|Left)?(Color|Width|Radius|Style)?|borderRadius|boxShadow|outline(Color)?|font(Size|Family|Weight|Style)?|lineHeight|letterSpacing|textDecoration|textTransform|margin(Top|Right|Bottom|Left|Inline|Block)?|padding(Top|Right|Bottom|Left|Inline|Block)?|gap|rowGap|columnGap|zIndex|opacity|fill|stroke|width|height|minWidth|minHeight|maxWidth|maxHeight)$/;

export const uiNoInlineStyle = {
  meta: meta("No style prop — only CSS custom properties may be passed inline", "1.15 / 6.5 / 5.3", "P04 P22 P33 P46", {
    messages: {
      prop: 'style sets "{{keys}}" inline. The style prop may only carry CSS custom properties: style={ { "--x": value } } read by a token class. [6.5, P33 P46]',
      spread: "Spreading into style ({...{{name}}}) is forbidden — it hides which properties are set. Pass CSS custom properties explicitly. [6.5]",
      notLiteral: "style={ {{text}} } cannot be verified. Use an object literal of CSS custom properties: style={ { \"--x\": value } }. [6.5]",
      string: 'style="…" as a string is forbidden. Use token classes; pass dynamic values as CSS custom properties. [6.5]',
      definition: 'A style object sets "{{keys}}" (written here, used elsewhere). Move the values to token classes; only CSS custom properties may travel inline. [6.5, P33 P46]',
      opaque: "Props spread from the import {{name}} onto a DOM element may carry a style that cannot be checked here. Pass explicit props. [6.5]",
    },
  }),
  create(context) {
    const judge = (reportNode, expr) => {
      if (!expr) return;
      if (expr.type !== "ObjectExpression") return context.report({ node: reportNode, messageId: "notLiteral", data: { text: context.sourceCode.getText(expr).slice(0, 40) } });
      const bad = [];
      for (const p of expr.properties) {
        if (p.type === "SpreadElement") { context.report({ node: p, messageId: "spread", data: { name: context.sourceCode.getText(p.argument).slice(0, 30) } }); continue; }
        const k = keyName(p);
        if (k === null || !k.startsWith("--")) bad.push(k ?? "[computed]");
      }
      if (bad.length) context.report({ node: reportNode, messageId: "prop", data: { keys: bad.join(", ") } });
    };
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "style" || !node.value) return;
        if (node.value.type === "Literal") return context.report({ node, messageId: "string" });
        if (node.value.type === "JSXExpressionContainer") judge(node, node.value.expression);
      },
      // <div {...{ style: {...} }} />  — and imported props objects spread onto DOM elements
      JSXSpreadAttribute(node) {
        const arg = node.argument;
        if (arg.type === "ObjectExpression") {
          const st = arg.properties.find((p) => p.type === "Property" && keyName(p) === "style");
          if (st) judge(st, st.value);
          return;
        }
        if (arg.type === "Identifier" && /^[a-z]/.test(node.parent.name.name || "")) {
          let v = null;
          for (let sc = context.sourceCode.getScope(node); sc && !v; sc = sc.upper) v = sc.set.get(arg.name);
          if (v && v.defs[0] && v.defs[0].type === "ImportBinding") context.report({ node, messageId: "opaque", data: { name: arg.name } });
        }
      },
      // `style: { color: "#999" }` written in a module and spread/used elsewhere — judged where it is written
      Property(node) {
        if (keyName(node) !== "style" || node.value.type !== "ObjectExpression") return;
        const anc = node.parent && node.parent.parent;
        if (anc && (anc.type === "JSXSpreadAttribute" || anc.type === "JSXExpressionContainer")) return; // handled above
        const bad = node.value.properties.filter((p) => p.type === "Property" && VISUAL_CSS.test(keyName(p) || "")).map(keyName);
        if (bad.length) context.report({ node, messageId: "definition", data: { keys: bad.join(", ") } });
      },
    };
  },
};
