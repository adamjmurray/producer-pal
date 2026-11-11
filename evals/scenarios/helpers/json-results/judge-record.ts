// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Builds the saved judge record from the llm_judge assertion result.
 */

import { type DeciderFirstDetails } from "../judge/decider-first-judge.ts";
import { type LlmJudgeDetails } from "../../assertions/llm-judge.ts";
import { type EvalAssertionResult } from "../../types.ts";
import { type JsonJudge } from "./types.ts";

/**
 * Build judge object from llm_judge assertion
 *
 * @param assertions - All assertion results
 * @param advisory - When true, mark the judge non-gating (see derivePassFail)
 * @returns Judge object, or undefined if no judge assertion
 */
export function buildJudge(
  assertions: EvalAssertionResult[],
  advisory: boolean,
): JsonJudge | undefined {
  const judgeResult = assertions.find((a) => a.assertion.type === "llm_judge");

  if (!judgeResult) {
    return undefined;
  }

  const advisoryFlag = advisory ? { advisory: true } : {};
  const details = judgeResult.details as
    | (LlmJudgeDetails & Partial<DeciderFirstDetails>)
    | undefined;

  if (!details) {
    return { pass: false, issues: [judgeResult.message], ...advisoryFlag };
  }

  // The decider decided: it has no provider or model of its own in the details
  const deciderModel =
    details.decidedBy === "decider" && details.decider?.verdict !== "error"
      ? details.decider?.model
      : undefined;

  return {
    pass: details.pass,
    issues: details.issues,
    ...advisoryFlag,
    ...(details.decidedBy === "decider"
      ? {
          provider: "decider",
          ...(deciderModel != null && { model: deciderModel }),
        }
      : {
          ...(details.provider != null && { provider: details.provider }),
          ...(details.model != null && { model: details.model }),
        }),
    ...(details.decidedBy != null && { decidedBy: details.decidedBy }),
    ...(details.decider != null && { decider: details.decider }),
    ...(details.llm != null && { llm: details.llm }),
  };
}
