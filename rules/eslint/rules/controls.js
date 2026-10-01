// Native controls, native dialogs, auth-library pages, hand-built buttons.
import { meta, elementName, getAttr, staticAttrValue, classTokens, base, fileMatches } from "../util.js";

const UI_KIT_DEFAULT = ["**/components/ui/**"];

/** 1.1 — no native select/date/file/checkbox/radio/button outside the UI-kit. */
export const noNativeControls = {
  meta: meta("Use UI-kit components instead of native form controls", "1.1", "P01 P03 P04 P20 P50", {
    schema: [{ type: "object", properties: { uiKitPaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: {
      select: "Native <select> is forbidden: its open list is drawn by the OS and cannot be themed. Use the UI-kit <Select> (Radix). [1.1, P01]",
      input: 'Native <input type="{{type}}"> is forbidden. Use the UI-kit <{{replacement}}>. [1.1, {{pattern}}]',
      button: "Raw <button> in page/feature code is forbidden. Use <Button variant size>. [1.1/1.3, P04]",
    },
  }),
  create(context) {
    const allow = (context.options[0] && context.options[0].uiKitPaths) || UI_KIT_DEFAULT;
    if (fileMatches(context.filename, allow)) return {};
    const INPUTS = {
      date: ["DatePicker", "P03"],
      "datetime-local": ["DatePicker", "P03"],
      month: ["DatePicker", "P03"],
      time: ["TimePicker", "P03"],
      file: ["FileUpload", "P50"],
      checkbox: ["Checkbox", "P01"],
      radio: ["RadioGroup", "P01"],
    };
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (name === "select") context.report({ node, messageId: "select" });
        else if (name === "button") context.report({ node, messageId: "button" });
        else if (name === "input") {
          const type = (staticAttrValue(getAttr(node, "type")) || "").toLowerCase();
          if (INPUTS[type]) {
            const [replacement, pattern] = INPUTS[type];
            context.report({ node, messageId: "input", data: { type, replacement, pattern } });
          }
        }
      },
    };
  },
};

/** 1.1 — no window.confirm/alert/prompt. */
export const noNativeDialogs = {
  meta: meta("Use the UI-kit AlertDialog instead of browser dialogs", "1.1", "P20", {
    messages: { dialog: "{{fn}}() renders the browser's own dialog. Use the UI-kit <AlertDialog>. [1.1, P20]" },
  }),
  create(context) {
    const FNS = new Set(["confirm", "alert", "prompt"]);
    return {
      CallExpression(node) {
        const c = node.callee;
        let fn = null;
        if (c.type === "Identifier" && FNS.has(c.name)) fn = c.name;
        else if (
          c.type === "MemberExpression" &&
          !c.computed &&
          c.object.type === "Identifier" &&
          (c.object.name === "window" || c.object.name === "globalThis") &&
          FNS.has(c.property.name)
        )
          fn = c.property.name;
        if (fn) context.report({ node, messageId: "dialog", data: { fn } });
      },
    };
  },
};

/** 1.14 — never send users to auth-library pages (Auth.js signout/signin/error). */
export const noAuthLibraryPages = {
  meta: meta("Do not link to auth-library built-in pages", "1.14", "P20", {
    messages: {
      page: '"{{href}}" is the auth library\'s unstyled built-in page. Link to the product\'s own page (e.g. /logout) instead. [1.14, P20]',
    },
  }),
  create(context) {
    const RE = /\/api\/auth\/(signout|signin|error|verify-request)\b/;
    return {
      JSXAttribute(node) {
        if (!node.name || !["href", "action", "to"].includes(node.name.name)) return;
        const v = staticAttrValue(node);
        if (v && RE.test(v)) context.report({ node, messageId: "page", data: { href: v } });
      },
    };
  },
};

/**
 * 1.3 — a clickable element dressed up as a button with utility classes is a hand-built button.
 * Only clickable elements (href / onClick / role=button) count: a div or span with a background,
 * padding and radius is a card or a badge, not a button.
 */
export const noAdhocButton = {
  meta: meta("Do not hand-build buttons from utility classes", "1.3 / 1.5", "P04 P05", {
    messages: {
      adhoc: "Clickable <{{name}}> styled as a button (background/border + padding + radius). Use <Button asChild variant size><{{name}} …/></Button>. [1.3, P04]",
    },
  }),
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!/^[a-z]/.test(name) && !["Link", "NextLink"].includes(name)) return;
        if (name === "button") return; // covered by no-native-controls
        const role = getAttr(node, "role");
        const clickable = getAttr(node, "href") || getAttr(node, "onClick") || (role && /button|link/.test(staticAttrValue(role) || ""));
        if (!clickable) return;
        const toks = classTokens(getAttr(node, "className"), context).map(base);
        const hasFill = toks.some((t) => /^bg-(?!transparent|none|clip|cover|contain|center|fixed|local|scroll|no-repeat|repeat|origin|gradient-to)/.test(t)) ||
          toks.some((t) => /^border(-[0-9]|$)/.test(t));
        const hasPad = toks.some((t) => /^p[xy]?-/.test(t));
        const hasRadius = toks.some((t) => /^rounded/.test(t));
        if (hasFill && hasPad && hasRadius) context.report({ node, messageId: "adhoc", data: { name } });
      },
    };
  },
};
