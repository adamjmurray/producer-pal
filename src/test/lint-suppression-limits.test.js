import { describe, expect, it } from "vitest";
import { assertPatternLimit } from "./meta-test-helpers.js";

// Per-tree limits for lint suppressions (ratcheted to current counts)
const ESLINT_DISABLE_LIMITS = {
  src: 8, // Increased for TypeScript migrations (cross-language import resolution)
  scripts: 0,
  webui: 1,
};

const TS_EXPECT_ERROR_LIMITS = {
  src: 0,
  scripts: 4, // Accessing private MCP SDK properties (_registeredTools, _serverVersion)
  webui: 0,
};

const TS_NOCHECK_LIMITS = {
  src: 0,
  scripts: 0,
  webui: 0,
};

const SOURCE_TREES = Object.keys(ESLINT_DISABLE_LIMITS);

/**
 * @typedef {object} SuppressionConfig
 * @property {RegExp} pattern - Pattern to search for
 * @property {Record<string, number>} limits - Per-tree limits
 * @property {string} errorSuffix - Message suffix for failures
 */

/** @type {Record<string, SuppressionConfig>} */
const SUPPRESSION_CONFIGS = {
  "eslint-disable": {
    pattern: /eslint-disable/,
    limits: ESLINT_DISABLE_LIMITS,
    errorSuffix:
      "Consider fixing the underlying issues instead of suppressing lint rules.",
  },
  "@ts-expect-error": {
    pattern: /@ts-expect-error/,
    limits: TS_EXPECT_ERROR_LIMITS,
    errorSuffix:
      "Consider fixing the type issues or improving type definitions.",
  },
  "@ts-nocheck": {
    pattern: /@ts-nocheck/,
    limits: TS_NOCHECK_LIMITS,
    errorSuffix:
      "Add JSDoc type annotations and remove @ts-nocheck to enable type checking.",
  },
};

describe("Lint suppression limits", () => {
  // Test files are excluded because they have relaxed ESLint rules per config
  // and often need suppressions for mocking patterns (vi.mock, partial implementations)

  for (const [name, config] of Object.entries(SUPPRESSION_CONFIGS)) {
    describe(`${name} comments (excluding test files)`, () => {
      for (const tree of SOURCE_TREES) {
        const limit = config.limits[tree];

        it(`should have at most ${limit} ${name} comments in ${tree}/`, () => {
          assertPatternLimit(
            tree,
            config.pattern,
            limit,
            config.errorSuffix,
            expect,
          );
          expect(true).toBe(true); // Satisfy vitest/expect-expect rule
        });
      }
    });
  }
});
