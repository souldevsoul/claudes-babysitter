// Interactive elements are reusable kit components — built once per site, used everywhere, always animated.
import { meta, elementName, getAttr, fileMatches } from "../util.js";

const UI_KIT_DEFAULT = ["**/components/ui/**"];

// headless libraries whose parts are interactive elements (overlays, menus, lists, disclosures, tabs…)
const HEADLESS = /^(@radix-ui\/react-(select|dropdown-menu|popover|dialog|alert-dialog|accordion|collapsible|tooltip|hover-card|context-menu|menubar|navigation-menu|tabs|toast|toggle-group|radio-group|checkbox|switch|slider|scroll-area)|radix-ui|@base-ui-components\/react(\/.*)?|@base-ui\/react(\/.*)?|@headlessui\/react|@ariakit\/react|vaul|cmdk|react-select|downshift|@reach\/[a-z-]+)$/;
// for the umbrella packages the imported name says what it is
const UMBRELLA = /^(radix-ui|@base-ui-components\/react|@base-ui\/react|@headlessui\/react|@ariakit\/react)$/;
const INTERACTIVE_NAME = /(select|dropdown|menu|popover|dialog|accordion|collapsible|disclosure|tooltip|hovercard|hover-card|tabs?|toast|combobox|listbox|sheet|drawer|popup|navigation)/i;

// a dropdown that replaces <select>: one implementation per site
const SELECT_IMPL = /^(@radix-ui\/react-select|@base-ui-components\/react\/(select|combobox)|@base-ui\/react\/(select|combobox)|react-select|downshift)$/; // cmdk is a command palette, not a select
const SELECT_NAMES = /^(Select|Combobox|Listbox)$/;

// state that opens / expands something — judged on the AST, not the text:
//   open, isOpen, menuOpen, isExpanded, showMenu, dropdownVisible, expanded[i], openKey === key, openIndex === i
//   not: !open (shown while closed), open.length > 0 / sku.open (data called "open"), loading
// "…Open" counts only after a UI noun: menuOpen, isMobileMenuOpen, filtersOpen, cartOpen — not buyingOpen /
// paymentsOpen / marketOpen (a business state called "open")
const UI_NOUN = "(menu|nav|navigation|sidebar|drawer|sheet|modal|dialog|dropdown|popover|tooltip|panel|filters?|search|cart|details|accordion|picker|select|list|options|more|faq|answer|question|section|item|row|group|mobile|user|account|lang|language|locale|currency|share|help|info|settings|preferences|manager|contents|toc|index|burger|hamburger|overlay|lightbox|palette|command|tray|flyout|submenu|subnav|toggle|expander|disclosure|card|step|tab)";
const OPEN_NAME = new RegExp(`^(is)?(open|opened|expanded)$|^[a-z]\\w*(Expanded|Collapsed)$|^(is|show)?\\w*${UI_NOUN}\\w*(Open|Opened)$|^show(Menu|Modal|Dialog|Dropdown|Panel|Drawer|Sheet|Popover|Tooltip|Picker|Options|List|Accordion|Details|More|All|Answer)$|^(menu|modal|dialog|dropdown|drawer|sheet|popover|tooltip|accordion|picker|panel)(Visible|Shown)$`, "i");
const OPEN_KEY = /^(open|expanded|active)(Key|Index|Id|Item|Section|Faq|Question|Panel|Tab|Row)$|^(open|expanded)[A-Z]\w*$/;
const nameOf = (n) => (n.type === "Identifier" ? n.name : n.type === "MemberExpression" && !n.computed ? n.property.name : null);
function opensSomething(n) {
  if (!n) return false;
  switch (n.type) {
    case "Identifier": return OPEN_NAME.test(n.name);
    case "MemberExpression":
      if (n.computed) return n.object.type === "Identifier" && (OPEN_NAME.test(n.object.name) || /^(open|expanded)\w*$/i.test(n.object.name)); // expanded[i], openItems[id]
      return /^is(Open|Expanded)$|[a-z](Open|Expanded)$/.test(n.property.name); // menu.isOpen — but not sku.open (data)
    case "BinaryExpression":
      if (!/^[!=]==?$/.test(n.operator) || n.operator.startsWith("!")) return false;
      return [n.left, n.right].some((x) => { const nm = nameOf(x); return !!nm && nm !== "length" && OPEN_KEY.test(nm); });
    case "LogicalExpression": return n.operator === "&&" && (opensSomething(n.left) || opensSomething(n.right));
    case "CallExpression": return n.callee.type === "Identifier" && /^is(Open|Expanded)$/.test(n.callee.name); // isOpen(id)
    default: return false; // !open, ternaries, calls… — not a panel being opened
  }
}

/** One dropdown per site: every file that implements a select-like list (across one lint run). */
const selectImpls = new Map(); // project root (nearest package.json dir is not known here — use cwd) → first file

/**
 * 1.18 — interactive elements (selects/dropdowns, menus, popovers, dialogs, sheets, accordions, collapsibles, tabs,
 * tooltips) are reusable kit components:
 *   • page/feature code never imports a headless library directly — it uses the kit component;
 *   • page/feature code never hand-builds one ({open && <div>…</div>}, native <details>, <dialog>, popover=);
 *   • the dropdown that replaces <select> exists once per site (a second implementation is an error, kit included).
 */
