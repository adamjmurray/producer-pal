// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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

// Every tree each map must declare a limit for. Keying TreeLimits off this
// union makes a missing entry a compile error: with Record<string, number> a
// forgotten tree read back as undefined, and `count > undefined` is false, so
// the tree silently stopped being enforced.
const TREES = [
  "src",
  "srcTests",
  "scripts",
  "scriptsTests",
  "webui",
  "webuiTests",
  "evals",
  "evalsTests",
  "e2e",
  "e2eTests",
] as const;

type Tree = (typeof TREES)[number];
type TreeLimits = Record<Tree, number>;

// Per-tree limits for lint suppressions (ratcheted to current counts)
// A "…Tests" tree checks only the test files under that directory; the bare
// tree name checks only the non-test sources.
//
// SELF-REFERENCE: this file is itself a srcTests file, so the pattern
// definitions and error strings below match themselves. Every srcTests limit
// includes a floor of self-matches that no cleanup can remove — annotated as
// "N self". Subtract it to read the real suppression debt. The coverage map
// below is currently 100% self-reference (no src test file suppresses coverage
// at all), so its srcTests limit is already as low as it can go.
// Mentioning a pattern literally in this comment would raise its own count.
const ESLINT_DISABLE_LIMITS: TreeLimits = {
  src: 9,
  srcTests: 16, // 15 real + 1 self
  scripts: 0,
  scriptsTests: 0,
  webui: 4,
  // 4 any (SDK mock-call records), 5 require-yield (streams that throw before
  // yielding), 5 only-throw-error (non-Error throw branches), 2 no-deprecated
  // (need the undoctored DOM factory), 1 no-unnecessary-condition
  webuiTests: 17,
  // 1 require-atomic-updates: the agent-CLI session id is read, awaited across,
  // then written — safe only because turns run sequentially, which ESLint
  // can't see
  evals: 1,
  evalsTests: 0,
  e2e: 0,
  e2eTests: 0,
};

const TS_EXPECT_ERROR_LIMITS: TreeLimits = {
  src: 0,
  srcTests: 17, // 15 real + 2 self
  scripts: 3, // Accessing the MCP SDK's private _serverVersion
  scriptsTests: 0,
  webui: 0,
  webuiTests: 2, // Partial Client mocks that omit most of the interface
  evals: 0,
  evalsTests: 0,
  e2e: 0,
  e2eTests: 0,
};

// Counts only the directives that open a region (start, next, …). "v8 ignore
// stop" is exempt: pairing it with its start double-counts one suppression and
// makes the limits read as twice the real debt.
const V8_IGNORE_LIMITS: TreeLimits = {
  // 4 defensive guards with caller guarantees/lookup tables, 2 exhaustive-never
  // switch defaults (read-device / update-device) that exist for the compiler —
  // executing one would mean casting a bogus TargetType past the resolver
  src: 6,
  srcTests: 7, // 0 real + 7 self (pattern definition + description enforcement)
  scripts: 0,
  scriptsTests: 0,
  webui: 8, // Untestable IDB error callbacks, exhaustive never, inline JSX callbacks, no-ops
  webuiTests: 0,
  evals: 0,
  evalsTests: 0,
  e2e: 0,
  e2eTests: 0,
};

interface SuppressionConfig {
  pattern: RegExp;
  limits: TreeLimits;
  errorSuffix: string;
}

const SUPPRESSION_CONFIGS: Record<string, SuppressionConfig> = {
  // oxlint honors both prefixes, so both have to count against the same budget —
  // otherwise a new suppression written the oxlint way escapes the limit
  // entirely. The repo holds none of the oxlint form today, so widening the
  // pattern leaves every count below unchanged.
  "lint-disable": {
    pattern: /(?:es|ox)lint-disable/,
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
  "v8 ignore": {
    pattern: /v8 ignore (?!stop)/,
    limits: V8_IGNORE_LIMITS,
    errorSuffix:
      "Consider restructuring code to make error paths testable instead of ignoring coverage.",
  },
};

describe("Lint suppression limits", () => {
  for (const [name, config] of Object.entries(SUPPRESSION_CONFIGS)) {
    describe(`${name} comments`, () => {
      for (const tree of TREES) {
        const limit = config.limits[tree];

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

  // Backstops eslint-comments/no-unlimited-disable over the oxlint- prefix, which
  // that plugin does not recognize. A directive naming no rule switches off EVERY
  // rule for the rest of the file, so one stale line can silently drop all
  // coverage from a whole module.
  it("should not disable every rule at once", () => {
    const dirs = [
      "src",
      "webui",
      "scripts",
      "evals",
      "e2e",
      "config",
      "examples",
    ];
    const allFiles = dirs.flatMap((dir) => {
      const dirPath = path.join(projectRoot, dir);

      return [...findSourceFiles(dirPath), ...findTestFiles(dirPath)];
    });
    // A file-wide directive that closes, reaches a "--" reason, or simply ends
    // the line, without ever naming a rule — oxlint honors the line-comment form
    // as file-wide too. The lookahead keeps the -line and -next-line forms out:
    // they affect one line, which the rule likewise permits.
    const barePattern = /(?:es|ox)lint-disable(?!-)\s*(?:\*\/|--|$)/;
    const matches = countPatternOccurrences(allFiles, barePattern);

    throwOnFileViolations(
      matches.map((m) => ({ file: `${m.file}:${m.line}`, reason: m.match })),
      "Found unlimited lint-disable comment(s)",
      "Name the rules being disabled, e.g. /* oxlint-disable no-console -- reason */",
    );
    expect(matches).toHaveLength(0); // Satisfy vitest/expect-expect rule
  });

  // v8 ignore next/start must include a "-- reason" description (v8 ignore stop is exempt)
  it("should require descriptions on v8 ignore next/start comments", () => {
    const dirs = ["src", "webui", "scripts", "evals", "e2e"];
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
