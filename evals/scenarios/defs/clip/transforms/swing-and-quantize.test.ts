// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type EvalAssertion } from "../../../types.ts";
import { swingAndQuantize } from "./swing-and-quantize.ts";

const quantizeCheck = swingAndQuantize.assertions.find(
  (a: EvalAssertion) => a.type === "tool_called" && a.turn === 4,
);

/**
 * @param transforms - The transforms string a model sent in turn 4
 * @returns Whether the turn-4 check accepts it
 */
function accepts(transforms: string): boolean {
  const { args } = quantizeCheck as unknown as {
    args: { asymmetricMatch: (other: unknown) => boolean };
  };

  return args.asymmetricMatch({ transforms });
}

describe("swing-and-quantize turn 4", () => {
  it.each([
    "Ab1: timing = quant(n/16)",
    "Ab1: timing = quant(0.25)",
    "Ab1: timing = round(note.start / n/16) * n/16",
    "Ab1: timing = round(note.start / n/16) * (n/16)",
    "Ab1: timing = round(note.start / 0.25) * 0.25",
    "Ab1: timing = round(note.start / n/16) * n/16\nAb1: velocity = 90",
  ])("accepts %s", (transforms) => {
    expect(accepts(transforms)).toBe(true);
  });

  it.each([
    "Ab1: timing = quant(n/8)",
    "Ab1: timing = round(note.start / n/8) * n/8",
    "Ab1: timing = round(note.start / n/16) * n/8",
    "Ab1: timing = round(note.start / n/16) * n/160",
    "Ab1: timing = round(note.start / n/16)",
    "Ab1: timing = snap(note.start, n/16)",
    "Ab1: timing = swing(0.2)",
  ])("rejects %s", (transforms) => {
    expect(accepts(transforms)).toBe(false);
  });
});
