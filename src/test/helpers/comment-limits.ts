// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The comment-volume ratchet: per-tree caps that src/test/comment-limits.test.ts
// enforces and `npm run comment:stats` prints beside the current numbers.
//
// THE RULE: when a count falls, lower its limit to just above the new number.
// Raising a limit needs the user's approval — otherwise a verbose comment pays
// for itself by widening the budget, which is what the ratchet exists to stop.

import { type CommentTree } from "./comment-scan-helpers.ts";

/** One cap per tree. */
export type TreeLimits = Record<CommentTree, number>;

/** Cap on comment lines per tree. */
export const COMMENT_LINE_LIMITS: TreeLimits = {
  src: 25_800,
  scripts: 2_460,
  webui: 12_030,
  evals: 7_110,
  e2e: 93,
};

/** Cap on the longest single comment block per tree. */
export const LONGEST_BLOCK_LIMITS: TreeLimits = {
  src: 74,
  scripts: 41,
  webui: 48,
  evals: 34,
  e2e: 11,
};

/** Cap on how many files hold a long comment block per tree. */
export const LONG_BLOCK_FILE_LIMITS: TreeLimits = {
  src: 380,
  scripts: 35,
  webui: 206,
  evals: 113,
  e2e: 2,
};
