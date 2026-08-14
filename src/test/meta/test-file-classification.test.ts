// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findRepoTextFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";
import {
  RETIRED_TEST_FILE_SUFFIXES,
  TEST_DIR_NAMES,
  TEST_FILE_GLOBS,
  TEST_FILE_SUFFIXES,
  TEST_SUITE_GLOBS,
  VITEST_SUITE_GLOBS,
} from "#src/test/helpers/test-file-classification.ts";

// The source/test line is drawn in a dozen places that cannot import one
// another: .oxlintrc.json, five jscpd configs, vitest.config.ts, the meta-test
// file finders, and dev/Testing.md. They drifted apart once already, leaving
// files that were tests for one budget and source for another. These tests hold
// every one of them in step with src/test/helpers/test-file-classification.ts.

const OXLINT_CONFIG = ".oxlintrc.json";
const JSCPD_TESTS_CONFIG = "config/.jscpd-tests.json";
const VITEST_CONFIG = "vitest.config.ts";
const CLASSIFICATION_DOC = "dev/Testing.md";

/** Every jscpd scan that measures source code, so must ignore every test file. */
const JSCPD_SOURCE_CONFIGS = [
  "config/.jscpd.json",
  "config/.jscpd-scripts.json",
  "config/.jscpd-evals.json",
];

// e2e/ is the one tree with no source/test split: 67 of its 85 files are tests
// and only two of the rest are TypeScript, so excluding tests leaves a corpus
// where a handful of duplicated lines reads as a double-digit percentage. Its
// scan covers everything at one threshold, deliberately — hence its absence
// from the list above, asserted below so the omission cannot pass for an
// oversight the way this whole class of gap did before.
const JSCPD_UNSPLIT_CONFIG = "config/.jscpd-e2e.json";

// Path shapes that name test files, however the glob spells them. A hyphen can
// open one of these names but never close it, so a source glob ending
// "test-data.ts" reads as the source file it is rather than as a category
// spelled oddly — the compound names are all listed here in full.
const TEST_VOCABULARY =
  /(^|[/*.-])(tests?|specs?|test-cases?|test-utils|test-helpers|test-setup)([/*.]|$)/;

// Globs that name test files without using the canonical spelling. Each is
// deliberately NARROWER than a whole category — one file, or one tree's suites
// — so it cannot split the classification the way a rival spelling of a whole
// category would. Anything else naming test files has to spell a named set,
// because the check below compares glob strings: `e2e/**/*.spec.ts` and
// `**/*.spec.ts` cover the same files and only one of them is recognized.
const NARROW_OXLINT_TEST_GLOBS = new Set([
  "**/test-setup.ts", // the single vitest setup file
  "e2e/mcp/**/*.test.ts", // vitest relaxations for the MCP e2e suites alone
  "webui/**/*.test.tsx", // one tree's suites, one rule
  // (react/jsx-no-constructed-context-values).
  // One file, one rule (react/only-export-components).
  "webui/src/components/tests/App-context-mocks.tsx",
  "evals/chat/agent-cli/tests/agent-cli-fixture.mjs", // one file, one rule
  // The typed decode helpers, one file each, one rule
  // (typescript/no-unnecessary-type-parameters).
  "e2e/mcp/mcp-test-helpers.ts",
  "src/live-api-adapter/tests/v8-protocol-test-helpers.ts",
  "src/test/meta/test-file-classification.test.ts",
  "src/tools/clip/update/tests/notes/notes-mock-test-helpers.ts",
]);

interface OxlintOverride {
  files?: string[];
  rules?: Record<string, unknown>;
}

