// Stylelint config: `extends: ["claudes-babysitter/stylelint/config.js"]`.
// Blur, filters and light font weights are design choices and are NOT restricted here;
// legibility is measured at runtime (Playwright contrast check).
import plugins from "./plugin.js";
// imported, not named: a plugin given by name is resolved from the PROJECT being linted, where it is not installed
import strictValue from "stylelint-declaration-strict-value";

export default {
  plugins: [...plugins, strictValue],
  rules: {
    "ui/require-layer": true, // 6.1
    "ui/z-index-scale": true, // 5.3
    "ui/token-values": [true, { themeFiles: ["/theme/", "tokens\\.css$"] }], // 6.3 / 6.5
    "ui/apply-values": true, // 6.5 — @apply with theme utilities only
    // 2.7 / 6.5 strict scale: colour, spacing, size, radius and border values come from tokens.
    // Custom properties (token definitions in :root / @theme) are not checked by this plugin.
    // Border-style keywords are allowed: `border: 1px solid var(--border)` is the token way to draw a border.
    "scale-unlimited/declaration-strict-value": [
      ["/color/", "margin", "padding", "gap", "width", "height", "border-radius", "border"],
      { ignoreValues: ["0", "auto", "inherit", "transparent", "currentColor", "100%", "none", "1px", "solid", "dashed", "dotted", "/^var\\(/", "/^calc\\(/"] },
    ],
    "declaration-property-value-disallowed-list": {
      transition: ["/\\ball\\b/", "/^[0-9.]+m?s/"], // 6.8
      "transition-property": ["all"],
      "font-size": ["/^([0-9]|1[01])(\\.\\d+)?px$/", "/^0?\\.[0-6]\\d*rem$/"], // 6.4 — below 12px
    },
    "selector-max-id": 0, // 6.2
    "declaration-no-important": true, // 5.4
    "color-named": "never", // 6.3
  },
};
