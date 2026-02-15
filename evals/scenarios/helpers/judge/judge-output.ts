// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Streaming output utilities for LLM judge
 */

import { formatSubsectionHeader } from "#evals/chat/shared/formatting.ts";
import type { JudgeResult } from "../judge-response-parser.ts";
import { isQuietMode } from "../output-config.ts";

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
 * Print the overall score after parsing (no-op, scores shown in dimension table)
 *
 * @param _result - The parsed judge result (unused)
 */
export function printJudgeResult(_result: JudgeResult): void {
  // Scores are now shown in the dimension table in the summary
}
