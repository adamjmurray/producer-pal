// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type JsonEvalResult,
  type JsonDeciderAnswer,
  type JsonDeciderJudgment,
  type JsonJudge,
} from "../../json-results/types.ts";
import {
  deciderJudgeNote,
  deciderSummaryLines,
} from "../decider-judge-report.ts";

const answer = (over: Partial<JsonDeciderAnswer> = {}): JsonDeciderAnswer => ({
  provider: "typesafe",
  verdict: "pass",
  model: "decider-1",
  minProbability: 0.9,
  questions: [],
  outcome: {
    score: 5,
    maxScore: 5,
    level: "complete success",
    confidence: 0.8,
  },
  inputTokens: 100,
  outputTokens: 10,
  truncated: false,
  ...over,
});

const failure: JsonDeciderJudgment = {
  provider: "typesafe",
  verdict: "error",
  escalationReason: "decider call failed: boom",
};

const withJudge = (judge?: Partial<JsonJudge>): JsonEvalResult =>
  ({
    judge: judge && { pass: true, issues: [], ...judge },
  }) as JsonEvalResult;

describe("deciderJudgeNote", () => {
  it("says nothing when the decider was not asked", () => {
    expect(deciderJudgeNote({})).toBeUndefined();
  });

  it("names the decision and the outcome level", () => {
    expect(deciderJudgeNote({ decidedBy: "decider", decider: answer() })).toBe(
      "Decider decided: pass (outcome: complete success, lowest answer 0.90)",
    );
  });

  it("gives the reason for an escalation", () => {
    expect(
      deciderJudgeNote({
        decidedBy: "llm",
        decider: answer({ verdict: "escalate", escalationReason: "too close" }),
      }),
    ).toBe(
      "Decider escalated to the LLM judge: too close (outcome: complete success, lowest answer 0.90)",
    );
  });

  it("gives the reason for a failed call", () => {
    expect(deciderJudgeNote({ decidedBy: "llm", decider: failure })).toBe(
      "Decider escalated to the LLM judge: decider call failed: boom",
    );
  });
});

describe("deciderSummaryLines", () => {
  it("is empty for a run without the decider", () => {
    expect(
      deciderSummaryLines([withJudge(), withJudge({ pass: false })]),
    ).toStrictEqual([]);
    expect(deciderSummaryLines([{} as JsonEvalResult])).toStrictEqual([]);
  });

  it("counts decided and escalated calls and sums the tokens", () => {
    const lines = deciderSummaryLines([
      withJudge({ decidedBy: "decider", decider: answer() }),
      withJudge({ decidedBy: "decider", decider: answer({ verdict: "fail" }) }),
      withJudge({
        decidedBy: "llm",
        decider: answer({
          verdict: "escalate",
          inputTokens: 50,
          outputTokens: 5,
        }),
      }),
      withJudge({ decidedBy: "llm", decider: failure }),
    ]);

    expect(lines).toStrictEqual([
      "Decider judge: 4 call(s); decided 2 (1 pass, 1 fail); escalated 2 to the LLM judge (1 unsure, 0 by the claims check, 1 error)",
      "Decider tokens: 250 in, 25 out",
    ]);
  });

  it("counts escalations caused only by the claims check separately", () => {
    const lines = deciderSummaryLines([
      withJudge({ decidedBy: "decider", decider: answer() }),
      withJudge({
        decidedBy: "llm",
        decider: answer({ verdict: "escalate", escalatedBy: "claims" }),
      }),
      withJudge({ decidedBy: "llm", decider: answer({ verdict: "escalate" }) }),
    ]);

    expect(lines[0]).toBe(
      "Decider judge: 3 call(s); decided 1 (1 pass, 0 fail); escalated 2 to the LLM judge (1 unsure, 1 by the claims check, 0 error)",
    );
  });

  it("adds the cost when the route reports it", () => {
    const lines = deciderSummaryLines([
      withJudge({ decidedBy: "decider", decider: answer({ cost: 0.001 }) }),
      withJudge({ decidedBy: "decider", decider: answer({ cost: 0.0025 }) }),
    ]);

    expect(lines[1]).toBe("Decider tokens: 200 in, 20 out; cost $0.0035");
  });

  it("says when only some calls report a cost", () => {
    const lines = deciderSummaryLines([
      withJudge({ decidedBy: "decider", decider: answer({ cost: 0.001 }) }),
      withJudge({ decidedBy: "decider", decider: answer() }),
    ]);

    expect(lines[1]).toContain("cost $0.0010 (1 of 2 calls report it)");
  });
});
