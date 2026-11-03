// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Builds the saved judge record from the llm_judge assertion result.
 */

import { type JevFirstDetails } from "../judge/jev-first-judge.ts";
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
    | (LlmJudgeDetails & Partial<JevFirstDetails>)
    | undefined;

  if (!details) {
    return { pass: false, issues: [judgeResult.message], ...advisoryFlag };
  }

  // Jev decided: it has no provider or model of its own in the details
  const jevModel =
    details.decidedBy === "jev" && details.jev?.verdict !== "error"
      ? details.jev?.model
      : undefined;

  return {
    pass: details.pass,
    issues: details.issues,
    ...advisoryFlag,
    ...(details.decidedBy === "jev"
      ? { provider: "jev", ...(jevModel != null && { model: jevModel }) }
      : {
          ...(details.provider != null && { provider: details.provider }),
          ...(details.model != null && { model: details.model }),
        }),
    ...(details.decidedBy != null && { decidedBy: details.decidedBy }),
    ...(details.jev != null && { jev: details.jev }),
    ...(details.llm != null && { llm: details.llm }),
  };
}
