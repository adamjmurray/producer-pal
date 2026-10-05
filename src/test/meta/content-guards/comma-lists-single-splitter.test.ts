// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// A comma list a caller sends has one set of rules: a hole or an empty list is
// refused, and `\,` is a literal comma. They live in splitEntries and the
// helpers on top of it. A tool that cuts a list with its own `.split(",")`
// drops the rules without a word, so every such split has to be named here,
// with the reason it is not caller input.
const COMMA_SPLIT = /\.split\(\s*(?:["'`]\s*,\s*["'`]|\/[^/\n]*,[^/\n]*\/)/;

const TOOLS_DIR = path.join(projectRoot, "src/tools");

/** File to how many splits it may hold, and why they are not caller input. */
const ALLOWED = new Map<string, { count: number; reason: string }>([
  [
    "src/tools/shared/validation/lists/split-entries.ts",
    { count: 1, reason: "the shared splitter itself" },
  ],
  [
    "src/tools/shared/device/helpers/path/chains-left.ts",
    { count: 1, reason: "reads a string this code built, not a param" },
  ],
]);

describe("comma lists have one splitter", () => {
  it("should not split a comma list outside the shared splitter", () => {
    const found = findCommaSplits();
    const violations = [...found].flatMap(([file, lines]) => {
      const allowed = ALLOWED.get(file)?.count ?? 0;

      return lines.length > allowed
        ? lines.map((line) => ({
            file: `${file}:${line.number}`,
            reason: line.text,
          }))
        : [];
    });

    throwOnFileViolations(
      violations,
      "Found a comma split outside splitEntries",
      "Read a caller's list with targetEntries (or splitList / pairLabels for " +
        "a value list) so it refuses holes and honors \\,. If the string is " +
        "not caller input, add the file to ALLOWED with the reason.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should not keep an allowance for a split that is gone", () => {
    const found = findCommaSplits();

    const counts = [...ALLOWED].map(([file, { count }]) => [
      file,
      found.get(file)?.length ?? 0,
      count,
    ]);

    expect(counts.filter(([, seen, count]) => seen !== count)).toStrictEqual(
      [],
    );
  });
});

/**
 * Find every comma split in non-test source under src/tools
 * @returns Each file's matching lines, by project-relative path
 */
function findCommaSplits(): Map<string, { number: number; text: string }[]> {
  const found = new Map<string, { number: number; text: string }[]>();

  for (const file of findSourceFiles(TOOLS_DIR, true)) {
    const lines = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .flatMap((text, index) =>
        COMMA_SPLIT.test(text) && !/^\s*(?:\/\/|\*)/.test(text)
          ? [{ number: index + 1, text: text.trim() }]
          : [],
      );

    if (lines.length > 0) {
      found.set(path.relative(projectRoot, file), lines);
    }
  }

  return found;
}
