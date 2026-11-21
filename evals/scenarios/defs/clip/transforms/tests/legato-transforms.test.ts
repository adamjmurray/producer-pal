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
import { legatoTransforms } from "../legato-transforms.ts";
import {
  turnsWithCalls as turnsOf,
  updateClipCall as update,
} from "./transform-grader-test-helpers.ts";

/** Each turn's grader, and args it accepts. */
const TURNS: Record<number, [string, Record<string, unknown>]> = {
  2: ["notes doubled with octave-up copies", { transforms: "pitch += 12" }],
  3: ["durations set to 1/16th note", { transforms: "duration = 1/16" }],
  4: [
    "timing humanized with random offset",
    { transforms: "timing += rand(-0.05, 0.05)" },
  ],
  5: [
    "legato applied with tolerance for humanized timing",
    { transforms: "legato(0.1)" },
  ],
};

const grader = (description: string): CustomAssertion =>
  legatoTransforms.assertions.find(
    (a) => a.type === "custom" && a.description === description,
  ) as CustomAssertion;

const turnsWith = (turn: number, call: ToolCall): EvalTurnResult[] =>
  turnsOf(6, turn, [call, call]);

const turnsWithCalls = (turn: number, calls: ToolCall[]): EvalTurnResult[] =>
  turnsOf(6, turn, calls);

describe("legatoTransforms graders with a follow-up fix in the same turn", () => {
  it("grades the humanizing call, not the fix-up that clamps start times", () => {
    const calls = [
      update({ transforms: "timing += rand(-0.05, 0.05)" }),
      update({ transforms: "where(note.start < 0): timing = 0" }),
    ];

    expect(
      grader("timing humanized with random offset").assert(
        turnsWithCalls(4, calls),
      ),
    ).toBe(true);
  });

  it("still fails when no call in the turn humanized", () => {
    const calls = [update({ transforms: "where(note.start < 0): timing = 0" })];

    expect(() =>
      grader("timing humanized with random offset").assert(
        turnsWithCalls(4, calls),
      ),
    ).toThrow("expected rand() for humanization");
  });

  it("finds the doubled notes when the last call writes nothing", () => {
    const calls = [
      update({ transforms: "pitch += 12" }, 12),
      update({ path: "t0/s0" }, 12),
    ];

    expect(
      grader("notes doubled with octave-up copies").assert(
        turnsWithCalls(2, calls),
      ),
    ).toBe(true);
  });
});

describe("legatoTransforms graders", () => {
  for (const [turn, [description, args]] of Object.entries(TURNS)) {
    const index = Number(turn);
    const call = update(args);

    it(`turn ${turn} passes when the call succeeded`, () => {
      expect(grader(description).assert(turnsWith(index, call))).toBe(true);
    });

    it(`turn ${turn} fails when every call errored`, () => {
      const failed = { ...call, result: "Error: bad selector" };

      expect(() =>
        grader(description).assert(turnsWith(index, failed)),
      ).toThrow(
        `every ppal-update-clip call in turn ${turn} failed: Error: bad selector`,
      );
    });
  }
});
