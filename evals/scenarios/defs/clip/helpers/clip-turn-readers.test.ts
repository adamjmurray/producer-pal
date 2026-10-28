// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type EvalTurnResult, type ToolCall } from "../../../types.ts";
import { getLastTransforms, getTransforms } from "./clip-turn-readers.ts";

const TOOL = "ppal-update-clip";

const turn = (...toolCalls: ToolCall[]): EvalTurnResult[] => [
  {
    turnIndex: 0,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls,
    durationMs: 1,
  },
];

const update = (
  args: Record<string, unknown>,
  result = '{id:"1"}',
): ToolCall => ({ name: TOOL, args, result });

describe("getTransforms", () => {
  it("joins the transforms of every successful call in call order", () => {
    const turns = turn(
      update({ transforms: "timing += rand(-0.1, 0.1)" }),
      update({ transforms: "where(note.start < 0): timing = 0" }),
    );

    expect(getTransforms(turns, 0, TOOL)).toBe(
      "timing += rand(-0.1, 0.1)\nwhere(note.start < 0): timing = 0",
    );
  });

  it("keeps the work when a follow-up call carries no transforms", () => {
    const turns = turn(
      update({ transforms: "duration = n1/16" }),
      update({ path: "t0/s0", length: "2:0" }),
    );

    expect(getTransforms(turns, 0, TOOL)).toBe("duration = n1/16");
  });

  it("ignores failed calls", () => {
    const turns = turn(
      update({ transforms: "velocity = bad" }, "Error: no such thing"),
      update({ transforms: "velocity = 90" }),
    );

    expect(getTransforms(turns, 0, TOOL)).toBe("velocity = 90");
  });

  it("joins a legacy array value with newlines", () => {
    expect(
      getTransforms(turn(update({ transforms: ["a", "b"] })), 0, TOOL),
    ).toBe("a\nb");
  });

  it("throws when no successful call carried transforms", () => {
    expect(() =>
      getTransforms(turn(update({ path: "t0/s0" })), 0, TOOL),
    ).toThrow("transforms parameter missing in turn 0");
  });

  it("says so when every call failed", () => {
    expect(() =>
      getTransforms(turn(update({ transforms: "x" }, "Error: bad")), 0, TOOL),
    ).toThrow("every ppal-update-clip call in turn 0 failed: Error: bad");
  });
});

describe("getLastTransforms", () => {
  it("returns only the last call that carried transforms", () => {
    const turns = turn(
      update({ transforms: "duration = 1/4" }),
      update({ transforms: "duration = n1/4" }),
      update({ path: "t0/s0" }),
    );

    expect(getLastTransforms(turns, 0, TOOL)).toBe("duration = n1/4");
  });

  it("throws when no successful call carried transforms", () => {
    expect(() =>
      getLastTransforms(turn(update({ path: "t0/s0" })), 0, TOOL),
    ).toThrow("transforms parameter missing in turn 0");
  });
});
