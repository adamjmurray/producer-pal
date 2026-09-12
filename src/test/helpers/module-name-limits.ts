// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The nothing-word ratchet: per-tree caps on non-test modules whose basename
// ends in a word that says nothing about the contents (`update-clip-helpers.ts`,
// `utils.ts`). src/test/meta/naming/module-name-limits.test.ts enforces them.
//
// THE RULE: when a count falls, lower its limit to the new number. Raising a
// limit needs the user's approval. A module is named for what it does; when a
// support file is being renamed anyway, the name is the fix.

import { type CommentTree } from "./comment-scan-helpers.ts";

/** Last hyphenated word of a basename that names nothing. */
export const NOTHING_WORDS = ["helpers", "utils", "misc", "common", "support"];

/** Cap on non-test files with a nothing-word basename per tree. */
export const NOTHING_WORD_FILE_LIMITS: Record<CommentTree, number> = {
  src: 69,
  scripts: 3,
  webui: 0,
  evals: 8,
  e2e: 0,
};
