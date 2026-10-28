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

// Eleven tools each wrote the "id or path is required" refusal by hand. The
// words live in idOrPathRequired now, so every tool says it the same way.
const HOME = "src/tools/shared/validation/id-validation.ts";

describe("the id-or-path-required refusal has one home", () => {
  it("should not be worded in a tool", () => {
    const violations = findSourceFiles(
      path.join(projectRoot, "src/tools"),
      true,
    )
      .filter((file) => path.relative(projectRoot, file) !== HOME)
      .filter((file) => fs.readFileSync(file, "utf8").includes("id or path is"))
      .map((file) => ({
        file: path.relative(projectRoot, file),
        reason: 'contains "id or path is"',
      }));

    throwOnFileViolations(
      violations,
      "Found a hand-written id-or-path-required error",
      `Throw new Error(idOrPathRequired()) from ${HOME} instead.`,
    );

    expect(violations).toHaveLength(0);
  });
});
