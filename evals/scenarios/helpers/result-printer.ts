// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formatted output for individual eval results
 */

import { formatSubsectionHeader } from "#evals/chat/shared/formatting.ts";
import { type EvalScenarioResult, type LlmJudgeAssertion } from "../types.ts";
import { computeCorrectnessScore } from "./correctness-score.ts";
import { type JudgeResult } from "./judge-response-parser.ts";

/**
 * Print result for a single scenario run
 *
 * @param result - The scenario result
 * @param modelKey - The model identifier (provider or provider/model)
 * @param configId - Config profile ID used for this run
 */
export function printResult(
  result: EvalScenarioResult,
  modelKey: string,
  configId: string,
): void {
  const status = result.passed ? "PASSED" : "FAILED";

  // Get scores
  const correctness = computeCorrectnessScore(result.assertions);
  const llmJudgeResult = result.assertions.find(
    (a) => a.assertion.type === "llm_judge",
  );
  const llmDetails = llmJudgeResult?.details as JudgeResult | undefined;
  const llmAssertion = llmJudgeResult?.assertion as
    | LlmJudgeAssertion
    | undefined;
  const llmMinScore = llmAssertion?.minScore ?? 3;

  const configLabel = configId === "default" ? "" : ` [${configId}]`;

  console.log(`\n${formatSubsectionHeader("SUMMARY")}`);
  console.log(`${modelKey}: ${result.scenario.id}${configLabel}\n`);
  console.log(`Duration: ${result.totalDurationMs}ms`);
  console.log(`Result: ${status}`);

  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  // Print dimension table
  printDimensionTable(correctness, llmDetails, llmMinScore);
}

/**
 * Print the dimension score table
 *
 * @param correctness - Correctness score from deterministic checks
 * @param llmDetails - LLM judge result with dimension scores
 * @param minScore - Minimum score threshold
 */
function printDimensionTable(
  correctness: number,
  llmDetails: JudgeResult | undefined,
  minScore: number,
): void {
  console.log(`\n┌───────────────┬───────┐`);
  console.log(`│ Dimension     │ Score │`);
  console.log(`├───────────────┼───────┤`);
  console.log(`│ Correctness   │ ${correctness.toFixed(2).padStart(5)} │`);

  const scores = [correctness];

  if (llmDetails) {
    console.log(
      `│ Accuracy      │ ${llmDetails.accuracy.score.toFixed(2).padStart(5)} │`,
    );
    console.log(
      `│ Reasoning     │ ${llmDetails.reasoning.score.toFixed(2).padStart(5)} │`,
    );
    console.log(
      `│ Efficiency    │ ${llmDetails.efficiency.score.toFixed(2).padStart(5)} │`,
    );
    console.log(
      `│ Naturalness   │ ${llmDetails.naturalness.score.toFixed(2).padStart(5)} │`,
    );
    scores.push(
      llmDetails.accuracy.score,
      llmDetails.reasoning.score,
      llmDetails.efficiency.score,
      llmDetails.naturalness.score,
    );
  }

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;

  console.log(`├───────────────┼───────┤`);
  console.log(`│ Average       │ ${average.toFixed(2).padStart(5)} │`);
  console.log(`└───────────────┴───────┘`);

  if (llmDetails) {
    console.log(`\nMin score: ${minScore}`);
  }
}
