// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MAX_ARRANGEMENT_LENGTH_BEATS } from "#src/tools/constants.ts";
import { refuseArrangementLengthTooLong } from "../arrangement-position-cap.ts";

describe("refuseArrangementLengthTooLong", () => {
  it("allows the longest length and refuses one past it", () => {
    expect(() =>
      refuseArrangementLengthTooLong(MAX_ARRANGEMENT_LENGTH_BEATS, 4, 4),
    ).not.toThrow();
    expect(() =>
      refuseArrangementLengthTooLong(MAX_ARRANGEMENT_LENGTH_BEATS + 1, 4, 4),
    ).toThrow("arrangementLength can be at most 394200bar");
  });

  it.each([
    [3, 4, "525600bar"],
    [6, 8, "525600bar"],
    [7, 8, "450514bar+n/4"],
  ])("writes the limit in %i/%i as %s", (numerator, denominator, max) => {
    expect(() =>
      refuseArrangementLengthTooLong(
        MAX_ARRANGEMENT_LENGTH_BEATS + 1,
        numerator,
        denominator,
      ),
    ).toThrow(`arrangementLength can be at most ${max}`);
  });
});
