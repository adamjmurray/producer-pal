// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type DeciderFirstDetails } from "../../judge/decider-first-judge.ts";
import {
  type EvalAssertionResult,
  type EvalScenarioResult,
} from "../../../types.ts";
import { buildJudge } from "../judge-record.ts";
import { toJsonResult } from "../result-conversion.ts";
import { type JsonDeciderAnswer } from "../types.ts";

const deciderAnswer = (
  over: Partial<JsonDeciderAnswer> = {},
): JsonDeciderAnswer => ({
  provider: "openrouter",
  verdict: "pass",
  model: "decider-1.2",
  minProbability: 0.9,
  questions: [{ id: "req1", kind: "requirement", probability: 0.9 }],
  outcome: {
    score: 5,
    maxScore: 5,
    level: "complete success",
    confidence: 0.8,
  },
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

const deciderDecided: DeciderFirstDetails = {
  pass: true,
  issues: [],
  decidedBy: "decider",
  decider: deciderAnswer(),
};

const escalated: DeciderFirstDetails = {
  pass: false,
  issues: ["bad"],
  provider: "google",
  model: "gemini-x",
  decidedBy: "llm",
  decider: deciderAnswer({ verdict: "escalate", escalationReason: "close" }),
  llm: { pass: false, issues: ["bad"], provider: "google", model: "gemini-x" },
};

describe("buildJudge with the decider", () => {
  it("records a decider-decided verdict with the decider's provider and model", () => {
    expect(buildJudge([judgeAssertion(deciderDecided)], false)).toStrictEqual({
      pass: true,
      issues: [],
      provider: "openrouter",
      model: "decider-1.2",
      decidedBy: "decider",
      decider: deciderDecided.decider,
    });
  });

  it("records an escalated verdict as the LLM judge's, with the decider's answer", () => {
    expect(buildJudge([judgeAssertion(escalated)], false)).toStrictEqual({
      pass: false,
      issues: ["bad"],
      provider: "google",
      model: "gemini-x",
      decidedBy: "llm",
      decider: escalated.decider,
      llm: escalated.llm,
    });
  });

  it("records a failed decider call without a decider model", () => {
    const failure: DeciderFirstDetails = {
      ...escalated,
      decider: {
        provider: "typesafe",
        verdict: "error",
        escalationReason: "boom",
      },
    };

    expect(buildJudge([judgeAssertion(failure)], false)?.decider).toStrictEqual(
      {
        provider: "typesafe",
        verdict: "error",
        escalationReason: "boom",
      },
    );
  });

  it("names a local decider by provider and model", () => {
    const local: DeciderFirstDetails = {
      ...deciderDecided,
      decider: {
        ...deciderAnswer({ verdict: "pass" }),
        provider: "ollama",
        model: "autotrust-jev",
      },
    };

    expect(buildJudge([judgeAssertion(local)], false)).toStrictEqual(
      expect.objectContaining({
        provider: "ollama",
        model: "autotrust-jev",
        decidedBy: "decider",
      }),
    );
  });

  it("records no provider or model for a decider verdict with no decider record", () => {
    const odd = { ...deciderDecided, decider: undefined };

    expect(buildJudge([judgeAssertion(odd)], false)).toStrictEqual({
      pass: true,
      issues: [],
      decidedBy: "decider",
    });
  });

  it("keeps the advisory flag", () => {
    expect(buildJudge([judgeAssertion(deciderDecided)], true)?.advisory).toBe(
      true,
    );
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

  it("is 2 once the decider was asked, whoever decided", () => {
    expect(convert(deciderDecided).version).toBe(2);
    expect(convert(escalated).version).toBe(2);
  });

  it("lets a decider fail gate the result, unless the judge is advisory", () => {
    const failed = {
      ...deciderDecided,
      pass: false,
      issues: ["Decider: not met"],
    };

    expect(convert(failed).result).toBe("fail");
    expect(convert(failed, true).result).toBe("pass");
  });
});
