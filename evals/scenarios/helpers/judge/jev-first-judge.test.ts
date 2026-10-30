// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  FAIL_THRESHOLD,
  PASS_THRESHOLD,
  type JevJudgeResult,
} from "#evals/jev/jev-judge.ts";
import {
  assertWithJevFirst,
  type JevFirstDeps,
  type JevFirstDetails,
} from "./jev-first-judge.ts";
import { type EvalTurnResult, type LlmJudgeAssertion } from "../../types.ts";
import {
  type CheckSummary,
  type LlmJudgeDetails,
} from "../../assertions/llm-judge.ts";

const assertion: LlmJudgeAssertion = { type: "llm_judge", prompt: "Do it" };
const turns = [
  { userMessage: "hi", assistantResponse: "ok", toolCalls: [] },
] as unknown as EvalTurnResult[];
const checks: CheckSummary[] = [{ pass: true, label: "c", message: "m" }];

/**
 * A Jev answer whose lowest question decides the verdict.
 *
 * @param min - The lowest P(yes)
 * @param verdict - The verdict that probability gives
 * @param cost - Reported cost, if any
 * @returns A Jev judge result
 */
function answer(
  min: number,
  verdict: JevJudgeResult["verdict"],
  cost?: number,
): JevJudgeResult {
  return {
    verdict,
    minProbability: min,
    questions: [
      { id: "req1", kind: "requirement", text: "Did A", probability: 0.99 },
      {
        id: "req2",
        kind: "requirement",
        text: "x".repeat(300),
        probability: min,
      },
      { id: "whole", kind: "whole", text: "all", probability: min },
    ],
    outcome: { score: 1.2, confidence: 0.7, label: "mostly failed" },
    model: "jev-2026",
    inputTokens: 100,
    outputTokens: 5,
    cost,
    truncated: false,
  };
}

const llmDetails: LlmJudgeDetails = {
  pass: false,
  issues: ["bad"],
  provider: "google",
  model: "gemini-x",
};

/**
 * Run the assertion with fake Jev and LLM judges.
 *
 * @param jev - The fake Jev call
 * @returns The result and both fakes
 */
async function run(jev: NonNullable<JevFirstDeps["jev"]>) {
  const llm = vi.fn<NonNullable<JevFirstDeps["llm"]>>(async () => ({
    assertion,
    earned: 0,
    maxScore: 0,
    message: "LLM judge: fail (1 issue(s))",
    details: llmDetails,
  }));
  const result = await assertWithJevFirst(
    assertion,
    turns,
    "google",
    undefined,
    checks,
    { route: "openrouter", model: "jev-x" },
    { jev, llm },
  );

  return { result, llm, details: result.details as JevFirstDetails };
}

