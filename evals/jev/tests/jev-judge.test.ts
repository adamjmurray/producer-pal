// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOutcomeQuestion,
  buildQuestions,
  CLAIMS_THRESHOLD,
  claimsProbability,
  decideVerdict,
  escalationReason,
  FAIL_THRESHOLD,
  jevJudge,
  outcomeLabel,
  PASS_THRESHOLD,
} from "../jev-judge.ts";

describe("decideVerdict", () => {
  it("passes at and above the pass threshold", () => {
    expect(PASS_THRESHOLD).toBe(0.85);
    expect(decideVerdict(0.85)).toBe("pass");
    expect(decideVerdict(1)).toBe("pass");
  });

  it("fails below the fail threshold", () => {
    expect(FAIL_THRESHOLD).toBe(0.3);
    expect(decideVerdict(0.29)).toBe("fail");
    expect(decideVerdict(0)).toBe("fail");
  });

  it("escalates in between, including exactly 0.3", () => {
    expect(decideVerdict(0.3)).toBe("escalate");
    expect(decideVerdict(0.5)).toBe("escalate");
    expect(decideVerdict(0.84)).toBe("escalate");
  });

  it("turns a pass into an escalation when the claims answer is low", () => {
    expect(CLAIMS_THRESHOLD).toBe(0.7);
    expect(decideVerdict(0.95, 0.7)).toBe("pass");
    expect(decideVerdict(0.95, 0.69)).toBe("escalate");
    expect(decideVerdict(0.95, 0)).toBe("escalate");
  });

  it("never lets the claims answer cause a fail or lift a verdict", () => {
    expect(decideVerdict(0.5, 0)).toBe("escalate");
    expect(decideVerdict(0.2, 1)).toBe("fail");
    expect(decideVerdict(0.84, 1)).toBe("escalate");
  });
});

describe("escalationReason", () => {
  it("names the lowest question and the thresholds", () => {
    expect(
      escalationReason(
        [
          { id: "req1", kind: "requirement", probability: 0.9 },
          { id: "whole", kind: "whole", probability: 0.5 },
          { id: "claims", kind: "claims", probability: 0.5 },
        ],
        0.5,
      ),
    ).toBe("lowest answer 0.50 (whole) is between 0.3 and 0.85");
  });

  it("copes with no matching question", () => {
    expect(escalationReason([], 0.4)).toContain("(?)");
  });

  it("blames the claims answer when the requirements all passed", () => {
    expect(
      escalationReason(
        [
          { id: "whole", kind: "whole", probability: 0.95 },
          { id: "claims", kind: "claims", probability: 0.6 },
        ],
        0.95,
      ),
    ).toBe("claims answer 0.60 is below 0.7");
  });
});

describe("claimsProbability", () => {
  it("finds the claims answer, or nothing when it was not asked", () => {
    expect(
      claimsProbability([
        { kind: "whole", probability: 0.9 },
        { kind: "claims", probability: 0.4 },
      ]),
    ).toBe(0.4);
    expect(claimsProbability([{ kind: "whole", probability: 0.9 }])).toBe(
      undefined,
    );
  });
});

describe("buildQuestions", () => {
  it("makes one question per item, with shared context, plus the whole", () => {
    const q = buildQuestions(
      "Judge the reply:\n1. Says X.\n2. Says Y.\n\nBe kind.",
    );

    expect(q.map((x) => x.id)).toStrictEqual([
      "req1",
      "req2",
      "whole",
      "claims",
    ]);
    expect(q[0]?.instructions).toBe(
      "Judge the reply:\n\nRequirement: Says X.\n\nBe kind.\n\nDid the assistant satisfy this requirement?",
    );
    expect(q[2]?.kind).toBe("whole");
    expect(q[2]?.instructions).toBe(
      "Judge the reply:\n1. Says X.\n2. Says Y.\n\nBe kind.\n\nDid the assistant meet these expectations?",
    );
  });

  it("asks the whole prompt as req1 and whole when there is no list", () => {
    const q = buildQuestions("It must reply politely.");

    expect(q.map((x) => x.id)).toStrictEqual(["req1", "whole", "claims"]);
    expect(q[0]?.instructions).toContain("It must reply politely.");
    expect(q[1]?.instructions).toContain("It must reply politely.");
  });

  it("asks the claims question about actions only, whatever the criteria", () => {
    const claims = buildQuestions("1. A.").at(-1);

    expect(claims?.kind).toBe("claims");
    expect(claims?.instructions).toContain("shown in the tool calls");
    expect(claims?.instructions).not.toContain("A.");
  });
});

describe("buildOutcomeQuestion", () => {
  it("is a four-level score question over the trimmed criteria", () => {
    expect(buildOutcomeQuestion("  1. A.\n")).toStrictEqual({
      type: "score",
      instructions:
        "Scenario expectations:\n1. A.\n\nOverall, how did the assistant do against these expectations?",
      criteria: [
        "Complete failure: none of what was asked got done",
        "Mostly failed: little of what was asked got done, or it went badly wrong",
        "Partial success: some of what was asked got done, with real gaps or problems",
        "Complete success: everything asked got done, and the reply is accurate",
      ],
    });
  });
});

