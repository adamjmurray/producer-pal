// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type StepTiming, type TokenUsage } from "#webui/chat/sdk/types";

/** Context use (percent) that turns the label amber. */
export const CONTEXT_WARN_PERCENT = 70;

/** Context use (percent) that turns it red and points at compaction. */
export const CONTEXT_FULL_PERCENT = 90;

/**
 * How full the local model's context window was at the end of a step: its
 * input plus what it wrote, since both fill the window.
 * @param usage - The step's usage
 * @returns Whole percent, or undefined when the window size is unknown
 */
export function contextPercent(usage: TokenUsage): number | undefined {
  const { inputTokens, outputTokens, contextLength } = usage;

  return contextLength != null && inputTokens != null
    ? Math.round(((inputTokens + (outputTokens ?? 0)) / contextLength) * 100)
    : undefined;
}

/**
 * Whether a local server likely cut the history to fit: the input stayed flat
 * or shrank between steps, though the conversation only grows. Only compares
 * steps whose window size is known, so cloud models never warn, and steps of
 * one model: another model counts the same history differently.
 * @param usage - The step's usage
 * @param prev - The step before it, if any (none across a compaction)
 * @returns True when the history was probably cut
 */
export function looksTruncated(
  usage: TokenUsage,
  prev: TokenUsage | undefined,
): boolean {
  return (
    usage.contextLength != null &&
    prev?.contextLength != null &&
    usage.contextModel === prev.contextModel &&
    usage.inputTokens != null &&
    prev.inputTokens != null &&
    usage.inputTokens <= prev.inputTokens
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
