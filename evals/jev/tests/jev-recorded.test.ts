// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "#evals/scenarios/helpers/json-results/types.ts";
import { recordedJev } from "../jev-recorded.ts";

const withJev = (jev: unknown): JsonEvalResult =>
  ({ judge: { pass: true, issues: [], jev } }) as unknown as JsonEvalResult;

describe("recordedJev", () => {
  it("has nothing for a result from a run without --jev", () => {
    expect(recordedJev({} as JsonEvalResult, "1. A.")).toBeUndefined();
    expect(
      recordedJev(
        { judge: { pass: true, issues: [] } } as unknown as JsonEvalResult,
        "1. A.",
      ),
    ).toBeUndefined();
  });

  it("reports a Jev call that failed in the run", () => {
    expect(
      recordedJev(
        withJev({
          route: "typesafe",
          verdict: "error",
          escalationReason: "boom",
        }),
        "1. A.",
      ),
    ).toStrictEqual({ error: "boom" });
  });

  it("rebuilds the answer, taking question text from the current criteria", () => {
    const saved = withJev({
      route: "typesafe",
      verdict: "escalate",
      escalatedBy: "claims",
      escalationReason: "close",
      model: "jev-1",
      minProbability: 0.5,
      questions: [
        { id: "req1", kind: "requirement", probability: 0.5 },
        { id: "gone", kind: "requirement", probability: 0.9 },
      ],
      outcome: { score: 2, level: "partial success", confidence: 0.6 },
      inputTokens: 10,
      outputTokens: 2,
      cost: 0.01,
      truncated: true,
    });

    expect(recordedJev(saved, "1. Says A.")).toStrictEqual({
      jev: {
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
        outcome: { score: 2, confidence: 0.6, label: "partial success" },
        model: "jev-1",
        inputTokens: 10,
        outputTokens: 2,
        cost: 0.01,
        truncated: true,
      },
    });
  });

  it("leaves out the cost when the route did not report one", () => {
    const saved = withJev({
      route: "typesafe",
      verdict: "pass",
      model: "jev-1",
      minProbability: 0.9,
      questions: [],
      outcome: { score: 3, level: "complete success", confidence: 1 },
      inputTokens: 1,
      outputTokens: 1,
      truncated: false,
    });

    expect(recordedJev(saved, "x")).not.toHaveProperty("jev.cost");
  });
});
