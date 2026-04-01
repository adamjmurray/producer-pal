// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPatternLimit,
  countPatternOccurrences,
  findSourceFiles,
  findTestFiles,
  throwOnFileViolations,
} from "./helpers/meta-test-helpers.ts";

const projectRoot = path.resolve(import.meta.dirname, "../..");

type TreeLimits = Record<string, number>;

// Per-tree limits for lint suppressions (ratcheted to current counts)
// "srcTests" checks test files in src/ (vs "src" which excludes test files)
const ESLINT_DISABLE_LIMITS: TreeLimits = {
  src: 10,
  srcTests: 17,
  scripts: 0,
  webui: 3,
};

const TS_EXPECT_ERROR_LIMITS: TreeLimits = {
  src: 0,
  srcTests: 17,
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

const V8_IGNORE_LIMITS: TreeLimits = {
  src: 8, // Defensive guards with caller guarantees/lookup tables
  srcTests: 8, // This test file's pattern definitions + description enforcement
  scripts: 0,
  webui: 14, // Untestable IDB error callbacks, exhaustive never, inline JSX callbacks, no-ops
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
  "v8 ignore": {
    pattern: /v8 ignore/,
    limits: V8_IGNORE_LIMITS,
    errorSuffix:
      "Consider restructuring code to make error paths testable instead of ignoring coverage.",
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

  // v8 ignore next/start must include a "-- reason" description (v8 ignore stop is exempt)
  it("should require descriptions on v8 ignore next/start comments", () => {
    const dirs = ["src", "webui", "scripts"];
    const allFiles = dirs.flatMap((dir) => {
      const dirPath = path.join(projectRoot, dir);

      return [...findSourceFiles(dirPath), ...findTestFiles(dirPath)];
    });
    // Matches bare v8 ignore next/start that close without a "--" description
    const barePattern = /v8 ignore (next|start)\s*\*\//;
    const matches = countPatternOccurrences(allFiles, barePattern);

    throwOnFileViolations(
      matches.map((m) => ({ file: `${m.file}:${m.line}`, reason: m.match })),
      "v8 ignore comment(s) without descriptions",
      "Add a description: /* v8 ignore next -- reason */",
    );
    expect(matches).toHaveLength(0); // Satisfy vitest/expect-expect rule
  });
});