describe("assertWithJevFirst", () => {
  it("passes on Jev's pass without calling the LLM judge", async () => {
    const jev = vi.fn(async () => answer(PASS_THRESHOLD, "pass", 0.002));
    const { result, llm, details } = await run(jev);

    expect(llm).not.toHaveBeenCalled();
    expect(jev).toHaveBeenCalledWith({ turns, checks }, "Do it", {
      route: "openrouter",
      model: "jev-x",
    });
    expect(result.message).toBe("Jev judge: pass");
    expect(result.maxScore).toBe(0);
    expect(details).toStrictEqual(
      expect.objectContaining({ pass: true, issues: [], decidedBy: "jev" }),
    );
    expect(details.llm).toBeUndefined();
    expect(details.jev).toStrictEqual({
      route: "openrouter",
      verdict: "pass",
      model: "jev-2026",
      minProbability: PASS_THRESHOLD,
      questions: expect.any(Array),
      outcome: { score: 1.2, level: "mostly failed", confidence: 0.7 },
      inputTokens: 100,
      outputTokens: 5,
      cost: 0.002,
      truncated: false,
    });
    expect(details.jev).not.toHaveProperty("escalationReason");
  });

  it("fails on Jev's fail, naming the unmet requirements", async () => {
    const { result, llm, details } = await run(async () =>
      answer(FAIL_THRESHOLD - 0.1, "fail"),
    );

    expect(llm).not.toHaveBeenCalled();
    expect(result.message).toBe("Jev judge: fail (2 unmet)");
    expect(details.pass).toBe(false);
    expect(details.issues).toStrictEqual([
      `Jev: not met (P=0.20): ${"x".repeat(200)}...`,
      "Jev: not met (P=0.20): the criteria as a whole",
    ]);
    expect(details.jev).not.toHaveProperty("cost");
  });

  it("names a low claims answer plainly when it is among the unmet", async () => {
    const { details } = await run(async () => {
      const base = answer(FAIL_THRESHOLD - 0.1, "fail");

      return {
        ...base,
        questions: [
          ...base.questions,
          { id: "claims", kind: "claims", text: "C", probability: 0.1 },
        ],
      };
    });

    expect(details.issues).toContain(
      "Jev: not met (P=0.10): replies claim actions the tool calls do not show",
    );
  });

  it("records the per-question probabilities without the question text", async () => {
    const { details } = await run(async () => answer(0.9, "pass"));

    expect(details.jev).toStrictEqual(
      expect.objectContaining({
        questions: [
          { id: "req1", kind: "requirement", probability: 0.99 },
          { id: "req2", kind: "requirement", probability: 0.9 },
          { id: "whole", kind: "whole", probability: 0.9 },
        ],
      }),
    );
    expect(JSON.stringify(details.jev)).not.toContain("Did A");
  });

  it("asks the LLM judge when Jev escalates, and records both", async () => {
    const { result, llm, details } = await run(async () =>
      answer(0.5, "escalate"),
    );

    expect(llm).toHaveBeenCalledWith(
      assertion,
      turns,
      "google",
      undefined,
      checks,
    );
    expect(details).toStrictEqual({
      pass: false,
      issues: ["bad"],
      provider: "google",
      model: "gemini-x",
      decidedBy: "llm",
      llm: llmDetails,
      jev: expect.objectContaining({
        verdict: "escalate",
        escalationReason: "lowest answer 0.50 (req2) is between 0.3 and 0.85",
      }),
    });
    expect(result.message).toBe(
      "Jev escalated (lowest answer 0.50 (req2) is between 0.3 and 0.85); LLM judge: fail (1 issue(s))",
    );
  });

  it("records that the claims check alone caused an escalation", async () => {
    const { details } = await run(async () => {
      const base = answer(0.95, "escalate");

      return {
        ...base,
        escalatedBy: "claims" as const,
        questions: [
          ...base.questions,
          {
            id: "claims",
            kind: "claims" as const,
            text: "C",
            probability: 0.5,
          },
        ],
      };
    });

    expect(details.jev).toStrictEqual(
      expect.objectContaining({
        verdict: "escalate",
        escalatedBy: "claims",
        escalationReason: "claims answer 0.50 is below 0.7",
      }),
    );
  });

  it("does not record escalatedBy for an ordinary escalation", async () => {
    const { details } = await run(async () => answer(0.5, "escalate"));

    expect(details.jev).not.toHaveProperty("escalatedBy");
  });

  it("escalates with a reason when the Jev call fails", async () => {
    const { result, llm, details } = await run(async () => {
      throw new Error("Jev API error 500: down");
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(details.decidedBy).toBe("llm");
    expect(details.jev).toStrictEqual({
      route: "openrouter",
      verdict: "error",
      escalationReason: "Jev call failed: Jev API error 500: down",
    });
    expect(result.message).toContain("Jev escalated (Jev call failed");
  });

  it("omits provider and model from the LLM record when it gave none", async () => {
    const llm = vi.fn<NonNullable<JevFirstDeps["llm"]>>(async () => ({
      assertion,
      earned: 0,
      maxScore: 0,
      message: "LLM judge: pass",
      details: { pass: true, issues: [] },
    }));
    const result = await assertWithJevFirst(
      assertion,
      turns,
      "google",
      undefined,
      undefined,
      { route: "typesafe" },
      {
        jev: vi.fn(async () => {
          throw new Error("x");
        }),
        llm,
      },
    );

    expect((result.details as JevFirstDetails).llm).toStrictEqual({
      pass: true,
      issues: [],
    });
    expect(llm).toHaveBeenCalledWith(
      assertion,
      turns,
      "google",
      undefined,
      undefined,
    );
  });
});
