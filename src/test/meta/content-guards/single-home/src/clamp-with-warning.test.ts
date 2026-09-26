// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Velocity and probability each wrote out the same clamp-then-warn. They share
// clampAndWarn now, which is also the only thing that decides how the warning
// reads — and the model reads it.
const CLAMP_WARNING = /; clamped to \$\{/;

const HOME = "src/notation/barbeat/interpreter/helpers/value-clamping.ts";

describe("clamp-and-warn has one home", () => {
  it("says a value was clamped from clampAndWarn only", () => {
    expect(
      filesContaining("src", CLAMP_WARNING),
      "clamp through clampAndWarn in value-clamping.ts",
    ).toStrictEqual([HOME]);
  });
});
