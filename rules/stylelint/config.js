// Stylelint config: `extends: ["claudes-babysitter/stylelint/config.js"]`.
// Blur, filters and light font weights are design choices and are NOT restricted here;
// legibility is measured at runtime (Playwright contrast check).
import plugins from "./plugin.js";

export default {
  plugins,
  rules: {
    "ui/require-layer": true, // 6.1
    "ui/z-index-scale": true, // 5.3
    "ui/token-values": [true, { themeFiles: ["/theme/", "tokens\\.css$"] }], // 6.3 / 6.5
    "ui/apply-values": true, // 6.5 — @apply with theme utilities only
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