describe("test file classification", () => {
  it("should give oxlint's relaxed line budget to exactly the test suites", () => {
    // Helpers and fixtures keep the 325-line source budget on purpose: only a
    // whole suite has a reason to run long.
    const relaxed = oxlintOverridesWithRule("max-lines").filter(
      (block) => (lineLimitOf(block) ?? 0) > 325,
    );

    expect(relaxed).toHaveLength(1);
    expect(relaxed[0]?.files).toStrictEqual(TEST_SUITE_GLOBS);
  });

  it("should read a max-lines ceiling in either form oxlint accepts", () => {
    // The check above is only as good as this read: a number-form override
    // handing `src/**` a 900-line budget used to come back undefined, so it
    // counted as no relaxation at all.
    expect(lineLimitOf({ rules: { "max-lines": ["error", 900] } })).toBe(900);
    expect(
      lineLimitOf({ rules: { "max-lines": ["error", { max: 900 }] } }),
    ).toBe(900);
    expect(lineLimitOf({ rules: { "max-lines": "error" } })).toBeUndefined();
    expect(lineLimitOf({ rules: {} })).toBeUndefined();
  });

  it("should scope every oxlint test override to a whole named set", () => {
    // A block that names some test files has to name a set the rest of the
    // project also recognizes, or it splits the classification again. The three
    // legitimate sets are every test file, every suite, and the vitest suites
    // alone — vitest's own rules would misfire on a Playwright spec.
    const named = [TEST_FILE_GLOBS, TEST_SUITE_GLOBS, VITEST_SUITE_GLOBS];
    const violations = oxlintOverrides()
      .map((block, index) => ({
        block,
        index,
        globs: (block.files ?? []).filter((glob) =>
          TEST_FILE_GLOBS.includes(glob),
        ),
      }))
      .filter(
        ({ globs }) =>
          globs.length > 0 && !named.some((set) => set.join() === globs.join()),
      )
      .map(({ block, index, globs }) => ({
        file: `${OXLINT_CONFIG} overrides[${index}] (${Object.keys(block.rules ?? {}).join(", ")})`,
        reason: `names ${globs.join(", ")}`,
      }));

    throwOnFileViolations(
      violations,
      "Found oxlint override(s) naming a partial set of test files",
      "List every glob of one set, in the order test-file-classification.ts declares them.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should not name test files in oxlint with a rival spelling", () => {
    // The check above compares glob strings, so a block spelling a category its
    // own way is invisible to it — `e2e/**/*.spec.ts` covers exactly the specs
    // that `**/*.spec.ts` does, and would silently take its own budget.
    const violations = oxlintOverrides().flatMap((block, index) =>
      (block.files ?? [])
        .filter(
          (glob) =>
            TEST_VOCABULARY.test(glob) &&
            !TEST_FILE_GLOBS.includes(glob) &&
            !NARROW_OXLINT_TEST_GLOBS.has(glob),
        )
        .map((glob) => ({
          file: `${OXLINT_CONFIG} overrides[${index}] (${Object.keys(block.rules ?? {}).join(", ")})`,
          reason: `"${glob}" names test files but is not one of the canonical globs`,
        })),
    );

    throwOnFileViolations(
      violations,
      "Found oxlint override(s) naming test files their own way",
      `Use a glob from test-file-classification.ts, or add the entry to NARROW_OXLINT_TEST_GLOBS with the reason it is narrower than a category.`,
    );

    expect(violations).toHaveLength(0);
  });

  it.each(JSCPD_SOURCE_CONFIGS)(
    "should keep every test file out of %s",
    (config) => {
      const { ignore } = readJson<{ ignore: string[] }>(config);

      expect(
        ignore.filter((glob) => TEST_FILE_GLOBS.includes(glob)),
      ).toStrictEqual(TEST_FILE_GLOBS);
    },
  );

  it("should hold the e2e scan to one threshold over the whole tree", () => {
    const { ignore } = readJson<{ ignore: string[] }>(JSCPD_UNSPLIT_CONFIG);

    expect(
      ignore.filter((glob) => TEST_FILE_GLOBS.includes(glob)),
    ).toStrictEqual([]);
  });

  it("should scan exactly the test files in the tests duplication run", () => {
    const parts = [
      ...TEST_FILE_SUFFIXES.map((suffix) => `*${suffix}`),
      ...TEST_DIR_NAMES.map((dir) => `${dir}/**`),
    ];

    expect(readJson<{ pattern: string }>(JSCPD_TESTS_CONFIG).pattern).toBe(
      `**/{${parts.join(",")}}`,
    );
  });

  it("should exclude every test file from coverage", () => {
    const config = readText(VITEST_CONFIG);

    expect(
      TEST_FILE_GLOBS.filter((glob) => !config.includes(`"${glob}"`)),
    ).toStrictEqual([]);
  });

  it("should be the classification dev/Testing.md documents", () => {
    const doc = readText(CLASSIFICATION_DOC);
    const tokens = [
      ...TEST_FILE_SUFFIXES.map((suffix) => `\`*${suffix}\``),
      ...TEST_DIR_NAMES.map((dir) => `\`${dir}/\``),
    ];

    expect(tokens.filter((token) => !doc.includes(token))).toStrictEqual([]);
  });

  it("should have no file naming itself with a retired suffix", () => {
    // Reviving one of these is how the definitions came apart: a suffix only
    // one config recognizes reads as a test there and as source everywhere
    // else. Rename into a live category instead of teaching every config a new
    // one.
    const violations = findRepoTextFiles()
      .map((file) => path.relative(projectRoot, file))
      .filter((rel) =>
        RETIRED_TEST_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix)),
      )
      .map((rel) => ({ file: rel, reason: "retired test-file suffix" }));

    throwOnFileViolations(
      violations,
      "Found file(s) named with a retired test-file suffix",
      `Use one of ${TEST_FILE_SUFFIXES.join(", ")}, or move the file under a ${TEST_DIR_NAMES.join("/")} directory.`,
    );

    expect(violations).toHaveLength(0);
  });
});

/**
 * Read every override block in .oxlintrc.json
 * @returns The blocks, in file order
 */
function oxlintOverrides(): OxlintOverride[] {
  return (
    readJson<{ overrides?: OxlintOverride[] }>(OXLINT_CONFIG).overrides ?? []
  );
}

/**
 * Read the override blocks in .oxlintrc.json that configure a rule
 * @param rule - Rule name the block must set
 * @returns The matching blocks, in file order
 */
function oxlintOverridesWithRule(rule: string): OxlintOverride[] {
  return oxlintOverrides().filter((block) =>
    Object.hasOwn(block.rules ?? {}, rule),
  );
}

/**
 * Read the max-lines ceiling an oxlint override block sets. oxlint honors both
 * `["error", 900]` and `["error", { max: 900 }]`, so reading only one form would
 * leave a whole tree's raised budget invisible to the check above.
 * @param block - An override block known to configure max-lines
 * @returns The configured maximum, or undefined if the block sets none
 */
function lineLimitOf(block: OxlintOverride): number | undefined {
  const setting = block.rules?.["max-lines"];
  const options = Array.isArray(setting) ? setting[1] : undefined;

  if (typeof options === "number") return options;

  return (options as { max?: number } | undefined)?.max;
}

/**
 * Read a repo file as text
 * @param relPath - Path relative to the project root
 * @returns The file's contents
 */
function readText(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), "utf8");
}

/**
 * Parse a repo JSON config, tolerating the whole-line comments oxlint allows
 * @param relPath - Path relative to the project root
 * @returns The parsed config
 */
function readJson<T>(relPath: string): T {
  return JSON.parse(readText(relPath).replaceAll(/^\s*\/\/.*$/gm, "")) as T;
}