export const kitInteractive = {
  meta: meta("Interactive elements are reusable, animated kit components — one dropdown per site", "1.18", "P01 P59", {
    schema: [{ type: "object", properties: { uiKitPaths: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: {
      library: "{{what}} is imported from {{src}} in page/feature code. Interactive elements are reusable kit components: build it once in components/ui (styled with the theme, animated in and out) and use that here. [1.18]",
      handmade: "<{{name}}> is a hand-built interactive element ({{cond}}). Use the kit component for it (Select / DropdownMenu / Popover / Dialog / Sheet / Accordion / Collapsible / Tabs): one reusable, animated component per role, not a copy per page. [1.18, 6.12]",
      native: "<{{name}}{{attr}}> is the browser's own {{what}}: it cannot be themed consistently and opens/closes without motion. Use the kit {{kit}}. [1.18, 6.12]",
      secondSelect: "Two dropdown implementations on this site: {{first}} and this one ({{what}}). A site has exactly one custom dropdown that replaces <select> — keep the kit's (components/ui), give it the variants the other one needed (searchable, multi, sizes), and use it everywhere. [1.18]",
    },
  }),
  create(context) {
    const allow = (context.options[0] && context.options[0].uiKitPaths) || UI_KIT_DEFAULT;
    const inKit = fileMatches(context.filename, allow);
    const file = context.filename;
    const root = context.cwd || process.cwd();
    const claimSelect = (node, what) => {
      const first = selectImpls.get(root);
      if (!first) { selectImpls.set(root, { file, what }); return; }
      if (first.file === file) return;
      const rel = (f) => f.replace(root + "/", "");
      context.report({ node, messageId: "secondSelect", data: { what, first: `${rel(first.file)} (${first.what})` } });
    };
    return {
      ImportDeclaration(node) {
        const src = String(node.source.value);
        if (!HEADLESS.test(src)) return;
        // one dropdown per site — kit included
        if (SELECT_IMPL.test(src)) claimSelect(node, src);
        else if (UMBRELLA.test(src)) for (const sp of node.specifiers) { const n = sp.imported ? sp.imported.name || sp.imported.value : ""; if (SELECT_NAMES.test(n)) { claimSelect(node, `${n} from ${src}`); break; } }
        if (inKit) return;
        let what = src;
        if (UMBRELLA.test(src)) {
          const names = node.specifiers.map((sp) => (sp.imported ? sp.imported.name || sp.imported.value : sp.local.name)).filter((n) => INTERACTIVE_NAME.test(n));
          if (!names.length && !/\//.test(src.replace(/^@[^/]+\//, ""))) return; // e.g. a utility from the umbrella, not an element
          if (names.length) what = names.join(", ");
        }
        context.report({ node, messageId: "library", data: { what, src } });
      },
      JSXOpeningElement(node) {
        const name = elementName(node);
        // role="listbox" drawn by hand is a dropdown implementation too — counted in the kit as well
        const role = getAttr(node, "role");
        if (role && role.value && role.value.type === "Literal" && role.value.value === "listbox") claimSelect(node, `role="listbox" in <${name}>`);
        if (inKit) return;
        if (name === "details") return context.report({ node, messageId: "native", data: { name, attr: "", what: "disclosure", kit: "Accordion / Collapsible" } });
        if (name === "dialog") return context.report({ node, messageId: "native", data: { name, attr: "", what: "dialog", kit: "Dialog / Sheet" } });
        if (/^[a-z]/.test(name) && getAttr(node, "popover")) return context.report({ node, messageId: "native", data: { name, attr: " popover", what: "popover", kit: "Popover / DropdownMenu / Select" } });
        // hidden={!menuOpen}: a panel toggled by hand — no motion, and the role belongs to a kit component
        const hid = getAttr(node, "hidden");
        if (/^[a-z]/.test(name) && hid && hid.value && hid.value.type === "JSXExpressionContainer") {
          const e = hid.value.expression;
          if (e.type === "UnaryExpression" && e.operator === "!" && opensSomething(e.argument)) return context.report({ node, messageId: "handmade", data: { name, cond: `hidden={${context.sourceCode.getText(e)}}` } });
        }
      },
      "LogicalExpression, ConditionalExpression"(node) {
        if (inKit) return;
        let cond, el;
        if (node.type === "LogicalExpression" && node.operator === "&&" && node.right.type === "JSXElement") { cond = node.left; el = node.right; }
        else if (node.type === "ConditionalExpression") {
          const nul = (n) => !n || (n.type === "Literal" && n.value === null) || (n.type === "Identifier" && n.name === "undefined");
          if (node.consequent.type === "JSXElement" && nul(node.alternate)) { cond = node.test; el = node.consequent; }
          else if (node.alternate.type === "JSXElement" && nul(node.consequent)) { cond = node.test; el = node.alternate; }
        }
        if (!el || !node.parent || node.parent.type !== "JSXExpressionContainer") return;
        if (!opensSomething(cond)) return;
        const condText = context.sourceCode.getText(cond);
        const name = elementName(el.openingElement);
        if (/^[A-Z]/.test(name) || /\./.test(name)) return; // a component (kit or feature): its own markup decides
        context.report({ node: el.openingElement, messageId: "handmade", data: { name, cond: `{${condText.replace(/\s+/g, " ")} && …}` } });
      },
    };
  },
};

/** Test hook: forget the "first dropdown" of previous runs. */
export const _resetSelectImpls = () => selectImpls.clear();
