// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TokenUsage } from "#webui/chat/sdk/types";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number";

interface StepUsageLabelProps {
  usage: TokenUsage;
  newContentTokens: number | null;
}

/**
 * Compact usage label shown between tool call steps and follow-up text.
 * @param props - Component props
 * @param props.usage - Token usage for this step
 * @param props.newContentTokens - New content tokens (null if not calculable)
 * @returns Label element
 */
export function StepUsageLabel({
  usage,
  newContentTokens,
}: StepUsageLabelProps) {
  return (
    <div className="text-xs text-zinc-400 dark:text-zinc-500 text-right -mt-1">
      tokens: {compactNumber(usage.inputTokens ?? 0)}
      {newContentTokens != null &&
        ` (${compactNumber(newContentTokens)} new)`}{" "}
      → {compactNumber(usage.outputTokens ?? 0)}
      {(usage.reasoningTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`}
    </div>
  );
}

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
