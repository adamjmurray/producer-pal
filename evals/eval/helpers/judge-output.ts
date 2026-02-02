/**
 * Streaming output utilities for LLM judge
 */

import { formatSubsectionHeader } from "#evals/chat/shared/formatting.ts";
import type { JudgeResult } from "./judge-response-parser.ts";
import { isQuietMode } from "./output-config.ts";

/**
 * Print judge info (model, criteria)
 *
 * @param provider - LLM provider name
 * @param model - Model being used
 * @param criteria - Evaluation criteria
 */
export function printJudgeHeader(
  provider: string,
  model: string,
  criteria: string,
): void {
  console.log(`\n${formatSubsectionHeader("LLM Judgement")}`);
  console.log(`\nModel: ${provider}/${model}`);

  if (isQuietMode()) return;

  console.log(`Criteria: ${criteria}\n`);
  process.stdout.write(`Response: `);
}

/**
 * Print streaming text chunk to stdout
 *
 * @param text - Text chunk to print
 */
export function printJudgeChunk(text: string): void {
  if (isQuietMode()) return;

  process.stdout.write(text);
}

/**
 * Finish judge output with newline
 */
export function finishJudgeOutput(): void {
  if (isQuietMode()) return;

  console.log("\n");
}

/**
 * Print the overall score after parsing
 *
 * @param result - The parsed judge result with dimension scores
 */
export function printJudgeResult(result: JudgeResult): void {
  if (isQuietMode()) return;

  console.log(`\nOverall: ${result.overall.toFixed(2)}/5`);
}
