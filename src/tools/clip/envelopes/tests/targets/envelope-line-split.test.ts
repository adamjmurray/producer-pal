// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// Splitting an `envelopes` line into its target and its notation.

import { describe, expect, it } from "vitest";
import { parseEnvelopeLines } from "#src/tools/clip/envelopes/envelope-lines.ts";

describe("parseEnvelopeLines - where a line splits", () => {
  it.each([
    ["472: 1|1 0.5 (4.00 : 1)", "472", "1|1 0.5 (4.00 : 1)"],
    [
      "t0/d1/Ratio: 1|1 (4.00 : 1) / 3|1 (2.00 : 1)",
      "t0/d1/Ratio",
      "1|1 (4.00 : 1) / 3|1 (2.00 : 1)",
    ],
    ["t0/d0/h5: 1|1 (4:1)", "t0/d0/h5", "1|1 (4:1)"],
    ["t0/d0/Osc 1: Pitch: 1|1 0.5", "t0/d0/Osc 1: Pitch", "1|1 0.5"],
    ["t0/d0/Osc 1: Pitch: 1|1 (4 : 1)", "t0/d0/Osc 1: Pitch", "1|1 (4 : 1)"],
    ["t0/d0/Attack (2): 1|1 0.5", "t0/d0/Attack (2)", "1|1 0.5"],
    ["t0/d0/Attack (2): 1|1 (4 : 1)", "t0/d0/Attack (2)", "1|1 (4 : 1)"],
    ["t0/d0/Attack (2):", "t0/d0/Attack (2)", ""],
  ])("splits %s", (line, target, notation) => {
    expect(parseEnvelopeLines(line)).toStrictEqual([{ target, notation }]);
  });

  it("refuses a line whose brackets don't open", () => {
    expect(() => parseEnvelopeLines("472: 1|1 4 : 1)")).toThrow(
      'Invalid envelopes line "472: 1|1 4 : 1)"',
    );
  });
});
