// ui/numeric-input-bounds (FORMS FM1) — a number / amount / price / quantity / credits field carries its bounds:
// min AND max on the element, or a schema with both bounds in the same file (zod / yup .min().max(), a
// react-hook-form register("x", { min, max }), or a clamp with Math.min + Math.max). IBAN / card / phone fields carry
// a length limit (maxLength / pattern, or a schema .max() / .length() / .regex()).
// 44 of the factory's projects shipped a custom top-up / amount field that took -1, 999999999 or "abc".
import { meta, elementName, getAttr, staticAttrValue } from "../util.js";

const FIELD_COMPONENT = /^(input|Input|TextField|TextInput|NumberInput|NumericInput|AmountInput|CurrencyInput|FormInput|InputField|PriceInput|QuantityInput)$/;
const NOT_NUMERIC = /otp|one-?time|code|2fa|\bpin\b|zip|postal|postcode|search|cvc|cvv|expir|coupon|promo|referral|year|month|day/i;
const KIND = [
  ["iban", /iban/i],
  ["card", /card-?number|cc-?number|cardnumber/i],
  ["phone", /phone|mobile|whatsapp|^tel$/i],
  ["credits", /credits?/i],
  ["quantity", /qty|quantity|seats|units/i],
  ["price", /price|cost|budget/i],
  ["amount", /amount|top-?up|deposit|withdraw|payout|tip\b|donat/i],
];
const LENGTH_KINDS = new Set(["iban", "card", "phone"]);
const camelWords = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();

export const numericInputBounds = {
  meta: meta("Number / amount / quantity / credits / phone / IBAN fields carry bounds", "FM1", "numeric-input-validation", {
    messages: {
      number: '{{what}} has no {{missing}} — a user can type -1 or 999999999. Add min and max (and step={1} for whole numbers), clamp on blur or show the allowed range under the field; or bound it in the schema (z.number().min(…).max(…)). [FM1]',
      length: "{{what}} has no length limit — add maxLength / pattern (or a schema .max() / .regex()) and show the format under the field. [FM1]",
    },
  }),
  create(context) {
    const candidates = [];
    const bounded = new Map(); // schema key → Set of methods
    const registers = new Map(); // register("name", { min, max })
    const src = context.sourceCode.getText();
    const clamps = /Math\.min\s*\(/.test(src) && /Math\.max\s*\(/.test(src) || /\bclamp\s*\(/.test(src);
    const chainMethods = (node) => {
      const out = [];
      for (let n = node; n && n.type === "CallExpression"; ) {
        if (n.callee.type === "MemberExpression" && n.callee.property.type === "Identifier") { out.push(n.callee.property.name); n = n.callee.object; }
        else break;
      }
      return out;
    };
    return {
      Property(node) {
        if (node.value && node.value.type === "CallExpression") {
          const k = node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? String(node.key.value) : null;
          const ms = chainMethods(node.value);
          if (k && ms.length) bounded.set(k, new Set(ms));
        }
      },
      CallExpression(node) {
        const c = node.callee;
        const name = c.type === "Identifier" ? c.name : c.type === "MemberExpression" && c.property.type === "Identifier" ? c.property.name : null;
        if (name === "register" && node.arguments[0]?.type === "Literal" && node.arguments[1]?.type === "ObjectExpression") {
          registers.set(String(node.arguments[0].value), new Set(node.arguments[1].properties.filter((p) => p.type === "Property" && p.key.type === "Identifier").map((p) => p.key.name)));
        }
      },
      JSXOpeningElement(node) {
        const el = elementName(node);
        if (!el || !FIELD_COMPONENT.test(el.split(".").pop())) return;
        const val = (n) => { const a = getAttr(node, n); return a ? staticAttrValue(a) : undefined; };
        const has = (n) => !!getAttr(node, n);
        const type = (val("type") || "").toLowerCase();
        if (type && !["number", "text", "tel", ""].includes(type)) return;
        const always = (n) => { const a = getAttr(node, n); return !!a && (!a.value || (a.value.type === "JSXExpressionContainer" && a.value.expression.type === "Literal" && a.value.expression.value === true)); };
        if (always("readOnly") || always("disabled")) return;
        const im = (val("inputMode") || "").toLowerCase();
        // the field's name: name / id / register("x") / {...field} of a Controller named x
        let fieldName = val("name") || val("id") || "";
        for (const at of node.attributes) {
          if (at.type === "JSXSpreadAttribute" && at.argument.type === "CallExpression" && at.argument.callee.type === "Identifier" && at.argument.callee.name === "register" && at.argument.arguments[0]?.type === "Literal") fieldName = String(at.argument.arguments[0].value);
        }
        const keyText = camelWords([fieldName, val("placeholder"), val("aria-label"), val("autoComplete")].filter((x) => typeof x === "string").join(" "));
        if (NOT_NUMERIC.test(keyText)) return;
        let kind = null;
        for (const [k, re] of KIND) if (re.test(keyText)) { kind = k; break; }
        if (!kind && type === "tel") kind = "phone";
        if (!kind && (type === "number" || im === "numeric" || im === "decimal")) kind = "number";
        if (!kind) return;
        candidates.push({ node, kind, fieldName, type, has, val });
      },
      "Program:exit"() {
        for (const c of candidates) {
          const what = `${c.fieldName ? `"${c.fieldName}"` : "This"} ${c.kind === "number" ? "number" : c.kind} field`;
          const schema = bounded.get(c.fieldName) || null;
          const reg = registers.get(c.fieldName) || null;
          if (LENGTH_KINDS.has(c.kind)) {
            if (c.has("maxLength") || c.has("pattern")) continue;
            if (schema && ["max", "length", "regex", "matches", "refine", "superRefine"].some((m) => schema.has(m))) continue;
            if (reg && (reg.has("maxLength") || reg.has("pattern") || reg.has("validate"))) continue;
            context.report({ node: c.node, messageId: "length", data: { what } });
            continue;
          }
          const lo = c.has("min") || (schema && ["min", "gte", "gt", "positive", "nonnegative", "moreThan"].some((m) => schema.has(m))) || (reg && reg.has("min"));
          const hi = c.has("max") || (schema && ["max", "lte", "lt", "lessThan"].some((m) => schema.has(m))) || (reg && reg.has("max"));
          if (lo && hi) continue;
          if (clamps) continue; // the file clamps the value itself
          const missing = !lo && !hi ? "min / max" : !lo ? "min" : "max";
          context.report({ node: c.node, messageId: "number", data: { what, missing } });
        }
      },
    };
  },
};
