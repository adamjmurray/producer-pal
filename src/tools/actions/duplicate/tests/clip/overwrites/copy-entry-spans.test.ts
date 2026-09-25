// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A copy's entry carries the span it landed at, keyed by the entry object. A
// spread or Object.assign builds a new object without it, and that copy is
// then reported deleted when a later copy only cut it short. Add a detail
// through getMinimalClipInfo's own param instead.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

const COPIED_CALL = /(?:\.\.\.|Object\.assign\()\s*getMinimalClipInfo\(/;
const ASSIGNED = /\b(?:const|let)\s+(\w+)\s*=\s*getMinimalClipInfo\(/g;

describe("copy entries keep their span", () => {
  it("never copies an entry getMinimalClipInfo made", () => {
    const violations = findSourceFiles(
      path.join(projectRoot, "src/tools"),
      true,
    ).flatMap((file) => copiedEntries(file));

    throwOnFileViolations(
      violations,
      "Found a getMinimalClipInfo entry copied into a new object",
      "Pass the detail as getMinimalClipInfo's second argument instead.",
    );

    expect(violations).toHaveLength(0);
  });
});

/**
 * Every place a file copies an entry getMinimalClipInfo made.
 * @param file - The source file
 * @returns One violation per copy
 */
function copiedEntries(file: string): { file: string; reason: string }[] {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(projectRoot, file);
  const names = [...source.matchAll(ASSIGNED)].map((match) => match[1]);
  const spreads = names.map((name) => new RegExp(`\\.\\.\\.\\s*${name}\\b`));

  return source
    .split("\n")
    .flatMap((line, index) =>
      COPIED_CALL.test(line) || spreads.some((spread) => spread.test(line))
        ? [{ file: `${relative}:${index + 1}`, reason: line.trim() }]
        : [],
    );
}
