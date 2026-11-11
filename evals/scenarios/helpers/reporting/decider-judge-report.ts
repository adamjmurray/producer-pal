// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Console text for `--jev` runs: the per-result note on who decided the judge
 * verdict, and the end-of-run the decider totals.
 */

import {
  type JsonEvalResult,
  type JsonDeciderAnswer,
  type JsonDeciderJudgment,
  type JudgeDecidedBy,
} from "../json-results/types.ts";

/**
 * One line on who decided a judge verdict and how sure the decider was.
 *
 * @param judge - The judge record or the live judge details
 * @returns The note, or undefined when the decider was not asked
 */
export function deciderJudgeNote(judge: {
  decidedBy?: JudgeDecidedBy;
  decider?: JsonDeciderJudgment;
}): string | undefined {
  const { decider } = judge;

  if (decider == null) {
    return undefined;
  }

  if (decider.verdict === "error") {
    return `The decider escalated to the LLM judge: ${decider.escalationReason}`;
  }

  const outcome = `outcome: ${decider.outcome.level}, lowest answer ${decider.minProbability.toFixed(2)}`;

  return decider.verdict === "escalate"
    ? `The decider escalated to the LLM judge: ${decider.escalationReason} (${outcome})`
    : `The decider decided: ${decider.verdict} (${outcome})`;
}

/**
 * Short tag for the RESULT block's judge line.
 *
 * @param judge - The judge record
 * @returns Who decided, or undefined when the decider was not asked
 */
export function deciderJudgeTag(judge: {
  decidedBy?: JudgeDecidedBy;
  decider?: JsonDeciderJudgment;
}): string | undefined {
  const { decider } = judge;

  if (decider == null) {
    return undefined;
  }

  return judge.decidedBy === "decider" && decider.verdict !== "error"
    ? `decider, ${decider.outcome.level}`
    : "LLM judge, after the decider escalated";
}

/**
 * Total the decider judge calls in a run: how many the decider decided, how many went to
 * the LLM judge and why, and what the calls cost.
 *
 * @param results - Every result in the run
 * @returns Report lines; empty when the run did not use the decider
 */
export function deciderSummaryLines(results: JsonEvalResult[]): string[] {
  const calls = results.flatMap((r) =>
    r.judge?.decider == null
      ? []
      : [{ decider: r.judge.decider, by: r.judge.decidedBy }],
  );

  if (calls.length === 0) {
    return [];
  }

  const decided = calls.filter((c) => c.by === "decider");
  const passed = decided.filter((c) => c.decider.verdict === "pass").length;
  const failed = decided.length - passed;
  const errors = calls.filter((c) => c.decider.verdict === "error").length;
  const byClaims = calls.filter(
    (c) =>
      c.decider.verdict === "escalate" && c.decider.escalatedBy === "claims",
  ).length;
  const unsure = calls.length - decided.length - errors - byClaims;
  const answers = calls.flatMap((c) =>
    c.decider.verdict === "error" ? [] : [c.decider],
  );

  return [
    `The decider judge: ${calls.length} call(s); decided ${decided.length} (${passed} pass, ${failed} fail); escalated ${calls.length - decided.length} to the LLM judge (${unsure} unsure, ${byClaims} by the claims check, ${errors} error)`,
    tokenLine(answers),
  ];
}

/**
 * Sum the decider's token use and cost.
 *
 * @param answers - The decider calls that were answered
 * @returns One line
 */
function tokenLine(answers: JsonDeciderAnswer[]): string {
  const sum = (pick: (a: JsonDeciderAnswer) => number): number =>
    answers.reduce((total, a) => total + pick(a), 0);
  const priced = answers.filter((a) => a.cost != null);
  const partial =
    priced.length < answers.length
      ? ` (${priced.length} of ${answers.length} calls report it)`
      : "";
  const cost =
    priced.length > 0
      ? `; cost $${sum((a) => a.cost ?? 0).toFixed(4)}${partial}`
      : "";

  return `The decider tokens: ${sum((a) => a.inputTokens)} in, ${sum((a) => a.outputTokens)} out${cost}`;
}
