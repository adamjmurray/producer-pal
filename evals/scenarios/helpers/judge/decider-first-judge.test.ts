// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  FAIL_THRESHOLD,
  PASS_THRESHOLD,
  type DeciderJudgeResult,
} from "#evals/decider/decider-judge.ts";
import {
  assertWithDeciderFirst,
  type DeciderFirstDeps,
  type DeciderFirstDetails,
} from "./decider-first-judge.ts";
import { type EvalTurnResult, type LlmJudgeAssertion } from "../../types.ts";
import {
  type CheckSummary,
  type LlmJudgeDetails,
  type LlmJudgeOverride,
} from "../../assertions/llm-judge.ts";

const assertion: LlmJudgeAssertion = { type: "llm_judge", prompt: "Do it" };
const turns = [
  { userMessage: "hi", assistantResponse: "ok", toolCalls: [] },
] as unknown as EvalTurnResult[];
const checks: CheckSummary[] = [{ pass: true, label: "c", message: "m" }];

/**
 * A decider answer whose lowest question decides the verdict.
 *
 * @param min - The lowest P(yes)
 * @param verdict - The verdict that probability gives
 * @param cost - Reported cost, if any
 * @returns A decider judge result
 */
function answer(
  min: number,
  verdict: DeciderJudgeResult["verdict"],
  cost?: number,
): DeciderJudgeResult {
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
    model: "decider-2026",
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
 * Run the assertion with fake decider and LLM judges.
 *
 * @param decider - The fake decider call
 * @param override - CLI judge override
 * @returns The result and both fakes
 */
async function run(
  decider: NonNullable<DeciderFirstDeps["decider"]>,
  override?: LlmJudgeOverride,
) {
  const llm = vi.fn<NonNullable<DeciderFirstDeps["llm"]>>(async () => ({
    assertion,
    earned: 0,
    maxScore: 0,
    message: "LLM judge: fail (1 issue(s))",
    details: llmDetails,
  }));
  const result = await assertWithDeciderFirst(
    assertion,
    turns,
    "google",
    override,
    checks,
    { route: "openrouter", model: "jev-x" },
    { decider, llm },
  );

  return { result, llm, details: result.details as DeciderFirstDetails };
}

describe("assertWithDeciderFirst", () => {
  it("passes on the decider's pass without calling the LLM judge", async () => {
    const decider = vi.fn(async () => answer(PASS_THRESHOLD, "pass", 0.002));
    const { result, llm, details } = await run(decider);

    expect(llm).not.toHaveBeenCalled();
    expect(decider).toHaveBeenCalledWith({ turns, checks }, "Do it", {
      route: "openrouter",
      model: "jev-x",
    });
    expect(result.message).toBe("The decider judge: pass");
    expect(result.maxScore).toBe(0);
    expect(details).toStrictEqual(
      expect.objectContaining({ pass: true, issues: [], decidedBy: "decider" }),
    );
    expect(details.llm).toBeUndefined();
    expect(details.decider).toStrictEqual({
      route: "openrouter",
      verdict: "pass",
      model: "decider-2026",
      minProbability: PASS_THRESHOLD,
      questions: expect.any(Array),
      outcome: { score: 1.2, level: "mostly failed", confidence: 0.7 },
      inputTokens: 100,
      outputTokens: 5,
      cost: 0.002,
      truncated: false,
    });
    expect(details.decider).not.toHaveProperty("escalationReason");
  });

  it("fails on the decider's fail, naming the unmet requirements", async () => {
    const { result, llm, details } = await run(async () =>
      answer(FAIL_THRESHOLD - 0.1, "fail"),
    );

    expect(llm).not.toHaveBeenCalled();
    expect(result.message).toBe("The decider judge: fail (2 unmet)");
    expect(details.pass).toBe(false);
    expect(details.issues).toStrictEqual([
      `The decider: not met (P=0.20): ${"x".repeat(200)}...`,
      "The decider: not met (P=0.20): the criteria as a whole",
    ]);
    expect(details.decider).not.toHaveProperty("cost");
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
      "The decider: not met (P=0.10): replies claim actions the tool calls do not show",
    );
  });

  it("records the per-question probabilities without the question text", async () => {
    const { details } = await run(async () => answer(0.9, "pass"));

    expect(details.decider).toStrictEqual(
      expect.objectContaining({
        questions: [
          { id: "req1", kind: "requirement", probability: 0.99 },
          { id: "req2", kind: "requirement", probability: 0.9 },
          { id: "whole", kind: "whole", probability: 0.9 },
        ],
      }),
    );
    expect(JSON.stringify(details.decider)).not.toContain("Did A");
  });

  it("asks the LLM judge when the decider escalates, and records both", async () => {
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
      decider: expect.objectContaining({
        verdict: "escalate",
        escalationReason: "lowest answer 0.50 (req2) is between 0.3 and 0.85",
      }),
    });
    expect(result.message).toBe(
      "The decider escalated (lowest answer 0.50 (req2) is between 0.3 and 0.85); LLM judge: fail (1 issue(s))",
    );
  });

  it("hands an escalation the CLI judge override, thinking included", async () => {
    const override: LlmJudgeOverride = {
      provider: "codex-code",
      model: "luna",
      thinking: "high",
    };
    const { llm } = await run(async () => answer(0.5, "escalate"), override);

    expect(llm.mock.calls[0]?.[3]).toStrictEqual(override);
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

    expect(details.decider).toStrictEqual(
      expect.objectContaining({
        verdict: "escalate",
        escalatedBy: "claims",
        escalationReason: "claims answer 0.50 is below 0.7",
      }),
    );
  });

  it("does not record escalatedBy for an ordinary escalation", async () => {
    const { details } = await run(async () => answer(0.5, "escalate"));

    expect(details.decider).not.toHaveProperty("escalatedBy");
  });

  it("escalates with a reason when the decider call fails", async () => {
    const { result, llm, details } = await run(async () => {
      throw new Error("Decider API error 500: down");
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(details.decidedBy).toBe("llm");
    expect(details.decider).toStrictEqual({
      route: "openrouter",
      verdict: "error",
      escalationReason: "decider call failed: Decider API error 500: down",
    });
    expect(result.message).toContain(
      "The decider escalated (decider call failed",
    );
  });

  it("omits provider and model from the LLM record when it gave none", async () => {
    const llm = vi.fn<NonNullable<DeciderFirstDeps["llm"]>>(async () => ({
      assertion,
      earned: 0,
      maxScore: 0,
      message: "LLM judge: pass",
      details: { pass: true, issues: [] },
    }));
    const result = await assertWithDeciderFirst(
      assertion,
      turns,
      "google",
      undefined,
      undefined,
      { route: "typesafe" },
      {
        decider: vi.fn(async () => {
          throw new Error("x");
        }),
        llm,
      },
    );

    expect((result.details as DeciderFirstDetails).llm).toStrictEqual({
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
