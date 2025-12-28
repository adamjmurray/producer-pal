import vitestPlugin from "@vitest/eslint-plugin";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
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
  "import/first": "error", // All imports must come before other statements
  "import/no-cycle": "error", // Prevent circular dependencies
  "import/no-self-import": "error", // File can't import itself
  "import/no-useless-path-segments": "error", // No unnecessary .. in imports
  "import/no-relative-packages": "error", // Don't use relative paths to node_modules
  "import/no-extraneous-dependencies": "error", // Catch dependencies used but not declared
  "import/order": [
    "error",
    {
      groups: [
        "builtin", // Node.js built-in modules
        "external", // npm packages
        "internal", // Aliased modules
        "parent", // ../
        "sibling", // ./
        "index", // ./index
      ],
      "newlines-between": "never", // No blank lines between groups
      alphabetize: {
        order: "asc",
        caseInsensitive: true,
      },
    },
  ],

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

  // Vertical spacing - enforces blank lines at logical locations
  "@stylistic/padding-line-between-statements": [
    "error",
    // Blank line after imports
    { blankLine: "always", prev: "import", next: "*" },
    { blankLine: "any", prev: "import", next: "import" },
    // Blank line after variable declarations block
    { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
    {
      blankLine: "any",
      prev: ["const", "let", "var"],
      next: ["const", "let", "var"],
    },
    // Blank line before return
    { blankLine: "always", prev: "*", next: "return" },
    // Blank line before/after multiline block-like statements
    { blankLine: "always", prev: "*", next: "multiline-block-like" },
    { blankLine: "always", prev: "multiline-block-like", next: "*" },
  ],

  // Complexity rules
  "max-lines-per-function": [
    "error",
    {
      max: 120,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "max-depth": ["error", 4], // limits nesting depth (if/for/while blocks)
  complexity: ["error", 20], // cyclomatic complexity (number of independent code paths)
};

const jsdocRules = {
  // Inline documentation requirements:
  "jsdoc/require-jsdoc": [
    "error",
    {
      require: {
        FunctionDeclaration: true,
        FunctionExpression: false,
        MethodDefinition: false,
      },
      publicOnly: { esm: true }, // Only require JSDoc on exported functions
    },
  ],
  "jsdoc/require-param": ["error", { enableFixer: false }],
  "jsdoc/require-param-description": "error",
  "jsdoc/require-param-type": "error",
  "jsdoc/require-returns": "error",
  "jsdoc/require-returns-description": "error",
  "jsdoc/require-returns-type": "error",
  "jsdoc/check-types": "error",
};

const sonarCoreRules = {
  // Code quality
  "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
  "sonarjs/no-identical-functions": "error",
  "sonarjs/cognitive-complexity": ["error", 20],

  // Bug detectors:
  "sonarjs/no-duplicated-branches": "error", // real bug smell
  "sonarjs/no-element-overwrite": "error", // likely bug
  "sonarjs/no-redundant-assignments": "error", // pointless/buggy reassign
  "sonarjs/no-invariant-returns": "error", // every branch returns same thing
  "sonarjs/no-identical-expressions": "error", // x === x, a && a bugs
  "sonarjs/no-identical-conditions": "error", // duplicate if conditions
  "sonarjs/non-existent-operator": "error", // =+ instead of += typos
  "sonarjs/no-collection-size-mischeck": "error", // array.length < 0
  "sonarjs/no-use-of-empty-return-value": "error", // using void function results
  "sonarjs/no-nested-assignment": "error", // if (x = y) bugs
  "sonarjs/no-all-duplicated-branches": "error", // all branches identical
  "sonarjs/no-array-delete": "error", // delete array[i] creates holes
  "sonarjs/array-callback-without-return": "error", // map/filter without return

  // Async/Promise
  "sonarjs/no-try-promise": "error", // wrong async error handling
  "sonarjs/no-unthrown-error": "error", // new Error() not thrown

  // Security
  "sonarjs/no-hardcoded-passwords": "error", // password literals
  "sonarjs/no-hardcoded-secrets": "error", // API keys/tokens

  // Test quality
  "sonarjs/assertions-in-tests": "error", // tests need assertions
  "sonarjs/no-exclusive-tests": "error", // no .only() in commits
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

  // JSDoc overrides for TypeScript - TS types are source of truth
  "jsdoc/require-param-type": "off", // TypeScript types are authoritative
  "jsdoc/require-returns-type": "off", // TypeScript types are authoritative
  "jsdoc/check-types": "off", // Don't validate redundant JSDoc types
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
      "test-results/**",
      "src/notation/barbeat/parser/barbeat-parser.js", // Generated parser
      "src/notation/modulation/parser/modulation-parser.js", // Generated parser
      "**/*.d.ts", // TypeScript declaration files
    ],
  },

  // All JavaScript files (any directory)
  {
    files: ["{src,scripts,webui,tests}/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@stylistic": stylistic,
      import: importPlugin,
      sonarjs,
      jsdoc,
    },
    settings: {
      "import/resolver": {
        alias: {
          map: [
            ["#webui", "./webui/src"],
            ["#src", "./src"],
          ],
          extensions: [".js", ".mjs", ".ts", ".tsx"],
        },
        node: true,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
      ...sonarCoreRules,
      ...jsOnlyRules,
      ...jsdocRules,
    },
  },

  // WebUI TypeScript files
  {
    files: ["webui/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        project: "./webui/tsconfig.json", // Explicit path for type-aware rules
      },
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      sonarjs,
      jsdoc,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      ...sonarCoreRules,
      ...jsdocRules, // JSDoc required for TS (but not type annotations)
      ...tsOnlyRules, // Overrides: turns off jsdoc/require-param-type and jsdoc/check-types
    },
  },

  // Scripts TypeScript files (CLI tools)
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./scripts/chat-lib/tsconfig.json",
      },
      globals: {
        ...globals.node,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./scripts/chat-lib/tsconfig.json",
        },
        node: true,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      sonarjs,
      jsdoc,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      ...sonarCoreRules,
      ...jsdocRules, // JSDoc required for TS (but not type annotations)
      ...tsOnlyRules, // Overrides: turns off jsdoc/require-param-type and jsdoc/check-types
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

  // Playwright docs tests (JavaScript)
  {
    files: ["tests/docs/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      import: importPlugin,
      sonarjs,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "no-loop-func": "off", // Common pattern in Playwright tests
    },
  },

  // Playwright UI tests (TypeScript)
  {
    files: ["tests/webui/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tests/webui/tsconfig.json",
      },
      globals: {
        ...globals.node,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tests/webui/tsconfig.json",
        },
        node: true,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      sonarjs,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      "no-loop-func": "off", // Common pattern in Playwright tests
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
        Folder: "readonly",
        outlet: "readonly",
        post: "readonly",
        Dict: "readonly",
        Task: "readonly",
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

  // Require extensions for src and scripts (unbundled Node.js execution)
  {
    files: ["{src,scripts}/**/*.{js,mjs}"],
    rules: {
      // Node.js ESM requires explicit file extensions for relative imports.
      // See: https://nodejs.org/api/esm.html#import-specifiers
      "import/extensions": [
        "error",
        "always",
        {
          js: "always",
          ignorePackages: true,
        },
      ],
    },
  },

  // No extensions for webui (bundled code)
  {
    files: ["webui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^\\..*\\.(jsx?|tsx?)$/]",
          message:
            "Do not use file extensions in relative imports (bundlers handle resolution)",
        },
        {
          selector: "ImportDeclaration[source.value=/^\\.\\.\\x2f\\.\\./]",
          message: "Use path alias (#webui/*) instead of ../../ imports",
        },
        {
          selector: "ImportExpression[source.value=/^\\.\\.\\x2f\\.\\./]",
          message: "Use path alias (#webui/*) instead of ../../ imports",
        },
      ],
    },
  },

  // Enforce path aliases for deep imports in src files
  {
    files: ["src/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^\\.\\.\\x2f\\.\\./]",
          message: "Use path alias (#src/*) instead of ../../ imports",
        },
        {
          selector: "ImportExpression[source.value=/^\\.\\.\\x2f\\.\\./]",
          message: "Use path alias (#src/*) instead of ../../ imports",
        },
      ],
    },
  },

  // Test files - relax some rules
  {
    files: ["**/*.test.{js,ts,tsx}"],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": "off",
      complexity: ["error", 30],
      "sonarjs/no-duplicate-string": "off",
      "import/first": "off", // Test files need imports after vi.mock() calls
      "import/order": "off",
      // Enforce vi.mock(import('...')) syntax for proper module mocking
      "vitest/prefer-import-in-mock": "error",
      "vitest/consistent-test-it": ["error", { fn: "it" }], // or "test" - pick one
      "vitest/no-duplicate-hooks": "error",
      "vitest/no-test-return-statement": "error",
      "vitest/prefer-hooks-on-top": "error",
      "vitest/prefer-hooks-in-order": "error",
      "vitest/prefer-to-contain": "error",
      "vitest/prefer-to-have-length": "error",
      "vitest/prefer-comparison-matcher": "error",
      "vitest/prefer-strict-equal": "error",
    },
  },
  {
    files: ["**/*.test.{js,ts,tsx}"],
    rules: {
      "sonarjs/cognitive-complexity": ["error", 40],
    },
  },

  // Max file size rules
  {
    files: [
      "src/**/*.js",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
      "webui/**/*.ts",
      "webui/**/*.tsx",
    ],
    ignores: [
      "**/*.test.js",
      "**/*.test-helpers.js",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*-test-case.ts", // Test data fixtures
      "src/tools/shared/gain-lookup-table.js", // Auto-generated data
    ],
    rules: {
      "max-lines": [
        "error",
        {
          max: 325,
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
      "**/*-test-case.ts", // Test data fixtures
    ],
    rules: {
      "max-lines": [
        "error",
        {
          max: 675,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
];
