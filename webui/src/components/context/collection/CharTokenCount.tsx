// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { estimateTokensFromChars } from "#webui/utils/token-estimate";

interface CharTokenCountProps {
  /** The character count to display and size. */
  chars: number;
  /** Extra classes (e.g. `shrink-0`) merged onto the readout. */
  className?: string;
  /**
   * Optional prefix clarifying what the count is for (e.g. "Built-in") when the
   * readout would otherwise be ambiguous — such as the built-in-only view,
   * where the count reflects the displayed default rather than an override.
   */
  label?: string;
}

/**
 * A compact size readout — exact character count plus an approximate token count
 * — shared by the skills preview and the context-document editors so they read
 * identically. The token figure is a rough estimate (see token-estimate.ts),
 * flagged in the tooltip.
 * @param props - Readout props
 * @returns Readout element
 */
export function CharTokenCount(props: CharTokenCountProps): preact.JSX.Element {
  const { chars, className, label } = props;

  return (
    <span
      title="Token count is a rough estimate (~4 chars/token); actual usage varies by model."
      className={`text-xs text-zinc-500 dark:text-zinc-400 tabular-nums${
        className ? ` ${className}` : ""
      }`}
    >
      {label != null && `${label}: `}
      {chars.toLocaleString()} chars · ≈
      {estimateTokensFromChars(chars).toLocaleString()} tokens
    </span>
  );
}
