// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type StepTiming, type TokenUsage } from "#webui/chat/sdk/types";
import { compactNumber } from "#webui/lib/utils/compact-number";
import { formatStepTiming } from "./helpers/step-usage";

interface StepUsageLabelProps {
  usage: TokenUsage;
  newContentTokens: number | null;
  timing?: StepTiming;
  /** Spacing classes; defaults to tucking under the step above. */
  className?: string;
}

/**
 * Compact usage label shown between tool call steps and follow-up text.
 * @param props - Component props
 * @param props.usage - Token usage for this step
 * @param props.newContentTokens - New content tokens (null if not calculable)
 * @param props.timing - Generation speed for this step, when measurable
 * @param props.className - Spacing classes
 * @returns Label element
 */
export function StepUsageLabel({
  usage,
  newContentTokens,
  timing,
  className = "-mt-1",
}: StepUsageLabelProps) {
  return (
    <div
      className={`${className} text-right text-xs text-zinc-400 dark:text-zinc-500`}
    >
      tokens: {compactNumber(usage.inputTokens ?? 0)}
      {newContentTokens != null && ` (${compactNumber(newContentTokens)} new)`}
      {(usage.cacheReadTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.cacheReadTokens ?? 0)} cached)`}{" "}
      → {compactNumber(usage.outputTokens ?? 0)}
      {(usage.reasoningTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`}
      {formatStepTiming(timing)}
    </div>
  );
}
