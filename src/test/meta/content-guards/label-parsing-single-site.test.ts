// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// Every create and update tool used to paste the same preamble: check the
// call's lists against each other, work out what it acts on, then pair the name
// and color lists with it. That lives in labeled-targets.ts now, and a tool
// reaching past it for the parsers is the next copy starting.
const PARSER_CALL = /\b(?:parseNames|parseColors)\(/;

const TOOLS_DIR = path.join(projectRoot, "src/tools");

const CALLER = "src/tools/shared/validation/lists/labeled-targets.ts";

// The caller, plus the two modules that declare the parsers.
const ALLOWED = new Set([
  CALLER,
  "src/tools/shared/validation/color-parsing.ts",
  "src/tools/shared/validation/name-parsing.ts",
]);

describe("name and color parsing has one call site", () => {
  it("should not be called from a tool outside labeled-targets.ts", () => {
    const violations = findParserCalls().filter(
      ({ file }) => !ALLOWED.has(file.split(":")[0] as string),
    );

    throwOnFileViolations(
      violations,
      "Found parseNames/parseColors called outside the shared preamble",
      `Call resolveLabeledTargets, labelNewTargets, or pairLabels from ${CALLER} instead.`,
    );

    expect(violations).toHaveLength(0);
  });

  it("should still be called from labeled-targets.ts", () => {
    const callers = findParserCalls().map(({ file }) => file.split(":")[0]);

    expect(callers).toContain(CALLER);
  });
});

/**
 * Find every parseNames/parseColors call under src/tools
 * @returns One violation per call, located by file and line
 */
function findParserCalls(): { file: string; reason: string }[] {
  return findSourceFiles(TOOLS_DIR, true).flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, lineIndex) =>
        PARSER_CALL.test(line)
          ? [
              {
                file: `${path.relative(projectRoot, file)}:${lineIndex + 1}`,
                reason: line.trim(),
              },
            ]
          : [],
      ),
  );
}
