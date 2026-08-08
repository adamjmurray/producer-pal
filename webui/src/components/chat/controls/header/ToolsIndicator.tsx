// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface ToolsIndicatorProps {
  enabledToolsCount: number;
  totalToolsCount: number;
  defaultToolsCount: number;
  diverges?: boolean;
}

const neutralColor = "text-zinc-500 dark:text-zinc-400";
const amberColor = "text-amber-600 dark:text-amber-400";

/**
 * Responsive tools count indicator.
 * Hidden below sm. Shows wrench + count at sm. Full text at md+.
 * The count is the conversation's PINNED toolset, so it goes amber (like the
 * model and small-model indicators) when the current setting has moved past it.
 * @param props - Component props
 * @param props.enabledToolsCount - Number of enabled tools
 * @param props.totalToolsCount - Total number of available tools
 * @param props.defaultToolsCount - Number the current setting would enable
 * @param props.diverges - Whether the pinned toolset differs from the setting
 * @returns Tools indicator element
 */
export function ToolsIndicator({
  enabledToolsCount,
  totalToolsCount,
  defaultToolsCount,
  diverges,
}: ToolsIndicatorProps) {
  const titleText = diverges
    ? `Locked: ${enabledToolsCount}/${totalToolsCount} tools enabled (default is now ${defaultToolsCount}/${totalToolsCount})`
    : `${enabledToolsCount}/${totalToolsCount} tools enabled`;
  const textColor = diverges ? amberColor : neutralColor;

  return (
    <span className={`text-xs ${textColor} hidden sm:inline`} title={titleText}>
      🔧{/* Full text at md+ */}
      <span className="hidden md:inline">
        {" "}
        {enabledToolsCount}/{totalToolsCount} tools
      </span>
      {/* Compact count at sm only */}
      <span className="md:hidden"> {enabledToolsCount}</span>
    </span>
  );
}
