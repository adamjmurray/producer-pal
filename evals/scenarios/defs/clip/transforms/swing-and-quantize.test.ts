// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalAssertion,
  type EvalTurnResult,
  type StateAssertion,
} from "../../../types.ts";
import { swingAndQuantize, usedQuant } from "./swing-and-quantize.ts";

const state = swingAndQuantize.assertions.find(
  (a: EvalAssertion) => a.type === "state",
) as StateAssertion;

/** A read-back clip: a kick plus hats (pitch 44) at the given starts. */
const clipWithHats = (starts: number[]): { notes: string } => ({
  notes: `[{p:36,t:0,d:0.25,v:100},${starts
    .map((t) => `{p:44,t:${t},d:0.25,v:100}`)
    .join(",")}]`,
});

const gridStarts = (count: number, step = 0.25): number[] =>
  Array.from({ length: count }, (_, i) => i * step);

const passes = (result: unknown): boolean =>
  (state.expect as (r: unknown) => boolean)(result);

describe("swing-and-quantize turn 4 state", () => {
  it("accepts 20 hats on the 16th grid", () => {
    expect(passes(clipWithHats(gridStarts(20)))).toBe(true);
  });

  it("rejects a swung hat", () => {
    const starts = gridStarts(20);

    starts[3] = 0.8;
    expect(passes(clipWithHats(starts))).toBe(false);
  });

  it("rejects a hat off the grid", () => {
    const starts = gridStarts(20);

    starts[5] = 1.3;
    expect(passes(clipWithHats(starts))).toBe(false);
  });

  it("rejects lost hats", () => {
    expect(passes(clipWithHats(gridStarts(19)))).toBe(false);
  });

  it("rejects missing or unparseable notes", () => {
    expect(passes({})).toBe(false);
    expect(passes({ notes: "not midi-json" })).toBe(false);
  });

  it("explains a failure", () => {
    const explain = state.explain as (r: unknown) => string;

    expect(explain(clipWithHats(gridStarts(19)))).toBe(
      "expected 20 hats, found 19",
    );
    expect(explain({})).toMatch(/missing or not parseable/);
    expect(explain(clipWithHats(gridStarts(20)))).toBe("ok");
  });
});

const turnsWith = (
  args: Record<string, unknown>,
  at = 4,
  more: Record<number, Record<string, unknown>> = {},
): EvalTurnResult[] =>
  Array.from({ length: 5 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: Object.entries({ ...more, [at]: args })
      .filter(([turn]) => Number(turn) === i)
      .map(([, a]) => ({
        name: "ppal-update-clip",
        args: a,
        result: '{id:"1"}',
      })),
    durationMs: 1,
  }));

const custom = (description: string): CustomAssertion =>
  swingAndQuantize.assertions.find(
    (a) => a.type === "custom" && a.description === description,
  ) as CustomAssertion;

describe("swing-and-quantize swing turns", () => {
  const swung = custom("turn 2 swings the hats with swing()");
  const lower = custom("swing amount in turn 3 is lower than turn 2");

  it.each([
    { transforms: "Ab1: timing = swing(0.2)" },
    { transforms: "G#1: timing = swing(.2)" },
    { preTransforms: "Ab1: timing = swing(1, n/16)" },
    { transforms: "velocity = 90\nAb1 1|1-2|4: timing = swing( 0.05 )" },
  ])("accepts %o", (args) => {
    expect(swung.assert(turnsWith(args, 2))).toBe(true);
  });

  it.each([
    { transforms: "E1: timing = swing(0.2)" },
    { transforms: "Ab1: timing = quant(n/16)" },
    { transforms: "Ab1: timing = swing()" },
  ])("rejects %o", (args) => {
    expect(() => swung.assert(turnsWith(args, 2))).toThrow("no hat swing()");
  });

  it("compares amounts across params and spellings", () => {
    const turns = turnsWith({ preTransforms: "G#1: timing = swing(.1)" }, 3, {
      2: { transforms: "Ab1: timing = swing(0.3)" },
    });

    expect(lower.assert(turns)).toBe(true);
  });

  it("fails when turn 3 is not lower", () => {
    const turns = turnsWith({ transforms: "Ab1: timing = swing(0.3)" }, 3, {
      2: { transforms: "Ab1: timing = swing(0.3)" },
    });

    expect(() => lower.assert(turns)).toThrow("should be less than");
  });
});

describe("swing-and-quantize quant() signal", () => {
  it.each([
    { transforms: "Ab1: timing = quant(n/16)" },
    { preTransforms: "Ab1: timing = quant(0.25)" },
  ])("sees quant() in %o", (args) => {
    expect(usedQuant(turnsWith(args), 4)).toBe(true);
  });

  it("reports a hand-rolled quantize", () => {
    expect(() =>
      usedQuant(
        turnsWith({ preTransforms: "Ab1: timing = round(note.start * 4) / 4" }),
        4,
      ),
    ).toThrow("no quant() in turn 4");
  });
});
