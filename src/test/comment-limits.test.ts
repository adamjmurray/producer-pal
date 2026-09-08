// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type TreeLimits,
  COMMENT_LINE_LIMITS,
  LONG_BLOCK_FILE_LIMITS,
  LONGEST_BLOCK_LIMITS,
} from "./helpers/comment-limits.ts";
import {
  type CommentSummary,
  type CommentTree,
  type FileCommentStats,
  COMMENT_TREES,
  LONG_BLOCK_LINES,
  scanCommentTree,
  summarizeComments,
} from "./helpers/comment-scan-helpers.ts";

// A ratchet on comment volume in the non-test sources: the license header and
// lint directives don't count, everything else does. `npm run comment:stats`
// prints the same numbers and names the worst files. The caps, and the rule for
// changing them, live in helpers/comment-limits.ts.
//
// Blocks are the metric that actually points at over-explaining: a run of 8+
// comment lines is usually a story that could be a sentence.

interface Metric {
  name: string;
  limits: TreeLimits;
  /** The tree-wide number the limit caps. */
  measure: (summary: CommentSummary) => number;
  /** Per-file number ranking the worst offenders in a failure message. */
  fileMeasure: (file: FileCommentStats) => number;
  fix: string;
}

const METRICS: Metric[] = [
  {
    name: "comment lines",
    limits: COMMENT_LINE_LIMITS,
    measure: (s) => s.commentLines,
    fileMeasure: (f) => f.commentLines,
    fix: "Say it once, in the fewest words that stay accurate.",
  },
  {
    name: "lines in the longest comment block",
    limits: LONGEST_BLOCK_LIMITS,
    measure: (s) => s.longestBlock,
    fileMeasure: (f) => f.longestBlock,
    fix: "Keep the load-bearing facts and cut the story around them.",
  },
  {
    name: `files with a ${LONG_BLOCK_LINES}+ line comment block`,
    limits: LONG_BLOCK_FILE_LIMITS,
    measure: (s) => s.longBlockFiles,
    fileMeasure: (f) => f.longestBlock,
    fix: "A block that long usually belongs in dev/ docs, or nowhere.",
  },
];

/** How many offending files a failure message names. */
const WORST_COUNT = 5;

describe("Comment limits", () => {
  const byTree = new Map<CommentTree, FileCommentStats[]>(
    COMMENT_TREES.map((tree) => [tree, scanCommentTree(tree)]),
  );

  for (const metric of METRICS) {
    const { name } = metric;

    describe(`${name} budget`, () => {
      for (const tree of COMMENT_TREES) {
        const limit = metric.limits[tree];

        it(`should have at most ${limit} ${name} in ${tree}`, () => {
          const files = byTree.get(tree) as FileCommentStats[];
          const value = metric.measure(summarizeComments(files));

          if (value > limit) {
            expect.fail(
              `${tree} has ${value} ${name} (max: ${limit}):\n` +
                `${worstFiles(files, metric)}\n\n${metric.fix}\n` +
                `Run \`npm run comment:stats\` for the full picture.`,
            );
          }

          expect(value).toBeLessThanOrEqual(limit);
        });
      }
    });
  }
});

/**
 * List the files a metric ranks worst
 * @param files - Every file in the tree
 * @param metric - The metric that failed
 * @returns Indented lines naming the worst files and their numbers
 */
function worstFiles(files: FileCommentStats[], metric: Metric): string {
  return files
    .toSorted((a, b) => metric.fileMeasure(b) - metric.fileMeasure(a))
    .slice(0, WORST_COUNT)
    .map((f) => `  - ${f.file}: ${metric.fileMeasure(f)}`)
    .join("\n");
}
