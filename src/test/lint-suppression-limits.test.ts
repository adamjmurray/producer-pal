import { describe, expect, it } from "vitest";
import { assertPatternLimit } from "./helpers/meta-test-helpers.ts";

type TreeLimits = Record<string, number>;

// Per-tree limits for lint suppressions (ratcheted to current counts)
// "srcTests" checks test files in src/ (vs "src" which excludes test files)
const ESLINT_DISABLE_LIMITS: TreeLimits = {
  src: 6,
  srcTests: 17,
  scripts: 0,
  webui: 1,
};

const TS_EXPECT_ERROR_LIMITS: TreeLimits = {
  src: 0,
  srcTests: 19,
  scripts: 4, // Accessing private MCP SDK properties (_registeredTools, _serverVersion)
  webui: 0,
};

// TODO: This looks to be enforced by eslint, so we can probably safely simplify and remove it here
const TS_NOCHECK_LIMITS: TreeLimits = {
  src: 0,
  srcTests: 3, // This test file's pattern definitions
  scripts: 0,
  webui: 0,
};

const TREES = Object.keys(ESLINT_DISABLE_LIMITS);

interface SuppressionConfig {
  pattern: RegExp;
  limits: TreeLimits;
  errorSuffix: string;
}

const SUPPRESSION_CONFIGS: Record<string, SuppressionConfig> = {
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
  for (const [name, config] of Object.entries(SUPPRESSION_CONFIGS)) {
    describe(`${name} comments`, () => {
      for (const tree of TREES) {
        const limit = config.limits[tree]!;

        it(`should have at most ${limit} ${name} comments in ${tree}`, () => {
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
