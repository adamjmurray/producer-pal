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
 * Hidden below sm. Shows wrench + count at sm. Full text at md+.
 * @param props - Component props
 * @param props.enabledToolsCount - Number of enabled tools
 * @param props.totalToolsCount - Total number of available tools
 * @returns Tools indicator element
 */
export function ToolsIndicator({
  enabledToolsCount,
  totalToolsCount,
}: ToolsIndicatorProps) {
  const titleText = `${enabledToolsCount}/${totalToolsCount} tools enabled`;

  return (
    <span className={`text-xs ${textColor} hidden sm:inline`} title={titleText}>
      🔧
      {/* Full text at md+ */}
      <span className="hidden md:inline">
        {" "}
        {enabledToolsCount}/{totalToolsCount} tools
      </span>
      {/* Compact count at sm only */}
      <span className="md:hidden"> {enabledToolsCount}</span>
    </span>
  );
}
