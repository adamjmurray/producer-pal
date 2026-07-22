// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  countPatternOccurrences,
  findRepoTextFiles,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// This repo is public; Linear ticket numbers are private. Ticket references
// (the "AJM-" prefix followed by digits) must not leak into any tracked file —
// comments, docs, test names, or prose. The rule text elsewhere uses the
// placeholder "AJM-NNN" (letters), which this digit-based pattern won't match.
const LINEAR_REF = /AJM-\d+/;

describe("no Linear ticket references", () => {
  it("should not contain any AJM-<number> references in tracked files", () => {
    const files = findRepoTextFiles();
    const matches = countPatternOccurrences(files, LINEAR_REF);

    throwOnFileViolations(
      matches.map((m) => ({ file: `${m.file}:${m.line}`, reason: m.match })),
      "Found Linear ticket reference(s) in the public repo",
      "Linear is private — remove the ticket number. Describe the reasoning " +
        "directly in the comment instead of pointing at a ticket.",
    );

    expect(matches).toHaveLength(0);
  });
});
