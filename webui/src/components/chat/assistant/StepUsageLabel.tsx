// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TokenUsage } from "#webui/chat/sdk/types";
import { compactNumber } from "#webui/lib/utils/compact-number";

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
    <div className="-mt-1 text-right text-xs text-zinc-400 dark:text-zinc-500">
      tokens: {compactNumber(usage.inputTokens ?? 0)}
      {newContentTokens != null && ` (${compactNumber(newContentTokens)} new)`}
      {(usage.cacheReadTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.cacheReadTokens ?? 0)} cached)`}{" "}
      → {compactNumber(usage.outputTokens ?? 0)}
      {(usage.reasoningTokens ?? 0) > 0 &&
        ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`}
    </div>
  );
}
