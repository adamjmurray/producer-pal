// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for step-timing-aggregate.ts
 */

import { describe, expect, it } from "vitest";
import { type StepTiming, type TokenUsage } from "#webui/chat/sdk/types.ts";
import { type EvalTurnResult } from "../../../types.ts";
import { aggregateStepTimings } from "../step-timing-aggregate.ts";

/**
 * Build a turn from step timings and the token usage they line up with.
 *
 * @param stepTimings - Per-step timings
 * @param stepUsages - Per-step token usage, index-aligned with the timings
 * @returns A turn result carrying just those steps
 */
function makeTurn(
  stepTimings: StepTiming[],
  stepUsages: TokenUsage[],
): EvalTurnResult {
  return {
    turnIndex: 0,
    userMessage: "go",
    assistantResponse: "ok",
    toolCalls: [],
    durationMs: 1,
    stepUsages,
    stepTimings,
  };
}

describe("aggregateStepTimings", () => {
  it("returns undefined when there are no turns", () => {
    expect(aggregateStepTimings([])).toBeUndefined();
  });

  it("returns undefined when no step carried a timing", () => {
    expect(
      aggregateStepTimings([makeTurn([{}, {}], [{ outputTokens: 100 }])]),
    ).toBeUndefined();
  });

  it("passes a single step's rate through", () => {
    const turn = makeTurn(
      [{ outputTokensPerSecond: 50, timeToFirstTokenMs: 900 }],
      [{ outputTokens: 500 }],
    );

    expect(aggregateStepTimings([turn])).toStrictEqual({
      outputTokensPerSecond: 50,
      timeToFirstTokenMs: 900,
    });
  });

  it("weights the rate by each step's output tokens", () => {
    // 900 tokens at 90 tok/s (10s) + 100 tokens at 10 tok/s (10s) = 1000 / 20s.
    // A plain average of the rates would read 50.
    const turn = makeTurn(
      [{ outputTokensPerSecond: 90 }, { outputTokensPerSecond: 10 }],
      [{ outputTokens: 900 }, { outputTokens: 100 }],
    );

    expect(aggregateStepTimings([turn])?.outputTokensPerSecond).toBe(50);
  });

  it("means the time to first token", () => {
    const turn = makeTurn(
      [{ timeToFirstTokenMs: 1000 }, { timeToFirstTokenMs: 400 }],
      [{ outputTokens: 10 }, { outputTokens: 10 }],
    );

    expect(aggregateStepTimings([turn])).toStrictEqual({
      timeToFirstTokenMs: 700,
    });
  });

  it("combines steps across turns", () => {
    const turns = [
      makeTurn([{ outputTokensPerSecond: 20 }], [{ outputTokens: 200 }]),
      makeTurn([{ outputTokensPerSecond: 60 }], [{ outputTokens: 600 }]),
    ];

    // 10s + 10s for 800 tokens.
    expect(aggregateStepTimings(turns)?.outputTokensPerSecond).toBe(40);
  });

  it("skips a step with no rate but keeps its first-token time", () => {
    const turn = makeTurn(
      [{ timeToFirstTokenMs: 500 }, { outputTokensPerSecond: 25 }],
      [{ outputTokens: 999 }, { outputTokens: 50 }],
    );

    expect(aggregateStepTimings([turn])).toStrictEqual({
      outputTokensPerSecond: 25,
      timeToFirstTokenMs: 500,
    });
  });

  it("skips a step whose token count is missing", () => {
    // Without a token weight there is no generation time to add, so the step
    // contributes nothing to the rate.
    const turn = makeTurn(
      [{ outputTokensPerSecond: 80 }, { outputTokensPerSecond: 40 }],
      [{}, { outputTokens: 400 }],
    );

    expect(aggregateStepTimings([turn])?.outputTokensPerSecond).toBe(40);
  });

  it("ignores timings with no usage alongside them", () => {
    const turn: EvalTurnResult = {
      turnIndex: 0,
      userMessage: "go",
      assistantResponse: "ok",
      toolCalls: [],
      durationMs: 1,
      stepTimings: [{ outputTokensPerSecond: 30, timeToFirstTokenMs: 200 }],
    };

    expect(aggregateStepTimings([turn])).toStrictEqual({
      timeToFirstTokenMs: 200,
    });
  });

  it("ignores a turn with no timings at all", () => {
    const turn: EvalTurnResult = {
      turnIndex: 0,
      userMessage: "go",
      assistantResponse: "ok",
      toolCalls: [],
      durationMs: 1,
      stepUsages: [{ outputTokens: 100 }],
    };

    expect(aggregateStepTimings([turn])).toBeUndefined();
  });
});
