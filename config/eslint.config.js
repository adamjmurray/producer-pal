import vitestPlugin from "@vitest/eslint-plugin";
import js from "@eslint/js";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import stylistic from "@stylistic/eslint-plugin";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
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
  // NOTE: This rule requires an empty .eslintrc.json at project root due to a
  // known limitation in eslint-plugin-import with flat config.
  // See: https://github.com/import-js/eslint-plugin-import/issues/3079
  "import/no-unused-modules": [
    "error",
    {
      unusedExports: true, // Report exports not imported anywhere
      // Entry points not imported by other modules (external entry points):
      ignoreExports: [
        "**/live-api-adapter.js", // Max for Live V8 entry point
        "**/producer-pal-portal.{js,ts}", // MCP stdio-to-http portal entry point
        "webui/src/main.tsx", // Chat UI entry point
        "**/test/**", // Test utilities and mocks
        "**/tests/**", // Test directories
        "**/*.test.{js,ts,tsx}", // Test files
        "**/*-test-helpers.js", // Test helpers
      ],
    },
  ],
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

  // ESLint directive comments - require explanation for any rule disabling
  "@eslint-community/eslint-comments/require-description": [
    "error",
    { ignore: [] }, // Require description for all directives
  ],
  "@eslint-community/eslint-comments/no-unlimited-disable": "error", // Must specify rules to disable
  "@eslint-community/eslint-comments/no-unused-disable": "error", // Clean up stale disables

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
  "@stylistic/lines-between-class-members": [
    "error",
    "always",
    { exceptAfterSingleLine: true },
  ], // Blank lines between methods, not properties

  // Complexity rules
  "max-lines-per-function": [
    "error",
    {
      max: 115,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "max-depth": ["error", 4], // limits nesting depth (if/for/while blocks)
  complexity: ["error", 19], // cyclomatic complexity (number of independent code paths)
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

  // Code simplification
  "sonarjs/no-nested-template-literals": "error", // avoid `${`nested`}` templates
  "sonarjs/no-redundant-boolean": "error", // no `x ? true : false`
  "sonarjs/no-redundant-jump": "error", // no unnecessary return/continue/break
  "sonarjs/prefer-immediate-return": "error", // return directly instead of temp var
  "sonarjs/prefer-single-boolean-return": "error", // simplify `if (x) return true; return false`
};

const unicornRules = {
  "unicorn/prefer-node-protocol": "error", // Use node: prefix for Node.js builtins
  "unicorn/better-regex": "error", // Optimize regex patterns
  "unicorn/prefer-string-replace-all": "error", // Use replaceAll() instead of replace(/g)
  "unicorn/prefer-array-find": "error", // Use find() instead of filter()[0]
  "unicorn/no-array-push-push": "error", // Combine multiple push() calls
  "unicorn/prefer-optional-catch-binding": "error", // Omit unused catch binding
  "unicorn/no-useless-spread": "error", // Remove unnecessary spread operators
  "unicorn/no-array-for-each": "error", // Prefer for...of over Array.forEach
  "unicorn/prefer-at": "error", // Use array.at(-1) instead of array[array.length - 1]
  "unicorn/prefer-set-has": "error", // Use Set.has() instead of Array.includes() for repeated checks
  "unicorn/no-lonely-if": "error", // Combine nested if with && (complements core no-lonely-if)
  "unicorn/no-useless-undefined": ["error", { checkArguments: false }], // Omit unnecessary undefined in returns
  "unicorn/prefer-number-properties": "error", // Use Number.isNaN() not isNaN(), Number.POSITIVE_INFINITY not Infinity
  "unicorn/prefer-ternary": ["error", "only-single-line"], // Simple if-else to ternary
  "unicorn/prefer-top-level-await": "error", // Use top-level await instead of async IIFE
  "unicorn/no-invalid-fetch-options": "error", // Catch invalid fetch/Request options
  "unicorn/no-thenable": "error", // Prevent accidental Promise-like objects
  "unicorn/no-await-expression-member": "error", // Prevent (await foo).bar which can error
  "unicorn/prefer-includes": "error", // Use .includes() instead of .indexOf() !== -1
  "unicorn/prefer-array-flat": "error", // Use .flat() instead of [].concat(...arr)
  "unicorn/prefer-array-flat-map": "error", // Use .flatMap() instead of .map().flat()
  "unicorn/prefer-string-starts-ends-with": "error", // Use .startsWith()/.endsWith()
  "unicorn/no-object-as-default-parameter": "error", // Prevent mutable default params
  "unicorn/explicit-length-check": "error", // Require explicit .length > 0
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
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-expect-error": "allow-with-description", // Require explanation
      "ts-ignore": true, // Ban completely - use ts-expect-error instead
      "ts-nocheck": true, // Ban - too broad
      "ts-check": false, // Allow - enables stricter checking
      minimumDescriptionLength: 10, // Require meaningful descriptions
    },
  ],
  "@typescript-eslint/no-explicit-any": "error", // Force proper typing instead of any
  "@typescript-eslint/no-non-null-assertion": "error", // No ! operator - use proper null checks
  "@typescript-eslint/consistent-type-imports": "error", // Use `import type` for types
  "@typescript-eslint/prefer-nullish-coalescing": "error", // Use ?? instead of || for null/undefined
  "@typescript-eslint/prefer-optional-chain": "error", // Use a?.b instead of a && a.b
  "@typescript-eslint/no-unnecessary-condition": [
    "error",
    { allowConstantLoopConditions: "only-allowed-literals" }, // Allow while(true) but catch while(alwaysTrueVar)
  ], // Remove conditions that are always true/false
  "@typescript-eslint/no-floating-promises": "error", // Must await or .catch() promises
  "@typescript-eslint/await-thenable": "error", // Only await actual promises
  "@typescript-eslint/no-misused-promises": "error", // Don't use promises in conditionals/spreads
  "@typescript-eslint/only-throw-error": "error", // Only throw Error objects (type-aware)
  "@typescript-eslint/dot-notation": "error", // Use obj.key not obj['key'] (type-aware)
  "@typescript-eslint/no-implied-eval": "error", // Prevents eval-like patterns (type-aware)
  "@typescript-eslint/no-shadow": "error", // Prevents shadowing (type-aware)
  "@typescript-eslint/method-signature-style": ["error", "property"], // func: () => T, not func(): T
  "@typescript-eslint/return-await": ["error", "always"], // Consistent async returns

  // Strict type-checked rules
  "@typescript-eslint/no-unnecessary-type-assertion": "error", // Remove redundant `as X` casts
  "@typescript-eslint/restrict-plus-operands": "error", // Only add numbers or strings
  "@typescript-eslint/restrict-template-expressions": "error", // Only strings in templates
  "@typescript-eslint/unified-signatures": "error", // Merge overloads when possible
  "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error", // No `=== true`
  "@typescript-eslint/prefer-reduce-type-parameter": "error", // Use reduce<T>() not reduce(...) as T

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
    files: ["{src,webui,tests}/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@stylistic": stylistic,
      "@eslint-community/eslint-comments": eslintComments,
      import: importPlugin,
      sonarjs,
      jsdoc,
      unicorn,
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
      ...unicornRules,
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
      "@eslint-community/eslint-comments": eslintComments,
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      sonarjs,
      jsdoc,
      unicorn,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      ...sonarCoreRules,
      ...unicornRules,
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
        project: ["./scripts/tsconfig.json"],
      },
      globals: {
        ...globals.node,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./scripts/tsconfig.json"],
        },
        node: true,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      "@eslint-community/eslint-comments": eslintComments,
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      sonarjs,
      jsdoc,
      unicorn,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      ...sonarCoreRules,
      ...unicornRules,
      ...jsdocRules, // JSDoc required for TS (but not type annotations)
      ...tsOnlyRules, // Overrides: turns off jsdoc/require-param-type and jsdoc/check-types
    },
  },

  // Require JSDoc for ALL functions in scripts (not just exported)
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: {
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
            ArrowFunctionExpression: false, // Handled via contexts below
          },
          // Contexts for arrow functions assigned to variables (not inline callbacks)
          contexts: ["VariableDeclarator > ArrowFunctionExpression"],
        },
      ],
    },
  },

  // src TypeScript files (portal and future migrations)
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: [
          "./src/portal/tsconfig.json",
          "./src/portal/tsconfig.test.json",
        ],
      },
      globals: {
        ...globals.node,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./src/portal/tsconfig.json"],
        },
        node: true,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      "@eslint-community/eslint-comments": eslintComments,
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
      sonarjs,
      jsdoc,
      unicorn,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...baseRules,
      ...sonarCoreRules,
      ...unicornRules,
      ...jsdocRules,
      ...tsOnlyRules,
    },
  },

  // Node.js code
  {
    files: ["src/**/*.{js,mjs,ts}", "scripts/**/*.ts"],
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
      "@eslint-community/eslint-comments": eslintComments,
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
      "@eslint-community/eslint-comments": eslintComments,
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

  // Allow larger functions for main App component and custom hooks
  // These orchestrate multiple hooks/effects and are naturally longer
  {
    files: ["webui/**/App.tsx", "webui/**/hooks/**/use-*.ts"],
    rules: {
      "max-lines-per-function": [
        "error",
        {
          max: 240,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
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

  // Require extensions for src (unbundled Node.js execution)
  {
    files: ["src/**/*.{js,mjs}"],
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
          selector: "ImportDeclaration[source.value=/^\\.\\./]",
          message: "Use path alias (#webui/*) instead of ../ imports",
        },
        {
          selector: "ImportExpression[source.value=/^\\.\\./]",
          message: "Use path alias (#webui/*) instead of ../ imports",
        },
      ],
    },
  },

  // Enforce path aliases for parent directory imports in src files
  {
    files: ["src/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^\\.\\./]",
          message: "Use path alias (#src/*) instead of ../ imports",
        },
        {
          selector: "ImportExpression[source.value=/^\\.\\./]",
          message: "Use path alias (#src/*) instead of ../ imports",
        },
      ],
    },
  },

  // Enforce LiveAPI.from() over new LiveAPI() for safer ID handling
  // LiveAPI.from() properly handles raw IDs (prefixes with "id ") while
  // new LiveAPI() requires already-prefixed IDs or full paths
  {
    files: ["src/**/*.js"],
    ignores: [
      "src/live-api-adapter/live-api-extensions.js", // Defines LiveAPI.from()
      "src/test/mocks/mock-live-api.js", // Test mock that mirrors live-api-extensions.js
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='LiveAPI']",
          message:
            "Use LiveAPI.from() instead of new LiveAPI() for safer ID handling",
        },
      ],
    },
  },

  // Test files - relax some rules
  {
    files: ["**/*.test.{js,ts,tsx}", "**/test-setup.js"],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": [
        "error",
        {
          max: 630, // TODO: ratchet down
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      complexity: ["error", 28],
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
      "vitest/no-conditional-tests": "error", // No if/switch in test blocks
      "vitest/no-standalone-expect": "error", // expect() must be inside it()
      "vitest/max-expects": ["error", { max: 14 }], // Focused tests (TODO: ratchet down)
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect*"] }],
    },
  },
  {
    files: ["**/*.test.{js,ts,tsx}"],
    rules: {
      "sonarjs/cognitive-complexity": ["error", 38],
      // Allow DOM element narrowing casts (e.g., `as HTMLSelectElement`) in tests
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },

  // Max file size rules
  {
    files: [
      "src/**/*.js",
      "scripts/**/*.ts",
      "webui/**/*.ts",
      "webui/**/*.tsx",
    ],
    ignores: [
      "**/*.test.js",
      "**/*.test.ts",
      "**/*.test.tsx",
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
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*-test-case.ts", // Test data fixtures
    ],
    rules: {
      "max-lines": [
        "error",
        {
          max: 650,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
];
