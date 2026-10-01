// eslint-plugin-babysitter — enforces ui-architecture-guidelines.md (Nexus patterns P01–P58).
import { noNativeControls, noNativeDialogs, noAuthLibraryPages, noAdhocButton } from "./rules/controls.js";
import {
  noVisualClassnameOverride, noTransitionAll, noArbitrarySpacing, noIllegibleText, noScrollRail,
  noArbitraryValues, noThinKitWrapper, noRawPalette, noStylesOutsideKit,
} from "./rules/classes.js";
import { noEmoji, imgDimensions, noInlineStyle } from "./rules/content.js";
import { noDynamicClasses, noCssInJsLiterals } from "./rules/ast.js";
import { DEFAULT_KIT, DEFAULT_THEME_PATHS } from "./util.js";

const rules = {
  "no-native-controls": noNativeControls,
  "no-native-dialogs": noNativeDialogs,
  "no-auth-library-pages": noAuthLibraryPages,
  "no-adhoc-button": noAdhocButton,
  "no-visual-classname-override": noVisualClassnameOverride,
  "no-thin-kit-wrapper": noThinKitWrapper,
  "no-inline-style": noInlineStyle,
  "no-arbitrary-values": noArbitraryValues,
  "no-raw-palette": noRawPalette,
  "no-styles-outside-kit": noStylesOutsideKit,
  "no-transition-all": noTransitionAll,
  "no-arbitrary-spacing": noArbitrarySpacing,
  "no-illegible-text": noIllegibleText,
  "no-scroll-rail": noScrollRail,
  "no-dynamic-classes": noDynamicClasses,
  "no-css-in-js-literals": noCssInJsLiterals,
  "no-emoji": noEmoji,
  "img-dimensions": imgDimensions,
};

const plugin = { meta: { name: "eslint-plugin-babysitter", version: "3.0.0" }, rules, configs: {} };

/**
 * Build the config from a project's babysitter.config.json:
 *   { "kit": ["Button", "StatTile", …], "themePaths": ["**\/components/ui/**"],
 *     "allow": { "rails": false, "emoji": false, "negativeMargins": false, "palette": false, "lightWeights": false } }
 * Allowances are explicit, per project, and visible in review — not silent disables.
 */
plugin.configs.create = (project = {}) => {
  const allow = project.allow || {};
  const kit = [...new Set([...DEFAULT_KIT, ...(project.kit || [])])];
  const themePaths = project.themePaths || DEFAULT_THEME_PATHS;
  const uiKitPaths = project.uiKitPaths || ["**/components/ui/**"];
  return [
    {
      name: "babysitter/",
      files: ["**/*.{jsx,tsx,ts,js,mjs}"],
      plugins: { ui: plugin },
      rules: {
        "ui/no-native-controls": ["error", { uiKitPaths }],
        "ui/no-native-dialogs": "error",
        "ui/no-auth-library-pages": "error",
        "ui/no-adhoc-button": "error",
        "ui/no-visual-classname-override": ["error", { components: kit }],
        "ui/no-thin-kit-wrapper": ["error", { components: kit }],
        "ui/no-inline-style": "error",
        "ui/no-arbitrary-values": ["error", { themePaths }],
        "ui/no-raw-palette": allow.palette ? "off" : ["error", { themePaths }],
        "ui/no-styles-outside-kit": ["error", { themePaths }],
        "ui/no-transition-all": "error",
        "ui/no-arbitrary-spacing": ["error", { allowNegative: !!allow.negativeMargins }],
        "ui/no-illegible-text": "error",
        "ui/no-scroll-rail": allow.rails ? "off" : "error",
        "ui/no-dynamic-classes": "error",
        "ui/no-css-in-js-literals": allow.cssInJsLiterals ? "off" : ["error", { themePaths }],
        "ui/no-emoji": allow.emoji ? "off" : "error",
        "ui/img-dimensions": "error",
      },
    },
    {
      // The kit itself wraps native elements and defines the visual classes.
      name: "babysitter/",
      files: uiKitPaths.map((p) => `${p.replace(/\/\*\*$/, "")}/**/*.{jsx,tsx,ts,js,mjs}`),
      rules: { "ui/no-native-controls": "off", "ui/no-visual-classname-override": "off", "ui/no-adhoc-button": "off", "ui/no-inline-style": "off" },
    },
  ];
};

const [recommended, uiKit] = plugin.configs.create();
plugin.configs.recommended = recommended;
plugin.configs.uiKit = uiKit;

export default plugin;
