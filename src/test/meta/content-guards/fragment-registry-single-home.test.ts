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

// builtin-fragments.ts used to import every fragment module and keep its own
// name → body map beside the one in SKILL_SLOTS. Two maps meant a fragment could
// be added to one and missed in the other with nothing to catch it, so
// SKILL_SLOTS is the only place a fragment is declared now. A file pulling in a
// pile of fragment bodies is that second map starting again.

const SRC_DIR = path.join(projectRoot, "src");

/** The modules that hold a fragment's text. */
const FRAGMENT_MODULE =
  /from "#src\/skills\/(?:drivers\.ts|fragments\/|notation\/)/g;

const REGISTRY = "src/skills/skill-slots.ts";

// builtin-fragments.ts names code-transforms, the one fragment with no slot that
// carries text. A second registry would name them all, so a couple is plenty of
// room for a named exception.
const MAX_ELSEWHERE = 2;

describe("the skills fragment registry has one home", () => {
  it("should not import fragment bodies outside the registry", () => {
    const violations = fragmentImporters()
      .filter(({ file, count }) => file !== REGISTRY && count > MAX_ELSEWHERE)
      .map(({ file, count }) => ({
        file,
        reason: `imports ${count} fragment modules`,
      }));

    throwOnFileViolations(
      violations,
      "Found fragment bodies imported outside the slot registry",
      `Declare the fragment in SKILL_SLOTS (${REGISTRY}) and read its body from there.`,
    );

    expect(violations).toHaveLength(0);
  });

  it("should still declare the fragments in the registry", () => {
    const registry = fragmentImporters().find(({ file }) => file === REGISTRY);

    expect(registry?.count).toBeGreaterThan(MAX_ELSEWHERE);
  });
});

/**
 * Count the fragment modules each source file imports
 * @returns One entry per file importing at least one, by project-relative path
 */
function fragmentImporters(): { file: string; count: number }[] {
  return findSourceFiles(SRC_DIR, true).flatMap((file) => {
    const count = (fs.readFileSync(file, "utf8").match(FRAGMENT_MODULE) ?? [])
      .length;

    return count === 0
      ? []
      : [{ file: path.relative(projectRoot, file), count }];
  });
}
