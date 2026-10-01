// Used to lint the fixtures; copy this shape into a product repo.
import ui from "./rules/eslint/index.js";
export default [
  { files: ["**/*.jsx"], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
  ui.configs.recommended,
  ui.configs.uiKit,
];
