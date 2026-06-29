// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Stryker mutation testing config (AJM-560).
//
// Mutation testing introduces small faults ("mutants") into the source and
// checks whether the test suite fails. A surviving mutant = a behavior no test
// asserts on — a test-quality gap that line/branch coverage cannot detect.
//
// SCOPED on purpose: full-tree runs are expensive (hours). We start with
// src/notation/ — dense, branch-heavy parsers/DSLs where high coverage most
// easily hides weak assertions. Widen the `mutate` globs to add more areas.
//
// Run with: npm run mutation
// This is NOT part of `npm run check` — too slow for the per-PR hot path.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "vitest",

  // Reuse the project's vitest config so path aliases (#src, #webui, #evals),
  // the happy-dom/node environment, and env flags all apply unchanged.
  vitest: {
    configFile: "vitest.config.ts",
  },

  // perTest coverage lets Stryker run only the tests that cover each mutant
  // instead of the whole 8k-test suite per mutant — the main runtime win.
  coverageAnalysis: "perTest",

  // Scope: notation source only. Exclude tests, test helpers, and type-only
  // modules. Generated peggy parsers are .js and are never matched by *.ts.
  mutate: [
    "src/notation/**/*.ts",
    "!src/notation/**/*.test.ts",
    "!src/notation/**/tests/**",
    "!src/notation/**/*-test-helpers.ts",
    "!src/notation/types.ts",
    "!src/notation/peggy-parser-types.ts",
    "!src/notation/**/peggy-parser-types.ts",
  ],

  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/notation.html",
  },

  // Subsequent runs only re-test mutants in changed files. The incremental
  // file is gitignored (large, machine-specific); the first run is a full pass.
  incremental: true,
  incrementalFile: "reports/mutation/stryker-incremental.json",

  // Baseline mode: report the score but do not fail the run. Once a defensible
  // baseline is triaged, set `break` to ratchet the score like the coverage and
  // lint-suppression gates.
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
};
