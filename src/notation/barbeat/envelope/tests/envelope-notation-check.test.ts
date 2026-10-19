// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// Checking envelope notation's syntax before any clip's meter is known.

import { describe, expect, it, vi } from "vitest";
import { checkEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
}));

describe("checkEnvelopeNotation", () => {
  it("leaves times and their order to the clip's meter, without warning", () => {
    for (const text of [
      // Forwards in 6/8, backwards in 4/4.
      "1|1 0 / 1|5 0.5 / 1|6 0.7 / 2|1 1",
      // Backwards in any meter: the clip refuses it.
      "3|1 0.5 / 1|1 0",
      "1|1 0 / 1|9 1",
      "",
    ]) {
      expect(() => checkEnvelopeNotation(text)).not.toThrow();
    }

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("refuses the syntax errors a parse does", () => {
    for (const [text, error] of [
      ["1|1 loud", /Invalid envelope value: "loud"/],
      ["1|1", /Invalid envelope point: "1\|1"/],
      ["beat3 0.5", /Invalid bar\|beat format: "beat3"/],
      ["1|1+n/0 0.5", /division by zero/],
      ["0|1 0.5", /bars are 1-indexed/],
      ["1|1 0 ~ 2|1 1", /write the amount right after the "~"/],
      ["1|1 0 ~1.5 2|1 1", /the amount must be from -1 to 1/],
      ["1|1 0.5 /", /needs a point on each side/],
    ] as const) {
      expect(() => checkEnvelopeNotation(text)).toThrow(error);
    }
  });
});
