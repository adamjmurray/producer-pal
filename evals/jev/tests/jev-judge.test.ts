// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildQuestions,
  decideVerdict,
  FAIL_THRESHOLD,
  jevJudge,
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
});

describe("buildQuestions", () => {
  it("makes one question per item, with shared context, plus the whole", () => {
    const q = buildQuestions(
      "Judge the reply:\n1. Says X.\n2. Says Y.\n\nBe kind.",
    );

    expect(q.map((x) => x.id)).toStrictEqual(["req1", "req2", "whole"]);
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

    expect(q.map((x) => x.id)).toStrictEqual(["req1", "whole"]);
    expect(q[0]?.instructions).toContain("It must reply politely.");
    expect(q[1]?.instructions).toContain("It must reply politely.");
  });

  it("has no hallucination question", () => {
    const q = buildQuestions("1. A.\n2. B.");

    expect(q.some((x) => x.id === "extra")).toBe(false);
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
          },
          usage: { input_tokens: 100, output_tokens: 5 },
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
    ]);
    expect(sent.questions.req1?.type).toBe("noul");
    expect(result.verdict).toBe("escalate");
    expect(result.minProbability).toBe(0.4);
    expect(result.inputTokens).toBe(100);
    expect(result.questions.map((q) => q.probability)).toStrictEqual([
      0.9, 0.4, 0.95,
    ]);
  });

  it("throws when an answer is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "m",
            answers: {},
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        ),
      ),
    );

    await expect(
      jevJudge({ turns: [], checks: [] }, "Be good.", { apiKey: "k" }),
    ).rejects.toThrow(/no yes\/no answer/);
  });
});
