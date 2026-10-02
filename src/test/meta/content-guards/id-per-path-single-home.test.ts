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

// Clips, tracks and scenes each ran their own copy of the same loop: split a
// path param, resolve each entry, keep a null where an entry named nothing.
// The copies drifted, and the model reads the warning they differ on, so the
// loop and its wording live in one place now.

const TOOLS_DIR = path.join(projectRoot, "src/tools");

const HOME = "src/tools/shared/validation/helpers/id-per-path-lookup.ts";

/** The loop itself. */
const PATH_ENTRY_LOOP = /\bfor\s*\(.*\bof\s+pathEntries\(/;

/** Its warning, and the wordings it replaced. */
const MISSING_TARGET_WARNING =
  /console\.warn\(\s*`(?:no |nothing )[^`]*\bat \$\{[\w.]+\} "\$\{[\w.]+\}"/;

describe("per-path id lookup has one home", () => {
  it("should not be rebuilt outside id-per-path-lookup.ts", () => {
    const violations = findLookups().filter(
      ({ file }) => !file.startsWith(HOME),
    );

    throwOnFileViolations(
      violations,
      "Found a per-path id lookup outside the shared one",
      `Call idPerPath and existingId from ${HOME} instead.`,
    );

    expect(violations).toHaveLength(0);
  });

  it("should still be built in id-per-path-lookup.ts", () => {
    const homes = findLookups().map(({ file }) => file.split(":")[0]);

    expect(homes).toContain(HOME);
  });
});

/**
 * Every place under src/tools that resolves a path param to ids itself.
 * @returns One entry per offending line, plus one per file writing the loop out
 */
function findLookups(): { file: string; reason: string }[] {
  return findSourceFiles(TOOLS_DIR, true).flatMap((file) => {
    const relative = path.relative(projectRoot, file);
    const source = fs.readFileSync(file, "utf8");
    const found = source.split("\n").flatMap((line, index) => {
      const reason = copiedLookup(line);

      return reason ? [{ file: `${relative}:${index + 1}`, reason }] : [];
    });

    // The same loop spelled over a variable rather than over the call.
    if (source.includes("pathEntries(") && source.includes("push(null)")) {
      found.push({ file: relative, reason: "collects a null-padded id list" });
    }

    return found;
  });
}

/**
 * What makes a line a copy of the lookup, if anything.
 * @param line - One line of source
 * @returns The reason, or null when the line is fine
 */
function copiedLookup(line: string): string | null {
  if (PATH_ENTRY_LOOP.test(line)) {
    return "loops over path entries";
  }

  if (MISSING_TARGET_WARNING.test(line)) {
    return "warns that a path named nothing";
  }

  return null;
}
