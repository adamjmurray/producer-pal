// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../../types.ts";
import { legatoTransforms } from "./legato-transforms.ts";

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
  Array.from({ length: 6 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: i === turn ? [call, call] : [],
    durationMs: 1,
  }));

describe("legatoTransforms graders", () => {
  for (const [turn, [description, args]] of Object.entries(TURNS)) {
    const index = Number(turn);
    const call: ToolCall = {
      name: "ppal-update-clip",
      args,
      result: '{id:"1",noteCount:24}',
    };

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
