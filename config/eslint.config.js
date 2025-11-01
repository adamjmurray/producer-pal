import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    // Global ignores for generated/build files
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "claude-desktop-extension/**",
      "release/**",
      "max-for-live-device/**",
      "knowledge-base/**",
      "config/**",
    ],
  },
  {
    // Phase 1: Only lint webui/src/chat/ initially
    // Everything else is implicitly not linted since we only match these files
    files: ["webui/src/chat/**/*.{js,jsx,ts,tsx}"],
    ...js.configs.recommended,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
