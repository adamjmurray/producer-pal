// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TokenUsage } from "#webui/chat/sdk/types";
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
