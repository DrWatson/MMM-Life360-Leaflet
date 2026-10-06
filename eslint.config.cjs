const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["vendor/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }]
    }
  },
  {
    files: ["MMM-Life360-Leaflet.js", "demo/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, Module: "readonly", L: "readonly", moduleDefinition: "readonly" }
    }
  }
];
