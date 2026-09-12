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

// read-clip, create-clip, update-clip and duplicate each wrote their own "the
// path param and the slot param it replaced were both sent" check, and the
// coerced-null bug that makes an unsent param look sent had to be fixed in more
// than one of them. doubled-spelling.ts is the one home now; a hand-rolled
// check is the next copy starting.
const GUARD = "src/tools/shared/validation/doubled-spelling.ts";

const TOOLS_DIR = path.join(projectRoot, "src/tools");

/** Two presence checks joined in one condition. */
const BOTH_SET = /(\w+)\s*!=\s*null\s*&&\s*(\w+)\s*!=\s*null/g;

describe("the doubled-spelling guard has one home", () => {
  it("should not be hand-rolled in a tool", () => {
    const violations = findBothSetChecks();

    throwOnFileViolations(
      violations,
      "Found a hand-rolled path/slot both-set check",
      `Call refuseDoubledSpelling or warnDoubledSpelling from ${GUARD} instead.`,
    );

    expect(violations).toHaveLength(0);
  });

  it("should still offer both ways of reporting the conflict", () => {
    const guard = fs.readFileSync(path.join(projectRoot, GUARD), "utf8");

    expect(guard).toContain("export function refuseDoubledSpelling");
    expect(guard).toContain("export function warnDoubledSpelling");
  });
});

/**
 * Find every `<path-ish> != null && <slot-ish> != null` under src/tools.
 * @returns One violation per check, located by file
 */
function findBothSetChecks(): { file: string; reason: string }[] {
  return findSourceFiles(TOOLS_DIR, true).flatMap((file) => {
    // The condition often wraps, so the whole file is read as one line.
    const source = fs.readFileSync(file, "utf8").replaceAll(/\s+/g, " ");

    return [...source.matchAll(BOTH_SET)]
      .filter(([, left, right]) => namesAPathAndASlot(left, right))
      .map((match) => ({
        file: path.relative(projectRoot, file),
        reason: match[0] as string,
      }));
  });
}

/**
 * Whether the two names are a destination or target and the deprecated slot
 * spelling it replaced — `toPath`/`toSlot`, `path`/`slot`, either order.
 * @param left - The first name in the condition
 * @param right - The second name in the condition
 * @returns True when the pair is the one the guard owns
 */
function namesAPathAndASlot(
  left: string | undefined,
  right: string | undefined,
): boolean {
  const names = [left, right].map((name) => name?.toLowerCase() ?? "");

  return (
    names.some((name) => name.endsWith("path")) &&
    names.some((name) => name.endsWith("slot"))
  );
}
