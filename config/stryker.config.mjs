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
// SCOPED on purpose: full-tree runs are expensive (hours). The area to mutate
// is selected by the `MUTATION_SCOPE` env var (default: notation), resolved
// against the scope table in mutation-scopes.mjs. Each scope carries its own
// `mutate` globs and `break` gate. Add domains there, not here.
//
// Run with: npm run mutation [-- <scope>...]  (see config/run-mutation.mjs)
// This is NOT part of `npm run check` — too slow for the per-PR hot path.

import { SCOPES } from "./mutation-scopes.mjs";

const scopeName = process.env.MUTATION_SCOPE ?? "notation";
const scope = SCOPES[scopeName];

if (scope == null) {
  throw new Error(
    `Unknown MUTATION_SCOPE "${scopeName}". Known scopes: ${Object.keys(SCOPES).join(", ")}`,
  );
}

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

  // Source to mutate, selected by MUTATION_SCOPE (see mutation-scopes.mjs).
  // Excludes tests, test helpers, and type-only modules; generated peggy
  // parsers are .js and are never matched by *.ts.
  mutate: scope.mutate,

  reporters: ["html", "clear-text", "progress"],

  // Per-scope report + incremental cache so runs of different scopes don't
  // clobber each other (a scoped run used to overwrite the shared incremental
  // file). Both live under reports/mutation/ (gitignored).
  htmlReporter: {
    fileName: `reports/mutation/${scopeName}.html`,
  },
  incremental: true,
  incrementalFile: `reports/mutation/${scopeName}-incremental.json`,

  // Ratcheted gate: the run FAILS (exit 1) if the score drops below `break`,
  // like the coverage and lint-suppression limits. Per-scope: notation sits at
  // 86 (~1 point below its 86.90% score for run-to-run timeout-classification
  // variance); tool domains are null (baseline mode, measure-only) until each
  // is triaged and earns a floor in its own PR. Raise a floor as the score
  // improves; never lower one without triaging why.
  thresholds: {
    high: 85,
    low: 60,
    break: scope.break,
  },
};
