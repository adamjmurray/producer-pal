// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface ToolsIndicatorProps {
  enabledToolsCount: number;
  totalToolsCount: number;
}

// CSS filter to shift emoji color toward amber/yellow.
// grayscale removes native color, then sepia + saturate + hue-rotate
// targets approximately amber-500 (#f59e0b).
const amberFilter =
  "grayscale(100%) sepia(100%) saturate(300%) hue-rotate(0deg) brightness(1.1)";

/**
 * Responsive tools count indicator.
 * Shows wrench emoji + full text at lg+, wrench with optional count below lg.
 * When all tools are enabled, wrench is normal. When subset, turns amber via CSS filter.
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

  const textColor = allEnabled
    ? "text-gray-500 dark:text-gray-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <span className={`text-xs ${textColor}`} title={titleText}>
      <span style={allEnabled ? undefined : { filter: amberFilter }}>🔧</span>

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
