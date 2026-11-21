// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";
import { durationReachForQuarter } from "../clip/notation/duration-reach-for-quarter.ts";

const reach = durationReachForQuarter.assertions.find(
  (a) => a.type === "custom" && a.description.startsWith("classify"),
) as CustomAssertion;

const update = (args: Record<string, unknown>): ToolCall => ({
  name: "ppal-update-clip",
  args,
  result: `{id:"18"}`,
});

const turnsWith = (...calls: ToolCall[]): EvalTurnResult[] =>
  Array.from({ length: 3 }, (_, i) => ({
    turnIndex: i,
    userMessage: "u",
    assistantResponse: "a",
    toolCalls: i === 2 ? calls : [],
    durationMs: 1,
  }));

describe("duration-reach-for-quarter classification", () => {
  it("passes a duration transform", () => {
    const turns = turnsWith(update({ transforms: "duration = n/4" }));

    expect(reach.assert(turns)).toBe(true);
  });

  it("passes a direct rewrite of the notes with n/4 durations", () => {
    const turns = turnsWith(
      update({
        preTransforms: "delete",
        notes: "v100 n/4 A2 1|1\nC3 1|2",
      }),
    );

    expect(reach.assert(turns)).toBe(true);
  });

  it("records a bare 1/4 rewrite rather than failing it", () => {
    const turns = turnsWith(update({ notes: "1/4 A2 1|1" }));

    expect(reach.assert(turns)).toBe(true);
  });

  it("fails when the call writes neither transforms nor notes", () => {
    const turns = turnsWith(update({ path: "t0/s0" }));

    expect(() => reach.assert(turns)).toThrow("transforms parameter missing");
  });

  it("fails a rewrite with no quarter-note duration", () => {
    const turns = turnsWith(update({ notes: "A2 1|1" }));

    expect(() => reach.assert(turns)).toThrow("no recognizable");
  });
});
