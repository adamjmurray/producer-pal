import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

// See .claude/skills/refactoring/SKILL.md for refactoring guidelines
// to address max function/file length violations, complexity violations, etc

const baseRules = {
  // Comparison & Equality
  eqeqeq: ["error", "always", { null: "ignore" }], // Force === and !== (except for null checks)
  yoda: ["error", "never"], // Disallow `if (5 === x)`, require `if (x === 5)`

  // Variable Declarations
  "no-var": "error", // Force let/const instead of var
  "prefer-const": "error", // Use const when variable isn't reassigned

  // Import Quality
  "import/no-cycle": "error", // Prevent circular dependencies
  "import/no-self-import": "error", // File can't import itself
  "import/no-useless-path-segments": "error", // No unnecessary .. in imports
  "import/no-relative-packages": "error", // Don't use relative paths to node_modules

  // Debug & Development
  "no-debugger": "error", // No debugger statements in production

  // Type Coercion
  "no-implicit-coercion": "error", // Force explicit conversions like Number() not !!x

  // Function Parameters
  "default-param-last": "error", // Default params must come after required params

  // Conditionals & Logic
  "no-lonely-if": "error", // if inside else block should use else if
  "no-constant-binary-expression": "error", // Catches `if (x || true)` logic bugs
  "no-self-compare": "error", // x === x is always a mistake
  "no-else-return": "error", // If return in if block, else is unnecessary (forces early returns)
  "no-unneeded-ternary": "error", // `x ? true : false` should be `!!x`

  // Loop Quality
  "no-unmodified-loop-condition": "error", // Detects infinite loops from unchanging conditions
  "no-unreachable-loop": "error", // Catches loops that only execute once
  "no-loop-func": "error", // Functions in loops capture wrong variable values

  // Constructor Issues
  "no-constructor-return": "error", // Constructors shouldn't return values

  // Operators
  "no-sequences": "error", // Comma operator is usually a mistake

  // Async/Race Conditions
  "require-atomic-updates": "error", // Detects race conditions in async code

  // Dead Code
  "no-useless-return": "error", // Remove unnecessary return statements

  // Object Access
  "no-extra-bind": "error", // Remove unnecessary .bind() calls
  "no-useless-concat": "error", // "a" + "b" should be "ab"

  // Security - eval family
  "no-eval": "error", // Never use eval()
  "no-new-func": "error", // Never use new Function()

  // Complexity rules
  "max-lines-per-function": [
    "error",
    {
      max: 200, // TODO: lower this (final target: 100)
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  // TODO: lower this (final target: 4):
  "max-depth": ["error", 5], // limits nesting depth (if/for/while blocks)
  // TODO: lower this (final target: 15):
  complexity: ["error", 25], // cyclomatic complexity (number of independent code paths)
};

const jsOnlyRules = {
  "no-unused-vars": [
    // Unused variables (allow _prefixed to signal intentional)
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],

  // Error Handling (TS has better type-aware version)
  "no-throw-literal": "error", // Only throw Error objects, not strings/numbers

  // Object Access (TS has type-aware version)
  "dot-notation": "error", // Use obj.key not obj['key'] when possible

  // Security (TS has type-aware version)
  "no-implied-eval": "error", // Prevents setTimeout/setInterval with strings

  // Variable Shadowing (TS has type-aware version)
  "no-shadow": "error", // Prevents var x shadowing outer x
};

const tsOnlyRules = {
  "@typescript-eslint/no-unused-vars": [
    // Unused variables (allow _prefixed to signal intentional)
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-explicit-any": "error", // Force proper typing instead of any
  "@typescript-eslint/no-non-null-assertion": "error", // No ! operator - use proper null checks
  "@typescript-eslint/consistent-type-imports": "error", // Use `import type` for types
  "@typescript-eslint/prefer-nullish-coalescing": "error", // Use ?? instead of || for null/undefined
  "@typescript-eslint/prefer-optional-chain": "error", // Use a?.b instead of a && a.b
  "@typescript-eslint/no-unnecessary-condition": "error", // Remove conditions that are always true/false
  "@typescript-eslint/no-floating-promises": "error", // Must await or .catch() promises
  "@typescript-eslint/await-thenable": "error", // Only await actual promises
  "@typescript-eslint/no-misused-promises": "error", // Don't use promises in conditionals/spreads
  "@typescript-eslint/only-throw-error": "error", // Only throw Error objects (type-aware)
  "@typescript-eslint/dot-notation": "error", // Use obj.key not obj['key'] (type-aware)
  "@typescript-eslint/no-implied-eval": "error", // Prevents eval-like patterns (type-aware)
  "@typescript-eslint/no-shadow": "error", // Prevents shadowing (type-aware)
};

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

  // All JavaScript files (any directory)
  {
    files: ["{src,scripts,webui}/**/*.{js,mjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": { node: true },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
      ...jsOnlyRules,
    },
  },

  // All TypeScript files (any directory)
  {
    files: ["{src,scripts,webui}/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      ...tsOnlyRules,
    },
  },

  // Node.js code
  {
    files: ["{src,scripts}/**/*.{js,mjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // webui/react-specific rules
  {
    files: ["webui/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./webui/tsconfig.json",
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./webui/tsconfig.json",
        },
      },
    },
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },

  // Max for Live / Live API rules
  {
    files: ["src/**/*.js"],
    languageOptions: {
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
  },

  // Test files - relax some rules
  {
    files: ["**/*.test.{js,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": "off",
      complexity: ["error", 60],
    },
  },

  // Max file size rules
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
      "src/tools/shared/gain-lookup-table.js", // Auto-generated data
    ],
    rules: {
      "max-lines": [
        "error",
        {
          max: 400, // Much lower now that comments don't count
          skipBlankLines: true,
          skipComments: true,
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
