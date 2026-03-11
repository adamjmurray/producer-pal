// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface SmallModelIndicatorProps {
  active: boolean;
  diverges?: boolean;
}

const neutralColor = "text-zinc-500 dark:text-zinc-400";
const amberColor = "text-amber-600 dark:text-amber-400";

/**
 * Responsive model size indicator.
 * Shows small model (turtle) or large model (elephant) with full text at sm+.
 * Amber when locked value differs from current defaults, neutral otherwise.
 * @param props - Component props
 * @param props.active - Whether small model mode is active for this conversation
 * @param props.diverges - Whether the value differs from the current default setting
 * @returns Indicator element
 */
export function SmallModelIndicator({
  active,
  diverges,
}: SmallModelIndicatorProps) {
  const emoji = active ? "🐢" : "🐘";
  const label = active ? "small model" : "large model";
  const color = diverges ? amberColor : neutralColor;

  return (
    <span className={`text-xs leading-none ${color}`}>
      <span className="hidden sm:inline" aria-label={label}>
        {emoji} {label}
      </span>

      <span className="sm:hidden" aria-label={label}>
        {emoji}
      </span>
    </span>
  );
}
