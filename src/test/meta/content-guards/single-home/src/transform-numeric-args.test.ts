// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// ratchet() and repeat() each refused a bare pitch name as their numeric
// argument the same way. The up-front note op checks do that once, in
// constantArg, and each op supplies its own wording.
const PITCH_ARG_GUARD = /\barg\.type === "pitchLiteral"/;

const HOME = "src/notation/transform/helpers/note-ops/note-op-arg-checks.ts";

describe("the note-op numeric argument guard has one home", () => {
  it("refuses a bare pitch name in constantArg only", () => {
    expect(
      filesContaining("src/notation", PITCH_ARG_GUARD),
      "call constantArg with this op's wording instead",
    ).toStrictEqual([HOME]);
  });
});
