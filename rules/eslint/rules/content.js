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
