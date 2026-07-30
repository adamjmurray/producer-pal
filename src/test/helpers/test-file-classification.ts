// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one definition of "test file". Everything that has to draw the
// source/test line reads it from here: the meta-test file finders, the LOC
// stats, and — through src/test/meta/test-file-classification.test.ts —
// .oxlintrc.json, all five config/.jscpd*.json scans, vitest.config.ts, and
// AGENTS.md's documented rules.
//
// These used to be a handful of independent definitions that agreed by
// accident, so a file could be a test for the line limit and source for the
// suppression budget. To add a category, change the lists here and let the meta
// test name the configs that fall out of step.

/** Suffixes naming a vitest suite, the only files vitest's lint rules fit. */
export const VITEST_SUITE_SUFFIXES = [".test.ts", ".test.tsx"];

/** Suffixes naming a Playwright suite. These live in e2e/, run by Playwright. */
export const PLAYWRIGHT_SUITE_SUFFIXES = [".spec.ts", ".spec.tsx"];

/**
 * Suffixes naming a whole test suite, or the case table one iterates. These are
 * the files that get the relaxed 650-line budget; the rest of the
 * classification keeps the standard 325.
 */
export const TEST_SUITE_SUFFIXES = [
  ...VITEST_SUITE_SUFFIXES,
  ...PLAYWRIGHT_SUITE_SUFFIXES,
  "-test-cases.ts",
];

/** Suffixes naming shared test utilities rather than a suite of their own. */
export const TEST_HELPER_SUFFIXES = ["-test-helpers.ts", "-test-helpers.tsx"];

/** Suffixes that make a file a test file whatever directory it sits in. */
export const TEST_FILE_SUFFIXES = [
  ...TEST_SUITE_SUFFIXES,
  ...TEST_HELPER_SUFFIXES,
];

/** Directory names whose entire contents are test files. */
export const TEST_DIR_NAMES = ["test", "tests", "test-cases", "test-utils"];

/**
 * Suffixes that must not name a test file. Each was a category one config knew
 * about and the others did not, so the same file read as a test there and as
 * source everywhere else — `-mock-helpers.ts` was a test file to the mutation
 * scopes while vitest measured its coverage as product code. `-test-case.ts`
 * was documented and configured everywhere with zero files, while the one real
 * case table in the repo spelled it `-test-cases.ts` and missed every rule by a
 * letter; the plural is canonical now. A fixture, mock, or case table belongs
 * in a live category above.
 */
export const RETIRED_TEST_FILE_SUFFIXES = [
  "-mock-helpers.ts",
  "-test-case.ts",
  "-test-fixture.ts",
  "-test-fixtures.ts",
];

/** Every test file as globs, for the configs that cannot import this module. */
export const TEST_FILE_GLOBS = [
  ...TEST_FILE_SUFFIXES.map(suffixGlob),
  ...TEST_DIR_NAMES.map((dir) => `**/${dir}/**`),
];

/** The test suites alone as globs, for the config blocks scoped to them. */
export const TEST_SUITE_GLOBS = TEST_SUITE_SUFFIXES.map(suffixGlob);

/** The vitest suites alone as globs, for blocks carrying vitest's own rules. */
export const VITEST_SUITE_GLOBS = VITEST_SUITE_SUFFIXES.map(suffixGlob);

/**
 * Whether a path names a test file
 * @param filePath - Path to classify; repo-relative unless the absolute prefix
 *   is known to hold no directory named like a test one
 * @returns True when a directory on the path or the filename marks it as a test
 */
export function isTestFile(filePath: string): boolean {
  const segments = filePath.split(/[/\\]/);
  const filename = segments.at(-1) ?? "";

  return (
    segments.slice(0, -1).some((segment) => TEST_DIR_NAMES.includes(segment)) ||
    TEST_FILE_SUFFIXES.some((suffix) => filename.endsWith(suffix))
  );
}

/**
 * Spell a filename suffix as the glob the JSON configs match it with
 * @param suffix - A suffix from one of the lists above
 * @returns The equivalent glob
 */
function suffixGlob(suffix: string): string {
  return `**/*${suffix}`;
}