describe("outcomeLabel", () => {
  it("names the nearest level", () => {
    expect(outcomeLabel(0)).toBe("complete failure");
    expect(outcomeLabel(0.4)).toBe("complete failure");
    expect(outcomeLabel(0.6)).toBe("mostly failed");
    expect(outcomeLabel(1.4)).toBe("mostly failed");
    expect(outcomeLabel(2.4)).toBe("partial success");
    expect(outcomeLabel(2.6)).toBe("complete success");
    expect(outcomeLabel(3)).toBe("complete success");
  });

  it("clamps scores outside the range", () => {
    expect(outcomeLabel(-1)).toBe("complete failure");
    expect(outcomeLabel(5)).toBe("complete success");
  });
});

describe("jevJudge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends one noul question per requirement and takes the lowest as the verdict", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "jev-1.14.0",
          answers: {
            req1: { type: "noul", noul: 0.9 },
            req2: { type: "noul", noul: 0.4 },
            whole: { type: "noul", noul: 0.95 },
            claims: { type: "noul", noul: 0.2 },
            outcome: {
              type: "score",
              score: 2.4,
              confidence: 0.7,
              legend: {},
              probabilities: {},
            },
          },
          usage: { input_tokens: 100, output_tokens: 5, cost: 0.002 },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await jevJudge(
      {
        turns: [{ userMessage: "hi", assistantResponse: "yo", toolCalls: [] }],
        checks: [],
      },
      "1. A.\n2. B.",
      { apiKey: "k" },
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(init.body as string) as {
      questions: Record<string, { type: string }>;
      state: unknown;
    };

    expect(Object.keys(sent.questions)).toStrictEqual([
      "req1",
      "req2",
      "whole",
      "claims",
      "outcome",
    ]);
    expect(sent.questions.req1?.type).toBe("noul");
    expect(sent.questions.outcome?.type).toBe("score");
    expect(result.verdict).toBe("escalate");
    expect(result.minProbability).toBe(0.4);
    expect(result.questions.at(-1)?.kind).toBe("claims");
    expect(result.outcome).toStrictEqual({
      score: 2.4,
      confidence: 0.7,
      label: "partial success",
    });
    expect(result.inputTokens).toBe(100);
    expect(result.model).toBe("jev-1.14.0");
    expect(result.cost).toBe(0.002);
    expect(result.questions.map((q) => q.probability)).toStrictEqual([
      0.9, 0.4, 0.95, 0.2,
    ]);
  });

  it("keeps the claims answer out of the lowest answer and escalates a pass", async () => {
    stubAnswers({
      req1: { type: "noul", noul: 0.95 },
      whole: { type: "noul", noul: 0.9 },
      claims: { type: "noul", noul: 0.1 },
      outcome: {
        type: "score",
        score: 3,
        confidence: 0.9,
        legend: {},
        probabilities: {},
      },
    });

    const result = await jevJudge({ turns: [], checks: [] }, "Be good.", {
      apiKey: "k",
    });

    expect(result.minProbability).toBe(0.9);
    expect(result.verdict).toBe("escalate");
    expect(result.escalatedBy).toBe("claims");
  });

  it("sets escalatedBy only when the claims answer alone caused the escalation", async () => {
    const outcome = {
      type: "score",
      score: 2,
      confidence: 0.5,
      legend: {},
      probabilities: {},
    };

    stubAnswers({
      req1: { type: "noul", noul: 0.5 },
      whole: { type: "noul", noul: 0.9 },
      claims: { type: "noul", noul: 0.1 },
      outcome,
    });
    const result = await jevJudge({ turns: [], checks: [] }, "Be good.", {
      apiKey: "k",
    });

    expect(result.escalatedBy).toBeUndefined();

    stubAnswers({
      req1: { type: "noul", noul: 0.9 },
      whole: { type: "noul", noul: 0.9 },
      claims: { type: "noul", noul: 0.9 },
      outcome,
    });
    const second = await jevJudge({ turns: [], checks: [] }, "Be good.", {
      apiKey: "k",
    });

    expect(second.escalatedBy).toBeUndefined();
  });

  it("throws when the outcome answer is missing", async () => {
    stubAnswers({
      req1: { type: "noul", noul: 0.9 },
      whole: { type: "noul", noul: 0.9 },
      claims: { type: "noul", noul: 0.9 },
    });

    await expect(
      jevJudge({ turns: [], checks: [] }, "Be good.", { apiKey: "k" }),
    ).rejects.toThrow(/no outcome score/);
  });

  it("throws when an answer is missing", async () => {
    stubAnswers({});

    await expect(
      jevJudge({ turns: [], checks: [] }, "Be good.", { apiKey: "k" }),
    ).rejects.toThrow(/no yes\/no answer/);
  });
});

/**
 * Make fetch answer every Jev call with these answers.
 *
 * @param answers - The answers object of the response
 */
function stubAnswers(answers: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "m",
          answers,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      ),
    ),
  );
}
