// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  COMMENT_DENSITY_LIMITS,
  LONG_BLOCK_ALLOWANCES,
  MAX_BLOCK_LINES,
  MAX_LONG_BLOCK_ALLOWANCES,
} from "./helpers/comment-limits.ts";
import {
  type CommentTree,
  type FileCommentStats,
  COMMENT_TREES,
  commentDensity,
  scanCommentTree,
  summarizeComments,
} from "./helpers/comment-scan-helpers.ts";

// A ratchet on comment slop in the non-test sources: the license header and
// lint directives don't count, everything else does. `npm run comment:stats`
// prints the same numbers and names the worst files. The caps, and the rule for
// changing them, live in helpers/comment-limits.ts.
//
// Two metrics, neither of which moves when files are split, merged or renamed:
// how many comment lines a tree carries per line of code, and how long a single
// comment block gets. A run of 25+ comment lines is usually a story that could
// be a sentence.

/** How many offending files a failure message names. */
const WORST_COUNT = 5;

/** Below this many code lines a file's density is noise, so it isn't ranked. */
const RANKED_CODE_LINES = 40;

/** Cap granularity: a cap stays within this of the density it holds. */
const STEP = 0.005;

describe("Comment limits", () => {
  const byTree = new Map<CommentTree, FileCommentStats[]>(
    COMMENT_TREES.map((tree) => [tree, scanCommentTree(tree, MAX_BLOCK_LINES)]),
  );
  const files = [...byTree.values()].flat();

  describe("comment density", () => {
    for (const tree of COMMENT_TREES) {
      const cap = COMMENT_DENSITY_LIMITS[tree];

      it(`should hold ${tree} at ${cap} comment lines per code line`, () => {
        const treeFiles = byTree.get(tree) as FileCommentStats[];
        const density = commentDensity(summarizeComments(treeFiles));

        checkDensity(tree, density, cap, treeFiles);
        expect(density).toBeLessThanOrEqual(cap);
      });
    }
  });

  describe("long comment blocks", () => {
    it(`should keep every comment block to ${MAX_BLOCK_LINES} lines`, () => {
      const over = files.flatMap((file) =>
        file.blocks
          .filter(
            (block) =>
              block.lines >
              (LONG_BLOCK_ALLOWANCES[file.file] ?? MAX_BLOCK_LINES),
          )
          .map(
            (block) => `  - ${file.file}:${block.line}: ${block.lines} lines`,
          ),
      );

      if (over.length > 0) {
        expect.fail(
          `Comment blocks over ${MAX_BLOCK_LINES} lines, with no allowance ` +
            `that long:\n${over.join("\n")}\n\n` +
            "Keep the load-bearing facts and cut the story around them — a " +
            "block that long usually belongs in dev/ docs, or nowhere.",
        );
      }

      expect(over).toStrictEqual([]);
    });

    it("should hold every allowance at its file's longest block", () => {
      const stale = staleAllowances(files);

      if (stale.length > 0) {
        expect.fail(
          `Stale entries in LONG_BLOCK_ALLOWANCES:\n${stale.join("\n")}\n\n` +
            "The list only shrinks, so fix it in the commit that shortens or " +
            "moves the block.",
        );
      }

      expect(stale).toStrictEqual([]);
    });

    it(`should keep at most ${MAX_LONG_BLOCK_ALLOWANCES} allowances`, () => {
      const count = Object.keys(LONG_BLOCK_ALLOWANCES).length;

      if (count > MAX_LONG_BLOCK_ALLOWANCES) {
        expect.fail(
          `${count} files hold a long-block allowance (max: ` +
            `${MAX_LONG_BLOCK_ALLOWANCES}). New long blocks don't get one — ` +
            "shorten the block instead.",
        );
      }

      expect(count).toBeLessThanOrEqual(MAX_LONG_BLOCK_ALLOWANCES);
    });
  });
});

/**
 * Fail when a tree is over its density cap, or the cap has drifted above it
 * @param tree - The tree being checked
 * @param density - The tree's comment lines per code line
 * @param cap - The tree's cap
 * @param files - Every file in the tree, for the failure message
 */
function checkDensity(
  tree: CommentTree,
  density: number,
  cap: number,
  files: FileCommentStats[],
): void {
  if (thousandths(density) > thousandths(cap)) {
    expect.fail(
      `${tree} carries ${density} comment lines per code line (max: ${cap}):\n` +
        `${worstFiles(files)}\n\nSay it once, in the fewest words that stay ` +
        "accurate.\nRun `npm run comment:stats` for the full picture.",
    );
  }

  if (thousandths(cap) - thousandths(density) >= thousandths(STEP)) {
    expect.fail(
      `${tree} comment density has fallen to ${density} — lower its cap in ` +
        `src/test/helpers/comment-limits.ts to ${capFor(density)}.`,
    );
  }
}

/**
 * Name the allowances that no longer match the tree
 * @param files - Every scanned file
 * @returns One indented line per stale entry, with the fix
 */
function staleAllowances(files: FileCommentStats[]): string[] {
  const longest = new Map(files.map((file) => [file.file, file.longestBlock]));

  return Object.entries(LONG_BLOCK_ALLOWANCES).flatMap(([file, allowed]) => {
    const actual = longest.get(file);

    if (actual == null) {
      return [`  - ${file}: not a scanned source — drop the entry`];
    }

    if (actual <= MAX_BLOCK_LINES) {
      return [`  - ${file}: longest block is now ${actual} — drop the entry`];
    }

    return actual === allowed
      ? []
      : [
          `  - ${file}: allows ${allowed}, holds ${actual} — set it to ${actual}`,
        ];
  });
}

/**
 * List the densest files in a tree
 * @param files - Every file in the tree
 * @returns Indented lines naming the worst files and their densities
 */
function worstFiles(files: FileCommentStats[]): string {
  return files
    .filter((file) => file.codeLines >= RANKED_CODE_LINES)
    .toSorted((a, b) => commentDensity(b) - commentDensity(a))
    .slice(0, WORST_COUNT)
    .map(
      (file) =>
        `  - ${file.file}: ${commentDensity(file)} ` +
        `(${file.commentLines} comment / ${file.codeLines} code)`,
    )
    .join("\n");
}

/**
 * The cap a density belongs under: the next STEP at or above it
 * @param density - Comment lines per code line
 * @returns The cap, to 3 decimals
 */
function capFor(density: number): number {
  const steps = Math.ceil(thousandths(density) / thousandths(STEP));

  return Number((steps * STEP).toFixed(3));
}

/**
 * Scale a 3-decimal number to a whole number, so comparisons skip float noise
 * @param value - A density or a cap
 * @returns The value in thousandths
 */
function thousandths(value: number): number {
  return Math.round(value * 1000);
}
