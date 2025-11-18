import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default [
  {
    // Global ignores for generated/build files
    ignores: [
      "claude-desktop-extension/**",
      "config/**",
      "coverage/**",
      "dist/**",
      "docs/.vitepress/cache/**",
      "docs/.vitepress/dist/**",
      "knowledge-base/**",
      "max-for-live-device/**",
      "node_modules/**",
      "release/**",
      "src/notation/barbeat/barbeat-parser.js", // Generated parser
      "**/*.d.ts", // TypeScript declaration files
    ],
  },
  {
    files: ["webui/**/*.{ts,tsx}"],
    ...js.configs.recommended,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        project: "./webui/tsconfig.json",
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./webui/tsconfig.json",
        },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      // Import static analysis rules
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/no-relative-packages": "error",
    },
  },
  {
    files: ["scripts/**/*.{js,ts,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        node: true,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      // Import static analysis rules
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/no-relative-packages": "error",
    },
  },
  {
    files: ["src/**/*.{js,ts,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        // Max/MSP V8 globals
        LiveAPI: "readonly",
        outlet: "readonly",
        post: "readonly",
        Dict: "readonly",
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        node: true,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-debugger": "error",
      curly: ["error", "all"],
      "no-throw-literal": "error",
      "no-implicit-coercion": "error",
      "default-param-last": "error",
      "no-lonely-if": "error",
      // Import static analysis rules
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/no-relative-packages": "error",
    },
  },
  {
    // Test files - relax no-non-null-assertion rule
    files: ["**/*.test.{js,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: [
      "src/**/*.js",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
      "webui/**/*.ts",
    ],
    ignores: [
      "**/*.test.js",
      "**/*.test-helpers.js",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "max-lines": [
        "error",
        {
          max: 600,
        },
      ],
    },
  },
  {
    files: [
      "**/*.test.js",
      "**/*.test-helpers.js",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "max-lines": [
        "error",
        {
          max: 800,
        },
      ],
    },
  },
];
