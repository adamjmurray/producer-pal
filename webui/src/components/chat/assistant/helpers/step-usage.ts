// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type StepTiming, type TokenUsage } from "#webui/chat/sdk/types";
import { calcNewContentTokens } from "#webui/lib/utils/compact-number";

/**
 * Calculate new content tokens for a step-usage part using the prev usages map.
 * @param partIndex - The original index of the step-usage part
 * @param usage - The usage data for this step
 * @param stepPrevUsages - Map from part index to previous step's usage
 * @returns New content token count, or null
 */
export function calcStepNewContent(
  partIndex: number,
  usage: TokenUsage,
  stepPrevUsages: Map<number, TokenUsage>,
): number | null {
  const prev = stepPrevUsages.get(partIndex);

  return calcNewContentTokens(
    usage.inputTokens ?? 0,
    prev?.inputTokens,
    prev?.outputTokens,
  );
}

/**
 * Format the generation-speed tail of a usage label.
 * @param timing - Step timing, or undefined when nothing was measurable
 * @returns Something like " · 42 tok/s · 1.2s to first token", or ""
 */
export function formatStepTiming(timing: StepTiming | undefined): string {
  const parts: string[] = [];

  if (timing?.outputTokensPerSecond != null) {
    parts.push(`${Math.round(timing.outputTokensPerSecond)} tok/s`);
  }

  if (timing?.timeToFirstTokenMs != null) {
    parts.push(`${formatDuration(timing.timeToFirstTokenMs)} to first token`);
  }

  return parts.map((part) => ` · ${part}`).join("");
}

/**
 * Format a millisecond duration for a usage label.
 * @param ms - Duration in milliseconds
 * @returns Whole milliseconds under a second, else seconds to one decimal
 */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
