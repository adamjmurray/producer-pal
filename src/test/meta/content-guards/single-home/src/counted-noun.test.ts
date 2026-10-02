// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Two list modules each carried a plural(), and they disagreed: one knew about
// -ies and the other did not, so the same noun read differently depending on
// which message you got.
const PLURAL = /function plural\(/;

const HOME = "src/tools/shared/validation/lists/plural.ts";

describe("counted nouns have one home", () => {
  it("spells a plural in plural.ts only", () => {
    expect(
      filesContaining("src", PLURAL),
      "import plural from lists/plural.ts",
    ).toStrictEqual([HOME]);
  });
});
