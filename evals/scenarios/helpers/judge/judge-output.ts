// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Streaming output utilities for LLM judge
 */

import { styleText } from "node:util";
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
  if (isQuietMode()) return;

  console.log(styleText("gray", `\n  Judging with ${provider}/${model}...`));
  console.log(styleText("gray", `  Criteria: ${criteria}`));
  process.stdout.write(styleText("gray", "  Response: "));
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
