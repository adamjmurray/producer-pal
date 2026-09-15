// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// ratchet() and repeat() each guarded their numeric argument the same way: a
// bare pitch name, then evaluate-in-a-try, then a finite check. numericOpArg
// does that once and each op supplies its own wording.
const PITCH_ARG_GUARD = /\barg\.type === "pitchLiteral"/;

const HOME = "src/notation/transform/helpers/note-ops/numeric-op-arg.ts";

describe("the note-op numeric argument guard has one home", () => {
  it("refuses a bare pitch name in numericOpArg only", () => {
    expect(
      filesContaining("src/notation", PITCH_ARG_GUARD),
      "call numericOpArg with this op's warnings instead",
    ).toStrictEqual([HOME]);
  });
});
