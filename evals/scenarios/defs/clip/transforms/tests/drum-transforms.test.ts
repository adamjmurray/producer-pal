// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../../../types.ts";
import { drumTransforms } from "../drum-transforms.ts";

const grader = (description: string): CustomAssertion =>
  drumTransforms.assertions.find(
    (a) => a.type === "custom" && a.description === description,
  ) as CustomAssertion;

const update = (transforms: string): ToolCall => ({
  name: "ppal-update-clip",
  args: { path: "t0/s0", transforms },
  result: `{id:"1",noteCount:32}`,
});

const turnsWithCalls = (turn: number, calls: ToolCall[]): EvalTurnResult[] =>
  Array.from({ length: 5 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: i === turn ? calls : [],
    durationMs: 1,
  }));

describe("drumTransforms graders", () => {
  const crescendo =
    "crescendo uses velocity ramp scoped to hats in last 2 beats";
  const lfo = "LFO targets hats before the crescendo, no ramp re-applied";

  it("turn 2 grades the call that fixed a wrong time range", () => {
    const calls = [
      update("Ab1 2|1-2|4.75: velocity = ramp(20, 127)"),
      update("Ab1 2|3-2|4.75: velocity = ramp(20, 127)"),
    ];

    expect(grader(crescendo).assert(turnsWithCalls(2, calls))).toBe(true);
  });

  it("turn 2 fails when the only call has the wrong time range", () => {
    const calls = [update("Ab1 2|1-2|4.75: velocity = ramp(20, 127)")];

    expect(() => grader(crescendo).assert(turnsWithCalls(2, calls))).toThrow(
      "time range should cover 2|3",
    );
  });

  it("turn 3 still fails a ramp re-applied in an earlier call", () => {
    const calls = [
      update("Ab1 1|1-<2|3: velocity = ramp(20, 127)"),
      update("Ab1 1|1-<2|3: velocity += 20 * sin(n/4)"),
    ];

    expect(() => grader(lfo).assert(turnsWithCalls(3, calls))).toThrow(
      "should not re-apply ramp",
    );
  });
});
