// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The main-export ratchet: per-tree caps on non-test modules whose exported
// functions and classes name nothing the filename names.
// src/test/meta/naming/main-export-limits.test.ts enforces them.
//
// THE RULE: when a count falls, lower its limit to the new number. Raising a
// limit needs the user's approval. A file is named for what its main export
// does, so the two should at least be about the same thing.

import { type CommentTree } from "../comment-scan-helpers.ts";

/** Cap on non-test modules whose exports don't name the file, per tree. */
export const MAIN_EXPORT_LIMITS: Record<CommentTree, number> = {
  src: 15,
  scripts: 3,
  webui: 5,
  evals: 3,
  e2e: 0,
};
