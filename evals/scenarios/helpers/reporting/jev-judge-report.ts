// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Console text for `--jev` runs: the per-result note on who decided the judge
 * verdict, and the end-of-run Jev totals.
 */

import {
  type JsonEvalResult,
  type JsonJevAnswer,
  type JsonJevJudgment,
  type JudgeDecider,
} from "../json-results/types.ts";

/**
 * One line on who decided a judge verdict and how sure Jev was.
 *
 * @param judge - The judge record or the live judge details
 * @returns The note, or undefined when Jev was not asked
 */
export function jevJudgeNote(judge: {
  decidedBy?: JudgeDecider;
  jev?: JsonJevJudgment;
}): string | undefined {
  const { jev } = judge;

  if (jev == null) {
    return undefined;
  }

  if (jev.verdict === "error") {
    return `Jev escalated to the LLM judge: ${jev.escalationReason}`;
  }

  const outcome = `outcome: ${jev.outcome.level}, lowest answer ${jev.minProbability.toFixed(2)}`;

  return jev.verdict === "escalate"
    ? `Jev escalated to the LLM judge: ${jev.escalationReason} (${outcome})`
    : `Jev decided: ${jev.verdict} (${outcome})`;
}

/**
 * Short tag for the RESULT block's judge line.
 *
 * @param judge - The judge record
 * @returns Who decided, or undefined when Jev was not asked
 */
export function jevJudgeTag(judge: {
  decidedBy?: JudgeDecider;
  jev?: JsonJevJudgment;
}): string | undefined {
  const { jev } = judge;

  if (jev == null) {
    return undefined;
  }

  return judge.decidedBy === "jev" && jev.verdict !== "error"
    ? `Jev, ${jev.outcome.level}`
    : "LLM judge, after Jev escalated";
}

/**
 * Total the Jev judge calls in a run: how many Jev decided, how many went to
 * the LLM judge and why, and what the calls cost.
 *
 * @param results - Every result in the run
 * @returns Report lines; empty when the run did not use Jev
 */
export function jevSummaryLines(results: JsonEvalResult[]): string[] {
  const calls = results.flatMap((r) =>
    r.judge?.jev == null ? [] : [{ jev: r.judge.jev, by: r.judge.decidedBy }],
  );

  if (calls.length === 0) {
    return [];
  }

  const decided = calls.filter((c) => c.by === "jev");
  const passed = decided.filter((c) => c.jev.verdict === "pass").length;
  const failed = decided.length - passed;
  const errors = calls.filter((c) => c.jev.verdict === "error").length;
  const unsure = calls.length - decided.length - errors;
  const answers = calls.flatMap((c) =>
    c.jev.verdict === "error" ? [] : [c.jev],
  );

  return [
    `Jev judge: ${calls.length} call(s); decided ${decided.length} (${passed} pass, ${failed} fail); escalated ${calls.length - decided.length} to the LLM judge (${unsure} unsure, ${errors} error)`,
    tokenLine(answers),
  ];
}

/**
 * Sum Jev's token use and cost.
 *
 * @param answers - The Jev calls that were answered
 * @returns One line
 */
function tokenLine(answers: JsonJevAnswer[]): string {
  const sum = (pick: (a: JsonJevAnswer) => number): number =>
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

  return `Jev tokens: ${sum((a) => a.inputTokens)} in, ${sum((a) => a.outputTokens)} out${cost}`;
}
