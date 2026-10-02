// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type CommentTree,
  COMMENT_TREES,
} from "#src/test/helpers/comment-scan-helpers.ts";
import { MAIN_EXPORT_LIMITS } from "#src/test/helpers/naming/main-export-limits.ts";
import { findMainExportViolations } from "#src/test/helpers/naming/main-export-scan.ts";

// A ratchet on modules whose exports say nothing their filename says. It checks
// a weaker rule than AGENTS.md's, on purpose.
//
// Taken literally — first exported function spelled like the basename — 329 of
// 418 src modules fail, nearly all of them modules named for a subject with
// several peer exports, or a noun/verb pair, so that check would push renames
// onto correctly named files. Matching any export, and allowing a leading verb,
// still leaves 255.
//
// So this takes the weakest form that still catches a real misname: some
// exported function or class has to share a word with the filename. The caps,
// and the rule for changing them, live in helpers/naming/main-export-limits.ts.

/**
 * Repo-relative paths of a tree's offending modules, with their exports
 * @param tree - Tree name
 * @returns One line per module, for a failure message
 */
function violationLines(tree: CommentTree): string[] {
  return findMainExportViolations(tree).map(
    (entry) => `  ${entry.file}: ${entry.names.slice(0, 5).join(", ")}`,
  );
}

describe("Main export limits", () => {
  for (const tree of COMMENT_TREES) {
    const limit = MAIN_EXPORT_LIMITS[tree];

    it(`should have at most ${limit} unnamed main exports in ${tree}`, () => {
      const lines = violationLines(tree);

      if (lines.length > limit) {
        expect.fail(
          `${lines.length} non-test modules in ${tree}/ export nothing named ` +
            `for the file; the cap is ${limit}.\n` +
            `Name the file for its main export, or the export for the file.\n` +
            lines.join("\n"),
        );
      }

      expect(lines.length).toBeLessThanOrEqual(limit);
    });

    it(`should lower the ${tree} cap when the count falls`, () => {
      const count = findMainExportViolations(tree).length;

      if (limit > count) {
        expect.fail(
          `${tree} has ${count} unnamed main exports but the cap is ${limit}; ` +
            `lower it in src/test/helpers/naming/main-export-limits.ts.`,
        );
      }

      expect(limit).toBe(count);
    });
  }
});
