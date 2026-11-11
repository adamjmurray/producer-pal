// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "#evals/scenarios/helpers/json-results/types.ts";
import { recordedDecider } from "../decider-recorded.ts";

const withDecider = (decider: unknown): JsonEvalResult =>
  ({ judge: { pass: true, issues: [], decider } }) as unknown as JsonEvalResult;

describe("recordedDecider", () => {
  it("has nothing for a result from a run without --decider", () => {
    expect(recordedDecider({} as JsonEvalResult, "1. A.")).toBeUndefined();
    expect(
      recordedDecider(
        { judge: { pass: true, issues: [] } } as unknown as JsonEvalResult,
        "1. A.",
      ),
    ).toBeUndefined();
  });

  it("reports a decider call that failed in the run", () => {
    expect(
      recordedDecider(
        withDecider({
          provider: "typesafe",
          verdict: "error",
          escalationReason: "boom",
        }),
        "1. A.",
      ),
    ).toStrictEqual({ error: "boom" });
  });

  it("rebuilds the answer, taking question text from the current criteria", () => {
    const saved = withDecider({
      provider: "typesafe",
      verdict: "escalate",
      escalatedBy: "claims",
      escalationReason: "close",
      model: "decider-1",
      minProbability: 0.5,
      questions: [
        { id: "req1", kind: "requirement", probability: 0.5 },
        { id: "gone", kind: "requirement", probability: 0.9 },
      ],
      outcome: {
        maxScore: 5,
        score: 2,
        level: "partial success",
        confidence: 0.6,
      },
      inputTokens: 10,
      outputTokens: 2,
      cost: 0.01,
      truncated: true,
    });

    expect(recordedDecider(saved, "1. Says A.")).toStrictEqual({
      decider: {
        provider: "typesafe",
        verdict: "escalate",
        escalatedBy: "claims",
        minProbability: 0.5,
        questions: [
          {
            id: "req1",
            kind: "requirement",
            text: "Says A.",
            probability: 0.5,
          },
          { id: "gone", kind: "requirement", text: "", probability: 0.9 },
        ],
        outcome: {
          maxScore: 5,
          score: 2,
          confidence: 0.6,
          label: "partial success",
        },
        model: "decider-1",
        inputTokens: 10,
        outputTokens: 2,
        cost: 0.01,
        truncated: true,
      },
    });
  });

  it("leaves out the cost when the provider did not report one", () => {
    const saved = withDecider({
      provider: "typesafe",
      verdict: "pass",
      model: "decider-1",
      minProbability: 0.9,
      questions: [],
      outcome: {
        score: 5,
        maxScore: 5,
        level: "complete success",
        confidence: 1,
      },
      inputTokens: 1,
      outputTokens: 1,
      truncated: false,
    });

    expect(recordedDecider(saved, "x")).not.toHaveProperty("decider.cost");
  });
});
