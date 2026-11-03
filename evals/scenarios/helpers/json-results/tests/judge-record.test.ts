// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JevFirstDetails } from "../../judge/jev-first-judge.ts";
import {
  type EvalAssertionResult,
  type EvalScenarioResult,
} from "../../../types.ts";
import { buildJudge } from "../judge-record.ts";
import { toJsonResult } from "../result-conversion.ts";
import { type JsonJevAnswer } from "../types.ts";

const jevAnswer = (over: Partial<JsonJevAnswer> = {}): JsonJevAnswer => ({
  route: "openrouter",
  verdict: "pass",
  model: "jev-1.2",
  minProbability: 0.9,
  questions: [{ id: "req1", kind: "requirement", probability: 0.9 }],
  outcome: { score: 3, level: "complete success", confidence: 0.8 },
  inputTokens: 10,
  outputTokens: 1,
  truncated: false,
  ...over,
});

const judgeAssertion = (details: unknown): EvalAssertionResult => ({
  assertion: { type: "llm_judge", prompt: "p" },
  earned: 0,
  maxScore: 0,
  message: "m",
  details,
});

const jevDecided: JevFirstDetails = {
  pass: true,
  issues: [],
  decidedBy: "jev",
  jev: jevAnswer(),
};

const escalated: JevFirstDetails = {
  pass: false,
  issues: ["bad"],
  provider: "google",
  model: "gemini-x",
  decidedBy: "llm",
  jev: jevAnswer({ verdict: "escalate", escalationReason: "close" }),
  llm: { pass: false, issues: ["bad"], provider: "google", model: "gemini-x" },
};

describe("buildJudge with Jev", () => {
  it("records a Jev-decided verdict with Jev as its provider and model", () => {
    expect(buildJudge([judgeAssertion(jevDecided)], false)).toStrictEqual({
      pass: true,
      issues: [],
      provider: "jev",
      model: "jev-1.2",
      decidedBy: "jev",
      jev: jevDecided.jev,
    });
  });

  it("records an escalated verdict as the LLM judge's, with Jev's answer", () => {
    expect(buildJudge([judgeAssertion(escalated)], false)).toStrictEqual({
      pass: false,
      issues: ["bad"],
      provider: "google",
      model: "gemini-x",
      decidedBy: "llm",
      jev: escalated.jev,
      llm: escalated.llm,
    });
  });

  it("records a failed Jev call without a Jev model", () => {
    const failure: JevFirstDetails = {
      ...escalated,
      jev: { route: "typesafe", verdict: "error", escalationReason: "boom" },
    };

    expect(buildJudge([judgeAssertion(failure)], false)?.jev).toStrictEqual({
      route: "typesafe",
      verdict: "error",
      escalationReason: "boom",
    });
  });

  it("gives a Jev verdict no model if Jev's record has none", () => {
    const odd = { ...jevDecided, jev: undefined };

    expect(buildJudge([judgeAssertion(odd)], false)).toStrictEqual({
      pass: true,
      issues: [],
      provider: "jev",
      decidedBy: "jev",
    });
  });

  it("keeps the advisory flag", () => {
    expect(buildJudge([judgeAssertion(jevDecided)], true)?.advisory).toBe(true);
  });
});

describe("saved result version", () => {
  const convert = (details: unknown, advisory = false) =>
    toJsonResult(
      {
        scenario: {
          id: "s",
          description: "d",
          tags: [],
          liveSet: "t",
          messages: ["m"],
          assertions: [],
          ...(advisory && { judgeAdvisory: true }),
        },
        turns: [],
        assertions: [
          {
            assertion: { type: "tool_called", tool: "t" },
            earned: 1,
            maxScore: 1,
            message: "tool_called: t",
          },
          judgeAssertion(details),
        ],
        totalDurationMs: 1,
      } as EvalScenarioResult,
      "run",
      "google/gemini",
      "default",
    );

  it("is 1 when the judge was the LLM alone", () => {
    const result = convert({ pass: true, issues: [], provider: "google" });

    expect(result.version).toBe(1);
    expect(result.judge).not.toHaveProperty("decidedBy");
  });

  it("is 2 once Jev was asked, whoever decided", () => {
    expect(convert(jevDecided).version).toBe(2);
    expect(convert(escalated).version).toBe(2);
  });

  it("lets a Jev fail gate the result, unless the judge is advisory", () => {
    const failed = { ...jevDecided, pass: false, issues: ["Jev: not met"] };

    expect(convert(failed).result).toBe("fail");
    expect(convert(failed, true).result).toBe("pass");
  });
});
