// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface ToolsIndicatorProps {
  enabledToolsCount: number;
  totalToolsCount: number;
}

const textColor = "text-zinc-500 dark:text-zinc-400";

/**
 * Responsive tools count indicator.
 * Shows wrench emoji + full text at lg+, wrench with optional count below lg.
 * @param props - Component props
 * @param props.enabledToolsCount - Number of enabled tools
 * @param props.totalToolsCount - Total number of available tools
 * @returns Tools indicator element
 */
export function ToolsIndicator({
  enabledToolsCount,
  totalToolsCount,
}: ToolsIndicatorProps) {
  const allEnabled = enabledToolsCount === totalToolsCount;
  const titleText = `${enabledToolsCount}/${totalToolsCount} tools enabled`;

  // When all enabled, hide below lg (no need for icon-only wrench).
  // When subset, always show wrench with count.
  const visibility = allEnabled ? "hidden lg:inline" : "";

  return (
    <span className={`text-xs ${textColor} ${visibility}`} title={titleText}>
      🔧
      {/* Full text at lg+ */}
      <span className="hidden lg:inline">
        {" "}
        {enabledToolsCount}/{totalToolsCount} tools
      </span>
      {/* Compact count at sm–lg, only when subset enabled */}
      {!allEnabled && (
        <span className="hidden sm:inline lg:hidden"> {enabledToolsCount}</span>
      )}
    </span>
  );
}
