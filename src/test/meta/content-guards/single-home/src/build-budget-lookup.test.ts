// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { testFilesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Every per-tool budget test asks the build-stats report the same question —
// how much of one call went to a target shape — and each wrote out the lookup.
// They call resolves() now.
const SHAPE_LOOKUP = /byShape\.find\(/;

const HOME = "src/live-api-adapter/tests/objects/build-budget-resolves.ts";

describe("the build-budget shape lookup has one home", () => {
  it("reads byShape from the budget helper only", () => {
    expect(
      testFilesContaining("src", SHAPE_LOOKUP),
      "count a shape with resolves()",
    ).toStrictEqual([HOME]);
  });
});
