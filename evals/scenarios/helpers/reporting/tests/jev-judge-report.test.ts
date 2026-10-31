// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type JsonEvalResult,
  type JsonJevAnswer,
  type JsonJevJudgment,
  type JsonJudge,
} from "../../json-results/types.ts";
import { jevJudgeNote, jevSummaryLines } from "../jev-judge-report.ts";

const answer = (over: Partial<JsonJevAnswer> = {}): JsonJevAnswer => ({
  route: "typesafe",
  verdict: "pass",
  model: "jev-1",
  minProbability: 0.9,
  questions: [],
  outcome: { score: 3, level: "complete success", confidence: 0.8 },
  inputTokens: 100,
  outputTokens: 10,
  truncated: false,
  ...over,
});

const failure: JsonJevJudgment = {
  route: "typesafe",
  verdict: "error",
  escalationReason: "Jev call failed: boom",
};

const withJudge = (judge?: Partial<JsonJudge>): JsonEvalResult =>
  ({
    judge: judge && { pass: true, issues: [], ...judge },
  }) as JsonEvalResult;

describe("jevJudgeNote", () => {
  it("says nothing when Jev was not asked", () => {
    expect(jevJudgeNote({})).toBeUndefined();
  });

  it("names the decision and the outcome level", () => {
    expect(jevJudgeNote({ decidedBy: "jev", jev: answer() })).toBe(
      "Jev decided: pass (outcome: complete success, lowest answer 0.90)",
    );
  });

  it("gives the reason for an escalation", () => {
    expect(
      jevJudgeNote({
        decidedBy: "llm",
        jev: answer({ verdict: "escalate", escalationReason: "too close" }),
      }),
    ).toBe(
      "Jev escalated to the LLM judge: too close (outcome: complete success, lowest answer 0.90)",
    );
  });

  it("gives the reason for a failed call", () => {
    expect(jevJudgeNote({ decidedBy: "llm", jev: failure })).toBe(
      "Jev escalated to the LLM judge: Jev call failed: boom",
    );
  });
});

describe("jevSummaryLines", () => {
  it("is empty for a run without Jev", () => {
    expect(
      jevSummaryLines([withJudge(), withJudge({ pass: false })]),
    ).toStrictEqual([]);
    expect(jevSummaryLines([{} as JsonEvalResult])).toStrictEqual([]);
  });

  it("counts decided and escalated calls and sums the tokens", () => {
    const lines = jevSummaryLines([
      withJudge({ decidedBy: "jev", jev: answer() }),
      withJudge({ decidedBy: "jev", jev: answer({ verdict: "fail" }) }),
      withJudge({
        decidedBy: "llm",
        jev: answer({ verdict: "escalate", inputTokens: 50, outputTokens: 5 }),
      }),
      withJudge({ decidedBy: "llm", jev: failure }),
    ]);

    expect(lines).toStrictEqual([
      "Jev judge: 4 call(s); decided 2 (1 pass, 1 fail); escalated 2 to the LLM judge (1 unsure, 0 by the claims check, 1 error)",
      "Jev tokens: 250 in, 25 out",
    ]);
  });

  it("counts escalations caused only by the claims check separately", () => {
    const lines = jevSummaryLines([
      withJudge({ decidedBy: "jev", jev: answer() }),
      withJudge({
        decidedBy: "llm",
        jev: answer({ verdict: "escalate", escalatedBy: "claims" }),
      }),
      withJudge({ decidedBy: "llm", jev: answer({ verdict: "escalate" }) }),
    ]);

    expect(lines[0]).toBe(
      "Jev judge: 3 call(s); decided 1 (1 pass, 0 fail); escalated 2 to the LLM judge (1 unsure, 1 by the claims check, 0 error)",
    );
  });

  it("adds the cost when the route reports it", () => {
    const lines = jevSummaryLines([
      withJudge({ decidedBy: "jev", jev: answer({ cost: 0.001 }) }),
      withJudge({ decidedBy: "jev", jev: answer({ cost: 0.0025 }) }),
    ]);

    expect(lines[1]).toBe("Jev tokens: 200 in, 20 out; cost $0.0035");
  });

  it("says when only some calls report a cost", () => {
    const lines = jevSummaryLines([
      withJudge({ decidedBy: "jev", jev: answer({ cost: 0.001 }) }),
      withJudge({ decidedBy: "jev", jev: answer() }),
    ]);

    expect(lines[1]).toContain("cost $0.0010 (1 of 2 calls report it)");
  });
});
