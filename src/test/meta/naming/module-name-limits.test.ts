// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CommentTree,
  COMMENT_TREES,
} from "#src/test/helpers/comment-scan-helpers.ts";
import {
  findSourceFiles,
  projectRoot,
} from "#src/test/helpers/meta-test-helpers.ts";
import {
  NOTHING_WORD_FILE_LIMITS,
  NOTHING_WORDS,
} from "#src/test/helpers/module-name-limits.ts";

// A ratchet on modules named for nothing. Test support files
// (`-test-helpers.ts`) are a separate convention and don't count. The caps, and
// the rule for changing them, live in helpers/module-name-limits.ts.

const NOTHING_WORD_BASENAME = new RegExp(
  `(?:^|-)(?:${NOTHING_WORDS.join("|")})\\.tsx?$`,
);

/**
 * Non-test files in a tree whose basename ends in a nothing word
 * @param tree - Tree name, resolved against the project root
 * @returns Repo-relative paths, sorted
 */
function findNothingWordFiles(tree: CommentTree): string[] {
  return findSourceFiles(path.join(projectRoot, tree), true)
    .filter((file) => NOTHING_WORD_BASENAME.test(path.basename(file)))
    .map((file) => path.relative(projectRoot, file))
    .toSorted();
}

describe("Module name limits", () => {
  for (const tree of COMMENT_TREES) {
    const limit = NOTHING_WORD_FILE_LIMITS[tree];

    it(`should have at most ${limit} nothing-word module names in ${tree}`, () => {
      const files = findNothingWordFiles(tree);

      if (files.length > limit) {
        expect.fail(
          `${files.length} non-test files in ${tree}/ are named for nothing ` +
            `(${NOTHING_WORDS.join(", ")}); the cap is ${limit}.\n` +
            `Name a module for what it does, not for being support code.\n` +
            files.map((file) => `  ${file}`).join("\n"),
        );
      }

      expect(files.length).toBeLessThanOrEqual(limit);
    });

    it(`should lower the ${tree} cap when the count falls`, () => {
      const count = findNothingWordFiles(tree).length;

      if (limit > count) {
        expect.fail(
          `${tree} has ${count} nothing-word module names but the cap is ` +
            `${limit}; lower it in src/test/helpers/module-name-limits.ts.`,
        );
      }

      expect(limit).toBe(count);
    });
  }
});
