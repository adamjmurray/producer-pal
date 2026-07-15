// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Stryker mutation testing config.
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

  // Ratcheted gate: the run FAILS (exit 1) if the score drops below `break`,
  // like the coverage and lint-suppression limits. The floor sits ~1 point below
  // the current src/notation score (86.90% as of 2026-07-14) — enough headroom
  // for run-to-run timeout-classification variance (a timeout counts as killed,
  // so it nudges the score), tight enough to catch a real test-quality
  // regression. Raise it as the score improves; never lower without triaging why.
  thresholds: {
    high: 85,
    low: 60,
    break: 86,
  },
};
