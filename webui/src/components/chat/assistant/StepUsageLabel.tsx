// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type StepTiming, type TokenUsage } from "#webui/chat/sdk/types";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number";
import {
  CONTEXT_FULL_PERCENT,
  CONTEXT_WARN_PERCENT,
  contextPercent,
  formatStepTiming,
  looksTruncated,
} from "./helpers/step-usage";

interface StepUsageLabelProps {
  usage: TokenUsage;
  /** The step before this one, if any */
  prevUsage?: TokenUsage;
  timing?: StepTiming;
  /** Spacing classes; defaults to tucking under the step above. */
  className?: string;
}

const WARN_CLASS = "text-amber-600 dark:text-amber-400";
const FULL_CLASS = "text-red-600 dark:text-red-400";

/**
 * Compact usage label shown between tool call steps and follow-up text. With a
 * local model it also shows how full the context window is.
 * @param props - Component props
 * @param props.usage - Token usage for this step
 * @param props.prevUsage - The step before this one, if any
 * @param props.timing - Generation speed for this step, when measurable
 * @param props.className - Spacing classes
 * @returns Label element
 */
export function StepUsageLabel({
  usage,
  prevUsage,
  timing,
  className = "-mt-1",
}: StepUsageLabelProps) {
  const cached = usage.cacheReadTokens ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  const newContentTokens = calcNewContentTokens(
    usage.inputTokens ?? 0,
    prevUsage?.inputTokens,
    prevUsage?.outputTokens,
  );
  const percent = contextPercent(usage);
  const truncated = looksTruncated(usage, prevUsage);
  const full = percent != null && percent >= CONTEXT_FULL_PERCENT;

  return (
    <div
      className={`${className} text-right text-xs text-zinc-400 dark:text-zinc-500`}
    >
      tokens: {compactNumber(usage.inputTokens ?? 0)}
      {newContentTokens != null && ` (${compactNumber(newContentTokens)} new)`}
      {cached > 0 && ` (${compactNumber(cached)} cached)`} →{" "}
      {compactNumber(usage.outputTokens ?? 0)}
      {reasoning > 0 && ` (${compactNumber(reasoning)} reasoning)`}
      {formatStepTiming(timing)}
      {percent != null && (
        <>
          {" · "}
          <span className={contextClass(percent)}>context: {percent}%</span>
        </>
      )}
      {(truncated || full) && (
        <div className={FULL_CLASS}>
          {truncated
            ? "The model may have dropped earlier messages to fit its context."
            : "The model's context is almost full."}{" "}
          Compact the conversation (🗜) to free space.
        </div>
      )}
    </div>
  );
}

/**
 * Colour for the context percentage.
 * @param percent - Context use
 * @returns Tailwind classes, or undefined to keep the label's grey
 */
function contextClass(percent: number): string | undefined {
  if (percent >= CONTEXT_FULL_PERCENT) {
    return FULL_CLASS;
  }

  return percent >= CONTEXT_WARN_PERCENT ? WARN_CLASS : undefined;
}
