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
import { melodyTransforms } from "../melody-transforms.ts";

const grader = (description: string): CustomAssertion =>
  melodyTransforms.assertions.find(
    (a) => a.type === "custom" && a.description === description,
  ) as CustomAssertion;

const update = (args: Record<string, unknown>, noteCount = 24): ToolCall => ({
  name: "ppal-update-clip",
  args,
  result: `{id:"1",noteCount:${noteCount}}`,
});

const turnsWithCalls = (turn: number, calls: ToolCall[]): EvalTurnResult[] =>
  Array.from({ length: 7 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: i === turn ? calls : [],
    durationMs: 1,
  }));

describe("melodyTransforms graders", () => {
  const extended = "melody extended with notes copied into 8 bars";

  it("turn 2 finds the notes when a later call only sets the length", () => {
    const calls = [
      update({ notes: "1|1 C3 ... 1-4 @2=1" }, 12),
      update({ path: "t0/s0", length: "8:0" }, 12),
    ];

    expect(grader(extended).assert(turnsWithCalls(2, calls))).toBe(true);
  });

  it("turn 2 fails when nothing was copied", () => {
    const calls = [update({ path: "t0/s0", length: "8:0" }, 12)];

    expect(() => grader(extended).assert(turnsWithCalls(2, calls))).toThrow(
      "notes should be duplicated into 8 bars",
    );
  });

  it("turn 3 grades the step() work when the last call has no transforms", () => {
    const calls = [
      update({
        transforms:
          "where(2|1-4|4): pitch = step(pitch, 1)\n5|1-6|4: pitch = step(pitch, 3)\n7|1-8|4: pitch = step(pitch, 4)",
      }),
      update({ path: "t0/s0" }),
    ];

    expect(
      grader("pitch transposition uses step() with correct amounts").assert(
        turnsWithCalls(3, calls),
      ),
    ).toBe(true);
  });
});
